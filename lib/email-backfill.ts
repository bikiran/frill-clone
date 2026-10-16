// Re-fetch the bodies of inbound emails that were stored empty.
//
// Before the inbound webhook fetched received emails from Resend's Receiving
// API, every reply that arrived through Resend (e.g. to <slug>@reply.colvy.com)
// was saved with an empty body. This finds those rows (recent, inbound, email,
// no text and no HTML), fetches each email from Resend and fills it in.
// Safe to run any number of times: a row that has a body is never touched, and
// a row that was checked is stamped so it isn't fetched again.

import { sanitizeEmailHtml, getGmailToken, findPart, extractBody } from '@/lib/gmail'
import { companyAlias, INBOUND_DOMAIN } from '@/lib/inbound-alias'
import { scheduleMessageThumbs } from '@/lib/image-thumb'
import { fetchResendReceivedEmail, readReceived, hostResendAttachments, findEmailThread, splitQuoted, htmlToPlain, emailPreview, idVariants, normSubject, type ReceivedEmail } from '@/lib/inbound-email'

/** Where an empty row most likely came from. */
export type ProviderGuess = 'resend' | 'gmail' | 'other-webhook' | 'unknown'
export type BackfillRow = {
  id: string; conversationId: string; outcome: string
  /** Shown for every row the run can't recover, so the owner can act on it. */
  date?: string; from?: string | null; to?: string | null; subject?: string | null
  provider?: ProviderGuess; reason?: string; matchedBy?: string
  /** Open the email in the business's Gmail (search by Message-ID). */
  gmailUrl?: string | null
  /** The readable copy already in Colvy (e.g. Gmail sync imported it too). */
  copyConversationId?: string | null
}
export type BackfillResult = {
  scanned: number; candidates: number; filled: number; rethreaded: number
  notFound: number; stillEmpty: number; fromGmail: number; alreadyInColvy: number
  dryRun: boolean; rows: BackfillRow[]
  /** How far back Resend's received list was read, and whether it reached the oldest row. */
  resendIndex?: { pages: number; oldest: string | null; complete: boolean; error?: string }
}

const blank = (v: any) => !String(v ?? '').trim()

/** Resend keeps received emails this long (resend.com/pricing: 30 days on every plan). */
export const RESEND_RETENTION_DAYS = Number(process.env.RESEND_RETENTION_DAYS) || 30

/** One spelling for a Message-ID: no angle brackets, no spaces, lower case. */
export const normId = (v: any) => String(v ?? '').trim().replace(/^<+|>+$/g, '').trim().toLowerCase()

/** Resend writes "2026-09-01 03:04:05.678+00"; Date.parse wants an ISO-ish string. */
export function parseResendTime(v: any): number {
  if (!v) return NaN
  const s = String(v).trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : Date.parse(String(v))
}

const addrOf = (raw: string) => (/<([^>]+)>/.exec(raw)?.[1] || raw).trim().toLowerCase()

type Listed = { id: string; from: string; to: string[]; subject: string; created: number; messageId: string }
type ResendIndex = { byId: Map<string, string>; list: Listed[]; pages: number; oldest: number; complete: boolean; error?: string }

/**
 * Received emails on Resend back to `sinceMs`: normalised Message-ID → email id,
 * plus the list itself for matching by sender, recipient, subject and time.
 * Resend lists newest first, 100 a page (`has_more` / `after`), and keeps
 * received mail for RESEND_RETENTION_DAYS. One Resend account receives for
 * every business, so the old 20-page cap (2,000 emails) could stop well short
 * of the rows being looked for.
 */
async function resendIndex(sinceMs: number, fetchImpl: typeof fetch, maxPages = 150): Promise<ResendIndex> {
  const idx: ResendIndex = { byId: new Map(), list: [], pages: 0, oldest: NaN, complete: false }
  const key = process.env.RESEND_API_KEY
  if (!key) { idx.error = 'RESEND_API_KEY is not set'; return idx }
  let after = ''
  for (let page = 0; page < maxPages; page++) {
    try {
      const res = await fetchImpl(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, { headers: { Authorization: `Bearer ${key}` } })
      if (!res.ok) { idx.error = `Resend answered ${res.status}`; break }
      const j: any = await res.json().catch(() => null)
      const list: any[] = j?.data || []
      idx.pages++
      for (const e of list) {
        if (!e?.id) continue
        const created = parseResendTime(e.created_at)
        const item: Listed = { id: String(e.id), from: String(e.from || ''), to: ([] as any[]).concat(e.to || [], e.cc || []).map(String), subject: String(e.subject || ''), created, messageId: normId(e.message_id) }
        idx.list.push(item)
        if (item.messageId && !idx.byId.has(item.messageId)) idx.byId.set(item.messageId, item.id)
        if (Number.isFinite(created) && !(created >= idx.oldest)) idx.oldest = created
      }
      if (!j?.has_more || !list.length) { idx.complete = true; break }
      if (Number.isFinite(idx.oldest) && idx.oldest < sinceMs) { idx.complete = true; break }
      after = String(list[list.length - 1].id)
    } catch (e: any) { idx.error = e?.message || 'Resend list failed'; break }
  }
  return idx
}

/**
 * The listed email that is this row when its Message-ID didn't match: same
 * sender, sent to this business, same subject (ignoring Re:/Fwd:), received
 * within 10 minutes of when the row was stored. The closest in time wins.
 */
export function matchListed(list: Listed[], row: { from: string; allowed: Set<string>; subject: string | null; at: number }, windowMs = 10 * 60_000): Listed | null {
  const want = normSubject(row.subject)
  let best: Listed | null = null
  for (const e of list) {
    if (!Number.isFinite(e.created) || Math.abs(e.created - row.at) > windowMs) continue
    if (row.from && addrOf(e.from) !== row.from) continue
    if (row.allowed.size && e.to.length && !e.to.some(a => row.allowed.has(addrOf(a)))) continue
    if (want && want !== '(no subject)' && normSubject(e.subject) !== want) continue
    if (!best || Math.abs(e.created - row.at) < Math.abs(best.created - row.at)) best = e
  }
  return best
}

const gmailSearchUrl = (account: string | null | undefined, messageId: string | null | undefined) => {
  const id = normId(messageId)
  if (!id) return null
  return `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : 'u/0/'}#search/${encodeURIComponent(`rfc822msgid:${id}`)}`
}

/**
 * Find this email in a connected Gmail mailbox (the same email often reaches
 * both: a support address in Gmail that also forwards to Colvy, or a customer
 * who copied both). By Message-ID first, else by sender + subject within
 * 10 minutes. Returns the body, or null.
 */
async function fromGmail(channel: any, row: { messageId: string | null; from: string; subject: string | null; at: number }, o: { fetchImpl: typeof fetch; token: (ch: any) => Promise<string | null> }): Promise<{ gmailId: string; text: string; html: string } | null> {
  const token = await o.token(channel)
  if (!token) return null
  const auth = { Authorization: `Bearer ${token}` }
  const queries: string[] = []
  const id = normId(row.messageId)
  if (id) queries.push(`rfc822msgid:${id}`)
  if (row.from) {
    const day = 86400
    const sec = Math.floor(row.at / 1000)
    const subj = String(row.subject || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').replace(/"/g, '').trim()
    queries.push(`from:${row.from}${subj ? ` subject:"${subj}"` : ''} after:${sec - day} before:${sec + day}`)
  }
  for (const q of queries) {
    try {
      const res = await o.fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10&includeSpamTrash=true`, { headers: auth })
      if (!res.ok) continue
      const j: any = await res.json().catch(() => null)
      for (const m of (j?.messages || []).slice(0, 10)) {
        const r = await o.fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=full`, { headers: auth })
        if (!r.ok) continue
        const full: any = await r.json().catch(() => null)
        if (!full?.payload) continue
        const hdr = (n: string) => String((full.payload.headers || []).find((h: any) => String(h.name || '').toLowerCase() === n)?.value || '')
        const byId = !!id && normId(hdr('message-id')) === id
        const near = Math.abs((Number(full.internalDate) || 0) - row.at) <= 10 * 60_000
        const sameFrom = !row.from || addrOf(hdr('from')) === row.from
        if (!byId && !(near && sameFrom)) continue
        return { gmailId: String(full.id || m.id), text: extractBody(full.payload), html: findPart(full.payload, 'text/html') }
      }
    } catch { /* try the next query */ }
  }
  return null
}

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
  /** Access token for a Gmail channel (tests); defaults to lib/gmail's refreshing getter. */
  gmailToken?: (channel: any) => Promise<string | null>
} = {}): Promise<BackfillResult> {
  const f = o.fetchImpl || fetch
  const days = Math.min(Math.max(Number(o.days) || 30, 1), 90)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const max = Math.min(Math.max(Number(o.limit) || 2000, 1), 5000)
  const pageSize = Math.min(Math.max(Number(o.pageSize) || 200, 1), 500)
  const out: BackfillResult = { scanned: 0, candidates: 0, filled: 0, rethreaded: 0, notFound: 0, stillEmpty: 0, fromGmail: 0, alreadyInColvy: 0, dryRun: !!o.dryRun, rows: [] }

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
  const channelsOf = new Map<string, any[]>()
  const inboxOf = async (companyId: string) => {
    if (inboxes.has(companyId)) return inboxes.get(companyId)!
    const set = new Set<string>()
    const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    if (co?.slug) set.add(companyAlias(co.slug))
    const { data: chs } = await db.from('email_channels').select('*').eq('company_id', companyId)
    channelsOf.set(companyId, chs || [])
    for (const c of chs || []) for (const a of [c.inbound_address, c.from_address]) if (a) set.add(String(a).toLowerCase())
    inboxes.set(companyId, set)
    return set
  }
  const gmailToken = o.gmailToken || getGmailToken
  const retentionCutoff = Date.now() - RESEND_RETENTION_DAYS * 86400000

  // Read Resend's received list back to just before the oldest row (and no further).
  const oldestRow = Math.min(...todo.map(m => Date.parse(String(m.created_at))).filter(Number.isFinite))
  let index: ResendIndex | null = null
  const getIndex = async () => {
    if (!index) {
      index = await resendIndex((Number.isFinite(oldestRow) ? oldestRow : Date.parse(since)) - 15 * 60_000, f)
      out.resendIndex = { pages: index.pages, oldest: Number.isFinite(index.oldest) ? new Date(index.oldest).toISOString() : null, complete: index.complete, ...(index.error ? { error: index.error } : {}) }
    }
    return index
  }

  for (const m of todo) {
    const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {}
    const at = Date.parse(String(m.created_at))
    const allowedTo = new Set(await inboxOf(m.company_id))
    for (const a of String(m.email_to || '').split(',')) if (a.trim()) allowedTo.add(addrOf(a))
    const chans = channelsOf.get(m.company_id) || []
    const gmailChans = chans.filter((c: any) => c.provider === 'gmail' && (c.refresh_token || c.access_token))
    const rowTo = String(m.email_to || '').split(',').map(addrOf).filter(Boolean)
    const sender = String(m.sender_email || (m.email_from ? addrOf(m.email_from) : '') || '').toLowerCase()
    // Where it most likely came from: our webhook stamps the provider; older
    // rows are judged by the address they were sent to.
    const viaGmailAddr = gmailChans.find((c: any) => rowTo.includes(String(c.inbound_address || '').toLowerCase()))
    const provider: ProviderGuess = meta.inbound_email?.provider === 'resend' ? 'resend'
      : meta.inbound_email?.provider === 'webhook' ? 'other-webhook'
      : rowTo.some(a => a.endsWith('@' + INBOUND_DOMAIN)) ? 'resend'
      : viaGmailAddr ? 'gmail'
      : 'unknown'
    const detail = (outcome: string, reason: string, extra: Partial<BackfillRow> = {}): BackfillRow => ({
      id: m.id, conversationId: m.conversation_id, outcome, date: m.created_at, from: m.email_from || m.sender_email || null,
      to: m.email_to || null, subject: m.email_subject || null, provider, reason,
      gmailUrl: gmailChans.length ? gmailSearchUrl((viaGmailAddr || gmailChans[0]).inbound_address, m.email_message_id) : null, ...extra,
    })

    let emailId: string | null = meta.inbound_email?.resend_email_id || null
    let matchedBy = emailId ? 'resend-id' : ''
    if (!emailId) {
      const idx = await getIndex()
      const id = normId(m.email_message_id)
      if (id && idx.byId.has(id)) { emailId = idx.byId.get(id)!; matchedBy = 'message-id' }
      if (!emailId && Number.isFinite(at)) {
        const hit = matchListed(idx.list, { from: sender, allowed: allowedTo, subject: m.email_subject || null, at })
        if (hit) { emailId = hit.id; matchedBy = 'sender+subject+time' }
      }
    }
    if (!emailId) {
      // Not on Resend. A readable copy already in Colvy (Gmail sync imported it too)?
      const ids = m.email_message_id ? idVariants([String(m.email_message_id), `<${normId(m.email_message_id)}>`, normId(m.email_message_id)]) : []
      if (ids.length) {
        const { data: copies } = await db.from('messages').select('id, conversation_id, content, email_html, gmail_message_id')
          .eq('company_id', m.company_id).in('email_message_id', ids).limit(5)
        const copy = (copies || []).find((c: any) => c.id !== m.id && (!blank(c.content) || c.email_html))
        if (copy) {
          out.alreadyInColvy++
          out.rows.push(detail('already-in-colvy', copy.gmail_message_id ? 'Gmail sync already brought this email in, with its text. This empty row is a duplicate.' : 'The same email is already in Colvy with its text. This empty row is a duplicate.', { copyConversationId: copy.conversation_id, provider: copy.gmail_message_id ? 'gmail' : provider }))
          continue
        }
      }
      // Try the business's connected Gmail.
      for (const ch of gmailChans) {
        const g = await fromGmail(ch, { messageId: m.email_message_id || null, from: sender, subject: m.email_subject || null, at }, { fetchImpl: f, token: gmailToken }).catch(() => null)
        if (!g) continue
        const split = splitQuoted(g.text || htmlToPlain(g.html))
        const html = g.html ? sanitizeEmailHtml(g.html) : ''
        if (!split.reply && !html) continue
        out.filled++; out.fromGmail++
        if (!o.dryRun) {
          const patch: any = {
            content: split.reply, email_html: html || null, email_quoted: split.quoted || null,
            metadata: { ...meta, inbound_email: { ...(meta.inbound_email || {}), body: 'backfilled', backfilled_from: 'gmail', gmail_message_id: g.gmailId, backfilled_at: new Date().toISOString() } },
          }
          const { error: upErr } = await db.from('messages').update(patch).eq('id', m.id)
          if (upErr) { delete patch.email_quoted; delete patch.metadata; await db.from('messages').update(patch).eq('id', m.id) }
          const { data: conv } = await db.from('conversations').select('id, last_message').eq('id', m.conversation_id).maybeSingle()
          if (conv && blank(conv.last_message)) await db.from('conversations').update({ last_message: emailPreview(split.reply, 0, m.email_subject) }).eq('id', m.conversation_id)
        }
        out.rows.push(detail('filled-from-gmail', `Not on Resend, but found in ${ch.inbound_address || 'the connected Gmail'}.`, { matchedBy: 'gmail', provider: provider === 'unknown' ? 'gmail' : provider }))
        emailId = 'gmail'
        break
      }
      if (emailId === 'gmail') continue

      // Why it couldn't be found, in words the owner can act on.
      const idx = index as ResendIndex | null
      const when = Number.isFinite(at) ? new Date(at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }) : 'an unknown date'
      let code = 'no-match', reason = ''
      if (provider === 'other-webhook') { code = 'not-resend'; reason = 'It came through another provider’s webhook (not Resend), so Resend never had it.' }
      else if (idx?.error) { code = 'resend-unavailable'; reason = `Couldn’t read Resend’s received list (${idx.error}).` }
      else if (Number.isFinite(at) && at < retentionCutoff) { code = 'past-retention'; reason = `It arrived on ${when}. Resend only keeps received emails for ${RESEND_RETENTION_DAYS} days, so it has been deleted there.` }
      else if (idx && !idx.complete && Number.isFinite(idx.oldest) && at < idx.oldest) { code = 'list-cut-short'; reason = `Resend’s list was only read back to ${new Date(idx.oldest).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })}; run it again for a shorter period.` }
      else if (provider === 'gmail') { code = 'gmail-only'; reason = 'It was sent to a Gmail address, not through Resend, and Gmail search didn’t find it either.' }
      else reason = `Resend has no email from ${sender || 'this sender'}${m.email_message_id ? ' with this Message-ID' : ''}${m.email_subject ? ' or this subject' : ''} within 10 minutes of ${when}.${gmailChans.length ? ' Gmail didn’t have it either.' : ''}`
      out.notFound++
      out.rows.push(detail('not-found-on-resend', reason, { matchedBy: code }))
      continue
    }

    const raw: ReceivedEmail | null = await fetchResendReceivedEmail(emailId, { fetchImpl: f, delaysMs: o.retryDelaysMs })
    const full = readReceived(raw)
    if (!full) { out.notFound++; out.rows.push(detail('fetch-failed', 'Resend listed this email but wouldn’t return it (it may have just passed its retention period). Try again later.', { matchedBy })); continue }
    const stamp = (body: string) => ({ ...meta, inbound_email: { ...(meta.inbound_email || {}), provider: 'resend', resend_email_id: emailId, body, auth: full.auth, backfilled_at: new Date().toISOString() } })

    // It must be the same email: from this row's sender, to this business.
    const fromOk = !m.sender_email || !full.from || addrOf(full.from) === String(m.sender_email).toLowerCase()
    const toOk = !full.to.length || full.to.some(a => allowedTo.has(addrOf(a)))
    if (!fromOk || !toOk) {
      out.notFound++
      out.rows.push(detail('mismatch', `Resend’s email ${matchedBy === 'message-id' ? 'with this Message-ID' : 'that looked like it'} is from ${addrOf(full.from) || 'someone else'} to ${full.to.map(addrOf).join(', ') || 'another address'}, not this business, so it wasn’t used.`, { matchedBy }))
      if (!o.dryRun) await db.from('messages').update({ metadata: stamp('mismatch') }).eq('id', m.id)
      continue
    }

    const split = splitQuoted(full.text || htmlToPlain(full.html))
    const html = full.html ? sanitizeEmailHtml(full.html) : ''
    if (!split.reply && !html) {
      out.stillEmpty++
      out.rows.push(detail('email-has-no-body', 'Resend has this email, and it really has no text.', { matchedBy }))
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
        if (files.length) patch.email_attachments = files.map(a => ({ name: a.name, mime: a.type, url: a.url, ...(a.size ? { size: a.size } : {}) }))
      }
      const { error: upErr } = await db.from('messages').update(patch).eq('id', m.id)
      if (upErr) { delete patch.email_quoted; delete patch.metadata; await db.from('messages').update(patch).eq('id', m.id) }
      if (patch.email_attachments) scheduleMessageThumbs(db, m.id, patch.email_attachments, { field: 'email_attachments', prefixes: [`/ticket-attachments/${m.company_id}/`] })
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
    out.rows.push({ ...detail(outcome, 'Found on Resend.', { matchedBy }), gmailUrl: null })
  }
  return out
}
