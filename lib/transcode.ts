import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
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
const ffmpegPath = (ffmpegStatic as unknown as string) || 'ffmpeg'

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

    await db.from('media_items').update({
      playback_url: playbackUrl,
      thumbnail_url: thumbUrl,
      source_url: item.source_url || item.url,
      processing_status: 'ready',
      transcode_error: null,
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
