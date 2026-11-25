import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGmail, gmailMessageId, sanitizeEmailHtml } from '@/lib/gmail'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE, logBlockedSend } from '@/lib/demo-guard'
import { requireCompanyAccess } from '@/lib/company-access'
import { isInternalCall } from '@/lib/internal-call'
import { planAllows, planLock } from '@/lib/plan-gate'

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
    const body0 = await req.json()
    const { conversationId, content, html: htmlOverride, agentName, to, cc, bcc, subject: subjectOverride, signature: sigOverride, attachments, metadata, skipChatMessage, threadMessageId } = body0
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    // The inbox shows a reply as "Sending…" under an id it picked; the message
    // is saved under that id, so the card becomes the sent email.
    const clientMessageId: string | null = typeof body0.clientMessageId === 'string' && UUID.test(body0.clientMessageId) ? body0.clientMessageId : null
    // The workspace the caller says this is (the inbox sends it): its reads
    // start straight away and are used only when the conversation agrees.
    const companyHint: string | null = typeof body0.companyId === 'string' && UUID.test(body0.companyId) ? body0.companyId : null
    // Normalise attachments to {url,name,type} + a display kind for the thread.
    const atts = (Array.isArray(attachments) ? attachments : [])
      .filter((a: any) => a && a.url)
      .map((a: any) => ({ url: String(a.url), name: String(a.name || 'file'), type: a.type || undefined, ...(Number(a.size) > 0 ? { size: Number(a.size) } : {}) }))
    const displayAtts = atts.map(a => ({ ...a, kind: String(a.type || '').startsWith('image') ? 'image' : String(a.type || '').startsWith('video') ? 'video' : 'file' }))
    if (!conversationId || !content) {
      return NextResponse.json({ error: 'conversationId and content are required' }, { status: 400 })
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email sending is not configured (RESEND_API_KEY missing).' }, { status: 500 })
    }

    const db = admin()
    const internal = isInternalCall(req)

    // Everything a reply needs to look up, read at once (it used to wait on
    // about ten reads one after another before the email even left). They
    // only read; nothing is sent or answered from them until access is
    // confirmed below.
    const lastInboundP = db.from('messages')
      .select('email_message_id, email_subject, sender_email')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'visitor')
      .not('email_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    // Per workspace: the demo guard, the Inbox plan (inbox replies need it;
    // our own server routes go through), the company's name, and its mailboxes.
    const companyReads = (co: string) => Promise.all([
      isExternalSendBlocked(co, db),
      internal ? Promise.resolve(true) : planAllows(db, co, 'inbox'),
      db.from('companies').select('name,slug').eq('id', co).maybeSingle(),
      db.from('email_channels').select('*').eq('company_id', co).order('created_at', { ascending: true }),
    ])
    const signedIn = internal || /^Bearer\s+\S/i.test(req.headers.get('authorization') || '')
    const earlyCo = signedIn && companyHint ? companyReads(companyHint) : null
    const earlyAccess = signedIn && companyHint && !internal ? requireCompanyAccess(req, db, companyHint) : null
    earlyCo?.catch(() => {}); earlyAccess?.catch(() => {})

    const [{ data: conv }, { data: lastInbound }] = await Promise.all([
      db.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
      lastInboundP,
    ])
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const hinted = companyHint === conv.company_id
    // Sends from the workspace's own mailbox, so only its members (Bearer) or our
    // own server routes (scheduler, reminders, notifications) may call it.
    if (!internal && !(await (hinted && earlyAccess ? earlyAccess : requireCompanyAccess(req, db, conv.company_id))).ok) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    const [blocked, inboxAllowed, { data: company }, { data: companyChannels }] = await (hinted && earlyCo ? earlyCo : companyReads(conv.company_id))
    if (blocked) { logBlockedSend(conv.company_id, 'email', db); return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 }) }
    // Email replies from the inbox are on the Inbox plans (lib/plan-gate).
    if (!inboxAllowed) { const locked = await planLock(db, conv.company_id, 'inbox'); if (locked) return locked }

    // Recipient = the composer's To field, else whoever last emailed us on this
    // thread (an email can thread onto an order conversation), else the contact
    // (read only when it's needed).
    let toEmail = (to && String(to).trim()) || lastInbound?.[0]?.sender_email || ''
    if (!toEmail && conv.contact_id) {
      const { data: contact } = await db.from('contacts').select('email').eq('id', conv.contact_id).maybeSingle()
      toEmail = contact?.email || ''
    }
    // Don't require the conversation to already BE an email thread. A widget /
    // abandoned-cart / chat conversation whose contact has an email address can
    // still be replied to by email — we send a fresh message from the company
    // mailbox and thread it onto this conversation. The only hard requirement is a
    // recipient; everything below (mailbox fallback, In-Reply-To, subject) already
    // copes with there being no prior email. This lifts the "This conversation is
    // not an email thread" block on carts and other non-email threads.
    if (!toEmail) return NextResponse.json({ error: 'No recipient for this email' }, { status: 400 })
    const ccEmail = cc && String(cc).trim() ? String(cc).trim() : null
    const bccEmail = bcc && String(bcc).trim() ? String(bcc).trim() : null

    // Which mailbox does this conversation belong to? Fall back to the company's
    // first active mailbox for older conversations that predate multi-account.
    const mailboxes: any[] = Array.isArray(companyChannels) ? companyChannels : []
    let channel: any = conv.email_channel_id ? mailboxes.find(c => c.id === conv.email_channel_id) || null : null
    if (!channel && conv.email_channel_id) {
      const { data } = await db.from('email_channels').select('*').eq('id', conv.email_channel_id).maybeSingle()
      channel = data
    }
    if (!channel) channel = mailboxes.find(c => c.is_active === true) || null
    if (!channel) {
      return NextResponse.json({ error: 'No email account configured for this company.' }, { status: 400 })
    }

    // Thread the reply to the customer's most recent email.
    const inReplyTo = lastInbound?.[0]?.email_message_id || conv.email_message_id || null

    const subject = (subjectOverride && String(subjectOverride).trim())
      ? String(subjectOverride).trim()
      : ((lastInbound?.[0]?.email_subject || conv.email_subject)
        ? (/^re:/i.test(lastInbound?.[0]?.email_subject || conv.email_subject) ? (lastInbound?.[0]?.email_subject || conv.email_subject) : `Re: ${lastInbound?.[0]?.email_subject || conv.email_subject}`)
        : 'Re: your message')

    const fromName = channel.from_name || company?.name || 'Support'

    // Append the mailbox signature, if any, and build an HTML version so the
    // reply renders with paragraph breaks and clickable links on the customer's
    // side (a plain-text-only reply looked flat next to their formatted email).
    // The composer may pick a specific signature (from the library) — honour it
    // exactly, including an explicit "no signature" (empty string). Only fall
    // back to the mailbox's own signature when the caller didn't specify one.
    const chosenSig = sigOverride !== undefined ? String(sigOverride || '') : (channel.signature || '')
    const signature = chosenSig ? `\n\n${chosenSig}` : ''
    const fullText = `${content}${signature}`
    const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const linkify = (t: string) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    // When the composer sends formatted HTML (rich-text toolbar), send it as-is
    // (sanitised) with the signature appended as HTML; otherwise build HTML from
    // the plain text as before.
    const sigHtml = chosenSig ? `<br><br>${escapeHtml(chosenSig).replace(/\n/g, '<br>')}` : ''
    const bodyHtml = (htmlOverride && String(htmlOverride).trim())
      ? `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${sanitizeEmailHtml(String(htmlOverride))}${sigHtml}</div>`
      : `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${linkify(escapeHtml(fullText)).replace(/\n/g, '<br>')}</div>`

    const fromLabel = `${fromName} <${channel.inbound_address || channel.from_address}>`

    // ── Gmail account: send through the Gmail API, so the reply lands in the
    //    business's own Sent folder and threads properly for the customer.
    // Reply-To on Colvy's inbound domain so the customer's reply routes straight
    // back onto THIS conversation, regardless of where their mailbox lives.
    // Reply-To on Colvy's inbound domain (the company alias). The customer's reply
    // comes back to Colvy and threads onto this conversation via In-Reply-To.
    const { inboxReplyTo } = await import('@/lib/inbound-alias')
    const convReplyTo = inboxReplyTo(company, channel)

    // An automated send records its own thread row (skipChatMessage) and names
    // it here, so that row is stamped as the email that went out: its subject,
    // addresses and Message-ID. The customer's reply then threads back onto it,
    // and the composer's subject follows it instead of a stale one.
    const stampThreadRow = async (fields: Record<string, any>) => {
      if (!skipChatMessage || !threadMessageId) return
      try {
        await db.from('messages').update({
          delivery_channel: 'email', email_subject: subject, email_to: toEmail, email_in_reply_to: inReplyTo, ...fields,
        }).eq('id', String(threadMessageId)).eq('conversation_id', conversationId)
      } catch { /* the send already happened */ }
    }

    // The message row and the conversation, written together; the saved row
    // goes back to the inbox. Under the inbox's id when it sent one (and under
    // a new id should that one be taken).
    const recordReply = async (row: Record<string, any>) => {
      const insertP = (async () => {
        let r: any = await db.from('messages').insert({ ...row, ...(clientMessageId ? { id: clientMessageId } : {}) }).select('*').maybeSingle()
        if (r?.error && clientMessageId) r = await db.from('messages').insert(row).select('*').maybeSingle()
        return r?.data || null
      })()
      const convP = db.from('conversations').update({
        last_message: content.slice(0, 200),
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)
      const [saved] = await Promise.all([insertP, convP])
      return saved
    }

    if (channel.provider === 'gmail') {
      // A reply recorded here (the inbox) reads its Message-ID back after
      // answering; a caller that records its own row needs it in the answer.
      const later = !skipChatMessage
      const out = await sendGmail(channel, {
        to: toEmail, cc: ccEmail, bcc: bccEmail, subject, body: fullText, html: bodyHtml,
        inReplyTo,
        threadId: conv.email_message_id || null,
        replyTo: convReplyTo,
        attachments: atts,
        skipMessageId: later,
      })
      if (out.error) return NextResponse.json({ error: out.error }, { status: 502 })

      // Callers that record the thread row themselves (automated sends) pass skipChatMessage.
      let saved: any = null
      if (!skipChatMessage) {
        saved = await recordReply({
          conversation_id: conversationId,
          company_id: conv.company_id,
          sender_type: 'agent',
          sender_name: agentName || fromName,
          content: fullText,
          delivery_channel: 'email',
          gmail_message_id: out.id || null,
          email_message_id: out.messageId || null,
          email_in_reply_to: inReplyTo,
          email_from: fromLabel,
          email_to: toEmail,
          email_cc: ccEmail,
          email_subject: subject,
          email_html: bodyHtml,
          ...(displayAtts.length ? { attachments: displayAtts } : {}),
        })
        // The Message-ID, read once the reply has been answered, so the
        // customer's answer threads onto this email.
        if (later && out.id && saved?.id) {
          const rowId = saved.id, gmailId = out.id
          after(async () => {
            const mid = await gmailMessageId(channel, gmailId).catch(() => null)
            if (mid) await db.from('messages').update({ email_message_id: mid }).eq('id', rowId).then(() => {}, () => {})
          })
        }
      }

      await stampThreadRow({ gmail_message_id: out.id || null, email_message_id: out.messageId || null, email_from: fromLabel })
      return NextResponse.json({ ok: true, id: out.id, messageId: out.messageId || null, subject, replyTo: convReplyTo || null, via: 'gmail', ...(saved ? { message: saved } : {}) })
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
        ...(bccEmail ? { bcc: bccEmail.split(',').map((x: string) => x.trim()).filter(Boolean) } : {}),
        subject,
        text: fullText,
        html: bodyHtml,
        reply_to: convReplyTo,
        ...(atts.length ? { attachments: atts.map(a => ({ filename: a.name, path: a.url })) } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    })

    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: out?.message || 'Resend rejected the email', detail: out }, { status: 502 })
    }

    let saved: any = null
    if (!skipChatMessage) {
      saved = await recordReply({
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
        ...(displayAtts.length ? { attachments: displayAtts } : {}),
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
      })
    }

    await stampThreadRow({ email_message_id: out?.id || null, email_from: `${fromName} <${fromAddress}>` })
    return NextResponse.json({ ok: true, id: out?.id, subject, replyTo: convReplyTo || null, via: 'resend', ...(saved ? { message: saved } : {}) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
