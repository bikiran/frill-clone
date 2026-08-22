// Starshipit API client — live shipping rates + label purchase for AU/NZ.
//
// Starshipit is a multi-carrier aggregator (Australia Post, StarTrack, Sendle,
// Aramex, Team Global Express, …): one API returns live rates for every carrier
// the store has connected in its Starshipit account, prints the label PDF, and
// issues the real tracking number. This module is the only place that talks to
// Starshipit; lib/label.ts wraps it behind the generic carrier adapter shape so
// the rest of the app never knows which provider is in use.
//
// Credentials are read from the environment (matching the TGE pattern):
//   STARSHIPIT_API_KEY           — the account API key ("StarShipIT-Api-Key")
//   STARSHIPIT_SUBSCRIPTION_KEY  — the subscription key ("Ocp-Apim-Subscription-Key")
// When either is missing the client is "not configured" and every call returns
// a null/empty result so callers degrade to the manual printable-label path.

const BASE = (process.env.STARSHIPIT_BASE_URL || 'https://api.starshipit.com').replace(/\/$/, '')

export function starshipitConfigured(): boolean {
  return !!(process.env.STARSHIPIT_API_KEY && process.env.STARSHIPIT_SUBSCRIPTION_KEY)
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'StarShipIT-Api-Key': process.env.STARSHIPIT_API_KEY || '',
    'Ocp-Apim-Subscription-Key': process.env.STARSHIPIT_SUBSCRIPTION_KEY || '',
  }
}

async function call(path: string, method: 'GET' | 'POST', body?: any): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.details || json?.errors?.[0]?.message || json?.message || `HTTP ${res.status}`
    throw new Error(`Starshipit ${path}: ${msg}`)
  }
  return json
}

export type ShipAddress = {
  name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null   // ISO-2 preferred (AU); a full name is coerced below
  phone?: string | null
  email?: string | null
}

export type StarshipitRate = {
  carrier: string | null
  service: string | null
  serviceCode: string | null
  price: number | null
  currency: string
  eta: string | null        // human delivery estimate, e.g. "1-2 business days"
}

// Starshipit wants an ISO-2 country code. Coerce the few full names we ever see.
function countryCode(c?: string | null): string {
  const s = String(c || '').trim()
  if (!s) return 'AU'
  if (s.length === 2) return s.toUpperCase()
  const map: Record<string, string> = { australia: 'AU', 'new zealand': 'NZ', 'united states': 'US', 'united kingdom': 'GB' }
  return map[s.toLowerCase()] || s.slice(0, 2).toUpperCase()
}

function destination(to: ShipAddress) {
  return {
    street: [to.address_1, to.address_2].filter(Boolean).join(', ') || '',
    suburb: to.city || '',
    city: to.city || '',
    state: to.state || '',
    post_code: to.postcode || '',
    country_code: countryCode(to.country),
  }
}

// Starshipit dimensions are in METRES and weight in KG. Callers pass grams + cm.
function packageFrom(weightGrams?: number | null, parcel?: { length?: number; width?: number; height?: number } | null) {
  const kg = Math.max(0.1, (Number(weightGrams) || 0) / 1000)
  const m = (cm?: number) => (Number(cm) || 0) / 100
  const pkg: any = { weight: Number(kg.toFixed(3)) }
  if (parcel) {
    if (parcel.length) pkg.length = Number(m(parcel.length).toFixed(3))
    if (parcel.width) pkg.width = Number(m(parcel.width).toFixed(3))
    if (parcel.height) pkg.height = Number(m(parcel.height).toFixed(3))
  }
  return pkg
}

/**
 * Live rates for a destination + parcel across every carrier the account has
 * connected. Returns [] when not configured or on any error (caller falls back).
 */
export async function getRates(opts: {
  to: ShipAddress
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  currency?: string
}): Promise<StarshipitRate[]> {
  if (!starshipitConfigured()) return []
  const body = {
    destination: destination(opts.to),
    packages: [packageFrom(opts.weightGrams, opts.parcel)],
    currency: opts.currency || 'AUD',
  }
  const json = await call('/api/rates', 'POST', body)
  // Starshipit often returns HTTP 200 with success:false + an errors array
  // (e.g. "no origin address", "carrier not connected"). Surface that so the UI
  // can tell the operator what to fix instead of a blank "no rates".
  if (json && json.success === false) {
    const e = Array.isArray(json.errors) ? json.errors[0] : null
    throw new Error(e?.details || e?.message || 'Starshipit returned no rates for this parcel')
  }
  const rates: any[] = Array.isArray(json?.rates) ? json.rates : []
  return rates.map(r => ({
    carrier: r.carrier || r.carrier_name || null,
    service: r.service_name || r.service || r.description || null,
    serviceCode: r.service_code || r.carrier_service_code || null,
    price: r.total_price != null ? Number(r.total_price) : (r.price != null ? Number(r.price) : null),
    currency: r.currency || opts.currency || 'AUD',
    eta: r.delivery_time || r.eta || r.transit_time || null,
  })).filter(r => r.price != null)
}

export type StarshipitLabel = {
  trackingNumber: string | null
  trackingUrl: string | null
  labelUrl: string | null     // PDF
  carrier: string | null
  service: string | null
  cost: number | null
  currency: string
  providerRef: string | null  // Starshipit order_id
}

// Fetch an existing Starshipit order by our order number (used when a create
// fails because WooCommerce already imported it into Starshipit).
async function findOrderId(orderNumber: string): Promise<number | null> {
  try {
    const json = await call(`/api/orders?order_number=${encodeURIComponent(orderNumber)}`, 'GET')
    const o = json?.order || json?.orders?.[0]
    return o?.order_id ?? null
  } catch { return null }
}

/**
 * Create (or reuse) a Starshipit order, then print the label for the chosen
 * carrier/service. Returns the real tracking number + label PDF, or null on any
 * failure so the caller degrades to the manual printable label.
 */
export async function createShipment(opts: {
  orderNumber: string
  to: ShipAddress
  from?: ShipAddress
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  carrier?: string | null
  serviceCode?: string | null
  currency?: string
  items?: { description?: string | null; sku?: string | null; quantity?: number; value?: number }[]
}): Promise<StarshipitLabel | null> {
  if (!starshipitConfigured()) return null
  const currency = opts.currency || 'AUD'
  const to = opts.to
  const pkg = packageFrom(opts.weightGrams, opts.parcel)

  // 1) Ensure the order exists in Starshipit.
  let orderId: number | null = null
  try {
    const created = await call('/api/orders', 'POST', {
      order: {
        order_number: opts.orderNumber,
        destination: {
          name: to.name || '',
          company: to.company || '',
          street: [to.address_1, to.address_2].filter(Boolean).join(', ') || '',
          suburb: to.city || '',
          city: to.city || '',
          state: to.state || '',
          post_code: to.postcode || '',
          country_code: countryCode(to.country),
          phone: to.phone || '',
          email: to.email || '',
        },
        items: (opts.items || []).map(it => ({
          description: it.description || 'Item',
          sku: it.sku || '',
          quantity: it.quantity || 1,
          value: it.value || 0,
        })),
        packages: [pkg],
        currency,
      },
    })
    orderId = created?.order?.order_id ?? null
  } catch {
    // Likely a duplicate — reuse the existing Starshipit order.
    orderId = await findOrderId(opts.orderNumber)
  }
  if (!orderId) orderId = await findOrderId(opts.orderNumber)
  if (!orderId) return null

  // 2) Print the label / create the shipment.
  const ship = await call('/api/orders/shipment', 'POST', {
    order_id: orderId,
    ...(opts.carrier ? { carrier: opts.carrier } : {}),
    ...(opts.serviceCode ? { carrier_service_code: opts.serviceCode, service_code: opts.serviceCode } : {}),
    reprint: false,
  })
  const o = ship?.order || ship?.orders?.[0] || ship || {}
  const labelUrl = o.label_url || ship?.label_url || (Array.isArray(ship?.labels) ? ship.labels[0]?.url : null) || null
  const tracking = o.tracking_number || ship?.tracking_number || null
  if (!tracking && !labelUrl) return null
  return {
    trackingNumber: tracking,
    trackingUrl: o.tracking_url || ship?.tracking_url || null,
    labelUrl,
    carrier: o.carrier_name || o.carrier || opts.carrier || null,
    service: o.carrier_service_name || o.service || null,
    cost: o.cost != null ? Number(o.cost) : null,
    currency,
    providerRef: String(orderId),
  }
}
