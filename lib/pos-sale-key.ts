// One in-store sale, once — wherever a customer's orders are listed or added up.
//
// Prexty copies each in-store sale into WooCommerce, tagged with its receipt
// number (lib/prexty-pos). Sometimes it copies the same sale more than once,
// so one receipt (R10001, $80.00, one shop) becomes three WooCommerce
// orders for the same customer. The Orders board still lists each one, with
// "Copy of #…" on the later ones (lib/pos-copies), so they can be cancelled in
// WooCommerce; a customer's order history, lifetime spend, receipts and the AI
// assistant's view of their purchases count the sale once.
//
// No imports: used by the browser (inbox contact panel, customer profile) and
// the server alike.

type Row = Record<string, any>

const str = (v: any) => String(v ?? '').trim()
const centsOf = (v: any) => Math.round((parseFloat(String(v ?? '0')) || 0) * 100)

/**
 * A tagged in-store sale's identity: its receipt number, total and shop. Null
 * for anything else. The total is part of it so a refund Prexty sends under the
 * same receipt number is never mistaken for a copy.
 */
export function saleKey(r: Row | null | undefined): string | null {
  if (!r || r.pos_source !== 'prexty') return null
  const id = str(r.pos_sale_id).toLowerCase()
  if (!id) return null
  return `${id}|${centsOf(r.total)}|${str(r.pos_outlet).toLowerCase()}`
}

const isDead = (r: Row) => /^(cancelled|refunded|failed|trash)$/i.test(str(r.status))
const idOf = (r: Row) => Number(r.woo_order_id ?? r.external_order_id ?? r.id) || 0

/** The order a row was marked a copy of (lib/pos-copies), if any. */
export function copyOfNumber(r: Row | null | undefined): string | null {
  const c = r?.detail?.pos_match?.copyOf
  const n = c?.number ?? c?.wooOrderId
  return n == null || n === '' ? null : String(n)
}

/**
 * Split a customer's orders into the ones to show and the extra copies of a
 * sale already shown. Rows that share a sale keep one: the earliest that wasn't
 * cancelled (someone may have cancelled the first copy instead of the others),
 * else the earliest. An order marked as a copy of another order in the list is
 * dropped too. Order is preserved.
 */
export function splitPosCopies<T extends Row>(rows: T[]): { kept: T[]; copies: T[] } {
  const list = Array.isArray(rows) ? rows : []
  const best = new Map<string, T>()
  for (const r of list) {
    const k = saleKey(r)
    if (!k) continue
    const cur = best.get(k)
    if (!cur) { best.set(k, r); continue }
    const better = isDead(cur) !== isDead(r) ? !isDead(r) : idOf(r) < idOf(cur)
    if (better) best.set(k, r)
  }
  const ids = new Set(list.map(r => str(r.woo_order_id ?? r.external_order_id)).filter(Boolean))
  const kept: T[] = []
  const copies: T[] = []
  for (const r of list) {
    const k = saleKey(r)
    const drop = k ? best.get(k) !== r : (() => { const of = copyOfNumber(r); return !!of && ids.has(of) })()
    ;(drop ? copies : kept).push(r)
  }
  return { kept, copies }
}

/** A customer's orders with each in-store sale once. */
export const collapsePosCopies = <T extends Row>(rows: T[]): T[] => splitPosCopies(rows).kept
