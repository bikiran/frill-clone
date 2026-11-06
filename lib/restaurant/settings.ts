// Restaurant reservation settings (companies.restaurant_settings), cleaned
// into one safe shape. Pure, shared by the API, the admin and the tests.
// Hours are SEATING times: the first and last time a table can be booked
// ("Dinner 17:30–21:00" means the last booking is at 9pm).

import { cleanWeek, isDate, dayKeyOf, DAY_ORDER, type WeekHours, type DayKey } from '@/lib/booking-time'

export type PartyDuration = { upTo: number; mins: number }
export type SeatingOption = 'indoor' | 'outdoor' | 'bar'
export const SEATING_OPTIONS: SeatingOption[] = ['indoor', 'outdoor', 'bar']
export const SEATING_LABEL: Record<SeatingOption | 'any', string> = { any: 'No preference', indoor: 'Inside', outdoor: 'Outside', bar: 'At the bar' }

export type RestaurantSettings = {
  hours: WeekHours
  closed: { date: string; label: string }[]
  interval_mins: number
  duration_mins: number
  durations: PartyDuration[]
  party_min: number
  party_max: number
  /** Most guests seated at once (0 = no limit). */
  max_covers: number
  /** Most guests arriving in one interval, for the kitchen (0 = no limit). */
  pace_covers: number
  min_notice_mins: number
  max_days_ahead: number
  /** Guests can cancel or change online until this many hours before. */
  cancel_hours: number
  allow_changes: boolean
  require_email: boolean
  require_phone: boolean
  seating: SeatingOption[]
  page_title: string
  intro: string
  confirmation_note: string
  large_party_note: string
  /** Seat by table once there are tables on the floor plan (Phase 2). Off: covers only. */
  use_tables: boolean
  /** Deposits for online bookings: per person or per booking, from a party size, on some days. */
  deposit: DepositRule
  /** No-show tools. */
  no_show: NoShowRule
}

export type DepositRule = {
  mode: 'off' | 'per_person' | 'per_booking'
  /** In cents (per person, or for the booking). */
  cents: number
  /** Only parties of this size or more (1 = everyone). */
  min_party: number
  /** Only on these days (empty = every day). */
  days: DayKey[]
}
export type NoShowRule = {
  /** Mark a booked table that never sat down as a no-show this many minutes after its time (0 = never). */
  auto_mins: number
  /** Guests with this many no-shows can't book online and are asked to call (0 = off). */
  block_after: number
  /** Guests with this many no-shows pay a deposit online, even when deposits are off (0 = off). */
  deposit_after: number
}

const D = (start: string, end: string) => [{ start, end }]
export const DEFAULT_RESTAURANT_HOURS: WeekHours = {
  mon: [], tue: D('17:30', '21:00'), wed: D('17:30', '21:00'), thu: D('17:30', '21:00'),
  fri: [{ start: '12:00', end: '14:30' }, { start: '17:30', end: '21:30' }],
  sat: [{ start: '12:00', end: '14:30' }, { start: '17:30', end: '21:30' }],
  sun: D('12:00', '15:00'),
}

const int = (v: any, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt
}
const text = (v: any, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n) : '')

export function cleanDurations(raw: any): PartyDuration[] {
  const out: PartyDuration[] = []
  for (const r of Array.isArray(raw) ? raw : []) {
    const upTo = Math.round(Number(r?.upTo)), mins = Math.round(Number(r?.mins))
    if (!(upTo >= 1 && upTo <= 500) || !(mins >= 15 && mins <= 600) || out.some(x => x.upTo === upTo)) continue
    out.push({ upTo, mins })
    if (out.length >= 12) break
  }
  return out.sort((a, b) => a.upTo - b.upTo)
}

export function resolveRestaurantSettings(raw: any): RestaurantSettings {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const interval = int(s.interval_mins, 5, 60, 15)
  const partyMin = int(s.party_min, 1, 50, 1)
  return {
    hours: s.hours ? cleanWeek(s.hours) : DEFAULT_RESTAURANT_HOURS,
    closed: Array.isArray(s.closed)
      ? s.closed.filter((c: any) => isDate(c?.date)).map((c: any) => ({ date: c.date, label: text(c.label, 80) })).slice(0, 200)
      : [],
    interval_mins: [5, 10, 15, 20, 30, 45, 60].includes(interval) ? interval : 15,
    duration_mins: int(s.duration_mins, 15, 600, 90),
    durations: s.durations === undefined ? [{ upTo: 2, mins: 75 }, { upTo: 4, mins: 90 }, { upTo: 8, mins: 120 }] : cleanDurations(s.durations),
    party_min: partyMin,
    party_max: Math.max(partyMin, int(s.party_max, 1, 100, 8)),
    max_covers: int(s.max_covers, 0, 2000, 40),
    pace_covers: int(s.pace_covers, 0, 1000, 0),
    min_notice_mins: int(s.min_notice_mins, 0, 7 * 24 * 60, 60),
    max_days_ahead: int(s.max_days_ahead, 1, 365, 60),
    cancel_hours: int(s.cancel_hours, 0, 24 * 14, 2),
    allow_changes: s.allow_changes !== false,
    require_email: s.require_email === true,
    require_phone: s.require_phone !== false,
    seating: Array.isArray(s.seating) ? SEATING_OPTIONS.filter(o => s.seating.includes(o)) : [],
    page_title: text(s.page_title, 120),
    intro: text(s.intro, 1000),
    confirmation_note: text(s.confirmation_note, 1000),
    large_party_note: text(s.large_party_note, 300),
    use_tables: s.use_tables !== false,
    deposit: cleanDeposit(s.deposit),
    no_show: cleanNoShow(s.no_show),
  }
}

export function cleanDeposit(raw: any): DepositRule {
  const d = raw && typeof raw === 'object' ? raw : {}
  const mode = d.mode === 'per_person' || d.mode === 'per_booking' ? d.mode : 'off'
  return {
    mode, cents: int(d.cents, 0, 100_000, 0), min_party: int(d.min_party, 1, 100, 1),
    days: Array.isArray(d.days) ? DAY_ORDER.filter(k => d.days.includes(k)) : [],
  }
}

export function cleanNoShow(raw: any): NoShowRule {
  const n = raw && typeof raw === 'object' ? raw : {}
  const auto = int(n.auto_mins, 0, 240, 0)
  return { auto_mins: auto && auto < 10 ? 10 : auto, block_after: int(n.block_after, 0, 10, 0), deposit_after: int(n.deposit_after, 0, 10, 0) }
}

/**
 * The deposit an online booking needs, in cents (0 = none): the restaurant's
 * rule for this party and day, or — for a guest with enough past no-shows —
 * the same amount even when deposits are otherwise off.
 */
export function depositFor(rs: RestaurantSettings, opts: { party: number; date: string; noShows?: number }): { cents: number; why: 'rule' | 'no_shows' | null } {
  const d = rs.deposit
  if (d.cents <= 0) return { cents: 0, why: null }
  const per = (mode: 'per_person' | 'per_booking') => (mode === 'per_person' ? d.cents * Math.max(1, opts.party) : d.cents)
  const ruleApplies = d.mode !== 'off' && opts.party >= d.min_party && (!d.days.length || d.days.includes(dayKeyOf(opts.date)))
  if (ruleApplies) return { cents: per(d.mode as 'per_person' | 'per_booking'), why: 'rule' }
  if (rs.no_show.deposit_after > 0 && (opts.noShows || 0) >= rs.no_show.deposit_after) return { cents: per(d.mode === 'per_booking' ? 'per_booking' : 'per_person'), why: 'no_shows' }
  return { cents: 0, why: null }
}

/** How long a party of this size keeps its table. */
export function durationFor(settings: RestaurantSettings, party: number): number {
  for (const d of settings.durations) if (party <= d.upTo) return d.mins
  return settings.duration_mins
}

/** "Lunch", "Dinner"… from a seating window's first time. */
export function periodName(start: string): string {
  const h = Number(String(start).slice(0, 2))
  if (h < 11) return 'Breakfast'
  if (h < 16) return 'Lunch'
  return 'Dinner'
}

export const reservationName = (party: number) => `Table for ${party}`

export type { DayKey }
