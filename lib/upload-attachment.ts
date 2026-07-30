import { supabase } from './supabase'
import { toPublicUrl } from './storage-url'

/**
 * Chat attachment uploads.
 *
 * These used to POST the file to /api/inbox/upload. That route is a serverless
 * function with a ~4.5MB request body cap, and a photo straight off a phone is
 * routinely 3–12MB, so the upload came back as a PLAIN TEXT 413 ("Request
 * Entity Too Large"). Calling res.json() on that produced the baffling
 * "Unexpected token 'R'" error rather than anything about file size.
 *
 * Two changes fix it properly:
 *   1. Photos are downscaled and re-encoded in the browser first — a 12MB
 *      camera shot becomes a few hundred KB with no visible loss at the sizes
 *      anyone views a delivery photo.
 *   2. The upload goes STRAIGHT to Supabase Storage from the browser, so it
 *      never passes through a serverless function and the body cap doesn't
 *      apply at all.
 */

const BUCKET = 'chat-attachments'

/** Longest edge, in pixels, for an uploaded photo. */
const MAX_EDGE = 2000
const JPEG_QUALITY = 0.82
const THUMB_EDGE = 480
const THUMB_QUALITY = 0.72
// Adaptive compression target: quality steps down until the encoded file is
// under this size (or hits the quality floor). ~450KB keeps full photos crisp
// while cutting typical 4–8MB phone shots by ~90%.
const TARGET_BYTES = 450 * 1024
const MIN_QUALITY = 0.5

/**
 * Upload a file straight to R2 via a presigned PUT URL (browser → R2), skipping
 * the serverless function. Used for large/video files. Returns the public URL,
 * or null if presigning isn't available (caller then falls back to the server).
 */
export async function uploadDirect(file: File | Blob, prefix: string, filename?: string): Promise<string | null> {
  try {
    const name = filename || (file as File).name || 'file'
    const contentType = (file as File).type || 'application/octet-stream'
    const res = await fetch('/api/storage/presign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, filename: name, contentType }),
    })
    const d = await res.json().catch(() => ({}))
    if (!d.ok || !d.uploadUrl) return null
    const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!put.ok) return null
    return d.publicUrl as string
  } catch {
    return null
  }
}

export interface UploadedAttachment {
  url: string
  /** Small preview used in the chat timeline; full `url` is used in the gallery. */
  thumbUrl?: string
  name: string
  type: string
  kind: string
  size: number
}

const kindOf = (type: string) => {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  return 'file'
}

/**
 * Downscale a photo in the browser. Returns the original untouched if it's
 * already small, isn't an image, or if anything goes wrong — a slightly large
 * upload is much better than a failed one.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // HEIC can't be decoded by canvas in most browsers; leave it alone.
  if (/heic|heif/i.test(file.type)) return file
  if (file.size < 200 * 1024) return file // already tiny — not worth it

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)

    // Adaptive quality: start high (preserve quality) and step down only until
    // the file is under the target size. Simple images stay near-lossless; large
    // photos compress hard — the way compressjpeg-style tools behave.
    const encode = (q: number): Promise<Blob | null> =>
      new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', q))
    let quality = 0.85
    let blob = await encode(quality)
    while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality = Math.round((quality - 0.08) * 100) / 100
      blob = await encode(quality)
    }
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

/**
 * Build a small preview of a photo for the chat timeline.
 *
 * The timeline renders images at roughly 120–250px, so loading the full 2000px
 * upload for each one is what makes a thread with photos feel slow. A ~480px
 * thumbnail is a fraction of the bytes and is indistinguishable at that size;
 * the full image is still used in the gallery viewer.
 */
export async function makeThumbnail(file: File): Promise<File | null> {
  if (!file.type.startsWith('image/')) return null
  if (/heic|heif/i.test(file.type)) return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height))
    // Already tiny — the full image is a fine preview.
    if (scale === 1 && file.size < 120 * 1024) return null
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', THUMB_QUALITY))
    if (!blob) return null
    return new File([blob], 'thumb.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch { return null }
}

/**
 * Upload one file and return its public URL.
 * @param onProgress reports 0–1 for the compression/upload phases.
 */
export async function uploadAttachment(
  file: File,
  opts: { companyId: string; conversationId?: string; onProgress?: (p: number) => void }
): Promise<UploadedAttachment> {
  const { companyId, conversationId, onProgress } = opts

  onProgress?.(0.05)
  const prepared = await compressImage(file)
  onProgress?.(0.35)

  const prefix = `chat-attachments/${companyId}/${conversationId || 'general'}`

  // Upload via the server, which stores on Cloudflare R2 (falling back to
  // Supabase). Keeps the R2 secret server-side; the compressed bytes go up once.
  const putViaServer = async (f: File, pfx: string): Promise<string> => {
    const fd = new FormData()
    fd.append('file', f)
    fd.append('prefix', pfx)
    const res = await fetch('/api/storage/put', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed')
    return data.url as string
  }

  // Big files (videos especially) can't go through the serverless function
  // (~4.5MB cap). Upload those straight to R2 with a presigned URL; small
  // compressed images keep the simple server path.
  const isLarge = prepared.type.startsWith('video/') || prepared.size > 4 * 1024 * 1024
  const url = isLarge
    ? (await uploadDirect(prepared, prefix)) || (await putViaServer(prepared, prefix))
    : await putViaServer(prepared, prefix)
  onProgress?.(0.9)

  // Upload a preview next to it. Best-effort: if it fails the timeline just
  // uses the full image, exactly as before.
  let thumbUrl: string | undefined
  try {
    const thumb = await makeThumbnail(prepared)
    if (thumb) thumbUrl = await putViaServer(thumb, `${prefix}/thumbs`)
  } catch { /* preview is optional */ }

  onProgress?.(1)

  return {
    url,
    thumbUrl,
    name: file.name,
    type: prepared.type || file.type,
    kind: kindOf(prepared.type || file.type),
    size: prepared.size,
  }
}

/**
 * Read a response safely.
 *
 * A serverless 413 or a gateway error returns HTML or plain text, so calling
 * .json() on it throws "Unexpected token '<'" or "Unexpected token 'R'" and
 * hides the real problem. This returns a usable message either way.
 */
export async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      return { error: 'That file is too large to send. Try a smaller photo.' }
    }
    if (res.status === 504 || /timeout/i.test(text)) {
      return { error: 'The upload timed out. Check your connection and try again.' }
    }
    return { error: `Upload failed (${res.status}). ${text.slice(0, 120)}` }
  }
}
