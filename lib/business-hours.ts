// Opening hours, as a customer would ask about them: "are you open tomorrow?",
// "what time do you close today?".
//
// Sources, best first:
//   • Google Business Profile (live) — regular hours, holiday/special hours and
//     open/closed status for each connected store. What the owner keeps up to
//     date for Google Maps, so it wins.
//   • Colvy (companies.business_hours) — saved from Google Places at signup.
//     Used when Google isn't connected or can't be reached.
//
// All dates and times are the business's own local time (booking timezone,
// else Australia/Melbourne), so "tomorrow" at 12:20am means the right day.

import { getGoogleToken } from '@/lib/google-business'
import { holidaySet } from '@/lib/holidays'

export type Range = { from: string; to: string; overnight?: boolean }   // 'HH:MM'; to may be '24:00'
export type Week = Partial<Record<string, Range[]>>                    // [] = closed, missing = unknown
export type SpecialDay = { date: string; ranges: Range[] }               // [] = closed that day
export type HoursPlace = {
  name: string
  address?: string | null
  source: 'google' | 'colvy'
  week: Week
  special: SpecialDay[]
  status?: 'open' | 'closed_temporarily' | 'closed_permanently'
}
export type BusinessHours = { timezone: string; places: HoursPlace[]; notes: string[]; missing?: string[] }

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const pad = (n: any) => String(Number(n) || 0).padStart(2, '0')
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function cleanTime(t: any): string | null {
  const m = String(t || '').trim().match(/^(\d{1,2}):?(\d{2})/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h <= 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null
}

function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Colvy's saved hours: { monday: { open, from, to }, … }. */
export function colvyWeek(raw: any): Week | null {
  if (!raw || typeof raw !== 'object') return null
  const week: Week = {}
  for (const d of WEEKDAYS) {
    const v = raw[d]
    if (!v || typeof v !== 'object') continue
    if (v.open === false || v.closed === true) { week[d] = []; continue }
    const from = cleanTime(v.from), to = cleanTime(v.to)
    if (from && to) week[d] = [{ from, to }]
  }
  return Object.keys(week).length ? week : null
}

const gTime = (t: any) => `${pad(t?.hours)}:${pad(t?.minutes)}`

/** Google Business Profile regularHours.periods → a week. A day Google lists no period for is closed. */
export function googleWeek(regular: any): Week | null {
  const periods = Array.isArray(regular?.periods) ? regular.periods : []
  if (!periods.length) return null
  const week: Week = Object.fromEntries(WEEKDAYS.map(d => [d, [] as Range[]]))
  for (const p of periods) {
    const day = String(p.openDay || '').toLowerCase()
    if (!WEEKDAYS.includes(day)) continue
    const from = gTime(p.openTime)
    let to = gTime(p.closeTime)
    const overnight = !!p.closeDay && String(p.closeDay).toLowerCase() !== day
    if (overnight && to === '00:00') to = '24:00'
    week[day]!.push({ from, to, ...(overnight && to !== '24:00' ? { overnight: true } : {}) })
  }
  for (const d of WEEKDAYS) week[d]!.sort((a, b) => a.from.localeCompare(b.from))
  return week
}

const gDate = (d: any) => d?.year && d?.month && d?.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null

/** Google specialHours (holidays, one-off closures) → per-date overrides. */
export function googleSpecial(special: any): SpecialDay[] {
  const byDate: Record<string, Range[]> = {}
  for (const p of Array.isArray(special?.specialHourPeriods) ? special.specialHourPeriods : []) {
    const start = gDate(p.startDate)
    if (!start) continue
    const end = gDate(p.endDate) || start
    // A closed period covers every day from start to end; an open one is one
    // day's hours (end is the next day only when it runs past midnight).
    const dates: string[] = []
    if (p.closed) {
      for (let d = start, i = 0; d <= end && i < 62; d = addDays(d, 1), i++) dates.push(d)
    } else dates.push(start)
    for (const d of dates) {
      byDate[d] ||= []
      if (!p.closed) {
        let to = gTime(p.closeTime)
        if (end > start && to === '00:00') to = '24:00'
        byDate[d].push({ from: gTime(p.openTime), to })
      }
    }
  }
  return Object.entries(byDate).map(([date, ranges]) => ({ date, ranges })).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Dates in the business's timezone ─────────────────────────────────────────

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function localNow(tz: string, at: Date = new Date()): { date: string; weekday: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(at).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: String(parts.weekday).toLowerCase(), time: `${parts.hour}:${parts.minute}` }
}

const weekdayOf = (ymd: string) => WEEKDAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()]

export function prettyDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** 09:00 → 9am, 17:30 → 5:30pm. */
export function prettyTime(t: string): string {
  if (t === '24:00' || t === '00:00') return 'midnight'
  const [h, m] = t.split(':').map(Number)
  const hh = h % 12 || 12
  return `${hh}${m ? `:${pad(m)}` : ''}${h < 12 ? 'am' : 'pm'}`
}

export function prettyRanges(ranges: Range[] | undefined): string {
  if (!ranges) return 'unknown'
  if (!ranges.length) return 'closed'
  if (ranges.length === 1 && ranges[0].from === '00:00' && ranges[0].to === '24:00') return 'open 24 hours'
  return ranges.map(r => `${prettyTime(r.from)}–${prettyTime(r.to)}${r.overnight ? ' (next day)' : ''}`).join(', ')
}

// ── Loading ──────────────────────────────────────────────────────────────────

const READ_MASK = 'name,title,storefrontAddress,phoneNumbers,regularHours,specialHours,openInfo'
const GOOGLE_TTL = 15 * 60_000
const googleCache = new Map<string, { at: number; result: GoogleHours }>()

function placeFromGoogle(loc: any): HoursPlace {
  const a = loc.storefrontAddress
  const status = String(loc.openInfo?.status || '').toUpperCase()
  return {
    name: loc.title || 'Store',
    address: a ? [(a.addressLines || []).join(' '), a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(', ') : null,
    source: 'google',
    week: googleWeek(loc.regularHours) || {},
    special: googleSpecial(loc.specialHours),
    status: status === 'CLOSED_PERMANENTLY' ? 'closed_permanently' : status === 'CLOSED_TEMPORARILY' ? 'closed_temporarily' : 'open',
  }
}

const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const phone9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)
/** "Shop 2, 1B Fleet Street" → "1bfleet": the street number and name, ignoring units and suffixes. */
const streetKey = (s: any) => { const m = String(s || '').toLowerCase().match(/(\d+[a-z]?)\s+([a-z]+)/); return m ? m[1] + m[2] : '' }

type GoogleHours = { places: HoursPlace[]; missing: string[] }

/** Does this Google listing look like this Colvy location? */
function sameStore(g: any, l: any): boolean {
  const a = g.storefrontAddress || {}
  const gSt = streetKey((a.addressLines || []).join(' ')), lSt = streetKey(l.street_address)
  const gPc = String(a.postalCode || '').trim(), lPc = String(l.postcode || '').trim()
  const gSub = norm(a.locality), lSub = norm(l.suburb)
  const gPh = phone9(g.phoneNumbers?.primaryPhone), lPh = phone9(l.phone)
  if (gPh.length >= 8 && gPh === lPh) return true
  if (gSt && gSt === lSt && ((gPc && gPc === lPc) || (gSub && gSub === lSub))) return true
  if (gSub && gSub === lSub && gPc && gPc === lPc) return true
  const title = norm(g.title)
  return !!title && [l.label, l.suburb].some(x => norm(x).length >= 4 && title.includes(norm(x)))
}

/**
 * Hours for the business's stores on Google. Looks through every Google
 * account the connection can see (stores often sit in separate location
 * groups), and keeps a listing when it's the connected location, carries the
 * business's name, or matches one of its Colvy locations — a manager account
 * can hold other businesses' stores too. Also says which Colvy locations have
 * no Google listing, so the agent doesn't pretend to know their hours.
 */
export async function googleHoursPlaces(db: any, companyId: string, company: { name?: string | null } = {}, locations: any[] = []): Promise<GoogleHours | null> {
  const hit = googleCache.get(companyId)
  if (hit && Date.now() - hit.at < GOOGLE_TTL) return hit.result
  const tok = await getGoogleToken(companyId, db)
  if (!tok) return null
  const acc = tok.account || {}
  const headers = { Authorization: `Bearer ${tok.token}` }

  const accounts: string[] = acc.account_name ? [acc.account_name] : []
  try {
    const r = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20', { headers })
    if (r.ok) for (const a of (await r.json())?.accounts || []) if (a?.name && !accounts.includes(a.name)) accounts.push(a.name)
  } catch {}
  const byName = new Map<string, any>()
  for (const name of accounts.slice(0, 10)) {
    try {
      const r = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${name}/locations?readMask=${READ_MASK}&pageSize=100`, { headers })
      if (r.ok) for (const l of (await r.json())?.locations || []) if (l?.name) byName.set(l.name, l)
    } catch {}
  }
  if (acc.location_name && !byName.has(acc.location_name)) {
    const r = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${acc.location_name}?readMask=${READ_MASK}`, { headers })
    if (r.ok) { const l = await r.json(); if (l?.name) byName.set(l.name, l) }
  }
  const locs = [...byName.values()]
  if (!locs.length) throw new Error('Google Business Profile didn’t return any locations')

  const bizName = norm(company.name)
  const ours = (g: any) => (acc.location_name && g.name === acc.location_name)
    || (bizName.length >= 4 && norm(g.title).includes(bizName))
    || locations.some(l => sameStore(g, l))
  const mine = locs.filter(ours)
  const kept = mine.length ? mine : acc.location_name ? [] : locs.slice(0, 1)
  const result: GoogleHours = {
    places: kept.map(placeFromGoogle),
    missing: locations.filter(l => !kept.some(g => sameStore(g, l))).map(l => l.label || l.suburb || 'A location'),
  }
  googleCache.set(companyId, { at: Date.now(), result })
  return result
}

export async function loadBusinessHours(db: any, companyId: string, opts: { google?: boolean } = {}): Promise<BusinessHours> {
  const [{ data: co }, { data: locations }] = await Promise.all([
    db.from('companies').select('name, business_hours, booking_settings').eq('id', companyId).maybeSingle(),
    db.from('company_locations').select('label, street_address, suburb, postcode, phone').eq('company_id', companyId).limit(20).then((r: any) => r, () => ({ data: [] })),
  ])
  const tzRaw = String(co?.booking_settings?.timezone || '').trim()
  const timezone = tzRaw && validTz(tzRaw) ? tzRaw : 'Australia/Melbourne'
  const notes: string[] = []
  let places: HoursPlace[] = []
  let missing: string[] = []

  if (opts.google !== false) {
    try {
      const g = await googleHoursPlaces(db, companyId, { name: co?.name }, locations || [])
      if (g) {
        places = g.places.filter(p => Object.keys(p.week).length || p.special.length || p.status !== 'open')
        if (places.length) missing = g.missing
      }
    } catch { notes.push('Couldn’t reach Google Business Profile just now, so these are the hours saved in Colvy.') }
  }
  if (!places.length) {
    const week = colvyWeek(co?.business_hours)
    if (week) places.push({ name: co?.name || 'The business', source: 'colvy', week, special: [] })
  }
  if (missing.length) notes.push(`No Google Business Profile listing found for ${missing.join(', ')}. Check the store is on the Google account connected to Colvy, with the same address as in Colvy → Locations.`)
  return { timezone, places, notes, missing }
}

// ── What a customer needs to hear ────────────────────────────────────────────

function minutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export function dayHours(place: HoursPlace, date: string): { ranges: Range[] | undefined; special: boolean } {
  const sp = place.special.find(s => s.date === date)
  if (sp) return { ranges: sp.ranges, special: true }
  return { ranges: place.week[weekdayOf(date)], special: false }
}

/** Today, tomorrow and the days after, per store, in the business's local time. */
export function hoursOutlook(h: BusinessHours, opts: { at?: Date; days?: number; date?: string | null } = {}) {
  const now = localNow(h.timezone, opts.at)
  const holidays = h.timezone === 'Australia/Melbourne' ? holidaySet() : new Set<string>()
  const count = Math.max(1, Math.min(14, opts.days ?? 7))
  const dates = Array.from({ length: count }, (_, i) => addDays(now.date, i))
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) && !dates.includes(opts.date) && opts.date > now.date && opts.date <= addDays(now.date, 90)) dates.push(opts.date)

  const places = h.places.map(p => {
    const today = dayHours(p, now.date).ranges
    const t = minutes(now.time)
    const openNow = p.status && p.status !== 'open' ? false
      : today === undefined ? null
        : today.some(r => t >= minutes(r.from) && (r.overnight || t < minutes(r.to)))
    return {
      store: p.name,
      address: p.address || null,
      from: p.source === 'google' ? 'Google Business Profile' : 'Colvy settings',
      ...(p.status && p.status !== 'open' ? { status: p.status === 'closed_permanently' ? 'Permanently closed' : 'Temporarily closed' } : {}),
      openNow,
      days: dates.map(date => {
        const { ranges, special } = dayHours(p, date)
        const label = date === now.date ? 'today' : date === addDays(now.date, 1) ? 'tomorrow' : null
        return {
          date, day: prettyDate(date), ...(label ? { label } : {}),
          hours: p.status && p.status !== 'open' ? 'closed' : prettyRanges(ranges),
          ...(special ? { specialHours: true } : {}),
          ...(holidays.has(date) ? { publicHoliday: true } : {}),
        }
      }),
    }
  })

  const guidance: string[] = [
    `Times are local to the business (${h.timezone}). It is now ${prettyTime(now.time)} on ${prettyDate(now.date)}, so “tomorrow” is ${prettyDate(addDays(now.date, 1))}.`,
  ]
  if (!places.length) {
    guidance.push('No opening hours are on file. Tell the customer you’ll check with the team and escalate_to_human — never guess hours.')
  } else {
    if (places.length > 1) guidance.push('The stores keep their own hours. If the customer means one store, give that one; otherwise give each store briefly or ask which store.')
    if (places.some(p => p.days.some(d => d.publicHoliday && !d.specialHours))) {
      guidance.push('A day marked publicHoliday has no holiday hours set, so the usual hours may not apply. If the customer asks about that day, say hours can differ on public holidays and you’ll confirm with the team (escalate_to_human) — don’t promise.')
    }
    if (h.missing?.length) guidance.push(`There are no hours on file for ${h.missing.join(', ')}. If the customer asks about ${h.missing.length === 1 ? 'that store' : 'those stores'}, say you’ll check with the team and escalate_to_human — don’t borrow another store’s hours.`)
    if (places.some(p => p.days.some(d => d.hours === 'unknown'))) guidance.push('“unknown” means no hours are saved for that day — don’t guess; say you’ll check.')
  }
  return { now: { date: now.date, day: prettyDate(now.date), time: prettyTime(now.time), timezone: h.timezone }, places, ...(h.missing?.length ? { noHoursFor: h.missing } : {}), guidance, notes: h.notes }
}

/** One line per store for the agent's background knowledge (no network). */
export function weekText(week: Week): string {
  return WEEKDAYS.slice(1).concat('sunday').filter(d => week[d] !== undefined).map(d => `${cap(d)} ${prettyRanges(week[d])}`).join('; ')
}
