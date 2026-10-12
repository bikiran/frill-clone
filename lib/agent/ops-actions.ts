// Operations Agent actions (Phase 8): orders that are late, stuck or held up
// by an out-of-stock item.
//
// A run is tied to ONE flagged order (run.input.orderId), found by the sweep
// in lib/agent/operations.ts. The agent looks at it, checks live tracking or
// stock, and brings the team a task. It can also write the customer a short,
// honest update — posted in their conversation and delivered by SMS (else
// email), never for an in-store sale, a cancelled order or someone who opted out.

import { getOrderTracking } from '@/lib/tracking'
import { assessOrder, loadThresholds } from '@/lib/order-assess'
import { statusMeta, displayStatus } from '@/lib/orders'
import { orderProgress } from '@/lib/order-progress'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { isWithinSendingHours } from '@/lib/campaign-sender'
import type { ActionContext, ActionDef, JsonSchema, PolicyLimits } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const days = (iso?: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null)

export const OPS_ORDER_COLS = 'id, order_number, status, payment_status, fulfilment_status, total, currency, order_date, created_at, customer_name, customer_email, customer_phone, customer_phone_norm, contact_id, conversation_id, shipping_address, sales_channel, carrier, tracking_number, tracking_url, shipped_at, delivered_at, assignee_name, metadata, store_location_id'

/** The business's own timezone: bookings first, then the cart message settings. */
export async function businessTimezone(db: any, companyId: string): Promise<string> {
  const { data: co } = await db.from('companies').select('booking_settings, order_chat_automation').eq('id', companyId).maybeSingle()
  const tz = String(co?.booking_settings?.timezone || co?.order_chat_automation?.cart_recovery?.timezone || '').trim()
  try { if (tz) { new Intl.DateTimeFormat('en-AU', { timeZone: tz }); return tz } } catch {}
  return 'Australia/Melbourne'
}

async function theOrder(ctx: ActionContext, id?: string | null) {
  const input = ctx.scratch.runInput || {}
  const orderId = id || input.orderId
  if (orderId) {
    const { data } = await ctx.db.from('orders').select(OPS_ORDER_COLS).eq('company_id', ctx.companyId).eq('id', String(orderId)).maybeSingle()
    if (data) return data
  }
  // Sandbox: a real order picked by number.
  if (!id && input.orderNumber) {
    const num = String(input.orderNumber).replace(/^#/, '').trim()
    const { data } = await ctx.db.from('orders').select(OPS_ORDER_COLS).eq('company_id', ctx.companyId).eq('order_number', num).limit(1)
    if (data?.[0]) return data[0]
  }
  return null
}

async function canMessage(db: any, companyId: string, order: any): Promise<{ ok: boolean; why?: string; contact?: any }> {
  if (order.sales_channel === 'pos') return { ok: false, why: 'an in-store sale' }
  if (['cancelled', 'refunded'].includes(String(order.status))) return { ok: false, why: `the order is ${order.status}` }
  let contact: any = null
  if (order.contact_id) {
    const { data } = await db.from('contacts').select('id, name, phone, email, is_blocked, unsubscribed_at').eq('company_id', companyId).eq('id', order.contact_id).maybeSingle()
    contact = data
  }
  if (contact?.is_blocked || contact?.unsubscribed_at) return { ok: false, why: 'the customer opted out' }
  if (!order.customer_phone && !order.customer_email && !contact?.phone && !contact?.email) return { ok: false, why: 'no phone or email on file' }
  return { ok: true, contact }
}

export const getException: ActionDef = {
  key: 'get_exception',
  description: 'The problem you were asked to look at: the order (items, customer, status, how long it’s been), what looks wrong — or the out-of-stock item holding it up — plus tasks already open on it and whether the customer has been in touch.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: false,
  async run(ctx) {
    const input = ctx.scratch.runInput || {}
    const order = await theOrder(ctx)
    if (!order) return { ok: false, error: input.orderNumber ? `No order #${input.orderNumber} found.` : 'This run has no order.' }
    ctx.scratch.opsOrder = order
    let alert: any = null
    if (input.kind === 'stock' && input.alertId) {
      const { data } = await ctx.db.from('order_stock_alerts').select('id, product_name, sku, quantity, status, note, created_at, updated_at').eq('company_id', ctx.companyId).eq('id', input.alertId).maybeSingle()
      alert = data
    }
    const [{ data: items }, { data: tasks }, msg, reach, progress] = await Promise.all([
      ctx.db.from('order_items').select('product_name, sku, quantity').eq('order_id', order.id).limit(20),
      ctx.db.from('conversation_tasks').select('title, status, created_at').eq('company_id', ctx.companyId).eq('order_id', order.id).eq('done', false).limit(5),
      order.conversation_id
        ? ctx.db.from('messages').select('content, created_at').eq('conversation_id', order.conversation_id).eq('sender_type', 'visitor').order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] }),
      canMessage(ctx.db, ctx.companyId, order),
      orderProgress(ctx.db, ctx.companyId, order).catch(() => null),
    ])
    const last = (msg as any)?.data?.[0]
    const issue = input.kind === 'stock'
      ? `${alert?.product_name || input.product || 'An item'} on this order is out of stock${alert?.status === 'resolved' ? ' (since marked resolved)' : ''}.`
      : (Array.isArray(input.reasons) && input.reasons.length ? input.reasons.join(' ') : 'Check whether this order needs a person.')
    return {
      ok: true,
      data: {
        issue,
        order: {
          orderId: order.id, orderNumber: order.order_number, placed: (order.order_date || order.created_at || '').slice(0, 10), daysSincePlaced: days(order.order_date || order.created_at),
          status: statusMeta(displayStatus(order)).label, payment: order.payment_status || null, channel: order.sales_channel || null,
          total: order.total != null ? `${Number(order.total).toFixed(2)} ${order.currency || 'AUD'}` : null,
          customer: order.customer_name || null, assignedTo: order.assignee_name || null,
          shippedDaysAgo: days(order.shipped_at), carrier: order.carrier || null, trackingNumber: order.tracking_number || null,
          items: progress
            ? progress.items.map(i => ({ name: i.name, sku: i.sku, qty: i.qty, state: i.state, ...(progress.split ? { shipment: i.shipment } : {}) }))
            : (items || []).map((i: any) => ({ name: i.product_name, sku: i.sku || null, qty: i.quantity || 1 })),
          ...(progress ? { progress: progress.summary, ...(progress.outlet ? { outlet: progress.outlet } : {}), ...(progress.waitingOnStock.length ? { waitingOnStock: progress.waitingOnStock } : {}) } : {}),
        },
        ...(alert ? { outOfStock: { product: alert.product_name, sku: alert.sku || null, qty: alert.quantity || 1, flagged: (alert.created_at || '').slice(0, 10), stillPending: alert.status === 'pending', note: alert.note || null } } : {}),
        openTasks: (tasks || []).map((t: any) => ({ title: t.title, created: (t.created_at || '').slice(0, 10) })),
        customer: { canMessage: reach.ok, ...(reach.ok ? {} : { whyNot: reach.why }), lastMessage: last ? { text: String(last.content || '').slice(0, 300), at: (last.created_at || '').slice(0, 10) } : null },
      },
      entityType: 'order', entityId: order.id,
      summary: `Order #${order.order_number}: ${issue}`.slice(0, 200),
    }
  },
}

export const checkOrderTracking: ActionDef = {
  key: 'check_order_tracking',
  description: 'Live tracking for an order: shipments, what the carrier says, the delivery estimate, and whether it looks normal. Defaults to the order you’re looking at.',
  input: obj({ orderId: { type: 'string', description: 'Optional — defaults to the flagged order.' } }),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: false,
  async run(ctx, args) {
    const order = args?.orderId ? await theOrder(ctx, String(args.orderId)) : (ctx.scratch.opsOrder || await theOrder(ctx))
    if (!order) return { ok: false, error: 'Order not found.' }
    const tracking = await getOrderTracking(ctx.db, ctx.companyId, order, { live: true, save: ctx.mode === 'live' })
    const a = assessOrder(tracking, await loadThresholds(ctx.db, ctx.companyId))
    return {
      ok: true,
      data: {
        orderNumber: tracking.orderNumber, stage: tracking.stage,
        shipments: tracking.shipments.map(s => ({
          carrier: s.carrier, trackingNumber: s.trackingNumber, trackingLink: s.trackingUrl, status: s.status, carrierSays: s.statusText,
          shipped: s.shippedAt?.slice(0, 10) || null, estimatedDelivery: s.estimatedDelivery?.slice(0, 10) || null, delivered: s.deliveredAt?.slice(0, 10) || null,
          latest: s.lastEvent ? `${s.lastEvent.text}${s.lastEvent.place ? ` — ${s.lastEvent.place}` : ''}${s.lastEvent.at ? ` (${s.lastEvent.at.slice(0, 10)})` : ''}` : null,
        })),
        assessment: { verdict: a.verdict, reasons: a.reasons, ...a.facts },
        trackedVia: tracking.sources, notes: tracking.notes,
      },
      entityType: 'order', entityId: order.id,
      summary: `Order #${tracking.orderNumber}: ${tracking.stage} · ${a.verdict}`,
    }
  },
}

const MONEY = /refund|compensat|discount|coupon|voucher|store credit|\d{1,2}\s?%|free (shipping|delivery|postage)/i

async function updateOnItsOwn(ctx: ActionContext, args: any, _limits: PolicyLimits): Promise<string | null> {
  if (!ctx.scratch.opsOrder) return 'It didn’t look at the order first, so a person approves the update.'
  const done = ctx.scratch.done || {}
  if (!done.check_order_tracking && !done.check_stock) return 'It didn’t check tracking or stock in this run, so a person approves the update.'
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the update.'
  if (MONEY.test(String(args?.text || ''))) return 'The update mentions a refund, discount or credit, so a person approves it.'
  if (!isWithinSendingHours(new Date(), await businessTimezone(ctx.db, ctx.companyId))) return 'It’s outside sending hours, so a person sends it later.'
  return null
}

export const sendOrderUpdate: ActionDef = {
  key: 'send_order_update',
  description: 'Send the customer a short, honest update about their order (SMS, else email) — e.g. it’s taking longer than usual and the team is on it. Plain text, 1–3 sentences, their first name, the order number. Never promise refunds, compensation, or dates you haven’t confirmed.',
  input: obj({ text: { type: 'string', description: 'The update for the customer.' } }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: updateOnItsOwn,
  async run(ctx, args) {
    const order = ctx.scratch.opsOrder || await theOrder(ctx)
    if (!order) return { ok: false, error: 'This run has no order.' }
    return sendForOrder(ctx.db, ctx.companyId, order, String(args?.text || ''), ctx.siteOrigin, { agent_run_id: ctx.runId, agent_name: 'Operations Agent' })
  },
}

/** This order's conversation, else the customer's latest, else a new one. */
async function orderConversation(db: any, companyId: string, order: any, phone: string | null) {
  if (order.conversation_id) {
    const { data } = await db.from('conversations').select('id, channel, contact_id').eq('company_id', companyId).eq('id', order.conversation_id).maybeSingle()
    if (data) return data
  }
  if (order.contact_id) {
    const { data } = await db.from('conversations').select('id, channel, contact_id').eq('company_id', companyId).eq('contact_id', order.contact_id).order('last_message_at', { ascending: false }).limit(1)
    if (data?.[0]) return data[0]
  }
  const { data } = await db.from('conversations').insert({
    company_id: companyId, channel: 'chat', subject: order.customer_name || `Order #${order.order_number}`, contact_id: order.contact_id || null,
    status: 'open', last_message: '', last_message_at: new Date().toISOString(), sms_number: phone, sms_enabled: !!phone,
  }).select('id, channel, contact_id').maybeSingle()
  return data || null
}

/** Re-check the order and deliver the update. Shared with approvals. */
export async function sendForOrder(db: any, companyId: string, order: any, raw: string, origin: string, meta: Record<string, any>) {
  const text = raw.trim().slice(0, 700)
  if (!text) return { ok: false, error: 'Nothing to send.' }
  const { data: fresh } = await db.from('orders').select(OPS_ORDER_COLS).eq('company_id', companyId).eq('id', order.id).maybeSingle()
  const o = fresh || order
  const reach = await canMessage(db, companyId, o)
  if (!reach.ok) return { ok: false, error: `Not sent: ${reach.why}.` }
  const phone = o.customer_phone || reach.contact?.phone || null
  const email = o.customer_email || reach.contact?.email || null
  const conv = await orderConversation(db, companyId, o, phone)
  if (!conv) return { ok: false, error: 'Couldn’t find or start a conversation with the customer.' }
  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const business = co?.name || 'us'
  const { data: msg } = await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId, sender_type: 'agent', sender_name: business,
    content: text, message_type: 'text', is_read: true, metadata: { auto: true, order_update: o.id, ...meta },
  }).select('id').maybeSingle()
  await db.from('conversations').update({ last_message: text, last_message_at: new Date().toISOString() }).eq('id', conv.id)
  const d = await deliverAutomatedMessage({
    companyId, conversationId: conv.id, text, phone, email, preferChannel: phone ? 'sms' : 'email',
    senderName: business, subject: `An update on your order #${o.order_number} from ${business}`, origin, db,
  })
  if (msg?.id && (d.channel === 'sms' || d.channel === 'email')) {
    try { await db.from('messages').update({ delivery_channel: d.channel }).eq('id', msg.id) } catch {}
  }
  return d.sent
    ? { ok: true, data: { sent: true, channel: d.channel }, entityType: 'conversation', entityId: conv.id, summary: `Updated the customer by ${d.channel}` }
    : { ok: false, error: d.error || 'Not delivered.' }
}

/** For approvals: a person approved (or edited) the update. */
export async function sendApprovedOrderUpdate(db: any, companyId: string, run: any, text: string, user: { id: string | null; name: string | null }) {
  const { data: order } = await db.from('orders').select(OPS_ORDER_COLS).eq('company_id', companyId).eq('id', run?.input?.orderId || '').maybeSingle()
  if (!order) return { ok: false, error: 'This order no longer exists.' }
  const r = await sendForOrder(db, companyId, order, text, process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com', { agent_run_id: run.id, agent_name: 'Operations Agent', approved_by: user.name, approved_by_id: user.id })
  return r.ok ? { ok: true, channel: (r as any).data?.channel } : { ok: false, error: r.error }
}
