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

export const POS_COLUMNS = ['pos_source', 'pos_sale_id', 'pos_outlet', 'detail'] as const

/** True when a write failed only because the V407/V408 columns aren't there yet. */
export const missingPosColumns = (err: any) => /pos_(source|sale_id|outlet)|'detail'|"detail"|column .*detail/i.test(String(err?.message || err || ''))

/** A row without the V407/V408 columns, for a database that hasn't run them yet. */
export function withoutPosColumns<T extends Record<string, any>>(row: T): T {
  const r: any = { ...row }
  for (const k of POS_COLUMNS) delete r[k]
  return r
}
