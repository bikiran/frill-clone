// ShipStation V2 API client — live rates + label purchase.
//
// Same adapter shape as lib/starshipit.ts so lib/shipping.ts can pick whichever
// provider is configured. ShipStation V2 is rate-driven: fetch rates for the
// account's connected carriers, then buy a label from the chosen rate_id.
//
// Credentials (env):
//   SHIPSTATION_API_KEY  — the V2 API key ("API-Key" header)
// Optional:
//   SHIPSTATION_BASE_URL — defaults to https://api.shipstation.com/v2

import type { ShipAddress, StarshipitRate, StarshipitLabel } from '@/lib/starshipit'

const BASE = (process.env.SHIPSTATION_BASE_URL || 'https://api.shipstation.com/v2').replace(/\/$/, '')

export function shipstationConfigured(): boolean {
  return !!process.env.SHIPSTATION_API_KEY
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'API-Key': process.env.SHIPSTATION_API_KEY || '' }
}

async function call(path: string, method: 'GET' | 'POST' | 'PUT', body?: any): Promise<any> {
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
    const msg = json?.errors?.[0]?.message || json?.message || json?.error || `HTTP ${res.status}`
    throw new Error(`ShipStation ${path}: ${msg}`)
  }
  return json
}

function countryCode(c?: string | null): string {
  const s = String(c || '').trim()
  if (!s) return 'AU'
  if (s.length === 2) return s.toUpperCase()
  const map: Record<string, string> = { australia: 'AU', 'new zealand': 'NZ', 'united states': 'US', 'united kingdom': 'GB' }
  return map[s.toLowerCase()] || s.slice(0, 2).toUpperCase()
}

function addr(a: ShipAddress, fallbackName: string) {
  return {
    name: a.name || fallbackName,
    phone: a.phone || '',
    company_name: a.company || '',
    address_line1: a.address_1 || '',
    address_line2: a.address_2 || '',
    city_locality: a.city || '',
    state_province: a.state || '',
    postal_code: a.postcode || '',
    country_code: countryCode(a.country),
    address_residential_indicator: 'unknown',
  }
}

// ShipStation V2 wants a weight object + dimensions. Callers pass grams + cm.
function packageOf(weightGrams?: number | null, parcel?: { length?: number; width?: number; height?: number } | null) {
  const pkg: any = {
    package_code: 'package',
    weight: { value: Math.max(1, Math.round(Number(weightGrams) || 0)), unit: 'gram' },
  }
  if (parcel && (parcel.length || parcel.width || parcel.height)) {
    pkg.dimensions = { unit: 'centimeter', length: Number(parcel.length) || 0, width: Number(parcel.width) || 0, height: Number(parcel.height) || 0 }
  }
  return pkg
}

// The account's connected carrier ids — required by /v2/rates. The list rarely
// changes, so cache it for the lifetime of a warm instance (6h) to keep rate
// requests to a single ShipStation round trip. Setting SHIPSTATION_CARRIER_IDS
// (comma-separated) skips the /carriers call entirely — the fastest path.
let carrierCache: { ids: string[]; at: number } | null = null
async function carrierIds(): Promise<string[]> {
  const envIds = String(process.env.SHIPSTATION_CARRIER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (envIds.length) return envIds
  const now = Date.now()
  if (carrierCache && now - carrierCache.at < 6 * 60 * 60 * 1000) return carrierCache.ids
  const json = await call('/carriers', 'GET')
  const ids = (Array.isArray(json?.carriers) ? json.carriers : []).map((c: any) => c.carrier_id).filter(Boolean)
  carrierCache = { ids, at: now }
  return ids
}

function shipFrom(from?: ShipAddress | null): ShipAddress {
  // A ship_from is required. Fall back to a minimal AU origin if none supplied.
  return from || { country: 'AU' }
}

export async function getRatesDetailed(opts: {
  to: ShipAddress
  from?: ShipAddress | null
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  currency?: string
}): Promise<{ rates: StarshipitRate[]; raw: any; request: any }> {
  if (!shipstationConfigured()) return { rates: [], raw: null, request: null }
  const ids = await carrierIds()
  const body: any = {
    rate_options: { carrier_ids: ids },
    shipment: {
      validate_address: 'no_validation',
      ship_to: addr(opts.to, 'Customer'),
      ship_from: addr(shipFrom(opts.from), 'Warehouse'),
      packages: [packageOf(opts.weightGrams, opts.parcel)],
    },
  }
  const json = await call('/rates', 'POST', body)
  const rr = json?.rate_response || json || {}
  // Surface a hard failure (e.g. no carriers) so the panel can explain it.
  if (Array.isArray(rr.errors) && rr.errors.length && !(Array.isArray(rr.rates) && rr.rates.length)) {
    throw new Error(rr.errors[0]?.message || 'ShipStation returned no rates for this parcel')
  }
  const rates: any[] = Array.isArray(rr.rates) ? rr.rates : []
  const mapped: StarshipitRate[] = rates.map(r => ({
    carrier: r.carrier_friendly_name || r.carrier_code || null,
    service: r.service_type || r.service_code || null,
    serviceCode: r.service_code || null,
    rateId: r.rate_id || null,
    price: r.shipping_amount?.amount != null ? Number(r.shipping_amount.amount) : null,
    currency: r.shipping_amount?.currency ? String(r.shipping_amount.currency).toUpperCase() : (opts.currency || 'AUD'),
    eta: r.estimated_delivery_date ? String(r.estimated_delivery_date).slice(0, 10) : (r.delivery_days ? `${r.delivery_days} day${r.delivery_days === 1 ? '' : 's'}` : null),
  })).filter(r => r.price != null)
  return { rates: mapped, raw: json, request: body }
}

export async function createShipment(opts: {
  orderNumber: string
  to: ShipAddress
  from?: ShipAddress | null
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  carrier?: string | null
  serviceCode?: string | null
  rateId?: string | null
  currency?: string
  items?: { description?: string | null; sku?: string | null; quantity?: number; value?: number }[]
}): Promise<StarshipitLabel | null> {
  if (!shipstationConfigured()) return null
  let label: any = null
  try {
    if (opts.rateId) {
      // Buy the label directly from the chosen rate.
      label = await call(`/labels/rates/${encodeURIComponent(opts.rateId)}`, 'POST', {
        validate_address: 'no_validation', label_layout: '4x6', label_format: 'pdf',
      })
    } else {
      // No rate chosen — create a label from the shipment (uses the account's
      // default service selection). Falls through to null on any failure.
      label = await call('/labels', 'POST', {
        shipment: {
          validate_address: 'no_validation',
          ship_to: addr(opts.to, 'Customer'),
          ship_from: addr(shipFrom(opts.from), 'Warehouse'),
          packages: [packageOf(opts.weightGrams, opts.parcel)],
        },
        label_layout: '4x6', label_format: 'pdf',
      })
    }
  } catch {
    return null
  }
  if (!label) return null
  const pdf = label.label_download?.pdf || label.label_download?.href || null
  const tracking = label.tracking_number || null
  if (!tracking && !pdf) return null
  return {
    trackingNumber: tracking,
    trackingUrl: label.tracking_url || null,
    labelUrl: pdf,
    carrier: label.carrier_code || label.carrier_id || opts.carrier || null,
    service: label.service_code || null,
    cost: label.shipment_cost?.amount != null ? Number(label.shipment_cost.amount) : null,
    currency: label.shipment_cost?.currency ? String(label.shipment_cost.currency).toUpperCase() : (opts.currency || 'AUD'),
    providerRef: label.label_id || null,
  }
}

// The label PDF URL for an existing label (reprint). ShipStation label PDFs are
// stable, so the stored label_url is usually enough — this is the fallback when
// it wasn't captured.
export async function getLabelUrl(labelId: string): Promise<string | null> {
  if (!shipstationConfigured() || !labelId) return null
  try {
    const j = await call(`/labels/${encodeURIComponent(labelId)}`, 'GET')
    return j?.label_download?.pdf || j?.label_download?.href || null
  } catch { return null }
}

// Void (cancel) a purchased label. ShipStation returns { approved, message }.
export async function voidLabel(labelId: string): Promise<{ voided: boolean; message: string }> {
  if (!shipstationConfigured()) return { voided: false, message: 'ShipStation not configured' }
  if (!labelId) return { voided: false, message: 'No label id on this shipment' }
  try {
    const j = await call(`/labels/${encodeURIComponent(labelId)}/void`, 'PUT')
    const approved = j?.approved === true || j?.status === 'voided'
    return { voided: approved, message: j?.message || (approved ? 'Label voided' : 'Void not approved by carrier') }
  } catch (e: any) {
    return { voided: false, message: e?.message || 'Void failed' }
  }
}
