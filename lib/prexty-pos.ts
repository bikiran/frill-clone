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

/**
 * The rest of an order that the order sheet shows — payment, tax, discount,
 * fees (surcharge), coupons, notes, times — plus every `_prexty_*` field
 * Prexty adds (who served, register…). Kept on the order (V408 `detail`) so
 * opening it later shows the full invoice without asking the store again.
 */
export function orderDetail(order: any): Record<string, any> {
  const meta = Array.isArray(order?.meta_data) ? order.meta_data : []
  const pos: Record<string, string> = {}
  for (const m of meta) {
    const k = String(m?.key || '')
    if (/^_?prexty_/i.test(k) && m?.value != null && typeof m.value !== 'object') pos[k.replace(/^_/, '')] = String(m.value).trim()
  }
  const lines = (arr: any[]) => (Array.isArray(arr) ? arr : []).map((l: any) => ({ name: l?.name || l?.method_title || l?.code || '', total: l?.total ?? null, total_tax: l?.total_tax ?? null }))
  return {
    payment_method_title: order?.payment_method_title || null,
    transaction_id: order?.transaction_id || null,
    discount_total: order?.discount_total ?? null,
    discount_tax: order?.discount_tax ?? null,
    total_tax: order?.total_tax ?? null,
    shipping_tax: order?.shipping_tax ?? null,
    shipping_method: order?.shipping_lines?.[0]?.method_title || null,
    fee_lines: lines(order?.fee_lines),
    coupon_lines: (Array.isArray(order?.coupon_lines) ? order.coupon_lines : []).map((c: any) => ({ code: c?.code || '', discount: c?.discount ?? null })),
    customer_note: order?.customer_note || null,
    shipping: order?.shipping || null,
    date_created: order?.date_created || null,
    date_paid: order?.date_paid || null,
    date_completed: order?.date_completed || null,
    created_via: order?.created_via || null,
    prexty: Object.keys(pos).length ? pos : null,
  }
}

export const POS_COLUMNS = ['pos_source', 'pos_sale_id', 'pos_outlet', 'pos_location_id', 'detail'] as const

/** True when a write failed only because the V407/V408/V410 columns aren't there yet. */
export const missingPosColumns = (err: any) => /pos_(source|sale_id|outlet|location_id)|'detail'|"detail"|column .*detail/i.test(String(err?.message || err || ''))

/**
 * A row without the columns the database is missing. When only the V410
 * pos_location_id is missing, just that goes, so the V407/V408 ones still save.
 */
export function withoutPosColumns<T extends Record<string, any>>(row: T, err?: any): T {
  const r: any = { ...row }
  if (err && /pos_location_id/i.test(String(err?.message || err))) { delete r.pos_location_id; return r }
  for (const k of POS_COLUMNS) delete r[k]
  return r
}

/**
 * A Prexty customer's total spend including GST, for the inbox card.
 * Prexty reports spend before GST. In order of preference:
 *   1. a GST-inclusive total Prexty sends itself;
 *   2. the sum of their in-store orders synced from WooCommerce, which are
 *      GST-inclusive, when that's all of their sales (exact to the cent);
 *   3. Prexty's figure plus 10% GST.
 */
export function prextySpendIncGst(
  customer: { totalSpent?: number | null; totalSpentIncTax?: number | null; totalOrders?: number | null },
  posOrders: { total?: any }[] = [],
): number {
  if (customer.totalSpentIncTax != null && customer.totalSpentIncTax > 0) return customer.totalSpentIncTax
  const count = Number(customer.totalOrders) || 0
  if (count > 0 && posOrders.length === count) {
    const sum = posOrders.reduce((t, o) => t + (parseFloat(o.total) || 0), 0)
    if (sum > 0) return Math.round(sum * 100) / 100
  }
  const ex = Number(customer.totalSpent) || 0
  return Math.round(ex * 110) / 100
}
