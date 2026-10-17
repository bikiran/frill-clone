// What a sign-up told Colvy about their business: the wizard's "Find on
// Google" lookup or what they typed. Name, board address, industry, Google
// category, street address, the Google place (id, Maps link, verified),
// opening hours per day, phone, website, time zone.
//
// Pure functions, shared by:
//   • the sign-up page, to build the payload it sends with each code request,
//     verification and the finished sign-up (signupProfilePayload);
//   • the sign-up routes, to clean it and merge it onto the attempt
//     (cleanProfile, businessFromProfile, mergeBusiness: lib/signup-attempts);
//   • super admin → Signups and the CRM note, to show it (presentBusiness).
//
// Stored as one JSON object on signup_attempts.business (V392), next to the
// flat columns V390 already had (business_name, industry, website,
// business_phone, business_city/state/country).

export const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type WeekDay = typeof WEEK[number]
const SHORT: Record<WeekDay, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
const LONG: Record<WeekDay, string> = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }

/** One day. `allDay` (open 24 hours) is optional: the wizard may or may not send it. */
export type DayHours = { open: boolean; from?: string; to?: string; allDay?: boolean }
export type SignupHours = Partial<Record<WeekDay, DayHours>>
/** Where the hours came from: Google's listing, Colvy's untouched default (Mon–Fri 9 to 5), or set by hand. */
export type HoursSource = 'google' | 'default' | 'manual'
/** How they gave us the business: picked from Google, picked from the map (OpenStreetMap), or typed in. */
export type BusinessSource = 'google' | 'map' | 'manual'

export type SignupAddress = { formatted?: string; line1?: string; city?: string; state?: string; postcode?: string; country?: string }

/** signup_attempts.business (V392). Blank values are left out. */
export type SignupBusiness = {
  name?: string; slug?: string; industry?: string; category?: string
  address?: SignupAddress
  phone?: string; website?: string; abn?: string
  source?: BusinessSource; verified?: boolean; placeId?: string; mapsUrl?: string
  hours?: SignupHours; hoursSource?: HoursSource
  timezone?: string; timezoneFrom?: 'address' | 'browser'; utcOffsetMinutes?: number
  updatedAt?: string
}

/** What the sign-up page sends (flat, so older pages that send fewer keys still work). */
export type SignupProfile = {
  fullName?: string; businessName?: string; businessSlug?: string; industry?: string; website?: string
  businessPhone?: string; businessCity?: string; businessState?: string; businessCountry?: string
  businessPostcode?: string; businessAddress?: string; businessAddressLine1?: string
  businessSource?: BusinessSource; googleVerified?: boolean; googlePlaceId?: string; googleMapsUrl?: string; googleCategory?: string
  hours?: SignupHours; hoursSource?: HoursSource
  utcOffsetMinutes?: number; timeZone?: string; abn?: string
  /**
   * The page's whole picture of the business (the current sign-up page sends
   * every field each time), so a blank is a real edit: it clears. Profiles
   * without it (older pages, partial senders) only ever fill in.
   */
  full?: boolean
}

// ── Cleaning (server) ──────────────────────────────────────────────────────

const str = (v: any, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : undefined
}
const TIME = /^([01]\d|2[0-4]):[0-5]\d$/
const is24 = (from?: string, to?: string) => from === '00:00' && (to === '23:59' || to === '24:00' || to === '00:00')

/** Opening hours as the wizard holds them ({ monday: { open, from, to, allDay? } … }), checked. */
export function cleanHours(raw: any): SignupHours | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: SignupHours = {}
  for (const d of WEEK) {
    const v = raw[d]
    if (!v || typeof v !== 'object') continue
    if (v.open !== true) { if (v.open === false) out[d] = { open: false }; continue }
    const from = TIME.test(String(v.from)) ? String(v.from) : undefined
    const to = TIME.test(String(v.to)) ? String(v.to) : undefined
    if (v.allDay === true || is24(from, to)) out[d] = { open: true, allDay: true }
    else if (from && to) out[d] = { open: true, from, to }
  }
  return Object.keys(out).length ? out : undefined
}

// Google Maps links we'll show as a link: these exact hosts (any path), or
// Google's own sites with a /maps path. Nothing else, however Google-like the
// name ("maps.google.xy.io" is someone else's site).
const MAPS_HOSTS = new Set(['maps.google.com', 'maps.google.com.au', 'maps.google.co.nz', 'maps.app.goo.gl'])
const MAPS_PATH_HOSTS = new Set(['www.google.com', 'google.com', 'www.google.com.au', 'google.com.au', 'www.google.co.nz', 'google.co.nz', 'goo.gl'])
/** A Google Maps link we're willing to show as a link (never another site). */
export function cleanMapsUrl(v: any): string | undefined {
  const s = str(v, 400)
  if (!s) return undefined
  let u: URL
  try { u = new URL(s) } catch { return undefined }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return undefined
  const host = u.hostname.toLowerCase()
  return MAPS_HOSTS.has(host) || (MAPS_PATH_HOSTS.has(host) && /^\/maps(\/|$)/.test(u.pathname)) ? u.href : undefined
}
const cleanPlaceId = (v: any) => { const s = str(v, 300); return s && /^[\w-]{10,300}$/.test(s) ? s : undefined }
const cleanTz = (v: any) => {
  const s = str(v, 64)
  if (!s || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(s)) return undefined
  try { new Intl.DateTimeFormat('en-AU', { timeZone: s }); return s } catch { return undefined }
}
const cleanAbn = (v: any) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 ? d : undefined }
const oneOf = <T extends string>(v: any, list: readonly T[]): T | undefined => (list as readonly string[]).includes(v) ? v as T : undefined

/** What the wizard knew about them when it asked for codes (unknown keys dropped). */
export function cleanProfile(raw: any): SignupProfile {
  if (!raw || typeof raw !== 'object') return {}
  const out: SignupProfile = {
    fullName: str(raw.fullName, 120), businessName: str(raw.businessName, 160), businessSlug: str(raw.businessSlug, 60)?.toLowerCase(),
    industry: str(raw.industry, 60), website: str(raw.website, 200), businessPhone: str(raw.businessPhone, 40),
    businessCity: str(raw.businessCity, 80), businessState: str(raw.businessState, 60), businessCountry: str(raw.businessCountry, 60),
    businessPostcode: str(raw.businessPostcode, 12), businessAddress: str(raw.businessAddress, 300), businessAddressLine1: str(raw.businessAddressLine1, 160),
    businessSource: oneOf(raw.businessSource, ['google', 'map', 'manual'] as const),
    googleVerified: typeof raw.googleVerified === 'boolean' ? raw.googleVerified : undefined,
    googlePlaceId: cleanPlaceId(raw.googlePlaceId), googleMapsUrl: cleanMapsUrl(raw.googleMapsUrl), googleCategory: str(raw.googleCategory, 80),
    hours: cleanHours(raw.hours), hoursSource: oneOf(raw.hoursSource, ['google', 'default', 'manual'] as const),
    utcOffsetMinutes: Number.isInteger(raw.utcOffsetMinutes) && Math.abs(raw.utcOffsetMinutes) <= 840 ? raw.utcOffsetMinutes : undefined,
    timeZone: cleanTz(raw.timeZone), abn: cleanAbn(raw.abn),
    full: raw.full === true ? true : undefined,
  }
  for (const k of Object.keys(out) as (keyof SignupProfile)[]) if (out[k] === undefined) delete out[k]
  return out
}

// ── Addresses and time zones ───────────────────────────────────────────────

const AU_STATES: Record<string, string> = {
  vic: 'VIC', victoria: 'VIC', nsw: 'NSW', 'new south wales': 'NSW', qld: 'QLD', queensland: 'QLD', sa: 'SA', 'south australia': 'SA',
  wa: 'WA', 'western australia': 'WA', tas: 'TAS', tasmania: 'TAS', nt: 'NT', 'northern territory': 'NT', act: 'ACT', 'australian capital territory': 'ACT',
}
const AU_TZ: Record<string, string> = {
  VIC: 'Australia/Melbourne', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide', WA: 'Australia/Perth', TAS: 'Australia/Hobart', NT: 'Australia/Darwin',
}
const isAU = (c?: string) => /^(au|aus|australia)$/i.test(String(c || '').trim())
const isNZ = (c?: string) => /^(nz|nzl|new zealand|aotearoa)$/i.test(String(c || '').trim())

/** The business's time zone from its state (Australia) or country (New Zealand), or ''. */
export function timezoneFor(state?: string, country?: string): string {
  const s = AU_STATES[String(state || '').trim().toLowerCase()]
  if (s && (!country || isAU(country))) return AU_TZ[s]
  if (isNZ(country)) return 'Pacific/Auckland'
  return ''
}

// "Victoria" as well as "VIC", longest names first so "South Australia" isn't read as "SA".
const STATE_ALT = Object.keys(AU_STATES).sort((a, b) => b.length - a.length).map(k => k.replace(/ /g, '\\s+')).join('|')
const SUBURB_STATE_POSTCODE = new RegExp(`^(.+?)\\s+(${STATE_ALT})\\s+(\\d{4})$`, 'i')
const STATE_POSTCODE = new RegExp(`^(${STATE_ALT})\\s+(\\d{4})$`, 'i')
const stateCode = (v: string) => AU_STATES[v.replace(/\s+/g, ' ').toLowerCase()]
// Street types, to tell "5 Clunes Avenue" from the suburb after it when an
// address is typed on one line without commas.
const STREET_TYPES = new Set([
  'st', 'street', 'rd', 'road', 'ave', 'av', 'avenue', 'hwy', 'highway', 'dr', 'drive', 'ct', 'crt', 'court', 'cres', 'crescent',
  'pl', 'place', 'pde', 'parade', 'bvd', 'blvd', 'boulevard', 'ln', 'lane', 'tce', 'terrace', 'way', 'cl', 'close', 'cct', 'circuit',
  'gr', 'gve', 'grove', 'esp', 'esplanade', 'sq', 'square', 'mall', 'arcade', 'pkwy', 'parkway', 'plaza', 'prom', 'promenade', 'qy', 'quay',
])
const streetType = (w?: string) => !!w && STREET_TYPES.has(w.toLowerCase().replace(/\.$/, ''))
// Saints' names in suburbs ("St Kilda", "North St Marys", "Mount St Thomas",
// "Lake St Clair"). A street named like a street type runs into one on one
// line ("12 Esplanade St Kilda": Esplanade, in St Kilda), and an "St" in front
// of one mid-suburb is the saint's, not a street's ("North St Marys").
const SAINT_SUBURBS = new Set([
  'kilda', 'albans', 'ives', 'marys', 'leonards', 'peters', 'lucia', 'clair', 'helens', 'helena', 'andrews', 'arnaud', 'georges', 'johns',
  'morris', 'agnes', 'james', 'huberts', 'lawrence', 'thomas', 'john', 'kitts', 'aubyn', 'germains', 'pauls', 'fillans', 'bees', 'patricks', 'clements',
])
const saint = (w?: string) => !!w && SAINT_SUBURBS.has(w.toLowerCase())
// Words that start a suburb name ahead of a saint's ("North St Marys", "Mt St
// Thomas"). Any other word before "St Georges" is a street name ("12 Smith St
// Georges Hall": Smith St, in Georges Hall).
const SUBURB_PREFIXES = new Set(['north', 'south', 'east', 'west', 'mt', 'mount', 'lake', 'port', 'upper', 'lower', 'point', 'glen', 'cape', 'new', 'old', 'little', 'great'])
const suburbPrefix = (w?: string) => !!w && SUBURB_PREFIXES.has(w.toLowerCase().replace(/\.$/, ''))
/**
 * "5 Clunes Avenue Dallas" → street "5 Clunes Avenue", suburb "Dallas": the
 * first street type that follows a name ("12 St Georges Rd Northcote" keeps
 * its saint; "12 Fitzroy St St Kilda" keeps the suburb's). A street named
 * like a street type then a saint's suburb ("12 Esplanade St Kilda") splits
 * before the saint; any other "St" in front of a saint's name is the
 * saint's ("North St Marys", "Mt St Thomas": no split there). Null when
 * there's no street type with a suburb after it.
 */
function splitStreet(s: string): { street: string; suburb: string } | null {
  const w = s.split(/\s+/)
  for (let i = 1; i < w.length - 1; i++) {
    if (!streetType(w[i]) || /\d/.test(w[i - 1])) continue
    const suburb = w.slice(i + 1).join(' ')
    if (/\d/.test(suburb)) continue
    const st = /^st\.?$/i.test(w[i])
    if (st && streetType(w[i - 1]) && saint(w[i + 1])) {
      return { street: w.slice(0, i).join(' '), suburb: w.slice(i).join(' ') }
    }
    // "North St Marys": the saint's. "12 Smith St Marys": can't tell a lone
    // saint's name from a street, so no guess. "12 Smith St Georges Hall": split.
    if (st && saint(w[i + 1]) && (suburbPrefix(w[i - 1]) || i + 2 === w.length)) continue
    return { street: w.slice(0, i + 1).join(' '), suburb }
  }
  return null
}

/**
 * Best-effort parts of a one-line address ("Shop 4, 12 Smith St, Fitzroy VIC
 * 3065, Australia", or typed as "12 Smith St Fitzroy VIC 3065"): street line,
 * suburb, state, postcode, country. Used when the wizard only had the line
 * (typed, or an earlier pick went stale). A suburb it can't tell from the
 * street is left out rather than guessed (the street line keeps both).
 */
export function parseAddress(formatted?: string): SignupAddress {
  const parts = String(formatted || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return {}
  const out: SignupAddress = {}
  const last = parts[parts.length - 1]
  if (parts.length > 1 && (isAU(last) || isNZ(last))) out.country = isAU(parts.pop()) ? 'Australia' : 'New Zealand'
  else {
    // "… VIC 3065 Australia" with no comma before the country (not "South Australia").
    const tail = last.match(/^(.*\S)\s+(Australia|New Zealand)$/i)
    if (tail && !/(^|\s)(south|western)$/i.test(tail[1])) { parts[parts.length - 1] = tail[1]; out.country = /^australia$/i.test(tail[2]) ? 'Australia' : 'New Zealand' }
  }
  // The suburb (and street) in front of the state and postcode. Split the
  // street off when they share a part: typed on one line, "12 Smith St
  // Fitzroy" after a unit, or "Smith Street Fitzroy" after a part with no
  // street in it ("Unit 4", a business or centre name).
  const take = (pre: string, head: string[], alone: boolean) => {
    const line = [...head]
    const noStreetYet = !head.some(h => h.split(/\s+/).some(streetType))
    if (alone || /\d/.test(pre) || noStreetYet) {
      const sp = splitStreet(pre)
      if (sp) { out.city = sp.suburb; line.push(sp.street) }
      else if (/\d/.test(pre)) line.push(pre)
      else out.city = pre
    } else out.city = pre
    if (line.length) out.line1 = line.join(', ')
  }
  // "Fitzroy VIC 3065" (Google, Australia), "Fitzroy, VIC 3065", or "Auckland 1010" (New Zealand).
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(SUBURB_STATE_POSTCODE)
    if (m) {
      out.state = stateCode(m[2]); out.postcode = m[3]; out.country ||= 'Australia'
      take(m[1], parts.slice(0, i), i === 0)
      return out
    }
    const sp = i > 0 ? parts[i].match(STATE_POSTCODE) : null
    if (sp) {
      out.state = stateCode(sp[1]); out.postcode = sp[2]; out.country ||= 'Australia'
      take(parts[i - 1], parts.slice(0, i - 1), i - 1 === 0)
      return out
    }
    const nz = out.country === 'New Zealand' ? parts[i].match(/^(.+?)\s+(\d{4})$/) : null
    if (nz) { out.postcode = nz[2]; take(nz[1], parts.slice(0, i), i === 0); return out }
  }
  // "12 Smith St, Fitzroy, Victoria, 3065" (OpenStreetMap). The suburb is only
  // read when a postcode, state or country says it's an Australian or New
  // Zealand address ("Mountain View, CA 94043, USA" keeps just its street).
  const rest = parts.slice(1)
  if (rest.length && /^\d{4}$/.test(rest[rest.length - 1])) out.postcode = rest.pop()
  if (rest.length && stateCode(rest[rest.length - 1])) { out.state = stateCode(rest.pop()!); out.country ||= 'Australia' }
  if (rest.length && (out.postcode || out.state || out.country)) out.city = rest[rest.length - 1]
  if (parts.length > 1) out.line1 = parts[0]
  return out
}

const prune = <T extends Record<string, any>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k]
  return o
}

/** The business block from a cleaned profile, or null when it says nothing about the business. */
export function businessFromProfile(p: SignupProfile): SignupBusiness | null {
  if (!p || typeof p !== 'object') return null
  const parsed = parseAddress(p.businessAddress)
  const address = prune<SignupAddress>({
    formatted: p.businessAddress,
    line1: p.businessAddressLine1 || parsed.line1,
    city: p.businessCity || parsed.city,
    state: p.businessState || parsed.state,
    postcode: p.businessPostcode || parsed.postcode,
    country: p.businessCountry || parsed.country,
  })
  const byAddress = timezoneFor(address.state, address.country)
  const b = prune<SignupBusiness>({
    name: p.businessName, slug: p.businessSlug, industry: p.industry, category: p.googleCategory,
    address: Object.keys(address).length ? address : undefined,
    phone: p.businessPhone, website: p.website, abn: p.abn,
    source: p.businessSource, verified: p.googleVerified, placeId: p.googlePlaceId, mapsUrl: p.googleMapsUrl,
    hours: p.hours, hoursSource: p.hours ? p.hoursSource : undefined,
    timezone: byAddress || p.timeZone, timezoneFrom: byAddress ? 'address' : p.timeZone ? 'browser' : undefined,
    utcOffsetMinutes: p.utcOffsetMinutes,
  })
  const says = ['name', 'slug', 'industry', 'address', 'phone', 'website', 'hours', 'placeId', 'abn'].some(k => k in b)
  return says ? b : null
}

const sameText = (a?: string, b?: string) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** A profile that is the page's whole picture (see SignupProfile.full): flagged, and names the business. */
export const isSnapshot = (p?: SignupProfile | null) => !!p && p.full === true && !!p.businessName

/**
 * Merge a newer business block onto what's recorded.
 *
 * A snapshot (the current sign-up page sends its whole picture each time:
 * `full`) replaces what's recorded: the latest edit wins, a cleared field is
 * cleared, and picking a different place on Google can't leave the first
 * place's category, website or phone behind.
 *
 * Anything else (an older page, a partial sender) only fills in: the latest
 * non-blank value wins and blanks never wipe. A different street address
 * replaces the old one whole (so a postcode from the old address can't
 * linger), new hours replace the old hours whole, a different Google place
 * drops the old place's category, Maps link and UTC offset, and an explicit
 * "not from Google" (they typed a different business) drops the old place.
 */
export function mergeBusiness(prev: any, next: SignupBusiness | null, at?: string, o: { full?: boolean } = {}): SignupBusiness | null {
  const base: SignupBusiness = prev && typeof prev === 'object' && !Array.isArray(prev) ? JSON.parse(JSON.stringify(prev)) : {}
  if (!next) return Object.keys(base).length ? base : null
  if (o.full) {
    const out: SignupBusiness = JSON.parse(JSON.stringify(next))
    delete out.updatedAt
    if (at) out.updatedAt = at
    return out
  }
  const out: SignupBusiness = { ...base }
  const placeChanged = !!next.placeId && next.placeId !== base.placeId
  if (placeChanged || (next.verified === false && !next.placeId)) { delete out.placeId; delete out.mapsUrl; delete out.category; delete out.utcOffsetMinutes }
  for (const k of ['name', 'slug', 'industry', 'category', 'phone', 'website', 'abn', 'source', 'timezone', 'timezoneFrom', 'utcOffsetMinutes', 'placeId', 'mapsUrl'] as const) {
    const v = next[k]
    if (v !== undefined && v !== null && v !== '') (out as any)[k] = v
  }
  if (typeof next.verified === 'boolean') out.verified = next.verified
  if (next.address) {
    const moved = !!(base.address?.formatted && next.address.formatted && !sameText(base.address.formatted, next.address.formatted))
    out.address = moved ? { ...next.address } : prune({ ...(base.address || {}), ...next.address })
  }
  if (next.hours && Object.keys(next.hours).length) {
    out.hours = next.hours
    if (next.hoursSource) out.hoursSource = next.hoursSource; else delete out.hoursSource
  }
  if (at) out.updatedAt = at
  return out
}

// ── Showing it ─────────────────────────────────────────────────────────────

/** '17:00' → '5:00 pm'; '00:00' / '24:00' → '12:00 am'. */
export function time12(t?: string): string {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return String(t || '')
  const h = Number(m[1]) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`
}
/** One day in words: '9:00 am – 5:00 pm', 'Closed', '24 hours'. */
export function dayText(d?: DayHours | null): string {
  if (!d || !d.open) return 'Closed'
  if (d.allDay || is24(d.from, d.to)) return '24 hours'
  return d.from && d.to ? `${time12(d.from)} – ${time12(d.to)}` : 'Open'
}
export type HoursRow = { day: WeekDay; short: string; label: string; text: string; open: boolean }
/** All seven days, Monday first (days the wizard didn't send read 'Not given'). */
export function hoursRows(h?: SignupHours | null): HoursRow[] | null {
  if (!h || !Object.keys(h).length) return null
  return WEEK.map(day => ({ day, short: SHORT[day], label: LONG[day], text: h[day] ? dayText(h[day]) : 'Not given', open: !!h[day]?.open }))
}
/** Days with the same hours side by side: [{ days: 'Mon–Fri', text: '9:00 am – 5:00 pm' }, { days: 'Sun', text: 'Closed' }]. */
export function groupHours(h?: SignupHours | null): { days: string; text: string }[] {
  const rows = hoursRows(h)
  if (!rows) return []
  if (rows.every(r => r.text === rows[0].text)) return [{ days: 'Every day', text: rows[0].text }]
  const out: { from: number; to: number; text: string }[] = []
  rows.forEach((r, i) => { const last = out[out.length - 1]; if (last && last.text === r.text && last.to === i - 1) last.to = i; else out.push({ from: i, to: i, text: r.text }) })
  return out.map(g => ({ days: g.from === g.to ? rows[g.from].short : `${rows[g.from].short}–${rows[g.to].short}`, text: g.text }))
}

const HISTORY_COPY = 'Copied from earlier sign-ups'
/** A link-safe website: 'roxy.com.au' → 'https://roxy.com.au'; anything else that isn't http(s), null. */
export function websiteHref(w?: string | null): string | null {
  const t = String(w || '').trim()
  if (/^https?:\/\/[^\s"'<>]+$/i.test(t)) return t
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s"'<>]*)?$/i.test(t)) return `https://${t}`
  return null
}
/** A Google Maps link: Google's own when it gave one, else a search for the place (by place id) or the address. */
export function mapsLink(b: { mapsUrl?: string; placeId?: string; name?: string | null; formatted?: string | null }): string | null {
  const own = cleanMapsUrl(b.mapsUrl)
  if (own) return own
  const q = [b.name, b.formatted].filter(Boolean).join(', ')
  if (b.placeId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || 'place')}&query_place_id=${encodeURIComponent(b.placeId)}`
  if (b.formatted) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  return null
}
/** 'Pets & Aquarium' as is; an old lower-case key ('pet_store') as words. */
const industryLabel = (v?: string | null) => !v ? null : /^[a-z_-]+$/.test(v) ? v.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) : v
const offsetLabel = (m?: number) => typeof m === 'number' ? `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? ':' + String(Math.abs(m) % 60).padStart(2, '0') : ''}` : null

export type PresentedBusiness = {
  /** Anything about the business was recorded. */
  recorded: boolean
  /** Why nothing was: the sign-up started before Colvy recorded business details, or it just wasn't. */
  missing: 'before_recording' | 'not_recorded' | null
  name: string | null; slug: string | null; boardUrl: string | null
  industry: string | null; category: string | null
  address: SignupAddress | null; addressLines: string[]
  phone: string | null; website: string | null; websiteUrl: string | null; abn: string | null
  source: BusinessSource | null; verified: boolean; placeId: string | null; mapsUrl: string | null
  hours: HoursRow[] | null; hoursGrouped: { days: string; text: string }[]; hoursSource: HoursSource | null
  timezone: string | null; timezoneFrom: 'address' | 'browser' | 'offset' | null
  /** One line for the Signups table: 'Pet store · Dallas VIC'. */
  summary: string | null
  updatedAt: string | null
}

/** The business as super admin shows it: signup_attempts.business (V392) over the flat columns (V390). */
export function presentBusiness(row: any): PresentedBusiness {
  const b: SignupBusiness = row?.business && typeof row.business === 'object' && !Array.isArray(row.business) ? row.business : {}
  // The JSON address when there is one (a changed address replaces the old
  // one whole); otherwise the V390 columns.
  const a: SignupAddress = b.address && typeof b.address === 'object'
    ? { ...b.address }
    : { city: row?.business_city || undefined, state: row?.business_state || undefined, country: row?.business_country || undefined }
  if (a.formatted && (!a.line1 || !a.city || !a.postcode)) {
    const p = parseAddress(a.formatted)
    a.line1 ||= p.line1; a.city ||= p.city; a.state ||= p.state; a.postcode ||= p.postcode; a.country ||= p.country
  }
  prune(a)
  const locality = [a.city, [a.state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(' ')
  const addressLines = a.line1 || locality ? [a.line1, locality, a.country].filter(Boolean) as string[] : a.formatted ? [a.formatted] : a.country ? [a.country] : []
  if (!a.formatted && addressLines.length) a.formatted = addressLines.join(', ')
  const name = b.name || row?.business_name || null
  const slug = b.slug || row?.business_slug || null
  const weekHours = b.hours && typeof b.hours === 'object' && !Array.isArray(b.hours) ? b.hours : null
  const hours = hoursRows(weekHours)
  const byAddress = timezoneFor(a.state, a.country)
  const timezone = b.timezone || byAddress || offsetLabel(b.utcOffsetMinutes) || null
  const timezoneFrom = b.timezone ? (b.timezoneFrom || 'address') : byAddress ? 'address' : b.utcOffsetMinutes !== undefined ? 'offset' : null
  const industry = b.industry || row?.industry || null
  const website = b.website || row?.website || null
  const phone = b.phone || row?.business_phone || null
  const recorded = !!(name || slug || industry || website || phone || addressLines.length || hours || b.placeId)
  const copied = !!row?.legacy || (Array.isArray(row?.events) && row.events.some((e: any) => e?.detail === HISTORY_COPY))
  return {
    recorded,
    missing: recorded ? null : copied ? 'before_recording' : 'not_recorded',
    name, slug, boardUrl: slug ? `${slug}.colvy.com` : null,
    industry: industryLabel(industry), category: b.category || null,
    address: Object.keys(a).length ? a : null, addressLines,
    phone, website, websiteUrl: websiteHref(website), abn: b.abn || null,
    source: b.source || null, verified: b.verified === true, placeId: b.placeId || null,
    mapsUrl: b.placeId || cleanMapsUrl(b.mapsUrl) || a.line1 || b.address?.formatted ? mapsLink({ mapsUrl: b.mapsUrl, placeId: b.placeId, name, formatted: a.formatted }) : null,
    hours, hoursGrouped: groupHours(weekHours), hoursSource: hours ? b.hoursSource || null : null,
    timezone, timezoneFrom: timezone ? timezoneFrom : null,
    summary: [b.category || industryLabel(industry), [a.city, a.state].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null,
    updatedAt: b.updatedAt || null,
  }
}

// ── The sign-up page ───────────────────────────────────────────────────────

/** The hours as one comparable string (closed days ignore their times). */
const hoursKey = (h: any) => WEEK.map(d => { const v = h?.[d]; return !v?.open ? 'x' : v.allDay || is24(v.from, v.to) ? '24' : `${v.from}-${v.to}` }).join('|')
const DEFAULT_HOURS_KEY = WEEK.map(d => d === 'saturday' || d === 'sunday' ? 'x' : '09:00-17:00').join('|')
export function hoursSourceOf(hours: any, googleHours?: any): HoursSource | undefined {
  if (!hours || typeof hours !== 'object') return undefined
  const k = hoursKey(hours)
  if (googleHours && typeof googleHours === 'object' && k === hoursKey(googleHours)) return 'google'
  return k === DEFAULT_HOURS_KEY ? 'default' : 'manual'
}

export type WizardBusiness = {
  fullName: string; companyName: string; slug: string; industry: string; website: string; businessPhone: string
  address: string; addrParts?: { line1?: string; city?: string; state?: string; postcode?: string; country?: string } | null
  hours?: Record<string, any> | null
  /** The business picked from "Find on Google" (components/BusinessAutocomplete). */
  found?: { name?: string; address?: string; line1?: string; category?: string; source?: string; placeId?: string; mapsUrl?: string; utcOffsetMinutes?: number; hours?: Record<string, any> | null } | null
  bizMode?: 'google' | 'manual'
}

/**
 * Everything the wizard knows about the business, for /api/auth/otp/send,
 * /api/auth/otp/verify and /api/auth/complete-signup. Reads the wizard's
 * state as it is (hours included, whatever extra flags a day carries).
 */
export function signupProfilePayload(s: WizardBusiness): SignupProfile {
  const address = String(s.address || '').trim()
  const parts = s.addrParts || {}
  // Parts from an earlier pick go stale when the address is retyped: only use
  // them while the address still names that suburb.
  const fresh = !parts.city || !address || address.toLowerCase().includes(String(parts.city).toLowerCase())
  const f = s.found || null
  const picked = !!f && (s.bizMode !== 'manual' || f.name === s.companyName.trim())
  const google = picked && f!.source === 'google'
  let timeZone = ''
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch {}
  return {
    fullName: s.fullName.trim(), businessName: s.companyName.trim(), businessSlug: s.slug.toLowerCase(), industry: s.industry,
    website: s.website.trim(), businessPhone: s.businessPhone.trim(),
    businessAddress: address,
    businessAddressLine1: (picked && f!.address === address && f!.line1) || (fresh && parts.line1) || '',
    businessCity: fresh ? parts.city || '' : '', businessState: fresh ? parts.state || '' : '',
    businessPostcode: fresh ? parts.postcode || '' : '', businessCountry: fresh ? parts.country || '' : '',
    businessSource: picked ? (google ? 'google' : 'map') : 'manual',
    googleVerified: google,
    googlePlaceId: google ? f!.placeId || '' : '',
    googleMapsUrl: google ? f!.mapsUrl || '' : '',
    googleCategory: google ? f!.category || '' : '',
    ...(google && typeof f!.utcOffsetMinutes === 'number' ? { utcOffsetMinutes: f!.utcOffsetMinutes } : {}),
    hours: (s.hours || undefined) as any,
    hoursSource: hoursSourceOf(s.hours, google ? f!.hours : null),
    timeZone,
    full: true,
  }
}
