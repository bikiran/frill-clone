// Shared, framework-agnostic helpers for the Orders & Fulfillment module.
// Safe to import from both client components and server routes.

export type OrderStatus =
  | 'awaiting_shipment' | 'packed' | 'on_hold' | 'click_and_collect'
  | 'shipped' | 'cancelled' | 'manual' | 'alert'

// Colvy status styling — restrained, token-driven, no ShipStation green theme.
export const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  awaiting_shipment: { label: 'Awaiting Shipment', bg: '#e0edff', fg: '#1d4ed8' },
  packed: { label: 'Packed', bg: '#dcfce7', fg: '#15803d' },
  on_hold: { label: 'On Hold', bg: '#fef3c7', fg: '#b45309' },
  click_and_collect: { label: 'Click & Collect', bg: '#f3e8ff', fg: '#7c3aed' },
  shipped: { label: 'Shipped', bg: '#dcfce7', fg: '#15803d' },
  cancelled: { label: 'Cancelled', bg: '#f3f4f6', fg: '#6b7280' },
  manual: { label: 'Manual', bg: '#e0edff', fg: '#1d4ed8' },
  alert: { label: 'Alert', bg: '#fee2e2', fg: '#dc2626' },
}
export const statusMeta = (s?: string | null) => STATUS_META[String(s || '')] || { label: s || 'Unknown', bg: '#f3f4f6', fg: '#6b7280' }

// The status tabs, in order, with the DB status(es) each covers. "All" and
// "Order Alerts" are computed specially by the caller.
export const STATUS_TABS: { key: string; label: string; match?: OrderStatus[] }[] = [
  { key: 'all', label: 'All Orders' },
  // Packed is a sub-state of awaiting fulfilment (packed but not yet shipped),
  // so packed orders stay in this tab until they're actually shipped.
  { key: 'awaiting_shipment', label: 'Awaiting Shipment', match: ['awaiting_shipment', 'packed'] },
  { key: 'on_hold', label: 'On Hold', match: ['on_hold'] },
  { key: 'manual', label: 'Manual Orders', match: ['manual'] },
  { key: 'shipped', label: 'Shipped', match: ['shipped'] },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'] },
  { key: 'alerts', label: 'Order Alerts' },
]

// WooCommerce sends both `date_created` (the store's LOCAL time, no offset) and
// `date_created_gmt` (UTC, no offset). Passing the local one to `new Date()`
// treats it as UTC, shifting every recent order into the future — which is why
// fresh orders all showed "1 min" old. Prefer the GMT field and mark it UTC.
export function wooDateToISO(o: any): string | null {
  const gmt = o?.date_created_gmt || o?.date_paid_gmt || o?.date_modified_gmt
  if (gmt) { const s = String(gmt); const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); if (!isNaN(d.getTime())) return d.toISOString() }
  const local = o?.date_created || o?.order_date || o?.date_paid
  if (local) { const d = new Date(local); if (!isNaN(d.getTime())) return d.toISOString() }
  return null
}

// WooCommerce status → operational status / payment.
export function mapWooStatus(woo?: string | null): OrderStatus {
  const s = String(woo || '').toLowerCase()
  if (['processing', 'pending'].includes(s)) return 'awaiting_shipment'
  if (s === 'on-hold') return 'on_hold'
  if (['completed'].includes(s)) return 'shipped'
  if (['cancelled', 'refunded', 'failed', 'trash'].includes(s)) return 'cancelled'
  return 'awaiting_shipment'
}
export function mapWooPayment(woo?: string | null): string {
  const s = String(woo || '').toLowerCase()
  if (['processing', 'completed'].includes(s)) return 'paid'
  if (s === 'refunded') return 'refunded'
  if (s === 'failed') return 'failed'
  return 'pending'
}

// Sales-channel badge (emoji keeps it dependency-free; swap for real logos later).
export const CHANNEL_META: Record<string, { label: string; icon: string }> = {
  shopify: { label: 'Shopify', icon: '🛍️' },
  woocommerce: { label: 'WooCommerce', icon: '🟣' },
  ebay: { label: 'eBay', icon: '🏷️' },
  amazon: { label: 'Amazon', icon: '📦' },
  pos: { label: 'POS', icon: '🧾' },
  phone: { label: 'Phone', icon: '📞' },
  website: { label: 'Website', icon: '🌐' },
  manual: { label: 'Manual', icon: '✍️' },
  colvy: { label: 'Colvy', icon: '🌊' },
}
export const channelMeta = (c?: string | null) => CHANNEL_META[String(c || '')] || { label: c || 'Order', icon: '📦' }

export const CARRIERS = ['australia_post', 'startrack', 'team_global_express', 'sendle', 'aramex', 'dhl', 'custom'] as const
export const CARRIER_LABEL: Record<string, string> = {
  australia_post: 'Australia Post', startrack: 'StarTrack', team_global_express: 'Team Global Express',
  sendle: 'Sendle', aramex: 'Aramex', dhl: 'DHL', custom: 'Custom carrier',
}
// The services each carrier offers (drives the label form's service dropdown).
export const CARRIER_SERVICES: Record<string, string[]> = {
  australia_post: ['Parcel Post', 'Express Post', 'Parcel Post Signature', 'Express Post Signature'],
  startrack: ['Road Express', 'Premium (Next Day)', 'Fixed Price Premium'],
  team_global_express: ['Road Express', 'Priority (Overnight)', 'Sensitive Express'],
  sendle: ['Standard', 'Express'],
  aramex: ['Road', 'Express', 'Next Flight'],
  dhl: ['Express Worldwide', 'Express 12:00', 'Economy Select'],
  custom: ['Standard'],
}
// Public tracking-page templates ({tn} → tracking number).
export const CARRIER_TRACK_URL: Record<string, string> = {
  australia_post: 'https://auspost.com.au/mypost/track/#/details/{tn}',
  startrack: 'https://startrack.com.au/track/search?id={tn}',
  team_global_express: 'https://www.mytoll.com/?searchIds={tn}&pageType=track',
  sendle: 'https://track.sendle.com/tracking?ref={tn}',
  aramex: 'https://www.aramex.com/us/en/track/results?ShipmentNumber={tn}',
  dhl: 'https://www.dhl.com/au-en/home/tracking.html?tracking-id={tn}',
  custom: '',
}
export const carrierTrackUrl = (carrier?: string | null, tn?: string | null): string | null => {
  const tpl = CARRIER_TRACK_URL[String(carrier || '')] || ''
  return tpl && tn ? tpl.replace('{tn}', encodeURIComponent(tn)) : null
}

// Order age — highly visible, warning-coloured as it gets older.
export function orderAge(orderDate?: string | null): { label: string; color: string } {
  if (!orderDate) return { label: '—', color: 'var(--slate)' }
  const t = new Date(orderDate).getTime()
  if (isNaN(t)) return { label: '—', color: 'var(--slate)' }
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000))
  const hrs = mins / 60
  const days = hrs / 24
  const label = hrs < 1 ? `${Math.max(1, mins)} min` : hrs < 24 ? `${Math.floor(hrs)} hr` : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`
  // Fresh (green) < 12h, moderate (amber) < 48h, delayed (red) beyond.
  const color = hrs < 12 ? '#16a34a' : hrs < 48 ? '#d97706' : '#dc2626'
  return { label, color }
}

// A Click & Collect / local-pickup order — by status, or by a WooCommerce
// shipping method whose name says pickup/collect (e.g. "Click & Collect -
// Somerton Store", "Local pickup").
export const isClickCollect = (o: any): boolean =>
  o?.status === 'click_and_collect' || /pickup|collect/i.test(String(o?.shipping_method || ''))

export const fmtMoney = (n: number | null | undefined, currency = 'AUD') =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Saved filters offered in the UI (client resolves them against the row set).
export const SAVED_FILTERS = ['Today', 'Overdue', 'High Priority', 'Click & Collect', 'Unassigned'] as const

// ── Line-item fulfilment keys ────────────────────────────────────────────────
// Stable, re-sync-proof key for an order_items row. Prefers the WooCommerce
// line id (stored in metadata.woo_line_id by the sync); otherwise
// product|sku|occurrence (nth identical line), computed from the list order so
// it does not depend on order_items.id (which the webhook regenerates on every
// order update). Shared by the fulfilment panel and the packing slip so a
// "sent" flag maps to the same line in both.
export function buildOrderLineKeys(items: any[]): Map<string, string> {
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  for (const it of items || []) {
    const wl = it?.metadata?.woo_line_id
    if (wl != null && wl !== '') { out.set(it.id, `w:${wl}`); continue }
    const base = `${it.product_id || ''}|${it.sku || ''}`
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    out.set(it.id, `k:${base}|${n}`)
  }
  return out
}
