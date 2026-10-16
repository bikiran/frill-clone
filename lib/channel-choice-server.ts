// Gathers the facts lib/channel-choice.ts decides on: the customer's last
// channel, their mobile and text consent, their email, whether the business
// can text. Server-only (service-role db).

import { chooseChannel, normaliseChannel, type ChannelChoice, type ChannelFacts, type ChannelSetting } from '@/lib/channel-choice'

const MESSAGING = ['sms', 'email', 'whatsapp', 'instagram', 'facebook', 'messenger']

/** The channel of a customer message: its delivery_channel, or its thread's when that says more. */
function channelOfInbound(m: any, convChannel: string | null | undefined): string {
  const dc = normaliseChannel(m?.delivery_channel)
  const cc = normaliseChannel(convChannel)
  if (dc && dc !== 'chat') return dc
  // delivery_channel defaults to 'chat'; an SMS/email thread's older rows carry it.
  if (MESSAGING.includes(cc)) return cc
  return dc || cc || 'chat'
}

/** The customer's latest message to the business: in this conversation, else any of theirs. */
export async function lastCustomerChannel(db: any, o: { companyId: string; conversationId?: string | null; contactId?: string | null }): Promise<string | null> {
  try {
    const convs: any[] = []
    if (o.conversationId) {
      const { data } = await db.from('conversations').select('id, channel').eq('id', o.conversationId).eq('company_id', o.companyId).maybeSingle()
      if (data) convs.push(data)
    }
    if (o.contactId) {
      const { data } = await db.from('conversations').select('id, channel').eq('company_id', o.companyId).eq('contact_id', o.contactId)
        .order('last_message_at', { ascending: false }).limit(20)
      for (const c of data || []) if (!convs.some(x => x.id === c.id)) convs.push(c)
    }
    if (!convs.length) return null
    const { data: msgs } = await db.from('messages').select('conversation_id, delivery_channel, created_at')
      .in('conversation_id', convs.map(c => c.id)).eq('sender_type', 'visitor')
      .order('created_at', { ascending: false }).limit(1)
    const m = msgs?.[0]
    if (!m) return null
    return channelOfInbound(m, convs.find(c => c.id === m.conversation_id)?.channel)
  } catch { return null }
}

export async function businessHasSms(db: any, companyId: string): Promise<boolean> {
  try {
    const { resolveSmsSender } = await import('@/lib/sms-provider')
    return !!(await resolveSmsSender(db, companyId))
  } catch { return false }
}

export async function smsConsentFor(db: any, companyId: string, phone: string | null | undefined, contactId?: string | null): Promise<'ok' | 'opted_out' | 'unknown'> {
  if (!phone) return 'unknown'
  try {
    const { textOptOut } = await import('@/lib/sms-consent')
    return (await textOptOut(db, companyId, phone, contactId)).state
  } catch { return 'unknown' }
}

/** Every fact the rule needs, for a conversation and/or a contact. */
export async function gatherChannelFacts(db: any, o: {
  companyId: string; conversationId?: string | null; contactId?: string | null
  phone?: string | null; email?: string | null; setting?: ChannelSetting | null
}): Promise<ChannelFacts & { contactId: string | null }> {
  let conv: any = null
  if (o.conversationId) {
    const { data } = await db.from('conversations').select('*').eq('id', o.conversationId).eq('company_id', o.companyId).maybeSingle()
    conv = data
  }
  const contactId = o.contactId || conv?.contact_id || null
  let contact: any = null
  if (contactId) {
    const { data } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', o.companyId).maybeSingle()
    contact = data
  }
  const phone = o.phone || conv?.sms_number || contact?.phone || null
  const email = o.email || contact?.email || conv?.customer_email || null
  const [last, hasSms, consent] = await Promise.all([
    lastCustomerChannel(db, { companyId: o.companyId, conversationId: o.conversationId || null, contactId }),
    phone ? businessHasSms(db, o.companyId) : Promise.resolve(false),
    phone ? smsConsentFor(db, o.companyId, phone, contactId) : Promise.resolve('unknown' as const),
  ])
  return {
    contactId,
    lastCustomerChannel: last,
    threadChannel: conv?.channel || null,
    phone, email,
    smsConsent: consent,
    businessHasSms: hasSms,
    setting: o.setting || null,
  }
}

export async function resolveChannel(db: any, o: Parameters<typeof gatherChannelFacts>[1], opts: { reachOnly?: boolean } = {}): Promise<ChannelChoice & { facts: ChannelFacts }> {
  const facts = await gatherChannelFacts(db, o)
  return { ...chooseChannel(facts, opts), facts }
}
