// Booking waitlist — the rules, with no database and no Next, so the server,
// the admin screens and the tests share one answer to "does this person want
// this time?" and "may we text now?". The server side (queue, offers, claim)
// is lib/booking-waitlist.ts; migration COLVY_V400_BOOKING_WAITLIST.sql.

import { addDays, dateInTz, isDate, zonedParts, zonedToUtc, fmtDateTime } from '@/lib/booking-time'

export type WaitlistMode = 'first' | 'order'
export type TimeWindow = 'any' | 'morning' | 'afternoon'

export type WaitlistSettings = {
  /** Off by default: a business switches it on under Bookings → Settings. */
  enabled: boolean
  /** 'first': text a few people at once, first to book gets it. 'order': one at a time, held for them. */
  mode: WaitlistMode
  /** First to claim: how many people are texted for each freed time. */
  batch: number
  /** In order: how long the time is held for each person before the next is offered it. */
  hold_mins: number
  /** A freed time is only offered if it starts at least this far ahead. */
  notice_mins: number
  /** At most this many offers per person per day. */
  max_per_day: number
}

export const WAITLIST_DEFAULTS: WaitlistSettings = { enabled: false, mode: 'first', batch: 3, hold_mins: 15, notice_mins: 120, max_per_day: 3 }

const clampInt = (v: any, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt
}

export function resolveWaitlistSettings(raw: any): WaitlistSettings {
  const s = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: s.enabled === true,
    mode: s.mode === 'order' ? 'order' : 'first',
    batch: clampInt(s.batch, 1, 10, WAITLIST_DEFAULTS.batch),
    hold_mins: clampInt(s.hold_mins, 5, 120, WAITLIST_DEFAULTS.hold_mins),
    notice_mins: clampInt(s.notice_mins, 0, 60 * 24 * 7, WAITLIST_DEFAULTS.notice_mins),
    max_per_day: clampInt(s.max_per_day, 1, 10, WAITLIST_DEFAULTS.max_per_day),
  }
}

/** First to claim: someone just offered a time isn't offered another for this long. */
export const FIRST_MODE_COOLDOWN_MINS = 30
/** The longest stretch of dates someone can wait for. */
export const MAX_RANGE_DAYS = 60
export const MAX_SPECIFIC_DAYS = 14

export const WINDOW_LABEL: Record<TimeWindow, string> = { any: 'Any time', morning: 'Mornings (before 12pm)', afternoon: 'Afternoons (from 12pm)' }

/** Morning: starts before 12pm; afternoon: from 12pm; business time. */
export function inWindow(startMs: number, tz: string, w: TimeWindow | string | null | undefined): boolean {
  if (w !== 'morning' && w !== 'afternoon') return true
  const h = zonedParts(startMs, tz).h
  return w === 'morning' ? h < 12 : h >= 12
}

export type EntryLike = {
  id?: string
  service_id: string
  status: string
  days?: string[] | null
  date_from: string
  date_to: string
  time_window?: string | null
  location_id?: string | null
  expires_at?: string | null
}

export const LIVE_ENTRY = ['waiting', 'offered']

/** Is this date one of the days the person asked for? */
export function wantsDate(e: EntryLike, date: string): boolean {
  if (Array.isArray(e.days) && e.days.length) return e.days.includes(date)
  return date >= String(e.date_from).slice(0, 10) && date <= String(e.date_to).slice(0, 10)
}

/**
 * Does this waiting person want this freed time? Same service, still waiting,
 * a day they asked for, inside their time of day, at their outlet (or they
 * didn't pick one), and the time starts at least `noticeMins` from now.
 */
export function entryWantsSlot(e: EntryLike, slot: { serviceId: string; start: number; locationId?: string | null }, tz: string, now: number, noticeMins: number): boolean {
  if (!LIVE_ENTRY.includes(e.status)) return false
  if (e.service_id !== slot.serviceId) return false
  if (slot.start < now + Math.max(0, noticeMins) * 60_000) return false
  if (e.expires_at && Date.parse(e.expires_at) <= now) return false
  if (e.location_id && slot.locationId && e.location_id !== slot.locationId) return false
  if (!wantsDate(e, dateInTz(slot.start, tz))) return false
  return inWindow(slot.start, tz, e.time_window)
}

/** When an entry lapses: midnight after its last date, business time. */
export function entryExpiry(dateTo: string, tz: string): number {
  return zonedToUtc(addDays(dateTo, 1), '00:00', tz)
}

export type CleanDates = { days: string[] | null; date_from: string; date_to: string; time_window: TimeWindow }

/**
 * The dates and time of day a customer asked for, checked: specific days (up
 * to 14), or a range of up to 60 days; nothing in the past or beyond how far
 * ahead the service can be booked.
 */
export function cleanWaitlistDates(input: any, opts: { today: string; lastDay: string }): { ok: true; value: CleanDates } | { ok: false; error: string } {
  const w: TimeWindow = input?.window === 'morning' || input?.window === 'afternoon' ? input.window : 'any'
  const inRange = (d: string) => d >= opts.today && d <= opts.lastDay
  if (Array.isArray(input?.days) && input.days.length) {
    const days = [...new Set<string>(input.days.filter(isDate))].sort()
    if (!days.length) return { ok: false, error: 'Pick the days that suit you.' }
    if (days.length > MAX_SPECIFIC_DAYS) return { ok: false, error: `Pick up to ${MAX_SPECIFIC_DAYS} days.` }
    if (!days.every(inRange)) return { ok: false, error: 'Pick days from today onwards, within the booking window.' }
    return { ok: true, value: { days, date_from: days[0], date_to: days[days.length - 1], time_window: w } }
  }
  const from = isDate(input?.from) ? input.from : ''
  const to = isDate(input?.to) ? input.to : from
  if (!from) return { ok: false, error: 'Pick the dates that suit you.' }
  if (to < from) return { ok: false, error: 'The end date is before the start date.' }
  if (!inRange(from) || !inRange(to)) return { ok: false, error: 'Pick dates from today onwards, within the booking window.' }
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > MAX_RANGE_DAYS * 86_400_000) return { ok: false, error: `Pick a range of up to ${MAX_RANGE_DAYS} days.` }
  return { ok: true, value: { days: null, date_from: from, date_to: to, time_window: w } }
}

/** "Tue 21 Oct" / "Tue 21 Oct – Fri 24 Oct" / "Tue 21, Thu 23 Oct", plus the time of day. */
export function describeWants(e: { days?: string[] | null; date_from: string; date_to: string; time_window?: string | null }): string {
  const d = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  const from = String(e.date_from).slice(0, 10), to = String(e.date_to).slice(0, 10)
  const dates = Array.isArray(e.days) && e.days.length
    ? (e.days.length <= 4 ? e.days.map(d).join(', ') : `${e.days.slice(0, 3).map(d).join(', ')} and ${e.days.length - 3} more`)
    : from === to ? d(from) : `${d(from)} – ${d(to)}`
  const w = e.time_window === 'morning' ? ', mornings' : e.time_window === 'afternoon' ? ', afternoons' : ''
  return dates + w
}

// ── Sending hours ────────────────────────────────────────────────────────────
//
// Offers are texts the customer asked for, but nobody wants one at 6am. They
// go out inside the same sending hours as campaigns and rebook nudges
// (lib/campaign-sender: 9am–8pm, business time). A time that frees up
// overnight waits for the morning — then it's offered only if it still starts
// at least the minimum notice away, so a 9:30am slot freed at 2am isn't
// offered at 9am with no time to get there.

export function withinHours(now: number, tz: string, start: number, end: number): boolean {
  const h = zonedParts(now, tz).h
  return h >= start && h < end
}

/** The next moment sending opens (today's or tomorrow's `start` o'clock, business time). */
export function nextWindowOpen(now: number, tz: string, start: number): number {
  const today = dateInTz(now, tz)
  const hh = `${String(start).padStart(2, '0')}:00`
  const t = zonedToUtc(today, hh, tz)
  return t > now ? t : zonedToUtc(addDays(today, 1), hh, tz)
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function offerSms(o: { first: string; service: string; when: string; business: string; link: string; mode: WaitlistMode; holdMins: number }): string {
  const hi = o.first ? `Hi ${o.first}, a` : 'A'
  return o.mode === 'order'
    ? `${hi} spot opened for ${o.service} on ${o.when} at ${o.business}. It's held for you for ${o.holdMins} min: ${o.link} Reply STOP to opt out.`
    : `${hi} spot opened for ${o.service} on ${o.when} at ${o.business}. Grab it: ${o.link} — first in gets it. Reply STOP to opt out.`
}

export const slotWhen = (startMs: number, tz: string) => fmtDateTime(startMs, tz)

export const CONSENT_TEXT = (business: string) =>
  `I'd like a text from ${business} if a spot opens up. Reply STOP to opt out.`
