// Customer and Location Insights, worked out on the server.
//
// The pages used to download the store's whole order history (tens of
// thousands of orders, each with its billing address and line items) and add
// it all up in the browser, which made them very slow. Now the server reads
// only the columns it needs, keeps them for a few minutes per workspace, and
// sends back the small summary each page shows.

import { AU_BY_POSTCODE, AU_STATE_CAPITAL } from '@/lib/au-geo'

export type OrderRow = { cid: string; name: string; total: number; status: string; at: number | null; city: string; pc: string; state: string }
export type ItemRow = { at: number | null; status: string; items: { name: string; total: number; qty: number }[] }

// Everything except clearly non-revenue statuses counts — WooCommerce stores
// sometimes use custom paid statuses, so a blacklist is safer than a whitelist.
const DEAD = new Set(['cancelled', 'refunded', 'failed', 'trash', 'checkout-draft', 'draft', 'pending', 'pending-payment'])
export const isPaid = (status: string) => !DEAD.has(String(status || '').toLowerCase().replace(/^wc-/, ''))

export const titleCase = (s: string) => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

export function parseTs(d: string | null | undefined): number | null {
  if (!d) return null
  let s = String(d).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const t = new Date(s).getTime()
  return isNaN(t) ? null : t
}

export type Window = { start: number; end: number; all: boolean }
export function windowFor(range: string, from?: string | null, to?: string | null, now = Date.now()): Window {
  if (range === 'all') return { start: 0, end: 8.64e15, all: true }
  if (range === 'custom') {
    return { start: from ? new Date(from + 'T00:00:00').getTime() : 0, end: to ? new Date(to + 'T23:59:59').getTime() : now, all: !from && !to }
  }
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
  return { start: now - days * 86400000, end: now, all: false }
}
const inWindow = (at: number | null, w: Window) => (at == null ? w.all : at >= w.start && at <= w.end)

/** Customer Insights: totals, value per customer, top customers, how often they buy, revenue by week. */
export function customerSummary(rows: OrderRow[], w: Window) {
  const paid = rows.filter(r => isPaid(r.status) && inWindow(r.at, w))
  const by = new Map<string, { name: string; spend: number; orders: number; last: number | null }>()
  let revenue = 0
  for (const r of paid) {
    revenue += r.total
    const c = by.get(r.cid) || { name: r.name, spend: 0, orders: 0, last: null }
    c.spend += r.total; c.orders += 1
    if (r.at != null && (c.last == null || r.at > c.last)) c.last = r.at
    by.set(r.cid, c)
  }
  const customers = [...by.values()]
  const freq = { one: 0, two: 0, threePlus: 0 }
  for (const c of customers) { if (c.orders >= 3) freq.threePlus++; else if (c.orders === 2) freq.two++; else freq.one++ }
  const repeat = freq.two + freq.threePlus
  // Revenue per week (up to the last 12 weeks of the window), for the trend line.
  const weeks: { start: number; revenue: number; orders: number }[] = []
  const lastAt = Math.min(w.end, Date.now())
  const firstWeek = Math.max(w.all ? lastAt - 12 * 7 * 86400000 : w.start, lastAt - 12 * 7 * 86400000)
  for (let s = firstWeek; s < lastAt; s += 7 * 86400000) weeks.push({ start: s, revenue: 0, orders: 0 })
  for (const r of paid) {
    if (r.at == null || r.at < firstWeek) continue
    const i = Math.min(weeks.length - 1, Math.floor((r.at - firstWeek) / (7 * 86400000)))
    if (i >= 0) { weeks[i].revenue += r.total; weeks[i].orders += 1 }
  }
  return {
    revenue: round(revenue),
    orders: paid.length,
    customers: customers.length,
    ltv: customers.length ? round(revenue / customers.length) : 0,
    aov: paid.length ? round(revenue / paid.length) : 0,
    ordersPerCustomer: customers.length ? Math.round((paid.length / customers.length) * 10) / 10 : 0,
    repeatRate: customers.length ? Math.round((repeat / customers.length) * 100) : 0,
    freq,
    top: customers.sort((a, b) => b.spend - a.spend).slice(0, 12).map(c => ({ name: c.name, spend: round(c.spend), orders: c.orders, last: c.last })),
    weeks: weeks.map(x => ({ start: x.start, revenue: round(x.revenue), orders: x.orders })),
  }
}

/** Location Insights: suburbs (with map points), products, repeat rate and plain-English takeaways. */
export function locationSummary(rows: OrderRow[], items: ItemRow[] | null, w: Window, suburb: string) {
  const subOf = (r: OrderRow) => (r.city ? titleCase(r.city.trim()) : '')
  const suburbList = [...new Set(rows.map(subOf).filter(Boolean))].sort()
  const paid = rows.filter(r => isPaid(r.status) && inWindow(r.at, w) && (!suburb || subOf(r) === suburb))
  const bySub = new Map<string, { revenue: number; orders: number; customers: Set<string>; pc: string; state: string }>()
  const orders = new Map<string, number>()
  let revenue = 0
  const noAddress = { revenue: 0, orders: 0 }
  for (const r of paid) {
    revenue += r.total
    orders.set(r.cid, (orders.get(r.cid) || 0) + 1)
    const s = subOf(r)
    if (!s) { noAddress.revenue += r.total; noAddress.orders += 1; continue }
    const v = bySub.get(s) || { revenue: 0, orders: 0, customers: new Set<string>(), pc: '', state: '' }
    v.revenue += r.total; v.orders += 1; v.customers.add(r.cid)
    if (!v.pc && r.pc) v.pc = r.pc.trim()
    if (!v.state && r.state) v.state = r.state.trim().toUpperCase()
    bySub.set(s, v)
  }
  const suburbs = [...bySub.entries()].map(([name, v]) => {
    const coord = (v.pc && AU_BY_POSTCODE[v.pc]) || (v.state && AU_STATE_CAPITAL[v.state]) || null
    return { name, revenue: round(v.revenue), orders: v.orders, customers: v.customers.size, state: v.state, lat: coord?.[0] ?? null, lng: coord?.[1] ?? null }
  }).sort((a, b) => b.revenue - a.revenue)

  // Grouped ignoring case and spacing, shown as the store spells it ("API
  // Master Test Kit", not "Api Master Test Kit").
  const products = new Map<string, { name: string; revenue: number; qty: number }>()
  for (const o of items || []) {
    if (!isPaid(o.status) || !inWindow(o.at, w)) continue
    for (const li of o.items) {
      const name = String(li.name || 'Item').trim().replace(/\s+/g, ' ')
      const key = name.toLowerCase()
      const p = products.get(key) || { name, revenue: 0, qty: 0 }
      p.revenue += li.total; p.qty += li.qty
      products.set(key, p)
    }
  }
  const topProducts = [...products.values()].map(v => ({ name: v.name, revenue: round(v.revenue), qty: v.qty })).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  const counts = [...orders.values()]
  const freq = { one: counts.filter(n => n === 1).length, two: counts.filter(n => n === 2).length, threePlus: counts.filter(n => n >= 3).length }
  const customers = counts.length
  const repeatRate = customers ? Math.round(((freq.two + freq.threePlus) / customers) * 100) : 0
  const topSuburb = suburbs[0] || null
  const mostActive = [...suburbs].sort((a, b) => b.customers - a.customers)[0] || null

  const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0)
  const takeaways: string[] = []
  if (paid.length) {
    if (topSuburb) takeaways.push(`${topSuburb.name} is your strongest area: ${money(topSuburb.revenue)} from ${topSuburb.orders} orders (${revenue ? Math.round((topSuburb.revenue / revenue) * 100) : 0}% of revenue).`)
    if (mostActive && topSuburb && mostActive.name !== topSuburb.name) takeaways.push(`${mostActive.name} has the most customers (${mostActive.customers}) without being the biggest spender: a good place for a repeat-purchase campaign.`)
    takeaways.push(`${repeatRate}% of customers bought more than once${repeatRate >= 30 ? ', a loyal base.' : '. Follow-ups and reminders could lift that.'}`)
    if (topProducts[0]) takeaways.push(`Your top seller is ${topProducts[0].name} (${money(topProducts[0].revenue)}), worth featuring to your best suburbs.`)
    if (suburbs.length >= 3) {
      const share = revenue ? Math.round((suburbs.slice(0, 3).reduce((s, x) => s + x.revenue, 0) / revenue) * 100) : 0
      takeaways.push(`Your top 3 suburbs bring in ${share}% of revenue${share > 60 ? ': quite concentrated, so nearby suburbs are room to grow.' : ': a healthy spread.'}`)
    }
    if (noAddress.orders) takeaways.push(`${noAddress.orders} orders (${money(noAddress.revenue)}) have no suburb, mostly in-store sales, so they're left off the map.`)
  }
  return {
    revenue: round(revenue), orders: paid.length, customers,
    avgSpend: customers ? round(revenue / customers) : 0,
    repeatRate, freq, suburbCount: suburbs.length,
    suburbs: suburbs.slice(0, 60), suburbList, noAddress: { revenue: round(noAddress.revenue), orders: noAddress.orders },
    topSuburb, mostActive, products: topProducts, takeaways,
  }
}

const round = (n: number) => Math.round(n * 100) / 100
