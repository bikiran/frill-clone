/**
 * WooCommerce REST API Integration Service
 * Handles 2-way sync between WooCommerce and Colvy
 *
 * Every answer is read with readStoreJson (lib/store-response.ts): a store that
 * answers with a web page (security plugin, firewall, maintenance page, moved
 * store) gives one clear StoreResponseError instead of a JSON SyntaxError, and
 * look-ups pause briefly for that store instead of hammering it.
 */

import { readStoreJson, storeBackoff, storeKey, isStoreResponseError } from '@/lib/store-response'
import { posColumns } from '@/lib/prexty-pos'

// One order looked up several times a minute (the order drawer's details and
// notes, packing slips, agents' tracking checks) is fetched once: the same
// order number within 60 seconds shares one answer. Per server instance;
// cleared for a store whenever Colvy changes one of its orders.
const ORDER_TTL_MS = 60_000
const orderCache = new Map<string, { at: number; p: Promise<any | null> }>()
const hashKey = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }

/** Forget cached order look-ups for a store (after Colvy changes an order there). */
export function forgetWooOrders(storeUrl: string | null | undefined) {
  if (!storeUrl) return
  const prefix = `${storeKey(storeUrl)}|`
  for (const k of Array.from(orderCache.keys())) if (k.startsWith(prefix)) orderCache.delete(k)
}

interface WooCommerceConfig {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
  // Not read by the service itself; callers pass it optionally for context.
  companyId?: string
}

interface WooCommerceCustomer {
  id: number
  email: string
  first_name: string
  last_name: string
  phone?: string
  billing: {
    address_1: string
    address_2: string
    city: string
    state: string
    postcode: string
    country: string
  }
}

interface WooCommerceOrder {
  id: number
  date_created: string
  customer_id: number
  total: string
  status: string
  line_items: Array<{
    id: number
    product_id: number
    name: string
    quantity: number
    total: string
  }>
}

export class WooCommerceService {
  private config: WooCommerceConfig
  private basicAuth: string

  constructor(config: WooCommerceConfig) {
    this.config = config
    // Create Basic Auth header for WooCommerce API
    const credentials = `${config.consumerKey}:${config.consumerSecret}`
    this.basicAuth = Buffer.from(credentials).toString('base64')
  }

  /**
   * Fetch all customers from WooCommerce (with pagination - no limit)
   */
  // ── DOA / refund support ───────────────────────────────────────────────

  private wcHeaders() {
    return { 'Authorization': `Basic ${this.basicAuth}`, 'Content-Type': 'application/json' }
  }

  /** One REST call (path under /wp-json/wc/v3/). Reads JSON safely; GETs wait out a store's back-off. */
  private async api(path: string, init: RequestInit = {}): Promise<{ res: Response; data: any }> {
    const method = String(init.method || 'GET').toUpperCase()
    if (method === 'GET') { const held = storeBackoff(this.config.storeUrl); if (held) throw held }
    const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/${path.replace(/^\//, '')}`, { ...init, headers: { ...this.wcHeaders(), ...((init.headers as any) || {}) } })
    const data = await readStoreJson(res, { provider: 'woocommerce', store: this.config.storeUrl })
    return { res, data }
  }

  // ── Webhooks ────────────────────────────────────────────────────────────
  // Colvy needs WooCommerce to push order events to us so a new order can open
  // a chat. Previously this had to be added by hand in WooCommerce settings —
  // which is why orders silently never created conversations. We now register
  // (and reconcile) the webhooks automatically.

  async listWebhooks(): Promise<any[]> {
    try {
      const { res, data } = await this.api('webhooks?per_page=100')
      if (!res.ok) return []
      return Array.isArray(data) ? data : []
    } catch { return [] }
  }

  async createWebhook(topic: string, deliveryUrl: string, secret?: string): Promise<any | null> {
    try {
      const { res, data } = await this.api('webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: `Colvy — ${topic}`,
          topic,                 // e.g. 'order.created', 'order.updated'
          delivery_url: deliveryUrl,
          status: 'active',
          ...(secret ? { secret } : {}),
        }),
      })
      if (!res.ok) {
        throw new Error(`WooCommerce rejected the webhook (${res.status}): ${String(data?.message || JSON.stringify(data) || '').slice(0, 200)}`)
      }
      return data
    } catch (e) {
      throw e
    }
  }

  // Ensure the webhooks Colvy relies on exist and point at our endpoint: orders
  // (chat automation, Orders board) and product updates (back-in-stock
  // waitlists fire when a product returns to stock). Returns a summary so the
  // UI can tell the user exactly what happened.
  //
  // Any webhook already pointing at Colvy counts, whatever host it was made
  // with (an old domain still reaches us, signed with an old secret). Per
  // topic one is kept, re-pointed and given the signing secret; the extras are
  // deleted, since each one delivers every event again with a secret Colvy
  // doesn't know. Every change is checked: Woo refuses edits from a read-only
  // API key, and that has to show rather than read as "secured".
  async ensureColvyWebhooks(deliveryUrl: string, secret?: string) {
    const wanted = ['order.created', 'order.updated', 'product.updated']
    const company = (() => { try { return new URL(deliveryUrl).searchParams.get('company') } catch { return null } })()
    const ours = (w: any) => {
      const url = String(w?.delivery_url || '')
      if (!url.includes('/api/webhooks/woocommerce')) return false
      try { const c = new URL(url).searchParams.get('company'); return !c || !company || c === company } catch { return true }
    }
    const refused = async (res: Response) => {
      const d = await res.json().catch(() => null)
      const why = String(d?.message || '').slice(0, 160)
      return res.status === 401 || res.status === 403
        ? `WooCommerce refused (${res.status}): the API key needs Read/Write permission${why ? ` (${why})` : ''}`
        : `WooCommerce refused (${res.status})${why ? `: ${why}` : ''}`
    }
    const existing = (await this.listWebhooks()).filter(ours)
    const results: any[] = []
    for (const topic of wanted) {
      const matches = existing.filter((w: any) => w.topic === topic)
        .sort((a: any, b: any) => Number(b.status === 'active') - Number(a.status === 'active') || Number(a.id) - Number(b.id))
      const [keep, ...extra] = matches
      if (keep) {
        const upToDate = keep.status === 'active' && keep.delivery_url === deliveryUrl
        if (secret || !upToDate) {
          try {
            const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/webhooks/${keep.id}`, {
              method: 'PUT', headers: this.wcHeaders(),
              body: JSON.stringify({ status: 'active', delivery_url: deliveryUrl, ...(secret ? { secret } : {}) }),
            })
            if (res.ok) results.push({ topic, action: secret ? 'secured' : 'reactivated' })
            else results.push({ topic, action: 'failed', error: await refused(res) })
          } catch (e: any) {
            results.push({ topic, action: 'failed', error: e.message })
          }
        } else {
          results.push({ topic, action: 'already active' })
        }
      } else {
        try {
          await this.createWebhook(topic, deliveryUrl, secret)
          results.push({ topic, action: 'created' })
        } catch (e: any) {
          results.push({ topic, action: 'failed', error: e.message })
        }
      }
      for (const w of extra) {
        try {
          const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/webhooks/${w.id}?force=true`, { method: 'DELETE', headers: this.wcHeaders() })
          if (res.ok) results.push({ topic, action: `removed duplicate #${w.id}` })
          else results.push({ topic, action: `duplicate #${w.id} not removed`, error: await refused(res) })
        } catch (e: any) {
          results.push({ topic, action: `duplicate #${w.id} not removed`, error: e.message })
        }
      }
    }
    return results
  }

  // Look up a single order by its number/id. Returns the full order (line items,
  // totals, billing/shipping) or null if not found. Throws StoreResponseError
  // when the store answers with a web page (say why, not "not found"). The
  // same order within 60 seconds shares one look-up (opts.fresh skips that).
  async getOrderByNumber(orderNumber: string | number, opts: { fresh?: boolean } = {}): Promise<any | null> {
    const key = `${storeKey(this.config.storeUrl)}|${hashKey(this.config.consumerKey || '')}|${String(orderNumber).trim()}`
    const hit = orderCache.get(key)
    if (hit && !opts.fresh && Date.now() - hit.at < ORDER_TTL_MS) return hit.p
    const p = this.fetchOrderByNumber(orderNumber)
    orderCache.set(key, { at: Date.now(), p })
    if (orderCache.size > 2000) { const first = orderCache.keys().next().value; if (first) orderCache.delete(first) }
    // Only a found order is kept: "not found" and failures are asked again (the
    // back-off in lib/store-response.ts covers a store that's failing).
    p.then(o => { if (!o && orderCache.get(key)?.p === p) orderCache.delete(key) }, () => { if (orderCache.get(key)?.p === p) orderCache.delete(key) })
    return p
  }

  private async fetchOrderByNumber(orderNumber: string | number): Promise<any | null> {
    // Order number usually equals the order id in WooCommerce.
    try {
      const { res, data } = await this.api(`orders/${encodeURIComponent(String(orderNumber))}`)
      if (res.ok) return data
      // Fall back to searching by the "number" field (some stores use sequential-order plugins)
      const search = await this.api(`orders?search=${encodeURIComponent(String(orderNumber))}&per_page=5`)
      if (search.res.ok) {
        const list = Array.isArray(search.data) ? search.data : []
        const match = list.find((o: any) => String(o.number) === String(orderNumber) || String(o.id) === String(orderNumber))
        return match || list[0] || null
      }
    } catch (e) {
      // A web page instead of data: the caller says why (logged once per store in readStoreJson).
      if (isStoreResponseError(e)) throw e
      console.error('getOrderByNumber failed', e)
    }
    return null
  }

  // Create a refund on an order. With Stripe, api_refund=true refunds the actual
  // card. `lineItems` optionally refunds specific items; `amount` refunds a total.
  async createRefund(orderId: number, params: { amount?: string; reason?: string; lineItems?: any[]; shippingLines?: any[]; refundPayment?: boolean }): Promise<{ ok: boolean; refund?: any; error?: string }> {
    try {
      const body: any = {
        reason: params.reason || 'DOA claim',
        api_refund: params.refundPayment !== false, // true = refund via gateway (Stripe)
      }
      if (params.amount) body.amount = params.amount
      if (params.lineItems && params.lineItems.length) body.line_items = params.lineItems
      if (params.shippingLines && params.shippingLines.length) body.shipping_lines = params.shippingLines

      const { res, data } = await this.api(`orders/${orderId}/refunds`, { method: 'POST', body: JSON.stringify(body) })
      forgetWooOrders(this.config.storeUrl)
      if (!res.ok) return { ok: false, error: data?.message || `Refund failed (${res.status})` }
      return { ok: true, refund: data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  // Create a single-use coupon restricted to one customer email.
  async createCoupon(params: { code: string; amount: string; email: string; description?: string }): Promise<{ ok: boolean; coupon?: any; error?: string }> {
    try {
      const body = {
        code: params.code,
        discount_type: 'fixed_cart',
        amount: params.amount,
        individual_use: true,
        email_restrictions: [params.email],
        usage_limit: 1,
        usage_limit_per_user: 1,
        description: params.description || 'DOA store credit',
      }
      const { res, data } = await this.api('coupons', { method: 'POST', body: JSON.stringify(body) })
      if (!res.ok) return { ok: false, error: data?.message || `Coupon creation failed (${res.status})` }
      return { ok: true, coupon: data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  // ── Create Order support ───────────────────────────────────────────────

  // Live product search. WooCommerce's `search=` only matches title/content, NOT
  // SKU (SKUs live in post meta, excluded for performance). So we run the text
  // search AND a SKU search in parallel and merge, de-duplicated. We also widen
  // per_page so more matches surface.
  async searchProducts(query: string, limit = 20): Promise<any[]> {
    const norm = (p: any) => ({
      id: p.id, name: p.name, sku: p.sku, type: p.type,
      price: p.price, regular_price: p.regular_price, sale_price: p.sale_price,
      on_sale: !!p.on_sale,
      tax_status: p.tax_status, tax_class: p.tax_class,
      stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock,
      image: p.images?.[0]?.src || null,
      // The public product page — needed so an agent can send the customer a
      // link they can actually buy from.
      permalink: p.permalink || null,
      short_description: (p.short_description || '').replace(/<[^>]+>/g, '').trim(),
      has_variations: p.type === 'variable' && (p.variations?.length || 0) > 0,
      variation_ids: p.variations || [],
    })
    // Don't swallow failures. Previously every error became an empty array, so a
    // bad API key or a permissions problem looked identical to "no results" —
    // which made this feature look broken with no way to tell why.
    const base = `${this.config.storeUrl}/wp-json/wc/v3/products`
    const h = this.wcHeaders()

    const call = async (url: string) => {
      const held = storeBackoff(this.config.storeUrl); if (held) throw held
      const res = await fetch(url, { headers: h })
      // A web page (security plugin, firewall…) throws a clear StoreResponseError here.
      const body = await readStoreJson(res, { provider: 'woocommerce', store: this.config.storeUrl })
      if (!res.ok) {
        const detail = body?.message || ''
        if (res.status === 401 || res.status === 403) {
          throw new Error(`WooCommerce rejected the request (${res.status}). Check the API key has Read access. ${detail}`.trim())
        }
        throw new Error(`WooCommerce error ${res.status}${detail ? `: ${detail}` : ''}`)
      }
      return body
    }

    // Only the fields we actually use. WooCommerce returns the ENTIRE product
    // otherwise — full HTML description, every meta row, category and tag
    // objects — which is most of the weight of this request and none of the
    // value. This is the single biggest thing making the picker feel slow.
    const FIELDS = [
      'id', 'name', 'sku', 'type', 'price', 'regular_price', 'sale_price', 'on_sale',
      'tax_status', 'tax_class', 'stock_status', 'stock_quantity', 'manage_stock',
      'images', 'permalink', 'short_description', 'variations',
    ].join(',')
    const page = Math.max(limit * 3, 50)
    const q = (term: string, extra = '') =>
      `${base}?per_page=${page}&status=publish&_fields=${FIELDS}${extra}&search=${encodeURIComponent(term)}`

    // Search the WHOLE phrase, and separately its first word.
    //
    // WooCommerce's `search` is a WordPress search: it requires every term to
    // appear, and a partial last word routinely misses. Typing "Cichlid col"
    // returned three unrelated fish and NOT "Cichlid Color Food" — no ranking
    // can rescue a product the query never returned. The first word alone is the
    // widest reliable net, and the scoring below then puts the product whose
    // NAME starts with the full phrase back on top where it belongs.
    const terms = query.trim().split(/\s+/).filter(Boolean)
    const broad = terms.length > 1 ? terms[0] : null

    // In parallel. These used to run one after another for no reason, so every
    // keystroke paid both round trips end to end.
    const [byText, byBroad, bySkuExact] = await Promise.all([
      call(q(query)),
      broad ? call(q(broad)).catch(() => []) : Promise.resolve([]),
      call(`${base}?sku=${encodeURIComponent(query)}&per_page=${limit}&status=publish&_fields=${FIELDS}`).catch(() => []),
    ])

    // Merge and de-duplicate by id.
    const seen = new Set<number>()
    const merged: any[] = []
    for (const p of [...(byText || []), ...(byBroad || []), ...(bySkuExact || [])]) {
      if (p && p.id && !seen.has(p.id)) { seen.add(p.id); merged.push(norm(p)) }
    }

    // Rank them ourselves. What someone typed is almost always the start of a
    // product's NAME, so that has to outrank a word buried in a description.
    // Lower score is better.
    const ql = query.trim().toLowerCase()
    const qterms = ql.split(/\s+/).filter(Boolean)
    const score = (p: any): number => {
      const name = String(p.name || '').toLowerCase()
      const sku = String(p.sku || '').toLowerCase()
      if (sku === ql) return 0
      if (name === ql) return 1
      if (name.startsWith(ql)) return 2
      if (name.includes(ql)) return 3
      if (sku.startsWith(ql)) return 4
      // Every word present in the name, just not adjacent.
      const hit = qterms.filter(t => name.includes(t)).length
      if (qterms.length && hit === qterms.length) return 5
      if (hit > 0) return 6 + (qterms.length - hit)
      // Nothing in the name: WooCommerce matched the description. Keep it, since
      // it is occasionally what was meant, but never above a name match.
      return 50
    }
    // Drop pure description matches (score 50 — no query term in the name or
    // SKU) whenever there are genuine name/SKU matches. Otherwise a search like
    // "cichlid col" fills up with unrelated products whose *descriptions* happen
    // to mention one of the words. Only fall back to description matches when
    // nothing matches by name/SKU at all.
    const scored = merged.map((p, i) => ({ p, s: score(p), i }))
    const strong = scored.filter(x => x.s < 50)
    const chosen = strong.length ? strong : scored
    return chosen
      .sort((a, b) => (a.s - b.s) || (a.i - b.i))   // stable within a score
      .slice(0, limit)
      .map(x => x.p)
  }

  // Fetch the variations of a variable product (exact variation IDs + attributes).
  async getProductVariations(productId: number): Promise<any[]> {
    try {
      const { res, data: vars } = await this.api(`products/${productId}/variations?per_page=50`)
      if (!res.ok) return []
      return (vars || []).map((v: any) => ({
        id: v.id, sku: v.sku, price: v.price, regular_price: v.regular_price,
        stock_status: v.stock_status, stock_quantity: v.stock_quantity, manage_stock: v.manage_stock,
        image: v.image?.src || null,
        attributes: (v.attributes || []).map((a: any) => `${a.name}: ${a.option}`).join(', '),
      }))
    } catch { return [] }
  }

  // Resolve product images by SKU. WooCommerce order line items usually don't
  // carry an image, so anything showing an order's products (the Out of Stock
  // list, packing previews) has nothing to display. This looks each SKU up
  // against the products endpoint and returns { sku: imageUrl }. Capped and run
  // in parallel; a SKU with no product / no image is simply omitted.
  async imagesForSkus(skus: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    const base = `${this.config.storeUrl}/wp-json/wc/v3/products`
    const h = this.wcHeaders()
    const uniq = Array.from(new Set(skus.filter(Boolean))).slice(0, 60)
    await Promise.all(uniq.map(async (sku) => {
      try {
        if (storeBackoff(this.config.storeUrl)) return
        const res = await fetch(`${base}?sku=${encodeURIComponent(sku)}&per_page=1&status=publish`, { headers: h })
        const arr = await readStoreJson(res, { provider: 'woocommerce', store: this.config.storeUrl })
        if (!res.ok) return
        const img = arr?.[0]?.images?.[0]?.src
        if (img) out[sku] = img
      } catch { /* skip this sku */ }
    }))
    return out
  }

  // Stock by store (lib/outlet-stock): the `locations` field the "Stock
  // Locations for WooCommerce" plugin adds to products and variations. Only
  // id + locations are asked for; a store without the plugin just answers ids.
  // Errors throw, so a store that can't be reached never reads as "no plugin".
  async getLocationFields(ids: number[]): Promise<any[]> {
    const want = Array.from(new Set(ids.filter(n => Number.isInteger(n) && n > 0))).slice(0, 50)
    if (!want.length) return []
    const { res, data } = await this.api(`products?include=${want.join(',')}&per_page=${want.length}&_fields=id,locations`)
    if (!res.ok || !Array.isArray(data)) throw new Error(`WooCommerce error ${res.status}`)
    return data
  }

  async getVariationLocationFields(productId: number): Promise<any[]> {
    const { res, data } = await this.api(`products/${productId}/variations?per_page=50&_fields=id,locations`)
    if (!res.ok || !Array.isArray(data)) throw new Error(`WooCommerce error ${res.status}`)
    return data
  }

  /** A sample of products' location fields, for detecting the plugin. */
  async sampleLocationFields(n = 20): Promise<any[]> {
    const { res, data } = await this.api(`products?per_page=${n}&status=publish&_fields=id,locations`)
    if (!res.ok || !Array.isArray(data)) throw new Error(`WooCommerce error ${res.status}`)
    return data
  }

  /**
   * The plugin's stock locations (a public `location` taxonomy, so the
   * WordPress REST API lists them without credentials; sending the API key
   * there would be refused). Null when the store won't say.
   */
  async getStockLocationTerms(): Promise<any[] | null> {
    try {
      if (storeBackoff(this.config.storeUrl)) return null
      const res = await fetch(`${this.config.storeUrl}/wp-json/wp/v2/location?per_page=100&_fields=id,name,slug`, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      return Array.isArray(data) ? data : null
    } catch { return null }
  }

  // Re-fetch a single product or variation to recheck price/stock right before
  // submitting (another sale may have happened while the panel was open).
  async getProductOrVariation(productId: number, variationId?: number): Promise<any | null> {
    try {
      const { res, data: p } = await this.api(variationId ? `products/${productId}/variations/${variationId}` : `products/${productId}`)
      if (!res.ok || !p) return null
      return { id: p.id, price: p.price, stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock, name: p.name }
    } catch { return null }
  }

  // Validate a coupon against WooCommerce's own record. Returns the checks the
  // panel needs: existence, expiry, minimum spend, usage limit, product scope.
  async validateCoupon(code: string, opts: { subtotal?: number; email?: string; productIds?: number[] } = {}): Promise<{ ok: boolean; error?: string; coupon?: any }> {
    try {
      const { res, data: list } = await this.api(`coupons?code=${encodeURIComponent(code)}`)
      if (!res.ok) return { ok: false, error: `Coupon lookup failed (${res.status})` }
      const c = (list || [])[0]
      if (!c) return { ok: false, error: 'Coupon code does not exist.' }

      // Expiry
      if (c.date_expires) {
        const exp = new Date(c.date_expires)
        if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) return { ok: false, error: 'This coupon has expired.' }
      }
      // Usage limit
      if (c.usage_limit != null && c.usage_count != null && c.usage_count >= c.usage_limit) {
        return { ok: false, error: 'This coupon has reached its usage limit.' }
      }
      // Minimum spend
      if (c.minimum_amount && parseFloat(c.minimum_amount) > 0 && opts.subtotal != null && opts.subtotal < parseFloat(c.minimum_amount)) {
        return { ok: false, error: `Minimum spend of $${c.minimum_amount} not met for this coupon.` }
      }
      // Maximum spend
      if (c.maximum_amount && parseFloat(c.maximum_amount) > 0 && opts.subtotal != null && opts.subtotal > parseFloat(c.maximum_amount)) {
        return { ok: false, error: `This coupon only applies below $${c.maximum_amount}.` }
      }
      // Email restriction
      if (Array.isArray(c.email_restrictions) && c.email_restrictions.length > 0 && opts.email) {
        const allowed = c.email_restrictions.map((e: string) => e.toLowerCase())
        if (!allowed.includes(opts.email.toLowerCase())) return { ok: false, error: 'This coupon is restricted to a different customer.' }
      }
      // Product include/exclude
      if (opts.productIds && opts.productIds.length) {
        if (Array.isArray(c.product_ids) && c.product_ids.length > 0) {
          const anyIncluded = opts.productIds.some(id => c.product_ids.includes(id))
          if (!anyIncluded) return { ok: false, error: 'This coupon does not apply to the items in this order.' }
        }
        if (Array.isArray(c.excluded_product_ids) && c.excluded_product_ids.length > 0) {
          const anyExcluded = opts.productIds.some(id => c.excluded_product_ids.includes(id))
          if (anyExcluded) return { ok: false, error: 'This coupon excludes one of the items in this order.' }
        }
      }
      return { ok: true, coupon: { code: c.code, discount_type: c.discount_type, amount: c.amount, id: c.id } }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  // Find an existing customer by email (WooCommerce customer id).
  async findCustomerByEmail(email: string): Promise<any | null> {
    try {
      const { res, data: list } = await this.api(`customers?email=${encodeURIComponent(email)}`)
      if (!res.ok) return null
      return (list || [])[0] || null
    } catch { return null }
  }

  async createCustomer(params: { email: string; first_name?: string; last_name?: string; phone?: string; billing?: any; shipping?: any }): Promise<{ ok: boolean; customer?: any; error?: string }> {
    try {
      const { res, data } = await this.api('customers', {
        method: 'POST',
        body: JSON.stringify({ email: params.email, first_name: params.first_name, last_name: params.last_name, billing: params.billing, shipping: params.shipping }),
      })
      if (!res.ok) return { ok: false, error: data?.message || `Customer creation failed (${res.status})` }
      return { ok: true, customer: data }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  // Create an order. Caller passes fully-formed line_items, shipping_lines,
  // fee_lines, coupon_lines, billing/shipping, status and set_paid.
  async createOrder(payload: any): Promise<{ ok: boolean; order?: any; error?: string }> {
    try {
      const { res, data } = await this.api('orders', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) return { ok: false, error: data?.message || `Order creation failed (${res.status})` }
      return { ok: true, order: data }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  // Add an internal (or customer) note to an order after creation.
  async addOrderNote(orderId: number, note: string, customerNote = false): Promise<boolean> {
    try {
      const { res } = await this.api(`orders/${orderId}/notes`, { method: 'POST', body: JSON.stringify({ note, customer_note: customerNote }) })
      return res.ok
    } catch { return false }
  }

  // Read an order's WooCommerce notes (the note history shown in WC admin —
  // system notes, staff private notes, and notes-to-customer).
  async getOrderNotes(orderId: number): Promise<any[]> {
    try {
      const { res, data: notes } = await this.api(`orders/${orderId}/notes?per_page=50`)
      if (!res.ok) return []
      return (notes || []).map((n: any) => ({
        id: n.id, note: n.note, author: n.author || 'WooCommerce',
        date: n.date_created_gmt ? `${n.date_created_gmt}Z` : n.date_created,
        customer_note: !!n.customer_note,
      }))
    } catch { return [] }
  }

  // All orders for an email (covers guest orders + Colvy-created orders that
  // may not have synced into our local table yet). Returns live from WooCommerce.
  async getOrdersByEmail(email: string, limit = 25): Promise<any[]> {
    try {
      const { res, data: orders } = await this.api(`orders?search=${encodeURIComponent(email)}&per_page=${limit}&orderby=date&order=desc`)
      if (!res.ok) return []
      // WooCommerce `search` matches broadly; keep only orders whose billing email matches.
      return (orders || [])
        .filter((o: any) => (o.billing?.email || '').toLowerCase() === email.toLowerCase())
        .map((o: any) => ({
          id: o.id, number: o.number || o.id, status: o.status, total: o.total, currency: o.currency,
          date: o.date_created, payment_method: o.payment_method_title,
          // Carry SKU + product image so the order card can show them without a
          // second detail round-trip. Shipping comes from shipping_lines.
          items: (o.line_items || []).map((li: any) => ({
            id: li.id, product_id: li.product_id, name: li.name, quantity: li.quantity,
            total: li.total, sku: li.sku || null,
            image: li.image?.src ? { src: li.image.src } : null,
          })),
          shipping_total: o.shipping_total ?? null,
          shipping_method: (o.shipping_lines || [])[0]?.method_title || null,
          order_key: o.order_key, payment_url: o.payment_url,
          total_refunded: (o.refunds || []).reduce((s: number, r: any) => s + Math.abs(parseFloat(r.total || 0)), 0),
          // An in-store Prexty POS sale pushed into the store (pos_source 'prexty' + its sale number).
          ...posColumns(o),
        }))
    } catch { return [] }
  }

  // Read the store's configured shipping methods across all zones, so staff
  // pick a real method rather than a hardcoded list.
  async getShippingMethods(): Promise<Array<{ zone: string; method_id: string; title: string; cost?: string }>> {
    try {
      const { res: zonesRes, data: zones } = await this.api('shipping/zones')
      if (!zonesRes.ok) return []
      // Include zone 0 ("Rest of the world") which the zones list may omit.
      const zoneList = [...(zones || [])]
      const out: Array<{ zone: string; method_id: string; title: string; cost?: string }> = []
      for (const z of zoneList) {
        try {
          const { res: mRes, data: methods } = await this.api(`shipping/zones/${z.id}/methods`)
          if (!mRes.ok) continue
          for (const m of (methods || [])) {
            if (m.enabled === false) continue
            out.push({
              zone: z.name || 'Zone',
              method_id: m.method_id,
              title: m.title || m.method_title || m.method_id,
              cost: m.settings?.cost?.value || m.settings?.cost || undefined,
            })
          }
        } catch {}
      }
      return out
    } catch { return [] }
  }

  async getCustomers(): Promise<WooCommerceCustomer[]> {
    try {
      const allCustomers: WooCommerceCustomer[] = []
      let page = 1
      let hasMore = true
      const perPage = 100

      while (hasMore) {
        const { res: response, data: customers } = await this.api(`customers?per_page=${perPage}&page=${page}`)

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.statusText}`)
        }

        allCustomers.push(...customers)

        // Check if there are more pages
        const totalPages = response.headers.get('x-wp-totalpages')
        if (totalPages && page < parseInt(totalPages)) {
          page++
        } else {
          hasMore = false
        }
      }

      return allCustomers
    } catch (error) {
      if (!isStoreResponseError(error)) console.error('Failed to fetch WooCommerce customers:', error)   // a web page: logged once per store already
      throw error
    }
  }

  /**
   * Fetch customer by email
   */
  async getCustomerByEmail(email: string): Promise<WooCommerceCustomer | null> {
    try {
      const { res: response, data: customers } = await this.api(`customers?search=${encodeURIComponent(email)}&per_page=1`)

      if (!response.ok) return null

      return Array.isArray(customers) && customers.length > 0 ? customers[0] : null
    } catch (error) {
      if (!isStoreResponseError(error)) console.error('Failed to fetch customer by email:', error)   // a web page: logged once per store already
      return null
    }
  }

  /**
   * Fetch all orders for a customer (with pagination - no limit)
   */
  async getCustomerOrders(customerId: number): Promise<WooCommerceOrder[]> {
    try {
      const allOrders: WooCommerceOrder[] = []
      let page = 1
      let hasMore = true
      const perPage = 100

      while (hasMore) {
        const { res: response, data: orders } = await this.api(`orders?customer=${customerId}&per_page=${perPage}&page=${page}`)

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.statusText}`)
        }

        allOrders.push(...orders)

        // Check if there are more pages
        const totalPages = response.headers.get('x-wp-totalpages')
        if (totalPages && page < parseInt(totalPages)) {
          page++
        } else {
          hasMore = false
        }
      }

      return allOrders
    } catch (error) {
      if (!isStoreResponseError(error)) console.error('Failed to fetch customer orders:', error)   // a web page: logged once per store already
      throw error
    }
  }

  /**
   * Calculate customer lifetime value and stats
   */
  async getCustomerStats(customerId: number) {
    try {
      const orders = await this.getCustomerOrders(customerId)
      
      const stats = {
        totalOrders: orders.length,
        totalSpend: orders.reduce((sum, order) => sum + parseFloat(order.total), 0),
        averageOrderValue: 0,
        lastOrderDate: null as string | null,
        firstOrderDate: null as string | null,
        itemsPurchased: [] as string[],
        orderStatuses: {} as Record<string, number>
      }

      if (orders.length > 0) {
        stats.averageOrderValue = stats.totalSpend / orders.length
        
        // Sort by date
        const sorted = [...orders].sort((a, b) => 
          new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
        )
        
        stats.lastOrderDate = sorted[0].date_created
        stats.firstOrderDate = sorted[sorted.length - 1].date_created
        
        // Collect items and statuses
        orders.forEach(order => {
          order.line_items.forEach(item => {
            if (!stats.itemsPurchased.includes(item.name)) {
              stats.itemsPurchased.push(item.name)
            }
          })
          
          stats.orderStatuses[order.status] = (stats.orderStatuses[order.status] || 0) + 1
        })
      }

      return stats
    } catch (error) {
      if (!isStoreResponseError(error)) console.error('Failed to calculate customer stats:', error)   // a web page: logged once per store already
      throw error
    }
  }

  /**
   * Test API credentials
   */
  // Reads the store's display name (WooCommerce exposes it via system_status
  // → settings.title, or we fall back to the WordPress site name).
  async getStoreInfo(): Promise<{ name?: string } | null> {
    try {
      const { res, data } = await this.api('system_status')
      if (res.ok) {
        const name = data?.settings?.title || data?.environment?.site_title
        if (name) return { name }
      }
      // Fall back to the WP root endpoint which returns the site name
      const wp = await fetch(`${this.config.storeUrl}/wp-json`)
      if (wp.ok) { const d = await readStoreJson(wp, { provider: 'woocommerce', store: this.config.storeUrl }); if (d?.name) return { name: d.name } }
    } catch {}
    return null
  }

  async testConnection(): Promise<boolean> {
    return (await this.checkConnection()).ok
  }

  /** Test the store and key, with a reason people can act on when it fails. Never waits on the back-off. */
  async checkConnection(): Promise<{ ok: boolean; error?: string; status?: number }> {
    try {
      // One order id, not system_status: that report makes WordPress gather every
      // plugin, table and setting and often takes longer than the timeout on a busy
      // store. This asks the same questions (store reachable, key accepted, API on).
      const response = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders?per_page=1&_fields=id`, { method: 'GET', headers: this.wcHeaders(), signal: AbortSignal.timeout(15_000) })
      const data = await readStoreJson(response, { provider: 'woocommerce', store: this.config.storeUrl })
      if (response.ok) return { ok: true, status: response.status }
      if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, error: `WooCommerce refused the API key (${response.status}). Check the consumer key and secret, and that the key has Read/Write access.${data?.message ? ` ${String(data.message).slice(0, 160)}` : ''}` }
      if (response.status === 404) return { ok: false, status: 404, error: 'WooCommerce’s API wasn’t found at this address. Check the store URL, that WooCommerce is active, and that Settings → Permalinks isn’t set to “Plain”.' }
      return { ok: false, status: response.status, error: `WooCommerce answered ${response.status}${data?.message ? `: ${String(data.message).slice(0, 160)}` : ''}` }
    } catch (error: any) {
      if (isStoreResponseError(error)) return { ok: false, status: error.status, error: error.message }
      // A slow or unreachable store is the store's problem, not an error in Colvy.
      console.warn('WooCommerce connection test failed:', this.config.storeUrl, error?.name || '', String(error?.message || error).slice(0, 160))
      return { ok: false, error: error?.name === 'TimeoutError' ? 'The store took too long to answer. If it keeps happening, check the website is up and not overloaded.' : `Couldn’t reach the store: ${String(error?.message || error).slice(0, 160)}` }
    }
  }
}

/**
 * Create WooCommerce service from Supabase stored credentials
 */
export async function createWooCommerceService(
  supabase: any,
  companyId: string
) {
  try {
    const { data, error } = await supabase
      .from('woocommerce_integrations')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()

    if (error || !data) {
      throw new Error('WooCommerce integration not configured')
    }

    return new WooCommerceService({
      storeUrl: data.store_url,
      consumerKey: data.consumer_key,
      consumerSecret: data.consumer_secret,
      companyId
    })
  } catch (error) {
    console.error('Failed to create WooCommerce service:', error)
    throw error
  }
}
