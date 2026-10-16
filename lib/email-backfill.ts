// Re-fetch the bodies of inbound emails that were stored empty.
//
// Before the inbound webhook fetched received emails from Resend's Receiving
// API, every reply that arrived through Resend (e.g. to <slug>@reply.colvy.com)
// was saved with an empty body. This finds those rows (recent, inbound, email,
// no text and no HTML), fetches each email from Resend and fills it in.
// Safe to run any number of times: a row that has a body is never touched, and
// a row that was checked is stamped so it isn't fetched again.

import { sanitizeEmailHtml } from '@/lib/gmail'
import { fetchResendReceivedEmail, readReceived, hostResendAttachments, findEmailThread, splitQuoted, htmlToPlain, emailPreview, idVariants, type ReceivedEmail } from '@/lib/inbound-email'

export type BackfillResult = {
  scanned: number; candidates: number; filled: number; rethreaded: number
  notFound: number; stillEmpty: number; dryRun: boolean; rows: { id: string; conversationId: string; outcome: string }[]
}

const blank = (v: any) => !String(v ?? '').trim()

/** Received emails on Resend since `sinceIso`, message_id → email id (newest first, capped). */
async function resendIndex(sinceIso: string, fetchImpl: typeof fetch, maxPages = 20): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const key = process.env.RESEND_API_KEY
  if (!key) return map
  let after = ''
  for (let page = 0; page < maxPages; page++) {
    try {
      const res = await fetchImpl(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, { headers: { Authorization: `Bearer ${key}` } })
      if (!res.ok) break
      const j: any = await res.json().catch(() => null)
      const list: any[] = j?.data || []
      for (const e of list) if (e?.message_id && e?.id) for (const v of idVariants([String(e.message_id)])) map.set(v, String(e.id))
      const oldest = list[list.length - 1]?.created_at
      if (!j?.has_more || !list.length || (oldest && oldest < sinceIso)) break
      after = String(list[list.length - 1].id)
    } catch { break }
  }
  return map
}

export async function backfillEmptyEmailBodies(db: any, o: {
  companyId?: string | null; days?: number; limit?: number; dryRun?: boolean; rethread?: boolean
  fetchImpl?: typeof fetch; retryDelaysMs?: number[]
} = {}): Promise<BackfillResult> {
  const f = o.fetchImpl || fetch
  const days = Math.min(Math.max(Number(o.days) || 30, 1), 90)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const out: BackfillResult = { scanned: 0, candidates: 0, filled: 0, rethreaded: 0, notFound: 0, stillEmpty: 0, dryRun: !!o.dryRun, rows: [] }

  let q = db.from('messages').select('*')
    .eq('sender_type', 'visitor').eq('delivery_channel', 'email').is('gmail_message_id', null)
    .gte('created_at', since).order('created_at', { ascending: false }).limit(Math.min(o.limit || 500, 1000))
  if (o.companyId) q = q.eq('company_id', o.companyId)
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  out.scanned = (rows || []).length

  const todo = (rows || []).filter((m: any) => blank(m.content) && blank(m.email_html) && !m.metadata?.inbound_email?.backfilled_at)
  out.candidates = todo.length
  if (!todo.length) return out

  let index: Map<string, string> | null = null
  for (const m of todo) {
    const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {}
    let emailId: string | null = meta.inbound_email?.resend_email_id || null
    if (!emailId && m.email_message_id) {
      index ||= await resendIndex(since, f)
      emailId = index.get(String(m.email_message_id)) || index.get(`<${String(m.email_message_id).replace(/^<|>$/g, '')}>`) || null
    }
    if (!emailId) { out.notFound++; out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome: 'not-found-on-resend' }); continue }

    const raw: ReceivedEmail | null = await fetchResendReceivedEmail(emailId, { fetchImpl: f, delaysMs: o.retryDelaysMs })
    const full = readReceived(raw)
    if (!full) { out.notFound++; out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome: 'fetch-failed' }); continue }

    const split = splitQuoted(full.text || htmlToPlain(full.html))
    const html = full.html ? sanitizeEmailHtml(full.html) : ''
    const stamp = { ...meta, inbound_email: { ...(meta.inbound_email || {}), provider: 'resend', resend_email_id: emailId, body: 'backfilled', backfilled_at: new Date().toISOString() } }
    if (!split.reply && !html) {
      out.stillEmpty++
      out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome: 'email-has-no-body' })
      if (!o.dryRun) await db.from('messages').update({ metadata: stamp }).eq('id', m.id)
      continue
    }

    out.filled++
    let outcome = 'filled'
    if (!o.dryRun) {
      const patch: any = {
        content: split.reply, email_html: html || null, email_quoted: split.quoted || null, metadata: stamp,
        ...(full.inReplyTo && !m.email_in_reply_to ? { email_in_reply_to: full.inReplyTo } : {}),
      }
      const hasFiles = Array.isArray(m.email_attachments) && m.email_attachments.length
      if (!hasFiles && full.attachments.length) {
        const files = await hostResendAttachments(emailId, m.company_id, full.attachments, f)
        if (files.length) patch.email_attachments = files.map(a => ({ name: a.name, mime: a.type, url: a.url, ...(a.size ? { size: a.size } : {}) }))
      }
      const { error: upErr } = await db.from('messages').update(patch).eq('id', m.id)
      if (upErr) { delete patch.email_quoted; delete patch.metadata; await db.from('messages').update(patch).eq('id', m.id) }
      const preview = emailPreview(split.reply, (patch.email_attachments || m.email_attachments || []).length, m.email_subject)

      // Optionally move it onto the conversation it replies to (e.g. the order
      // conversation the original email was sent from). The conversation it was
      // dropped into is closed if that leaves it empty — never deleted.
      let convId = m.conversation_id
      if (o.rethread) {
        const { data: src } = await db.from('conversations').select('*').eq('id', m.conversation_id).maybeSingle()
        const found = await findEmailThread(db, { companyId: m.company_id, contactId: src?.contact_id || null, excludeConversationId: m.conversation_id, ids: full.threadIds, subject: /^\s*re\s*:/i.test(String(m.email_subject || '')) ? m.email_subject : null })
        if (found?.conv && found.conv.id !== m.conversation_id) {
          await db.from('messages').update({ conversation_id: found.conv.id }).eq('id', m.id)
          convId = found.conv.id
          out.rethreaded++
          outcome = `filled+moved:${found.via}`
          const { data: left } = await db.from('messages').select('id').eq('conversation_id', m.conversation_id).limit(1)
          if (!(left || []).length) {
            await db.from('conversations').update({ status: 'closed', last_message: 'Moved to the customer’s existing conversation', is_unread: false, unread_count: 0 }).eq('id', m.conversation_id)
          }
          const later = !found.conv.last_message_at || String(found.conv.last_message_at) <= String(m.created_at)
          await db.from('conversations').update({ ...(later ? { last_message: preview, last_message_at: m.created_at } : {}), is_unread: true, status: 'open' }).eq('id', found.conv.id)
        }
      }
      if (convId === m.conversation_id) {
        const { data: conv } = await db.from('conversations').select('id, last_message').eq('id', convId).maybeSingle()
        if (conv && blank(conv.last_message)) await db.from('conversations').update({ last_message: preview }).eq('id', convId)
      }
    }
    out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome })
  }
  return out
}
