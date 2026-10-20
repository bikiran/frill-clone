// An in-store sale that Prexty POS pushed into WooCommerce. Prexty tags those
// orders with order meta `_prexty_source = pos`, plus `_prexty_sale_id` (its own
// sale number, e.g. R49966) and `_prexty_outlet`. Shared by the WooCommerce
// webhook (which skips the customer SMS for them) and the order sync (which
// keeps the marker on the order so the apps can badge it).

/** Read an order meta_data value by key (case-insensitive). */
export function orderMeta(order: any, key: string): string {
  const meta = Array.isArray(order?.meta_data) ? order.meta_data : []
  const k = key.toLowerCase()
  const hit = meta.find((m: any) => String(m?.key || '').toLowerCase() === k)
  return hit ? String(hit.value ?? '').trim() : ''
}

export function posSaleInfo(order: any): { isPos: boolean; saleId: string; outlet: string } {
  const source = orderMeta(order, '_prexty_source').toLowerCase()
  return { isPos: source === 'pos', saleId: orderMeta(order, '_prexty_sale_id'), outlet: orderMeta(order, '_prexty_outlet') }
}

/** The woocommerce_orders columns (V407) that record it. */
export function posColumns(order: any): { pos_source: string | null; pos_sale_id: string | null; pos_outlet: string | null } {
  const p = posSaleInfo(order)
  return { pos_source: p.isPos ? 'prexty' : null, pos_sale_id: p.isPos ? (p.saleId || null) : null, pos_outlet: p.isPos ? (p.outlet || null) : null }
}

export const POS_COLUMNS = ['pos_source', 'pos_sale_id', 'pos_outlet'] as const

/** True when a write failed only because the V407 columns aren't there yet. */
export const missingPosColumns = (err: any) => /pos_(source|sale_id|outlet)/i.test(String(err?.message || err || ''))

/** A row without the V407 columns, for a database that hasn't run it yet. */
export function withoutPosColumns<T extends Record<string, any>>(row: T): T {
  const r: any = { ...row }
  for (const k of POS_COLUMNS) delete r[k]
  return r
}
