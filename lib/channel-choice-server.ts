// Gathers the facts lib/channel-choice.ts decides on: the customer's last
// channel, their mobile and text consent, their email, whether the business
// can text. Server-only (service-role db).

import { chooseChannel, normaliseChannel, isLiveOnPage, isWidgetOnlyContact, type ChannelChoice, type ChannelFacts, type ChannelSetting } from '@/lib/channel-choice'

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

/** A conversation the website chat started (app/api/widget/start): only the widget sets visitor_id. */
const isWidgetConversation = (c: any) => !!c && (!!c.visitor_id || String(c.channel || '').toLowerCase() === 'widget')

/**
 * Did they opt in to texts, where the business records it? The website chat's
 * pre-chat form asks ("Continue this conversation by text"), and
 * app/api/widget/start keeps the answer on the conversation (sms_enabled), not
 * on the contact. false when:
 *   - this is a website chat conversation where they gave a mobile and left
 *     the box unticked, or
 *   - the contact came only from the website chat form (source 'widget', no
 *     consent recorded) and none of their chats has the box ticked;
 * unless something else lets the business text them: consent recorded on the
 * contact (express or inferred), an SMS conversation, or another thread set up
 * for texts (an order or a booking, sms_enabled). true when the box was
 * ticked; null when nothing asks (the STOP check alone applies).
 */
export function smsOptInFrom(o: { conv?: any; contact?: any; contactConvs?: any[] | null }): boolean | null {
  const conv = o.conv || null
  const contact = o.contact || null
  const convs = [...(o.contactConvs || []), ...(conv ? [conv] : [])]
  const otherBasis = ['express', 'inferred'].includes(String(contact?.consent_basis || ''))
    || convs.some(c => !isWidgetConversation(c) && (normaliseChannel(c.channel) === 'sms' || c.sms_enabled === true))
  if (isWidgetConversation(conv) && conv.sms_number) {
    if (conv.sms_enabled === true) return true
    if (conv.sms_enabled === false) return otherBasis ? true : false
  }
  if (isWidgetOnlyContact(contact)) {
    return otherBasis || convs.some(c => isWidgetConversation(c) && c.sms_enabled === true && !!c.sms_number) ? true : false
  }
  return null
}

/** Every fact the rule needs, for a conversation and/or a contact. */
export async function gatherChannelFacts(db: any, o: {
  companyId: string; conversationId?: string | null; contactId?: string | null
  phone?: string | null; email?: string | null; setting?: ChannelSetting | null
  newCustomerDefault?: 'sms' | 'email' | null
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
  // The contact's other threads, only when the opt-in question arises. When
  // they can't be read, none count (don't text when unsure).
  const needsThreads = !!phone && !!contactId && ((isWidgetConversation(conv) && conv?.sms_enabled === false) || isWidgetOnlyContact(contact))
  const [last, hasSms, consent, contactConvs] = await Promise.all([
    lastCustomerChannel(db, { companyId: o.companyId, conversationId: o.conversationId || null, contactId }),
    phone ? businessHasSms(db, o.companyId) : Promise.resolve(false),
    phone ? smsConsentFor(db, o.companyId, phone, contactId) : Promise.resolve('unknown' as const),
    needsThreads
      ? Promise.resolve(db.from('conversations').select('*').eq('company_id', o.companyId).eq('contact_id', contactId).limit(50))
          .then((r: any) => (r?.error ? [] : r?.data || []), () => [])
      : Promise.resolve([]),
  ])
  return {
    contactId,
    lastCustomerChannel: last,
    threadChannel: conv?.channel || null,
    phone, email,
    smsConsent: consent,
    smsOptIn: phone ? smsOptInFrom({ conv, contact, contactConvs }) : null,
    liveOnPage: isLiveOnPage(conv?.page_seen_at),
    businessHasSms: hasSms,
    setting: o.setting || null,
    newCustomerDefault: o.newCustomerDefault || null,
  }
}

export async function resolveChannel(db: any, o: Parameters<typeof gatherChannelFacts>[1], opts: { reachOnly?: boolean } = {}): Promise<ChannelChoice & { facts: ChannelFacts }> {
  const facts = await gatherChannelFacts(db, o)
  return { ...chooseChannel(facts, opts), facts }
}
