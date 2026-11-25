// "Same customer?" for a texting number Colvy doesn't know yet.
//
// A customer can text from a second mobile (their partner's, a work phone).
// Colvy files texts by the sender's number, so that number became its own
// contact and conversation even when the store knows better: the number is
// the phone on the customer's own orders. Here:
//
//   suggestByPhone   — the customer whose store orders carry this number, if
//                      there's one clear answer and nobody said "not the same"
//   confirmByPhone   — the team said yes: the number is recorded as a
//                      confirmed phone of that customer (customer_identities,
//                      kind 'phone'), this conversation is merged into theirs,
//                      and the two contacts are linked (identity group)
//   rejectByPhone    — "not the same": never suggested again for this number
//   followMerged     — a later text from the number lands in the conversation
//                      it was merged into
//
// Never automatic: nothing is merged until someone on the team says so.

import { phoneKey, emailKey } from '@/lib/phone'
import { maskEmail } from '@/lib/customer-match'

export type PhoneSuggestion = {
  contactId: string
  name: string
  maskedEmail: string
  orderCount: number
  orderNumbers: string[]
  conversationId: string | null
}

type OrderHit = { number: string; email: string; contactId: string | null; at: string | null }

/**
 * The one customer these orders point at, from the contacts found for them.
 * Pure: the caller does the reads. Null when there's no clear answer (orders
 * for two different customers are as likely as not a shared phone).
 */
export function pickPhoneMatch(
  orders: OrderHit[],
  contacts: { id: string; name?: string | null; email?: string | null }[],
  opts: { visitorId?: string | null; rejected?: Set<string> } = {},
): { contactId: string; orders: OrderHit[] } | null {
  const byEmail = new Map<string, string>()
  for (const c of contacts) { const k = emailKey(c.email); if (k && !byEmail.has(k)) byEmail.set(k, c.id) }
  const known = new Set(contacts.map(c => c.id))
  const perContact = new Map<string, OrderHit[]>()
  for (const o of orders) {
    const id = (o.contactId && known.has(o.contactId) ? o.contactId : null) || byEmail.get(emailKey(o.email)) || null
    if (!id || id === opts.visitorId || opts.rejected?.has(id)) continue
    const arr = perContact.get(id) || []; arr.push(o); perContact.set(id, arr)
  }
  if (perContact.size !== 1) return null
  const [[contactId, hits]] = [...perContact.entries()]
  return { contactId, orders: hits }
}

/** Follow merges (up to 3): the conversation a merged-away one was merged into. */
export async function followMerged(db: any, companyId: string, conv: any): Promise<any> {
  let c = conv
  const seen = new Set<string>()
  for (let i = 0; i < 3 && c?.merged_into && !seen.has(c.merged_into); i++) {
    seen.add(c.id)
    try {
      const { data } = await db.from('conversations').select('*').eq('id', c.merged_into).eq('company_id', companyId).maybeSingle()
      if (!data) break
      c = data
    } catch { break }
  }
  return c
}

/** The texting number of a conversation (its own, else its contact's), as a last-9 key. */
async function numberOf(db: any, conv: any): Promise<{ key: string; contact: any | null }> {
  let contact: any = null
  if (conv.contact_id) {
    try { contact = (await db.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()).data || null } catch {}
  }
  return { key: phoneKey(conv.sms_number || contact?.phone || ''), contact }
}

async function rejectedFor(db: any, companyId: string, key: string): Promise<Set<string>> {
  try {
    const { data } = await db.from('customer_identity_audit').select('contact_id')
      .eq('company_id', companyId).eq('action', 'match_rejected').contains('evidence', { phoneValue: key })
    return new Set((data || []).map((r: any) => r.contact_id).filter(Boolean))
  } catch { return new Set() }
}

/** The customer whose store orders carry this conversation's number, or null. */
export async function suggestByPhone(db: any, conv: any): Promise<PhoneSuggestion | null> {
  const companyId = conv.company_id
  if (conv.merged_into) return null
  const { key, contact } = await numberOf(db, conv)
  if (key.length < 9) return null
  // A contact with an email is someone the team already knows by more than
  // a number: nothing to suggest.
  if (contact?.email) return null
  const read = async (q: () => PromiseLike<any>) => { try { const r = await q(); return r?.error ? [] : (r?.data || []) } catch { return [] } }
  const [woo, unified, confirmed, rejected] = await Promise.all([
    read(() => db.from('woocommerce_orders').select('woo_order_id, customer_email, order_date')
      .eq('company_id', companyId).eq('billing_phone_norm', key).order('order_date', { ascending: false }).limit(30)),
    read(() => db.from('orders').select('order_number, customer_email, contact_id, order_date')
      .eq('company_id', companyId).eq('customer_phone_norm', key).order('order_date', { ascending: false }).limit(30)),
    read(() => db.from('customer_identities').select('contact_id').eq('company_id', companyId).eq('kind', 'phone').eq('value', key).eq('status', 'confirmed').limit(1)),
    rejectedFor(db, companyId, key),
  ])
  // Already confirmed as someone's number: texts go to them already.
  if (confirmed.length) return null
  const orders: OrderHit[] = [
    ...woo.map((o: any) => ({ number: String(o.woo_order_id ?? ''), email: o.customer_email || '', contactId: null, at: o.order_date || null })),
    ...unified.map((o: any) => ({ number: String(o.order_number ?? ''), email: o.customer_email || '', contactId: o.contact_id || null, at: o.order_date || null })),
  ].filter(o => o.number || o.email || o.contactId)
  if (!orders.length) return null
  const emails = [...new Set(orders.map(o => emailKey(o.email)).filter(Boolean))]
  const ids = [...new Set(orders.map(o => o.contactId).filter(Boolean))] as string[]
  const [byEmail, byId] = await Promise.all([
    emails.length ? read(() => db.from('contacts').select('id, name, email').eq('company_id', companyId).or(emails.map(e => `email.ilike.${e.replace(/[,()]/g, '')}`).join(',')).limit(20)) : Promise.resolve([]),
    ids.length ? read(() => db.from('contacts').select('id, name, email').eq('company_id', companyId).in('id', ids)) : Promise.resolve([]),
  ])
  const contacts = [...byEmail, ...byId]
  const pick = pickPhoneMatch(orders, contacts, { visitorId: conv.contact_id || null, rejected })
  if (!pick) return null
  const who = contacts.find((c: any) => c.id === pick.contactId)
  const { data: theirs } = await db.from('conversations').select('id')
    .eq('company_id', companyId).eq('contact_id', pick.contactId).is('merged_into', null)
    .neq('id', conv.id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
  const numbers = [...new Set(pick.orders.map(o => o.number).filter(Boolean))]
  return {
    contactId: pick.contactId,
    name: who?.name || 'this customer',
    maskedEmail: maskEmail(who?.email),
    orderCount: numbers.length || pick.orders.length,
    orderNumbers: numbers.slice(0, 3),
    conversationId: theirs?.id || null,
  }
}

/**
 * The team said this number is that customer: record it, merge this
 * conversation into theirs (their latest; this one becomes theirs when they
 * have none), and link the contacts. Returns the conversation to open.
 */
export async function confirmByPhone(db: any, conv: any, targetId: string, actor: { id?: string | null; name?: string | null } = {}): Promise<{ ok: true; conversationId: string } | { ok: false; error: string; status: number }> {
  const companyId = conv.company_id
  const { data: target } = await db.from('contacts').select('*').eq('id', targetId).eq('company_id', companyId).maybeSingle()
  if (!target) return { ok: false, error: 'Customer not found', status: 404 }
  const { key, contact: visitor } = await numberOf(db, conv)
  if (key.length < 9) return { ok: false, error: 'This conversation has no mobile number', status: 400 }
  const now = new Date().toISOString()

  // 1. The number is theirs (one confirmed owner per number).
  try {
    await db.from('customer_identities').update({ status: 'rejected', updated_at: now })
      .eq('company_id', companyId).eq('kind', 'phone').eq('value', key).eq('status', 'confirmed').neq('contact_id', targetId)
    const { data: existing } = await db.from('customer_identities').select('id')
      .eq('company_id', companyId).eq('kind', 'phone').eq('value', key).eq('contact_id', targetId).maybeSingle()
    const row = {
      company_id: companyId, contact_id: targetId, kind: 'phone', value: key,
      display: conv.sms_number || visitor?.phone || null, status: 'confirmed',
      source: 'Same customer, confirmed in the inbox', confirmed_by: actor.id || null, confirmed_by_name: actor.name || null,
      confirmed_at: now, updated_at: now,
    }
    if (existing) await db.from('customer_identities').update(row).eq('id', existing.id)
    else await db.from('customer_identities').insert(row)
  } catch { /* the merge below still holds the conversation together */ }

  // 2. Their conversation: this one's messages move there and this one is
  //    marked merged (a later text from the number follows it there).
  const { data: theirs } = await db.from('conversations').select('*')
    .eq('company_id', companyId).eq('contact_id', targetId).is('merged_into', null)
    .neq('id', conv.id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
  let openId = conv.id
  if (theirs) {
    await db.from('messages').update({ conversation_id: theirs.id }).eq('conversation_id', conv.id)
    for (const table of ['conversation_events', 'conversation_tasks']) {
      try { await db.from(table).update({ conversation_id: theirs.id }).eq('conversation_id', conv.id) } catch {}
    }
    await db.from('conversations').update({ status: 'resolved', is_archived: true, merged_into: theirs.id, updated_at: now }).eq('id', conv.id)
    // Newest activity first in the list: whichever is later.
    const later = [conv.last_message_at, theirs.last_message_at].filter(Boolean).sort().pop()
    if (later && later !== theirs.last_message_at) {
      await db.from('conversations').update({ last_message: conv.last_message, last_message_at: later, updated_at: now }).eq('id', theirs.id)
    }
    openId = theirs.id
  } else {
    await db.from('conversations').update({ contact_id: targetId, updated_at: now }).eq('id', conv.id)
  }

  // 3. The two contacts are one customer (orders and timeline resolve across both).
  if (visitor && visitor.id !== targetId) {
    const gid = target.identity_group_id || visitor.identity_group_id || crypto.randomUUID()
    try {
      await db.from('contacts').update({ identity_group_id: gid }).eq('id', targetId)
      await db.from('contacts').update({ identity_group_id: gid }).eq('id', visitor.id)
    } catch {}
  }

  try {
    await db.from('customer_identity_audit').insert({
      company_id: companyId, contact_id: targetId, action: 'match_confirmed',
      actor_id: actor.id || null, actor_name: actor.name || null,
      detail: `Confirmed ${conv.sms_number || 'this number'} as ${target.name || 'the customer'}’s mobile`,
      evidence: { phoneValue: key, fromConversationId: conv.id, intoConversationId: openId },
      before: { visitorContactId: visitor?.id || null, conversationId: conv.id },
      after: { targetContactId: targetId, conversationId: openId },
    })
  } catch {}
  return { ok: true, conversationId: openId }
}

/** "Not the same": this customer is never suggested again for this number. */
export async function rejectByPhone(db: any, conv: any, contactId: string, actor: { id?: string | null; name?: string | null } = {}): Promise<void> {
  const { key } = await numberOf(db, conv)
  await db.from('customer_identity_audit').insert({
    company_id: conv.company_id, contact_id: contactId || null, action: 'match_rejected',
    actor_id: actor.id || null, actor_name: actor.name || null,
    detail: 'Not the same customer as this number',
    evidence: { conversationId: conv.id, phoneValue: key },
  })
}
