# Video transcode worker (R2 + FFmpeg)

Turns gallery video uploads into web-ready, instantly-streaming MP4s. The phone
and the web upload the ORIGINAL straight to R2 and mark the item `pending`; this
worker produces an H.264/AAC MP4 with `+faststart` at ≤1080p plus a poster,
stores them in R2, and flips the row to `ready` with a `playback_url` that both
clients prefer. No Cloudflare Stream — plain R2.

## What was added

| File | Purpose |
|------|---------|
| `COLVY_V92_MEDIA_TRANSCODE.sql` | Adds `playback_url`, `processing_status`, `variants`, `source_url`, `transcode_attempts`, `transcode_error`, `transcode_started_at` to `media_items`; backfills existing rows to `ready`; adds the pending index; ensures realtime. |
| `lib/transcode.ts` | FFmpeg pipeline: download → 1080p H.264/AAC/+faststart + poster → upload to R2 → update row. Claim/retry/stale-reclaim logic. |
| `app/api/storage/transcode/route.ts` | `POST` enqueue (called by mobile). Marks pending and runs the job in an `after()` hook so the response is instant. |
| `app/api/cron/transcode-worker/route.ts` | `GET` backstop that drains pending/stale jobs. Wired in `vercel.json` every minute. |
| `app/api/media/upload/route.ts` | Web uploads now mark videos `pending` and enqueue transcoding too. |
| `lib/mediaPlayback.ts` + gallery UI | Web prefers `playback_url`; shows a "Processing video…" state while pending. |

## Deploy steps

1. **Run the migration** `COLVY_V92_MEDIA_TRANSCODE.sql` in Supabase.
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

## Later: 720p / HLS

Add renditions in `lib/transcode.ts` (write them into the `variants` column;
for HLS point `playback_url` at the `.m3u8`). Clients read only `playback_url`
+ `variants`, so no mobile/web release is needed.
