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
  if (file.size < 600 * 1024) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
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

  const ext = (prepared.name.split('.').pop() || 'bin').toLowerCase()
  const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${companyId}/${conversationId || 'general'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared, {
    contentType: prepared.type || 'application/octet-stream',
    upsert: false,
    cacheControl: '3600',
  })

  if (error) {
    // Storage errors are readable, unlike the HTML a 413 produces.
    throw new Error(
      /bucket/i.test(error.message)
        ? 'The attachments storage bucket is missing — send one message with an attachment from the composer first, or create a "chat-attachments" bucket in Supabase.'
        : error.message
    )
  }
  onProgress?.(0.9)

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Upload a preview next to it. Best-effort: if it fails the timeline just
  // uses the full image, exactly as before.
  let thumbUrl: string | undefined
  try {
    const thumb = await makeThumbnail(prepared)
    if (thumb) {
      const thumbPath = path.replace(/\.[^.]+$/, '') + '_thumb.jpg'
      const { error: tErr } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
        contentType: 'image/jpeg', upsert: true,
        // Previews never change, so let browsers keep them for a long time.
        cacheControl: '31536000',
      })
      if (!tErr) {
        const { data: tPub } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath)
        thumbUrl = toPublicUrl(tPub.publicUrl)
      }
    }
  } catch { /* preview is optional */ }

  onProgress?.(1)

  return {
    // Served from the custom storage domain so customer-facing links look
    // like the business, and the bytes bypass Vercel.
    url: toPublicUrl(pub.publicUrl),
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
