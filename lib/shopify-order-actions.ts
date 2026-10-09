// Shopify order write-back: the actions staff (and the Colvy AI) take on an
// order from Colvy — mark paid, fulfil, hold, cancel, refund, change items —
// done in Shopify, then the order is re-read into the operational `orders`
// table so Colvy shows the result straight away (the orders/updated webhook
// follows and runs the order automations, exactly like a WooCommerce change).
//
// The routes under /api/orders/* keep their WooCommerce code; when the order
// they're given is a Shopify one (resolveShopifyOrderRef), they hand over to
// the functions here instead. Shapes are WooCommerce's (status words, line
// items, refunds) so the UI and the AI tools need no channel checks.

import { createHash } from 'crypto'
import { serviceFor } from '@/lib/shopify-sync'
import { upsertShopifyOrder } from '@/lib/shopify-orders'
import { statusWord } from '@/lib/shopify-automation'
import type { ShopifyService } from '@/lib/shopify-service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const legacy = (gid: any): string => String(gid ?? '').match(/(\d+)$/)?.[1] || ''
const money = (set: any): number => parseFloat(set?.shopMoney?.amount) || 0
const orderGid = (id: string | number) => `gid://shopify/Order/${id}`
const lineGid = (id: string | number) => String(id).startsWith('gid://') ? String(id) : `gid://shopify/LineItem/${id}`

// Scopes the write-back needs beyond the original install (see SHOPIFY_SCOPES).
export const WRITE_BACK_SCOPES = ['write_orders', 'write_order_edits', 'write_merchant_managed_fulfillment_orders']
export const missingWriteScopes = (integ: any): string[] => {
  const have = String(integ?.scopes || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!have.length) return []   // unknown (pasted-token stores report none) — let Shopify decide
  // write_X implies read_X; Shopify reports only the write scope.
  return WRITE_BACK_SCOPES.filter(s => !have.includes(s))
}

export type ShopifyOrderRef = { row: any | null; integ: any; externalId: string }

/**
 * Is this order reference a Shopify order? Accepts what the different callers
 * pass: the inbox's "shopify-<id>", an `orders` row id, or a Shopify order id
 * with channel 'shopify'. Returns null for anything else (= a WooCommerce
 * order, handled by the caller as before).
 */
export async function resolveShopifyOrderRef(db: any, companyId: string, ref: { orderId?: any; channel?: any; orderRowId?: any }): Promise<ShopifyOrderRef | null> {
  const raw = String(ref.orderId ?? '').trim()
  // A Shopify draft (an unpaid order created from Colvy, "shopify-draft-<id>")
  // isn't an order yet — never let it fall through to WooCommerce.
  if (/^shopify-draft-/i.test(raw)) throw new ShopifyActionError('That’s still a Shopify draft order (awaiting payment) — change it in Shopify, or wait until the customer pays.', 409)
  let row: any = null
  let externalId = ''
  const rowId = ref.orderRowId && UUID.test(String(ref.orderRowId)) ? String(ref.orderRowId) : UUID.test(raw) ? raw : ''
  if (rowId) {
    const { data } = await db.from('orders').select('id, company_id, sales_channel, external_order_id, order_number, metadata, conversation_id, contact_id, customer_email, customer_phone')
      .eq('id', rowId).eq('company_id', companyId).maybeSingle()
    if (data?.sales_channel !== 'shopify') return null
    row = data; externalId = String(data.external_order_id || '')
  } else if (/^shopify-\d+$/i.test(raw) || (String(ref.channel || '').toLowerCase() === 'shopify' && /^\d+$/.test(raw))) {
    externalId = raw.replace(/^shopify-/i, '')
    const { data } = await db.from('orders').select('id, company_id, sales_channel, external_order_id, order_number, metadata, conversation_id, contact_id, customer_email, customer_phone')
      .eq('company_id', companyId).eq('sales_channel', 'shopify').eq('external_order_id', externalId).maybeSingle()
    row = data || null
  } else return null
  if (!externalId) return null

  // The store: the one recorded on the order, else the workspace's only one.
  const shop = String(row?.metadata?.shopify?.shop || '').toLowerCase()
  let integ: any = null
  if (shop) {
    const { data } = await db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('store_domain', shop).maybeSingle()
    integ = data
  }
  if (!integ) {
    const { data } = await db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('is_active', true).limit(2)
    if (data?.length === 1) integ = data[0]
  }
  if (!integ) throw new ShopifyActionError('This order’s Shopify store isn’t connected to Colvy any more.', 404)
  if (!integ.is_active || integ.needs_reauth) throw new ShopifyActionError('Reconnect this Shopify store in Colvy → Integrations → Shopify to change its orders.', 409)
  return { row, integ, externalId }
}

export class ShopifyActionError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

// A mutation's errors — top-level GraphQL errors or the payload's userErrors —
// as one readable message, with the scope hint when access was denied.
function check(label: string, errors: any[], userErrors: any[] | undefined) {
  const all = [...(errors || []), ...(userErrors || [])].map((e: any) => e?.message || String(e)).filter(Boolean)
  if (!all.length) return
  if (all.some(m => /access denied|scope|not approved|requires.*access/i.test(m))) {
    throw new ShopifyActionError('Colvy needs permission to change orders in this store. Reconnect it in Colvy → Integrations → Shopify and approve the new permissions.', 403)
  }
  throw new ShopifyActionError(`${label}: ${all.join('; ')}`, 422)
}

/** Re-read the order and save it, so Colvy reflects the change immediately. */
async function refresh(db: any, ref: ShopifyOrderRef, svc: ShopifyService) {
  const o = await svc.getOrder(ref.externalId)
  if (o) { try { await upsertShopifyOrder(db, ref.integ.company_id, o, { quiet: true, svc }) } catch {} }
  return o
}

// ── Status ────────────────────────────────────────────────────────────────

async function fulfillmentOrders(svc: ShopifyService, externalId: string) {
  const { data, errors } = await svc.gql<any>(
    `query FO($id: ID!) { order(id: $id) { id displayFinancialStatus fulfillmentOrders(first: 20) { nodes { id status supportedActions { action } } } } }`,
    { id: orderGid(externalId) },
  )
  check('Couldn’t read the order', errors, [])
  if (!data?.order) throw new ShopifyActionError('That order wasn’t found in Shopify.', 404)
  return { order: data.order, fos: (data.order.fulfillmentOrders?.nodes || []) as any[] }
}
const can = (fo: any, action: string) => (fo.supportedActions || []).some((a: any) => a?.action === action)

async function markPaid(svc: ShopifyService, externalId: string, fin: string) {
  if (!['PENDING', 'PARTIALLY_PAID', 'AUTHORIZED'].includes(String(fin || '').toUpperCase())) return false
  const { data, errors } = await svc.gql<any>(
    `mutation Paid($input: OrderMarkAsPaidInput!) { orderMarkAsPaid(input: $input) { order { id displayFinancialStatus } userErrors { field message } } }`,
    { input: { id: orderGid(externalId) } },
  )
  check('Couldn’t mark it paid', errors, data?.orderMarkAsPaid?.userErrors)
  return true
}

async function releaseHolds(svc: ShopifyService, fos: any[]) {
  for (const fo of fos.filter(f => f.status === 'ON_HOLD' && can(f, 'RELEASE_HOLD'))) {
    const { data, errors } = await svc.gql<any>(
      `mutation Release($id: ID!) { fulfillmentOrderReleaseHold(id: $id) { fulfillmentOrder { id status } userErrors { field message } } }`, { id: fo.id })
    check('Couldn’t take it off hold', errors, data?.fulfillmentOrderReleaseHold?.userErrors)
  }
}

/** Fulfil everything still open (tracking optional), without Shopify's own email. */
export async function fulfilOpen(svc: ShopifyService, fos: any[], tracking?: { number?: string; company?: string; url?: string } | null) {
  const open = fos.filter(f => ['OPEN', 'IN_PROGRESS'].includes(f.status) && can(f, 'CREATE_FULFILLMENT'))
  if (!open.length) return 0
  // A fulfillment covers fulfillment orders from one location — one call each.
  for (const fo of open) {
    const fulfillment: any = { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }], notifyCustomer: false }
    if (tracking?.number || tracking?.url) fulfillment.trackingInfo = { number: tracking.number || undefined, company: tracking.company || undefined, url: tracking.url || undefined }
    const { data, errors } = await svc.gql<any>(
      `mutation Fulfil($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } } }`,
      { fulfillment },
    )
    check('Couldn’t mark it fulfilled', errors, data?.fulfillmentCreate?.userErrors)
  }
  return open.length
}

/**
 * Apply a WooCommerce status word to a Shopify order:
 *   processing → record a pending payment as paid, release any hold
 *   completed  → paid (as WooCommerce's set_paid) + fulfil what's open
 *   on-hold    → hold the open fulfilment orders
 *   cancelled  → cancel (restock, no refund — like WooCommerce; Colvy sends
 *                its own message, so Shopify's email is off)
 */
export async function shopifyChangeStatus(db: any, ref: ShopifyOrderRef, status: string, opts: { reason?: string } = {}) {
  const svc = await serviceFor(db, ref.integ)
  const s = String(status || '').toLowerCase()
  if (s === 'refunded') throw new ShopifyActionError('Use “Issue refund” to refund a Shopify order.', 400)
  if (s === 'cancelled') {
    const { data, errors } = await svc.gql<any>(
      `mutation Cancel($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!, $notifyCustomer: Boolean, $staffNote: String, $refundMethod: OrderCancelRefundMethodInput) {
        orderCancel(orderId: $orderId, reason: $reason, restock: $restock, notifyCustomer: $notifyCustomer, staffNote: $staffNote, refundMethod: $refundMethod) {
          job { id done } orderCancelUserErrors { field message code }
        }
      }`,
      { orderId: orderGid(ref.externalId), reason: 'OTHER', restock: true, notifyCustomer: false, staffNote: (opts.reason || 'Cancelled from Colvy').slice(0, 255), refundMethod: { originalPaymentMethodsRefund: false } },
    )
    check('Couldn’t cancel it', errors, data?.orderCancel?.orderCancelUserErrors)
    // Cancellation runs as a job; give it a moment so the re-read shows it.
    for (let i = 0; i < 4; i++) {
      const o = await svc.getOrder(ref.externalId)
      if (o?.cancelledAt) { try { await upsertShopifyOrder(db, ref.integ.company_id, o, { quiet: true, svc }) } catch {}; return { order: o, status: statusWord(o) } }
      await new Promise(r => setTimeout(r, 700))
    }
    const o = await refresh(db, ref, svc)
    return { order: o, status: o ? statusWord(o) : 'cancelled' }
  }

  const { order, fos } = await fulfillmentOrders(svc, ref.externalId)
  if (s === 'processing') {
    await markPaid(svc, ref.externalId, order.displayFinancialStatus)
    await releaseHolds(svc, fos)
  } else if (s === 'completed') {
    await markPaid(svc, ref.externalId, order.displayFinancialStatus)
    await releaseHolds(svc, fos)
    const { fos: again } = await fulfillmentOrders(svc, ref.externalId)
    await fulfilOpen(svc, again)
  } else if (s === 'on-hold') {
    const open = fos.filter(f => ['OPEN', 'IN_PROGRESS'].includes(f.status) && can(f, 'HOLD'))
    if (!open.length) throw new ShopifyActionError('Nothing left to hold — this order has no open items to fulfil.', 409)
    for (const fo of open) {
      const { data, errors } = await svc.gql<any>(
        `mutation Hold($id: ID!, $fulfillmentHold: FulfillmentOrderHoldInput!) { fulfillmentOrderHold(id: $id, fulfillmentHold: $fulfillmentHold) { fulfillmentOrder { id status } userErrors { field message } } }`,
        { id: fo.id, fulfillmentHold: { reason: 'OTHER', reasonNotes: (opts.reason || 'Put on hold from Colvy').slice(0, 255) } },
      )
      check('Couldn’t put it on hold', errors, data?.fulfillmentOrderHold?.userErrors)
    }
  } else {
    throw new ShopifyActionError(`Shopify orders can’t be set to “${status}”.`, 400)
  }
  const o = await refresh(db, ref, svc)
  return { order: o, status: o ? statusWord(o) : s }
}

// ── Refunds ───────────────────────────────────────────────────────────────

export type RefundRequest = {
  amount?: number | null                 // total to refund; default = what the items + shipping come to
  reason?: string
  lineItems?: { id: string | number; qty: number }[]
  shipping?: number | null               // shipping amount to refund
  restock?: boolean
  idempotencyKey?: string
}

/**
 * Refund through Shopify. Shopify works out what the chosen items (and
 * shipping) come to and which payments to refund (suggestedRefund); a custom
 * amount is spread over the same payments. Money goes back to the original
 * payment method. The idempotency key (required by Shopify for refunds) is
 * derived from the request, so a double click can't refund twice.
 */
export async function shopifyRefund(db: any, ref: ShopifyOrderRef, r: RefundRequest) {
  const svc = await serviceFor(db, ref.integ)
  const refundLineItems = (r.lineItems || []).filter(li => Number(li.qty) > 0).map(li => ({
    lineItemId: lineGid(li.id), quantity: Math.floor(Number(li.qty)), restockType: r.restock ? 'RETURN' : 'NO_RESTOCK',
  }))
  const shippingAmount = r.shipping && r.shipping > 0 ? Number(r.shipping.toFixed(2)) : null
  const itemised = refundLineItems.length > 0 || shippingAmount != null

  const { data: s, errors: se } = await svc.gql<any>(
    `query Suggest($id: ID!, $items: [RefundLineItemInput!], $shipping: Money, $full: Boolean) {
      order(id: $id) {
        id name currencyCode displayFinancialStatus
        totalRefundedSet { shopMoney { amount } }
        suggestedRefund(refundLineItems: $items, shippingAmount: $shipping, suggestFullRefund: $full) {
          amountSet { shopMoney { amount currencyCode } }
          maximumRefundableSet { shopMoney { amount } }
          suggestedTransactions { gateway kind amountSet { shopMoney { amount } } parentTransaction { id } }
        }
      }
    }`,
    { id: orderGid(ref.externalId), items: refundLineItems.map(({ restockType, ...x }) => x), shipping: shippingAmount, full: !itemised },
  )
  check('Couldn’t work out the refund', se, [])
  const order = s?.order
  if (!order) throw new ShopifyActionError('That order wasn’t found in Shopify.', 404)
  const sug = order.suggestedRefund || {}
  const maximum = money(sug.maximumRefundableSet)
  const suggested = money(sug.amountSet)
  const want = r.amount != null && Number(r.amount) > 0 ? Number(Number(r.amount).toFixed(2)) : suggested
  if (want <= 0 && !refundLineItems.length) throw new ShopifyActionError('There’s nothing left to refund on this order.', 409)
  if (maximum > 0 && want > maximum + 0.005) throw new ShopifyActionError(`At most $${maximum.toFixed(2)} can be refunded on this order.`, 400)

  // Spread the amount over the payments Shopify suggests refunding (in order).
  const parents = (sug.suggestedTransactions || []).filter((t: any) => t?.parentTransaction?.id)
  let left = want
  const transactions: any[] = []
  for (const t of parents) {
    if (left <= 0.004) break
    const cap = money(t.amountSet) || left
    const amt = Number(Math.min(left, cap).toFixed(2))
    if (amt <= 0) continue
    transactions.push({ orderId: order.id, parentId: t.parentTransaction.id, gateway: t.gateway, kind: 'REFUND', amount: String(amt) })
    left = Number((left - amt).toFixed(2))
  }
  // Paid by a manual method (cash, bank transfer): nothing to send back
  // through Shopify — the refund is recorded and the money returned by hand.
  if (left > 0.004 && parents.length) throw new ShopifyActionError(`Only $${(want - left).toFixed(2)} can be refunded to the original payment.`, 400)

  const key = r.idempotencyKey || createHash('sha256').update(JSON.stringify([ref.integ.id, ref.externalId, refundLineItems, shippingAmount, want, money(order.totalRefundedSet)])).digest('hex').slice(0, 40)
  const input: any = {
    orderId: order.id,
    note: (r.reason || 'Refunded from Colvy').slice(0, 255),
    notify: false,
    refundLineItems,
    transactions,
  }
  if (shippingAmount != null) input.shipping = { amount: String(shippingAmount) }
  const { data, errors } = await svc.gql<any>(
    `mutation Refund($input: RefundInput!) {
      refundCreate(input: $input) @idempotent(key: "${key}") {
        refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
        userErrors { field message }
      }
    }`,
    { input },
  )
  check('Shopify refused the refund', errors, data?.refundCreate?.userErrors)
  const refunded = money(data?.refundCreate?.refund?.totalRefundedSet) || want
  const o = await refresh(db, ref, svc)
  const totalRefunded = o ? money(o.totalRefundedSet) : refunded
  const total = o ? money(o.totalPriceSet) : 0
  return {
    refundId: legacy(data?.refundCreate?.refund?.id),
    amount: refunded,
    currency: order.currencyCode || 'AUD',
    order: o,
    number: String(order.name || '').replace(/^#/, ''),
    totalRefunded,
    fullyRefunded: !!o && (String(o.displayFinancialStatus).toUpperCase() === 'REFUNDED' || (total > 0 && totalRefunded >= total - 0.005)),
    status: o ? statusWord(o) : 'processing',
  }
}

// ── Editing items ─────────────────────────────────────────────────────────

/**
 * Change line quantities (0 removes the line) through an order edit session.
 * `items` use the order's line item ids, as /api/orders/details returns them.
 */
export async function shopifyEditItems(db: any, ref: ShopifyOrderRef, items: { id: string | number; quantity: number }[], opts: { staffNote?: string } = {}) {
  const svc = await serviceFor(db, ref.integ)
  const changes = (items || []).filter(i => i && i.id != null && Number.isFinite(Number(i.quantity)) && Number(i.quantity) >= 0)
  if (!changes.length) return { order: await refresh(db, ref, svc), changed: 0 }

  // Original lines (id → variant/title) to find each one in the edit.
  const before = await svc.getOrder(ref.externalId)
  if (!before) throw new ShopifyActionError('That order wasn’t found in Shopify.', 404)
  const lines: any[] = before.lineItems?.nodes || []

  const { data: b, errors: be } = await svc.gql<any>(
    `mutation Begin($id: ID!) { orderEditBegin(id: $id) {
      calculatedOrder { id lineItems(first: 100) { nodes { id quantity title variant { id } } } }
      orderEditSession { id }
      userErrors { field message }
    } }`,
    { id: orderGid(ref.externalId) },
  )
  check('Couldn’t start editing the order', be, b?.orderEditBegin?.userErrors)
  const calc = b?.orderEditBegin?.calculatedOrder
  const editId = b?.orderEditBegin?.orderEditSession?.id || calc?.id
  if (!editId) throw new ShopifyActionError('Shopify didn’t open the order for editing.', 502)
  const calcLines: any[] = calc?.lineItems?.nodes || []
  const used = new Set<string>()
  const findCalc = (lineId: string) => {
    const n = legacy(lineId)
    // A calculated line item carries its line item's number…
    let hit = calcLines.find(c => legacy(c.id) === n && !used.has(c.id))
    if (!hit) {
      // …and failing that, match on the variant / title of the original line.
      const orig = lines.find(l => legacy(l.id) === n)
      if (orig) hit = calcLines.find(c => !used.has(c.id) && ((orig.variant?.legacyResourceId && legacy(c.variant?.id) === String(orig.variant.legacyResourceId)) || (!orig.variant && c.title === orig.title)))
    }
    if (hit) used.add(hit.id)
    return hit
  }

  let changed = 0
  for (const ch of changes) {
    const c = findCalc(String(ch.id))
    if (!c) throw new ShopifyActionError('One of those items isn’t on the order any more — reload and try again.', 409)
    if (Number(c.quantity) === Number(ch.quantity)) continue
    const { data, errors } = await svc.gql<any>(
      `mutation Qty($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
        orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) { calculatedLineItem { id quantity } userErrors { field message } }
      }`,
      { id: editId, lineItemId: c.id, quantity: Math.floor(Number(ch.quantity)), restock: true },
    )
    check('Couldn’t change the quantity', errors, data?.orderEditSetQuantity?.userErrors)
    changed++
  }
  if (!changed) return { order: before, changed: 0 }
  const { data: cm, errors: ce } = await svc.gql<any>(
    `mutation Commit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
      orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) { order { id } userErrors { field message } }
    }`,
    { id: editId, notifyCustomer: false, staffNote: (opts.staffNote || 'Edited from Colvy').slice(0, 255) },
  )
  check('Couldn’t save the changes', ce, cm?.orderEditCommit?.userErrors)
  return { order: await refresh(db, ref, svc), changed }
}

/** Append a note to the order's notes in Shopify (its one notes field). */
export async function shopifyAppendNote(db: any, ref: ShopifyOrderRef, text: string) {
  const svc = await serviceFor(db, ref.integ)
  const o = await svc.getOrder(ref.externalId)
  if (!o) throw new ShopifyActionError('That order wasn’t found in Shopify.', 404)
  const stamp = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const note = [String(o.note || '').trim(), `${stamp} — ${String(text).trim()}`].filter(Boolean).join('\n').slice(0, 5000)
  const { data, errors } = await svc.gql<any>(
    `mutation Note($input: OrderInput!) { orderUpdate(input: $input) { order { id note } userErrors { field message } } }`,
    { input: { id: o.id, note } },
  )
  check('Couldn’t save the note', errors, data?.orderUpdate?.userErrors)
  return refresh(db, ref, svc)
}

// ── Reading, in WooCommerce's shape ───────────────────────────────────────

const wooAddr = (a: any, email?: string | null) => a ? {
  first_name: a.firstName || '', last_name: a.lastName || '', company: a.company || '',
  address_1: a.address1 || '', address_2: a.address2 || '', city: a.city || '',
  state: a.provinceCode || a.province || '', postcode: a.zip || '', country: a.countryCodeV2 || a.country || '',
  phone: a.phone || '', ...(email !== undefined ? { email: email || '' } : {}),
} : null

/**
 * A Shopify order as a WooCommerce REST order, for the routes that serve the
 * refund modal, the item editor and invoices. Line item ids are Shopify's
 * (numeric) so they can be sent back for refunds / edits.
 */
export function shopifyOrderAsWoo(o: any) {
  const lines: any[] = o.lineItems?.nodes || []
  const refunded = money(o.totalRefundedSet)
  return {
    id: Number(o.legacyResourceId) || legacy(o.id),
    number: String(o.name || '').replace(/^#/, ''),
    status: statusWord(o),
    currency: o.currencyCode || 'AUD',
    date_created: o.processedAt || o.createdAt,
    date_modified: o.updatedAt,
    total: money(o.currentTotalPriceSet || o.totalPriceSet).toFixed(2),
    subtotal: money(o.subtotalPriceSet).toFixed(2),
    total_tax: money(o.totalTaxSet).toFixed(2),
    shipping_total: money(o.totalShippingPriceSet).toFixed(2),
    discount_total: money(o.totalDiscountsSet).toFixed(2),
    total_refunded: refunded.toFixed(2),
    refunds: refunded > 0 ? [{ id: 0, total: (-refunded).toFixed(2), reason: '' }] : [],
    payment_method_title: (o.paymentGatewayNames || []).join(', '),
    customer_note: o.note || '',
    billing: wooAddr(o.billingAddress || o.shippingAddress, o.email || null) || { email: o.email || '', phone: o.phone || '' },
    shipping: wooAddr(o.shippingAddress) || {},
    shipping_lines: (o.shippingLines?.nodes || []).map((s: any, i: number) => ({ id: i, method_title: s.title, total: money(o.totalShippingPriceSet).toFixed(2) })),
    coupon_lines: (o.discountCodes || []).map((c: string) => ({ code: c })),
    line_items: lines.map(l => {
      const unit = parseFloat(l.originalUnitPriceSet?.shopMoney?.amount) || 0
      const qty = Number(l.currentQuantity ?? l.quantity) || 0
      return {
        id: Number(legacy(l.id)),
        name: l.name || l.title,
        sku: l.sku || '',
        product_id: Number(l.product?.legacyResourceId) || 0,
        variation_id: Number(l.variant?.legacyResourceId) || 0,
        quantity: qty,
        price: unit,
        subtotal: (unit * qty).toFixed(2),
        total: (unit * qty).toFixed(2),
        total_tax: '0.00',
        taxes: [],
        image: l.image?.url ? { src: l.image.url } : null,
        meta_data: l.variantTitle && l.variantTitle !== 'Default Title' ? [{ key: 'Option', value: l.variantTitle, display_key: 'Option', display_value: l.variantTitle }] : [],
      }
    }).filter(l => l.quantity > 0),
    meta_data: [{ key: '_shopify_order_id', value: String(o.legacyResourceId || legacy(o.id)) }],
    channel: 'shopify',
    status_url: o.statusPageUrl || null,
  }
}

export async function shopifyOrderForUi(db: any, ref: ShopifyOrderRef) {
  const svc = await serviceFor(db, ref.integ)
  const o = await svc.getOrder(ref.externalId)
  if (!o) throw new ShopifyActionError('That order wasn’t found in Shopify.', 404)
  return shopifyOrderAsWoo(o)
}
