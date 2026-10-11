// Order tracking, provider-agnostic.
//
// "Where is this order?" is answered from every place tracking can live, then
// normalised into one shape the agent (and the staff UI) can use without
// caring where it came from:
//
//   colvy        labels bought in Colvy (order_shipments) + tracking saved on the order
//   shipstation  labels made in ShipStation for this order number (V2 API).
//                Only for businesses that switched it on, and only shipments
//                whose recipient matches the order — the API key is one
//                account, so an order-number clash must never leak tracking.
//   woocommerce  the Shipment Tracking / AST order meta, or the order note the
//                ShipStation plugin adds ("…shipped via X … tracking number Y")
//
// Anything found is saved back onto the order (and order_shipments) so the
// Orders board shows it too.

import * as shipstation from '@/lib/shipstation'
import { createWooCommerceService } from '@/lib/woocommerce-service'
import { carrierTrackUrl } from '@/lib/orders'

/** Carrier names as stores and ShipStation spell them → Colvy's carrier keys. */
export function carrierKey(name: string | null | undefined): string | null {
  const n = String(name || '').toLowerCase()
  if (!n) return null
  if (/auspost|australia[\s_-]*post|au[\s_-]*post|eparcel|mypost/.test(n)) return 'australia_post'
  if (/star[\s_-]*track/.test(n)) return 'startrack'
  if (/toll|team[\s_-]*global|\btge\b/.test(n)) return 'team_global_express'
  if (/sendle/.test(n)) return 'sendle'
  if (/aramex|fastway/.test(n)) return 'aramex'
  if (/dhl/.test(n)) return 'dhl'
  return null
}
const trackUrl = (carrier: string | null | undefined, tn: string | null | undefined) => carrierTrackUrl(carrierKey(carrier) || carrier, tn)

export type ShipmentStatus = 'label_created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown'
export type TrackingStage = 'processing' | 'on_hold' | 'ready_for_pickup' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'cancelled' | 'refunded' | 'unknown'

export type TrackedShipment = {
  source: 'colvy' | 'shipstation' | 'woocommerce'
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: ShipmentStatus
  statusText: string | null
  shippedAt: string | null
  estimatedDelivery: string | null
  deliveredAt: string | null
  lastEvent: { at: string | null; text: string; place: string | null } | null
  labelId?: string | null
}

export type OrderTracking = {
  orderId: string
  orderNumber: string | null
  orderStatus: string | null
  placedAt: string | null
  stage: TrackingStage
  shipments: TrackedShipment[]
  sources: string[]
  checkedLive: boolean
  notes: string[]
}

const SS_STATUS: Record<string, ShipmentStatus> = { AC: 'label_created', NY: 'label_created', IT: 'in_transit', AT: 'out_for_delivery', DE: 'delivered', SP: 'delivered', EX: 'exception', UN: 'unknown' }
const SS_TRACKING_STATUS: Record<string, ShipmentStatus> = { in_transit: 'in_transit', delivered: 'delivered', error: 'exception', unknown: 'unknown' }

const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const lastWord = (s: any) => norm(String(s || '').trim().split(/\s+/).pop())

/** Does a ShipStation shipment's recipient match this order? Postcode, or surname. */
export function recipientMatches(order: any, ship: shipstation.SSShipment): boolean {
  const addr = order?.shipping_address || {}
  const pc = norm(addr.postcode || addr.postal_code)
  if (pc && ship.ship_to?.postal_code && norm(ship.ship_to.postal_code) === pc) return true
  const surname = lastWord(addr.last_name || order?.customer_name)
  return !!surname && surname.length > 1 && lastWord(ship.ship_to?.name) === surname
}

// ── WooCommerce ──────────────────────────────────────────────────────────────

/** Tracking from Woo order meta (Shipment Tracking / Advanced Shipment Tracking). */
export function trackingFromWooMeta(order: any): TrackedShipment[] {
  const out: TrackedShipment[] = []
  for (const m of order?.meta_data || []) {
    if (m?.key !== '_wc_shipment_tracking_items' || !Array.isArray(m.value)) continue
    for (const t of m.value) {
      const num = String(t?.tracking_number || '').trim()
      if (!num) continue
      const carrier = String(t?.custom_tracking_provider || t?.tracking_provider || '').trim() || null
      const shipped = t?.date_shipped ? new Date(Number(t.date_shipped) * 1000 || t.date_shipped).toISOString() : null
      out.push({ source: 'woocommerce', carrier, trackingNumber: num, trackingUrl: t?.custom_tracking_link || (carrier ? trackUrl(carrier, num) : null), status: 'label_created', statusText: null, shippedAt: shipped, estimatedDelivery: null, deliveredAt: null, lastEvent: null })
    }
  }
  return out
}

/** Tracking from the order note the ShipStation plugin writes when it marks an order shipped. */
export function trackingFromWooNotes(notes: { note?: string; date?: string }[]): TrackedShipment[] {
  const out: TrackedShipment[] = []
  for (const n of notes || []) {
    const text = String(n?.note || '').replace(/<[^>]+>/g, ' ')
    const num = text.match(/tracking\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9]{8,40})/i)?.[1]
    if (!num) continue
    const carrier = text.match(/shipped\s+via\s+(.+?)\s+(?:on|with)\b/i)?.[1]?.trim() || null
    out.push({ source: 'woocommerce', carrier, trackingNumber: num, trackingUrl: carrier ? trackUrl(carrier, num) : null, status: 'label_created', statusText: null, shippedAt: n?.date || null, estimatedDelivery: null, deliveredAt: null, lastEvent: null })
  }
  return out
}

// ── Stage ────────────────────────────────────────────────────────────────────

export function stageFor(orderStatus: string | null, shipments: TrackedShipment[]): TrackingStage {
  const s = String(orderStatus || '')
  if (s === 'cancelled') return 'cancelled'
  if (s === 'refunded') return 'refunded'
  if (s === 'on_hold' || s === 'alert') return 'on_hold'
  const live = shipments.filter(x => x.trackingNumber || x.status !== 'unknown')
  if (live.some(x => x.status === 'exception')) return 'exception'
  if (live.length && live.every(x => x.status === 'delivered')) return 'delivered'
  if (live.some(x => x.status === 'out_for_delivery')) return 'out_for_delivery'
  if (live.some(x => x.status === 'in_transit')) return 'in_transit'
  if (live.length || s === 'shipped') return 'shipped'
  if (s === 'click_and_collect') return 'ready_for_pickup'
  if (s === 'awaiting_shipment' || s === 'packed' || !s) return 'processing'
  return 'unknown'
}

// ShipStation carrier account ids (se-1870715) → their names (Team Global
// Express IPEC). Cached for ten minutes; the list rarely changes.
let carrierCache: { at: number; names: Record<string, string> } | null = null
async function nameCarriers(shipments: TrackedShipment[]) {
  if (!shipments.some(s => /^se-\d+$/i.test(s.carrier || '')) || !shipstation.shipstationConfigured()) return
  try {
    if (!carrierCache || Date.now() - carrierCache.at > 600_000) {
      const list = await shipstation.listCarriers()
      carrierCache = { at: Date.now(), names: Object.fromEntries(list.map(c => [c.id, c.name])) }
    }
    for (const s of shipments) if (s.carrier && carrierCache.names[s.carrier]) s.carrier = carrierCache.names[s.carrier]
  } catch {}
}

/** Apply ShipStation's live tracking (status code, carrier text, ETA, latest event). */
function applyTrack(s: TrackedShipment, t: shipstation.SSTrack | null) {
  if (!t) return
  const ev = (t.events || [])[0]
  s.status = SS_STATUS[String(t.status_code || '')] || s.status
  s.statusText = t.exception_description || t.carrier_status_description || t.status_description || s.statusText
  s.estimatedDelivery = t.estimated_delivery_date || s.estimatedDelivery
  s.deliveredAt = t.actual_delivery_date || s.deliveredAt
  s.shippedAt = t.shipped_date || s.shippedAt
  if (ev) s.lastEvent = { at: ev.occurred_at || null, text: String(ev.description || ''), place: [ev.city_locality, ev.state_province].filter(Boolean).join(', ') || null }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function getOrderTracking(db: any, companyId: string, order: any, opts: { live?: boolean; save?: boolean } = {}): Promise<OrderTracking> {
  const notes: string[] = []
  const sources = new Set<string>()
  const byNumber = new Map<string, TrackedShipment>()
  const add = (s: TrackedShipment) => {
    const key = s.trackingNumber ? norm(s.trackingNumber) : `${s.source}:${byNumber.size}`
    const prev = byNumber.get(key)
    if (!prev) { byNumber.set(key, s); sources.add(s.source); return }
    // Same parcel from two places: keep every known field, and let a live
    // carrier status win over "label created" / "unknown".
    const better = (prev.status === 'label_created' || prev.status === 'unknown') && s.status !== 'unknown' && s.status !== 'label_created'
    const merged: any = { ...prev }
    for (const [k, v] of Object.entries(s)) if (v != null && (merged[k] == null || better)) merged[k] = v
    if (!better) merged.status = prev.status === 'unknown' ? s.status : prev.status
    byNumber.set(key, merged)
    sources.add(s.source)
  }

  // 1. Colvy's own labels and saved tracking.
  const { data: rows } = await db.from('order_shipments').select('id, carrier, tracking_number, tracking_url, status, provider_ref, created_at')
    .eq('order_id', order.id).eq('company_id', companyId).then((r: any) => r, () => ({ data: [] }))
  for (const r of rows || []) {
    if (r.status === 'cancelled' || r.status === 'voided') continue
    add({ source: 'colvy', carrier: r.carrier, trackingNumber: r.tracking_number, trackingUrl: r.tracking_url, status: r.status === 'delivered' ? 'delivered' : r.status === 'in_transit' ? 'in_transit' : 'label_created', statusText: null, shippedAt: r.created_at, estimatedDelivery: null, deliveredAt: null, lastEvent: null, labelId: r.provider_ref || null })
  }
  if (order.tracking_number) {
    add({ source: 'colvy', carrier: order.carrier || null, trackingNumber: order.tracking_number, trackingUrl: order.tracking_url || (order.carrier ? trackUrl(order.carrier, order.tracking_number) : null), status: order.delivered_at ? 'delivered' : 'label_created', statusText: null, shippedAt: order.shipped_at || null, estimatedDelivery: null, deliveredAt: order.delivered_at || null, lastEvent: null })
  }

  // 1b. Labels Colvy bought through ShipStation carry ShipStation's label id —
  // ask ShipStation about those directly (this business's own labels, so no
  // order-number matching needed).
  if (shipstation.shipstationConfigured()) {
    for (const s of Array.from(byNumber.values())) {
      if (s.source !== 'colvy' || !s.labelId || !/^se-/i.test(s.labelId)) continue
      try {
        const lb = await shipstation.getLabel(s.labelId)
        if (lb) {
          if (lb.voided || lb.status === 'voided') { byNumber.delete(norm(s.trackingNumber)); continue }
          s.carrier = lb.carrier_code || s.carrier
          s.trackingUrl = lb.tracking_url || s.trackingUrl
          const st = SS_TRACKING_STATUS[String(lb.tracking_status || '')]
          if (st && st !== 'unknown') s.status = st
          s.shippedAt = s.shippedAt || lb.ship_date || null
        }
        if (opts.live) applyTrack(s, await shipstation.trackLabel(s.labelId))
        sources.add('shipstation')
      } catch {}
    }
  }

  // 2. ShipStation.
  const { data: co } = await db.from('companies').select('shipping_settings').eq('id', companyId).maybeSingle()
  const useShipStation = !!co?.shipping_settings?.shipstation_tracking && shipstation.shipstationConfigured()
  if (useShipStation && order.order_number) {
    try {
      const ships = await shipstation.shipmentsForOrderNumber(order.order_number)
      const matched = ships.filter(s => recipientMatches(order, s))
      if (ships.length && !matched.length) notes.push('ShipStation has a shipment with this order number, but the recipient doesn’t match this order, so it was ignored.')
      for (const sh of matched) {
        for (const lb of await shipstation.labelsForShipment(sh.shipment_id)) {
          if (lb.voided || lb.status === 'voided' || !lb.tracking_number) continue
          const ts: TrackedShipment = {
            source: 'shipstation', carrier: lb.carrier_code || null, trackingNumber: lb.tracking_number, trackingUrl: lb.tracking_url || trackUrl(lb.carrier_code, lb.tracking_number),
            status: SS_TRACKING_STATUS[String(lb.tracking_status || '')] || 'label_created', statusText: null,
            shippedAt: lb.ship_date || sh.ship_date || null, estimatedDelivery: null, deliveredAt: null, lastEvent: null, labelId: lb.label_id,
          }
          if (opts.live && lb.trackable !== false) applyTrack(ts, await shipstation.trackLabel(lb.label_id))
          add(ts)
        }
      }
    } catch (e: any) {
      notes.push(`Couldn’t reach ShipStation: ${String(e?.message || e).slice(0, 160)}`)
    }
  }

  // 3. WooCommerce — only if nothing better was found.
  if (!byNumber.size && order.sales_channel === 'woocommerce' && order.order_number) {
    try {
      const woo = await createWooCommerceService(db, companyId)
      if (woo) {
        const wo = await woo.getOrderByNumber(order.order_number)
        if (wo) {
          let found = trackingFromWooMeta(wo)
          if (!found.length && wo.id) found = trackingFromWooNotes(await woo.getOrderNotes(Number(wo.id)))
          found.forEach(add)
        }
      }
    } catch (e: any) {
      notes.push(`Couldn’t read the WooCommerce order: ${String(e?.message || e).slice(0, 160)}`)
    }
  }

  const shipments = Array.from(byNumber.values())
  await nameCarriers(shipments)
  const result: OrderTracking = {
    orderId: order.id, orderNumber: order.order_number || null, orderStatus: order.status || null,
    placedAt: order.order_date || order.created_at || null, stage: stageFor(order.status, shipments),
    shipments, sources: Array.from(sources), checkedLive: !!opts.live && sources.has('shipstation'), notes,
  }
  if (opts.save !== false) await saveTracking(db, companyId, order, shipments).catch(() => {})
  return result
}

/** Write what was found back onto the order so the Orders board shows it. */
async function saveTracking(db: any, companyId: string, order: any, shipments: TrackedShipment[]) {
  const first = shipments.find(s => s.trackingNumber)
  if (!first) return
  const patch: any = {}
  if (!order.tracking_number) Object.assign(patch, { tracking_number: first.trackingNumber, carrier: order.carrier || first.carrier, tracking_url: order.tracking_url || first.trackingUrl })
  if (!order.shipped_at && first.shippedAt) patch.shipped_at = first.shippedAt
  if (!order.delivered_at && shipments.length && shipments.every(s => s.status === 'delivered')) patch.delivered_at = shipments.find(s => s.deliveredAt)?.deliveredAt || new Date().toISOString()
  if (Object.keys(patch).length) await db.from('orders').update(patch).eq('id', order.id).eq('company_id', companyId)

  const { data: existing } = await db.from('order_shipments').select('id, tracking_number, status').eq('order_id', order.id).eq('company_id', companyId)
  for (const s of shipments) {
    if (!s.trackingNumber || s.source === 'colvy') continue
    const status = s.status === 'delivered' ? 'delivered' : s.status === 'in_transit' || s.status === 'out_for_delivery' ? 'in_transit' : 'label_purchased'
    const hit = (existing || []).find((r: any) => norm(r.tracking_number) === norm(s.trackingNumber))
    if (hit) { if (hit.status !== status) await db.from('order_shipments').update({ status, tracking_url: s.trackingUrl }).eq('id', hit.id) }
    else await db.from('order_shipments').insert({ order_id: order.id, company_id: companyId, carrier: s.carrier, tracking_number: s.trackingNumber, tracking_url: s.trackingUrl, status, provider_ref: s.labelId || null })
  }
}
