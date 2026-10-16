// Booking insights for the Today tab: when people come in, what they book and
// how many come back, over the last 90 days. Pure (rows in, numbers out) so
// it's easy to test; the route reads the rows.

import { zonedParts, dateInTz, DAY_KEYS } from '@/lib/booking-time'

export type BookingInsights = {
  days: number
  /** Visits that happened (completed, or confirmed and already over) plus no-shows. */
  visits: number
  /** Monday-first counts of visits by weekday, in the business's timezone. */
  byDow: number[]
  /** Visits by starting hour (0–23), business timezone. Only hours with visits. */
  byHour: Record<number, number>
  topServices: { name: string; count: number; revenueCents: number }[]
  /** Share of customers (with 1+ visit) who came 2+ times, or null with none. */
  repeatRate: number | null
  noShowRate: number | null
  /** Regular bookings (series) with a visit still to come. */
  regulars: number
}

const MON_FIRST = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function computeInsights(rows: any[], tz: string, now = Date.now(), days = 90): BookingInsights {
  const since = now - days * 86_400_000
  const happened = rows.filter(b => {
    const s = Date.parse(b.starts_at)
    if (!(s >= since && s < now)) return false
    return b.status === 'completed' || b.status === 'no_show' || (b.status === 'confirmed' && Date.parse(b.ends_at) <= now)
  })
  const kept = happened.filter(b => b.status !== 'no_show')
  const byDow = [0, 0, 0, 0, 0, 0, 0]
  const byHour: Record<number, number> = {}
  const services = new Map<string, { name: string; count: number; revenueCents: number }>()
  // One customer can show up by contact, phone and email on different
  // bookings: keys seen on the same booking are the same person.
  const parent = new Map<string, string>()
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(k, r); return r }
  const join = (keys: string[]) => {
    for (const k of keys) if (!parent.has(k)) parent.set(k, k)
    for (const k of keys.slice(1)) { const a = find(keys[0]), b = find(k); if (a !== b) parent.set(b, a) }
  }
  const keysOf = (b: any) => [
    b.contact_id ? `c:${b.contact_id}` : '',
    String(b.customer_phone || '').replace(/\D/g, '').length >= 9 ? `p:${String(b.customer_phone).replace(/\D/g, '').slice(-9)}` : '',
    b.customer_email ? `e:${String(b.customer_email).trim().toLowerCase()}` : '',
  ].filter(Boolean)
  for (const b of kept) { const k = keysOf(b); if (k.length) join(k) }
  const perCustomer = new Map<string, number>()
  for (const b of kept) {
    const ms = Date.parse(b.starts_at)
    const dow = DAY_KEYS[new Date(`${dateInTz(ms, tz)}T12:00:00Z`).getUTCDay()]
    byDow[MON_FIRST.indexOf(dow)]++
    const h = zonedParts(ms, tz).h
    byHour[h] = (byHour[h] || 0) + 1
    const name = b.service_name || 'Booking'
    const sv = services.get(name) || { name, count: 0, revenueCents: 0 }
    sv.count++
    sv.revenueCents += Math.max(0, (b.price_cents || 0) - (b.refunded_cents || 0))
    services.set(name, sv)
    const k = keysOf(b)
    if (k.length) { const who = find(k[0]); perCustomer.set(who, (perCustomer.get(who) || 0) + 1) }
  }
  const customers = [...perCustomer.values()]
  const regulars = new Set(rows.filter(b => b.series_id && b.status === 'confirmed' && Date.parse(b.starts_at) > now).map(b => b.series_id)).size
  return {
    days,
    visits: happened.length,
    byDow,
    byHour,
    topServices: [...services.values()].sort((a, b) => b.count - a.count || b.revenueCents - a.revenueCents).slice(0, 5),
    repeatRate: customers.length ? Math.round((100 * customers.filter(n => n >= 2).length) / customers.length) : null,
    noShowRate: happened.length ? Math.round((100 * (happened.length - kept.length)) / happened.length) : null,
    regulars,
  }
}
