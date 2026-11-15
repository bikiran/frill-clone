// In-store sales that reach WooCommerce without Prexty's tag, or more than once.
//
// Prexty copies each in-store sale into WooCommerce, tagged in store
// (_prexty_source = pos) with its receipt number (lib/prexty-pos). Sometimes a
// copy arrives without the tag, and sometimes the same sale arrives several
// times in a few minutes. Colvy then showed every copy as a separate online
// order, with no shop, and alerted for each.
//
// This decides what an untagged order really is:
//   • the WooCommerce copy of a Prexty receipt Colvy received on its Prexty
//     webhook (prexty_receipts, V437): same total, same number of items, rung
//     up shortly before → that sale, at that shop;
//   • a copy of an identical order from a few minutes earlier (same items,
//     same total, no customer details) → the same sale again, no new alert;
//   • otherwise, when it looks exactly like this store's other Prexty orders
//     (created the same way, no customer details), an in-store sale without
//     its receipt number.
// Only for stores with Prexty connected, and never for an order placed through
// the website checkout (created_via checkout / store-api: those are the online
// orders) or one Colvy created itself. Everything else on such a store comes
// from Prexty — a walk-in "Customer" account, a placeholder email, or a real
// customer's in-store sale — so it is never called an "Online order".

import { posSaleInfo } from '@/lib/prexty-pos'
import { saleKey } from '@/lib/pos-sale-key'

export { saleKey, splitPosCopies, collapsePosCopies } from '@/lib/pos-sale-key'

export type PosMatch = {
  by: 'receipt' | 'copy' | 'likely'
  /** An in-store sale (a copy of an ordinary order stays an ordinary order). */
  inStore: boolean
  saleId: string | null
  outlet: string | null
  locationId: string | null
  copyOf: { wooOrderId: number; number: string } | null
}

export type ReceiptCandidate = { saleNo: string; totalCents: number; units: number | null; soldAt: number; outlet: string | null; locationId: string | null }
export type TwinCandidate = { wooOrderId: number; number: string; time: number; isPos: boolean; saleId: string | null; outlet: string | null; locationId: string | null; copyOf: string | null }

/** How far apart the copies of one sale can arrive. */
export const COPY_WINDOW_MS = 30 * 60_000
/** A receipt can be rung up this long before its WooCommerce copy… */
export const RECEIPT_BEFORE_MS = 3 * 3_600_000
/** …or show up this long after it (clocks, a late webhook). */
export const RECEIPT_AFTER_MS = 15 * 60_000
/** How the store's website checkout creates orders: never an in-store sale. */
const CHECKOUT_VIA = new Set(['checkout', 'store-api'])

const str = (v: any) => String(v ?? '').trim()
export const cents = (v: any) => Math.round((parseFloat(String(v ?? '0')) || 0) * 100)

/** No email, phone or address on the order: not something a website checkout makes. */
export function isGuestShape(o: any): boolean {
  const b = o?.billing || {}
  const s = o?.shipping || {}
  return !str(b.email || o?.customer_email) && !str(b.phone) && !str(b.address_1) && !str(s.address_1)
}

/** Placed through the website's own checkout: an online order, never Prexty's. */
export const isWebsiteOrder = (o: any) => CHECKOUT_VIA.has(str(o?.created_via ?? o?.detail?.created_via).toLowerCase())

/**
 * Who the order is for, as far as copies go: the email, else the phone, else
 * the WooCommerce customer account, else "guest". Two copies of one sale are
 * always for the same buyer.
 */
export function buyerKey(o: any): string {
  const b = o?.billing || {}
  const email = str(b.email || o?.customer_email).toLowerCase()
  if (email) return 'e:' + email
  const phone = str(b.phone).replace(/\D/g, '').slice(-9)
  if (phone.length >= 8) return 'p:' + phone
  const cid = Number(o?.customer_id ?? o?.woo_customer_id) || 0
  return cid ? 'c:' + cid : 'guest'
}

/** An order Colvy itself created (Create order in the inbox): never a Prexty copy. */
export const madeByColvy = (o: any) => (Array.isArray(o?.meta_data) ? o.meta_data : []).some((m: any) => /^_colvy_/.test(String(m?.key || '')))

/** Items on the order, counting quantities. */
export function unitsOf(o: any): number {
  return (Array.isArray(o?.line_items) ? o.line_items : []).reduce((n: number, li: any) => n + (Number(li?.quantity) || 1), 0)
}

/** The same items, quantities and total: "sku:qty|sku:qty#cents". */
export function fingerprint(o: any): string {
  const lines = (Array.isArray(o?.line_items) ? o.line_items : [])
    .map((li: any) => `${str(li?.sku) || str(li?.product_id) || str(li?.name).toLowerCase()}:${Number(li?.quantity) || 1}`)
    .sort()
  return `${lines.join('|')}#${cents(o?.total)}`
}

/** When the order was placed (raw WooCommerce order or a woocommerce_orders row), in ms. */
export function orderTime(o: any): number {
  const raw = o?.date_created_gmt ? `${String(o.date_created_gmt).replace(/Z?$/, '')}Z` : (o?.order_date || o?.date_created)
  const t = raw ? Date.parse(String(raw)) : NaN
  return Number.isFinite(t) ? t : Date.now()
}

/**
 * The decision, from what the loader found. Pure, so it can be tested.
 * `usedSaleIds`: receipt numbers already on other WooCommerce orders.
 * `learnedVia`: how this store's tagged Prexty orders were created.
 */
export function decidePosCopy(i: {
  order: { totalCents: number; units: number; time: number; createdVia: string | null }
  eligible: boolean
  receipts: ReceiptCandidate[]
  twins: TwinCandidate[]
  usedSaleIds: Set<string>
  learnedVia: string[]
}): PosMatch | null {
  if (!i.eligible) return null
  const { order } = i
  const near = (r: ReceiptCandidate) => r.totalCents === order.totalCents
    && (r.units == null || r.units === order.units)
    && r.soldAt >= order.time - RECEIPT_BEFORE_MS && r.soldAt <= order.time + RECEIPT_AFTER_MS
  const byCloseness = (a: ReceiptCandidate, b: ReceiptCandidate) => Math.abs(order.time - a.soldAt) - Math.abs(order.time - b.soldAt)
  const receipts = i.receipts.filter(near).sort(byCloseness)
  const free = receipts.filter(r => !i.usedSaleIds.has(r.saleNo))

  // Earlier identical orders. The original is the first that isn't itself a copy.
  const twins = [...i.twins].filter(t => t.time <= order.time).sort((a, b) => a.time - b.time || a.wooOrderId - b.wooOrderId)
  if (twins.length) {
    const original = twins.find(t => !t.copyOf) || twins[0]
    // Another receipt for the same items that no order has yet, and the
    // original already has its own: a second, separate sale.
    if (free.length && original.saleId) {
      const r = free[0]
      return { by: 'receipt', inStore: true, saleId: r.saleNo, outlet: r.outlet, locationId: r.locationId, copyOf: null }
    }
    const r = !original.saleId ? free[0] || null : null
    return {
      by: 'copy',
      inStore: original.isPos || !!r,
      saleId: original.saleId || r?.saleNo || null,
      outlet: original.outlet || r?.outlet || null,
      locationId: original.locationId || r?.locationId || null,
      copyOf: { wooOrderId: original.wooOrderId, number: original.number },
    }
  }
  if (free.length) {
    const r = free[0]
    return { by: 'receipt', inStore: true, saleId: r.saleNo, outlet: r.outlet, locationId: r.locationId, copyOf: null }
  }
  // Made the way this store's tagged Prexty orders are made. Before any tagged
  // order has taught us that, the REST API (how Prexty sends its sales).
  const via = str(order.createdVia).toLowerCase()
  const learned = i.learnedVia.map(v => v.toLowerCase()).filter(Boolean)
  if (via && !CHECKOUT_VIA.has(via) && (learned.length ? learned.includes(via) : via === 'rest-api')) {
    return { by: 'likely', inStore: true, saleId: null, outlet: null, locationId: null, copyOf: null }
  }
  return null
}

/**
 * Look up what's needed and decide. Never throws: anything missing (V437 not
 * run, Prexty not connected) means "no match", and the order is treated as
 * before.
 */
export async function matchPosCopy(db: any, companyId: string, order: any, opts?: {
  /** Orders handled earlier in the same batch (woocommerce_orders-shaped), not saved yet. */
  pending?: any[]
  /** Already known, to save a lookup per order. */
  prextyActive?: boolean
}): Promise<PosMatch | null> {
  try {
    if (!companyId || !order?.id) return null
    if (!isEligible(order)) return null
    if (opts?.prextyActive === false) return null
    if (opts?.prextyActive !== true && !(await prextyActive(db, companyId))) return null

    // Decided before (an earlier sync): keep it, so an original never loses its
    // receipt to its own copies.
    const { data: own } = await db.from('woocommerce_orders')
      .select('pos_source, pos_sale_id, pos_outlet, pos_location_id, detail')
      .eq('company_id', companyId).eq('woo_order_id', Number(order.id)).maybeSingle()
    const kept = storedMatch(own)
    if (kept) return kept

    const time = orderTime(order)
    const totalCents = cents(order.total)
    const units = unitsOf(order)
    const fp = fingerprint(order)
    const buyer = buyerKey(order)
    const iso = (t: number) => new Date(t).toISOString()

    // Receipts Prexty's webhook sent around then (V437).
    let receipts: ReceiptCandidate[] = []
    try {
      const { data } = await db.from('prexty_receipts')
        .select('sale_no, prexty_order_id, total, units, sold_at, outlet_name, outlet_id, location_id, status')
        .eq('company_id', companyId)
        .gte('sold_at', iso(time - RECEIPT_BEFORE_MS)).lte('sold_at', iso(time + RECEIPT_AFTER_MS))
        .limit(200)
      receipts = (data || [])
        .filter((r: any) => !/refund|void|cancel/i.test(String(r.status || '')))
        .map((r: any) => ({
          saleNo: str(r.sale_no || r.prexty_order_id), totalCents: cents(r.total),
          units: r.units == null ? null : Number(r.units), soldAt: Date.parse(r.sold_at),
          outlet: str(r.outlet_name || r.outlet_id) || null, locationId: r.location_id || null,
        }))
    } catch { /* V437 not run: no receipts */ }

    // Earlier orders with the same items and total, no customer details.
    const { data: near } = await db.from('woocommerce_orders')
      .select('woo_order_id, woo_customer_id, total, line_items, billing, customer_email, order_date, pos_source, pos_sale_id, pos_outlet, pos_location_id, detail')
      .eq('company_id', companyId)
      .gte('order_date', iso(time - COPY_WINDOW_MS)).lte('order_date', iso(time + 60_000))
      .neq('woo_order_id', Number(order.id))
      .limit(200)
    const pendingNear = (opts?.pending || []).filter(r => Number(r.woo_order_id) !== Number(order.id)
      && Math.abs(orderTime(r) - time) <= COPY_WINDOW_MS)
    const rows: any[] = [...(near || []), ...pendingNear.filter(p => !(near || []).some((n: any) => Number(n.woo_order_id) === Number(p.woo_order_id)))]
    const twins: TwinCandidate[] = rows
      .filter(r => Number(r.woo_order_id) < Number(order.id) && cents(r.total) === totalCents && buyerKey(r) === buyer && fingerprint(r) === fp
        && !isWebsiteOrder(r))
      .map(r => ({
        wooOrderId: Number(r.woo_order_id), number: String(r.woo_order_id), time: orderTime(r),
        isPos: r.pos_source === 'prexty',
        saleId: r.pos_source === 'prexty' ? (str(r.pos_sale_id) || null) : null,
        outlet: r.pos_source === 'prexty' ? (str(r.pos_outlet) || null) : null,
        locationId: r.pos_source === 'prexty' ? (r.pos_location_id || null) : null,
        copyOf: r.detail?.pos_match?.copyOf?.number ? String(r.detail.pos_match.copyOf.number) : null,
      }))

    // Receipt numbers other sales already carry (a copy carries its original's,
    // so copies don't count).
    const used = new Set<string>()
    const saleNos = receipts.map(r => r.saleNo).filter(Boolean)
    const isOther = (r: any) => r.pos_sale_id && Number(r.woo_order_id) !== Number(order.id) && !r.detail?.pos_match?.copyOf
    if (saleNos.length) {
      const { data } = await db.from('woocommerce_orders').select('woo_order_id, pos_sale_id, detail').eq('company_id', companyId)
        .in('pos_sale_id', saleNos).limit(500)
      for (const r of data || []) if (isOther(r)) used.add(String(r.pos_sale_id))
      for (const r of opts?.pending || []) if (isOther(r) && saleNos.includes(String(r.pos_sale_id))) used.add(String(r.pos_sale_id))
    }

    // How this store's tagged Prexty orders were created.
    let learnedVia: string[] = []
    try {
      const { data } = await db.from('woocommerce_orders').select('detail').eq('company_id', companyId)
        .eq('pos_source', 'prexty').order('order_date', { ascending: false }).limit(25)
      learnedVia = Array.from(new Set((data || []).map((r: any) => str(r.detail?.created_via)).filter(Boolean)))
    } catch { /* before V408: nothing learned */ }

    return decidePosCopy({
      order: { totalCents, units, time, createdVia: str(order.created_via) || null },
      eligible: true, receipts, twins, usedSaleIds: used, learnedVia,
    })
  } catch {
    return null
  }
}

/**
 * Tagged in-store sales that WooCommerce holds more than once: the same receipt
 * number, total and shop on several orders (lib/pos-sale-key). The lowest order
 * id is the sale; every later one is a copy of it, so the Orders board flags it
 * ("Copy of #…"), it posts no second "In-store sale" line in the customer's
 * chat and no second alert. `orders` are WooCommerce REST orders (one page of a
 * sync, or the one a webhook delivered). Returns order id → match, copies only.
 * Never throws.
 */
export async function findTaggedCopies(db: any, companyId: string, orders: any[]): Promise<Map<number, PosMatch>> {
  const out = new Map<number, PosMatch>()
  try {
    const tagged = (orders || [])
      .map(o => ({ o, info: posSaleInfo(o) }))
      .filter(x => x.o?.id && x.info.isPos && str(x.info.saleId))
    if (!companyId || !tagged.length) return out
    const saleIds = Array.from(new Set(tagged.map(x => str(x.info.saleId))))
    const { data, error } = await db.from('woocommerce_orders')
      .select('woo_order_id, total, pos_source, pos_sale_id, pos_outlet, pos_location_id')
      .eq('company_id', companyId).in('pos_sale_id', saleIds).limit(1000)
    if (error) return out
    // What's stored, with this batch's own orders as they are now.
    const byId = new Map<number, any>()
    for (const r of data || []) byId.set(Number(r.woo_order_id), r)
    for (const x of tagged) {
      const id = Number(x.o.id)
      byId.set(id, { ...(byId.get(id) || {}), woo_order_id: id, total: x.o.total, pos_source: 'prexty', pos_sale_id: x.info.saleId, pos_outlet: x.info.outlet || null })
    }
    const first = new Map<string, any>()
    for (const r of byId.values()) {
      const k = saleKey(r)
      if (!k) continue
      const cur = first.get(k)
      if (!cur || Number(r.woo_order_id) < Number(cur.woo_order_id)) first.set(k, r)
    }
    for (const x of tagged) {
      const id = Number(x.o.id)
      const orig = first.get(saleKey(byId.get(id)) || '')
      if (!orig || Number(orig.woo_order_id) === id) continue
      out.set(id, {
        by: 'copy', inStore: true, saleId: str(x.info.saleId) || null, outlet: str(x.info.outlet) || null,
        locationId: orig.pos_location_id || null,
        copyOf: { wooOrderId: Number(orig.woo_order_id), number: String(orig.woo_order_id) },
      })
    }
  } catch { /* best-effort: an order is never held back by this */ }
  return out
}

/**
 * Worth checking: untagged, has items, not made by Colvy, and not a website
 * checkout — either no customer details at all, or created some other way
 * (Prexty's REST API, a walk-in "Customer" account, a placeholder email).
 */
export function isEligible(order: any): boolean {
  if (posSaleInfo(order).isPos || madeByColvy(order) || isWebsiteOrder(order)) return false
  if (!Array.isArray(order?.line_items) || !order.line_items.length) return false
  return isGuestShape(order) || !!str(order?.created_via)
}

/** A saved woocommerce_orders row as the WooCommerce order the matcher reads. */
function asOrder(r: any): any {
  return {
    id: Number(r.woo_order_id), number: String(r.woo_order_id), total: r.total, line_items: r.line_items || [],
    billing: r.billing || {}, shipping: r.detail?.shipping || {}, customer_id: Number(r.woo_customer_id) || 0,
    created_via: r.detail?.created_via || null, meta_data: [],
    date_created_gmt: r.order_date ? new Date(r.order_date).toISOString().replace(/\.\d+Z$/, '') : null,
  }
}

/**
 * Orders from the last day that were saved as online orders before they could
 * be matched (they came in before this check, or their receipt came later):
 * untagged, not a website checkout, no match yet. Matched now, oldest first,
 * and saved, so the Orders board and the customer's history catch up. Never
 * one Colvy made or one linked to a chat (attribution set): a saved row can't
 * show Colvy's own marks, so those are left as they are. `rows` are
 * woocommerce_orders rows; matched ones are updated in place. Bounded; never
 * throws. Returns how many were matched.
 */
export async function rematchRecent(db: any, companyId: string, rows: any[], max = 60): Promise<number> {
  let n = 0
  try {
    const dayAgo = Date.now() - 24 * 3_600_000
    const todo = (rows || [])
      .filter(r => r && r.pos_source !== 'prexty' && !r.detail?.pos_match && !r.detail?.colvy && !r.attribution
        && isEligible(asOrder(r)) && orderTime(r) >= dayAgo)
      .sort((a, b) => Number(a.woo_order_id) - Number(b.woo_order_id))
      .slice(0, max)
    if (!todo.length || !(await prextyActive(db, companyId))) return 0
    const pending: any[] = []
    for (const r of todo) {
      const order = asOrder(r)
      const m = await matchPosCopy(db, companyId, order, { pending, prextyActive: true })
      pending.push(pendingRow(order, m))
      if (!m) continue
      const patch: any = { detail: { ...(r.detail || {}), ...matchDetail(m) } }
      if (m.inStore) Object.assign(patch, matchColumns(m), m.locationId ? { pos_location_id: m.locationId } : {})
      const { error } = await db.from('woocommerce_orders').update(patch).eq('company_id', companyId).eq('woo_order_id', r.woo_order_id)
      if (!error) { Object.assign(r, patch); n++ }
    }
  } catch { /* the sync goes ahead without it */ }
  return n
}

/** Is Prexty connected for this business? */
export async function prextyActive(db: any, companyId: string): Promise<boolean> {
  try {
    const { data } = await db.from('prexty_integrations').select('is_active').eq('company_id', companyId).maybeSingle()
    return !!data && data.is_active !== false
  } catch { return false }
}

/**
 * The order as a woocommerce_orders row, for later orders in the same batch to
 * compare with before it's saved.
 */
export function pendingRow(order: any, m: PosMatch | null): any {
  return {
    woo_order_id: Number(order.id), woo_customer_id: Number(order.customer_id) || null, total: order.total, line_items: order.line_items || [], billing: order.billing || {},
    customer_email: order.billing?.email || null, order_date: new Date(orderTime(order)).toISOString(),
    pos_source: m?.inStore ? 'prexty' : null, pos_sale_id: m?.inStore ? m.saleId : null,
    pos_outlet: m?.inStore ? m.outlet : null, pos_location_id: m?.inStore ? m.locationId : null,
    detail: { created_via: order.created_via || null, ...(m ? matchDetail(m) : {}) },
  }
}

/** The woocommerce_orders POS columns for a matched copy (same shape as posColumns). */
export function matchColumns(m: PosMatch): { pos_source: string; pos_sale_id: string | null; pos_outlet: string | null } {
  return { pos_source: 'prexty', pos_sale_id: m.saleId, pos_outlet: m.outlet }
}

/** Kept on the order's detail (V408) so the next sync keeps the match, and the sheet can say why. */
export const matchDetail = (m: PosMatch) => ({ pos_match: { by: m.by, inStore: m.inStore, saleId: m.saleId, copyOf: m.copyOf } })

/** Read back a match stored on a woocommerce_orders row. */
export function storedMatch(row: any): PosMatch | null {
  const pm = row?.detail?.pos_match
  if (!pm || !pm.by) return null
  return { by: pm.by, inStore: pm.inStore !== false && row.pos_source === 'prexty', saleId: pm.saleId || row.pos_sale_id || null, outlet: row.pos_outlet || null, locationId: row.pos_location_id || null, copyOf: pm.copyOf || null }
}


/**
 * Keep a sale Prexty's webhook sent (V437), walk-ins included, so a WooCommerce
 * copy without the tag can be matched back to it. Best-effort: never throws.
 */
export async function recordPrextyReceipt(db: any, companyId: string, r: {
  orderId: any; orderNo: any; status?: string | null; total?: any; currency?: string | null
  items?: { name?: string; qty?: number; price?: number; sku?: string | null }[]
  outletId?: any; outletName?: any; locationId?: string | null; createdAt?: any; walkIn?: boolean
}): Promise<boolean> {
  const id = str(r.orderId || r.orderNo)
  if (!companyId || !id) return false
  // Only a timestamp with its time zone is trusted: "2026-11-15 10:14:00" from
  // Prexty is shop time, and read on a UTC server it would be 11 hours out.
  // Otherwise now, as the webhook fires when the sale is rung up.
  const raw = str(r.createdAt)
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw) ? Date.parse(raw) : NaN
  const items = (r.items || []).map(i => ({ name: str(i.name) || 'Item', qty: Number(i.qty) || 1, price: Number(i.price) || 0, sku: str(i.sku) || null }))
  try {
    const { error } = await db.from('prexty_receipts').upsert({
      company_id: companyId,
      prexty_order_id: id,
      sale_no: str(r.orderNo) || id,
      status: str(r.status).toLowerCase() || null,
      total: r.total != null && r.total !== '' && Number.isFinite(Number(r.total)) ? Number(r.total) : null,
      currency: str(r.currency) || null,
      units: items.length ? items.reduce((n, i) => n + i.qty, 0) : null,
      items,
      outlet_id: str(r.outletId) || null,
      outlet_name: str(r.outletName) || null,
      location_id: r.locationId || null,
      walk_in: !!r.walkIn,
      ...(Number.isFinite(zoned) ? { sold_at: new Date(zoned).toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,prexty_order_id' })
    return !error
  } catch { return false }
}
