// Who each "Needs you" item is about, for the page (not the phone-alert sweep):
// the customer's name and contact details, the channel, the last thing they
// wrote, and the money at stake for cart follow-ups and payment requests.
// A handful of batched queries for the whole list; any failure leaves the
// items as they were.

import type { NeedItem } from './needs-you'

export type NeedCustomer = { name: string | null; phone: string | null; email: string | null; contactId?: string | null }
export type EnrichedNeed = NeedItem & {
  customer?: NeedCustomer | null
  channel?: string | null
  preview?: string | null      // the customer's own words (their last message, the review, the comment)
  previewAt?: string | null
  value?: number | null        // dollars waiting on this (cart total, unpaid payment request)
}

const clip = (s: unknown, n = 280) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null }

export async function enrichNeeds(db: any, companyId: string, items: NeedItem[]): Promise<EnrichedNeed[]> {
  const out: EnrichedNeed[] = items.map(i => ({ ...i }))
  try {
    const convIds = Array.from(new Set(out.map(i => i.conversationId).filter(Boolean))) as string[]
    const cartIds = Array.from(new Set(out.map(i => i.approval?.run?.input?.cartId).filter(Boolean))) as string[]
    const paymentIds = out.filter(i => i.key.startsWith('quote:')).map(i => i.key.slice(6))

    const [convRes, msgRes, cartRes, payRes] = await Promise.all([
      convIds.length ? db.from('conversations').select('id, channel, contact_id').eq('company_id', companyId).in('id', convIds) : { data: [] },
      convIds.length ? db.from('messages').select('conversation_id, content, created_at').in('conversation_id', convIds).eq('sender_type', 'visitor')
        .order('created_at', { ascending: false }).limit(Math.min(1000, convIds.length * 15)) : { data: [] },
      cartIds.length ? db.from('abandoned_carts').select('id, total').eq('company_id', companyId).in('id', cartIds) : { data: [] },
      paymentIds.length ? db.from('chat_payments').select('id, amount_cents').eq('company_id', companyId).in('id', paymentIds) : { data: [] },
    ])
    const convs = new Map<string, any>((convRes?.data || []).map((c: any) => [c.id, c]))
    const contactIds = Array.from(new Set(Array.from(convs.values()).map((c: any) => c.contact_id).filter(Boolean)))
    const { data: contacts } = contactIds.length
      ? await db.from('contacts').select('id, name, phone, email').eq('company_id', companyId).in('id', contactIds)
      : { data: [] }
    const contactById = new Map<string, any>((contacts || []).map((c: any) => [c.id, c]))
    const lastMsg = new Map<string, any>()
    for (const m of msgRes?.data || []) if (!lastMsg.has(m.conversation_id) && clip(m.content)) lastMsg.set(m.conversation_id, m)
    const cartTotal = new Map<string, number>((cartRes?.data || []).map((c: any) => [c.id, Number(c.total) || 0]))
    const payAmount = new Map<string, number>((payRes?.data || []).map((p: any) => [p.id, (Number(p.amount_cents) || 0) / 100]))

    for (const i of out) {
      const input = i.approval?.run?.input || {}
      const conv = i.conversationId ? convs.get(i.conversationId) : null
      const ct = conv?.contact_id ? contactById.get(conv.contact_id) : null
      const name = ct?.name || i.approval?.conversation?.customer || input.name || input.reviewer || input.author || null
      i.customer = (name || ct) ? { name: name || ct?.phone || ct?.email || null, phone: ct?.phone || null, email: ct?.email || null, contactId: ct?.id || null } : null
      i.channel = conv?.channel || i.approval?.conversation?.channel
        || (input.kind === 'review' || i.kind === 'review' ? 'google' : input.kind === 'comment' ? (input.platform || 'facebook') : null)
      const m = i.conversationId ? lastMsg.get(i.conversationId) : null
      i.preview = m ? clip(m.content) : (['review', 'comment', 'lead'].includes(input.kind) ? clip(input.message) : null)
      i.previewAt = m?.created_at || null
      i.value = input.cartId && cartTotal.has(input.cartId) ? cartTotal.get(input.cartId)!
        : i.key.startsWith('quote:') && payAmount.has(i.key.slice(6)) ? payAmount.get(i.key.slice(6))!
        : null
    }
  } catch { /* the list still works without the extras */ }
  return out
}
