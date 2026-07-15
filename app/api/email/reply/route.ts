import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGmail } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Sends an agent's reply out by email, threaded into the customer's original
// message so it lands in the same email conversation on their side.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, content, agentName, to, cc, subject: subjectOverride } = await req.json()
    if (!conversationId || !content) {
      return NextResponse.json({ error: 'conversationId and content are required' }, { status: 400 })
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email sending is not configured (RESEND_API_KEY missing).' }, { status: 500 })
    }

    const db = admin()

    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (conv.channel !== 'email') {
      return NextResponse.json({ error: 'This conversation is not an email thread' }, { status: 400 })
    }

    // Recipient = the composer's To field, falling back to the contact's email.
    const { data: contact } = await db.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
    const toEmail = (to && String(to).trim()) || contact?.email
    if (!toEmail) return NextResponse.json({ error: 'No recipient for this email' }, { status: 400 })
    const ccEmail = cc && String(cc).trim() ? String(cc).trim() : null

    // Which mailbox does this conversation belong to? Fall back to the company's
    // first active mailbox for older conversations that predate multi-account.
    let channel: any = null
    if (conv.email_channel_id) {
      const { data } = await db.from('email_channels').select('*').eq('id', conv.email_channel_id).maybeSingle()
      channel = data
    }
    if (!channel) {
      const { data: channels } = await db.from('email_channels').select('*')
        .eq('company_id', conv.company_id).eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1)
      channel = channels?.[0]
    }
    if (!channel) {
      return NextResponse.json({ error: 'No email account configured for this company.' }, { status: 400 })
    }

    const { data: company } = await db.from('companies').select('name').eq('id', conv.company_id).maybeSingle()

    // Thread the reply to the customer's most recent message.
    const { data: lastInbound } = await db.from('messages')
      .select('email_message_id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'visitor')
      .not('email_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const inReplyTo = lastInbound?.[0]?.email_message_id || conv.email_message_id || null

    const subject = (subjectOverride && String(subjectOverride).trim())
      ? String(subjectOverride).trim()
      : (conv.email_subject
        ? (/^re:/i.test(conv.email_subject) ? conv.email_subject : `Re: ${conv.email_subject}`)
        : 'Re: your message')

    const fromName = channel.from_name || company?.name || 'Support'

    // Append the mailbox signature, if any, and build an HTML version so the
    // reply renders with paragraph breaks and clickable links on the customer's
    // side (a plain-text-only reply looked flat next to their formatted email).
    const signature = channel.signature ? `\n\n${channel.signature}` : ''
    const fullText = `${content}${signature}`
    const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const linkify = (t: string) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${
      linkify(escapeHtml(fullText)).replace(/\n/g, '<br>')
    }</div>`

    const fromLabel = `${fromName} <${channel.inbound_address || channel.from_address}>`

    // ── Gmail account: send through the Gmail API, so the reply lands in the
    //    business's own Sent folder and threads properly for the customer.
    if (channel.provider === 'gmail') {
      const out = await sendGmail(channel, {
        to: toEmail, cc: ccEmail, subject, body: fullText, html: bodyHtml,
        inReplyTo,
        threadId: conv.email_message_id || null,
      })
      if (out.error) return NextResponse.json({ error: out.error }, { status: 502 })

      await db.from('messages').insert({
        conversation_id: conversationId,
        company_id: conv.company_id,
        sender_type: 'agent',
        sender_name: agentName || fromName,
        content: fullText,
        delivery_channel: 'email',
        gmail_message_id: out.id || null,
        email_in_reply_to: inReplyTo,
        email_from: fromLabel,
        email_to: toEmail,
        email_cc: ccEmail,
        email_subject: subject,
        email_html: bodyHtml,
      })
      await db.from('conversations').update({
        last_message: content.slice(0, 200),
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)

      return NextResponse.json({ ok: true, id: out.id, via: 'gmail' })
    }

    // ── Webhook (domain) account: send via Resend.
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email sending is not configured (RESEND_API_KEY missing).' }, { status: 500 })
    }
    const fromAddress = channel.from_address || channel.inbound_address
    if (!fromAddress) {
      return NextResponse.json({ error: 'No sending address configured for this mailbox.' }, { status: 400 })
    }

    const headers: Record<string, string> = {}
    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo
      headers['References'] = inReplyTo
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [toEmail],
        ...(ccEmail ? { cc: ccEmail.split(',').map((x: string) => x.trim()).filter(Boolean) } : {}),
        subject,
        text: fullText,
        html: bodyHtml,
        reply_to: channel.inbound_address || fromAddress,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    })

    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: out?.message || 'Resend rejected the email', detail: out }, { status: 502 })
    }

    await db.from('messages').insert({
      conversation_id: conversationId,
      company_id: conv.company_id,
      sender_type: 'agent',
      sender_name: agentName || fromName,
      content: fullText,
      delivery_channel: 'email',
      email_message_id: out?.id || null,
      email_in_reply_to: inReplyTo,
      email_from: `${fromName} <${fromAddress}>`,
      email_to: toEmail,
      email_cc: ccEmail,
      email_subject: subject,
      email_html: bodyHtml,
    })

    await db.from('conversations').update({
      last_message: content.slice(0, 200),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, id: out?.id, via: 'resend' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
