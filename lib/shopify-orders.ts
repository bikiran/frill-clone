// Shopify orders → the operational `orders` / `order_items` tables
// (sales_channel = 'shopify'). Mirrors upsertWooOrder so the Orders board,
// reports, dashboard and AI/MCP order tools treat a Shopify order exactly like a
// WooCommerce one:
//   • source fields (totals, customer, address, items) refresh on every update;
//   • staff-owned fields (status, assignee, tags, tracking, outlet, flagged)
//     are only set on insert — except when Shopify reaches a terminal state
//     (fulfilled / cancelled / refunded), which the board follows;
//   • a new order pings the team and fires integration events, unless the call
//     is part of a bulk import (quiet), so a first import of 60 days of orders
//     doesn't flood phones and Slack.

import { insertResilient, updateResilient, loadLocations, matchOutletId, notifyNewOrder, orderEvent, phoneNorm } from '@/lib/orders-sync'
import { statusMeta } from '@/lib/orders'
import { emitIntegrationEvent } from '@/lib/integration-events'
import type { ShopifyService } from '@/lib/shopify-service'

const money = (set: any): number | null => { const n = parseFloat(set?.shopMoney?.amount); return Number.isFinite(n) ? n : null }
const idOf = (gid: any): string | null => { const m = String(gid ?? '').match(/(\d+)$/); return m ? m[1] : null }
const upper = (s: any) => String(s || '').toUpperCase()

// Shopify MailingAddress → the WooCommerce-style keys the board, labels and
// shipping-rate code already read.
export function wooAddress(a: any, email?: string | null) {
  if (!a) return null
  return {
    first_name: a.firstName || '', last_name: a.lastName || '', company: a.company || '',
    address_1: a.address1 || '', address_2: a.address2 || '', city: a.city || '',
    state: a.provinceCode || a.province || '', postcode: a.zip || '', country: a.countryCodeV2 || a.country || '',
    phone: a.phone || '', ...(email ? { email } : {}),
  }
}

export function mapPayment(o: any): string {
  const f = upper(o.displayFinancialStatus)
  if (f === 'PAID' || f === 'PARTIALLY_REFUNDED') return 'paid'
  if (f === 'REFUNDED') return 'refunded'
  if (f === 'VOIDED' || f === 'EXPIRED') return 'failed'
  return 'pending'
}

const shippingTitle = (o: any): string | null => o.shippingLines?.nodes?.[0]?.title || null

// Board status for a NEW order.
export function mapStatus(o: any): string {
  if (o.cancelledAt) return 'cancelled'
  if (upper(o.displayFinancialStatus) === 'REFUNDED') return 'refunded'
  const ful = upper(o.displayFulfillmentStatus)
  if (ful === 'FULFILLED') return 'shipped'
  if (ful === 'ON_HOLD') return 'on_hold'
  if (/pickup|collect/i.test(String(shippingTitle(o) || ''))) return 'click_and_collect'
  return 'awaiting_shipment'
}

export function sourceFields(companyId: string, o: any, contactId: string | null) {
  const lines: any[] = o.lineItems?.nodes || []
  const email = String(o.email || '').trim().toLowerCase() || null
  const ship = o.shippingAddress || null
  const bill = o.billingAddress || null
  const phone = o.phone || ship?.phone || bill?.phone || null
  const nameFrom = (a: any) => [a?.firstName, a?.lastName].filter(Boolean).join(' ').trim()
  const name = nameFrom(bill) || nameFrom(ship) || [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ').trim() || email || 'Customer'
  return {
    company_id: companyId,
    ...(contactId ? { contact_id: contactId } : {}),
    external_order_id: String(o.legacyResourceId || idOf(o.id)),
    order_number: String(o.name || '').replace(/^#/, '') || String(o.legacyResourceId || ''),
    sales_channel: 'shopify',
    payment_status: mapPayment(o),
    shipping_method: shippingTitle(o),
    primary_sku: lines[0]?.sku || null,
    subtotal: money(o.subtotalPriceSet),
    shipping_total: money(o.totalShippingPriceSet),
    tax_total: money(o.totalTaxSet),
    discount_total: money(o.totalDiscountsSet),
    total: money(o.totalPriceSet),
    currency: o.currencyCode || o.totalPriceSet?.shopMoney?.currencyCode || 'AUD',
    item_count: lines.reduce((n, li) => n + (Number(li.quantity) || 0), 0),
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    customer_phone_norm: phoneNorm(phone),
    customer_note: o.note || null,
    shipping_address: wooAddress(ship || bill, email),
    order_date: o.processedAt || o.createdAt || null,
    updated_at: new Date().toISOString(),
  }
}

export function itemRows(companyId: string, orderId: string, o: any) {
  return (o.lineItems?.nodes || []).map((li: any) => {
    const qty = Number(li.quantity) || 1
    const unit = parseFloat(li.originalUnitPriceSet?.shopMoney?.amount)
    const variantTitle = li.variantTitle && li.variantTitle !== 'Default Title' ? li.variantTitle : null
    return {
      order_id: orderId, company_id: companyId,
      product_id: li.product?.legacyResourceId ? String(li.product.legacyResourceId) : null,
      product_name: li.name || li.title || 'Item',
      sku: li.sku || null,
      quantity: qty,
      unit_price: Number.isFinite(unit) ? unit : null,
      total_price: Number.isFinite(unit) ? Math.round(unit * qty * 100) / 100 : null,
      image_url: li.image?.url || null,
      metadata: { shopify_line_id: idOf(li.id), variant_id: li.variant?.legacyResourceId ? String(li.variant.legacyResourceId) : null, variation: variantTitle },
    }
  })
}

// The contact an order belongs to: via the synced Shopify customer first (the
// most exact link), then email, then phone.
export async function resolveOrderContact(db: any, companyId: string, o: any): Promise<string | null> {
  const custId = o.customer?.legacyResourceId || idOf(o.customer?.id)
  if (custId) {
    const { data } = await db.from('shopify_customers').select('contact_id').eq('company_id', companyId).eq('shopify_customer_id', Number(custId)).maybeSingle()
    if (data?.contact_id) return data.contact_id
  }
  const email = String(o.email || '').trim().toLowerCase()
  if (email) {
    const { data } = await db.from('contacts').select('id').eq('company_id', companyId).eq('email', email).limit(1)
    if (data?.[0]?.id) return data[0].id
  }
  const pn = phoneNorm(o.phone || o.shippingAddress?.phone || o.billingAddress?.phone)
  if (pn) {
    const { data } = await db.from('contacts').select('id').eq('company_id', companyId).eq('phone_norm', pn).limit(1)
    if (data?.[0]?.id) return data[0].id
  }
  return null
}

/**
 * Insert or refresh one Shopify order. `quiet` (bulk import) skips the new-order
 * push and integration events. Returns the orders.id, or null if skipped.
 */
export async function upsertShopifyOrder(db: any, companyId: string, o: any, opts: { quiet?: boolean; svc?: ShopifyService | null; shop?: string } = {}): Promise<string | null> {
  if (!o?.legacyResourceId && !o?.id) return null
  // A list page only carries the first 20 lines; fetch the whole order if more.
  if (o.lineItems?.pageInfo?.hasNextPage && opts.svc) {
    try { o = (await opts.svc.getOrder(o.id)) || o } catch {}
  }
  const cid = await resolveOrderContact(db, companyId, o)
  const src = sourceFields(companyId, o, cid)
  const ext = src.external_order_id

  const { data: prev } = await db.from('orders').select('id, status, shipped_at, contact_id, metadata')
    .eq('company_id', companyId).eq('sales_channel', 'shopify').eq('external_order_id', ext).maybeSingle()

  let orderId: string
  const ful = upper(o.displayFulfillmentStatus)
  const refunded = upper(o.displayFinancialStatus) === 'REFUNDED'
  if (prev?.id) {
    const patch: any = { ...src }
    // Keep the refunded total current (the panel's "Partially refunded").
    const refundedNow = parseFloat(o.totalRefundedSet?.shopMoney?.amount) || 0
    const pm = prev.metadata || {}
    const shopNow = pm.shopify?.shop || opts.shop || opts.svc?.shop || null
    if (Number(pm.shopify?.refunded || 0) !== refundedNow || (shopNow && !pm.shopify?.shop)) {
      patch.metadata = { ...pm, shopify: { ...(pm.shopify || {}), shop: shopNow, refunded: refundedNow } }
    }
    if (o.cancelledAt) {
      if (prev.status !== 'cancelled') patch.status = 'cancelled'
    } else if (refunded) {
      if (!['refunded', 'cancelled'].includes(prev.status)) patch.status = 'refunded'
    } else if (ful === 'FULFILLED' && prev.status !== 'shipped') {
      patch.status = 'shipped'; patch.fulfilment_status = 'fulfilled'; patch.flagged = false
      if (!prev.shipped_at) patch.shipped_at = new Date().toISOString()
    } else if (prev.status === 'cancelled') {
      // Un-cancelled in Shopify (rare, but an order can be restored).
      patch.status = mapStatus(o); patch.flagged = false
    }
    await updateResilient(db, 'orders', patch, prev.id)
    orderId = prev.id
    if (!opts.quiet && patch.status && patch.status !== prev.status) {
      const label = statusMeta(patch.status).label
      emitIntegrationEvent(companyId, 'order.status_changed', {
        ...orderEvent(src, orderId, `Order #${src.order_number} is now ${label}`, { 'Old status': statusMeta(prev.status).label, 'New status': label }),
        dedupeKey: `order.status:${orderId}:${patch.status}`,
      }, { db })
    }
  } else {
    const st = mapStatus(o)
    let outletId: string | null = null
    if (st === 'click_and_collect') outletId = matchOutletId(await loadLocations(db, companyId), shippingTitle(o))
    const ins = await insertResilient(db, 'orders', [{
      ...src,
      status: st,
      ...(outletId ? { store_location_id: outletId } : {}),
      fulfilment_status: ful === 'FULFILLED' ? 'fulfilled' : 'unfulfilled',
      flagged: mapPayment(o) === 'failed' || ful === 'ON_HOLD',
      ...(st === 'shipped' ? { shipped_at: new Date().toISOString() } : {}),
      metadata: { shopify: { shop: opts.shop || opts.svc?.shop || null, status_url: o.statusPageUrl || null, test: !!o.test, refunded: parseFloat(o.totalRefundedSet?.shopMoney?.amount) || 0 } },
    }], 'id')
    if (!ins[0]?.id) return null
    orderId = ins[0].id
    try { await insertResilient(db, 'order_events', [{ order_id: orderId, company_id: companyId, type: 'created', detail: 'Order imported from Shopify', actor_name: 'Sync' }]) } catch {}
    if (!opts.quiet) {
      notifyNewOrder(companyId, src)
      const items = (o.lineItems?.nodes || []).map((li: any) => ({ name: li.name, sku: li.sku, quantity: li.quantity, total: (parseFloat(li.originalUnitPriceSet?.shopMoney?.amount) || 0) * (Number(li.quantity) || 1) }))
      emitIntegrationEvent(companyId, 'order.created', {
        ...orderEvent(src, orderId, `New order #${src.order_number}${src.total ? ` · $${Number(src.total).toFixed(2)}` : ''} · ${src.customer_name}`, { Status: statusMeta(st).label }, items),
        dedupeKey: `order.created:${orderId}`,
      }, { db })
    }
  }

  try {
    await db.from('order_items').delete().eq('order_id', orderId)
    const its = itemRows(companyId, orderId, o)
    if (its.length) await insertResilient(db, 'order_items', its)
  } catch {}

  // Keep the customer's first/last order dates current for segments and RFM.
  try {
    const custId = o.customer?.legacyResourceId || idOf(o.customer?.id)
    if (custId && src.order_date) {
      const { data: c } = await db.from('shopify_customers').select('id, first_order_date, last_order_date')
        .eq('company_id', companyId).eq('shopify_customer_id', Number(custId)).maybeSingle()
      if (c?.id) {
        const patch: any = {}
        const t = new Date(src.order_date).getTime()
        if (!c.last_order_date || t > new Date(c.last_order_date).getTime()) patch.last_order_date = src.order_date
        if (!c.first_order_date || t < new Date(c.first_order_date).getTime()) patch.first_order_date = src.order_date
        if (Object.keys(patch).length) await db.from('shopify_customers').update(patch).eq('id', c.id)
      }
    }
  } catch {}
  return orderId
}
