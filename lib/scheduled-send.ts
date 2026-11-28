import { internalHeaders } from '@/lib/internal-call'
import { readSmsOptIn } from '@/lib/channel-choice-server'
// Delivering a scheduled reply (server only). Shared by the cron worker and the
// inbox's "Send now", so both send exactly the way the inbox does live:
//   Instagram / Messenger → /api/meta/send
//   Email                 → /api/email/reply
//   SMS                   → /api/telnyx/sms/send
//   WhatsApp              → /api/whatsapp/send (refused once the 24-hour window has closed)
//   Website chat          → inserted straight into messages
// It goes by SMS or email when the agent scheduled it that way, whatever the
// conversation's own channel; a conversation a call opened is texted. Anything
// else that isn't a website chat has nowhere to go, and fails.

/** Take a pending row for sending. Only one caller can win, so the cron and a
 *  "Send now" click can never both deliver the same message. */
export async function claimScheduled(db: any, id: string): Promise<any | null> {
  const { data } = await db.from('scheduled_messages')
    .update({ status: 'sending' })
    .eq('id', id).eq('status', 'pending')
    .select('*').maybeSingle()
  return data || null
}

export async function deliverScheduled(db: any, base: string, sm: any): Promise<{ ok: boolean; error?: string }> {
  const content: string = sm.message || ''
  if (!content.trim() || !sm.conversation_id) return { ok: false, error: 'nothing to send' }
  const { data: conv } = await db.from('conversations').select('*').eq('id', sm.conversation_id).maybeSingle()
  if (!conv) return { ok: false, error: 'conversation not found' }

  // The channel the composer showed when it was scheduled (SMS or email) wins
  // over the conversation's own. The conversation's came first before, so a
  // reply scheduled "by SMS" on a call thread or a website chat was only
  // posted in the thread and marked sent, and the customer never got it.
  // Not on a Colvy chat (answered in the app only) or a WhatsApp, Messenger or
  // Instagram conversation: those still go the conversation's own way, as
  // they always have (the app has no WhatsApp choice, so it stores 'sms' on a
  // WhatsApp thread; honouring that would turn a WhatsApp reply into a text).
  const convChannel = String(conv.channel || '').toLowerCase()
  const asked = String(sm.channel || '').toLowerCase()
  const ownWay = ['colvy', 'whatsapp', 'instagram', 'facebook'].includes(convChannel)
  let channel = (asked === 'sms' || asked === 'email') && !ownWay ? asked : convChannel || asked
  // A conversation a call opened has no channel of its own: the caller is
  // texted, as the inbox does live.
  if (['phone', 'call', 'voice'].includes(channel)) channel = 'sms'
  const agentName = sm.sender_name || 'Scheduled'
  try {
    // An automated text held back overnight (lib/channel-fallback, sending
    // hours). Its message is already on the thread, so only the text goes out;
    // the SMS route still checks the customer hasn't opted out since.
    if (String(sm.channel || '') === 'sms_auto') {
      let to: string | null = conv.sms_number || null
      if (conv.contact_id) {
        const { data: ct } = await db.from('contacts').select('phone').eq('id', conv.contact_id).maybeSingle()
        to = to || ct?.phone || null
      }
      if (!to) return { ok: false, error: 'no phone number on this conversation' }
      const r = await fetch(`${base}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: conv.company_id, conversationId: conv.id, to, text: content, skipChatMessage: true }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `sms ${r.status}` }
    }
    if (channel === 'instagram' || channel === 'facebook') {
      const r = await fetch(`${base}/api/meta/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ conversationId: conv.id, content, agentName }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `meta send ${r.status}` }
    }
    if (channel === 'whatsapp') {
      const r = await fetch(`${base}/api/whatsapp/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ conversationId: conv.id, content, agentName }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `whatsapp ${r.status}` }
    }
    if (channel === 'email') {
      let to: string | null = conv.customer_email || null
      if (!to && conv.contact_id) {
        const { data: ct } = await db.from('contacts').select('email').eq('id', conv.contact_id).maybeSingle()
        to = ct?.email || null
      }
      if (!to) return { ok: false, error: 'no email address on this conversation' }
      const r = await fetch(`${base}/api/email/reply`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ conversationId: conv.id, content, agentName, to }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `email ${r.status}` }
    }
    if (channel === 'sms') {
      let to: string | null = conv.sms_number || null
      if (!to && conv.contact_id) {
        const { data: ct } = await db.from('contacts').select('phone').eq('id', conv.contact_id).maybeSingle()
        to = ct?.phone || null
      }
      if (!to) return { ok: false, error: 'no phone number on this conversation' }
      // A text on a conversation that isn't an SMS one yet: a website chat
      // visitor who didn't tick "Continue this conversation by text" isn't
      // texted (as lib/channel-fallback). The SMS route checks opt-outs (STOP,
      // blocked) on every scheduled text, as it always has.
      if (convChannel !== 'sms' && (await readSmsOptIn(db, { companyId: conv.company_id, conv, phone: to })) === false) {
        return { ok: false, error: 'They didn’t opt in to texts on your website chat, so it wasn’t texted.' }
      }
      const r = await fetch(`${base}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: conv.company_id, conversationId: conv.id, to, text: content, senderName: agentName }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `sms ${r.status}` }
    }
    // Posting in the thread is for a chat: a website chat, a Colvy chat in the
    // app, or a plain 'chat' conversation (the customer portal's Messages
    // section shows those, and the inbox posts there live too). A conversation
    // of any other kind (a contact form, …) has nobody reading the thread, so
    // it fails rather than showing as sent.
    const postedIsRead = ['chat', 'widget', 'live_chat', 'colvy', ''].includes(channel)
    if (!postedIsRead) return { ok: false, error: 'No channel to send this on. Choose SMS or email and schedule it again.' }
    // Live chat / widget: no external hop — record it on the thread. The
    // COLVY_V299 trigger bumps the conversation; the widget picks it up live.
    const { error } = await db.from('messages').insert({
      conversation_id: conv.id, company_id: conv.company_id,
      sender_type: 'agent', sender_name: agentName,
      content, delivery_channel: channel || 'chat',
    })
    return error ? { ok: false, error: error.message || 'insert failed' } : { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send failed' }
  }
}
