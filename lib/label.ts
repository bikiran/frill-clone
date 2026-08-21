// Modular label-creation layer for the Orders & Fulfillment module.
//
// Every carrier is an adapter with the same shape. Today all carriers use the
// "record + printable label" path: we generate a tracking number, store a
// shipment, and produce a printable 4×6 label (the /admin/orders/print route).
// When a carrier's live API is connected (credentials + onboarding — e.g. Team
// Global Express / TGE Connect), flip its `live` handler on and it becomes a
// drop-in that returns the carrier's own tracking number + label PDF instead.
//
// (Tracking-link building for outbound customer messages lives in lib/carriers.ts;
// this file is specifically about creating/lodging a shipment + label.)

import { CARRIER_LABEL, CARRIER_SERVICES, carrierTrackUrl } from '@/lib/orders'

export type Address = {
  name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

export type LabelRequest = {
  carrier: string
  service?: string | null
  weightGrams?: number | null
  parcel?: { length?: number; width?: number; height?: number } | null
  reference?: string | null           // usually the order number
  from: Address
  to: Address
}

export type LabelResult = {
  carrier: string
  carrierLabel: string
  service: string | null
  trackingNumber: string
  trackingUrl: string | null
  labelUrl: string | null             // carrier PDF, or null → use the printable route
  cost: number | null
  currency: string
  providerRef: string | null
  live: boolean                       // true = purchased via the carrier's API
}

// A tracking number that reads like a real consignment id but is clearly ours
// until a live carrier account issues the real one. Unique enough for a board.
function genTracking(carrier: string): string {
  const prefix = ({
    australia_post: 'AP', startrack: 'ST', team_global_express: 'TGE',
    sendle: 'SN', aramex: 'AR', dhl: 'DH', custom: 'CLV',
  } as Record<string, string>)[carrier] || 'CLV'
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  const stamp = Date.now().toString(36).slice(-6).toUpperCase()
  return `${prefix}${stamp}${rand}`
}

/**
 * Whether a carrier has a live API connection configured for this deployment.
 * Reads env so a connected carrier goes live without a code change. None are
 * wired yet — TGE returns false until onboarding is complete and its
 * credentials are set (TGE_API_KEY / TGE_ACCOUNT).
 */
export function carrierIsLive(carrier: string): boolean {
  switch (carrier) {
    case 'team_global_express':
      return !!(process.env.TGE_API_KEY && process.env.TGE_ACCOUNT)
    default:
      return false
  }
}

// ── Team Global Express (TGE Connect) — scaffold ────────────────────────────
// Live purchasing requires completing TGE's Customer Integration Onboarding and
// setting TGE_API_KEY / TGE_ACCOUNT. Until then we fall through to the manual
// printable path, so the button works today and upgrades cleanly later.
async function tgeCreateLabel(_req: LabelRequest): Promise<LabelResult | null> {
  if (!carrierIsLive('team_global_express')) return null
  // TODO: POST to TGE Connect consignment API, then fetch the label PDF.
  //   const res = await fetch(`${process.env.TGE_BASE_URL}/v1/consignments`, {
  //     method: 'POST', headers: { Authorization: `Bearer ${process.env.TGE_API_KEY}`,
  //     'Account': process.env.TGE_ACCOUNT!, 'Content-Type': 'application/json' },
  //     body: JSON.stringify(mapToTgeConsignment(_req)) })
  // Map the response → LabelResult { trackingNumber, labelUrl (PDF), providerRef, cost, live: true }.
  return null
}

/**
 * Create a label for a shipment. Tries the carrier's live API first (when
 * configured), otherwise records the shipment and returns a printable-label
 * result. Never throws for an unconfigured carrier — it degrades to manual.
 */
export async function createLabel(req: LabelRequest): Promise<LabelResult> {
  const carrier = req.carrier || 'custom'
  const service = req.service || CARRIER_SERVICES[carrier]?.[0] || null

  // Live adapters (only TGE scaffolded so far).
  if (carrier === 'team_global_express') {
    const live = await tgeCreateLabel(req)
    if (live) return live
  }

  // Manual / printable fallback — works for every carrier today.
  const trackingNumber = genTracking(carrier)
  return {
    carrier,
    carrierLabel: CARRIER_LABEL[carrier] || carrier,
    service,
    trackingNumber,
    trackingUrl: carrierTrackUrl(carrier, trackingNumber),
    labelUrl: null,
    cost: null,
    currency: 'AUD',
    providerRef: null,
    live: false,
  }
}
