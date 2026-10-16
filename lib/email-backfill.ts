// Re-fetch the bodies of inbound emails that were stored empty.
//
// Before the inbound webhook fetched received emails from Resend's Receiving
// API, every reply that arrived through Resend (e.g. to <slug>@reply.colvy.com)
// was saved with an empty body. This finds those rows (recent, inbound, email,
// no text and no HTML), fetches each email from Resend and fills it in.
// Safe to run any number of times: a row that has a body is never touched, and
// a row that was checked is stamped so it isn't fetched again.

import { sanitizeEmailHtml } from '@/lib/gmail'
import { companyAlias } from '@/lib/inbound-alias'
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

const addrOf = (raw: string) => (/<([^>]+)>/.exec(raw)?.[1] || raw).trim().toLowerCase()

/** Staff wrote in this conversation (not Colvy's automatic or AI messages, not notes). */
async function hasStaffReplies(db: any, conversationId: string): Promise<boolean> {
  const { data } = await db.from('messages').select('id, is_ai, is_internal, metadata').eq('conversation_id', conversationId).eq('sender_type', 'agent').limit(200)
  return (data || []).some((m: any) => !m.is_internal && !m.is_ai && !m.metadata?.auto)
}

/** Something else hangs off this conversation (a ticket, an order, a cart), so it must stay. */
async function hasLinkedRecords(db: any, conversationId: string): Promise<boolean> {
  for (const table of ['support_tickets', 'orders', 'abandoned_carts']) {
    try {
      const { data, error } = await db.from(table).select('id').eq('conversation_id', conversationId).limit(1)
      if (error) return true            // can't tell: keep it
      if ((data || []).length) return true
    } catch { return true }
  }
  return false
}

const note = (db: any, companyId: string, conversationId: string, content: string) =>
  db.from('messages').insert({ conversation_id: conversationId, company_id: companyId, sender_type: 'agent', sender_name: 'Colvy', content, is_internal: true, is_read: true, metadata: { auto: true, email_backfill_note: true } })

export async function backfillEmptyEmailBodies(db: any, o: {
  companyId?: string | null; days?: number; limit?: number; dryRun?: boolean; rethread?: boolean
  fetchImpl?: typeof fetch; retryDelaysMs?: number[]; pageSize?: number
} = {}): Promise<BackfillResult> {
  const f = o.fetchImpl || fetch
  const days = Math.min(Math.max(Number(o.days) || 30, 1), 90)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const max = Math.min(Math.max(Number(o.limit) || 2000, 1), 5000)
  const pageSize = Math.min(Math.max(Number(o.pageSize) || 200, 1), 500)
  const out: BackfillResult = { scanned: 0, candidates: 0, filled: 0, rethreaded: 0, notFound: 0, stillEmpty: 0, dryRun: !!o.dryRun, rows: [] }

  // Only the rows that need it, straight from the database: inbound emails in
  // the window with no text, no HTML and not checked before. Walked oldest
  // first by created_at (keyset), so filled rows dropping out of the filter
  // never make a page skip anything.
  const seen = new Set<string>()
  const todo: any[] = []
  let cursor = since
  let atCursor = 0          // rows already seen whose created_at equals the cursor
  while (todo.length < max) {
    let q = db.from('messages').select('*')
      .eq('sender_type', 'visitor').eq('delivery_channel', 'email').is('gmail_message_id', null)
      .or('content.is.null,content.eq.').is('email_html', null).is('metadata->inbound_email->>backfilled_at', null)
      .gte('created_at', cursor).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(pageSize + atCursor)
    if (o.companyId) q = q.eq('company_id', o.companyId)
    const { data: page, error } = await q
    if (error) throw new Error(error.message)
    const fresh = (page || []).filter((m: any) => !seen.has(m.id))
    for (const m of fresh) { seen.add(m.id); if (todo.length < max) todo.push(m) }
    if (!fresh.length || (page || []).length < pageSize + atCursor) break
    cursor = String(page[page.length - 1].created_at)
    atCursor = todo.filter(x => String(x.created_at) === cursor).length
  }
  out.scanned = todo.length
  out.candidates = todo.length
  if (!todo.length) return out

  // Where each company's mail may legitimately have been addressed.
  const inboxes = new Map<string, Set<string>>()
  const inboxOf = async (companyId: string) => {
    if (inboxes.has(companyId)) return inboxes.get(companyId)!
    const set = new Set<string>()
    const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    if (co?.slug) set.add(companyAlias(co.slug))
    const { data: chs } = await db.from('email_channels').select('inbound_address, from_address').eq('company_id', companyId)
    for (const c of chs || []) for (const a of [c.inbound_address, c.from_address]) if (a) set.add(String(a).toLowerCase())
    inboxes.set(companyId, set)
    return set
  }

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
    const stamp = (body: string) => ({ ...meta, inbound_email: { ...(meta.inbound_email || {}), provider: 'resend', resend_email_id: emailId, body, auth: full.auth, backfilled_at: new Date().toISOString() } })

    // It must be the same email: from this row's sender, to this business.
    const fromOk = !m.sender_email || !full.from || addrOf(full.from) === String(m.sender_email).toLowerCase()
    const allowed = new Set(await inboxOf(m.company_id))
    for (const a of String(m.email_to || '').split(',')) if (a.trim()) allowed.add(addrOf(a))
    const toOk = !full.to.length || full.to.some(a => allowed.has(addrOf(a)))
    if (!fromOk || !toOk) {
      out.notFound++
      out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome: 'mismatch' })
      if (!o.dryRun) await db.from('messages').update({ metadata: stamp('mismatch') }).eq('id', m.id)
      continue
    }

    const split = splitQuoted(full.text || htmlToPlain(full.html))
    const html = full.html ? sanitizeEmailHtml(full.html) : ''
    if (!split.reply && !html) {
      out.stillEmpty++
      out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome: 'email-has-no-body' })
      if (!o.dryRun) await db.from('messages').update({ metadata: stamp('empty') }).eq('id', m.id)
      continue
    }

    out.filled++
    let outcome = 'filled'
    if (!o.dryRun) {
      const patch: any = {
        content: split.reply, email_html: html || null, email_quoted: split.quoted || null, metadata: stamp('backfilled'),
        ...(full.inReplyTo && !m.email_in_reply_to ? { email_in_reply_to: full.inReplyTo } : {}),
      }
      const hasFiles = Array.isArray(m.email_attachments) && m.email_attachments.length
      if (!hasFiles && full.attachments.length) {
        const files = await hostResendAttachments(emailId, m.company_id, full.attachments, f)
        if (files.length) patch.email_attachments = files.map(a => ({ name: a.name, mime: a.type, url: a.url, ...(a.size ? { size: a.size } : {}), ...(a.thumbUrl ? { thumbUrl: a.thumbUrl } : {}) }))
      }
      const { error: upErr } = await db.from('messages').update(patch).eq('id', m.id)
      if (upErr) { delete patch.email_quoted; delete patch.metadata; await db.from('messages').update(patch).eq('id', m.id) }
      const preview = emailPreview(split.reply, (patch.email_attachments || m.email_attachments || []).length, m.email_subject)

      // Optionally put it with the conversation it replies to (e.g. the order
      // conversation the original email was sent from). Never triggers an
      // agent, never reopens or marks unread an older or resolved conversation,
      // and never takes a customer's email out of a conversation staff answered.
      let moved = false
      if (o.rethread) {
        const { data: src } = await db.from('conversations').select('*').eq('id', m.conversation_id).maybeSingle()
        const found = await findEmailThread(db, {
          companyId: m.company_id, contactId: src?.contact_id || null, excludeConversationId: m.conversation_id, ids: full.threadIds,
          subject: full.auth === 'pass' && /^\s*re\s*:/i.test(String(m.email_subject || '')) ? m.email_subject : null,
        })
        if (found?.conv && found.conv.id !== m.conversation_id) {
          const target = found.conv
          if (await hasStaffReplies(db, m.conversation_id)) {
            // Staff already answered it where it is: leave both, link them.
            await note(db, m.company_id, m.conversation_id, `This email replies to an earlier conversation with the customer: /admin/inbox?conversation=${target.id}`)
            await note(db, m.company_id, target.id, `The customer replied by email in another conversation: /admin/inbox?conversation=${m.conversation_id}`)
            outcome = `filled+linked:${found.via}`
          } else {
            await db.from('messages').update({ conversation_id: target.id }).eq('id', m.id)
            moved = true
            out.rethreaded++
            outcome = `filled+moved:${found.via}`
            const resolved = ['resolved', 'closed'].includes(String(target.status || '').toLowerCase())
            const older = !!target.last_message_at && String(m.created_at) < String(target.last_message_at)
            if (!resolved && !older) {
              await db.from('conversations').update({ last_message: preview, last_message_at: m.created_at, is_unread: true }).eq('id', target.id)
            }
            const { data: left } = await db.from('messages').select('id').eq('conversation_id', m.conversation_id).limit(1)
            if (!(left || []).length && !(await hasLinkedRecords(db, m.conversation_id))) {
              await db.from('conversations').update({ status: 'closed', last_message: 'Moved to the customer’s existing conversation', is_unread: false, unread_count: 0 }).eq('id', m.conversation_id)
            } else {
              await note(db, m.company_id, m.conversation_id, `The customer’s email was moved to their existing conversation: /admin/inbox?conversation=${target.id}`)
            }
          }
        }
      }
      if (!moved) {
        const { data: conv } = await db.from('conversations').select('id, last_message').eq('id', m.conversation_id).maybeSingle()
        if (conv && blank(conv.last_message)) await db.from('conversations').update({ last_message: preview }).eq('id', m.conversation_id)
      }
    }
    out.rows.push({ id: m.id, conversationId: m.conversation_id, outcome })
  }
  return out
}
