// Australian (Victoria) public-holiday helper for scheduling outbound messages.
//
// Review requests (and similar customer-facing automations) should not go out on
// Sundays, public holidays, or outside business hours. This module owns the
// public-holiday list; quiet-hours and Sundays are handled by the caller.
//
// The list is national + VIC-specific dates for 2026–2027 (Roxy Aquarium is in
// Victoria). A business can extend/override it via review_request_settings by
// passing extra "YYYY-MM-DD" dates — see holidaySet().

// VIC public holidays (YYYY-MM-DD). Update yearly. Dates that fall on a weekend
// and get a substitute day are listed on the observed day too.
const VIC_PUBLIC_HOLIDAYS_2026_2027: string[] = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-26', // Australia Day
  '2026-03-09', // Labour Day (VIC)
  '2026-04-03', // Good Friday
  '2026-04-04', // Saturday before Easter Sunday
  '2026-04-05', // Easter Sunday
  '2026-04-06', // Easter Monday
  '2026-04-25', // Anzac Day
  '2026-06-08', // King's Birthday (VIC)
  '2026-11-03', // Melbourne Cup Day (VIC)
  '2026-12-25', // Christmas Day
  '2026-12-26', // Boxing Day
  '2026-12-28', // Boxing Day (observed — 26th is a Saturday)
  // 2027
  '2027-01-01', // New Year's Day
  '2027-01-26', // Australia Day
  '2027-03-08', // Labour Day (VIC)
  '2027-03-26', // Good Friday
  '2027-03-27', // Saturday before Easter Sunday
  '2027-03-28', // Easter Sunday
  '2027-03-29', // Easter Monday
  '2027-04-25', // Anzac Day
  '2027-04-26', // Anzac Day (observed — 25th is a Sunday)
  '2027-06-14', // King's Birthday (VIC)
  '2027-11-02', // Melbourne Cup Day (VIC)
  '2027-12-25', // Christmas Day
  '2027-12-27', // Christmas Day (observed — 25th is a Saturday)
  '2027-12-26', // Boxing Day
  '2027-12-28', // Boxing Day (observed — 26th is a Sunday)
]

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

// A day we never send on: Sunday (dow 0) or a public holiday.
export function isBlockedDay(tz: string, holidays: Set<string>, at: Date = new Date()): boolean {
  const wc = wallClock(tz, at)
  return wc.dow === 0 || holidays.has(wc.ymd)
}

// The next instant at `openHour` (business-day start) in `tz` that is in the
// future and — when skipDays is on — not a Sunday or public holiday. Used to
// defer a message that comes due at a disallowed time to the next good slot.
export function nextOpenSlot(tz: string, openHour: number, holidays: Set<string>, skipDays: boolean, from: Date = new Date()): Date {
  // Reliable tz offset: diff the same instant formatted in the tz vs UTC.
  const tzNow = new Date(from.toLocaleString('en-US', { timeZone: tz }))
  const utcNow = new Date(from.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = tzNow.getTime() - utcNow.getTime()
  const y = tzNow.getFullYear(), m = tzNow.getMonth(), d = tzNow.getDate()
  for (let add = 0; add <= 21; add++) {
    const cand = new Date(Date.UTC(y, m, d + add, openHour, 0, 0) - offsetMs)
    if (cand.getTime() <= from.getTime()) continue
    if (skipDays && isBlockedDay(tz, holidays, cand)) continue
    return cand
  }
  return new Date(from.getTime() + 24 * 3600 * 1000)
}
