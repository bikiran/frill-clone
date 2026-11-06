// Table availability by covers (Phase 1; tables come in Phase 2). Pure and
// time-zone aware, mirroring claim_reservation() in COLVY_V429 so the times
// a guest sees are the times the database will accept:
//   • max_covers  — the busiest moment inside the visit (its start, or any
//                   later start inside it) plus this party must fit;
//   • pace_covers — guests arriving in the same interval (aligned to the
//                   epoch, like the SQL) plus this party must fit.

import { zonedToUtc, addDays, dayKeyOf } from '@/lib/booking-time'
import { durationFor, periodName, type RestaurantSettings } from '@/lib/restaurant/settings'

const MIN = 60_000
const DAY = 86_400_000

export type LiveRes = { id?: string; starts: number; ends: number; seats: number }
export type ResSlot = {
  start: number
  end: number
  period: string
  ok: boolean
  /** Why it can't be booked online: 'full' | 'pace' | 'notice' | 'far' */
  reason?: 'full' | 'pace' | 'notice' | 'far'
  /** Seats left at the busiest moment of this visit (Infinity when there's no limit). */
  coversLeft: number
}

/** Most guests seated at once during [start, end). */
const skip = (r: LiveRes, excludeId?: string | null) => !!excludeId && r.id === excludeId

export function peakCovers(live: LiveRes[], start: number, end: number, excludeId?: string | null): number {
  const pts = [start]
  for (const r of live) if (!skip(r, excludeId) && r.starts > start && r.starts < end) pts.push(r.starts)
  let peak = 0
  for (const t of pts) {
    let load = 0
    for (const r of live) if (!skip(r, excludeId) && r.starts <= t && r.ends > t) load += r.seats
    if (load > peak) peak = load
  }
  return peak
}

/** Guests arriving in the same interval as `start` (epoch-aligned, like the SQL). */
export function paceCovers(live: LiveRes[], start: number, intervalMins: number, excludeId?: string | null): number {
  const step = intervalMins * MIN
  const slot = Math.floor(start / step) * step
  let n = 0
  for (const r of live) if (!skip(r, excludeId) && r.starts >= slot && r.starts < slot + step) n += r.seats
  return n
}

/** Does a party fit at `start`? */
export function fits(settings: RestaurantSettings, live: LiveRes[], start: number, party: number, excludeId?: string | null): { ok: boolean; reason?: 'full' | 'pace'; coversLeft: number } {
  const end = start + durationFor(settings, party) * MIN
  const peak = peakCovers(live, start, end, excludeId)
  const coversLeft = settings.max_covers > 0 ? settings.max_covers - peak : Infinity
  if (settings.max_covers > 0 && peak + party > settings.max_covers) return { ok: false, reason: 'full', coversLeft }
  if (settings.pace_covers > 0 && paceCovers(live, start, settings.interval_mins, excludeId) + party > settings.pace_covers) return { ok: false, reason: 'pace', coversLeft }
  return { ok: true, coversLeft }
}

/**
 * Every seating time on one day, each marked bookable or not for this party.
 * The public page shows only `ok` ones; the team sees the rest greyed out (and
 * can book over the top).
 */
export function reservationSlots(opts: {
  settings: RestaurantSettings
  tz: string
  date: string
  party: number
  live: LiveRes[]
  now: number
  excludeId?: string | null
}): ResSlot[] {
  const { settings: s, tz, date, party, live, now } = opts
  if (s.closed.some(c => c.date === date)) return []
  const step = s.interval_mins * MIN
  const earliest = now + s.min_notice_mins * MIN
  const latest = now + s.max_days_ahead * DAY
  const dur = durationFor(s, party) * MIN
  const out: ResSlot[] = []
  const seen = new Set<number>()
  for (const w of s.hours[dayKeyOf(date)] || []) {
    const first = zonedToUtc(date, w.start, tz)
    const last = zonedToUtc(date, w.end, tz)
    const period = periodName(w.start)
    for (let t = first; t <= last; t += step) {
      if (seen.has(t)) continue
      seen.add(t)
      const f = fits(s, live, t, party, opts.excludeId)
      let ok = f.ok, reason: ResSlot['reason'] = f.reason
      if (ok && t < earliest) { ok = false; reason = 'notice' }
      if (ok && t > latest) { ok = false; reason = 'far' }
      out.push({ start: t, end: t + dur, period, ok, reason, coversLeft: f.coversLeft })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Is `start` one of the day's seating times (for checking a time the browser sent)? */
export function onGrid(settings: RestaurantSettings, tz: string, date: string, start: number): boolean {
  const step = settings.interval_mins * MIN
  for (const w of settings.hours[dayKeyOf(date)] || []) {
    const first = zonedToUtc(date, w.start, tz), last = zonedToUtc(date, w.end, tz)
    if (start >= first && start <= last && (start - first) % step === 0) return true
  }
  return false
}

/** Guests seated at each step of the day, for the covers strip on the day sheet. */
export function coversTimeline(live: LiveRes[], from: number, to: number, stepMins: number): { at: number; covers: number }[] {
  const out: { at: number; covers: number }[] = []
  for (let t = from; t <= to; t += stepMins * MIN) {
    let n = 0
    for (const r of live) if (r.starts <= t && r.ends > t) n += r.seats
    out.push({ at: t, covers: n })
  }
  return out
}

/** The UTC span of a business-day (for loading its reservations). */
export function daySpan(date: string, tz: string): [number, number] {
  return [zonedToUtc(date, '00:00', tz), zonedToUtc(addDays(date, 1), '00:00', tz)]
}
