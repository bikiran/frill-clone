// Shared inbound-SMS ingestion — provider-agnostic.
//
// The Telnyx webhook has always done conversation routing, opt-out handling,
// keyword auto-replies and the failed-media hint inline. The Twilio webhook
// needs the exact same behaviour, so it lives here once. Replies go out through
// resolveAutomatedSmsSender (resolveSmsSender plus the opt-out guard), so
// whichever provider owns the company answers on its own carrier — a Twilio
// company never tries to reply with a Telnyx key. A STOP gets no reply at all.

import { internalHeaders } from '@/lib/internal-call'
import { notifyCompany } from './notify'
import { runKeywordReply } from './keyword-reply'
import { handleBookingSmsReply } from './booking-replies'
import { emitInboundEvent } from '@/lib/integration-hooks'
import { queueMediaUploadReply } from '@/lib/media-upload-reply'
import { smsKeyword, STOP_WORDS, START_WORDS, recordSmsKeyword, textOptOut, resolveAutomatedSmsSender } from '@/lib/sms-consent'
import { findContactByPhone } from '@/lib/contact-capture'
import { scheduleMessageThumbs } from '@/lib/image-thumb'
import { placeByLine } from '@/lib/location-lines'

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

  // Idempotency: providers (Twilio/Telnyx) retry a webhook whenever they don't
  // get a fast 2xx, which would ingest the SAME inbound message twice (the
  // "double SMS / duplicate photos" bug). If we've already stored this provider
  // message id, stop here.
  if (params.providerMessageId) {
    try {
      const { data: dupe } = await db.from('messages')
        .select('id, conversation_id').eq('company_id', companyId)
        .eq('telnyx_message_id', params.providerMessageId).limit(1)
      if (dupe && dupe.length) return { conversationId: dupe[0].conversation_id || null }
    } catch {}
  }
  const fromDigits = digitsOf(from)

  const mediaPreview = media.length
    ? (media[0].kind === 'image' ? '📷 Photo'
      : media[0].kind === 'video' ? '🎥 Video'
      : media[0].kind === 'audio' ? '🎤 Voice message' : '📎 Attachment')
    : ''
  const summary = text || mediaPreview || (mediaAttemptFailed ? '📷 Tried to send media' : '')

  // ── Opt-out / opt-in keywords ────────────────────────────────────────────
  // Recorded on every contact with the number (lib/sms-consent).
  const keyword = smsKeyword(text)
  const optingOut = STOP_WORDS.includes(keyword)
  if (fromDigits && (optingOut || START_WORDS.includes(keyword))) await recordSmsKeyword(db, companyId, from, keyword)

  // ── Conversation routing ──────────────────────────────────────────────────
  // 1) Fast path: exact sms_number match.
  let { data: conv } = await db.from('conversations')
    .select('*').eq('company_id', companyId).eq('sms_number', from)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle()

  // 2) Match sender to a contact by phone, reuse their latest conversation.
  let matchedContactId: string | null = conv?.contact_id || null
  let matchedContactName: string | null = null
  if (!conv && fromDigits && fromDigits.length >= 8) {
    // However the number was saved ("0412 345 678" too), as the Telnyx webhook does.
    const contact = await findContactByPhone(db, companyId, from)
    if (contact) {
      matchedContactId = contact.id
      matchedContactName = contact.name || null
      const { data: contactConv } = await db.from('conversations')
        .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
      if (contactConv) {
        conv = contactConv
        // A STOP doesn't switch texting on, here or below.
        if (!contactConv.sms_number) {
          try { await db.from('conversations').update({ sms_number: from, ...(optingOut ? {} : { sms_enabled: true }), channel_number: to }).eq('id', contactConv.id) } catch {}
        }
      }
    }
  }

  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'sms',
      subject: matchedContactName || from,
      sms_number: from, sms_enabled: !optingOut, channel_number: to,
      contact_id: matchedContactId, status: 'open',
      // A shop's own number places the thread under that shop (lib/location-lines).
      ...(await placeByLine(db, companyId, to)),
      is_unread: true, unread_count: 1,
      last_message: summary, last_message_at: new Date().toISOString(),
    }).select().maybeSingle()
    conv = newConv
    if (newConv && !optingOut) {
      try {
        fetch(`${origin}/api/inbox/auto-reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: newConv.id }) })
      } catch {}
    }
  } else if (!conv.sms_number || conv.contact_id !== matchedContactId) {
    await db.from('conversations').update({
      sms_number: conv.sms_number || from,
      ...(optingOut ? {} : { sms_enabled: true }),
      channel_number: conv.channel_number || to,
      ...(matchedContactId && !conv.contact_id ? { contact_id: matchedContactId } : {}),
    }).eq('id', conv.id)
  }

  if (!conv) return { conversationId: null }

  const { data: insertedMsg } = await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'visitor', sender_name: from, content: text,
    ...(media.length ? { attachments: media } : {}),
    ...(mediaAttemptFailed ? { metadata: { media_attempt: true } } : {}),
    delivery_channel: 'sms',
    telnyx_message_id: params.providerMessageId || null,
  }).select('id').maybeSingle()
  // Small copies of any photos, for the inbox tiles (after the response).
  // Media was re-hosted into this company's chat folder; nothing else is fetched.
  scheduleMessageThumbs(db, insertedMsg?.id, media, { prefixes: [`/chat-attachments/${companyId}/`] })
  await emitInboundEvent(db, { companyId, conversationId: conv.id, text, channel: 'sms', phone: from, messageId: insertedMsg?.id || null })
  // The customer is texting in, so the thread continues by text: texting goes
  // on (upload links and the like are texted), replacing a "continue by text"
  // box they left unticked in a web chat. Not for a STOP, and only when the
  // thread's number is the one texting in: a thread found through the contact
  // can hold another number (one typed into a web chat), which must not start
  // getting texts.
  const sameNumber = !conv.sms_number || digitsOf(conv.sms_number) === fromDigits
  await db.from('conversations').update({
    last_message: summary, last_message_at: new Date().toISOString(),
    is_unread: true, channel: 'sms', status: 'open',
    ...(!optingOut && sameNumber ? { sms_enabled: true } : {}),
    unread_count: (conv.unread_count || 0) + 1, updated_at: new Date().toISOString(),
  }).eq('id', conv.id)

  // Alert agents' phones + run smart triggers. The sender name is the PERSON —
  // their saved contact name, else the raw number. Never the conversation
  // subject: that's a system label (e.g. "Abandoned cart", "Cart recovered"), so
  // using it produced nonsense like "New SMS from Abandoned cart".
  let senderLabel = matchedContactName || null
  if (!senderLabel) {
    const cid = conv.contact_id || matchedContactId
    if (cid) {
      try {
        const { data: c } = await db.from('contacts').select('name').eq('id', cid).eq('company_id', companyId).maybeSingle()
        senderLabel = c?.name || null
      } catch {}
    }
  }
  if (!senderLabel || /^\+?\d[\d\s-]*$/.test(senderLabel)) senderLabel = from
  try {
    fetch(`${origin}/api/push/send`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ companyId, title: `New SMS from ${senderLabel}`, body: summary, conversationId: conv.id, from }) })
    fetch(`${origin}/api/inbox/smart-trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.id, text }) })
    // Colvy AI: extract the sender's name/suburb and create/link their contact.
    // Fire-and-forget so the LLM call never delays ingestion.
    if (text) fetch(`${origin}/api/inbox/capture-contact`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ companyId, conversationId: conv.id, from, text }) })
    // Detect language + translate to English (fire-and-forget) so a non-English
    // text shows a "Translated · English / View original" toggle in the inbox.
    if (text && insertedMsg?.id) fetch(`${origin}/api/inbox/translate-message`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ messageId: insertedMsg.id }) })
  } catch {}

  // "C" / "R" answering a booking reminder — confirm, or send the reschedule link.
  let bookingHandled = false
  try { bookingHandled = await handleBookingSmsReply({ db, companyId, conversationId: conv.id, from, text, origin }) } catch {}

  // Keyword auto-reply — texted back over whichever provider owns this company.
  // Never in answer to a STOP.
  let keywordAnswered = false
  if (!bookingHandled && !optingOut) try {
    keywordAnswered = !!(await runKeywordReply({
      conversationId: conv.id, text, companyId, channel: 'sms',
      deliver: async (reply) => {
        const sender = await resolveAutomatedSmsSender(db, companyId, { contactId: conv.contact_id || matchedContactId || null })
        if (sender) await sender.send({ to: from, text: reply })
      },
    }))?.matched
  } catch (e) { console.error('[inbound-sms keyword reply]', e) }

  // Nothing canned answered it → Colvy AI (only if the business switched AI on
  // for SMS; the agent checks). It shows live in the inbox with a countdown.
  // Not for a STOP.
  // Not for a customer who opted out (or can't be checked): no AI run at all.
  if (!bookingHandled && !keywordAnswered && !optingOut && text
    && (await textOptOut(db, companyId, from, conv.contact_id || matchedContactId || null)).state === 'ok') {
    try { fetch(`${origin}/api/ai/reply`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ conversationId: conv.id, companyId }) }) } catch {}
  }

  // A video (or photo, if the business asked) came through squeezed by the
  // carrier: offer an upload link for the original. Runs after the webhook has
  // answered, and only when switched on in Automatic replies. Never in answer
  // to a STOP.
  if (!optingOut && !mediaAttemptFailed && media.length) {
    queueMediaUploadReply({ db, companyId, conversationId: conv.id, contactId: conv.contact_id || matchedContactId || null, phone: from, media, origin })
  }

  // Failed-media hint auto-reply (only fires when a media attempt truly failed;
  // on Twilio, MMS usually arrives, so this rarely triggers). Throttled 6h.
  // Never in answer to a STOP, or to a customer who opted out or is blocked.
  if (!optingOut && mediaAttemptFailed && (await textOptOut(db, companyId, from, conv.contact_id || matchedContactId || null)).state === 'ok') {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      const { data: recentReq } = await db.from('messages')
        .select('id').eq('conversation_id', conv.id)
        .eq('message_type', 'media_request').gte('created_at', sixHoursAgo).limit(1)
      if (!recentReq || recentReq.length === 0) {
        const mr = await fetch(`${origin}/api/media-requests`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            companyId, conversationId: conv.id, contactId: conv.contact_id || matchedContactId || null,
            prompt: 'It looks like you tried to send us a photo or video. Please upload it here.',
            accept: ['image', 'video'], maxFiles: 10, expiryHours: null, createdBy: 'Auto-reply',
          }),
        })
        const mrData = await mr.json().catch(() => ({}))
        // The request route already texts the link when it can; don't send it twice.
        if (mr.ok && mrData.link && !mrData.texted && !mrData.optedOut) {
          const sender = await resolveAutomatedSmsSender(db, companyId, { contactId: conv.contact_id || matchedContactId || null })
          if (sender) await sender.send({ to: from, text: `It looks like you tried to send a photo — please upload it here: ${mrData.link}` })
        }
      }
    } catch (e) { console.error('[inbound-sms media attempt auto-reply]', e) }
  }

  try { await notifyCompany({ db, companyId, type: 'sms', message: `New SMS from ${from}: ${summary.slice(0, 80)}`, actorName: from, conversationId: conv.id }) } catch {}

  return { conversationId: conv.id }
}
