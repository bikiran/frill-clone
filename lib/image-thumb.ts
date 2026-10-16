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

import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { after } from 'next/server'
import { uploadToR2, r2Configured, isR2PublicUrl } from './r2'

export const THUMB_WIDTH = 480
const MAX_BYTES = 40 * 1024 * 1024
const THUMB_MARK = '/thumbs/'
// sharp is a large native module: load it only when a thumbnail is made, not
// in every route that imports this file.
const loadSharp = async () => (await import('sharp')).default

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
    const sharp = await loadSharp()
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
// Strictly best-effort and bounded: it runs after the response (Next `after`),
// never throws, processes one photo at a time within a per-message time budget,
// streams downloads with a hard byte cap, decodes with sharp's own timeout and
// a pixel limit, and skips anything that isn't a still photo. A photo without
// a thumbnail still shows: the inbox falls back to a resized or original copy.

const MSG_THUMB_MAX_BYTES = 25 * 1024 * 1024
const MSG_THUMB_MAX_PER_MESSAGE = 10
const MSG_THUMB_BUDGET_MS = 25_000
const MAX_REDIRECTS = 3
// JPEG decodes shrink-on-load, so a big phone photo stays cheap; other formats
// (PNG, WebP, HEIC…) decode in full, so they get a lower ceiling.
const JPEG_MAX_PIXELS = 100_000_000
const OTHER_MAX_PIXELS = 40_000_000

type ThumbField = 'attachments' | 'email_attachments'
export type ThumbOptions = {
  /** URLs came in a signature-verified provider payload (Telnyx, Meta). */
  trusted?: boolean
  /** Own-storage files must sit under one of these path fragments; defaults to
   *  the message's company folder (`/<companyId>/`). */
  prefixes?: string[]
  /** Which column holds the files (email keeps them in email_attachments). */
  field?: ThumbField
}

/** A URL without its query string or fragment (for checks and de-duplication). */
export function normaliseMediaUrl(url: string): string {
  return String(url || '').split(/[?#]/)[0]
}

/** A still photo (not SVG/GIF) on an attachment that has no thumbnail yet. */
export function isThumbableImage(a: any): boolean {
  if (!a || typeof a !== 'object' || a.thumbUrl || typeof a.url !== 'string' || !/^https:\/\//i.test(a.url)) return false
  const type = String(a.type || a.mime || '').toLowerCase()
  const isImage = a.kind === 'image' || type.startsWith('image/')
  if (!isImage) return false
  if (/svg|gif/.test(type) || /\.(svg|gif)$/i.test(normaliseMediaUrl(a.url))) return false
  return true
}

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

/** Resize image bytes to the thumbnail WebP, or null when it can't or needn't be. */
export async function thumbFromBytes(input: Buffer | Uint8Array, timeoutMs = 8_000): Promise<Buffer | null> {
  try {
    if (!input?.length || input.length > MSG_THUMB_MAX_BYTES) return null
    const seconds = Math.max(1, Math.min(30, Math.floor(timeoutMs / 1000)))
    const sharp = await loadSharp()
    const out = await sharp(Buffer.from(input), { failOn: 'none', animated: false, limitInputPixels: isJpeg(input) ? JPEG_MAX_PIXELS : OTHER_MAX_PIXELS })
      .rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .timeout({ seconds })   // sharp stops the decode itself, not just our wait
      .toBuffer()
    if (!out?.length || out.length >= input.length) return null
    return out
  } catch { return null }
}

/** Store a chat thumbnail next to chat attachments; returns its public URL. */
export async function storeChatThumb(db: any, key: string, bytes: Buffer): Promise<string> {
  if (r2Configured()) return uploadToR2(`chat-attachments/${key}`, bytes, 'image/webp')
  const { error } = await db.storage.from('chat-attachments').upload(key, bytes, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  return db.storage.from('chat-attachments').getPublicUrl(key).data.publicUrl
}

// Private, loopback, link-local, CGNAT and other non-public addresses.
export function isPrivateAddress(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const v4m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  const v4 = v4m ? v4m[1] : a
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [p, q] = v4.split('.').map(Number)
    return p === 0 || p === 10 || p === 127 || (p === 100 && q >= 64 && q <= 127) || (p === 169 && q === 254) ||
      (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 192 && q === 0) || (p === 198 && (q === 18 || q === 19)) || p >= 224
  }
  return a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') ||
    a.startsWith('fea') || a.startsWith('feb') || a.startsWith('ff') || a.startsWith('64:ff9b') || a.startsWith('2001:db8')
}

/** Is this own-storage URL a file in one of the allowed folders (no query)? */
function ownFileAllowed(url: string, prefixes: string[]): boolean {
  if (/[?#]/.test(url) || !ownStorage(url)) return false
  try {
    const path = decodeURIComponent(new URL(url).pathname)
    if (path.includes('..')) return false
    return prefixes.some(p => !!p && path.includes(p))
  } catch { return false }
}

/** Check one hop of a fetch: our own storage (in an allowed folder), or — for
 *  a signed provider payload — a public https host. */
async function hopAllowed(url: string, opts: { trusted: boolean; prefixes: string[] }): Promise<boolean> {
  if (ownFileAllowed(url, opts.prefixes)) return true
  if (!opts.trusted) return false
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false
  const h = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false   // IP literals
  try {
    const addrs = await lookup(h, { all: true, verbatim: true })
    if (!addrs.length || addrs.some(r => isPrivateAddress(r.address))) return false
  } catch { return false }
  return true
}

/** GET with every redirect re-checked (max 3) and a running byte cap. */
async function fetchCapped(url: string, opts: { trusted: boolean; prefixes: string[]; deadline: number }): Promise<Buffer | null> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > opts.deadline || !(await hopAllowed(current, opts))) return null
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(Math.max(1_000, Math.min(15_000, opts.deadline - Date.now()))) })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      try { await res.body?.cancel() } catch {}
      if (!loc) return null
      try { current = new URL(loc, current).toString() } catch { return null }
      continue
    }
    if (!res.ok || !res.body) { try { await res.body?.cancel() } catch {} ; return null }
    const ct = String(res.headers.get('content-type') || '').toLowerCase()
    if ((ct && (!ct.startsWith('image/') || /svg|gif/.test(ct))) || Number(res.headers.get('content-length') || 0) > MSG_THUMB_MAX_BYTES) {
      try { await res.body.cancel() } catch {}
      return null
    }
    // Count bytes as they arrive: a missing or false content-length can't
    // make us buffer more than the cap.
    const reader = (res.body as any).getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MSG_THUMB_MAX_BYTES || Date.now() > opts.deadline) { try { await reader.cancel() } catch {} ; return null }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c)))
  }
  return null
}

/** Make and store a thumbnail for one inbound attachment; null if skipped. */
export async function makeAttachmentThumb(db: any, companyId: string, att: any, opts: ThumbOptions & { deadline?: number } = {}): Promise<string | null> {
  try {
    if (!companyId || !isThumbableImage(att)) return null
    const deadline = opts.deadline ?? Date.now() + MSG_THUMB_BUDGET_MS
    const prefixes = opts.prefixes?.length ? opts.prefixes : [`/${companyId}/`]
    const input = await fetchCapped(att.url, { trusted: !!opts.trusted, prefixes, deadline })
    if (!input || Date.now() > deadline) return null
    const out = await thumbFromBytes(input, Math.min(8_000, deadline - Date.now()))
    if (!out) return null
    const id = createHash('sha1').update(normaliseMediaUrl(att.url)).digest('hex').slice(0, 24)
    return await storeChatThumb(db, `${companyId}/thumbs/${id}-${THUMB_WIDTH}.webp`, out)
  } catch { return null }
}

/**
 * Add `thumbUrl` to a stored message's photo attachments, one at a time, until
 * the per-message budget runs out. Re-reads the row just before writing and
 * only fills attachments that still lack one, so it never overwrites a change
 * made meanwhile (e.g. a video converted to MP4).
 */
export async function addMessageThumbs(db: any, messageId: string, opts: ThumbOptions = {}): Promise<number> {
  const deadline = Date.now() + MSG_THUMB_BUDGET_MS
  const field: ThumbField = opts.field === 'email_attachments' ? 'email_attachments' : 'attachments'
  try {
    if (!messageId) return 0
    const { data: row } = await db.from('messages').select(`id, company_id, ${field}`).eq('id', messageId).maybeSingle()
    const atts: any[] = Array.isArray(row?.[field]) ? row[field] : []
    if (!row?.company_id) return 0
    const made = new Map<string, string>()   // normalised URL → thumb
    const tried = new Set<string>()
    for (const a of atts) {
      if (Date.now() > deadline || tried.size >= MSG_THUMB_MAX_PER_MESSAGE) break
      if (!isThumbableImage(a)) continue
      const key = normaliseMediaUrl(a.url)
      if (tried.has(key)) continue
      tried.add(key)
      const thumb = await makeAttachmentThumb(db, row.company_id, a, { ...opts, deadline })
      if (thumb) made.set(key, thumb)
    }
    if (!made.size) return 0
    const { data: fresh } = await db.from('messages').select(field).eq('id', messageId).maybeSingle()
    const cur: any[] = Array.isArray(fresh?.[field]) ? fresh[field] : []
    let n = 0
    const next = cur.map(a => {
      const t = a && !a.thumbUrl && typeof a.url === 'string' ? made.get(normaliseMediaUrl(a.url)) : undefined
      if (!t) return a
      n++
      return { ...a, thumbUrl: t }
    })
    if (n) await db.from('messages').update({ [field]: next }).eq('id', messageId)
    return n
  } catch { return 0 }
}

/**
 * Queue addMessageThumbs to run after the current response (Next `after`), so
 * a webhook still answers straight away. Outside a request it just runs in the
 * background. Never throws.
 */
export function scheduleMessageThumbs(db: any, messageId: string | null | undefined, attachments: any[] | null | undefined, opts: ThumbOptions = {}): void {
  try {
    if (!messageId || !Array.isArray(attachments) || !attachments.some(isThumbableImage)) return
    const job = () => addMessageThumbs(db, messageId, opts).then(() => {}, () => {})
    try { after(job) } catch { void job() }
  } catch {}
}
