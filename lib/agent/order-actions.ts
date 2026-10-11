// Customer-safe order actions for agents that talk to customers.
//
// Unlike the staff assistant's search_orders (which searches every order), these
// only ever return orders that belong to the person in the conversation:
//   • verified / probable customer → their own orders (contact, email or phone)
//   • unknown customer → only an order whose number AND email or phone match
//     what they told us. A mismatch says "couldn't match", never whether the
//     order exists.

import { getOrderTracking } from '@/lib/tracking'
import { assessOrder, loadThresholds } from '@/lib/order-assess'
import { statusMeta } from '@/lib/orders'
import type { ActionContext, ActionDef, JsonSchema } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const digits9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)
const lc = (s: any) => String(s || '').trim().toLowerCase()
const cleanNum = (s: any) => String(s || '').replace(/^#/, '').trim()

const ORDER_COLS = 'id, order_number, status, payment_status, fulfilment_status, total, currency, order_date, created_at, customer_name, customer_email, customer_phone, customer_phone_norm, contact_id, shipping_address, sales_channel, carrier, tracking_number, tracking_url, shipped_at, delivered_at'

async function contactOf(ctx: ActionContext) {
  if (!ctx.contactId) return null
  const { data } = await ctx.db.from('contacts').select('id, name, email, phone').eq('company_id', ctx.companyId).eq('id', ctx.contactId).maybeSingle()
  return data || null
}

/** Is this order the conversation's customer's? */
function belongsTo(order: any, contact: any): boolean {
  if (!contact) return false
  if (order.contact_id && order.contact_id === contact.id) return true
  if (contact.email && lc(order.customer_email) === lc(contact.email)) return true
  const p = digits9(contact.phone)
  return !!p && p.length >= 8 && (order.customer_phone_norm === p || digits9(order.customer_phone) === p)
}

function proven(ctx: ActionContext): Set<string> {
  return (ctx.scratch.provenOrders ||= new Set<string>())
}

function summary(o: any) {
  return {
    orderId: o.id, orderNumber: o.order_number, placed: (o.order_date || o.created_at || '').slice(0, 10),
    status: statusMeta(o.status).label, total: o.total != null ? `${Number(o.total).toFixed(2)} ${o.currency || 'AUD'}` : null,
    shipped: !!o.shipped_at || o.status === 'shipped', delivered: !!o.delivered_at,
  }
}

export const findCustomerOrders: ActionDef = {
  key: 'find_customer_orders',
  description: 'The customer’s own recent orders. If the customer isn’t identified, pass the order number AND the email or phone they ordered with — both must match.',
  input: obj({
    orderNumber: { type: 'string', description: 'If the customer gave one.' },
    email: { type: 'string', description: 'Only needed when the customer isn’t identified.' },
    phone: { type: 'string', description: 'Only needed when the customer isn’t identified.' },
  }),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const num = cleanNum(args?.orderNumber)
    const contact = ctx.customerVerification !== 'unknown' ? await contactOf(ctx) : null

    if (contact) {
      const conds = [`contact_id.eq.${contact.id}`]
      if (contact.email) conds.push(`customer_email.ilike.${String(contact.email).replace(/[,()]/g, '')}`)
      const p = digits9(contact.phone)
      if (p.length >= 8) conds.push(`customer_phone_norm.eq.${p}`)
      let q = ctx.db.from('orders').select(ORDER_COLS).eq('company_id', ctx.companyId).or(conds.join(','))
      if (num) q = q.eq('order_number', num)
      const since = new Date(Date.now() - 180 * 86_400_000).toISOString()
      const { data } = await q.gte('created_at', since).order('created_at', { ascending: false }).limit(5)
      const rows = (data || []).filter((o: any) => belongsTo(o, contact))
      rows.forEach((o: any) => proven(ctx).add(o.id))
      if (!rows.length) return { ok: true, data: { orders: [], note: num ? `No order #${num} found for this customer in the last 6 months.` : 'This customer has no orders in the last 6 months.' } }
      return { ok: true, data: { orders: rows.map(summary) } }
    }

    // Not identified: order number + a matching email or phone.
    const email = lc(args?.email), phone = digits9(args?.phone)
    if (!num || (!email && phone.length < 8)) {
      return { ok: true, data: { orders: [], needs: 'Ask the customer for their order number and the email or phone number they ordered with.' } }
    }
    const { data } = await ctx.db.from('orders').select(ORDER_COLS).eq('company_id', ctx.companyId).eq('order_number', num).limit(3)
    const match = (data || []).find((o: any) => (email && lc(o.customer_email) === email) || (phone.length >= 8 && (o.customer_phone_norm === phone || digits9(o.customer_phone) === phone)))
    if (!match) return { ok: true, data: { orders: [], note: 'Couldn’t match that order number with those details. Ask the customer to double-check, or escalate.' } }
    proven(ctx).add(match.id)
    return { ok: true, data: { orders: [summary(match)], matchedBy: email ? 'order number + email' : 'order number + phone' } }
  },
}

export const checkOrderStatus: ActionDef = {
  key: 'check_order_status',
  description: 'Where an order is right now: status, shipments, carrier tracking, delivery estimate, and whether it looks normal or needs a person. Use an orderId from find_customer_orders.',
  input: obj({ orderId: { type: 'string' } }, ['orderId']),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const { data: order } = await ctx.db.from('orders').select(ORDER_COLS).eq('company_id', ctx.companyId).eq('id', String(args?.orderId || '')).maybeSingle()
    if (!order) return { ok: false, error: 'Order not found. Use find_customer_orders first.' }
    // Only an order this customer has been shown to own, in this run or by contact.
    if (!proven(ctx).has(order.id) && !belongsTo(order, await contactOf(ctx))) {
      return { ok: false, error: 'That order isn’t linked to this customer. Use find_customer_orders.' }
    }
    const tracking = await getOrderTracking(ctx.db, ctx.companyId, order, { live: true, save: ctx.mode === 'live' })
    const assessment = assessOrder(tracking, await loadThresholds(ctx.db, ctx.companyId))
    return {
      ok: true,
      data: {
        orderNumber: tracking.orderNumber, stage: tracking.stage, placed: (tracking.placedAt || '').slice(0, 10),
        shipments: tracking.shipments.map(s => ({
          carrier: s.carrier, trackingNumber: s.trackingNumber, trackingLink: s.trackingUrl, status: s.status, carrierSays: s.statusText,
          shipped: s.shippedAt?.slice(0, 10) || null, estimatedDelivery: s.estimatedDelivery?.slice(0, 10) || null, delivered: s.deliveredAt?.slice(0, 10) || null,
          latest: s.lastEvent ? `${s.lastEvent.text}${s.lastEvent.place ? ` — ${s.lastEvent.place}` : ''}${s.lastEvent.at ? ` (${s.lastEvent.at.slice(0, 10)})` : ''}` : null,
        })),
        assessment: { verdict: assessment.verdict, reasons: assessment.reasons, ...assessment.facts },
        guidance: assessment.verdict === 'escalate'
          ? 'Tell the customer you’re getting the team onto it, then escalate_to_human with the reasons.'
          : assessment.verdict === 'needs_attention'
            ? 'Give the customer the facts you have, say the team will check, and create_task so a person follows up.'
            : 'Give the customer the status, and the tracking link if there is one.',
        trackedVia: tracking.sources, notes: tracking.notes,
      },
      entityType: 'order', entityId: order.id,
      summary: `Order #${tracking.orderNumber}: ${tracking.stage} · ${assessment.verdict}`,
    }
  },
}
