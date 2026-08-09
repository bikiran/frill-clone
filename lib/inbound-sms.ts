// Shared inbound-SMS ingestion — provider-agnostic.
//
// The Telnyx webhook has always done conversation routing, opt-out handling,
// keyword auto-replies and the failed-media hint inline. The Twilio webhook
// needs the exact same behaviour, so it lives here once. Replies go out through
// resolveSmsSender, so whichever provider owns the company answers on its own
// carrier — a Twilio company never tries to reply with a Telnyx key.

import { notifyCompany } from './notify'
import { runKeywordReply } from './keyword-reply'
import { resolveSmsSender } from './sms-provider'

export interface InboundAttachment {
  url: string
  kind: 'image' | 'video' | 'audio' | 'file'
  type?: string
  name?: string
}

const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)

/**
 * Route one inbound text/MMS into the right conversation and run the follow-on
 * automations (push, smart-trigger, keyword reply, failed-media auto-reply).
 * Returns the conversation it landed in.
 */
export async function ingestInboundSms(params: {
  db: any
  companyId: string
  from: string
  to: string
  text: string
  media?: InboundAttachment[]
  mediaAttemptFailed?: boolean
  providerMessageId?: string | null
  origin: string
}): Promise<{ conversationId: string | null }> {
  const { db, companyId, from, to, origin } = params
  const text = params.text || ''
  const media = params.media || []
  const mediaAttemptFailed = !!params.mediaAttemptFailed
  const fromDigits = digitsOf(from)

  const mediaPreview = media.length
    ? (media[0].kind === 'image' ? '📷 Photo'
      : media[0].kind === 'video' ? '🎥 Video'
      : media[0].kind === 'audio' ? '🎤 Voice message' : '📎 Attachment')
    : ''
  const summary = text || mediaPreview || (mediaAttemptFailed ? '📷 Tried to send media' : '')

  // ── Opt-out / opt-in keywords ────────────────────────────────────────────
  const keyword = String(text).trim().toUpperCase().replace(/[^A-Z]/g, '')
  const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']
  const START_WORDS = ['START', 'SUBSCRIBE', 'YES', 'OPTIN', 'UNSTOP']
  if (fromDigits && (STOP_WORDS.includes(keyword) || START_WORDS.includes(keyword))) {
    const optingOut = STOP_WORDS.includes(keyword)
    try {
      const { data: all } = await db.from('contacts').select('id, phone').eq('company_id', companyId).limit(2000)
      const match = (all || []).find((c: any) => c.phone && digitsOf(c.phone) === fromDigits)
      if (match) {
        await db.from('contacts').update(
          optingOut
            ? { subscribed_to_marketing: false, consent_basis: 'none', consent_source: `replied ${keyword} by SMS`, unsubscribed_at: new Date().toISOString(), unsubscribe_method: 'sms_keyword' }
            : { subscribed_to_marketing: true, consent_basis: 'express', consent_source: `replied ${keyword} by SMS`, consent_recorded_at: new Date().toISOString(), unsubscribed_at: null, unsubscribe_method: null }
        ).eq('id', match.id)
        await db.from('consent_events').insert({
          company_id: companyId, contact_id: match.id,
          action: optingOut ? 'unsubscribed' : 'subscribed',
          basis: optingOut ? 'none' : 'express',
          source: `SMS keyword: ${keyword}`, actor: 'customer',
        })
      }
    } catch (e) { console.error('[inbound-sms] consent keyword handling failed', e) }
  }

  // ── Conversation routing ──────────────────────────────────────────────────
  // 1) Fast path: exact sms_number match.
  let { data: conv } = await db.from('conversations')
    .select('*').eq('company_id', companyId).eq('sms_number', from)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle()

  // 2) Match sender to a contact by phone, reuse their latest conversation.
  let matchedContactId: string | null = conv?.contact_id || null
  let matchedContactName: string | null = null
  if (!conv && fromDigits && fromDigits.length >= 8) {
    const tail = fromDigits.slice(-9)
    const { data: contacts } = await db.from('contacts')
      .select('id, phone, name').eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(10)
    const contact = (contacts || []).find((c: any) => c.phone && digitsOf(c.phone).endsWith(tail))
    if (contact) {
      matchedContactId = contact.id
      matchedContactName = contact.name || null
      const { data: contactConv } = await db.from('conversations')
        .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
      if (contactConv) {
        conv = contactConv
        if (!contactConv.sms_number) {
          try { await db.from('conversations').update({ sms_number: from, sms_enabled: true, channel_number: to }).eq('id', contactConv.id) } catch {}
        }
      }
    }
  }

  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'sms',
      subject: matchedContactName || from,
      sms_number: from, sms_enabled: true, channel_number: to,
      contact_id: matchedContactId, status: 'open',
      is_unread: true, unread_count: 1,
      last_message: summary, last_message_at: new Date().toISOString(),
    }).select().maybeSingle()
    conv = newConv
    if (newConv) {
      try {
        fetch(`${origin}/api/inbox/auto-reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: newConv.id }) })
      } catch {}
    }
  } else if (!conv.sms_number || conv.contact_id !== matchedContactId) {
    await db.from('conversations').update({
      sms_number: conv.sms_number || from,
      sms_enabled: true,
      channel_number: conv.channel_number || to,
      ...(matchedContactId && !conv.contact_id ? { contact_id: matchedContactId } : {}),
    }).eq('id', conv.id)
  }

  if (!conv) return { conversationId: null }

  await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'visitor', sender_name: from, content: text,
    ...(media.length ? { attachments: media } : {}),
    ...(mediaAttemptFailed ? { metadata: { media_attempt: true } } : {}),
    delivery_channel: 'sms',
    telnyx_message_id: params.providerMessageId || null,
  })
  await db.from('conversations').update({
    last_message: summary, last_message_at: new Date().toISOString(),
    is_unread: true, channel: 'sms', status: 'open',
    unread_count: (conv.unread_count || 0) + 1, updated_at: new Date().toISOString(),
  }).eq('id', conv.id)

  // Alert agents' phones + run smart triggers. Prefer the saved contact's name
  // over the raw number in the title; fall back to the number when unknown.
  let senderLabel = matchedContactName || conv.subject || null
  if (!senderLabel && matchedContactId) {
    try {
      const { data: c } = await db.from('contacts').select('name').eq('id', matchedContactId).eq('company_id', companyId).maybeSingle()
      senderLabel = c?.name || null
    } catch {}
  }
  if (!senderLabel || /^\+?\d[\d\s-]*$/.test(senderLabel)) senderLabel = from
  try {
    fetch(`${origin}/api/push/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, title: `New SMS from ${senderLabel}`, body: summary, conversationId: conv.id, from }) })
    fetch(`${origin}/api/inbox/smart-trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.id, text }) })
  } catch {}

  // Keyword auto-reply — texted back over whichever provider owns this company.
  try {
    await runKeywordReply({
      conversationId: conv.id, text, companyId,
      deliver: async (reply) => {
        const sender = await resolveSmsSender(db, companyId)
        if (sender) await sender.send({ to: from, text: reply })
      },
    })
  } catch (e) { console.error('[inbound-sms keyword reply]', e) }

  // Failed-media hint auto-reply (only fires when a media attempt truly failed;
  // on Twilio, MMS usually arrives, so this rarely triggers). Throttled 6h.
  if (mediaAttemptFailed) {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      const { data: recentReq } = await db.from('messages')
        .select('id').eq('conversation_id', conv.id)
        .eq('message_type', 'media_request').gte('created_at', sixHoursAgo).limit(1)
      if (!recentReq || recentReq.length === 0) {
        const mr = await fetch(`${origin}/api/media-requests`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, conversationId: conv.id, contactId: conv.contact_id || matchedContactId || null,
            prompt: 'It looks like you tried to send us a photo or video. Please upload it here.',
            accept: ['image', 'video'], maxFiles: 10, expiryHours: null, createdBy: 'Auto-reply',
          }),
        })
        const mrData = await mr.json().catch(() => ({}))
        if (mr.ok && mrData.link) {
          const sender = await resolveSmsSender(db, companyId)
          if (sender) await sender.send({ to: from, text: `It looks like you tried to send a photo — please upload it here: ${mrData.link}` })
        }
      }
    } catch (e) { console.error('[inbound-sms media attempt auto-reply]', e) }
  }

  try { await notifyCompany({ db, companyId, type: 'sms', message: `New SMS from ${from}: ${summary.slice(0, 80)}`, actorName: from }) } catch {}

  return { conversationId: conv.id }
}
