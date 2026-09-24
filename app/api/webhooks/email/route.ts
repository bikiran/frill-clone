import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { runKeywordReply } from '@/lib/keyword-reply'
import { passesRules } from '@/lib/gmail'
import { logWebhookEvent } from '@/lib/webhook-log'
import { logEnquiryReopened } from '@/lib/conversation-timeline'
import { parseInboundAlias } from '@/lib/inbound-alias'

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

// Strip quoted history so the conversation shows just the new reply.
function stripQuoted(text: string): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^\s*(On .+ wrote:|-{2,}\s*Original Message|_{5,}|From:\s)/i.test(line)) break
    if (/^\s*>/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim() || text.trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = admin()

    // Resend inbound (email.received) nests the message under `data`; other
    // providers post it at the top level. Unwrap so the picks below work for all.
    const evt = (body?.data && typeof body.data === 'object' && /email|inbound|received/i.test(String(body?.type || ''))) ? body.data : body

    // ── Extract the essentials across provider shapes ────────────────────────
    const toRaw = pick(evt, 'to', 'To', 'recipient', 'ToFull', 'envelope.to')
    const ccRaw = pick(evt, 'cc', 'Cc', 'CcFull')
    const fromRaw = pick(evt, 'from', 'From', 'sender', 'FromFull', 'envelope.from')
    const subject = pick(evt, 'subject', 'Subject') || '(no subject)'
    const textBody = pick(evt, 'text', 'TextBody', 'body-plain', 'plain', 'stripped-text') || ''
    const htmlBody = pick(evt, 'html', 'HtmlBody', 'body-html') || ''
    const messageId = pick(evt, 'message_id', 'MessageID', 'Message-Id', 'messageId', 'headers.message-id')
    const inReplyTo = pick(evt, 'in_reply_to', 'In-Reply-To', 'headers.in-reply-to', 'InReplyTo')

    const to = parseAddress(Array.isArray(toRaw) ? toRaw[0] : toRaw)
    const from = parseAddress(fromRaw)

    if (!from.email) {
      // Always 200 so providers don't retry/disable the webhook.
      return NextResponse.json({ ok: false, reason: 'Missing from address' })
    }

    const content = stripQuoted(String(textBody)) || String(htmlBody).replace(/<[^>]+>/g, ' ').trim()

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
      await db.from('ticket_messages').insert({
        ticket_id: ticket.id, company_id: ticket.company_id, kind: 'reply', direction: 'in',
        body: content, author_name: from.name || from.email, emailed: false,
      })
      const patch: any = { updated_at: new Date().toISOString() }
      if (['resolved', 'closed'].includes(String(ticket.status || ''))) patch.status = 'open'
      await db.from('support_tickets').update(patch).eq('id', ticket.id)
      // Mirror into the linked inbox conversation too, if the ticket has one.
      if (ticket.conversation_id) {
        try {
          await db.from('messages').insert({ conversation_id: ticket.conversation_id, company_id: ticket.company_id, sender_type: 'visitor', sender_name: from.name || from.email, sender_email: from.email, content, email_message_id: messageId || null, email_in_reply_to: inReplyTo || null })
          await db.from('conversations').update({ last_message: content.slice(0, 200), last_message_at: new Date().toISOString(), is_unread: true, status: 'open' }).eq('id', ticket.conversation_id)
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

    // ── Thread into an existing conversation, else create one ────────────────
    let conv: any = null
    if (inReplyTo) {
      const { data: threaded } = await db.from('conversations').select('*')
        .eq('company_id', companyId).eq('email_message_id', inReplyTo).limit(1)
      conv = threaded?.[0] || null
    }
    if (!conv && contact?.id) {
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
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).select().maybeSingle()
      conv = newConv
    }
    if (!conv) return NextResponse.json({ ok: false, reason: 'Could not create conversation' })

    // Customer replied to a closed enquiry — log the reopen before we flip it.
    await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: from?.name || from?.email || null, via: 'email' })

    // ── Store the message ────────────────────────────────────────────────────
    await db.from('messages').insert({
      conversation_id: conv.id, company_id: companyId,
      sender_type: 'visitor',
      sender_name: from.name || from.email,
      sender_email: from.email,
      content,
      email_message_id: messageId || null,
      email_in_reply_to: inReplyTo || null,
    })

    await db.from('conversations').update({
      last_message: content.slice(0, 200),
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
          await db.from('ticket_messages').insert({
            ticket_id: ticket.id, company_id: companyId,
            kind: 'reply', direction: 'in', body: content,
            author_name: from.name || from.email, emailed: false,
          })
          // Reopen a resolved/closed ticket (the customer is back), link the
          // conversation for cross-navigation, and bump it to the top.
          const patch: any = { updated_at: new Date().toISOString() }
          if (['resolved', 'closed'].includes(String(ticket.status || ''))) patch.status = 'open'
          if (!ticket.conversation_id) patch.conversation_id = conv.id
          await db.from('support_tickets').update(patch).eq('id', ticket.id)
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
