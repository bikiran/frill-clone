import type { NextRequest } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { visitorConversation } from '@/lib/widget-access'

/**
 * Who may put a file where (/api/storage/presign, /api/storage/put,
 * /api/inbox/upload). These took any folder from anyone, so the public bucket
 * could be filled with anything — including HTML pages served from our media
 * domain. Now the folder decides who may write to it:
 *
 *   chat-attachments/{company}/…    staff of that company (Bearer token), or
 *   chat-attachments/{company}/{conversation}
 *                                    the widget visitor who started that chat
 *   media-gallery/{company}/…,
 *   email-inline/{company}, email-attachments/{company}
 *                                    staff of that company
 *   media-requests/{token}           anyone holding a live upload link
 *
 * Visitors and upload links may send images, video, audio, PDFs and office
 * documents only, with a size cap. Nobody may upload HTML or scripts.
 * Server-only.
 */

export type UploadWho = 'staff' | 'visitor' | 'request'
// Flat rather than a union: this project builds without strictNullChecks, so
// `if (!check.ok)` wouldn't narrow one.
export type UploadCheck = { ok: boolean; who: UploadWho | null; prefix: string; status: number; error: string }
const deny = (status: number, error: string): UploadCheck => ({ ok: false, who: null, prefix: '', status, error })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAFF_FOLDERS = new Set(['chat-attachments', 'media-gallery', 'email-inline', 'email-attachments'])

// Never stored, for anyone: a page or script on the media domain.
const NEVER = /^(text\/html|application\/xhtml\+xml|text\/javascript|application\/(x-)?javascript|application\/ecmascript|text\/xml|application\/xml)\b/i
// What a visitor or an upload link may send.
const PUBLIC_OK = /^(image\/(jpeg|jpg|png|gif|webp|heic|heif|avif|bmp|tiff)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|text\/plain|text\/csv|application\/octet-stream|application\/msword|application\/vnd\.openxmlformats-officedocument\.[\w.+-]+|application\/vnd\.ms-(excel|powerpoint)|application\/vnd\.oasis\.opendocument\.[\w.+-]+)$/i

export const PUBLIC_MAX_BYTES = 500 * 1024 * 1024

export function cleanPrefix(raw: string | null | undefined): string | null {
  const p = String(raw || '').replace(/^\/+|\/+$/g, '')
  if (!p || p.length > 300) return null
  const parts = p.split('/')
  if (parts.some(s => !s || s === '.' || s === '..' || !/^[A-Za-z0-9._-]+$/.test(s))) return null
  return parts.join('/')
}

export function typeAllowed(who: UploadWho, contentType: string): boolean {
  const ct = (contentType || 'application/octet-stream').split(';')[0].trim()
  if (NEVER.test(ct)) return false
  if (who === 'staff') return true
  return PUBLIC_OK.test(ct)
}

export async function checkUpload(
  req: NextRequest, db: any, rawPrefix: string | null | undefined, contentType: string, size?: number | null,
): Promise<UploadCheck> {
  const prefix = cleanPrefix(rawPrefix)
  if (!prefix) return deny(400, 'Invalid folder')
  const [folder, a, b] = prefix.split('/')

  let who: UploadWho | null = null
  if (STAFF_FOLDERS.has(folder) && a && UUID.test(a)) {
    if ((req.headers.get('authorization') || '').trim() && (await requireCompanyAccess(req, db, a)).ok) who = 'staff'
    // Someone signed in to Colvy chatting on another business's widget sends
    // their token too, so fall back to the visitor check.
    else if (folder === 'chat-attachments' && b && UUID.test(b) && await visitorConversation(req, db, a, b)) who = 'visitor'
  } else if (folder === 'media-requests' && a) {
    const { data: r } = await db.from('media_requests').select('status, expires_at').eq('token', a).maybeSingle()
    if (r && r.status !== 'cancelled' && !(r.expires_at && new Date(r.expires_at).getTime() < Date.now())) who = 'request'
  }
  if (!who) return deny(403, 'Not allowed to upload here')

  if (!typeAllowed(who, contentType)) return deny(415, 'That file type can’t be uploaded')
  if (who !== 'staff' && size != null && size > PUBLIC_MAX_BYTES) return deny(413, 'That file is too large')
  return { ok: true, who, prefix, status: 200, error: '' }
}
