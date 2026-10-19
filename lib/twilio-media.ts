// Re-hosting media a customer sent through Twilio (WhatsApp photos, voice
// notes, documents). Twilio's media URLs sit behind the account's Basic auth,
// so a raw link would show as broken in the thread. The bytes are fetched
// server-side with the account's credentials (only ever sent to a twilio.com
// host) and stored on Colvy's public media domain: R2, else Supabase Storage,
// in the company's own chat-attachments folder. The same approach as inbound
// MMS (app/api/twilio/webhook), with a time limit so a large file can't hold
// Twilio's webhook past its 15 seconds.

import { uploadToR2, r2Configured } from '@/lib/r2'

export type RehostedMedia = { url: string; kind: 'image' | 'video' | 'audio' | 'file'; type?: string; name?: string; size?: number }

export function isTwilioMediaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return u.protocol === 'https:' && (host === 'api.twilio.com' || host.endsWith('.twilio.com'))
  } catch { return false }
}

export const mediaKind = (ct: string): RehostedMedia['kind'] =>
  ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : 'file'

const EXT: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'image/jpeg': 'jpg', 'application/pdf': 'pdf', 'image/webp': 'webp' }

/** Download one Twilio media URL with the account's credentials. Throws on anything but a Twilio host or a 2xx. */
export async function fetchTwilioMedia(mediaUrl: string, creds: { accountSid: string; authToken: string }, timeoutMs = 9000, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!isTwilioMediaUrl(mediaUrl)) throw new Error('Twilio media fetch: not a Twilio URL')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(mediaUrl, { headers: { Authorization: 'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64') }, signal: ctl.signal })
    if (!res.ok) throw new Error(`Twilio media fetch: ${res.status}`)
    const len = Number(res.headers.get('content-length') || 0)
    if (len && len > maxBytes) throw new Error('Twilio media fetch: too large')
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error('Twilio media fetch: too large')
    return { bytes, contentType: (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim() }
  } finally { clearTimeout(timer) }
}

/**
 * Fetch one Twilio media URL and store it publicly under
 * chat-attachments/<companyId>/<folder>/<media sid>.<ext>. null when it can't
 * be fetched or stored (the caller flags the message so staff can ask for it
 * again). `contentTypeHint` is the MediaContentTypeN Twilio sent.
 */
export async function rehostTwilioMedia(db: any, opts: {
  companyId: string
  mediaUrl: string
  creds: { accountSid: string; authToken: string }
  folder: string
  contentTypeHint?: string | null
  timeoutMs?: number
}): Promise<RehostedMedia | null> {
  try {
    const fetched = await fetchTwilioMedia(opts.mediaUrl, opts.creds, opts.timeoutMs)
    const ct = String(fetched.contentType && fetched.contentType !== 'application/octet-stream' ? fetched.contentType : (opts.contentTypeHint || fetched.contentType || 'application/octet-stream'))
    const kind = mediaKind(ct)
    const ext = EXT[ct] || (ct.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
    const sid = (opts.mediaUrl.split('?')[0].split('/').pop() || Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '')
    const key = `${opts.companyId}/${opts.folder}/${sid}.${ext}`
    const name = kind === 'file' ? `attachment.${ext}` : kind
    const out = (url: string): RehostedMedia => ({ url, kind, type: ct, name, size: fetched.bytes.byteLength })
    if (r2Configured()) {
      try { return out(await uploadToR2(`chat-attachments/${key}`, fetched.bytes, ct)) }
      catch (e: any) { console.warn('[twilio media] R2 failed, using Supabase', e?.message) }
    }
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some((b: any) => b.id === 'chat-attachments')) await db.storage.createBucket('chat-attachments', { public: true })
    } catch {}
    const { error } = await db.storage.from('chat-attachments').upload(key, fetched.bytes, { contentType: ct, upsert: true })
    if (error) { console.error('[twilio media] upload failed', error.message); return null }
    const { data: pub } = db.storage.from('chat-attachments').getPublicUrl(key)
    return pub?.publicUrl ? out(pub.publicUrl) : null
  } catch (e: any) {
    console.error('[twilio media] rehost failed', e?.message || e)
    return null
  }
}
