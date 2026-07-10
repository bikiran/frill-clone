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
