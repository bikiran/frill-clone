import { internalHeaders } from '@/lib/internal-call'
// Delivering a scheduled reply (server only). Shared by the cron worker and the
// inbox's "Send now", so both send exactly the way the inbox does live:
//   Instagram / Messenger → /api/meta/send
//   Email                 → /api/email/reply
//   SMS                   → /api/telnyx/sms/send
//   Live chat / widget    → inserted straight into messages

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

  const channel = String(conv.channel || sm.channel || '').toLowerCase()
  const agentName = sm.sender_name || 'Scheduled'
  try {
    if (channel === 'instagram' || channel === 'facebook') {
      const r = await fetch(`${base}/api/meta/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ conversationId: conv.id, content, agentName }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `meta send ${r.status}` }
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
      const r = await fetch(`${base}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: conv.company_id, conversationId: conv.id, to, text: content, senderName: agentName }),
      })
      return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({})))?.error || `sms ${r.status}` }
    }
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
