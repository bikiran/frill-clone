// Thin client for the Prexty POS "External API".
//
// Auth is a single API key sent in the `X-Prexty` request header (per-company,
// whole-business access). Every call targets `${baseUrl}/api/v1/...`; base URL
// defaults to https://prexty.com. Read-only for now — `getCustomers` backs the
// connection test today, and `getOrders` is ready to wire into the inbox as
// soon as Prexty's /api/v1/orders endpoint ships.

export interface PrextyConfig {
  baseUrl?: string | null
  apiKey: string
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
      const err: any = new Error(msg)
      err.status = res.status
      err.body = body
      throw err
    }
    return body
  }

  // GET /api/v1/customers — live today; used for the connection test.
  getCustomers(params?: { email?: string; phone?: string; page?: number }): Promise<any> {
    return this.get('customers', params as any)
  }

  // GET /api/v1/orders — not live yet. Wrapper kept ready so the inbox order-pull
  // can drop in without touching this file (orders carry `outlet_id`).
  getOrders(params?: { email?: string; phone?: string; outlet_id?: number; page?: number }): Promise<any> {
    return this.get('orders', params as any)
  }

  // Cheap auth + reachability check for the setup screen. Never throws.
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getCustomers({ page: 1 })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Connection failed' }
    }
  }
}

export function createPrextyService(cfg: PrextyConfig): PrextyService {
  return new PrextyService(cfg)
}
