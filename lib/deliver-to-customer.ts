'use client'

// Send a message (like an order's payment link) to a customer from outside a
// conversation — e.g. Create Order on the Orders page. Finds or creates the
// contact and their conversation, then texts it (when there's a mobile and
// SMS is set up) and emails it (when there's an email), so it lands in the
// Colvy inbox thread as well as with the customer.

import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'

export type DeliverTarget = {
  companyId: string
  contactId?: string | null
  conversationId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

export async function deliverToCustomer(t: DeliverTarget, msg: { body: string; url?: string | null; subject?: string; staffName?: string }): Promise<{ summary: string; conversationId: string | null }> {
  const email = String(t.email || '').trim()
  const phone = String(t.phone || '').trim()
  if (!email && !phone) throw new Error('Add the customer’s email or mobile to send the link.')
  const db = supabase as any

  // Contact: the one given, else match by email or mobile, else create one.
  let contactId = t.contactId || null
  if (!contactId) {
    const digits = phone.replace(/\D/g, '').slice(-9)
    const ors = [email ? `email.ilike.${email.replace(/[,()]/g, '')}` : '', digits.length >= 8 ? `phone.ilike.%${digits}` : ''].filter(Boolean)
    if (ors.length) {
      const { data } = await db.from('contacts').select('id').eq('company_id', t.companyId).or(ors.join(',')).limit(1)
      contactId = data?.[0]?.id || null
    }
    if (!contactId) {
      const { data } = await db.from('contacts').insert({ company_id: t.companyId, name: t.name || email || phone, email: email || null, phone: phone || null, source: 'manual' }).select('id').maybeSingle()
      contactId = data?.id || null
    }
  }

  // Conversation: the one given, else their latest, else a new one.
  let conversationId = t.conversationId || null
  if (!conversationId && contactId) {
    const { data } = await db.from('conversations').select('id').eq('company_id', t.companyId).eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1)
    conversationId = data?.[0]?.id || null
  }
  if (!conversationId) {
    const { data } = await db.from('conversations').insert({
      company_id: t.companyId, contact_id: contactId, status: 'open',
      channel: phone ? 'sms' : 'email', sms_number: phone || null,
      subject: msg.subject || null, last_message_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    conversationId = data?.id || null
  }
  if (!conversationId) throw new Error('Could not open a conversation for this customer.')

  const text = msg.url ? `${msg.body}\n${msg.url}` : msg.body
  const sent: string[] = []
  const errors: string[] = []

  if (phone) {
    try {
      const res = await authFetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: t.companyId, conversationId, to: phone, text, senderName: msg.staffName }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) sent.push('SMS'); else errors.push(d.error || 'SMS failed')
    } catch (e: any) { errors.push(e?.message || 'SMS failed') }
  }
  if (email) {
    try {
      const res = await authFetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // When the SMS already logged the message in the thread, don't log it twice.
        body: JSON.stringify({ conversationId, to: email, content: text, agentName: msg.staffName, subject: msg.subject, skipChatMessage: sent.length > 0 }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) sent.push('email'); else errors.push(d.error || 'Email failed')
    } catch (e: any) { errors.push(e?.message || 'Email failed') }
  }

  if (!sent.length) throw new Error(errors[0] || 'Could not send the link.')
  return { summary: `Sent by ${sent.join(' and ')}`, conversationId }
}
