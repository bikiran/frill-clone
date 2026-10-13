// Small thumbnails for gallery photos.
//
// An uploaded photo used its full-size original as its thumbnail, so the Media
// page downloaded every multi-megabyte original just to draw a tile. This
// makes a ~480px WebP (a few tens of KB), stores it next to the media, and
// points thumbnail_url at it. New uploads get one straight away; older photos
// are filled in a few at a time by the transcode worker.
//
// Only files on our own storage (R2 media domain or Supabase storage) are ever
// fetched — never an arbitrary URL someone saved on an item.

import sharp from 'sharp'
import { uploadToR2, r2Configured, isR2PublicUrl } from './r2'

export const THUMB_WIDTH = 480
const MAX_BYTES = 40 * 1024 * 1024
const THUMB_MARK = '/thumbs/'

const supabaseStorageUrl = (url: string) => {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  return !!base && url.startsWith(`${base}/storage/v1/object/public/`)
}
const ownStorage = (url: string | null | undefined) => !!url && (isR2PublicUrl(url) || supabaseStorageUrl(url))

/** A photo that still uses its original (or nothing) as its thumbnail. */
export function needsThumb(item: any): boolean {
  return item?.kind === 'image' && !!item.url && !String(item.thumbnail_url || '').includes(THUMB_MARK) && !item.transcode_error
}

async function store(db: any, key: string, bytes: Buffer): Promise<string> {
  if (r2Configured()) return uploadToR2(`media-gallery/${key}`, bytes, 'image/webp')
  const { error } = await db.storage.from('media-gallery').upload(key, bytes, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  return db.storage.from('media-gallery').getPublicUrl(key).data.publicUrl
}

/**
 * Make and save a thumbnail for one photo. Returns the new thumbnail URL, or
 * null when there was nothing to do. A photo that can't be read is marked
 * (transcode_error) so it isn't retried forever; its original keeps working.
 */
export async function makeImageThumb(db: any, item: any): Promise<string | null> {
  if (!needsThumb(item)) return null
  const fail = async (why: string) => {
    await db.from('media_items').update({ transcode_error: `thumb: ${why}`.slice(0, 300) }).eq('id', item.id)
    return null
  }
  if (!ownStorage(item.url)) return fail('not on Colvy storage')
  let input: Buffer
  try {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return fail(`download ${res.status}`)
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return fail('original too large')
    input = Buffer.from(await res.arrayBuffer())
  } catch { return null }   // network blip: try again next run
  let out: Buffer
  try {
    out = await sharp(input, { failOn: 'none', limitInputPixels: 120_000_000, animated: false })
      .rotate()   // respect the phone's orientation flag
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer()
  } catch (e: any) { return fail(String(e?.message || 'unreadable image')) }
  if (out.length >= input.length) return fail('original is already small')
  const url = await store(db, `${item.company_id}/thumbs/${item.id}-${THUMB_WIDTH}.webp`, out)
  // Only replace what we started from (someone may have changed it meanwhile).
  let q = db.from('media_items').update({ thumbnail_url: url }).eq('id', item.id)
  q = item.thumbnail_url ? q.eq('thumbnail_url', item.thumbnail_url) : q.is('thumbnail_url', null)
  await q
  return url
}

/** Fill in thumbnails for a few older photos (cron backfill). */
export async function backfillImageThumbs(db: any, limit = 20, budgetMs = 60_000): Promise<number> {
  const t0 = Date.now()
  const { data } = await db.from('media_items')
    .select('id, company_id, kind, url, thumbnail_url, transcode_error')
    .eq('kind', 'image').is('transcode_error', null)
    .or(`thumbnail_url.is.null,thumbnail_url.not.like.*${THUMB_MARK}*`)
    .order('created_at', { ascending: false })
    .limit(limit)
  let made = 0
  for (const item of data || []) {
    if (Date.now() - t0 > budgetMs) break
    try { if (await makeImageThumb(db, item)) made++ } catch { /* next run */ }
  }
  return made
}
