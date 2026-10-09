// Shopify orders → the shared order automations (cart recovery, the order
// thread + customer messages, attribution, review requests).
//
// Runs on live order events (webhooks, and the catch-up cron for orders a
// webhook missed) — never on the bulk import, so connecting a store doesn't
// message every customer about their past orders.

import { recoverAbandonedCarts } from '@/lib/abandoned-carts'
import { runOrderAutomation, type NormalOrder, type OrderStatusWord } from '@/lib/order-automation'

const upper = (s: any) => String(s || '').toUpperCase()
const amount = (set: any): number => parseFloat(set?.shopMoney?.amount) || 0

// Shopify's payment + fulfilment state → WooCommerce's status words, which the
// inbox badge, the message templates and the settings page use.
export function statusWord(o: any): OrderStatusWord {
  if (o.cancelledAt) return 'cancelled'
  const fin = upper(o.displayFinancialStatus)
  if (fin === 'REFUNDED') return 'refunded'
  if (fin === 'VOIDED' || fin === 'EXPIRED') return 'failed'
  const ful = upper(o.displayFulfillmentStatus)
  if (ful === 'FULFILLED') return 'completed'
  if (ful === 'ON_HOLD') return 'on-hold'
  // Awaiting a manual payment (bank transfer, cash on delivery) — WooCommerce
  // calls that on-hold too.
  if (fin === 'PENDING') return 'on-hold'
  return 'processing'
}

export function toNormalOrder(o: any): NormalOrder {
  const ship = o.shippingAddress || {}
  const bill = o.billingAddress || {}
  const a = ship.address1 ? ship : bill
  const attrs: any[] = Array.isArray(o.customAttributes) ? o.customAttributes : []
  const chatConv = attrs.find(x => String(x?.key || '').toLowerCase() === '_colvy_conversation_id')?.value || null
  return {
    channel: 'shopify',
    externalId: String(o.legacyResourceId || String(o.id || '').match(/(\d+)$/)?.[1] || ''),
    number: String(o.name || '').replace(/^#/, '') || String(o.legacyResourceId || ''),
    status: statusWord(o),
    total: amount(o.totalPriceSet),
    currency: o.currencyCode || 'AUD',
    refundedTotal: amount(o.totalRefundedSet) || null,
    email: String(o.email || '').trim().toLowerCase() || null,
    phone: o.phone || ship.phone || bill.phone || null,
    firstName: bill.firstName || ship.firstName || o.customer?.firstName || '',
    lastName: bill.lastName || ship.lastName || o.customer?.lastName || '',
    address: a.address1 || a.city ? { address_1: a.address1 || '', address_2: a.address2 || '', city: a.city || '', state: a.provinceCode || a.province || '', postcode: a.zip || '', country: a.countryCodeV2 || a.country || '' } : null,
    isPos: String(o.sourceName || '').toLowerCase() === 'pos',
    createdAt: o.processedAt || o.createdAt || null,
    chatConversationId: chatConv,
  }
}

export async function runShopifyOrderAutomations(db: any, companyId: string, order: any) {
  const n = toNormalOrder(order)
  if (!n.externalId) return

  // 1. A converting order recovers this customer's abandoned carts (the same
  //    matching as WooCommerce: email or phone, plus open cart conversations).
  try {
    await recoverAbandonedCarts(db, companyId, {
      id: n.externalId, number: n.number, total: n.total.toFixed(2),
      status: n.status === 'on-hold' ? 'on-hold' : n.status === 'completed' ? 'completed' : n.status === 'processing' ? 'processing' : n.status,
      billing: { email: n.email, phone: n.phone },
    })
  } catch (e) { console.error('[shopify automation] cart recovery failed', e) }

  // 2. Checkouts still held for this customer are done — they bought.
  try {
    if (!['cancelled', 'failed', 'refunded'].includes(n.status)) {
      const tail = String(n.phone || '').replace(/\D/g, '').slice(-9)
      if (n.email) await db.from('shopify_checkouts').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('company_id', companyId).eq('status', 'open').eq('email', n.email)
      if (tail.length >= 8) {
        const { data: open } = await db.from('shopify_checkouts').select('token, phone').eq('company_id', companyId).eq('status', 'open').not('phone', 'is', null).limit(50)
        for (const c of open || []) if (String(c.phone || '').replace(/\D/g, '').slice(-9) === tail) {
          await db.from('shopify_checkouts').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('company_id', companyId).eq('token', c.token)
        }
      }
    }
  } catch {}

  // 3. The order thread, customer message, attribution, review request.
  await runOrderAutomation(db, companyId, n, {
    priorConversationId: async (d, cid, o) => {
      const { data } = await d.from('orders').select('conversation_id').eq('company_id', cid).eq('sales_channel', 'shopify').eq('external_order_id', o.externalId).maybeSingle()
      return data?.conversation_id || null
    },
    // Webhooks re-read the order before we get here, so a negative status is
    // Shopify's current state, not a stale delivery.
    persist: async (d, cid, o, r) => {
      const patch: any = { conversation_id: r.conversationId, attribution: r.attribution, attributed_at: r.attribution ? new Date().toISOString() : null }
      if (r.contactId) patch.contact_id = r.contactId
      await d.from('orders').update(patch).eq('company_id', cid).eq('sales_channel', 'shopify').eq('external_order_id', o.externalId)
    },
  })
}
