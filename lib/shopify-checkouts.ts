// Shopify checkouts → abandoned carts.
//
// Shopify reports a checkout as soon as it starts, usually minutes before the
// customer pays, so checkouts are held in shopify_checkouts and only promoted
// to an abandoned cart (conversation, summary line, recovery message,
// recovered revenue — the WooCommerce path) when one is still unpaid after
// HOLD_MINUTES and the customer hasn't ordered since.

import { ingestAbandonedCart } from '@/lib/abandoned-carts'

export const HOLD_MINUTES = 15
const num = (v: any): number | null => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }
const idOf = (gid: any): string | null => { const m = String(gid ?? '').match(/(\d+)$/); return m ? m[1] : null }
const phoneTail = (p?: string | null) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : '' }

const lineName = (title: any, variant: any) => {
  const t = String(title || 'Item')
  const v = variant && variant !== 'Default Title' ? String(variant) : ''
  return v ? `${t} – ${v}` : t
}

// checkouts/create|update webhook payload (REST shape) → staging row.
export function stageFromWebhook(p: any, companyId: string, integrationId: string) {
  const ship = p.shipping_address || {}
  const bill = p.billing_address || {}
  const cust = p.customer || {}
  const first = bill.first_name || ship.first_name || cust.first_name || ''
  const last = bill.last_name || ship.last_name || cust.last_name || ''
  const addr = ship.address1 ? ship : bill
  const sl = (p.shipping_lines || [])[0]
  return {
    company_id: companyId, integration_id: integrationId,
    token: String(p.token || p.id || ''),
    email: (p.email || cust.email || '').trim().toLowerCase() || null,
    phone: p.phone || bill.phone || ship.phone || cust.phone || null,
    name: `${first} ${last}`.trim() || null,
    items: (p.line_items || []).map((li: any) => ({
      product_id: li.product_id ? String(li.product_id) : null,
      variation_id: li.variant_id ? String(li.variant_id) : null,
      name: lineName(li.title, li.variant_title),
      sku: li.sku || null,
      quantity: Number(li.quantity) || 1,
      price: num(li.price),
      image: null as string | null,
    })),
    address: { address_1: addr.address1 || null, city: addr.city || null, state: addr.province_code || addr.province || null, postcode: addr.zip || null, country: addr.country_code || addr.country || null },
    shipping: sl ? { method: sl.title || sl.code || null, label: sl.title || null, cost: num(sl.price) } : null,
    subtotal: num(p.subtotal_price),
    total: num(p.total_price),
    currency: p.currency || p.presentment_currency || null,
    cart_url: p.abandoned_checkout_url || null,
    checkout_created_at: p.created_at || null,
    checkout_updated_at: p.updated_at || p.created_at || null,
    completed_at: p.completed_at || null,
  }
}

// GraphQL AbandonedCheckout node → staging row (stores without webhooks).
export function stageFromGraphql(n: any, companyId: string, integrationId: string) {
  const ship = n.shippingAddress || {}
  const bill = n.billingAddress || {}
  const cust = n.customer || {}
  const addr = ship.address1 ? ship : bill
  return {
    company_id: companyId, integration_id: integrationId,
    token: `gql:${idOf(n.id)}`,
    email: (cust.defaultEmailAddress?.emailAddress || '').trim().toLowerCase() || null,
    phone: cust.defaultPhoneNumber?.phoneNumber || bill.phone || ship.phone || null,
    name: [bill.firstName || ship.firstName || cust.firstName, bill.lastName || ship.lastName || cust.lastName].filter(Boolean).join(' ').trim() || null,
    items: (n.lineItems?.nodes || []).map((li: any) => ({
      product_id: li.product?.legacyResourceId ? String(li.product.legacyResourceId) : null,
      variation_id: li.variant?.legacyResourceId ? String(li.variant.legacyResourceId) : null,
      name: lineName(li.title, li.variantTitle),
      sku: li.sku || null,
      quantity: Number(li.quantity) || 1,
      price: num(li.originalUnitPriceSet?.shopMoney?.amount),
      image: li.image?.url || null,
    })),
    address: { address_1: addr.address1 || null, city: addr.city || null, state: addr.provinceCode || addr.province || null, postcode: addr.zip || null, country: addr.countryCodeV2 || addr.country || null },
    shipping: null,
    subtotal: num(n.subtotalPriceSet?.shopMoney?.amount),
    total: num(n.totalPriceSet?.shopMoney?.amount),
    currency: n.totalPriceSet?.shopMoney?.currencyCode || null,
    cart_url: n.abandonedCheckoutUrl || null,
    checkout_created_at: n.createdAt || null,
    checkout_updated_at: n.updatedAt || n.createdAt || null,
    completed_at: n.completedAt || null,
  }
}

/**
 * Upsert a checkout into staging. A checkout that's been completed, or one
 * already promoted/skipped, keeps that outcome — later updates only refresh
 * its details while it is still open.
 */
export async function stageCheckout(db: any, row: ReturnType<typeof stageFromWebhook>) {
  if (!row.token) return
  const { data: prev } = await db.from('shopify_checkouts').select('status').eq('company_id', row.company_id).eq('token', row.token).maybeSingle()
  const status = row.completed_at ? 'completed' : (prev?.status && prev.status !== 'open' ? prev.status : 'open')
  if (prev?.status && prev.status !== 'open' && !row.completed_at) return
  await db.from('shopify_checkouts').upsert({ ...row, status, updated_at: new Date().toISOString() }, { onConflict: 'company_id,token' })
}

/**
 * Promote checkouts that are still unpaid HOLD_MINUTES after their last
 * activity (and no more than two days old) to abandoned carts. Skips any
 * whose customer has placed an order since the checkout began.
 */
export async function promoteDueCheckouts(db: any, companyId: string, opts: { holdMinutes?: number; limit?: number } = {}) {
  const hold = opts.holdMinutes ?? HOLD_MINUTES
  const before = new Date(Date.now() - hold * 60_000).toISOString()
  const after = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: due } = await db.from('shopify_checkouts').select('*')
    .eq('company_id', companyId).eq('status', 'open').is('completed_at', null)
    .lte('checkout_updated_at', before).gte('checkout_updated_at', after)
    .limit(opts.limit || 25)
  let promoted = 0, skipped = 0
  for (const c of due || []) {
    // Claim it first so two runs never both promote it.
    const { data: claimed } = await db.from('shopify_checkouts').update({ status: 'promoting', updated_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('token', c.token).eq('status', 'open').select('token')
    if (!claimed?.length) continue
    const finish = (patch: any) => db.from('shopify_checkouts').update({ ...patch, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('token', c.token)
    try {
      if (!c.email && !c.phone) { await finish({ status: 'skipped', skip_reason: 'No email or phone' }); skipped++; continue }
      // Ordered since? (any store — the operational orders table has them all)
      const tail = phoneTail(c.phone)
      const or = [c.email ? `customer_email.eq.${c.email}` : '', tail ? `customer_phone_norm.eq.${tail}` : ''].filter(Boolean).join(',')
      const { data: bought } = await db.from('orders').select('id').eq('company_id', companyId).or(or)
        .gte('order_date', c.checkout_created_at || after).neq('status', 'cancelled').limit(1)
      if (bought?.length) { await finish({ status: 'skipped', skip_reason: 'Ordered since' }); skipped++; continue }

      // Item images from the synced catalogue where the checkout has none.
      const items = Array.isArray(c.items) ? c.items : []
      const need = Array.from(new Set(items.filter((i: any) => !i.image && i.product_id).map((i: any) => Number(i.product_id))))
      if (need.length) {
        const { data: prods } = await db.from('shopify_products').select('shopify_product_id, image').eq('company_id', companyId).in('shopify_product_id', need)
        const img = new Map((prods || []).map((p: any) => [String(p.shopify_product_id), p.image]))
        for (const i of items) if (!i.image && i.product_id && img.get(String(i.product_id))) i.image = img.get(String(i.product_id))
      }

      const r = await ingestAbandonedCart(db, companyId, {
        external_id: `shopify:${c.token}`,
        name: c.name, email: c.email, phone: c.phone,
        address: c.address || { address_1: null, city: null, state: null, postcode: null, country: null },
        items,
        coupon: null,
        shipping: c.shipping || null,
        notes: null,
        subtotal: c.subtotal != null ? Number(c.subtotal) : null,
        total: c.total != null ? Number(c.total) : null,
        currency: c.currency || 'AUD',
        cart_url: c.cart_url || null,
      } as any)
      if (!r.ok) { await finish({ status: 'open', skip_reason: r.error }); continue }
      await finish({ status: 'promoted', promoted_at: new Date().toISOString(), cart_id: r.id })
      promoted++
    } catch (e: any) {
      await finish({ status: 'open', skip_reason: e?.message || 'failed' })
    }
  }
  return { promoted, skipped }
}
