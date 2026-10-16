// Australian (Victoria) public-holiday helper for scheduling outbound messages.
//
// Review requests (and similar customer-facing automations) should not go out on
// Sundays, public holidays, or outside business hours. This module owns the
// public-holiday list; quiet-hours and Sundays are handled by the caller.
//
// The list is national + VIC-specific dates for 2026–2027 (Roxy Aquarium is in
// Victoria). A business can extend/override it via review_request_settings by
// passing extra "YYYY-MM-DD" dates — see holidaySet().

// VIC public holidays (YYYY-MM-DD) with their names (Bookings → Availability
// offers them as closed dates). Update yearly. Dates that fall on a weekend
// and get a substitute day are listed on the observed day too.
export const VIC_PUBLIC_HOLIDAYS: { date: string; label: string }[] = [
  // 2026
  { date: '2026-01-01', label: 'New Year’s Day' },
  { date: '2026-01-26', label: 'Australia Day' },
  { date: '2026-03-09', label: 'Labour Day' },
  { date: '2026-04-03', label: 'Good Friday' },
  { date: '2026-04-04', label: 'Saturday before Easter Sunday' },
  { date: '2026-04-05', label: 'Easter Sunday' },
  { date: '2026-04-06', label: 'Easter Monday' },
  { date: '2026-04-25', label: 'Anzac Day' },
  { date: '2026-06-08', label: 'King’s Birthday' },
  { date: '2026-11-03', label: 'Melbourne Cup Day' },
  { date: '2026-12-25', label: 'Christmas Day' },
  { date: '2026-12-26', label: 'Boxing Day' },
  { date: '2026-12-28', label: 'Boxing Day (observed)' },
  // 2027
  { date: '2027-01-01', label: 'New Year’s Day' },
  { date: '2027-01-26', label: 'Australia Day' },
  { date: '2027-03-08', label: 'Labour Day' },
  { date: '2027-03-26', label: 'Good Friday' },
  { date: '2027-03-27', label: 'Saturday before Easter Sunday' },
  { date: '2027-03-28', label: 'Easter Sunday' },
  { date: '2027-03-29', label: 'Easter Monday' },
  { date: '2027-04-25', label: 'Anzac Day' },
  { date: '2027-04-26', label: 'Anzac Day (observed)' },
  { date: '2027-06-14', label: 'King’s Birthday' },
  { date: '2027-11-02', label: 'Melbourne Cup Day' },
  { date: '2027-12-25', label: 'Christmas Day' },
  { date: '2027-12-27', label: 'Christmas Day (observed)' },
  { date: '2027-12-26', label: 'Boxing Day' },
  { date: '2027-12-28', label: 'Boxing Day (observed)' },
]
const VIC_PUBLIC_HOLIDAYS_2026_2027: string[] = VIC_PUBLIC_HOLIDAYS.map(h => h.date)

// The set of holiday dates, optionally extended by business-supplied extras.
export function holidaySet(extra?: string[] | null): Set<string> {
  const s = new Set(VIC_PUBLIC_HOLIDAYS_2026_2027)
  for (const d of extra || []) { const t = String(d).trim(); if (t) s.add(t) }
  return s
}

// The wall-clock time for an instant in a given timezone.
export function wallClock(tz: string, at: Date = new Date()): { y: number; m: number; d: number; h: number; dow: number; ymd: string } {
  const tzNow = new Date(at.toLocaleString('en-US', { timeZone: tz }))
  const y = tzNow.getFullYear(), m = tzNow.getMonth() + 1, d = tzNow.getDate(), h = tzNow.getHours(), dow = tzNow.getDay()
  const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { y, m, d, h, dow, ymd }
}

export type DayRules = { skipWeekends?: boolean; skipHolidays?: boolean }

// A day we never send on, per the business's rules: weekend (Sat/Sun) and/or a
// public holiday. Both default on when the flags are omitted.
export function isBlockedDay(tz: string, holidays: Set<string>, rules: DayRules = {}, at: Date = new Date()): boolean {
  const { skipWeekends = true, skipHolidays = true } = rules
  const wc = wallClock(tz, at)
  if (skipWeekends && (wc.dow === 0 || wc.dow === 6)) return true
  if (skipHolidays && holidays.has(wc.ymd)) return true
  return false
}

// The next instant at `openHour` (business-day start) in `tz` that is in the
// future and — when skipDays is on — not a Sunday or public holiday. Used to
// defer a message that comes due at a disallowed time to the next good slot.
export function nextOpenSlot(tz: string, openHour: number, holidays: Set<string>, rules: DayRules = {}, from: Date = new Date()): Date {
  // Reliable tz offset: diff the same instant formatted in the tz vs UTC.
  const tzNow = new Date(from.toLocaleString('en-US', { timeZone: tz }))
  const utcNow = new Date(from.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = tzNow.getTime() - utcNow.getTime()
  const y = tzNow.getFullYear(), m = tzNow.getMonth(), d = tzNow.getDate()
  for (let add = 0; add <= 21; add++) {
    const cand = new Date(Date.UTC(y, m, d + add, openHour, 0, 0) - offsetMs)
    if (cand.getTime() <= from.getTime()) continue
    if (isBlockedDay(tz, holidays, rules, cand)) continue
    return cand
  }
  return new Date(from.getTime() + 24 * 3600 * 1000)
}
