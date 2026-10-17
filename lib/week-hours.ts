// A business's weekly opening hours as the signup form keeps them, and saves to
// companies.business_hours: one { open, from, to } per weekday, times as
// 24-hour "HH:MM" strings. lib/business-hours.ts (colvyWeek) reads them back.
//
//   • Closes at midnight: to = "24:00" (end of the day).
//   • Open 24 hours: from = "00:00", to = "24:00". No separate flag, so every
//     reader keeps working; "23:59" (older saves) reads as 24 hours too.
//   • Runs past midnight (6pm to 2am): to is earlier than from.
//
// No React here, so the parser and formatting can be tested on their own.

export interface DayHours { open: boolean; from: string; to: string }
export type BusinessHours = Record<string, DayHours>
export type TimeFormat = '12h' | '24h'

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

export const ALL_DAY = { from: '00:00', to: '24:00' } as const

export function emptyHours(): BusinessHours {
  const h: BusinessHours = {}
  for (const d of DAYS) h[d] = { open: d !== 'saturday' && d !== 'sunday', from: '09:00', to: '17:00' }
  return h
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`

/** Open around the clock: 00:00 to midnight (or the older 23:59 / 00:00 forms). */
export function isAllDay(d: DayHours | null | undefined): boolean {
  return !!d && d.open && d.from === '00:00' && (d.to === '24:00' || d.to === '23:59' || d.to === '00:00')
}

/**
 * "17:30" → "5:30 pm" (12h) or "17:30" (24h). End of day "24:00" reads "12:00 am" / "24:00".
 * compact (very narrow phones, 12h only): "5:30pm", "10am".
 */
export function formatTime(t: string, fmt: TimeFormat, compact = false): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
  if (!m) return t || ''
  const raw = Number(m[1])
  if (fmt === '24h') return raw === 24 && m[2] === '00' ? '24:00' : `${pad(raw % 24)}:${m[2]}`
  const h = raw % 24
  const ap = h < 12 ? 'am' : 'pm'
  if (compact) return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${ap}`
  return `${h % 12 || 12}:${m[2]} ${ap}`
}

/** One line for a day: "10:00 am – 5:30 pm" ("10am – 5:30pm" compact), "Open 24 hours" or "Closed". */
export function daySummary(d: DayHours | null | undefined, fmt: TimeFormat, compact = false): string {
  if (!d || !d.open) return 'Closed'
  if (isAllDay(d)) return 'Open 24 hours'
  return `${formatTime(d.from, fmt, compact)} – ${formatTime(d.to === '00:00' ? '24:00' : d.to, fmt, compact)}`
}

/**
 * Choices for an opening or closing time, every 15 minutes, labelled in the
 * chosen format. Closing times run 00:15 … 23:45 then "24:00" (midnight, the
 * last choice); opening times start at "00:00". A saved time off the 15-minute
 * grid (Google's 9:10) is kept as a choice.
 */
export function timeOptions(kind: 'from' | 'to', fmt: TimeFormat, current?: string): { value: string; label: string }[] {
  const values: string[] = []
  for (let m = kind === 'from' ? 0 : 15; m <= (kind === 'from' ? 1425 : 1440); m += 15) values.push(hhmm(m))
  const cur = kind === 'to' && current === '00:00' ? '24:00' : current
  if (cur && /^\d{2}:\d{2}$/.test(cur) && !values.includes(cur)) { values.push(cur); values.sort() }
  return values.map(v => ({ value: v, label: formatTime(v, fmt) }))
}

// ── Google Places (New): regularOpeningHours → our week ──────────────────────
//
// Each period is { open: { day, hour, minute }, close?: { day, hour, minute } }
// with day 0 = Sunday. Google writes:
//   • open 24/7 as ONE period that opens Sunday 00:00 with no close;
//   • one day open 24 hours as open 00:00 → close 00:00 the NEXT day (the old
//     parser read that as "00:00 - 00:00");
//   • several 24-hour days in a row as one period spanning them;
//   • late nights as a close on the next day (Fri 6pm → Sat 2am).
// A day with two periods (closed for lunch) keeps its first open and last close.

const G_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_MIN = 1440
const WEEK_MIN = 7 * DAY_MIN

type Seg = { from: number; to: number; spill?: boolean }   // minutes in the day; to may pass 1440 (overnight)

const at = (t: any) => {
  const day = Number(t?.day ?? 0), hour = Number(t?.hour ?? 0), minute = Number(t?.minute ?? 0)
  if (![day, hour, minute].every(Number.isFinite) || day < 0 || day > 6) return null
  return day * DAY_MIN + Math.min(24, Math.max(0, hour)) * 60 + Math.min(59, Math.max(0, minute))
}

export function hoursFromPlaces(oh: any): BusinessHours | null {
  const periods: any[] = Array.isArray(oh?.periods) ? oh.periods.filter((p: any) => p && p.open) : []
  if (!periods.length) return null
  const out: BusinessHours = {}
  for (const d of DAYS) out[d] = { open: false, from: '09:00', to: '17:00' }

  // Open 24/7.
  if (periods.length === 1 && !periods[0].close) {
    for (const d of DAYS) out[d] = { open: true, ...ALL_DAY }
    return out
  }

  const segs: Record<string, Seg[]> = {}
  const add = (dayIdx: number, seg: Seg) => { const k = G_DAYS[((dayIdx % 7) + 7) % 7]; (segs[k] ||= []).push(seg) }

  for (const p of periods) {
    const s = at(p.open)
    if (s == null) continue
    const day = Math.floor(s / DAY_MIN), sMin = s % DAY_MIN
    if (!p.close) { add(day, { from: sMin, to: DAY_MIN }); continue }   // open-ended: open the rest of that day
    let e = at(p.close)
    if (e == null) continue
    if (e <= s) e += WEEK_MIN
    const dayEnd = (day + 1) * DAY_MIN
    if (e <= dayEnd) { add(day, { from: sMin, to: e - day * DAY_MIN }); continue }
    const past = e - dayEnd
    if (past < DAY_MIN && sMin > 0) { add(day, { from: sMin, to: DAY_MIN + past }); continue }   // overnight (6pm → 2am)
    // Runs through one or more whole days.
    add(day, { from: sMin, to: DAY_MIN })
    let cur = dayEnd
    for (; e - cur >= DAY_MIN; cur += DAY_MIN) add(cur / DAY_MIN, { from: 0, to: DAY_MIN })
    if (e > cur) add(cur / DAY_MIN, { from: 0, to: e - cur, spill: true })
  }

  for (const k of DAYS) {
    const list = segs[k]
    if (!list?.length) continue
    const own = list.filter(x => !x.spill)
    const use = own.length ? own : list
    if (use.some(x => x.from === 0 && x.to >= DAY_MIN)) { out[k] = { open: true, ...ALL_DAY }; continue }
    const from = Math.min(...use.map(x => x.from))
    const to = Math.max(...use.map(x => x.to))
    out[k] = { open: true, from: hhmm(from), to: to === DAY_MIN ? '24:00' : hhmm(to % DAY_MIN) }
  }

  // Google's own day lines ("Sunday: Open 24 hours") settle any doubt.
  const lines: any[] = Array.isArray(oh?.weekdayDescriptions) ? oh.weekdayDescriptions : []
  for (const line of lines) {
    const m = /^\s*([A-Za-z]+)\s*:\s*open 24 hours\s*$/i.exec(String(line || ''))
    const k = m?.[1]?.toLowerCase()
    if (k && (DAYS as readonly string[]).includes(k)) out[k] = { open: true, ...ALL_DAY }
  }
  return out
}

// ── Remembered 12h / 24h choice (per browser) ────────────────────────────────

const FORMAT_KEY = 'colvy_time_format'

export function readTimeFormat(): TimeFormat | null {
  try { const v = localStorage.getItem(FORMAT_KEY); return v === '12h' || v === '24h' ? v : null } catch { return null }
}

export function saveTimeFormat(fmt: TimeFormat): void {
  try { localStorage.setItem(FORMAT_KEY, fmt) } catch {}
}
