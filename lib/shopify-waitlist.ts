// Shopify back-in-stock: storefront sign-ups and restock alerts.
//
// Sign-ups come from the "Notify me" block in the Colvy theme app extension,
// through Shopify's app proxy (signed by Shopify, so no key in the browser).
// Restocks come from the product / inventory webhooks and the catch-up cron:
// whenever a saved product has a sellable variant, anyone waiting on that
// variant (or on "any option" of the product) is told, via notifyWaitlist —
// the same send path, sending hours, opt-out checks and inbox thread as
// WooCommerce.

import { notifyWaitlist, resolveWaitlistSettings, type NotifyResult } from '@/lib/waitlist'
import { toE164, phoneKey, emailKey } from '@/lib/phone'

const clip = (v: any, n: number) => (v == null ? '' : String(v)).trim().slice(0, n)
const isDefault = (t: any) => !t || t === 'Default Title'

/**
 * After products are saved: notify waitlists for every variant that can be
 * sold again. Cheap when nobody's waiting (one indexed lookup).
 */
export async function notifyShopifyRestock(db: any, companyId: string, rows: any[]): Promise<NotifyResult | null> {
  const live = rows.filter(r => r && (!r.status || r.status === 'ACTIVE'))
  const pids = live.map(r => Number(r.shopify_product_id)).filter(Boolean)
  if (!pids.length) return null
  const { data: waiting } = await db.from('stock_waitlist').select('id')
    .eq('company_id', companyId).in('shopify_product_id', pids).in('status', ['waiting', 'queued']).limit(1)
  if (!waiting?.length) return null

  const variantIds: number[] = [], productIds: number[] = []
  for (const r of live) {
    const avail = (r.variants || []).filter((v: any) => v?.available && v.id).map((v: any) => Number(v.id))
    if (avail.length) { variantIds.push(...avail); productIds.push(Number(r.shopify_product_id)) }
    else if (!(r.variants || []).length && r.stock_status === 'instock') productIds.push(Number(r.shopify_product_id))
  }
  if (!variantIds.length && !productIds.length) return null

  const { data: co } = await db.from('companies').select('waitlist_settings').eq('id', companyId).maybeSingle()
  if (!resolveWaitlistSettings(co?.waitlist_settings).auto_notify) return null
  const r = await notifyWaitlist(db, { companyId, shopifyVariantIds: variantIds, shopifyProductIds: productIds, respectHours: true })
  if (r.sent || r.queued || r.failed) console.log('[waitlist] shopify back in stock', { companyId, products: productIds, ...r })
  return r
}

/** Name, image and link for a product/variant from the synced catalogue. */
export function describeShopifyItem(p: any, variantId: number | null) {
  const v = variantId ? (p.variants || []).find((x: any) => Number(x.id) === variantId) : null
  const opt = v && !isDefault(v.title) ? String(v.title) : ''
  const base = p.permalink || null
  return {
    name: opt ? `${p.name} - ${opt}` : p.name,
    image: p.image || null,
    url: base && v && p.has_variations ? `${base}${base.includes('?') ? '&' : '?'}variant=${v.id}` : base,
    variant: v,
  }
}

export type JoinInput = {
  productId: any; variantId?: any; ch?: any; phone?: any; email?: any; name?: any
  loggedInCustomerId?: any
}

/**
 * A storefront "Notify me" sign-up. Returns the JSON the block shows:
 * { ok, via, duplicate } or { error, status }.
 */
export async function joinShopifyWaitlist(db: any, integ: any, b: JoinInput, deps: { fetchProduct?: (id: number) => Promise<any | null> } = {}): Promise<{ status: number; body: any }> {
  const companyId = integ.company_id
  const productId = Number(b.productId) || null
  const variantId = Number(b.variantId) || null
  if (!productId) return { status: 400, body: { error: 'That product couldn’t be found.' } }

  let { data: p } = await db.from('shopify_products').select('shopify_product_id, name, image, permalink, has_variations, variants, status')
    .eq('company_id', companyId).eq('shopify_product_id', productId).maybeSingle()
  // New to us (created since the last sync): fetch and save it first.
  if (!p && deps.fetchProduct) p = await deps.fetchProduct(productId).catch(() => null)
  if (!p) return { status: 400, body: { error: 'That product couldn’t be found.' } }
  const item = describeShopifyItem(p, variantId)
  if (variantId && !item.variant) return { status: 400, body: { error: 'That option couldn’t be found.' } }

  const ch = b.ch === 'email' ? 'email' : 'sms'
  const rawPhone = ch === 'sms' ? clip(b.phone, 40) : ''
  const rawEmail = ch === 'email' ? clip(b.email, 160) : ''
  const phone = rawPhone && phoneKey(rawPhone).length >= 8 ? toE164(rawPhone) : null
  const email = rawEmail ? (emailKey(rawEmail) || null) : null
  if (ch === 'sms' && !phone) return { status: 400, body: { error: rawPhone ? 'That phone number doesn’t look right.' : 'Enter your mobile number.' } }
  if (ch === 'email' && !email) return { status: 400, body: { error: rawEmail ? 'That email address doesn’t look right.' : 'Enter a valid email address.' } }
  let customerName = clip(b.name, 80) || null

  // Someone we already know → their contact, so the alert lands in their
  // thread and their STOP / block status is respected. A logged-in shopper's
  // Shopify customer record wins; otherwise match the mobile/email.
  let contactId: string | null = null
  try {
    const cust = Number(b.loggedInCustomerId) || null
    if (cust) {
      const { data: sc } = await db.from('shopify_customers').select('contact_id').eq('company_id', companyId).eq('shopify_customer_id', cust).maybeSingle()
      contactId = sc?.contact_id || null
    }
    if (!contactId) {
      let q = db.from('contacts').select('id, name').eq('company_id', companyId).limit(1)
      q = phone ? q.eq('phone_norm', phoneKey(phone)) : q.ilike('email', email!)
      const { data: c } = await q
      if (c?.[0]) { contactId = c[0].id; customerName = customerName || c[0].name || null }
    }
  } catch {}

  const { data, error } = await db.from('stock_waitlist').insert({
    company_id: companyId, contact_id: contactId,
    shopify_product_id: productId, shopify_variant_id: item.variant ? variantId : null,
    item_name: clip(item.name, 200) || 'Item', item_image: item.image, item_url: item.url,
    customer_name: customerName, phone, email, source: 'website',
  }).select('id').maybeSingle()
  if (error) {
    if ((error as any).code === '23505') return { status: 200, body: { ok: true, duplicate: true, via: ch } }
    return { status: 500, body: { error: 'Couldn’t save that — please try again.' } }
  }
  return { status: 200, body: { ok: true, id: data?.id, via: ch } }
}
