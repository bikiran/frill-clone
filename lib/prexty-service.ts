// Thin client for the Prexty POS "External API".
//
// Auth is a single API key sent in the `X-Prexty` request header (per-company,
// whole-business access). Every call targets `${baseUrl}/api/v1/...`; base URL
// defaults to https://prexty.com.
//
// Confirmed contract (probed against the live API):
//   GET /api/v1/customers?search=<term>&page=<n>
//     - `search` matches email, mobile (0… and +61…), and name, server-side.
//       (email/mobile/phone/per_page params are IGNORED — only `search` filters.)
//     - Response is a Laravel paginator nested under data.customers:
//         { status, data: { customers: { data:[…], total, current_page,
//           last_page, per_page(=20 fixed), next_page_url, … } } }
//   There is NO /customers/{id} route and NO /api/v1/orders yet (404) — order
//   history wiring waits on that endpoint; getOrders() is kept ready for it.

export interface PrextyConfig {
  baseUrl?: string | null
  apiKey: string
}

// Normalized customer shape the app consumes (raw Prexty fields are messy).
export interface PrextyCustomer {
  id: number
  wooId: number | null
  name: string
  firstName: string | null
  lastName: string | null
  email: string | null
  mobile: string | null
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  country: string | null
  totalOrders: number
  totalSpent: number
  loyaltyPoints: number
  storeCredit: number
  rewardBalance: number
  balance: number
  customerCode: string | null
  memberSince: string | null
  imageUrl: string | null
}

const onlyDigits = (s: any) => String(s || '').replace(/\D/g, '')
// Match the phone convention used elsewhere in the app (last 9 significant
// digits), so 0490… / +61490… / 61490… all compare equal.
const phoneKey = (s: any) => onlyDigits(s).slice(-9)

export function normalizePrextyCustomer(c: any): PrextyCustomer {
  return {
    id: Number(c?.id) || 0,
    wooId: c?.woo_id != null ? Number(c.woo_id) : null,
    name: (c?.name || `${c?.firstname || ''} ${c?.lastname || ''}`).trim(),
    firstName: c?.firstname || null,
    lastName: c?.lastname || null,
    email: c?.email || null,
    mobile: c?.mobile || null,
    address: c?.address || null,
    city: c?.city || null,
    state: c?.state || null,
    postcode: c?.postcode || c?.zip || null,
    country: c?.country_name || c?.country_code || null,
    totalOrders: Number(c?.total_sales_count) || 0,
    totalSpent: Number(c?.total_sales_amount) || 0,
    loyaltyPoints: Number(c?.loyalty_points) || 0,
    storeCredit: Number(c?.store_credit) || 0,
    rewardBalance: Number(c?.reward_balance) || 0,
    balance: Number(c?.balance) || 0,
    customerCode: c?.customer_code || null,
    memberSince: c?.created_at || null,
    imageUrl: c?.image_url || null,
  }
}

export class PrextyService {
  private baseUrl: string
  private apiKey: string

  constructor(cfg: PrextyConfig) {
    this.baseUrl = (cfg.baseUrl || 'https://prexty.com').replace(/\/+$/, '')
    this.apiKey = cfg.apiKey
  }

  private async get(path: string, params?: Record<string, string | number | undefined>): Promise<any> {
    const url = new URL(`${this.baseUrl}/api/v1/${path.replace(/^\/+/, '')}`)
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString(), {
      headers: { 'X-Prexty': this.apiKey, Accept: 'application/json' },
    })
    const text = await res.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    if (!res.ok) {
      const msg = (body && (body.message || body.error)) || `Prexty API returned ${res.status}`
      const err: any = new Error(Array.isArray(msg) ? msg.join(', ') : msg)
      err.status = res.status
      err.body = body
      throw err
    }
    return body
  }

  // GET /api/v1/customers — raw paginator page (used for the connection test and
  // as the primitive behind search). `search` is the only param the API honours.
  async listCustomers(params?: { search?: string; page?: number }): Promise<{ customers: PrextyCustomer[]; total: number; page: number; lastPage: number }> {
    const body = await this.get('customers', { search: params?.search, page: params?.page })
    const pg = body?.data?.customers || {}
    const rows: any[] = Array.isArray(pg?.data) ? pg.data : []
    return {
      customers: rows.map(normalizePrextyCustomer),
      total: Number(pg?.total) || rows.length,
      page: Number(pg?.current_page) || 1,
      lastPage: Number(pg?.last_page) || 1,
    }
  }

  // Find the single Prexty customer for a chat contact, matched by email first
  // (exact, case-insensitive) then by phone (last-9-digits). `search` matches
  // both fields server-side, so at most one narrow query per identifier.
  async findCustomerByContact(contact: { email?: string | null; phone?: string | null }): Promise<PrextyCustomer | null> {
    const email = (contact.email || '').trim().toLowerCase()
    const phone = (contact.phone || '').trim()

    if (email) {
      try {
        const { customers } = await this.listCustomers({ search: email })
        const hit = customers.find(c => (c.email || '').toLowerCase() === email)
        if (hit) return hit
      } catch { /* fall through to phone */ }
    }
    if (phone) {
      const target = phoneKey(phone)
      if (target) {
        try {
          const { customers } = await this.listCustomers({ search: phone })
          const hit = customers.find(c => phoneKey(c.mobile) === target)
          if (hit) return hit
        } catch { /* nothing else to try */ }
      }
    }
    return null
  }

  // GET /api/v1/orders — NOT live yet (404 today). Wrapper kept ready so the
  // inbox order-pull can drop in without touching callers when it ships.
  getOrders(params?: { email?: string; phone?: string; outlet_id?: number; page?: number }): Promise<any> {
    return this.get('orders', params as any)
  }

  // Cheap auth + reachability check for the setup screen. Never throws.
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.get('customers', { page: 1 })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Connection failed' }
    }
  }
}

export function createPrextyService(cfg: PrextyConfig): PrextyService {
  return new PrextyService(cfg)
}
