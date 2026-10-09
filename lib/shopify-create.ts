// Creating things in Shopify from Colvy: orders (from the Create Order panel
// and the AI) and discount codes (coupons from the inbox, DOA store credit,
// campaigns, the AI). WooCommerce's request shapes in, WooCommerce-like
// results out, so the callers keep one code path.
//
// Orders are Shopify draft orders. Unpaid ones (the usual "create & send a
// payment link") stay drafts: the link is Shopify's own invoice checkout, and
// when the customer pays, Shopify turns it into an order — the orders/create
// webhook then files it in the same chat (the _colvy_conversation_id
// attribute) and runs the order automations. An order staff mark as paid is
// completed straight away.

import { serviceFor } from '@/lib/shopify-sync'
import { upsertShopifyOrder } from '@/lib/shopify-orders'
import { shopifyChangeStatus } from '@/lib/shopify-order-actions'
import type { ShopifyService } from '@/lib/shopify-service'

const legacy = (gid: any): string => String(gid ?? '').match(/(\d+)$/)?.[1] || ''
const money = (set: any): number => parseFloat(set?.shopMoney?.amount) || 0
const toMoney = (n: any) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2)

export class ShopifyCreateError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}
function check(label: string, errors: any[], userErrors: any[] | undefined) {
  const all = [...(errors || []), ...(userErrors || [])].map((e: any) => e?.message || String(e)).filter(Boolean)
  if (!all.length) return
  if (all.some(m => /access denied|scope|not approved/i.test(m))) throw new ShopifyCreateError('Colvy needs permission for this in your Shopify store. Reconnect it in Colvy → Integrations → Shopify.', 403)
  throw new ShopifyCreateError(`${label}: ${all.join('; ')}`, 422)
}

async function shopCurrency(svc: ShopifyService): Promise<string> {
  try { const i = await svc.getShopInfo(); return i.currency || 'AUD' } catch { return 'AUD' }
}

// WooCommerce address (billing/shipping) → Shopify MailingAddressInput.
function mailing(a: any) {
  if (!a || !(a.address_1 || a.city || a.first_name)) return undefined
  const country = String(a.country || 'AU').toUpperCase()
  return {
    firstName: a.first_name || undefined, lastName: a.last_name || undefined, company: a.company || undefined,
    address1: a.address_1 || undefined, address2: a.address_2 || undefined, city: a.city || undefined,
    provinceCode: a.state || undefined, zip: a.postcode || undefined, countryCode: /^[A-Z]{2}$/.test(country) ? country : 'AU',
    phone: a.phone || undefined,
  }
}

export type CreateOrderBody = {
  conversationId?: string | null; contactId?: string | null
  customer?: { email?: string; first_name?: string; last_name?: string; phone?: string; billing?: any; shipping?: any }
  items: { product_id?: any; variation_id?: any; quantity: number; name?: string; price?: any; custom_price?: any; custom_name?: string }[]
  coupons?: string[]; orderDiscount?: { amount: any; label?: string } | null
  fees?: { name?: string; amount: any }[]; shipping?: { method?: string; label?: string; cost?: any } | null
  customerNote?: string; internalNote?: string; status?: string; setPaid?: boolean
  createdByName?: string; isQuote?: boolean; ignoreStockWarnings?: boolean
}

/**
 * Create a Shopify order the way /api/orders/create does for WooCommerce.
 * Returns { stockWarning, problems } when items changed since the panel
 * loaded (unless ignoreStockWarnings), else the created order/draft.
 */
export async function shopifyCreateOrder(db: any, integ: any, b: CreateOrderBody) {
  const companyId = integ.company_id
  const svc = await serviceFor(db, integ)
  const currency = await shopCurrency(svc)

  // ── Resolve each product line to a variant and recheck stock (catalogue first).
  const pids = Array.from(new Set(b.items.filter(i => i.product_id).map(i => Number(i.product_id))))
  const { data: prods } = pids.length
    ? await db.from('shopify_products').select('shopify_product_id, name, variants, status').eq('company_id', companyId).in('shopify_product_id', pids)
    : { data: [] }
  const byId = new Map((prods || []).map((p: any) => [Number(p.shopify_product_id), p]))
  const problems: string[] = []
  const lines: any[] = []
  for (const it of b.items) {
    const qty = Math.max(1, Math.floor(Number(it.quantity) || 1))
    const custom = it.custom_price != null && it.custom_price !== '' ? parseFloat(it.custom_price) : null
    if (!it.product_id) {
      lines.push({ title: (it.custom_name || it.name || 'Custom item').slice(0, 255), quantity: qty, originalUnitPriceWithCurrency: { amount: toMoney(custom ?? it.price), currencyCode: currency }, requiresShipping: true, taxable: true })
      continue
    }
    const p: any = byId.get(Number(it.product_id))
    const variants: any[] = p?.variants || []
    const v = it.variation_id ? variants.find(x => Number(x.id) === Number(it.variation_id)) : variants[0]
    if (!p || !v) { problems.push(`${it.name || 'Item'}: no longer available`); continue }
    if (p.status && p.status !== 'ACTIVE') problems.push(`${it.name || p.name}: not active in Shopify`)
    else if (!v.available) problems.push(`${it.name || p.name}: now out of stock`)
    else if (v.tracked && typeof v.inventory_quantity === 'number' && v.inventory_quantity >= 0 && v.inventory_quantity < qty) problems.push(`${it.name || p.name}: only ${v.inventory_quantity} left (you asked for ${qty})`)
    const line: any = { variantId: `gid://shopify/ProductVariant/${v.id}`, quantity: qty }
    const list = parseFloat(v.price ?? it.price) || 0
    // A custom price: Shopify's price override for the line.
    if (custom != null && Math.abs(custom - list) > 0.004) line.priceOverride = { amount: toMoney(custom), currencyCode: currency }
    lines.push(line)
  }
  if (problems.length && !b.ignoreStockWarnings) return { stockWarning: true, problems }

  // Fees: their own lines (no shipping, taxable), like WooCommerce fee lines.
  for (const f of b.fees || []) {
    const amt = parseFloat(f.amount)
    if (amt && amt > 0) lines.push({ title: (f.name || 'Fee').slice(0, 255), quantity: 1, originalUnitPriceWithCurrency: { amount: toMoney(amt), currencyCode: currency }, requiresShipping: false, taxable: true })
  }
  if (!lines.length) throw new ShopifyCreateError('Add at least one product.', 400)

  const c = b.customer || {}
  const input: any = {
    lineItems: lines,
    email: c.email || undefined,
    phone: c.phone || undefined,
    shippingAddress: mailing(c.shipping) || mailing(c.billing),
    billingAddress: mailing(c.billing),
    note: [b.customerNote && `Customer note: ${b.customerNote}`, b.internalNote && `Staff note${b.createdByName ? ` (${b.createdByName})` : ''}: ${b.internalNote}`].filter(Boolean).join('\n') || undefined,
    tags: ['Colvy'],
    customAttributes: [
      { key: '_colvy_conversation_id', value: b.conversationId || '' },
      { key: '_colvy_contact_id', value: b.contactId || '' },
      { key: '_colvy_created_by', value: b.createdByName || '' },
    ].filter(a => a.value),
    sourceName: 'colvy',
  }
  // The customer's Shopify account, when we have it synced.
  if (c.email) {
    try {
      const { data: sc } = await db.from('shopify_customers').select('shopify_customer_id').eq('company_id', companyId).ilike('email', c.email).limit(1)
      if (sc?.[0]?.shopify_customer_id) input.purchasingEntity = { customerId: `gid://shopify/Customer/${sc[0].shopify_customer_id}` }
    } catch {}
  }
  const discount = b.orderDiscount && parseFloat(b.orderDiscount.amount) > 0 ? parseFloat(b.orderDiscount.amount) : 0
  if (discount) input.appliedDiscount = { valueType: 'FIXED_AMOUNT', value: discount, title: (b.orderDiscount!.label || 'Discount').slice(0, 255) }
  const codes = (b.coupons || []).map(s => String(s).trim()).filter(Boolean)
  if (codes.length) input.discountCodes = codes
  const sh = b.shipping
  if (sh && sh.method && sh.method !== 'none') {
    const free = ['free', 'pickup', 'quote_later'].includes(sh.method)
    input.shippingLine = {
      title: (sh.label || (sh.method === 'pickup' ? 'Local pickup' : sh.method === 'free' ? 'Free shipping' : sh.method === 'quote_later' ? 'Shipping — quote to follow' : 'Shipping')).slice(0, 255),
      priceWithCurrency: { amount: free ? '0.00' : toMoney(sh.cost), currencyCode: currency },
    }
  }

  const { data: cd, errors: ce } = await svc.gql<any>(
    `mutation Draft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id legacyResourceId name status invoiceUrl totalPriceSet { shopMoney { amount currencyCode } } }
        userErrors { field message }
      }
    }`,
    { input },
  )
  check('Shopify couldn’t create the order', ce, cd?.draftOrderCreate?.userErrors)
  const draft = cd?.draftOrderCreate?.draftOrder
  if (!draft?.id) throw new ShopifyCreateError('Shopify didn’t return the new order.', 502)

  // Paid now (staff say so): complete it into a real order. Awaiting payment
  // by another method (on-hold): complete with payment pending. Otherwise it
  // stays a draft and the customer pays through Shopify's checkout link.
  const st = String(b.status || 'pending').toLowerCase()
  const paid = b.setPaid === true || st === 'processing' || st === 'completed'
  const complete = !b.isQuote && (paid || st === 'on-hold')
  let order: any = null
  if (complete) {
    const { data: dc, errors: de } = await svc.gql<any>(
      `mutation Complete($id: ID!, $paymentPending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder { id order { id legacyResourceId name displayFinancialStatus statusPageUrl totalPriceSet { shopMoney { amount currencyCode } } } }
          userErrors { field message }
        }
      }`,
      { id: draft.id, paymentPending: !paid },
    )
    check('Shopify created the draft but couldn’t complete it', de, dc?.draftOrderComplete?.userErrors)
    order = dc?.draftOrderComplete?.draftOrder?.order || null
    if (order) {
      const full = await svc.getOrder(order.legacyResourceId)
      if (full) { try { await upsertShopifyOrder(db, companyId, full, { svc }) } catch {} }
      if (st === 'completed') {
        try { await shopifyChangeStatus(db, { row: null, integ, externalId: String(order.legacyResourceId) }, 'completed') } catch {}
      }
    }
  }

  const shop = integ.store_domain
  const total = money(order?.totalPriceSet || draft.totalPriceSet)
  return {
    ok: true as const,
    order: order ? {
      id: `shopify-${order.legacyResourceId}`,
      number: String(order.name || '').replace(/^#/, ''),
      total: total.toFixed(2), currency: order.totalPriceSet?.shopMoney?.currencyCode || currency,
      status: st === 'completed' ? 'completed' : paid ? 'processing' : 'on-hold',
      pay_link: paid ? null : (order.statusPageUrl || null),
      admin_url: `https://${shop}/admin/orders/${order.legacyResourceId}`,
      channel: 'shopify', draft: false,
    } : {
      id: `shopify-draft-${draft.legacyResourceId || legacy(draft.id)}`,
      number: String(draft.name || '').replace(/^#/, ''),
      total: total.toFixed(2), currency: draft.totalPriceSet?.shopMoney?.currencyCode || currency,
      status: b.isQuote || st === 'draft' ? 'draft' : 'pending',
      pay_link: draft.invoiceUrl || null,
      admin_url: `https://${shop}/admin/draft_orders/${draft.legacyResourceId || legacy(draft.id)}`,
      channel: 'shopify', draft: true,
    },
  }
}

// ── Discount codes ────────────────────────────────────────────────────────

/** Is this code a live Shopify discount? (Create Order's "Apply".) */
export async function shopifyValidateCode(db: any, integ: any, code: string, opts: { subtotal?: number } = {}) {
  const svc = await serviceFor(db, integ)
  const { data, errors } = await svc.gql<any>(
    `query Code($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        id
        codeDiscount {
          __typename
          ... on DiscountCodeBasic { title status startsAt endsAt usageLimit asyncUsageCount
            customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } appliesOnEachItem } } }
            minimumRequirement { __typename ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } } }
          ... on DiscountCodeFreeShipping { title status startsAt endsAt }
          ... on DiscountCodeBxgy { title status startsAt endsAt }
        }
      }
    }`,
    { code },
  )
  check('Couldn’t check the code', errors, [])
  const d = data?.codeDiscountNodeByCode?.codeDiscount
  if (!d) return { ok: false as const, error: 'That code doesn’t exist in Shopify.' }
  if (d.status && d.status !== 'ACTIVE') return { ok: false as const, error: d.status === 'EXPIRED' ? 'That code has expired.' : 'That code isn’t active yet.' }
  if (d.usageLimit != null && d.asyncUsageCount != null && d.asyncUsageCount >= d.usageLimit) return { ok: false as const, error: 'That code has been used up.' }
  const min = parseFloat(d.minimumRequirement?.greaterThanOrEqualToSubtotal?.amount)
  if (min && opts.subtotal != null && opts.subtotal < min) return { ok: false as const, error: `Spend $${min.toFixed(2)} or more to use that code.` }
  const v = d.customerGets?.value
  const percent = v?.__typename === 'DiscountPercentage'
  return {
    ok: true as const,
    coupon: {
      code, title: d.title || code,
      discount_type: d.__typename === 'DiscountCodeFreeShipping' ? 'free_shipping' : percent ? 'percent' : 'fixed_cart',
      amount: percent ? String(Math.round((Number(v.percentage) || 0) * 10000) / 100) : String(v?.amount?.amount || '0'),
      channel: 'shopify',
    },
  }
}

export type DiscountRequest = {
  code?: string; title?: string
  amount: number; discountType: 'percent' | 'fixed'
  email?: string | null          // limit to this customer (when they're in Shopify)
  oneTime?: boolean              // one use in total
  usageLimit?: number | null     // total uses (campaigns); oneTime wins
  oncePerCustomer?: boolean      // default true
  expiryDays?: number | null; endsAt?: string | null
  minimumAmount?: number | null
  productIds?: (string | number)[]
}

const makeCode = (prefix = 'SAVE') => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

/**
 * Create a Shopify discount code (the WooCommerce coupon equivalent). A code
 * meant for one customer is limited to their Shopify customer record when we
 * have it; Shopify can't restrict by email alone, so otherwise it's a
 * one-use code (oneTime) the customer is sent privately.
 */
export async function shopifyCreateDiscountCode(db: any, integ: any, r: DiscountRequest) {
  const svc = await serviceFor(db, integ)
  // Shopify codes are case-insensitive at checkout; a given code keeps its case.
  const code = (r.code ? String(r.code).replace(/\s+/g, '') : makeCode()).slice(0, 255)
  const amount = Number(r.amount)
  if (!(amount > 0)) throw new ShopifyCreateError('The discount amount looks wrong.', 400)
  if (r.discountType === 'percent' && amount > 100) throw new ShopifyCreateError('A percentage can’t be over 100.', 400)

  let customerGid: string | null = null
  if (r.email) {
    try {
      const { data: sc } = await db.from('shopify_customers').select('shopify_customer_id').eq('company_id', integ.company_id).ilike('email', r.email).limit(1)
      if (sc?.[0]?.shopify_customer_id) customerGid = `gid://shopify/Customer/${sc[0].shopify_customer_id}`
    } catch {}
  }
  const endsAt = r.endsAt || (r.expiryDays ? new Date(Date.now() + Number(r.expiryDays) * 86400000).toISOString() : null)
  const products = (r.productIds || []).map(Number).filter(Boolean).map(id => `gid://shopify/Product/${id}`)
  const basicCodeDiscount: any = {
    title: (r.title || code).slice(0, 255),
    code,
    startsAt: new Date().toISOString(),
    endsAt,
    customerSelection: customerGid ? { customers: { add: [customerGid] } } : { all: true },
    customerGets: {
      value: r.discountType === 'percent'
        ? { percentage: Math.round(amount * 100) / 10000 }
        : { discountAmount: { amount: toMoney(amount), appliesOnEachItem: false } },
      items: products.length ? { products: { productsToAdd: products } } : { all: true },
    },
    appliesOncePerCustomer: r.oncePerCustomer !== false,
  }
  if (r.oneTime) basicCodeDiscount.usageLimit = 1
  else if (r.usageLimit && r.usageLimit > 0) basicCodeDiscount.usageLimit = Math.floor(r.usageLimit)
  if (r.minimumAmount && r.minimumAmount > 0) basicCodeDiscount.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: toMoney(r.minimumAmount) } }

  const { data, errors } = await svc.gql<any>(
    `mutation Code($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field code message }
      }
    }`,
    { basicCodeDiscount },
  )
  const ue = data?.discountCodeBasicCreate?.userErrors || []
  // The code is taken (a campaign reusing its code): treat as existing.
  if (ue.some((e: any) => /taken|already exists|must be unique/i.test(String(e?.message || '')))) {
    return { ok: true as const, code, existing: true, id: null as string | null, customerLimited: !!customerGid, endsAt }
  }
  check('Shopify couldn’t create the discount code', errors, ue)
  return { ok: true as const, code, existing: false, id: legacy(data?.discountCodeBasicCreate?.codeDiscountNode?.id), customerLimited: !!customerGid, endsAt }
}

/** The workspace's Shopify store to use: the given one, else its only/first active one. */
export async function shopifyStoreFor(db: any, companyId: string, integrationId?: string | null) {
  if (integrationId) {
    const { data } = await db.from('shopify_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
    if (data) return data.is_active ? data : null
  }
  const { data } = await db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
  return data?.[0] || null
}

/**
 * The in-chat order card's buttons on a draft (an unpaid order created from
 * Colvy): "Mark paid" / "Mark completed" complete it into a paid order (and
 * fulfil it for completed), on-hold completes it as payment pending, and
 * "Cancel" deletes the draft.
 */
export async function shopifyDraftAction(db: any, integ: any, draftId: string, status: string) {
  const svc = await serviceFor(db, integ)
  const id = `gid://shopify/DraftOrder/${draftId}`
  const st = String(status || '').toLowerCase()
  if (st === 'cancelled') {
    const { data, errors } = await svc.gql<any>(
      `mutation Del($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { field message } } }`,
      { input: { id } },
    )
    check('Couldn’t delete the draft', errors, data?.draftOrderDelete?.userErrors)
    return { status: 'cancelled', number: null as string | null }
  }
  if (!['processing', 'completed', 'on-hold'].includes(st)) throw new ShopifyCreateError(`A draft order can’t be set to “${status}”.`, 400)
  const paid = st !== 'on-hold'
  const { data, errors } = await svc.gql<any>(
    `mutation Complete($id: ID!, $paymentPending: Boolean) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder { id name order { id legacyResourceId name } }
        userErrors { field message }
      }
    }`,
    { id, paymentPending: !paid },
  )
  check('Couldn’t complete the draft', errors, data?.draftOrderComplete?.userErrors)
  const order = data?.draftOrderComplete?.draftOrder?.order
  if (!order) throw new ShopifyCreateError('Shopify didn’t create the order from the draft.', 502)
  const full = await svc.getOrder(order.legacyResourceId)
  if (full) { try { await upsertShopifyOrder(db, integ.company_id, full, { svc }) } catch {} }
  if (st === 'completed') await shopifyChangeStatus(db, { row: null, integ, externalId: String(order.legacyResourceId) }, 'completed')
  return { status: st, number: String(order.name || '').replace(/^#/, ''), orderId: `shopify-${order.legacyResourceId}` }
}
