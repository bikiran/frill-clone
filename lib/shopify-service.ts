// Shopify Admin API client using a custom-app access token. Mirrors the shape
// of WooCommerceService so the sync logic is familiar.
//
// A merchant creates a custom app in their Shopify admin (Settings → Apps and
// sales channels → Develop apps), grants read_customers + read_orders scopes,
// and copies the Admin API access token. We store token + domain and call the
// REST Admin API directly.

export interface ShopifyConfig {
  storeDomain: string   // my-store.myshopify.com
  accessToken: string
  apiVersion?: string
}

export interface ShopifyCustomer {
  id: number
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
  orders_count?: number
  total_spent?: string
  default_address?: any
  created_at?: string
}

export class ShopifyService {
  private domain: string
  private token: string
  private version: string

  constructor(config: ShopifyConfig) {
    // Normalise: accept "store", "store.myshopify.com", or a full URL
    let d = (config.storeDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (d && !d.includes('.')) d = `${d}.myshopify.com`
    this.domain = d
    this.token = config.accessToken
    this.version = config.apiVersion || '2024-10'
  }

  private base() {
    return `https://${this.domain}/admin/api/${this.version}`
  }

  private headers() {
    return { 'X-Shopify-Access-Token': this.token, 'Content-Type': 'application/json' }
  }

  // Verify the token + domain work and return the shop's display name.
  async getShopInfo(): Promise<{ name?: string; ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.base()}/shop.json`, { headers: this.headers() })
      if (!res.ok) return { ok: false, error: `Shopify returned ${res.status}` }
      const data = await res.json()
      return { ok: true, name: data?.shop?.name }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async testConnection(): Promise<boolean> {
    const info = await this.getShopInfo()
    return info.ok
  }

  // Fetch a page of customers using cursor pagination. Returns the customers
  // plus the next page_info cursor (null when done).
  async getCustomersPage(pageInfo?: string, limit = 100): Promise<{ customers: ShopifyCustomer[]; nextPageInfo: string | null }> {
    // With page_info, other filters aren't allowed except limit.
    const url = pageInfo
      ? `${this.base()}/customers.json?limit=${limit}&page_info=${encodeURIComponent(pageInfo)}`
      : `${this.base()}/customers.json?limit=${limit}`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) {
      const err: any = new Error(`Shopify customers: ${res.status}`)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    const nextPageInfo = this.parseNextPageInfo(res.headers.get('link'))
    return { customers: data.customers || [], nextPageInfo }
  }

  // Shopify paginates via a Link header: <...page_info=XXX>; rel="next"
  private parseNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null
    const parts = linkHeader.split(',')
    for (const p of parts) {
      if (p.includes('rel="next"')) {
        const m = p.match(/page_info=([^&>]+)/)
        if (m) return decodeURIComponent(m[1])
      }
    }
    return null
  }

  async getCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
    const res = await fetch(`${this.base()}/customers/search.json?query=${encodeURIComponent('email:' + email)}`, { headers: this.headers() })
    if (!res.ok) return null
    const data = await res.json()
    return data.customers?.[0] || null
  }
}
