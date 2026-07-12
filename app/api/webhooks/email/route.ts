import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'

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

    // ── Extract the essentials across provider shapes ────────────────────────
    const toRaw = pick(body, 'to', 'To', 'recipient', 'ToFull', 'envelope.to')
    const fromRaw = pick(body, 'from', 'From', 'sender', 'FromFull', 'envelope.from')
    const subject = pick(body, 'subject', 'Subject') || '(no subject)'
    const textBody = pick(body, 'text', 'TextBody', 'body-plain', 'plain', 'stripped-text') || ''
    const htmlBody = pick(body, 'html', 'HtmlBody', 'body-html') || ''
    const messageId = pick(body, 'message_id', 'MessageID', 'Message-Id', 'messageId', 'headers.message-id')
    const inReplyTo = pick(body, 'in_reply_to', 'In-Reply-To', 'headers.in-reply-to', 'InReplyTo')

    const to = parseAddress(Array.isArray(toRaw) ? toRaw[0] : toRaw)
    const from = parseAddress(fromRaw)

    if (!to.email || !from.email) {
      // Always 200 so providers don't retry/disable the webhook.
      return NextResponse.json({ ok: false, reason: 'Missing to/from address' })
    }

    // ── Resolve the company from the inbound address ─────────────────────────
    const { data: channels } = await db
      .from('email_channels')
      .select('*')
      .ilike('inbound_address', to.email)
      .eq('is_active', true)
      .limit(1)
    const channel = channels?.[0]
    if (!channel) {
      return NextResponse.json({ ok: false, reason: `No email channel configured for ${to.email}` })
    }
    const companyId = channel.company_id

    const content = stripQuoted(String(textBody)) || String(htmlBody).replace(/<[^>]+>/g, ' ').trim()

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
      const { data: newConv } = await db.from('conversations').insert({
        company_id: companyId, channel: 'email', subject,
        email_subject: subject, email_message_id: messageId || null,
        contact_id: contact?.id || null, status: 'open',
        is_unread: true, unread_count: 1,
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).select().maybeSingle()
      conv = newConv
    }
    if (!conv) return NextResponse.json({ ok: false, reason: 'Could not create conversation' })

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

    try {
      await notifyCompany({
        db, companyId, type: 'email',
        message: `New email from ${from.name || from.email}: ${subject}`,
        actorName: from.name || from.email,
        conversationId: conv.id,
      })
    } catch {}

    return NextResponse.json({ ok: true, conversationId: conv.id })
  } catch (e: any) {
    // Never 500 — providers disable webhooks that keep failing.
    console.error('[email webhook]', e)
    return NextResponse.json({ ok: false, error: e.message })
  }
}

// Some providers verify the endpoint with a GET.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Colvy inbound email' })
}
