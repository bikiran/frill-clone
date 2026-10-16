import { emailWebhookTrust } from '@/lib/email-webhook'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { runKeywordReply } from '@/lib/keyword-reply'
import { passesRules, sanitizeEmailHtml } from '@/lib/gmail'
import { logWebhookEvent } from '@/lib/webhook-log'
import { logEnquiryReopened } from '@/lib/conversation-timeline'
import { parseInboundAlias } from '@/lib/inbound-alias'
import { fetchResendReceivedEmail, readReceived, hostResendAttachments as hostResendFiles, findEmailThread, splitQuoted, htmlToPlain, emailPreview, parseMessageIds, idVariants } from '@/lib/inbound-email'
import { emitInboundEvent } from '@/lib/integration-hooks'
import { scheduleMessageThumbs } from '@/lib/image-thumb'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Inbound email → Colvy conversation.
//
// Provider-agnostic: accepts the payload shapes used by Resend inbound,
// Postmark, Mailgun, SendGrid and Cloudflare Email Routing. Point your provider's
// inbound webhook at:  https://colvy.com/api/webhooks/email
//
// The company is resolved from the address the mail was sent TO, matched against
// email_channels.inbound_address.

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), obj)
    if (v != null && v !== '') return v
  }
  return null
}

// Normalise "Name <a@b.com>" → { name, email }
function parseAddress(raw: any): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null }
  if (typeof raw === 'object') {
    // Postmark/Resend style objects, or arrays of them.
    const one = Array.isArray(raw) ? raw[0] : raw
    if (!one) return { name: null, email: null }
    return {
      name: one.Name || one.name || null,
      email: (one.Email || one.email || one.address || '').toLowerCase() || null,
    }
  }
  const s = String(raw)
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: s.trim().toLowerCase() }
}

// Resend inbound webhooks carry only attachment METADATA, not content; the
// files are downloaded from the Attachments API and kept on our own R2.
async function hostResendAttachments(evt: any, companyId: string): Promise<any[]> {
  return hostResendFiles(pick(evt, 'email_id', 'id', 'emailId'), companyId, evt?.attachments || evt?.Attachments || null)
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    // Only the mail provider (see lib/email-webhook.ts). With a secret set the
    // signature must match; with none set the payload is untrusted (below).
    const trust = emailWebhookTrust(req, raw)
    if (trust === 'refused') return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    let body: any = {}
    try { body = JSON.parse(raw || '{}') } catch { body = {} }
    const db = admin()

    // Resend inbound (email.received) nests the message under `data`; other
    // providers post it at the top level. Unwrap so the picks below work for all.
    let evt: any = (body?.data && typeof body.data === 'object' && /email|inbound|received/i.test(String(body?.type || ''))) ? body.data : body

    // ── Unverified payload: trust nothing in it but the email id ─────────────
    // Anyone can post here when no signing secret is configured. So only the
    // email_id is taken from the payload; who it's from and to, the subject,
    // Message-ID, body and files all come from Resend's own copy of the email,
    // which only exists if Resend really received it. No id, or Resend doesn't
    // have it → dropped. Other providers' unsigned payloads are refused in
    // production (they can set EMAIL_WEBHOOK_TOKEN).
    let prefetched: any = null
    if (trust === 'unverified') {
      const claimedId = pick(evt, 'email_id', 'emailId') || (/email\.received/i.test(String(body?.type || '')) ? pick(evt, 'id') : null)
      const prod = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
      if (!claimedId) {
        if (prod) {
          logWebhookEvent({ source: 'email', eventType: 'inbound', status: 'rejected', error: 'Unsigned payload without a Resend email id' })
          return NextResponse.json({ error: 'Unsigned inbound email refused: set EMAIL_WEBHOOK_TOKEN for this provider' }, { status: 401 })
        }
      } else {
        prefetched = await fetchResendReceivedEmail(String(claimedId))
        if (!prefetched) {
          logWebhookEvent({ source: 'email', eventType: 'inbound', status: 'rejected', error: 'Unverified payload: email not found on Resend' })
          return NextResponse.json({ ok: false, reason: 'Unverified webhook and Resend has no such email' })
        }
        evt = {
          email_id: String(prefetched.id || claimedId), from: prefetched.from, to: prefetched.to, cc: prefetched.cc,
          subject: prefetched.subject, message_id: prefetched.message_id, created_at: prefetched.created_at,
          attachments: Array.isArray(prefetched.attachments) ? prefetched.attachments : [],
        }
        body = { type: 'email.received' }   // the rest of the payload is discarded
      }
    }

    // ── Extract the essentials across provider shapes ────────────────────────
    const toRaw = pick(evt, 'to', 'To', 'recipient', 'ToFull', 'envelope.to')
    const ccRaw = pick(evt, 'cc', 'Cc', 'CcFull')
    const fromRaw = pick(evt, 'from', 'From', 'sender', 'FromFull', 'envelope.from')
    const subject = pick(evt, 'subject', 'Subject') || '(no subject)'
    let textBody = pick(evt, 'text', 'TextBody', 'body-plain', 'plain', 'stripped-text') || ''
    let htmlBody = pick(evt, 'html', 'HtmlBody', 'body-html') || ''
    let messageId = pick(evt, 'message_id', 'MessageID', 'Message-Id', 'messageId', 'headers.message-id')
    let inReplyTo = pick(evt, 'in_reply_to', 'In-Reply-To', 'headers.in-reply-to', 'InReplyTo')
    let threadIds: string[] = parseMessageIds(inReplyTo, pick(evt, 'references', 'References', 'headers.references'))
    // When OUR provider received it (Resend's created_at). A sender-written
    // Date header can say anything, so it isn't used.
    const serverTime = (v: any) => { const t = v ? Date.parse(String(v)) : NaN; return Number.isFinite(t) && t > Date.parse('2000-01-01') ? new Date(t).toISOString() : null }
    let receivedAt: string | null = serverTime(pick(evt, 'created_at')) || serverTime(pick(body, 'created_at'))

    // Resend's email.received webhook is METADATA ONLY: no body, no
    // In-Reply-To/References, no attachment files. Fetch the received email
    // from the Receiving API (with retries) so the reply isn't stored empty and
    // can be threaded onto the conversation we sent the original from.
    const resendEmailId: string | null = pick(evt, 'email_id', 'emailId') || (/email\.received/i.test(String(body?.type || '')) ? pick(evt, 'id') : null)
    let bodyFetch: 'payload' | 'fetched' | 'unavailable' = (textBody || htmlBody) ? 'payload' : 'unavailable'
    // DKIM / DMARC result for the sender: only a verified sender may be threaded
    // onto an existing conversation by subject alone.
    let auth: 'pass' | 'fail' | 'unknown' = 'unknown'

    // A webhook Resend delivers again (retries, replays) is answered before
    // anything is fetched. (V389 adds a unique index on this id as a backstop.)
    if (resendEmailId) {
      const { data: seen } = await db.from('messages').select('id, conversation_id, content, email_html')
        .eq('metadata->inbound_email->>resend_email_id', String(resendEmailId)).limit(1)
      const s0 = seen?.[0]
      if (s0 && (String(s0.content || '').trim() || s0.email_html)) return NextResponse.json({ ok: true, duplicate: true, conversationId: s0.conversation_id })
    }

    if (resendEmailId && (prefetched || (!textBody && !htmlBody))) {
      const full = readReceived(prefetched || await fetchResendReceivedEmail(String(resendEmailId)))
      if (full) {
        auth = full.auth
        textBody = full.text || ''
        htmlBody = full.html || ''
        messageId = messageId || full.messageId
        inReplyTo = inReplyTo || full.inReplyTo
        threadIds = Array.from(new Set([...threadIds, ...full.threadIds]))
        receivedAt = receivedAt || serverTime(full.receivedAt)
        if (!Array.isArray(evt.attachments)) evt.attachments = full.attachments
        bodyFetch = 'fetched'
      }
    }
    if (inReplyTo && !threadIds.length) threadIds = parseMessageIds(inReplyTo)

    const to = parseAddress(Array.isArray(toRaw) ? toRaw[0] : toRaw)
    const from = parseAddress(fromRaw)

    if (!from.email) {
      // Always 200 so providers don't retry/disable the webhook.
      return NextResponse.json({ ok: false, reason: 'Missing from address' })
    }

    // What the customer wrote, without the history their mail app quoted below it.
    const plain = String(textBody || '') || htmlToPlain(String(htmlBody || ''))
    const split = splitQuoted(plain)
    const content = split.reply
    const emailQuoted = split.quoted

    // ── Colvy inbound-alias routing (reply.colvy.com) ────────────────────────
    // Check every recipient (To + Cc — a forwarded mail can carry several) for a
    // Colvy alias, then resolve it to a real row. This is the multi-tenant router:
    // a friendly alias (ticket-046216@ / <slug>@) says which ticket or tenant the
    // mail belongs to, with no MX changes on the customer's side.
    const recipientEmails: string[] = []
    for (const raw of [toRaw, ccRaw]) {
      const arr = Array.isArray(raw) ? raw : [raw]
      for (const one of arr) { const p = parseAddress(one); if (p.email) recipientEmails.push(p.email) }
    }
    let ticket: any = null
    let aliasCompanyId: string | null = null
    for (const e of recipientEmails) {
      const a = parseInboundAlias(e)
      if (!a) continue
      if (a.kind === 'ticket') {
        // Resolve the visible number (e.g. "046216" → TICK-046216). Ticket numbers
        // aren't globally unique, so when several match, prefer the one whose
        // requester is the sender, else the most recently updated.
        const tnum = `TICK-${a.ref}`.toUpperCase()
        const { data: cands } = await db.from('support_tickets').select('*').ilike('ticket_number', tnum).order('updated_at', { ascending: false }).limit(25)
        const list = cands || []
        ticket = list.find((t: any) => String(t.email || '').toLowerCase() === from.email)
          || list.find((t: any) => { const m = /<([^>]+)>/.exec(String(t.description || '')); return !!m && m[1].toLowerCase() === from.email })
          || list[0] || null
        if (ticket) break
      } else if (a.kind === 'company') {
        const { data: co } = await db.from('companies').select('id').eq('slug', a.ref).maybeSingle()
        if (co?.id) { aliasCompanyId = co.id; break }
      }
    }

    // Ticket alias → append the customer's reply straight onto the ticket thread.
    if (ticket) {
      // The same reply delivered twice lands once.
      const { data: again } = await db.from('ticket_messages').select('id')
        .eq('ticket_id', ticket.id).eq('direction', 'in').eq('body', content)
        .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString()).limit(1)
      if (content && again?.length) return NextResponse.json({ ok: true, duplicate: true, routed: 'ticket', ticketId: ticket.id })
      const ticketAtts = await hostResendAttachments(evt, ticket.company_id)
      await db.from('ticket_messages').insert({
        ticket_id: ticket.id, company_id: ticket.company_id, kind: 'reply', direction: 'in',
        body: content, author_name: from.name || from.email, emailed: false,
        attachments: ticketAtts,
      })
      const patch: any = { updated_at: new Date().toISOString() }
      if (['resolved', 'closed'].includes(String(ticket.status || ''))) { patch.status = 'open'; patch.resolved_at = null }
      { const { error: tuErr } = await db.from('support_tickets').update(patch).eq('id', ticket.id)
        // Before migration V322 resolved_at doesn't exist — reopen anyway.
        if (tuErr && 'resolved_at' in patch) { delete patch.resolved_at; await db.from('support_tickets').update(patch).eq('id', ticket.id) } }
      // Mirror into the linked inbox conversation too, if the ticket has one.
      if (ticket.conversation_id) {
        try {
          const { data: ticketMsg } = await db.from('messages').insert({
            conversation_id: ticket.conversation_id, company_id: ticket.company_id, sender_type: 'visitor', sender_name: from.name || from.email, sender_email: from.email, content, email_message_id: messageId || null, email_in_reply_to: inReplyTo || null,
            delivery_channel: 'email', email_from: from.name ? `${from.name} <${from.email}>` : from.email, email_subject: subject,
            email_html: htmlBody ? sanitizeEmailHtml(String(htmlBody)) || null : null,
            email_attachments: ticketAtts.map((a: any) => ({ name: a.name, mime: a.type, url: a.url })),
            ...(resendEmailId ? { metadata: { inbound_email: { provider: 'resend', resend_email_id: String(resendEmailId), body: bodyFetch, auth } } } : {}),
          }).select('id').maybeSingle()
          // Small copies of photos for the inbox tiles, after the response.
          scheduleMessageThumbs(db, ticketMsg?.id, ticketAtts.map((a: any) => ({ mime: a.type, url: a.url })), { field: 'email_attachments', prefixes: [`/ticket-attachments/${ticket.company_id}/`] })
          await db.from('conversations').update({ last_message: emailPreview(content, ticketAtts.length, subject), last_message_at: new Date().toISOString(), is_unread: true, status: 'open' }).eq('id', ticket.conversation_id)
        } catch {}
      }
      try { await notifyCompany({ db, companyId: ticket.company_id, type: 'ticket', message: `Reply on ${ticket.ticket_number} from ${from.name || from.email}`, actorName: from.name || from.email }) } catch {}
      logWebhookEvent({ source: 'email', eventType: 'inbound-ticket', companyId: ticket.company_id, payload: { ticket: ticket.ticket_number, from: from.email } })
      return NextResponse.json({ ok: true, routed: 'ticket', ticketId: ticket.id })
    }

    // ── Resolve the company/mailbox ──────────────────────────────────────────
    // Company alias (a forwarded support address, or the reply-to on inbox email
    // threads) resolves by company; otherwise match the address the mail was sent
    // TO against a configured inbound mailbox.
    let channel: any = null
    let companyId: string | null = null
    if (aliasCompanyId) {
      companyId = aliasCompanyId
      const { data: chs } = await db.from('email_channels').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      channel = chs?.[0] || { company_id: companyId, provider: 'webhook', from_address: null, from_name: null, inbound_address: null }
    } else {
      if (!to.email) return NextResponse.json({ ok: false, reason: 'Missing to address' })
      const { data: channels } = await db.from('email_channels').select('*').ilike('inbound_address', to.email).eq('is_active', true).limit(1)
      channel = channels?.[0]
      if (!channel) return NextResponse.json({ ok: false, reason: `No email channel configured for ${to.email}` })
      companyId = channel.company_id
    }

    // Record the event for the Super Admin webhook explorer (best-effort).
    logWebhookEvent({ source: 'email', eventType: 'inbound', companyId, payload: { from: from.email, to: to.email, subject, messageId } })

    // Respect this mailbox's allow/block rules before importing anything.
    if (!(await passesRules(db, channel, from.email))) {
      return NextResponse.json({ ok: false, reason: 'Sender filtered by an email rule' })
    }

    // Keep the email as an email: its files (a reply that's only a photo or a
    // video has no text at all) and its formatted body. Without these a
    // photo-only reply landed as an empty "Live Chat" bubble.
    const isForm = channel.provider === 'webform'
    const emailAtts = await hostResendAttachments(evt, companyId as string)
    const emailHtml = htmlBody ? sanitizeEmailHtml(String(htmlBody)) : ''
    // Never blank: a blank last_message reads "No messages yet" in the list.
    const preview = emailPreview(content, emailAtts.length, subject)

    // ── Find-or-create the contact ───────────────────────────────────────────
    let contact: any = null
    const { data: existingContacts } = await db.from('contacts').select('*')
      .eq('company_id', companyId).ilike('email', from.email).limit(1)
    contact = existingContacts?.[0] || null
    if (!contact) {
      const { data: created } = await db.from('contacts').insert({
        company_id: companyId, name: from.name || from.email, email: from.email,
      }).select().maybeSingle()
      contact = created
    }

    // ── Already have this email? (provider retries, a re-sent webhook) ───────
    if (messageId) {
      const { data: dup } = await db.from('messages').select('id, conversation_id, content, email_html')
        .eq('company_id', companyId).in('email_message_id', idVariants([String(messageId)])).eq('sender_type', 'visitor').limit(1)
      const d = dup?.[0]
      if (d) {
        // Fill in a body an earlier delivery stored empty; never insert twice.
        if (!String(d.content || '').trim() && !d.email_html && (content || htmlBody)) {
          await db.from('messages').update({ content, email_html: emailHtml || null, email_quoted: emailQuoted || null }).eq('id', d.id)
          await db.from('conversations').update({ last_message: preview }).eq('id', d.conversation_id)
        }
        return NextResponse.json({ ok: true, duplicate: true, conversationId: d.conversation_id })
      }
    }

    // ── Thread into an existing conversation, else create one ────────────────
    // In-Reply-To/References → the message we sent (or received) with that id;
    // else the same subject (ignoring "Re:") on one of this customer's recent
    // conversations — a reply to an automated "Update on your order #…" lands
    // on that order's conversation instead of starting an empty new one.
    let conv: any = null
    let threadedVia: string | null = null
    // By Message-ID: only onto this sender's own conversation. By subject: only
    // when DKIM/DMARC say the sender is who they claim to be.
    const found = await findEmailThread(db, { companyId: companyId as string, contactId: contact?.id || null, ids: threadIds, subject: auth === 'pass' && /^\s*re\s*:/i.test(subject) ? subject : null })
    if (found?.conv) { conv = found.conv; threadedVia = found.via }
    // A sender that failed DKIM and DMARC gets its own conversation, marked unverified.
    if (!conv && contact?.id && auth !== 'fail') {
      // Fall back to the contact's most recent open email conversation.
      const { data: recent } = await db.from('conversations').select('*')
        .eq('company_id', companyId).eq('contact_id', contact.id).eq('channel', 'email')
        .eq('status', 'open').order('last_message_at', { ascending: false }).limit(1)
      conv = recent?.[0] || null
    }
    if (!conv) {
      // Web-form addresses (provider 'webform') are inbound-only form channels —
      // label their conversations as 'form' so they read correctly in the inbox.
      const convChannel = channel.provider === 'webform' ? 'form' : 'email'
      const { data: newConv } = await db.from('conversations').insert({
        company_id: companyId, channel: convChannel, subject,
        email_subject: subject, email_message_id: messageId || null,
        // Which mailbox it arrived at, and which outlet owns that mailbox — so
        // replies go back out from the right address.
        email_channel_id: channel.id,
        assigned_location_id: channel.location_id || null,
        contact_id: contact?.id || null, status: 'open',
        is_unread: true, unread_count: 1,
        last_message: preview, last_message_at: new Date().toISOString(),
      }).select().maybeSingle()
      conv = newConv
    }
    if (!conv) return NextResponse.json({ ok: false, reason: 'Could not create conversation' })

    // Customer replied to a closed enquiry — log the reopen before we flip it.
    await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: from?.name || from?.email || null, via: 'email' })

    // ── Store the message ────────────────────────────────────────────────────
    const msgRow: any = {
      conversation_id: conv.id, company_id: companyId,
      sender_type: 'visitor',
      sender_name: from.name || from.email,
      sender_email: from.email,
      content,
      email_message_id: messageId || null,
      email_in_reply_to: inReplyTo || null,
      // Without a delivery_channel the column default ('chat') applied, so the
      // inbox labelled customer emails "Live Chat" and drew them as chat
      // bubbles. Web-form mailboxes keep the old behaviour (replies to a form
      // aren't sent by email from here).
      ...(isForm ? {} : {
        delivery_channel: 'email',
        email_from: from.name ? `${from.name} <${from.email}>` : from.email,
        email_to: recipientEmails.join(', ') || to.email || null,
        email_subject: subject,
        email_html: emailHtml || null,
        email_quoted: emailQuoted || null,
        email_attachments: emailAtts.map(a => ({ name: a.name, mime: a.type, url: a.url, ...(a.size ? { size: a.size } : {}) })),
      }),
      // The Resend id lets the body backfill re-fetch this email later.
      metadata: { inbound_email: { provider: resendEmailId ? 'resend' : 'webhook', ...(resendEmailId ? { resend_email_id: String(resendEmailId) } : {}), body: bodyFetch, auth, ...(auth === 'fail' ? { unverified: true } : {}), ...(receivedAt ? { received_at: receivedAt } : {}), ...(threadedVia ? { threaded_via: threadedVia } : {}) } },
    }
    {
      const { data: inserted, error: insErr } = await db.from('messages').insert(msgRow).select('id').maybeSingle()
      // Stored already (two deliveries at once; V389's unique index caught it).
      if (insErr && String(insErr.code) === '23505') return NextResponse.json({ ok: true, duplicate: true, conversationId: conv.id })
      let storedId: string | null = inserted?.id || null
      // A database without email_quoted / metadata must still get the email.
      if (insErr) {
        console.warn('[email webhook] message insert retry without optional columns', insErr.message)
        delete msgRow.metadata; delete msgRow.email_quoted
        const { data: retried } = await db.from('messages').insert(msgRow).select('id').maybeSingle()
        storedId = retried?.id || null
      }
      // Small copies of photos for the inbox tiles — made after the response,
      // from the files we just stored in this company's folder.
      scheduleMessageThumbs(db, storedId, msgRow.email_attachments, { field: 'email_attachments', prefixes: [`/ticket-attachments/${companyId}/`] })
    }
    await emitInboundEvent(db, { companyId, conversationId: conv.id, text: content || preview, channel: 'email', name: from.name || null, email: from.email || null })

    // The Support / Reception Agent, if switched on for email — queued for the
    // agent worker. Ticket replies stay with the ticket.
    // It answers by EMAIL whatever the conversation's own channel (an email can
    // thread onto an order or SMS conversation), under the email agent settings.
    // Not for a sender that failed DKIM/DMARC.
    if (!/\[TICK-\d+\]/i.test(subject || '') && auth !== 'fail') {
      const convId = conv.id
      after(async () => {
        try { const { startSupportAgentForConversation } = await import('@/lib/agent/inbound'); await startSupportAgentForConversation(db, convId, { debounceMs: 0, run: false, channel: 'email' }) } catch (e) { console.warn('[agent] email inbound', e) }
      })
    }

    await db.from('conversations').update({
      last_message: preview,
      last_message_at: new Date().toISOString(),
      is_unread: true,
      // An inbound message reopens a closed enquiry — the customer is back.
      status: 'open',
      unread_count: (conv.unread_count || 0) + 1,
    }).eq('id', conv.id)

    // ── Route ticket replies back into the ticket ────────────────────────────
    // Agent ticket replies go out with "[TICK-######]" in the subject; when the
    // customer replies, that tag survives on the "Re:" subject, so we can thread
    // their reply straight back onto the ticket (not just the inbox). Best-effort
    // — a failure here must never break normal inbound-email handling.
    try {
      const m = /\[(TICK-\d+)\]/i.exec(subject || '')
      if (m) {
        const ticketNumber = m[1].toUpperCase()
        const { data: ticket } = await db.from('support_tickets')
          .select('id, status, conversation_id').eq('company_id', companyId).eq('ticket_number', ticketNumber).maybeSingle()
        if (ticket?.id) {
          const ticketAtts = emailAtts
          await db.from('ticket_messages').insert({
            ticket_id: ticket.id, company_id: companyId,
            kind: 'reply', direction: 'in', body: content,
            author_name: from.name || from.email, emailed: false,
            attachments: ticketAtts,
          })
          // Reopen a resolved/closed ticket (the customer is back), link the
          // conversation for cross-navigation, and bump it to the top.
          const patch: any = { updated_at: new Date().toISOString() }
          if (['resolved', 'closed'].includes(String(ticket.status || ''))) { patch.status = 'open'; patch.resolved_at = null }
          if (!ticket.conversation_id) patch.conversation_id = conv.id
          { const { error: tuErr } = await db.from('support_tickets').update(patch).eq('id', ticket.id)
            // Before migration V322 resolved_at doesn't exist — reopen anyway.
            if (tuErr && 'resolved_at' in patch) { delete patch.resolved_at; await db.from('support_tickets').update(patch).eq('id', ticket.id) } }
        }
      }
    } catch (e) { console.error('[email webhook ticket route]', e) }

    // Answer common questions automatically — and EMAIL the answer back, in the
    // same thread, so the customer actually receives it.
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
      await runKeywordReply({
        conversationId: conv.id, text: content, companyId, channel: 'email',
        deliver: async (reply) => {
          if (!process.env.RESEND_API_KEY) return
          const fromAddress = channel.from_address || channel.inbound_address
          if (!fromAddress) return
          const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
          const fromName = channel.from_name || co?.name || 'Support'
          const headers: Record<string, string> = {}
          if (messageId) { headers['In-Reply-To'] = messageId; headers['References'] = messageId }
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `${fromName} <${fromAddress}>`,
              to: [from.email],
              subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
              text: reply,
              reply_to: channel.inbound_address || fromAddress,
              ...(Object.keys(headers).length ? { headers } : {}),
            }),
          })
        },
      })
    } catch (e) { console.error('[email keyword reply]', e) }

    try {
      await notifyCompany({
        db, companyId, type: 'email',
        message: `New email from ${from.name || from.email}: ${subject}`,
        actorName: from.name || from.email,
        conversationId: conv.id,
      })
    } catch {}

    // Push to the team's phones with conversationId so the notification carries
    // the Reply / Mark-read quick actions.
    try {
      await pushInboundMessage({
        companyId, conversationId: conv.id,
        title: `New email from ${from.name || from.email}`,
        body: subject || content.slice(0, 200) || 'New email',
      })
    } catch {}

    return NextResponse.json({ ok: true, conversationId: conv.id })
  } catch (e: any) {
    // Never 500 — providers disable webhooks that keep failing.
    console.error('[email webhook]', e)
    await logWebhookEvent({ source: 'email', status: 'error', error: e?.message })
    return NextResponse.json({ ok: false, error: e.message })
  }
}

// Some providers verify the endpoint with a GET.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Colvy inbound email' })
}
