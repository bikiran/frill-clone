# Video transcode worker (R2 + FFmpeg)

Turns gallery video uploads into web-ready, instantly-streaming MP4s. The phone
and the web upload the ORIGINAL straight to R2 and mark the item `pending`; this
worker produces an H.264/AAC MP4 with `+faststart` at ≤1080p plus a poster,
stores them in R2, and flips the row to `ready` with a `playback_url` that both
clients prefer. No Cloudflare Stream — plain R2.

## What was added

| File | Purpose |
|------|---------|
| `COLVY_V252_MEDIA_TRANSCODE.sql` | Adds `playback_url`, `processing_status`, `variants`, `source_url`, `transcode_attempts`, `transcode_error`, `transcode_started_at` to `media_items`; backfills existing rows to `ready`; adds the pending index; ensures realtime. |
| `lib/transcode.ts` | FFmpeg pipeline: download → 1080p H.264/AAC/+faststart + poster → upload to R2 → update row. Claim/retry/stale-reclaim logic. |
| `app/api/storage/transcode/route.ts` | `POST` enqueue (called by mobile). Marks pending and runs the job in an `after()` hook so the response is instant. |
| `app/api/cron/transcode-worker/route.ts` | `GET` backstop that drains pending/stale jobs. Wired in `vercel.json` every minute. |
| `app/api/media/upload/route.ts` | Web uploads now mark videos `pending` and enqueue transcoding too. |
| `lib/mediaPlayback.ts` + gallery UI | Web prefers `playback_url`; shows a "Processing video…" state while pending. |

## Deploy steps

1. **Run the migration** `COLVY_V252_MEDIA_TRANSCODE.sql` in Supabase.
2. **`npm install`** — adds `ffmpeg-static` (ships a static FFmpeg binary).
3. **Env vars** (most already set):
   - `R2_ACCOUNT_ID` / `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_DOMAIN` — same R2 the uploads use. The worker fetches the source from its public URL, so `R2_PUBLIC_DOMAIN` must be publicly readable (it already serves gallery images).
   - `SUPABASE_SERVICE_ROLE_KEY` — worker writes rows past RLS.
   - `CRON_SECRET` *(optional)* — if set, Vercel sends it to the cron route as `Authorization: Bearer …`.
4. **Deploy.** `vercel.json` already registers the cron.

## Vercel notes (important)

- The transcode routes are **`runtime = 'nodejs'`, `maxDuration = 300`**. Enable
  **Fluid Compute** so the `after()` hook keeps running after the response and
  the function can use the full duration.
- `next.config.js` → `outputFileTracingIncludes` bundles the FFmpeg binary into
  both routes. `ffmpeg-static` is ~30 MB compressed; if a function exceeds the
  serverless size limit on your plan, move transcoding to a dedicated worker and
  keep everything else — only `lib/transcode.ts`'s call site changes.
- Very long/large videos may exceed 300 s and get killed → the row is reclaimed
  after 10 min and retried up to 3× → then marked `failed`, at which point both
  clients fall back to the **original** `url` (never a broken player).

## Flow

```
upload original → R2                (phone: presigned PUT; web: /api/media/upload)
POST /api/storage/transcode         → mark pending + after(processJobById)
  (or the minute cron picks it up)
processJobById → claim (pending→processing) → ffmpeg → R2 → row = ready + playback_url
realtime UPDATE → gallery swaps "Processing…" → playable, automatically
```

## Verify

1. Upload a video from the phone or web gallery.
2. Row shows `processing_status='pending'` then `'processing'` then `'ready'`
   with a `playback_url` under `processed/{company}/{id}/1080.mp4`.
3. The gallery shows "Processing…" briefly, then plays the faststart MP4.
4. Kill the cron / unset FFmpeg to confirm the 10-min grace + failure fallback
   still plays the original.

## Backfill existing videos

Videos uploaded before this pipeline were backfilled to `ready` = the raw
original, so they still play slowly. Re-queue them through the worker:

```
POST /api/admin/transcode-backfill        { }                 # all companies
POST /api/admin/transcode-backfill        { "companyId": "…" } # one board
Authorization: Bearer <super-admin token | CRON_SECRET>
```

It marks every video without a `playback_url` (and with an R2 source) `pending`;
the minute cron then drains a few at a time. Idempotent and SSRF-safe (only our
own R2 objects are queued).

## HLS (adaptive / instant on any network)

HLS generation is implemented and **off by default**. Set **`TRANSCODE_HLS=1`**
and the worker also segments the finished MP4 into VOD HLS (stream-copy — no
re-encode) and stores the master playlist in the row's `variants`
(`[{type:'mp4',url},{type:'hls',url}]`). The faststart **MP4 stays the
`playback_url`**, so nothing changes for existing clients.

- **Mobile** plays the HLS `variants` entry natively — enable the flag and it
  benefits with no app release.
- **Web** still uses the MP4 (already near-instant via `+faststart`). To make
  the web player use HLS, add `hls.js` (dynamic import) in `components/VideoPlayer.tsx`
  for non-Safari browsers and prefer the `hls` variant — the one remaining step,
  isolated to that component.

### Full ABR ladder (later)
The current HLS is a single 1080p rendition. For true adaptive bitrate, add
720p/480p re-encodes in `generateHls()` and write a master playlist referencing
all renditions — clients still read only `playback_url` + `variants`.
