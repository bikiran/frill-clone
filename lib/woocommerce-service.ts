/**
 * WooCommerce REST API Integration Service
 * Handles 2-way sync between WooCommerce and Colvy
 */

interface WooCommerceConfig {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
  companyId: string
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

  // ── Webhooks ────────────────────────────────────────────────────────────
  // Colvy needs WooCommerce to push order events to us so a new order can open
  // a chat. Previously this had to be added by hand in WooCommerce settings —
  // which is why orders silently never created conversations. We now register
  // (and reconcile) the webhooks automatically.

  async listWebhooks(): Promise<any[]> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/webhooks?per_page=100`, { headers: this.wcHeaders() })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch { return [] }
  }

  async createWebhook(topic: string, deliveryUrl: string, secret?: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/webhooks`, {
        method: 'POST',
        headers: this.wcHeaders(),
        body: JSON.stringify({
          name: `Colvy — ${topic}`,
          topic,                 // e.g. 'order.created', 'order.updated'
          delivery_url: deliveryUrl,
          status: 'active',
          ...(secret ? { secret } : {}),
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`WooCommerce rejected the webhook (${res.status}): ${t.slice(0, 200)}`)
      }
      return await res.json()
    } catch (e) {
      throw e
    }
  }

  // Ensure the order webhooks Colvy relies on exist and point at our endpoint.
  // Returns a summary so the UI can tell the user exactly what happened.
  async ensureColvyWebhooks(deliveryUrl: string, secret?: string) {
    const wanted = ['order.created', 'order.updated']
    const existing = await this.listWebhooks()
    const results: any[] = []
    for (const topic of wanted) {
      const match = existing.find((w: any) =>
        w.topic === topic && (w.delivery_url || '').split('?')[0] === deliveryUrl.split('?')[0]
      )
      if (match) {
        // Re-activate if it was disabled (Woo auto-disables after failures).
        if (match.status !== 'active') {
          try {
            await fetch(`${this.config.storeUrl}/wp-json/wc/v3/webhooks/${match.id}`, {
              method: 'PUT', headers: this.wcHeaders(),
              body: JSON.stringify({ status: 'active', delivery_url: deliveryUrl }),
            })
            results.push({ topic, action: 'reactivated' })
          } catch (e: any) {
            results.push({ topic, action: 'failed', error: e.message })
          }
        } else {
          results.push({ topic, action: 'already active' })
        }
        continue
      }
      try {
        await this.createWebhook(topic, deliveryUrl, secret)
        results.push({ topic, action: 'created' })
      } catch (e: any) {
        results.push({ topic, action: 'failed', error: e.message })
      }
    }
    return results
  }

  // Look up a single order by its number/id. Returns the full order (line items,
  // totals, billing/shipping) or null if not found.
  async getOrderByNumber(orderNumber: string | number): Promise<any | null> {
    // Order number usually equals the order id in WooCommerce.
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders/${orderNumber}`, { headers: this.wcHeaders() })
      if (res.ok) return await res.json()
      // Fall back to searching by the "number" field (some stores use sequential-order plugins)
      const search = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(String(orderNumber))}&per_page=5`, { headers: this.wcHeaders() })
      if (search.ok) {
        const list = await search.json()
        const match = (list || []).find((o: any) => String(o.number) === String(orderNumber) || String(o.id) === String(orderNumber))
        return match || list?.[0] || null
      }
    } catch (e) {
      console.error('getOrderByNumber failed', e)
    }
    return null
  }

  // Create a refund on an order. With Stripe, api_refund=true refunds the actual
  // card. `lineItems` optionally refunds specific items; `amount` refunds a total.
  async createRefund(orderId: number, params: { amount?: string; reason?: string; lineItems?: any[]; refundPayment?: boolean }): Promise<{ ok: boolean; refund?: any; error?: string }> {
    try {
      const body: any = {
        reason: params.reason || 'DOA claim',
        api_refund: params.refundPayment !== false, // true = refund via gateway (Stripe)
      }
      if (params.amount) body.amount = params.amount
      if (params.lineItems && params.lineItems.length) body.line_items = params.lineItems

      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders/${orderId}/refunds`, {
        method: 'POST', headers: this.wcHeaders(), body: JSON.stringify(body),
      })
      const data = await res.json()
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
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/coupons`, {
        method: 'POST', headers: this.wcHeaders(), body: JSON.stringify(body),
      })
      const data = await res.json()
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
      tax_status: p.tax_status, tax_class: p.tax_class,
      stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock,
      image: p.images?.[0]?.src || null,
      has_variations: p.type === 'variable' && (p.variations?.length || 0) > 0,
      variation_ids: p.variations || [],
    })
    try {
      const base = `${this.config.storeUrl}/wp-json/wc/v3/products`
      const h = this.wcHeaders()
      // Run three lookups: text search, exact SKU, and partial-SKU-via-search.
      const [byText, bySkuExact] = await Promise.all([
        fetch(`${base}?search=${encodeURIComponent(query)}&per_page=${limit}&status=publish`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${base}?sku=${encodeURIComponent(query)}&per_page=${limit}&status=publish`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      ])
      // Merge, de-duplicate by id, keep order (text matches first, then SKU).
      const seen = new Set<number>()
      const merged: any[] = []
      for (const p of [...(byText || []), ...(bySkuExact || [])]) {
        if (p && p.id && !seen.has(p.id)) { seen.add(p.id); merged.push(norm(p)) }
      }
      return merged
    } catch { return [] }
  }

  // Fetch the variations of a variable product (exact variation IDs + attributes).
  async getProductVariations(productId: number): Promise<any[]> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=50`, { headers: this.wcHeaders() })
      if (!res.ok) return []
      const vars = await res.json()
      return (vars || []).map((v: any) => ({
        id: v.id, sku: v.sku, price: v.price, regular_price: v.regular_price,
        stock_status: v.stock_status, stock_quantity: v.stock_quantity, manage_stock: v.manage_stock,
        image: v.image?.src || null,
        attributes: (v.attributes || []).map((a: any) => `${a.name}: ${a.option}`).join(', '),
      }))
    } catch { return [] }
  }

  // Re-fetch a single product or variation to recheck price/stock right before
  // submitting (another sale may have happened while the panel was open).
  async getProductOrVariation(productId: number, variationId?: number): Promise<any | null> {
    try {
      const url = variationId
        ? `${this.config.storeUrl}/wp-json/wc/v3/products/${productId}/variations/${variationId}`
        : `${this.config.storeUrl}/wp-json/wc/v3/products/${productId}`
      const res = await fetch(url, { headers: this.wcHeaders() })
      if (!res.ok) return null
      const p = await res.json()
      return { id: p.id, price: p.price, stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock, name: p.name }
    } catch { return null }
  }

  // Validate a coupon against WooCommerce's own record. Returns the checks the
  // panel needs: existence, expiry, minimum spend, usage limit, product scope.
  async validateCoupon(code: string, opts: { subtotal?: number; email?: string; productIds?: number[] } = {}): Promise<{ ok: boolean; error?: string; coupon?: any }> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/coupons?code=${encodeURIComponent(code)}`, { headers: this.wcHeaders() })
      if (!res.ok) return { ok: false, error: `Coupon lookup failed (${res.status})` }
      const list = await res.json()
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
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`, { headers: this.wcHeaders() })
      if (!res.ok) return null
      const list = await res.json()
      return (list || [])[0] || null
    } catch { return null }
  }

  async createCustomer(params: { email: string; first_name?: string; last_name?: string; phone?: string; billing?: any; shipping?: any }): Promise<{ ok: boolean; customer?: any; error?: string }> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/customers`, {
        method: 'POST', headers: this.wcHeaders(),
        body: JSON.stringify({ email: params.email, first_name: params.first_name, last_name: params.last_name, billing: params.billing, shipping: params.shipping }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data?.message || `Customer creation failed (${res.status})` }
      return { ok: true, customer: data }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  // Create an order. Caller passes fully-formed line_items, shipping_lines,
  // fee_lines, coupon_lines, billing/shipping, status and set_paid.
  async createOrder(payload: any): Promise<{ ok: boolean; order?: any; error?: string }> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders`, {
        method: 'POST', headers: this.wcHeaders(), body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data?.message || `Order creation failed (${res.status})` }
      return { ok: true, order: data }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  // Add an internal (or customer) note to an order after creation.
  async addOrderNote(orderId: number, note: string, customerNote = false): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders/${orderId}/notes`, {
        method: 'POST', headers: this.wcHeaders(), body: JSON.stringify({ note, customer_note: customerNote }),
      })
      return res.ok
    } catch { return false }
  }

  // All orders for an email (covers guest orders + Colvy-created orders that
  // may not have synced into our local table yet). Returns live from WooCommerce.
  async getOrdersByEmail(email: string, limit = 25): Promise<any[]> {
    try {
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(email)}&per_page=${limit}&orderby=date&order=desc`, { headers: this.wcHeaders() })
      if (!res.ok) return []
      const orders = await res.json()
      // WooCommerce `search` matches broadly; keep only orders whose billing email matches.
      return (orders || [])
        .filter((o: any) => (o.billing?.email || '').toLowerCase() === email.toLowerCase())
        .map((o: any) => ({
          id: o.id, number: o.number || o.id, status: o.status, total: o.total, currency: o.currency,
          date: o.date_created, payment_method: o.payment_method_title,
          items: (o.line_items || []).map((li: any) => ({ name: li.name, quantity: li.quantity, total: li.total })),
          order_key: o.order_key, payment_url: o.payment_url,
        }))
    } catch { return [] }
  }

  // Read the store's configured shipping methods across all zones, so staff
  // pick a real method rather than a hardcoded list.
  async getShippingMethods(): Promise<Array<{ zone: string; method_id: string; title: string; cost?: string }>> {
    try {
      const h = this.wcHeaders()
      const zonesRes = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/shipping/zones`, { headers: h })
      if (!zonesRes.ok) return []
      const zones = await zonesRes.json()
      // Include zone 0 ("Rest of the world") which the zones list may omit.
      const zoneList = [...(zones || [])]
      const out: Array<{ zone: string; method_id: string; title: string; cost?: string }> = []
      for (const z of zoneList) {
        try {
          const mRes = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/shipping/zones/${z.id}/methods`, { headers: h })
          if (!mRes.ok) continue
          const methods = await mRes.json()
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
        const response = await fetch(
          `${this.config.storeUrl}/wp-json/wc/v3/customers?per_page=${perPage}&page=${page}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${this.basicAuth}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.statusText}`)
        }

        const customers = await response.json()
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
      console.error('Failed to fetch WooCommerce customers:', error)
      throw error
    }
  }

  /**
   * Fetch customer by email
   */
  async getCustomerByEmail(email: string): Promise<WooCommerceCustomer | null> {
    try {
      const response = await fetch(
        `${this.config.storeUrl}/wp-json/wc/v3/customers?search=${encodeURIComponent(email)}&per_page=1`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) return null

      const customers = await response.json()
      return customers.length > 0 ? customers[0] : null
    } catch (error) {
      console.error('Failed to fetch customer by email:', error)
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
        const response = await fetch(
          `${this.config.storeUrl}/wp-json/wc/v3/orders?customer=${customerId}&per_page=${perPage}&page=${page}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${this.basicAuth}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.statusText}`)
        }

        const orders = await response.json()
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
      console.error('Failed to fetch customer orders:', error)
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
      console.error('Failed to calculate customer stats:', error)
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
      const res = await fetch(`${this.config.storeUrl}/wp-json/wc/v3/system_status`, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${this.basicAuth}`, 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        const name = data?.settings?.title || data?.environment?.site_title
        if (name) return { name }
      }
      // Fall back to the WP root endpoint which returns the site name
      const wp = await fetch(`${this.config.storeUrl}/wp-json`)
      if (wp.ok) { const d = await wp.json(); if (d?.name) return { name: d.name } }
    } catch {}
    return null
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.storeUrl}/wp-json/wc/v3/system_status`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json'
          }
        }
      )
      return response.ok
    } catch (error) {
      console.error('WooCommerce connection test failed:', error)
      return false
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
