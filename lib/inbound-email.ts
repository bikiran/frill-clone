// Inbound email helpers shared by the inbound webhook (app/api/webhooks/email),
// the body backfill (app/api/email/backfill-bodies) and the Gmail sync.
//
// Why this exists: Resend's `email.received` webhook carries METADATA only
// (email_id, from, to, subject, message_id, attachment list). The body, the
// headers (In-Reply-To / References) and the attachment files have to be
// fetched from the Receiving API with the email_id. The webhook used to read
// `text`/`html` straight off the payload, found nothing, and stored customer
// replies with an empty body in a brand-new conversation.

import { uploadToR2, r2Configured } from '@/lib/r2'
import { isThumbableImage, thumbFromBytes, THUMB_WIDTH } from '@/lib/image-thumb'
import { headerValue, parseMessageIds, idVariants, normSubject, authVerdict } from '@/lib/email-text'

export * from '@/lib/email-text'

const RESEND = 'https://api.resend.com'

export type ReceivedEmail = {
  id: string
  from?: string | null
  to?: string[] | string | null
  cc?: string[] | string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  headers?: any
  message_id?: string | null
  created_at?: string | null
  attachments?: any[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Fetch a received email (body, headers, attachment list) from Resend.
 * Retries a few times: the webhook can arrive a moment before the email is
 * readable (404), and 429/5xx are worth another go. null when it can't be had.
 */
export async function fetchResendReceivedEmail(
  emailId: string | null | undefined,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch; retries?: number; delaysMs?: number[] } = {},
): Promise<ReceivedEmail | null> {
  const key = opts.apiKey ?? process.env.RESEND_API_KEY
  if (!emailId || !key) return null
  const f = opts.fetchImpl || fetch
  const delays = opts.delaysMs || [300, 1200, 3000]
  const tries = Math.max(1, (opts.retries ?? delays.length) + 1)
  for (let i = 0; i < tries; i++) {
    try {
      const res = await f(`${RESEND}/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        const j: any = await res.json().catch(() => null)
        const e = j?.data && typeof j.data === 'object' && !j.id ? j.data : j
        if (e && typeof e === 'object') return { ...e, id: e.id || emailId }
        return null
      }
      // 4xx other than "not there yet" / rate limit won't get better.
      if (res.status !== 404 && res.status !== 429 && res.status < 500) return null
    } catch { /* network: retry */ }
    if (i < tries - 1) await sleep(delays[Math.min(i, delays.length - 1)])
  }
  return null
}

// The conversation belongs to this sender: the same contact (or neither has one).
function sameContact(conv: any, contactId?: string | null): boolean {
  if (conv?.contact_id && contactId) return conv.contact_id === contactId
  return !conv?.contact_id && !contactId
}

/**
 * Which conversation an inbound email belongs to.
 *  1. In-Reply-To / References → a message we sent or received (messages.email_message_id),
 *     or a conversation started by that message (conversations.email_message_id).
 *  2. The same subject (ignoring Re:/Fwd:) on one of this contact's recent
 *     conversations — an email we sent (messages.email_subject) or the thread's own.
 *     That is how a reply to an automated "Update on your order #124543" finds
 *     the order conversation even when the sent mail's Message-ID wasn't stored.
 * null → the caller falls back / starts a new conversation.
 */
export async function findEmailThread(db: any, o: {
  companyId: string; contactId?: string | null; ids: string[]; subject?: string | null; sinceDays?: number
  /** Look for a thread other than this one (re-threading a stored email). */
  excludeConversationId?: string | null
}): Promise<{ conv: any; via: 'message-id' | 'subject' } | null> {
  const ids = idVariants(o.ids || [])
  if (ids.length) {
    try {
      const { data: hits } = await db.from('messages').select('conversation_id, created_at')
        .eq('company_id', o.companyId).in('email_message_id', ids).order('created_at', { ascending: false }).limit(5)
      for (const h of hits || []) {
        if (!h?.conversation_id || h.conversation_id === o.excludeConversationId) continue
        const { data: conv } = await db.from('conversations').select('*').eq('id', h.conversation_id).eq('company_id', o.companyId).maybeSingle()
        // Only onto the sender's own conversation: someone else quoting our
        // Message-ID (a forward, a spoof) gets a conversation of their own.
        if (conv && sameContact(conv, o.contactId)) return { conv, via: 'message-id' }
      }
    } catch { /* fall through */ }
    try {
      const { data: convs } = await db.from('conversations').select('*')
        .eq('company_id', o.companyId).in('email_message_id', ids).limit(5)
      const c = (convs || []).find((x: any) => x.id !== o.excludeConversationId && sameContact(x, o.contactId))
      if (c) return { conv: c, via: 'message-id' }
    } catch { /* fall through */ }
  }
  const want = normSubject(o.subject)
  if (!want || !o.contactId || want === '(no subject)') return null
  try {
    const since = new Date(Date.now() - (o.sinceDays ?? 90) * 86400000).toISOString()
    const { data: convs } = await db.from('conversations').select('*')
      .eq('company_id', o.companyId).eq('contact_id', o.contactId)
      .order('last_message_at', { ascending: false }).limit(25)
    const list = ((convs || []) as any[]).filter(c => c.id !== o.excludeConversationId)
    const own = list.find(c => normSubject(c.email_subject) === want)
    if (own) return { conv: own, via: 'subject' }
    const convIds = list.map(c => c.id)
    if (convIds.length) {
      const { data: msgs } = await db.from('messages').select('conversation_id, email_subject, created_at')
        .in('conversation_id', convIds).not('email_subject', 'is', null).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(200)
      const hit = (msgs || []).find((m: any) => normSubject(m.email_subject) === want)
      if (hit) return { conv: list.find(c => c.id === hit.conversation_id), via: 'subject' }
    }
  } catch { /* fall through */ }
  return null
}

// Files a customer's email may carry, by type. Pictures, videos, audio, PDFs
// and office documents are stored as what they are; anything else (HTML, SVG,
// XML, scripts, archives…) is stored as a download that never opens in the
// browser, so a file from an email can't run on our files domain.
const SAFE_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif|bmp|avif)|video\/(mp4|quicktime|webm|3gpp)|audio\/(mpeg|mp4|aac|wav|ogg|x-m4a)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.ms-powerpoint))$/i
export const MAX_EMAIL_FILES = 10
export const MAX_EMAIL_FILE_BYTES = 20 * 1024 * 1024
export const MAX_EMAIL_TOTAL_BYTES = 25 * 1024 * 1024

export function safeAttachmentType(type: string | null | undefined): { type: string; inline: boolean } {
  const t = String(type || '').toLowerCase().split(';')[0].trim()
  return SAFE_TYPES.test(t) ? { type: t, inline: true } : { type: 'application/octet-stream', inline: false }
}

/**
 * Resend gives attachment METADATA only. Download each file from the
 * Attachments API and keep it on our own R2 → [{url,name,type,size}].
 * At most 10 files and 25MB in all; unsafe types are stored as downloads.
 */
export async function hostResendAttachments(emailId: string | null | undefined, companyId: string, meta?: any[] | null, fetchImpl: typeof fetch = fetch): Promise<{ url: string; name: string; type: string; size?: number; thumbUrl?: string }[]> {
  try {
    if (!process.env.RESEND_API_KEY || !r2Configured() || !emailId) return []
    // Skip the extra API call when the payload's metadata says there are none.
    if (Array.isArray(meta) && meta.length === 0) return []
    const res = await fetchImpl(`${RESEND}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })
    if (!res.ok) return []
    const j: any = await res.json().catch(() => ({}))
    const list = (j.data || j.attachments || []) as any[]
    const out: { url: string; name: string; type: string; size?: number; thumbUrl?: string }[] = []
    let total = 0
    // Photos also get a small WebP for the inbox tiles, made from the bytes we
    // already have. Best-effort and time-boxed: never holds up or loses a file.
    const thumbDeadline = Date.now() + 6_000
    for (let i = 0; i < list.length && out.length < MAX_EMAIL_FILES; i++) {
      const a = list[i]
      try {
        if (!a?.download_url || !/^https:\/\//i.test(String(a.download_url))) continue
        if (a.size && (Number(a.size) > MAX_EMAIL_FILE_BYTES || total + Number(a.size) > MAX_EMAIL_TOTAL_BYTES)) continue
        const dl = await fetchImpl(a.download_url)
        if (!dl.ok) continue
        const bytes = Buffer.from(await dl.arrayBuffer())
        if (!bytes.length || bytes.length > MAX_EMAIL_FILE_BYTES || total + bytes.length > MAX_EMAIL_TOTAL_BYTES) continue
        total += bytes.length
        const name = String(a.filename || 'file').slice(0, 180)
        const { type, inline } = safeAttachmentType(a.content_type)
        const safe = name.replace(/[^\w.\-]/g, '_')
        const uniq = String(a.id || i).replace(/[^\w-]/g, '').slice(0, 40) || String(i)
        const key = `ticket-attachments/${companyId}/${emailId}-${uniq}-${safe}`
        const url = await uploadToR2(key, bytes, type, inline ? {} : { contentDisposition: `attachment; filename="${safe}"` })
        let thumbUrl: string | undefined
        if (inline && Date.now() < thumbDeadline && isThumbableImage({ url, type })) {
          try {
            const thumb = await thumbFromBytes(bytes, Math.max(500, thumbDeadline - Date.now()))
            if (thumb) thumbUrl = await uploadToR2(`ticket-attachments/${companyId}/thumbs/${emailId}-${uniq}-${THUMB_WIDTH}.webp`, thumb, 'image/webp')
          } catch { /* the original still shows */ }
        }
        out.push({ url, name, type, size: bytes.length, ...(thumbUrl ? { thumbUrl } : {}) })
      } catch { /* skip one bad attachment */ }
    }
    return out
  } catch { return [] }
}

/** Everything the inbound paths need from a received email, normalised. */
export function readReceived(e: ReceivedEmail | null | undefined) {
  if (!e) return null
  const headers = e.headers || {}
  const inReplyTo = headerValue(headers, 'in-reply-to')
  const references = headerValue(headers, 'references')
  return {
    text: typeof e.text === 'string' ? e.text : '',
    html: typeof e.html === 'string' ? e.html : '',
    messageId: e.message_id || headerValue(headers, 'message-id') || null,
    inReplyTo: parseMessageIds(inReplyTo)[0] || null,
    threadIds: parseMessageIds(inReplyTo, references),
    attachments: Array.isArray(e.attachments) ? e.attachments : [],
    receivedAt: e.created_at || null,
    auth: authVerdict((e as any).authentication),
    from: String(e.from || ''),
    to: ([] as string[]).concat(e.to || [], e.cc || [], (e as any).received_for || []).map(String),
  }
}
