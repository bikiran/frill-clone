// Booking time maths + the slot engine. Pure — no DB, no Next — so it runs on
// the server (the source of truth for what's bookable) and in the browser
// (formatting), and is easy to unit test.
//
// Dates are 'YYYY-MM-DD' strings in the BUSINESS timezone; instants are epoch
// milliseconds. Opening hours are 'HH:MM' wall-clock times in that timezone,
// so a 9am opening stays 9am across daylight-saving changes.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type TimeRange = { start: string; end: string }
export type WeekHours = Record<DayKey, TimeRange[]>

export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_LABEL: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

const MIN = 60_000
const DAY = 86_400_000

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    dtfCache.set(tz, f)
  }
  return f
}

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// Wall-clock fields of an instant in a timezone.
export function zonedParts(ms: number, tz: string) {
  const p: Record<string, number> = {}
  for (const x of partsFormatter(tz).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second }
}

// Minutes the timezone is ahead of UTC at that instant.
export function tzOffsetMin(ms: number, tz: string): number {
  const z = zonedParts(ms, tz)
  return Math.round((Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s) - Math.floor(ms / 1000) * 1000) / MIN)
}

const pad = (n: number) => String(n).padStart(2, '0')

// 'YYYY-MM-DD' + 'HH:MM' in tz → epoch ms.
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const off1 = tzOffsetMin(guess, tz)
  let utc = guess - off1 * MIN
  const off2 = tzOffsetMin(utc, tz)
  if (off2 !== off1) utc = guess - off2 * MIN
  return utc
}

export function dateInTz(ms: number, tz: string): string {
  const z = zonedParts(ms, tz)
  return `${z.y}-${pad(z.m)}-${pad(z.d)}`
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function dayKeyOf(date: string): DayKey {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

export const isDate = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const isTime = (s: any) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export function cleanRanges(raw: any): TimeRange[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r: any) => r && isTime(r.start) && isTime(r.end) && toMins(r.end) > toMins(r.start))
    .map((r: any) => ({ start: r.start, end: r.end }))
    .sort((a, b) => toMins(a.start) - toMins(b.start))
    .slice(0, 6)
}

export function cleanWeek(raw: any, fallback?: WeekHours): WeekHours {
  const out = {} as WeekHours
  for (const k of DAY_ORDER) out[k] = raw && Array.isArray(raw[k]) ? cleanRanges(raw[k]) : (fallback ? fallback[k] : [])
  return out
}

export const DEFAULT_HOURS: WeekHours = {
  mon: [{ start: '09:00', end: '17:00' }], tue: [{ start: '09:00', end: '17:00' }],
  wed: [{ start: '09:00', end: '17:00' }], thu: [{ start: '09:00', end: '17:00' }],
  fri: [{ start: '09:00', end: '17:00' }], sat: [{ start: '10:00', end: '16:00' }], sun: [],
}

// ── Slot engine ──────────────────────────────────────────────────────────────

export type SlotService = {
  id: string
  duration_mins: number
  buffer_before: number
  buffer_after: number
  slot_interval: number | null
  capacity: number
  min_notice_mins: number
  max_days_ahead: number
}

// A resource that can be booked: a staff member, or the business itself (id
// null) when no staff are set up.
export type SlotResource = { id: string | null; hours: WeekHours; off: string[] }

// A busy interval on a resource. `serviceId` + `startMs` let a group service
// share its own slot (seats) instead of being blocked by itself.
export type Busy = { from: number; until: number; serviceId?: string | null; startMs?: number; seats?: number }

export type Slot = { start: number; resources: (string | null)[]; seatsLeft?: number }

export const rKey = (id: string | null) => id || '-'

export function computeSlots(opts: {
  service: SlotService
  timezone: string
  resources: SlotResource[]
  closed: string[]
  fromDate: string
  toDate: string
  busy: Map<string, Busy[]>
  now: number
}): Slot[] {
  const { service, timezone: tz, resources, now } = opts
  const dur = Math.max(5, service.duration_mins) * MIN
  const step = Math.max(5, service.slot_interval || 15) * MIN
  const before = Math.max(0, service.buffer_before) * MIN
  const after = Math.max(0, service.buffer_after) * MIN
  const earliest = now + Math.max(0, service.min_notice_mins) * MIN
  const latest = now + Math.max(1, service.max_days_ahead) * DAY
  const capacity = Math.max(1, service.capacity || 1)
  const closed = new Set(opts.closed)

  const bySlot = new Map<number, Slot>()
  for (let date = opts.fromDate, guard = 0; date <= opts.toDate && guard < 400; date = addDays(date, 1), guard++) {
    if (closed.has(date)) continue
    const key = dayKeyOf(date)
    for (const r of resources) {
      if (r.off.includes(date)) continue
      const busy = opts.busy.get(rKey(r.id)) || []
      for (const w of r.hours[key] || []) {
        const open = zonedToUtc(date, w.start, tz)
        const close = zonedToUtc(date, w.end, tz)
        for (let s = open; s + dur <= close; s += step) {
          if (s < earliest || s > latest) continue
          const bFrom = s - before, bUntil = s + dur + after
          let seatsTaken = 0, blocked = false
          for (const b of busy) {
            if (!(b.from < bUntil && b.until > bFrom)) continue
            if (capacity > 1 && b.serviceId === service.id && b.startMs === s) { seatsTaken += b.seats || 1; continue }
            blocked = true; break
          }
          if (blocked || seatsTaken >= capacity) continue
          const slot = bySlot.get(s) || { start: s, resources: [] }
          slot.resources.push(r.id)
          if (capacity > 1) slot.seatsLeft = Math.max(slot.seatsLeft || 0, capacity - seatsTaken)
          bySlot.set(s, slot)
        }
      }
    }
  }
  return [...bySlot.values()].sort((a, b) => a.start - b.start)
}

// ── Formatting (shared by the page, emails and SMS) ─────────────────────────

export function fmtDateTime(ms: number, tz: string, opts?: { withTz?: boolean }) {
  const d = new Date(ms)
  const date = d.toLocaleDateString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  const zone = opts?.withTz ? ' ' + (new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || '') : ''
  return `${date}, ${time}${zone}`
}

export function fmtTime(ms: number, tz: string) {
  return new Date(ms).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
}

export function fmtMoney(cents: number, currency = 'aud') {
  const n = (cents || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) }
  catch { return `$${n.toFixed(2)}` }
}

export function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h} hr ${m} min` : `${h} hr${h > 1 ? 's' : ''}`
}

// ── Why can't anyone book this? (shown to the business) ─────────────────────

const minsOf = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// A plain-English reason a service will never show a bookable time, or null.
// `bookable` = staff switched on under "Who takes bookings" (id → own hours).
export function availabilityIssue(
  service: { duration_mins: number; staff_ids?: string[] | null; min_notice_mins?: number; max_days_ahead?: number },
  settings: { hours: WeekHours; staff?: Record<string, { bookable?: boolean; hours?: WeekHours | null }> },
  staffNames?: Record<string, string>,
): string | null {
  const bookable = Object.entries(settings.staff || {}).filter(([, v]) => v?.bookable)
  let weeks: WeekHours[]
  if (!bookable.length) weeks = [settings.hours]
  else {
    const allowed = service.staff_ids?.length ? bookable.filter(([id]) => service.staff_ids!.includes(id)) : bookable
    if (!allowed.length) {
      const names = (service.staff_ids || []).map(id => staffNames?.[id]).filter(Boolean).join(', ')
      return `${names || 'The people picked for this service'} ${names.includes(',') ? 'aren’t' : 'isn’t'} switched on under Availability → Who takes bookings.`
    }
    weeks = allowed.map(([, v]) => v.hours || settings.hours)
  }
  let longest = 0
  for (const w of weeks) for (const k of DAY_ORDER) for (const r of w[k] || []) longest = Math.max(longest, minsOf(r.end) - minsOf(r.start))
  if (!longest) return 'No opening hours are set — turn on at least one day under Availability.'
  if (service.duration_mins > longest) {
    const f = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`
    return `It takes ${f(service.duration_mins)}, but your longest opening is ${f(longest)} — shorten the service or extend your hours.`
  }
  if ((service.min_notice_mins || 0) >= (service.max_days_ahead || 60) * 1440) return 'The minimum notice is longer than how far ahead people can book.'
  return null
}
