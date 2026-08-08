import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import ffmpegStatic from 'ffmpeg-static'
import { uploadToR2, isR2PublicUrl } from './r2'

/**
 * Server-side video transcoding for the gallery.
 *
 * A phone (or the web) uploads the ORIGINAL video straight to R2 and records a
 * media_items row as `pending`. This turns that original into a web-friendly
 * H.264 / AAC / MP4 with the moov atom at the front (`+faststart`) capped at
 * 1080p — the thing that makes playback start instantly and stream while it
 * downloads — plus a poster frame, stores both back in R2, and flips the row to
 * `ready` with a `playback_url` that web + mobile prefer.
 *
 * Extra renditions (720p, HLS) can be added later by writing more outputs into
 * the `variants` column and, for HLS, pointing `playback_url` at the .m3u8 — no
 * client change needed.
 */

const MAX_ATTEMPTS = 3
const STALE_MS = 10 * 60 * 1000

// Resolve the ffmpeg-static binary robustly on Vercel. Next's bundler rewrites
// ffmpeg-static's __dirname to a build-time `/ROOT/...` path, so the value it
// exports points at a file that doesn't exist at runtime (the "spawn …/ffmpeg
// ENOENT" failure). The real, traced binary lives under the function's cwd —
// try the reported path, then cwd-relative rewrites, and use the first that
// actually exists on disk.
function resolveFfmpeg(): string {
  const raw = (ffmpegStatic as unknown as string) || ''
  const cwd = process.cwd()
  const candidates = [
    raw,
    raw.replace(/^\/ROOT/, cwd),
    raw.replace(/^.*?node_modules/, join(cwd, 'node_modules')),
    join(cwd, 'node_modules/ffmpeg-static/ffmpeg'),
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
  ].filter(Boolean)
  for (const c of candidates) { try { if (existsSync(c)) return c } catch {} }
  return raw || 'ffmpeg'
}
const ffmpegPath = resolveFfmpeg()

// HLS makes playback start almost instantly on mobile (ExoPlayer/AVPlayer fetch
// a tiny first segment instead of buffering the whole MP4). On by default now;
// set TRANSCODE_HLS=0 to skip it.
const HLS_ENABLED = process.env.TRANSCODE_HLS !== '0'

type Db = any
type Item = {
  id: string
  company_id: string
  url: string
  source_url?: string | null
  thumbnail_url?: string | null
  transcode_attempts?: number | null
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', d => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000) })
    proc.on('error', reject)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)))
  })
}

/** Download an R2 object (via its public URL) to a local temp file. */
async function download(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`source download failed (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
}

/**
 * Segment the finished MP4 into VOD HLS (stream-copy — no re-encode, so it's
 * cheap) and upload the playlist + .ts segments to R2 under `<keyBase>/hls/`.
 * The playlist references segments by relative name, which resolve against the
 * master URL. Returns the master .m3u8 URL, or null on failure (best-effort —
 * the MP4 is always the reliable primary). Enabled by TRANSCODE_HLS=1.
 */
async function generateHls(dir: string, mp4Path: string, keyBase: string): Promise<string | null> {
  const hlsDir = join(dir, 'hls')
  await mkdir(hlsDir, { recursive: true })
  await runFfmpeg([
    '-y', '-i', mp4Path, '-c', 'copy',
    '-start_number', '0', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(hlsDir, 'seg_%03d.ts'),
    '-f', 'hls', join(hlsDir, 'index.m3u8'),
  ])
  let masterUrl: string | null = null
  for (const f of await readdir(hlsDir)) {
    const ct = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t'
    const url = await uploadToR2(`${keyBase}/hls/${f}`, await readFile(join(hlsDir, f)), ct)
    if (f === 'index.m3u8') masterUrl = url
  }
  return masterUrl
}

/**
 * Transcode one claimed row end to end. Assumes the row is already marked
 * `processing`. Throws on failure so the caller can record the error/retry.
 */
export async function processTranscodeJob(db: Db, item: Item): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'colvy-tx-'))
  const inPath = join(dir, 'source')
  const outPath = join(dir, 'out.mp4')
  const posterPath = join(dir, 'poster.jpg')
  try {
    // The source must be one of our own R2 objects — never fetch an arbitrary
    // host (SSRF guard, in case a row was written with a foreign URL).
    const source = item.source_url || item.url
    if (!isR2PublicUrl(source)) throw new Error('refusing to transcode a non-R2 source')
    await download(source, inPath)

    // ≤1080p, even dimensions, H.264 High + AAC, faststart for instant start.
    await runFfmpeg([
      '-y', '-i', inPath,
      '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart',
      outPath,
    ])

    // Poster frame ~1s in (best-effort — a missing poster never fails the job).
    await runFfmpeg([
      '-y', '-ss', '1', '-i', inPath, '-frames:v', '1',
      '-vf', "scale='min(720,iw)':-2", posterPath,
    ]).catch(() => {})

    const base = `processed/${item.company_id}/${item.id}`
    const playbackUrl = await uploadToR2(`${base}/1080.mp4`, await readFile(outPath), 'video/mp4')

    let thumbUrl: string | null = item.thumbnail_url || null
    try { thumbUrl = await uploadToR2(`${base}/poster.jpg`, await readFile(posterPath), 'image/jpeg') } catch {}

    // Optional HLS rendition (off by default). The faststart MP4 above is the
    // primary playback_url; HLS is stored in `variants` for adaptive/streaming
    // clients (the mobile app plays it natively; web can opt in via hls.js).
    const variants: Array<{ type: string; url: string }> = [{ type: 'mp4', url: playbackUrl }]
    if (HLS_ENABLED) {
      try {
        const hlsUrl = await generateHls(dir, outPath, base)
        if (hlsUrl) variants.push({ type: 'hls', url: hlsUrl })
      } catch (e) { console.warn('[transcode] HLS generation failed (non-fatal):', e) }
    }

    await db.from('media_items').update({
      playback_url: playbackUrl,
      thumbnail_url: thumbUrl,
      source_url: item.source_url || item.url,
      processing_status: 'ready',
      transcode_error: null,
      variants,
    }).eq('id', item.id)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Record a failure — retry (back to pending) until attempts are exhausted. */
async function recordFailure(db: Db, item: Item, e: any) {
  const attempts = item.transcode_attempts || 1
  await db.from('media_items').update({
    processing_status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
    transcode_error: String(e?.message || e).slice(0, 500),
  }).eq('id', item.id)
}

/**
 * Claim a specific row (used by the after() hook right after a phone enqueues).
 * Only claims a video that still needs work, and increments the attempt counter
 * atomically so a concurrent worker can't grab the same one.
 */
export async function processJobById(db: Db, id: string): Promise<void> {
  const { data } = await db.from('media_items').select('*').eq('id', id).maybeSingle()
  if (!data || data.kind !== 'video' || data.playback_url) return
  // Claim only from 'pending' so the cron worker and this hook can't both grab
  // the same row — whoever flips pending→processing first wins.
  const { data: claimed } = await db.from('media_items')
    .update({ processing_status: 'processing', transcode_started_at: new Date().toISOString(), transcode_attempts: (data.transcode_attempts || 0) + 1 })
    .eq('id', id).eq('processing_status', 'pending')
    .select('*').maybeSingle()
  if (!claimed) return
  try { await processTranscodeJob(db, claimed) }
  catch (e) { await recordFailure(db, claimed, e) }
}

/**
 * Claim the oldest pending video (used by the cron worker). Reclaims rows stuck
 * in `processing` past the stale window first, so a crashed run self-heals.
 * Returns the claimed row or null when the queue is empty.
 */
export async function claimNextJob(db: Db): Promise<Item | null> {
  await db.from('media_items').update({ processing_status: 'pending' })
    .eq('kind', 'video').eq('processing_status', 'processing')
    .lt('transcode_started_at', new Date(Date.now() - STALE_MS).toISOString())

  const { data } = await db.from('media_items').select('*')
    .eq('kind', 'video').eq('processing_status', 'pending').lt('transcode_attempts', MAX_ATTEMPTS)
    .is('playback_url', null)
    .order('created_at', { ascending: true }).limit(1)
  const item = data?.[0]
  if (!item) return null

  const { data: claimed } = await db.from('media_items')
    .update({ processing_status: 'processing', transcode_started_at: new Date().toISOString(), transcode_attempts: (item.transcode_attempts || 0) + 1 })
    .eq('id', item.id).eq('processing_status', 'pending')
    .select('*').maybeSingle()
  return claimed || null
}

/**
 * One-off catch-up run FROM the cron (which is already CRON_SECRET-authed), so
 * existing videos get sped up without anyone calling the admin endpoint. Flips a
 * small batch of never-transcoded originals (no playback_url, not already queued
 * or permanently failed, R2 source) to `pending`; the drain below then picks
 * them up. Idempotent and self-limiting — once a video has a playback_url it's
 * skipped forever, so the backlog clears over a few minutes and then does
 * nothing. Returns how many it queued.
 */
export async function backfillLegacy(db: Db, limit = 8): Promise<number> {
  // Rescue rows that failed ONLY because the ffmpeg binary wasn't bundled
  // ("spawn … ENOENT"): that was an environmental bug, not a bad video, so give
  // them a clean slate. A genuinely un-transcodable video fails with a different
  // error and is left in `failed`, so this can't loop forever.
  await db.from('media_items')
    .update({ processing_status: 'pending', transcode_attempts: 0, transcode_error: null })
    .eq('kind', 'video').eq('processing_status', 'failed').is('playback_url', null)
    .like('transcode_error', '%ENOENT%')

  const { data } = await db.from('media_items')
    .select('id, url, source_url')
    .eq('kind', 'video').is('playback_url', null)
    .not('processing_status', 'in', '("pending","processing","failed")')
    .limit(limit)
  let queued = 0
  for (const r of data || []) {
    const src = r.source_url || r.url
    if (!isR2PublicUrl(src)) continue
    const { data: upd } = await db.from('media_items')
      .update({ processing_status: 'pending', source_url: src })
      .eq('id', r.id).is('playback_url', null)
      .select('id').maybeSingle()
    if (upd) queued++
  }
  return queued
}

/** Drain up to `max` jobs within a wall-clock budget (cron entrypoint). */
export async function drainQueue(db: Db, max = 4, budgetMs = 240_000) {
  const deadline = Date.now() + budgetMs
  const processed: Array<{ id: string; ok: boolean; error?: string }> = []
  for (let i = 0; i < max && Date.now() < deadline; i++) {
    const item = await claimNextJob(db)
    if (!item) break
    try { await processTranscodeJob(db, item); processed.push({ id: item.id, ok: true }) }
    catch (e: any) { await recordFailure(db, item, e); processed.push({ id: item.id, ok: false, error: String(e?.message || e) }) }
  }
  return processed
}
