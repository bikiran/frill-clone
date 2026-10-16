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
import { createHash } from 'node:crypto'
import { after } from 'next/server'
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

// ── Thumbnails for inbound message photos ───────────────────────────────────
// Customer photos (MMS, Messenger/Instagram, live-chat uploads, upload links,
// email) arrived as full-size phone originals with no thumbnail, so every
// inbox tile made the browser decode a ~12-megapixel bitmap — the main reason
// an admin tab left open all day passed a gigabyte. Each inbound photo now gets
// the same ~480px WebP the gallery uses, saved on the attachment as `thumbUrl`
// (the shape the inbox already reads).
//
// Strictly best-effort: it runs after the message is stored (and, inside a
// request, after the response — see scheduleMessageThumbs), never throws, caps
// sizes and time, and skips anything that isn't a still photo. A photo without
// a thumbnail still shows: the inbox falls back to a resized or original copy.

const MSG_THUMB_MAX_BYTES = 25 * 1024 * 1024
const MSG_THUMB_MAX_PER_MESSAGE = 10
const MSG_THUMB_BUDGET_MS = 25_000

/** A still photo (not SVG/GIF) on an attachment that has no thumbnail yet. */
export function isThumbableImage(a: any): boolean {
  if (!a || typeof a !== 'object' || a.thumbUrl || typeof a.url !== 'string' || !/^https:\/\//i.test(a.url)) return false
  const type = String(a.type || a.mime || '').toLowerCase()
  const isImage = a.kind === 'image' || type.startsWith('image/')
  if (!isImage) return false
  if (/svg|gif/.test(type) || /\.(svg|gif)(\?|$)/i.test(a.url)) return false
  return true
}

/** Resize image bytes to the thumbnail WebP, or null when it can't or needn't be. */
export async function thumbFromBytes(input: Buffer | Uint8Array, timeoutMs = 8_000): Promise<Buffer | null> {
  if (!input?.length || input.length > MSG_THUMB_MAX_BYTES) return null
  const job = sharp(Buffer.from(input), { failOn: 'none', limitInputPixels: 120_000_000, animated: false })
    .rotate()
    .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const out = await Promise.race([job, new Promise<null>(res => { timer = setTimeout(() => res(null), timeoutMs) })])
    if (!out || out.length >= input.length) return null
    return out
  } catch { return null } finally { if (timer) clearTimeout(timer) }
}

/** Store a chat thumbnail next to chat attachments; returns its public URL. */
export async function storeChatThumb(db: any, key: string, bytes: Buffer): Promise<string> {
  if (r2Configured()) return uploadToR2(`chat-attachments/${key}`, bytes, 'image/webp')
  const { error } = await db.storage.from('chat-attachments').upload(key, bytes, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  return db.storage.from('chat-attachments').getPublicUrl(key).data.publicUrl
}

const isIpLiteral = (host: string) => /^\[?[0-9a-f:.]+\]?$/i.test(host) && /[.:]/.test(host)

/** May the server fetch this attachment URL? Our own storage always; a signed
 *  provider payload's https URL (Telnyx, Meta) when the caller says so. */
function mayFetch(url: string, trusted: boolean): boolean {
  if (ownStorage(url)) return true
  if (!trusted) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password) return false
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || isIpLiteral(h)) return false
    return true
  } catch { return false }
}

/** Make and store a thumbnail for one inbound attachment; null if skipped. */
export async function makeAttachmentThumb(db: any, companyId: string, att: any, opts: { trusted?: boolean } = {}): Promise<string | null> {
  try {
    if (!isThumbableImage(att) || !mayFetch(att.url, !!opts.trusted)) return null
    const res = await fetch(att.url, { signal: AbortSignal.timeout(15_000), redirect: opts.trusted ? 'follow' : 'error' })
    if (!res.ok) return null
    const ct = String(res.headers.get('content-type') || '').toLowerCase()
    if (ct && (!ct.startsWith('image/') || /svg|gif/.test(ct))) { try { await res.body?.cancel() } catch {} ; return null }
    if (Number(res.headers.get('content-length') || 0) > MSG_THUMB_MAX_BYTES) { try { await res.body?.cancel() } catch {} ; return null }
    const input = Buffer.from(await res.arrayBuffer())
    const out = await thumbFromBytes(input)
    if (!out) return null
    const id = createHash('sha1').update(att.url).digest('hex').slice(0, 24)
    return await storeChatThumb(db, `${companyId}/thumbs/${id}-${THUMB_WIDTH}.webp`, out)
  } catch { return null }
}

/**
 * Add `thumbUrl` to a stored message's photo attachments. Re-reads the row
 * just before writing and only fills attachments that still lack one, so it
 * never overwrites a change made meanwhile (e.g. a video converted to MP4).
 */
export async function addMessageThumbs(db: any, messageId: string, opts: { trusted?: boolean } = {}): Promise<number> {
  const t0 = Date.now()
  try {
    if (!messageId) return 0
    const { data: row } = await db.from('messages').select('id, company_id, attachments').eq('id', messageId).maybeSingle()
    const atts: any[] = Array.isArray(row?.attachments) ? row.attachments : []
    const todo = atts.filter(isThumbableImage).slice(0, MSG_THUMB_MAX_PER_MESSAGE)
    if (!row?.company_id || !todo.length) return 0
    const made = new Map<string, string>()
    for (const a of todo) {
      if (Date.now() - t0 > MSG_THUMB_BUDGET_MS) break
      if (made.has(a.url)) continue
      const thumb = await makeAttachmentThumb(db, row.company_id, a, opts)
      if (thumb) made.set(a.url, thumb)
    }
    if (!made.size) return 0
    const { data: fresh } = await db.from('messages').select('attachments').eq('id', messageId).maybeSingle()
    const cur: any[] = Array.isArray(fresh?.attachments) ? fresh.attachments : []
    let n = 0
    const next = cur.map(a => {
      const t = a && !a.thumbUrl ? made.get(a.url) : undefined
      if (!t) return a
      n++
      return { ...a, thumbUrl: t }
    })
    if (n) await db.from('messages').update({ attachments: next }).eq('id', messageId)
    return n
  } catch { return 0 }
}

/**
 * Queue addMessageThumbs to run after the current response (Next `after`), so
 * a webhook still answers straight away. Outside a request it just runs in the
 * background. Never throws.
 */
export function scheduleMessageThumbs(db: any, messageId: string | null | undefined, attachments: any[] | null | undefined, opts: { trusted?: boolean } = {}): void {
  try {
    if (!messageId || !Array.isArray(attachments) || !attachments.some(isThumbableImage)) return
    const job = () => addMessageThumbs(db, messageId, opts).then(() => {}, () => {})
    try { after(job) } catch { void job() }
  } catch {}
}
