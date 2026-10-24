// One inbound WhatsApp message into the shared inbox (called by the Twilio
// WhatsApp webhook, app/api/twilio/whatsapp, once it has checked the signature
// and found the business from the sender number).
//
//   • Idempotent on Twilio's MessageSid (stored in messages.telnyx_message_id,
//     as every Twilio message is), so a webhook retry adds nothing.
//   • STOP / START are recorded for WhatsApp only (lib/whatsapp).
//   • The contact is found by phone however it was saved, else created with
//     the customer's WhatsApp profile name (lib/contact-capture).
//   • One conversation per WhatsApp number (conversations.whatsapp_number,
//     V402): the latest one for the number is reopened, else a new one opens.
//     WhatsApp threads are kept apart from SMS threads for the same person, so
//     the reply channel and the 24-hour window are never in doubt.
//   • The team is alerted (bell + phone push) like any inbound message.
// The caller starts the agents (after the response).

import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { protectInbound } from '@/lib/conversation-protection'
import { emitInboundEvent } from '@/lib/integration-hooks'
import { findContactByPhone, ensureContactByPhone } from '@/lib/contact-capture'
import { scheduleMessageThumbs } from '@/lib/image-thumb'
import { logEnquiryReopened } from '@/lib/conversation-timeline'
import { internalHeaders } from '@/lib/internal-call'
import { smsKeyword, STOP_WORDS } from '@/lib/sms-consent'
import { recordWhatsAppKeyword, recordUsage, WHATSAPP_START_WORDS } from '@/lib/whatsapp'
import type { RehostedMedia } from '@/lib/twilio-media'

export type InboundWhatsApp = {
  db: any
  companyId: string
  from: string                 // the customer, E.164
  to: string                   // the business's WhatsApp number, E.164
  text: string
  profileName?: string | null
  media?: RehostedMedia[]
  mediaAttemptFailed?: boolean
  providerMessageId?: string | null
  origin: string
  extra?: Record<string, any> | null   // location, button payload…
}

export type InboundResult = {
  conversationId: string | null
  messageId: string | null
  duplicate: boolean
  keyword: 'opted_out' | 'opted_in' | null
  isNewConversation: boolean
}

const PREVIEW: Record<string, string> = { image: 'Photo', video: 'Video', audio: 'Voice message', file: 'Attachment' }

export async function ingestInboundWhatsApp(p: InboundWhatsApp): Promise<InboundResult> {
  const { db, companyId, from, to, origin } = p
  const text = String(p.text || '')
  const media = p.media || []
  const none: InboundResult = { conversationId: null, messageId: null, duplicate: false, keyword: null, isNewConversation: false }

  if (p.providerMessageId) {
    try {
      const { data: dupe } = await db.from('messages').select('id, conversation_id')
        .eq('company_id', companyId).eq('telnyx_message_id', p.providerMessageId).limit(1)
      if (dupe?.length) return { ...none, conversationId: dupe[0].conversation_id || null, messageId: dupe[0].id, duplicate: true }
    } catch {}
  }

  const summary = (text || (media.length ? PREVIEW[media[0].kind] || 'Attachment' : '') || (p.mediaAttemptFailed ? 'Sent a file' : '')).slice(0, 200)

  // ── Opt-out / opt-in (WhatsApp only) ──────────────────────────────────────
  const word = smsKeyword(text)
  const keyword = (STOP_WORDS.includes(word) || WHATSAPP_START_WORDS.includes(word)) ? await recordWhatsAppKeyword(db, companyId, from, word) : null

  // ── Contact ───────────────────────────────────────────────────────────────
  const profileName = String(p.profileName || '').trim().slice(0, 120) || null
  let contact = await findContactByPhone(db, companyId, from)
  let contactId: string | null = contact?.id || null
  if (!contactId) contactId = await ensureContactByPhone(db, companyId, from, { name: profileName, source: 'whatsapp', known: true })
  else if (!contact?.name && profileName) {
    // Only ever fill an empty name; never overwrite what the team saved.
    try { await db.from('contacts').update({ name: profileName }).eq('id', contactId).eq('company_id', companyId).is('name', null) } catch {}
  }
  const name = contact?.name || profileName || null

  // ── Conversation ──────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  let conv: any = null
  try {
    const { data } = await db.from('conversations').select('*').eq('company_id', companyId).eq('whatsapp_number', from)
      .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
    conv = data || null
  } catch {}
  let isNewConversation = false
  if (!conv) {
    const { data } = await db.from('conversations').insert({
      company_id: companyId, channel: 'whatsapp', subject: name || from,
      whatsapp_number: from, channel_number: to, contact_id: contactId,
      status: 'open', is_unread: true, unread_count: 1,
      last_message: summary, last_message_at: now, last_customer_activity_at: now,
    }).select().maybeSingle()
    conv = data || null
    isNewConversation = !!conv
  } else {
    await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: name, via: 'WhatsApp message' })
    await db.from('conversations').update({
      status: 'open', is_unread: true, channel: 'whatsapp',
      unread_count: (conv.unread_count || 0) + 1,
      last_message: summary, last_message_at: now, last_customer_activity_at: now, updated_at: now,
      ...(contactId && !conv.contact_id ? { contact_id: contactId } : {}),
      ...(!conv.channel_number ? { channel_number: to } : {}),
    }).eq('id', conv.id)
  }
  if (!conv) return { ...none, keyword }

  // ── The message ───────────────────────────────────────────────────────────
  const metadata: Record<string, any> = { whatsapp: { profile_name: profileName, ...(p.extra || {}) } }
  if (p.mediaAttemptFailed) metadata.media_attempt = true
  const { data: msg } = await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'visitor', sender_name: name || from, content: text,
    attachments: media.length ? media : [],
    delivery_channel: 'whatsapp', telnyx_message_id: p.providerMessageId || null,
    metadata,
  }).select('id').maybeSingle()
  const messageId = msg?.id || null
  scheduleMessageThumbs(db, messageId, media, { prefixes: [`/chat-attachments/${companyId}/`] })
  await recordUsage(db, [{ company_id: companyId, conversation_id: conv.id, message_id: messageId, direction: 'inbound', kind: 'session', twilio_sid: p.providerMessageId || null, to_number: to, from_number: from, status: 'received' }])
  await emitInboundEvent(db, { companyId, conversationId: conv.id, isNew: isNewConversation, text, channel: 'whatsapp', phone: from, name, contactId, messageId })

  // Spam and inappropriate messages (lib/conversation-protection), before anyone is told.
  if (text) await protectInbound(db, { companyId, conversationId: conv.id, messageId, contactId: contactId || conv.contact_id || null, text })

  // ── Tell the team ─────────────────────────────────────────────────────────
  const who = name && !/^\+?\d[\d\s-]*$/.test(name) ? name : from
  try { await notifyCompany({ db, companyId, type: 'whatsapp', message: `New WhatsApp message from ${who}: ${summary.slice(0, 80)}`, actorName: who, conversationId: conv.id }) } catch {}
  await pushInboundMessage({ companyId, conversationId: conv.id, title: `New WhatsApp from ${who}`, body: summary, baseUrl: origin })
  // Language detection + translation for the inbox toggle, as for every inbound message.
  if (text && messageId) {
    try { fetch(`${origin}/api/inbox/translate-message`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ messageId }) }).catch(() => {}) } catch {}
  }

  return { conversationId: conv.id, messageId, duplicate: false, keyword, isNewConversation }
}
