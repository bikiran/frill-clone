// Sign-up attempts: who started signing up for Colvy, how far they got, and
// whether they look real. Server only (service-role client).
//
// The sign-up wizard asks for name and business first, then email + mobile
// (step 4), which is when the first verification codes go out
// (/api/auth/otp/send). Nothing reached the server before an account was
// created, so someone who asked for codes and never finished left no trace an
// admin could find. Each step now records onto one row per email in
// signup_attempts (migrations/COLVY_V390_SIGNUP_ATTEMPTS.sql):
//   code_sent → email_verified → mobile_verified → account_created
// with where they came from (referrer, UTM), rough location from Vercel's edge
// headers, device, a timeline, and simple risk signals. The codes themselves
// are never stored here. What they told us about the business (Google place,
// street address, opening hours…, lib/signup-profile) comes with every step
// and is merged onto signup_attempts.business (V392).
//
// Everything is best-effort: before V390 runs (or if a write fails) sign-up
// carries on exactly as before.

import { after } from 'next/server'
import { checkBurst } from '@/lib/rate-limit'
import { parseUserAgent } from '@/lib/link-tracking'
import { findContactByPhone } from '@/lib/contact-capture'
import { toE164 } from '@/lib/phone'
import { emailDomain, isDisposableEmail } from '@/lib/disposable-email'
import { SUPER_ADMIN } from '@/app/api/platform-admin/_lib/super-admin'
import { isStaffRow } from '@/lib/company-access'
import { deliveryOf, explainDeliveryError, deliveryProblem, TERMINAL_STATUSES, signupPhoneE164 } from '@/lib/signup-delivery'
import { cleanProfile, businessFromProfile, mergeBusiness, presentBusiness, isSnapshot, type SignupProfile } from '@/lib/signup-profile'

// The profile the wizard sends (name, business, address, Google place, hours…)
// is cleaned and shaped in lib/signup-profile, shared with the sign-up page.
export { cleanProfile }
export type { SignupProfile }

export const TABLE = 'signup_attempts'
/** No activity for this long and no account: abandoned. Codes expire after 10 minutes. */
export const ABANDONED_AFTER_MS = 30 * 60_000
/** Abandoned, not suspicious, not marked spam: deleted after this many days. */
export const RETENTION_DAYS = 180
/** Risk score at or above this reads "Suspicious". */
export const SUSPICIOUS_SCORE = 3
/**
 * perEmailHour is per channel (email codes and SMS codes counted separately).
 * A "call me with the code" counts as an SMS code too, and on top of that
 * only voicePerEmailHour calls go to one sign-up an hour.
 */
export const OTP_LIMITS = { perEmailHour: 8, perIpHour: 15, emailsPerIpHour: 5, perEmailMinute: 3, perIpMinute: 6, voicePerEmailHour: 3, perNumberHour: 5, perNumberDay: 10 }
const MAX_EVENTS = 100

export type SignupEventType =
  | 'code_sent' | 'send_failed' | 'rate_limited' | 'wrong_code'
  | 'email_verified' | 'mobile_verified' | 'account_created' | 'complete_failed'
  | 'marked_spam' | 'unmarked_spam' | 'emailed'
  | 'delivery'   // a delivery report from Twilio for a text or call (recordDelivery)

export type SignupStatus = 'code_sent' | 'verified' | 'account_created' | 'abandoned' | 'spam'

export type SignupAttribution = {
  utm?: Record<string, string>; referrer?: string; landing?: string; plan?: string; ref?: string
}

type HeaderBag = { get(name: string): string | null }

const missingTable = (e: any) =>
  /^(42P01|PGRST205|42703|PGRST204)$/.test(String(e?.code || '')) || /does not exist|could not find|schema cache/i.test(String(e?.message || e || ''))
/** "No such column" for this column (it arrives with a later migration). */
const missingColumn = (e: any, col: string) =>
  (/^(42703|PGRST204)$/.test(String(e?.code || '')) || /column/i.test(String(e?.message || ''))) && String(e?.message || '').includes(col)
let warned = false
const warnMissing = () => { if (!warned) { warned = true; console.warn('[signup-attempts] signup_attempts is missing: run COLVY_V390_SIGNUP_ATTEMPTS.sql') } }

const str = (v: any, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return t ? t.slice(0, max) : undefined
}
const iso = (ms: number) => new Date(ms).toISOString()
const ms = (v: any) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : 0 }

// ── Request details ─────────────────────────────────────────────────────────

/** IP, rough location (Vercel edge headers: no lookup, no cost) and device. */
export function requestMeta(headers?: HeaderBag | null) {
  const h = headers || { get: () => null }
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null
  const dec = (v: string | null) => { if (!v) return null; try { return decodeURIComponent(v) } catch { return v } }
  const country = (h.get('x-vercel-ip-country') || '').toUpperCase()
  const ua = h.get('user-agent') || ''
  const { device, os, browser } = parseUserAgent(ua)
  return {
    ip: ip ? ip.slice(0, 64) : null,
    ip_country: /^[A-Z]{2}$/.test(country) ? country : null,
    ip_region: str(dec(h.get('x-vercel-ip-country-region')), 64) || null,
    ip_city: str(dec(h.get('x-vercel-ip-city')), 80) || null,
    user_agent: ua ? ua.slice(0, 400) : null,
    device: ua ? device : null, os: ua ? os : null, browser: ua ? browser : null,
  }
}

/** Where they came from: UTM tags, the referring page, the page they landed on. */
export function cleanAttribution(raw: any): SignupAttribution {
  if (!raw || typeof raw !== 'object') return {}
  const utm: Record<string, string> = {}
  for (const k of ['source', 'medium', 'campaign', 'term', 'content']) { const v = str(raw.utm?.[k], 120); if (v) utm[k] = v }
  const out: SignupAttribution = {}
  if (Object.keys(utm).length) out.utm = utm
  const referrer = str(raw.referrer, 300); if (referrer) out.referrer = referrer
  const landing = str(raw.landing, 300); if (landing) out.landing = landing
  const plan = str(raw.plan, 30); if (plan) out.plan = plan
  const ref = str(raw.ref, 40); if (ref) out.ref = ref.toUpperCase()
  return out
}

// ── Risk ───────────────────────────────────────────────────────────────────

// Calling codes → country, longest first wins. Enough for the markets Colvy
// sees; anything else just isn't compared.
const CALLING: [string, string][] = [
  ['977', 'NP'], ['880', 'BD'], ['852', 'HK'], ['353', 'IE'], ['234', 'NG'], ['971', 'AE'], ['966', 'SA'],
  ['61', 'AU'], ['64', 'NZ'], ['44', 'GB'], ['91', 'IN'], ['63', 'PH'], ['86', 'CN'], ['65', 'SG'], ['60', 'MY'],
  ['62', 'ID'], ['27', 'ZA'], ['81', 'JP'], ['82', 'KR'], ['92', 'PK'], ['94', 'LK'], ['49', 'DE'], ['33', 'FR'],
  ['39', 'IT'], ['34', 'ES'], ['31', 'NL'], ['84', 'VN'], ['66', 'TH'], ['55', 'BR'], ['52', 'MX'], ['7', 'RU'], ['1', 'US'],
]
/** The country a mobile number belongs to, from its calling code ('' when unknown). */
export function phoneCountry(phone: string | null | undefined): string {
  const raw = String(phone || '').replace(/[\s()-]/g, '')
  if (!raw) return ''
  if (!raw.startsWith('+')) return /^0[45]\d{8}$/.test(raw) ? 'AU' : ''
  const d = raw.slice(1).replace(/\D/g, '')
  for (const [code, cc] of CALLING.slice().sort((a, b) => b[0].length - a[0].length)) if (d.startsWith(code)) return cc
  return ''
}
const sameRegion = (a: string, b: string) => a === b || (['US', 'CA'].includes(a) && ['US', 'CA'].includes(b))

/** Simple, explainable risk signals. Each reason reads on its own. */
export function assessRisk(row: any): { score: number; level: 'none' | 'low' | 'high'; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const domain = row.email_domain || emailDomain(row.email)
  if (domain && isDisposableEmail(domain)) { score += 3; reasons.push(`Throwaway email address (${domain})`) }
  const sends = (Array.isArray(row.events) ? row.events : []).filter((e: any) => e?.type === 'code_sent').map((e: any) => ms(e.at)).filter(Boolean)
  const last = sends.length ? Math.max(...sends) : 0
  const inHour = sends.filter((t: number) => t >= last - 3_600_000).length
  if (inHour >= 5) { score += 2; reasons.push(`${inHour} codes requested within an hour`) }
  else if (inHour >= 3) { score += 1; reasons.push(`${inHour} codes requested within an hour`) }
  if ((row.ip_email_count || 0) >= 3) { score += 3; reasons.push(`${row.ip_email_count} different emails signed up from this IP in 24 hours`) }
  const pc = phoneCountry(row.phone)
  if (row.ip_country && pc && !sameRegion(row.ip_country, pc)) { score += 2; reasons.push(`Connecting from ${row.ip_country} with a ${pc} mobile number`) }
  if ((row.wrong_codes || 0) >= 3) { score += 1; reasons.push(`${row.wrong_codes} wrong codes entered`) }
  return { score, level: score >= SUSPICIOUS_SCORE ? 'high' : score > 0 ? 'low' : 'none', reasons }
}

// ── Status ─────────────────────────────────────────────────────────────────

export function signupStatus(row: any, now = Date.now()): SignupStatus {
  if (row.spam_at) return 'spam'
  if (row.account_created_at) return 'account_created'
  const idle = now - ms(row.last_activity_at || row.updated_at || row.created_at) > ABANDONED_AFTER_MS
  if (idle) return 'abandoned'
  return row.email_verified_at || row.mobile_verified_at ? 'verified' : 'code_sent'
}

/** The wizard step they reached (of 7) and what it's called. */
export function stepReached(row: any): { step: number; label: string } {
  if (row.account_created_at) return { step: 8, label: 'Account created' }
  if (row.mobile_verified_at) return { step: 7, label: 'Create password' }
  if (row.email_verified_at) return { step: 6, label: 'Verify mobile' }
  if (row.codes_sent || row.first_code_at) return { step: 5, label: 'Verify email' }
  return { step: 4, label: 'Contact details' }
}
const stageOf = (row: any) => row.account_created_at ? 'account_created' : row.mobile_verified_at ? 'mobile_verified' : row.email_verified_at ? 'email_verified' : 'code_sent'

// ── Rate limits ────────────────────────────────────────────────────────────

const RATE_WINDOW_SECS = 3600
const DAY_SECS = 86_400
const windows = new Map<string, { start: number; hits: number }>()
const tooManyEmail = { ok: false, reason: 'email' as const, message: 'Too many codes have been sent to this email. Please wait an hour and try again, or email support@colvy.com.' }
const tooManyIp = { ok: false, reason: 'ip' as const, message: 'Too many sign-up codes have been requested from this network. Please try again in an hour.' }
const tooManyCalls = { ok: false, reason: 'email' as const, message: 'We’ve already called this number a few times. Please wait an hour, or email support@colvy.com and we’ll help you finish.' }
const tooManyToNumber = { ok: false, reason: 'number' as const, message: 'Too many codes have gone to this mobile. Please try again later, or email support@colvy.com and we’ll help you finish.' }
const globalCap = { ok: false, reason: 'global' as const, message: 'We can’t send more codes right now. Please try again later, or email support@colvy.com and we’ll help you finish.' }
const waitAMinute = (reason: 'email' | 'ip') => ({ ok: false, reason, message: 'Please wait a minute before asking for another code.' })

/** Daily caps on all sign-up texts and calls together (toll-fraud backstop). */
export function globalSendCaps() {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : d }
  return { sms: n(process.env.SIGNUP_SMS_DAILY_CAP, 300), voice: n(process.env.SIGNUP_VOICE_DAILY_CAP, 50) }
}
/** Set when a global cap refused a send on this server (shown on the health card before V390). */
let capTrippedHere: { kind: 'sms' | 'voice'; at: number } | null = null

/** Per-instance stand-in for signup_rate_claim(): same keys and limits, not shared between servers. */
function claimInMemory(keys: string[], limits: number[], windowSecs: number, now: number): string | null {
  const k = (key: string) => `${windowSecs}:${key}`
  for (let i = 0; i < keys.length; i++) {
    const w = windows.get(k(keys[i]))
    if (w && now - w.start < windowSecs * 1000 && w.hits + 1 > limits[i]) return keys[i]
  }
  for (const key of keys) {
    const w = windows.get(k(key))
    if (!w || now - w.start >= windowSecs * 1000) windows.set(k(key), { start: now, hits: 1 })
    else w.hits++
  }
  return null
}

/**
 * Claim one hit on each key for a window, atomically (signup_rate_claim, V390)
 * or per server before it exists. The key over its limit, or null. Fails
 * closed: when the database answers with an unexpected error the per-server
 * counters still apply.
 */
export async function claimRate(db: any, keys: string[], limits: number[], windowSecs: number, now = Date.now()): Promise<{ over: string | null; shared: boolean }> {
  if (!keys.length) return { over: null, shared: true }
  try {
    const { data, error } = await db.rpc('signup_rate_claim', { p_keys: keys, p_limits: limits, p_window_secs: windowSecs })
    if (!error) return { over: data || null, shared: true }
    if (!missingTable(error) && !/function|signup_rate_claim/i.test(String(error.message || ''))) console.warn('[signup-attempts] signup_rate_claim failed, using per-server limits:', error.message)
  } catch {}
  return { over: claimInMemory(keys, limits, windowSecs, now), shared: false }
}

/**
 * Claim one code send, or say why not. Call it only once the request has
 * passed Cloudflare Turnstile (fresh sign-ups) or the token checks (resends),
 * and the email isn't already registered, so refused bots and existing
 * accounts don't use up a real person's budget.
 *
 *   • per minute, in memory: 3 per email, 6 per IP;
 *   • per hour: 8 email codes and 8 mobile codes per email (a call counts as
 *     a mobile code, and 3 calls at most), 15 requests per IP, 5 codes to one
 *     mobile number;
 *   • per day: 10 codes to one mobile number, and across all sign-ups
 *     SIGNUP_SMS_DAILY_CAP texts (300) and SIGNUP_VOICE_DAILY_CAP calls (50);
 *   • 5 different emails per IP an hour, from the recorded attempts.
 * Counted atomically by signup_rate_claim() (V390), so parallel requests
 * can't get round them; before V390, per server (plus fresh sign-ups per email
 * from signup_verifications).
 */
export async function claimOtpSend(db: any, o: { email: string; ip?: string | null; channel?: 'both' | 'email' | 'sms' | 'voice'; to?: string | null; now?: number }): Promise<{ ok: boolean; reason?: 'email' | 'ip' | 'number' | 'global'; message?: string }> {
  const now = o.now ?? Date.now()
  const email = String(o.email || '').toLowerCase()
  const ip = o.ip || null
  const channel = o.channel || 'both'
  const to = channel !== 'email' && o.to ? String(o.to) : null
  if (!checkBurst(`otp:e:${email}`, OTP_LIMITS.perEmailMinute)) return waitAMinute('email')
  if (ip && !checkBurst(`otp:ip:${ip}`, OTP_LIMITS.perIpMinute)) return waitAMinute('ip')
  const hourAgo = iso(now - RATE_WINDOW_SECS * 1000)

  if (ip) {
    try {
      const { data, error } = await db.from(TABLE).select('email').eq('ip', ip).gte('last_code_at', hourAgo).limit(50)
      if (!error && new Set((data || []).map((r: any) => r.email).filter((e: string) => e !== email)).size >= OTP_LIMITS.emailsPerIpHour) return tooManyIp
    } catch {}
  }

  const keys: string[] = [], limits: number[] = []
  if (channel !== 'sms' && channel !== 'voice') { keys.push(`e:${email}:email`); limits.push(OTP_LIMITS.perEmailHour) }
  if (channel !== 'email') { keys.push(`e:${email}:sms`); limits.push(OTP_LIMITS.perEmailHour) }
  if (channel === 'voice') { keys.push(`e:${email}:voice`); limits.push(OTP_LIMITS.voicePerEmailHour) }
  if (to) { keys.push(`to:${to}`); limits.push(OTP_LIMITS.perNumberHour) }
  if (ip) { keys.push(`ip:${ip}`); limits.push(OTP_LIMITS.perIpHour) }
  const hour = await claimRate(db, keys, limits, RATE_WINDOW_SECS, now)
  let over = hour.over
  if (!over && !hour.shared) {
    try {
      const { count } = await db.from('signup_verifications').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', hourAgo)
      if ((count || 0) >= OTP_LIMITS.perEmailHour) over = `e:${email}:email`
    } catch {}
  }
  if (over) return over.startsWith('ip:') ? tooManyIp : over.startsWith('to:') ? tooManyToNumber : over.endsWith(':voice') ? tooManyCalls : tooManyEmail
  // Then the day: the destination and the global caps (only once the hour
  // allowed it, so a refused request doesn't use up a daily slot).
  const caps = globalSendCaps()
  const dayKeys: string[] = [], dayLimits: number[] = []
  if (to) { dayKeys.push(`to:${to}:day`); dayLimits.push(OTP_LIMITS.perNumberDay) }
  if (channel === 'voice') { dayKeys.push('global:voice:day'); dayLimits.push(caps.voice) }
  else if (channel !== 'email') { dayKeys.push('global:sms:day'); dayLimits.push(caps.sms) }
  const day = await claimRate(db, dayKeys, dayLimits, DAY_SECS, now)
  if (day.over) {
    if (day.over.startsWith('global:')) {
      const kind = day.over.startsWith('global:voice') ? 'voice' : 'sms'
      capTrippedHere = { kind, at: now }
      console.error(`[signup-attempts] GLOBAL DAILY ${kind.toUpperCase()} CAP REACHED (${kind === 'voice' ? caps.voice : caps.sms}): sign-up codes are refused until the window resets. Check super admin → Signups for abuse, or raise ${kind === 'voice' ? 'SIGNUP_VOICE_DAILY_CAP' : 'SIGNUP_SMS_DAILY_CAP'}.`)
      return globalCap
    }
    return tooManyToNumber
  }

  return { ok: true }
}

/** Has a global daily cap refused sends? From signup_rate_windows (shared), else this server's own record. */
export async function globalCapStatus(db: any, now = Date.now()): Promise<{ sms: { used: number; cap: number; hit: boolean }; voice: { used: number; cap: number; hit: boolean } }> {
  const caps = globalSendCaps()
  const out = { sms: { used: 0, cap: caps.sms, hit: false }, voice: { used: 0, cap: caps.voice, hit: false } }
  try {
    const { data, error } = await db.from('signup_rate_windows').select('key, window_start, hits').in('key', ['global:sms:day', 'global:voice:day'])
    if (!error) {
      for (const r of data || []) {
        if (now - ms(r.window_start) >= DAY_SECS * 1000) continue
        const k = r.key === 'global:voice:day' ? 'voice' : 'sms'
        out[k].used = Math.min(r.hits || 0, out[k].cap)
        out[k].hit = (r.hits || 0) >= out[k].cap
      }
    }
  } catch {}
  if (capTrippedHere && now - capTrippedHere.at < DAY_SECS * 1000) out[capTrippedHere.kind].hit = true
  return out
}

// ── Recording ──────────────────────────────────────────────────────────────

export type RequestMeta = ReturnType<typeof requestMeta>
export type SignupEvent = {
  type: SignupEventType
  email: string
  channel?: 'email' | 'sms' | 'both' | 'voice'
  detail?: string
  /** Twilio Message SID of the code text (so its delivery report can be matched). */
  smsSid?: string | null
  /** Twilio Call SID of a "call me with the code" call. */
  callSid?: string | null
  /** Twilio error code when the text or call was refused outright (or 'not_configured'). */
  smsError?: string | null
  smsErrorMessage?: string | null
  phone?: string | null
  profile?: SignupProfile
  attribution?: SignupAttribution
  headers?: HeaderBag | null
  /** requestMeta() taken while the request was live (for recording after the response). */
  meta?: RequestMeta | null
  userId?: string | null
  companyId?: string | null
  companySlug?: string | null
  by?: string | null
  now?: number
}

/** A valid address we're willing to look up (no LIKE wildcards). */
export function cleanEmail(raw: any): string | null {
  const email = String(raw || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || /[%*\\,()]/.test(email) || email.length > 254) return null
  return email
}

// Keep the timeline to MAX_EVENTS, dropping the oldest non-send entries first
// so code sends (what the risk check reads) are the last to go.
function capEvents(events: any[]): any[] {
  const out = events.slice()
  while (out.length > MAX_EVENTS) {
    const i = out.findIndex(e => e?.type !== 'code_sent')
    out.splice(i >= 0 ? i : 0, 1)
  }
  return out
}

// Near-duplicate addresses (a typo then the right one) aren't different people.
function nearSame(a: string, b: string): boolean {
  const [la, da] = a.split('@'), [lb, db] = b.split('@')
  if (la === lb) return true
  if (da !== db) return false
  if (Math.abs(la.length - lb.length) > 2) return false
  const prev = Array.from({ length: lb.length + 1 }, (_, j) => j)
  for (let i = 1; i <= la.length; i++) {
    let diag = prev[0]; prev[0] = i
    for (let j = 1; j <= lb.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (la[i - 1] === lb[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[lb.length] <= 2
}
const phoneTail = (p: any) => String(p || '').replace(/\D/g, '').slice(-9)

/**
 * Record one step of a sign-up onto its row (one per email), recomputing the
 * stage, step reached and risk. Returns the saved row, or null when there's
 * nothing to record or the table isn't there yet. Never throws.
 *
 * A refused request (rate_limited) only adds one note per hour to an existing
 * timeline: it never changes the IP, location, device, profile, activity time
 * or risk, so someone else can't rewrite a real person's record by asking for
 * codes in their name.
 */
export async function recordSignupEvent(db: any, ev: SignupEvent, attempt = 0): Promise<any | null> {
  try {
    const email = cleanEmail(ev.email)
    if (!email) return null
    const now = ev.now ?? Date.now()
    const at = iso(now)
    const { data: existing, error } = await db.from(TABLE).select('*').eq('email', email).maybeSingle()
    if (error) { if (missingTable(error)) warnMissing(); return null }

    if (ev.type === 'rate_limited') {
      if (!existing) return null
      const evs = Array.isArray(existing.events) ? existing.events : []
      if (evs.some((e: any) => e?.type === 'rate_limited' && now - ms(e.at) < RATE_WINDOW_SECS * 1000)) return existing
      const events = capEvents([...evs, { at, type: 'rate_limited', ...(ev.channel ? { channel: ev.channel } : {}), ...(ev.detail ? { detail: String(ev.detail).slice(0, 300) } : {}) }])
      await db.from(TABLE).update({ events, updated_at: at }).eq('id', existing.id)
      return { ...existing, events }
    }

    const admin = ['marked_spam', 'unmarked_spam', 'emailed'].includes(ev.type)
    const meta = admin ? null : ev.meta || (ev.headers ? requestMeta(ev.headers) : null)
    const row: any = existing ? { ...existing } : { email, email_domain: emailDomain(email), first_seen_at: at, codes_sent: 0, wrong_codes: 0, events: [], source: 'web' }
    row.email_domain = row.email_domain || emailDomain(email)

    // What they told us about the business rides along with every code
    // request, verification and the finished sign-up (not only the first send,
    // whose record is best-effort), and is merged (lib/signup-profile
    // mergeBusiness): the current page sends its whole picture each time, so
    // the latest edit wins outright, cleared fields included; anything older
    // or partial only fills in, never blanking. The JSON block
    // (signup_attempts.business, V392) holds all of it; the flat columns
    // (V390) the basics, for search and before V392 runs.
    const p = ev.profile || {}
    const set = (col: string, v: any) => { if (v !== undefined && v !== null && v !== '') row[col] = v }
    set('name', p.fullName)
    const biz = admin ? null : businessFromProfile(p)
    const prevBiz = row.business ?? null
    const prevFlat = flatBusiness(row)
    if (biz) {
      const full = isSnapshot(p)
      const merged = mergeBusiness(prevBiz, biz, at, { full })!
      row.business = merged
      // A snapshot clears what it no longer has; anything else only fills in.
      const put = full ? (col: string, v: any) => { row[col] = v === undefined || v === '' ? null : v } : set
      put('business_name', merged.name); put('business_slug', merged.slug); put('industry', merged.industry)
      put('website', merged.website); put('business_phone', merged.phone)
      put('business_city', merged.address?.city); put('business_state', merged.address?.state); put('business_country', merged.address?.country)
    }
    if (ev.phone && !admin) { row.phone = String(ev.phone).slice(0, 40); row.phone_country = phoneCountry(ev.phone) || null }

    // First touch wins for where they came from; plan and referral code follow the latest.
    const a = ev.attribution || {}
    if (a.utm && !row.utm) row.utm = a.utm
    if (a.referrer && !row.referrer) row.referrer = a.referrer
    if (a.landing && !row.landing_path) row.landing_path = a.landing
    set('plan', a.plan); set('ref_code', a.ref)

    if (meta) {
      for (const k of ['ip', 'ip_country', 'ip_region', 'ip_city', 'user_agent', 'device', 'os', 'browser'] as const) if (meta[k]) row[k] = meta[k]
    }

    const event: any = { at, type: ev.type }
    if (ev.channel) event.channel = ev.channel
    if (meta?.ip && ev.type === 'code_sent') event.ip = meta.ip
    if (ev.detail) event.detail = String(ev.detail).slice(0, 300)
    if (ev.smsSid) event.sms_sid = String(ev.smsSid).slice(0, 64)
    if (ev.callSid) event.call_sid = String(ev.callSid).slice(0, 64)
    if (ev.smsError) event.sms_error = String(ev.smsError).slice(0, 32)
    if (ev.smsErrorMessage) event.sms_error_message = String(ev.smsErrorMessage).slice(0, 200)
    if (ev.by) event.by = ev.by
    row.events = capEvents([...(Array.isArray(row.events) ? row.events : []), event])

    switch (ev.type) {
      case 'code_sent':
        row.codes_sent = (row.codes_sent || 0) + 1
        row.first_code_at = row.first_code_at || at
        row.last_code_at = at
        break
      case 'wrong_code': row.wrong_codes = (row.wrong_codes || 0) + 1; break
      case 'email_verified': row.email_verified_at = row.email_verified_at || at; break
      case 'mobile_verified': row.mobile_verified_at = row.mobile_verified_at || at; break
      case 'account_created':
        row.account_created_at = row.account_created_at || at
        set('user_id', ev.userId); set('company_id', ev.companyId); set('company_slug', ev.companySlug)
        break
    }
    row.stage = stageOf(row)
    row.step_reached = stepReached(row).step

    // How many unrelated emails this IP signed up in the last day (this one
    // included). A typo then the right address, or the same mobile, is one person.
    if (row.ip && ev.type === 'code_sent') {
      try {
        const { data: same } = await db.from(TABLE).select('email, phone').eq('ip', row.ip).gte('last_activity_at', iso(now - 86_400_000)).limit(200)
        const people = [{ email, phone: phoneTail(row.phone) }, ...(same || []).filter((r: any) => r?.email && r.email !== email).map((r: any) => ({ email: r.email, phone: phoneTail(r.phone) }))]
        // Group related addresses (union-find), then count the groups.
        const parent = people.map((_, i) => i)
        const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
        for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
          const x = people[i], y = people[j]
          if ((x.phone.length >= 8 && x.phone === y.phone) || nearSame(x.email, y.email)) parent[find(i)] = find(j)
        }
        row.ip_email_count = new Set(people.map((_, i) => find(i))).size
      } catch {}
    }
    const risk = assessRisk(row)
    row.risk_score = risk.score
    row.risk_reasons = risk.reasons
    // Admin actions (spam, email) aren't the person's activity.
    if (!admin) row.last_activity_at = at
    row.last_activity_at = row.last_activity_at || at
    row.updated_at = at
    delete row.id

    // The whole row is written back, so only over the version that was read
    // (updated_at): otherwise a delivery report or another step saved in
    // between would be wiped from the timeline. On a clash, read again and redo.
    const write = (r: any) => existing
      ? sameVersion(db.from(TABLE).update(r).eq('id', existing.id), existing.updated_at).select('*').maybeSingle()
      : db.from(TABLE).insert(r).select('*').maybeSingle()
    let saved = await write(row)
    // Before V392 there's no business column: save everything else without
    // it (the CRM note below still gets the details), with a fingerprint of
    // the block on this step's timeline entry, so the next request can tell
    // whether the details changed.
    let unsavedBusiness: any = null
    if (saved.error && 'business' in row && missingColumn(saved.error, 'business')) {
      unsavedBusiness = row.business
      delete row.business
      if (biz) event.business_hash = businessHash(unsavedBusiness)
      saved = await write(row)
    }
    if (saved.error) {
      // Two first sends at the same moment: the other insert won, add to it.
      if (!existing && /duplicate|23505/i.test(`${saved.error.code} ${saved.error.message}`) && attempt < 3) return recordSignupEvent(db, ev, attempt + 1)
      console.warn('[signup-attempts] save failed:', saved.error.message)
      return null
    }
    if (existing && !saved.data) {
      if (attempt < 4) return recordSignupEvent(db, ev, attempt + 1)
      console.warn('[signup-attempts] save kept clashing with other writes: not recorded')
      return null
    }
    const out = saved.data || { ...row, id: existing?.id }
    // Did what they told us about the business change? Before V392 the block
    // isn't stored, so compare its fingerprint on the last timeline entry that
    // had one (hours, Google place and street included), or failing that (a
    // row from before this, or the entry has aged out) the V390 columns. An
    // unchanged resend doesn't re-sync the CRM contact.
    const lastHash = unsavedBusiness
      ? (Array.isArray(existing?.events) ? existing.events : []).slice().reverse().find((e: any) => typeof e?.business_hash === 'string')?.business_hash
      : null
    const bizChanged = !!biz && (unsavedBusiness
      ? (lastHash ? lastHash !== event.business_hash : prevFlat !== flatBusiness(row))
      : sameShape(prevBiz) !== sameShape(row.business))

    // Into Colvy's own CRM: when they first get a code, as each channel is
    // verified, when they finish, and when they change their business details.
    if ((ev.type === 'code_sent' && !out.contact_id) || ['email_verified', 'mobile_verified', 'account_created'].includes(ev.type) || (bizChanged && out.contact_id)) {
      const contactId = await syncSignupContact(db, unsavedBusiness && !out.business ? { ...out, business: unsavedBusiness } : out)
      if (contactId && contactId !== out.contact_id) {
        await db.from(TABLE).update({ contact_id: contactId, contact_synced_at: at }).eq('id', out.id)
        out.contact_id = contactId
      }
    }
    return out
  } catch (e: any) {
    console.warn('[signup-attempts] record failed:', e?.message || e)
    return null
  }
}

/** The V390 business columns as comparable text. */
const FLAT_BUSINESS = ['business_name', 'business_slug', 'industry', 'website', 'business_phone', 'business_city', 'business_state', 'business_country']
function flatBusiness(r: any): string {
  return JSON.stringify(FLAT_BUSINESS.map(k => r?.[k] ?? null))
}

/** The business block as comparable text: keys sorted (jsonb reorders them), updatedAt left out. */
function sameShape(b: any): string {
  const norm = (v: any): any => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).filter(k => k !== 'updatedAt').sort().map(k => [k, norm(v[k])]))
    : v
  return JSON.stringify(norm(b ?? null))
}

/** A short fingerprint of the business block (FNV-1a over sameShape), to spot a change without storing it. */
function businessHash(b: any): string {
  const s = sameShape(b)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** Narrow an update to the row version that was read (its updated_at). */
function sameVersion(q: any, updatedAt: any) {
  return updatedAt == null ? q.is('updated_at', null) : q.eq('updated_at', updatedAt)
}

const RECORD_TIMEOUT_MS = 8000
/**
 * Record after the response has gone (Next's after()), with a time limit, so a
 * slow or failing write never holds up or breaks a sign-up. The request's IP,
 * location and device are read now, while the request is live.
 */
export function recordSignupLater(db: any, ev: SignupEvent): void {
  const job: SignupEvent = { ...ev, meta: ev.meta || (ev.headers ? requestMeta(ev.headers) : null), headers: null, now: ev.now ?? Date.now() }
  const run = () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return Promise.race([
      recordSignupEvent(db, job),
      new Promise(resolve => { timer = setTimeout(() => { console.warn('[signup-attempts] record timed out'); resolve(null) }, RECORD_TIMEOUT_MS) }),
    ]).catch(() => null).finally(() => clearTimeout(timer))
  }
  try { after(run) } catch { void run() }
}

/** The email a sign-up token belongs to (verify / complete only carry the token). */
export async function emailForToken(db: any, token: string): Promise<{ email: string; phone: string | null } | null> {
  if (!token) return null
  try {
    const { data } = await db.from('signup_verifications').select('email, phone').eq('token', token).maybeSingle()
    return data?.email ? { email: String(data.email).toLowerCase(), phone: data.phone || null } : null
  } catch { return null }
}

// ── Colvy's own CRM ────────────────────────────────────────────────────────

const SIGNUP_TAGS = ['signup-abandoned', 'signup-completed', 'signup-spam']
let workspaceCache: { at: number; co: LeadWorkspace | null } | null = null
/** Re-read at least this often, so a change made on another server shows within a minute. */
const WORKSPACE_TTL_MS = 60_000

/** platform_settings key for "Where should sign-up leads go?" (super admin → Signups). */
export const LEAD_WORKSPACE_SETTING = 'signup_lead_workspace'

export type LeadWorkspace = { id: string; name: string; slug: string; source: 'env' | 'setting' | 'fallback' }

/** The company id the super admin picked in Signups, or null (none, or V220 not run). */
export async function leadWorkspaceSetting(db: any): Promise<string | null> {
  try {
    const { data, error } = await db.from('platform_settings').select('value').eq('key', LEAD_WORKSPACE_SETTING).maybeSingle()
    if (error) return null
    const id = data?.value?.company_id
    return typeof id === 'string' && /^[\w-]{1,64}$/.test(id) ? id : null
  } catch { return null }
}

/** Save (or clear, with null) the picked workspace. Server only: platform_settings writes need the service role or the super admin. */
export async function setLeadWorkspaceSetting(db: any, companyId: string | null, by: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = companyId
      ? await db.from('platform_settings').upsert({ key: LEAD_WORKSPACE_SETTING, value: { company_id: companyId }, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      : await db.from('platform_settings').delete().eq('key', LEAD_WORKSPACE_SETTING)
    resetColvyWorkspaceCache()
    if (error) return { ok: false, error: missingTable(error) ? 'Platform settings aren’t set up yet (run COLVY_V220_PLATFORM_SETTINGS.sql).' : error.message }
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message || 'Could not save' } }
}

/** Is the platform admin this company's owner, or one of its joined staff (not a board visitor)? */
export async function platformAdminIn(db: any, co: { id: string; owner_id?: string | null }): Promise<boolean> {
  const isAdmin = async (userId: string | null | undefined) => {
    if (!userId) return false
    try { const { data } = await db.auth.admin.getUserById(userId); return String(data?.user?.email || '').toLowerCase() === SUPER_ADMIN } catch { return false }
  }
  if (await isAdmin(co.owner_id)) return true
  try {
    const { data } = await db.from('team_members').select('user_id, email, role, status').eq('company_id', co.id).limit(50)
    // A joined staff member: an invite that wasn't accepted doesn't count.
    const joined = (data || []).filter((m: any) => isStaffRow(m) && m.user_id && !/^(invited|pending)$/i.test(String(m.status || '')))
    for (const m of joined.slice(0, 20)) if (await isAdmin(m.user_id)) return true
  } catch {}
  return false
}

/**
 * Colvy's own workspace: where sign-up leads go and follow-up emails are sent
 * from. In order:
 *   1. COLVY_WORKSPACE_ID in the environment (always wins when set and found);
 *   2. the company picked in super admin → Signups ("Where should sign-up
 *      leads go?"), saved in platform_settings, while the platform admin is
 *      its owner or one of its staff (checked again on every read, so a row
 *      written some other way can't send leads to a stranger's workspace);
 *   3. the company with slug 'colvy' (or COLVY_WORKSPACE_SLUG), only when the
 *      platform admin is its owner or one of its staff, so a business that
 *      somehow took the slug never receives sign-ups.
 * Null when none applies: the Signups page then asks the admin to choose.
 */
export async function colvyWorkspace(db: any): Promise<LeadWorkspace | null> {
  if (workspaceCache && Date.now() - workspaceCache.at < WORKSPACE_TTL_MS) return workspaceCache.co
  let co: LeadWorkspace | null = null
  const byId = async (id: string) => {
    const { data } = await db.from('companies').select('id, name, slug, owner_id').eq('id', id).maybeSingle()
    return data || null
  }
  try {
    const pinned = (process.env.COLVY_WORKSPACE_ID || '').trim()
    const picked = pinned ? null : await leadWorkspaceSetting(db)
    if (pinned) {
      const c = await byId(pinned)
      if (c) co = { id: c.id, name: c.name, slug: c.slug, source: 'env' }
      else console.warn('[signup-attempts] COLVY_WORKSPACE_ID doesn’t match a company')
    } else if (picked) {
      const c = await byId(picked)
      if (c && (await platformAdminIn(db, c))) co = { id: c.id, name: c.name, slug: c.slug, source: 'setting' }
      else if (c) console.warn('[signup-attempts] the picked lead workspace has no platform admin as owner or staff: ignored')
    }
    if (!co && !pinned) {
      const { data } = await db.from('companies').select('id, name, slug, owner_id').eq('slug', process.env.COLVY_WORKSPACE_SLUG || 'colvy').maybeSingle()
      if (data && (await platformAdminIn(db, data))) co = { id: data.id, name: data.name, slug: data.slug, source: 'fallback' }
      else if (data) console.warn('[signup-attempts] the colvy workspace has no platform admin as owner or staff: choose one in super admin → Signups')
    }
  } catch { co = null }
  workspaceCache = { at: Date.now(), co }
  return co
}
export function resetColvyWorkspaceCache() { workspaceCache = null }

const statusTag = (row: any) => row.spam_at ? 'signup-spam' : row.account_created_at ? 'signup-completed' : 'signup-abandoned'
const likeExact = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c)

/** The contact note a sign-up writes: who they are and how far they got. Starts with SIGNUP_NOTE_PREFIX. */
const SIGNUP_NOTE_PREFIX = 'Signup lead:'
const OLD_SIGNUP_NOTE = /^Started a Colvy sign-up/
/** The business number as E.164. Often a landline, so the general AU rules (lib/phone), not the mobile ones; anything odd as typed. */
export function businessPhoneE164(raw: any): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  return /^\+?[\d\s().-]{6,20}$/.test(t) ? toE164(t) : t.slice(0, 40)
}
const HOURS_FROM: Record<string, string> = { google: ' (from Google)', default: ' (Colvy’s default, not changed)', manual: ' (set by them)' }
/**
 * The automatic "Signup lead:" note: the step reached, then everything Colvy
 * learnt about the business that has no contact column (industry, Google
 * category and place, website, business phone, time zone, opening hours),
 * the business address, and the mobile.
 */
export function signupNote(row: any): string {
  const st = stepReached(row)
  const where = st.step >= 8 ? 'finished signing up (account created)' : `reached step ${st.step} of 7 (${st.label})`
  const phone = signupPhoneE164(row.phone)
  const b = presentBusiness(row)
  const bizPhone = businessPhoneE164(b.phone)
  const facts = [
    b.name ? `Business: ${b.name}${b.boardUrl ? ` (${b.boardUrl})` : ''}` : '',
    b.industry ? `Industry: ${b.industry}` : '',
    b.category ? `Google category: ${b.category}` : '',
    b.addressLines.length ? `Address: ${b.addressLines.join(', ')}` : '',
    b.verified ? `Verified via Google${b.placeId ? ` (place ID ${b.placeId})` : ''}` : '',
    b.mapsUrl ? `Google Maps: ${b.mapsUrl}` : '',
    b.website ? `Website: ${String(b.website).slice(0, 200)}` : '',
    bizPhone ? `Business phone: ${bizPhone}` : '',
    b.abn ? `ABN: ${b.abn}` : '',
    b.timezone ? `Time zone: ${b.timezone}` : '',
    ...(b.hoursGrouped.length ? [`Opening hours${HOURS_FROM[b.hoursSource || ''] || ''}:`, ...b.hoursGrouped.map(g => `- ${g.days}: ${g.text}`)] : []),
    phone ? `Mobile: ${phone} (${row.mobile_verified_at || row.account_created_at ? 'verified' : 'not verified'})` : '',
  ].filter(Boolean)
  return [
    `${SIGNUP_NOTE_PREFIX} ${where}.`,
    ...facts,
    'Transactional follow-up only: no marketing consent given (an unverified sign-up mobile is no SMS opt-in).',
  ].join('\n')
}

const sameWords = (a: any, b: any) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

// Lines of the automatic note that only the business block (V392) can
// rebuild: the V390 columns have no hours, Google place or street.
const RICH_NOTE_LINE = /^(Opening hours|Google category: |Google Maps: |Verified via Google)/m
/**
 * The automatic note, refreshed. Normally rebuilt whole (signupNote). But a
 * row with no business block (before V392, where only the request carrying
 * the details had them) can't rebuild the hours, Google place and street the
 * note already holds, so then only the step reached and the mobile line are
 * brought up to date and the rest is kept (an admin action or the CRM
 * backfill would otherwise strip them for good).
 */
function refreshedNote(old: string, row: any): string {
  const fresh = signupNote(row)
  const block = row?.business && typeof row.business === 'object' && !Array.isArray(row.business)
  if (block || !old.startsWith(SIGNUP_NOTE_PREFIX) || !RICH_NOTE_LINE.test(old)) return fresh
  const f = fresh.split('\n')
  const lines = old.split('\n')
  lines[0] = f[0]
  const mobile = f.find(l => l.startsWith('Mobile: '))
  if (mobile) {
    const i = lines.findIndex(l => l.startsWith('Mobile: '))
    if (i >= 0) lines[i] = mobile
    else {
      const t = lines.findIndex(l => l.startsWith('Transactional follow-up only'))
      lines.splice(t >= 0 ? t : lines.length, 0, mobile)
    }
  }
  return lines.join('\n')
}

/**
 * Add (or update) the person as a contact in Colvy's workspace, tagged with
 * how their sign-up went, so the owner can follow up from the normal inbox.
 *
 * Copied onto the contact (blank fields only, never overwriting): name, the
 * mobile they typed in E.164 (verified or not: it's what the owner calls them
 * back on), business name (company_name), the business's street address,
 * suburb, state and postcode (as one, only where the contact's own parts
 * match it), country, and a "Signup lead:" note with the
 * step reached and everything contacts have no column for: industry, Google
 * category and place, website, business phone, time zone and opening hours
 * (signupNote). The note is refreshed only while it's still the one this wrote.
 *
 * Matching is stricter than filling, since what they typed isn't proven:
 * before the email code is entered only a contact this sign-up flow made can
 * be matched by email (an existing customer's contact is left alone), and the
 * mobile is only used to MATCH an existing contact once it's verified.
 * Suspicious attempts stay out until an admin looks (`force`: the admin asked).
 *
 * Consent (lib/sms-consent): a new contact is saved with no marketing consent
 * (subscribed_to_marketing false, consent_basis 'none'); an existing
 * contact's consent is never touched. An unverified mobile is no opt-in.
 */
export async function syncSignupContact(db: any, row: any, o: { force?: boolean } = {}): Promise<string | null> {
  try {
    const email = cleanEmail(row?.email)
    if (!email) return null
    if ((row.risk_score || 0) >= SUSPICIOUS_SCORE && !row.account_created_at && !row.contact_id && !o.force) return null
    const co = await colvyWorkspace(db)
    if (!co) return null
    const emailOk = !!(row.email_verified_at || row.account_created_at)
    const phone = signupPhoneE164(row.phone)
    const mobileOk = !!(row.mobile_verified_at || row.account_created_at) && !!phone
    const cols = 'id, name, email, phone, tags, source, company_name, address, city, state, postcode, country, notes'

    let c: any = null
    if (row.contact_id) {
      const { data } = await db.from('contacts').select(cols).eq('id', row.contact_id).eq('company_id', co.id).maybeSingle()
      c = data || null
    }
    if (!c) {
      const { data } = await db.from('contacts').select(cols).eq('company_id', co.id).ilike('email', likeExact(email)).limit(5)
      const hits = (data || []).filter((x: any) => String(x.email || '').toLowerCase() === email)
      c = hits.find((x: any) => x.source === 'signup') || (emailOk ? hits[0] : null) || null
      if (!c && hits.length) return null            // a customer already has this email: wait until it's verified
    }
    if (!c && mobileOk) {
      const hit = await findContactByPhone(db, co.id, phone!)
      if (hit) { const { data } = await db.from('contacts').select(cols).eq('id', hit.id).maybeSingle(); c = data || null }
    }
    if (!c) {
      const base = { company_id: co.id, name: row.name || null, email, phone, source: 'signup', tags: ['signup', statusTag(row)] }
      const tries = [
        { ...base, subscribed_to_marketing: false, consent_basis: 'none', consent_source: 'Colvy sign-up (no marketing consent)' },
        { ...base, subscribed_to_marketing: false },
        base,
        { ...base, phone: null },                     // the number is somehow refused: still add them
      ]
      for (const t of tries) {
        const ins = await db.from('contacts').insert(t).select(cols).maybeSingle()
        if (!ins.error && ins.data) { c = ins.data; break }
      }
      if (!c) return null
    }

    const tags = (Array.isArray(c.tags) ? c.tags : []).filter((t: string) => !SIGNUP_TAGS.includes(t))
    const patch: any = { tags: Array.from(new Set([...tags, 'signup', statusTag(row)])) }
    if (!c.name && row.name) patch.name = row.name
    if (!c.email) patch.email = email
    const phonePatch: any = !c.phone && phone ? { phone } : {}
    const extra: any = {}
    const b = presentBusiness(row)
    const addr = b.address || {}
    if (!c.company_name && b.name) extra.company_name = b.name
    // The address goes on as one, never as parts of two: only when each part
    // the contact already has (street, suburb, state, postcode) is the same
    // as this address's, so the blanks are filled from one address (a contact
    // whose suburb and state came from this sign-up still gets the street and
    // postcode). A suburb that's only the sign-up IP's stand-in, on a contact
    // this flow made, gives way: to the address's suburb, or to none when no
    // suburb could be picked out (the street line then holds it), so the IP's
    // city never sits next to another place's street. Otherwise the address
    // stays in the note. With no suburb picked out, the street column takes
    // the whole line they typed, so nothing is lost.
    const typed = row?.business?.address?.formatted
    const street = addr.line1 || (!addr.city && typed ? String(typed).slice(0, 300) : '')
    const given = !!(street || addr.city || addr.state || addr.postcode)
    if (given) {
      const agrees = (have: any, want: any) => !have || sameWords(have, want)
      // On anyone else's contact a city that happens to match the IP's may be their own.
      const standIn = c.source === 'signup' && sameWords(c.city, row.ip_city) && !sameWords(c.city, addr.city)
      if (agrees(c.address, street) && agrees(c.state, addr.state) && agrees(c.postcode, addr.postcode) && (standIn || agrees(c.city, addr.city))) {
        if (street && !c.address) extra.address = street
        if (standIn) extra.city = addr.city || null
        else if (addr.city && !c.city) extra.city = addr.city
        if (addr.state && !c.state) extra.state = addr.state
        if (addr.postcode && !c.postcode) extra.postcode = addr.postcode
      }
    } else if (c.source === 'signup' && !c.city && !c.address && !c.state && !c.postcode && row.ip_city) {
      // Where they connected from stands in when no address was given: only
      // on a contact this flow made (where it can later give way, above) and
      // with no address of its own, so it never sits beside another place's
      // street, state or postcode.
      extra.city = row.ip_city
    }
    if (!c.country && addr.country) extra.country = addr.country
    const notes = String(c.notes || '')
    if (!notes.trim() || notes.startsWith(SIGNUP_NOTE_PREFIX) || OLD_SIGNUP_NOTE.test(notes)) {
      const next = refreshedNote(notes, row)
      if (next !== notes) extra.notes = next
    }
    // Older databases may lack a column, and a phone can be refused: fall
    // back step by step so the tags (and the number) still land.
    for (const p of [{ ...patch, ...phonePatch, ...extra }, { ...patch, ...extra }, { ...patch, ...phonePatch }, patch]) {
      const { error } = await db.from('contacts').update(p).eq('id', c.id)
      if (!error) break
    }
    return c.id
  } catch (e: any) {
    console.warn('[signup-attempts] contact sync failed:', e?.message || e)
    return null
  }
}

// Anything that hangs off a contact: if one of these has it, it's a customer
// record now, not just a sign-up lead.
const CONTACT_LINKS = ['conversations', 'orders', 'bookings', 'support_tickets', 'stock_waitlist', 'calls', 'scheduled_messages', 'review_requests', 'conversation_sales', 'customer_memory', 'calendar_events', 'short_links']

async function contactInUse(db: any, companyId: string, contactId: string): Promise<boolean> {
  for (const table of CONTACT_LINKS) {
    try {
      const { data, error } = await db.from(table).select('id').eq('contact_id', contactId).limit(1)
      if (error) { if (missingTable(error)) continue; return true }   // can't tell: keep it
      if ((data || []).length) return true
    } catch { return true }
  }
  return false
}

/**
 * Take a deleted sign-up out of the CRM. The contact is deleted only when this
 * sign-up made it (source 'signup'), no other sign-up uses it, it isn't a
 * finished sign-up, and nothing links to it (conversations, orders, bookings…).
 * Otherwise only the sign-up tags come off, and only if no other sign-up uses it.
 */
export async function removeSignupContact(db: any, row: any): Promise<'deleted' | 'untagged' | 'kept' | 'none'> {
  try {
    if (!row?.contact_id) return 'none'
    const co = await colvyWorkspace(db)
    if (!co) return 'none'
    const { data: c } = await db.from('contacts').select('id, source, tags').eq('id', row.contact_id).eq('company_id', co.id).maybeSingle()
    if (!c) return 'none'
    const { data: others, error: oErr } = await db.from(TABLE).select('id').eq('contact_id', c.id).neq('id', row.id).limit(1)
    if (oErr || (others || []).length) return 'kept'
    const tags: string[] = Array.isArray(c.tags) ? c.tags : []
    if (c.source === 'signup' && !tags.includes('signup-completed') && !(await contactInUse(db, co.id, c.id))) {
      const { error } = await db.from('contacts').delete().eq('id', c.id).eq('company_id', co.id)
      if (!error) return 'deleted'
    }
    await db.from('contacts').update({ tags: tags.filter(t => t !== 'signup' && !SIGNUP_TAGS.includes(t)) }).eq('id', c.id)
    return 'untagged'
  } catch { return 'none' }
}

// ── Delivery reports and SMS health ───────────────────────────────────────

/**
 * Add Twilio's delivery report for a sign-up code (a text, or a "call me with
 * the code" call) to the attempt's timeline. Only final answers are recorded
 * (SMS: delivered / undelivered / failed; calls: completed / busy / no-answer
 * / failed / canceled), each once. It isn't the person's activity, so the
 * activity time, risk and request details are left alone.
 *
 * `requireKnownSid`: only record when the timeline already has the send with
 * this SID ('unknown_sid' otherwise), so the caller can wait for the send to
 * be recorded first; the last try records regardless.
 */
export async function recordDelivery(db: any, o: { email: string; sid: string; channel: 'sms' | 'voice'; status: string; errorCode?: string | null; requireKnownSid?: boolean; now?: number; via?: 'callback' | 'lookup' }): Promise<'recorded' | 'duplicate' | 'ignored' | 'unknown_sid' | 'no_row' | 'missing'> {
  try {
    const status = String(o.status || '').toLowerCase()
    const sid = String(o.sid || '').slice(0, 64)
    if (!sid || !TERMINAL_STATUSES[o.channel].includes(status)) return 'ignored'
    const email = cleanEmail(o.email)
    if (!email) return 'ignored'
    // Written over the version read (updated_at), retried on a clash, so a
    // step saved at the same moment can't drop the report (or be dropped).
    for (let i = 0; i < 5; i++) {
      const { data: row, error } = await db.from(TABLE).select('id, events, updated_at').eq('email', email).maybeSingle()
      if (error) { if (missingTable(error)) { warnMissing(); return 'missing' } return 'ignored' }
      if (!row) return 'no_row'
      const evs: any[] = Array.isArray(row.events) ? row.events : []
      if (evs.some(e => e?.type === 'delivery' && e.sid === sid && e.status === status)) return 'duplicate'
      const known = evs.some(e => e?.sms_sid === sid || e?.call_sid === sid)
      if (!known && o.requireKnownSid) return 'unknown_sid'
      const at = iso(o.now ?? Date.now())
      const code = o.errorCode ? String(o.errorCode).replace(/[^\w-]/g, '').slice(0, 16) : ''
      const event: any = { at, type: 'delivery', channel: o.channel, sid, status }
      if (code) event.error_code = code
      if (o.via === 'lookup') event.via = 'lookup'
      const { data: upd, error: uErr } = await sameVersion(db.from(TABLE).update({ events: capEvents([...evs, event]), updated_at: at }).eq('id', row.id), row.updated_at).select('id')
      if (uErr) return 'ignored'
      if ((upd || []).length) return 'recorded'
    }
    return 'ignored'
  } catch { return 'ignored' }
}

/**
 * sent = delivered + notDelivered + waiting + noReport + untracked.
 * noReport: has Twilio's ID but no report came back; untracked: sent before
 * IDs were kept. lookedUp: reports fetched by "Check with Twilio" because the
 * status callback never arrived (a sign the callback isn't reaching Colvy).
 */
type SmsBucket = { sent: number; delivered: number; notDelivered: number; waiting: number; noReport: number; untracked: number; lookedUp: number; calls: number; callsAnswered: number }
const smsBucket = (): SmsBucket => ({ sent: 0, delivered: 0, notDelivered: 0, waiting: 0, noReport: 0, untracked: 0, lookedUp: 0, calls: 0, callsAnswered: 0 })

/**
 * Sign-up code texts and calls in the last 24 hours and 7 days: how many were
 * sent, delivered, not delivered (refused outright or reported undelivered),
 * still waiting, or never reported; plus the most common error codes.
 */
type CapStatus = Awaited<ReturnType<typeof globalCapStatus>>
export async function signupSmsHealth(db: any, now = Date.now()): Promise<{ day: SmsBucket; week: SmsBucket; topErrors: { code: string | null; label: string; explain: string; count: number }[]; missing: boolean; caps: CapStatus }> {
  const caps = await globalCapStatus(db, now)
  const day = smsBucket(), week = smsBucket()
  const errors = new Map<string, { code: string | null; label: string; explain: string; count: number }>()
  const weekAgo = now - 7 * 864e5, dayAgo = now - 864e5
  try {
    const { data, error } = await db.from(TABLE).select('events, last_code_at').gte('last_code_at', iso(weekAgo)).limit(2000)
    if (error) return { day, week, topErrors: [], missing: missingTable(error), caps }
    for (const row of data || []) {
      for (const s of deliveryOf(row, now).sends) {
        const t = ms(s.at)
        if (t < weekAgo) continue
        for (const b of t >= dayAgo ? [day, week] : [week]) {
          if (s.channel === 'voice') { b.calls++; if (s.state === 'answered') b.callsAnswered++; continue }
          b.sent++
          if (s.via === 'lookup') b.lookedUp++
          if (s.state === 'delivered') b.delivered++
          else if (deliveryProblem(s.state)) b.notDelivered++
          else if (s.state === 'sending') b.waiting++
          else if (s.state === 'untracked') b.untracked++
          else b.noReport++
        }
        if (deliveryProblem(s.state)) {
          const e = explainDeliveryError(s.code)
          const k = s.code || 'none'
          const cur = errors.get(k) || { code: s.code, label: s.code ? e.label : 'not sent, reason not recorded', explain: s.code ? e.explain : 'Sent before reasons were recorded. Usually no sender was configured.', count: 0 }
          cur.count++
          errors.set(k, cur)
        }
      }
    }
  } catch { return { day, week, topErrors: [], missing: true, caps } }
  return { day, week, topErrors: Array.from(errors.values()).sort((a, b) => b.count - a.count).slice(0, 4), missing: false, caps }
}

/** Twilio's current status for a sent text or call (lib/signup-sms), or null when it can't be read. */
export type TwilioStatusLookup = (sid: string, channel: 'sms' | 'voice') => Promise<{ status: string | null; errorCode: string | null } | null>
export const RECONCILE_MAX = 25

/**
 * "Check with Twilio" (super admin → Signup SMS health): for codes sent in
 * the last 7 days that have Twilio's ID but no delivery report after a few
 * minutes, ask Twilio what happened and put the answer on the timeline
 * (marked as looked up, so it's clear the status callback didn't bring it).
 * At most RECONCILE_MAX lookups a run; texts sent before IDs were kept can't
 * be looked up.
 */
export async function reconcileDeliveries(db: any, lookup: TwilioStatusLookup, now = Date.now()): Promise<{ ok: boolean; checked: number; recorded: number; stillPending: number; untracked: number; failed: number; more: boolean; missing?: boolean }> {
  const out = { ok: true, checked: 0, recorded: 0, stillPending: 0, untracked: 0, failed: 0, more: false }
  try {
    const { data, error } = await db.from(TABLE).select('email, events, last_code_at').gte('last_code_at', iso(now - 7 * 864e5)).limit(2000)
    if (error) return { ...out, ok: false, missing: missingTable(error) }
    const due: { email: string; sid: string; channel: 'sms' | 'voice' }[] = []
    for (const row of data || []) {
      for (const s of deliveryOf(row, now).sends) {
        if (ms(s.at) < now - 7 * 864e5) continue
        if (s.state === 'untracked') { out.untracked++; continue }
        if (!s.sid || !(s.state === 'no_report' || (s.state === 'sending' && now - ms(s.at) > 3 * 60_000))) continue
        due.push({ email: row.email, sid: s.sid, channel: s.channel })
      }
    }
    out.more = due.length > RECONCILE_MAX
    for (const d of due.slice(0, RECONCILE_MAX)) {
      out.checked++
      const st = await lookup(d.sid, d.channel).catch(() => null)
      if (!st || !st.status) { out.failed++; continue }
      const status = String(st.status).toLowerCase()
      if (!TERMINAL_STATUSES[d.channel].includes(status)) { out.stillPending++; continue }
      const r = await recordDelivery(db, { email: d.email, sid: d.sid, channel: d.channel, status, errorCode: st.errorCode, via: 'lookup', now })
      if (r === 'recorded' || r === 'duplicate') out.recorded++
      else out.failed++
    }
    return out
  } catch { return { ...out, ok: false } }
}

// ── Adding existing sign-ups to the CRM ────────────────────────────────────

/**
 * "Add all to CRM" (super admin → Signups): run every existing sign-up that
 * isn't suspicious or marked spam through the same syncSignupContact rules
 * new sign-ups use (exact email match, the mobile only once verified, no
 * marketing consent). Safe to run again: a sign-up already linked to a contact
 * updates that contact, and one found by email is reused, so nobody is added
 * twice. dryRun only counts.
 */
export const BACKFILL_BATCH = 100
export async function backfillSignupContacts(db: any, o: { dryRun: boolean; offset?: number; batch?: number }): Promise<{
  ok: boolean; error?: string; workspace?: LeadWorkspace | null
  total: number; eligible: number; toAdd: number; alreadyLinked: number; skippedSpam: number; skippedSuspicious: number
  added?: number; refreshed?: number; skipped?: number
  /** For a run: where the next batch starts, and whether this was the last one. */
  nextOffset?: number; done?: boolean
}> {
  const blank = { total: 0, eligible: 0, toAdd: 0, alreadyLinked: 0, skippedSpam: 0, skippedSuspicious: 0 }
  const co = await colvyWorkspace(db)
  if (!co) return { ok: false, error: 'Choose where sign-up leads should go first.', workspace: null, ...blank }
  const { data, error } = await db.from(TABLE).select('*').order('first_seen_at', { ascending: true }).order('id', { ascending: true }).limit(2000)
  if (error) return { ok: false, error: missingTable(error) ? 'Run COLVY_V390_SIGNUP_ATTEMPTS.sql first: sign-ups recorded before it only live in the verification records.' : error.message, workspace: co, ...blank }
  const rows: any[] = data || []
  const spam = rows.filter(r => r.spam_at)
  const suspicious = rows.filter(r => !r.spam_at && (r.risk_score || 0) >= SUSPICIOUS_SCORE)
  const eligible = rows.filter(r => !r.spam_at && (r.risk_score || 0) < SUSPICIOUS_SCORE)
  const counts = {
    total: rows.length, eligible: eligible.length, skippedSpam: spam.length, skippedSuspicious: suspicious.length,
    toAdd: eligible.filter(r => !r.contact_id).length, alreadyLinked: eligible.filter(r => r.contact_id).length,
  }
  if (o.dryRun) return { ok: true, workspace: co, ...counts }
  // One batch per request (the page calls again with nextOffset), so a long
  // list never outlives the request.
  const start = Math.max(0, o.offset || 0)
  const end = Math.min(eligible.length, start + (o.batch || BACKFILL_BATCH))
  let added = 0, refreshed = 0, skipped = 0
  const at = iso(Date.now())
  for (const r of eligible.slice(start, end)) {
    const id = await syncSignupContact(db, r)
    if (!id) { skipped++; continue }
    if (id === r.contact_id) { refreshed++; continue }
    await db.from(TABLE).update({ contact_id: id, contact_synced_at: at }).eq('id', r.id)
    added++
  }
  return { ok: true, workspace: co, ...counts, added, refreshed, skipped, nextOffset: end, done: end >= eligible.length }
}

// ── Admin list ─────────────────────────────────────────────────────────────

export type ListFilter = 'all' | 'abandoned' | 'suspicious' | 'completed' | 'spam'
export type ListRange = 'today' | '7d' | '30d' | 'all'

/** One row as the Signups page shows it. */
export function presentSignup(row: any, now = Date.now()) {
  const status = signupStatus(row, now)
  const risk = assessRisk(row)
  // Numbers saved before normalising ("14387975614", "0466 077 557") show as E.164.
  const phone = signupPhoneE164(row.phone) || row.phone || null
  // Everything about the business (V392's JSON over V390's columns), with the
  // business number in E.164 like the mobile.
  const business = presentBusiness(row)
  const businessPhone = businessPhoneE164(business.phone) || null
  return {
    ...row,
    phone,
    phone_country: row.phone_country || phoneCountry(phone) || null,
    business_phone: businessPhone,
    business: { ...business, phone: businessPhone },
    business_summary: business.summary,
    status,
    step: stepReached(row),
    mobile: deliveryOf(row, now),
    risk: { score: risk.score, level: risk.score >= SUSPICIOUS_SCORE ? 'high' : risk.score > 0 ? 'low' : 'none', reasons: risk.reasons },
  }
}

// Melbourne midnight, for "Today".
function startOfToday(now: number): number {
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map(p => [p.type, p.value]))
  const sinceMidnight = ((Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000
  return now - sinceMidnight - (now % 1000)
}

/** Earlier sign-ups, from the verification rows, for before V390 runs. */
async function legacyRows(db: any, sinceIso: string | null): Promise<any[]> {
  let q = db.from('signup_verifications').select('email, phone, email_verified, sms_verified, attempts, last_sent_at, consumed_at, created_at').order('created_at', { ascending: false }).limit(1000)
  if (sinceIso) q = q.gte('last_sent_at', sinceIso)
  const { data, error } = await q
  if (error) return []
  const by = new Map<string, any>()
  for (const v of data || []) {
    const email = String(v.email || '').toLowerCase()
    if (!email) continue
    const r = by.get(email) || { id: `legacy:${email}`, legacy: true, email, email_domain: emailDomain(email), phone: null, codes_sent: 0, wrong_codes: 0, events: [] as any[] }
    r.phone = r.phone || v.phone || null
    r.codes_sent += 1
    r.wrong_codes += v.attempts || 0
    r.events.push({ at: v.created_at, type: 'code_sent', channel: 'both' })
    if (v.last_sent_at && v.last_sent_at !== v.created_at) r.events.push({ at: v.last_sent_at, type: 'code_sent', detail: 'Latest code for this sign-up (earlier resends aren\'t recorded)' })
    if (v.email_verified) r.email_verified_at = r.email_verified_at || v.last_sent_at
    if (v.sms_verified) r.mobile_verified_at = r.mobile_verified_at || v.last_sent_at
    if (v.consumed_at) { r.account_created_at = v.consumed_at; r.events.push({ at: v.consumed_at, type: 'account_created' }) }
    r.first_seen_at = !r.first_seen_at || v.created_at < r.first_seen_at ? v.created_at : r.first_seen_at
    const last = v.consumed_at || v.last_sent_at || v.created_at
    r.last_activity_at = !r.last_activity_at || last > r.last_activity_at ? last : r.last_activity_at
    by.set(email, r)
  }
  return Array.from(by.values()).map(r => {
    r.events.sort((a: any, b: any) => String(a.at).localeCompare(String(b.at)))
    r.phone_country = phoneCountry(r.phone) || null
    r.stage = stageOf(r)
    const risk = assessRisk(r)
    return { ...r, risk_score: risk.score, risk_reasons: risk.reasons }
  })
}

/** The Signups page: filtered rows, newest activity first, plus counts for the chips. */
export async function listSignups(db: any, o: { filter?: ListFilter; range?: ListRange; q?: string; now?: number } = {}) {
  const now = o.now ?? Date.now()
  const range = o.range || '30d'
  const since = range === 'today' ? startOfToday(now) : range === '7d' ? now - 7 * 864e5 : range === '30d' ? now - 30 * 864e5 : null
  const sinceIso = since ? iso(since) : null
  let source: 'attempts' | 'legacy' = 'attempts'
  let raw: any[] = []
  let q = db.from(TABLE).select('*').order('last_activity_at', { ascending: false }).limit(1000)
  if (sinceIso) q = q.gte('last_activity_at', sinceIso)
  const { data, error } = await q
  if (error) {
    if (!missingTable(error)) throw new Error(error.message)
    source = 'legacy'
    raw = await legacyRows(db, sinceIso)
  } else raw = data || []

  let rows = raw.map(r => presentSignup(r, now))
  const s = String(o.q || '').trim().toLowerCase()
  if (s) rows = rows.filter(r => [r.email, r.name, r.business_name, r.business_slug, r.phone, r.ip, r.ip_city, r.industry, r.business?.category, r.business?.address?.formatted, r.website].some(v => String(v || '').toLowerCase().includes(s)))
  const counts = {
    all: rows.length,
    abandoned: rows.filter(r => r.status === 'abandoned').length,
    suspicious: rows.filter(r => r.risk.level === 'high' && r.status !== 'spam').length,
    completed: rows.filter(r => r.status === 'account_created').length,
    spam: rows.filter(r => r.status === 'spam').length,
  }
  const f = o.filter || 'all'
  if (f === 'abandoned') rows = rows.filter(r => r.status === 'abandoned')
  else if (f === 'suspicious') rows = rows.filter(r => r.risk.level === 'high' && r.status !== 'spam')
  else if (f === 'completed') rows = rows.filter(r => r.status === 'account_created')
  else if (f === 'spam') rows = rows.filter(r => r.status === 'spam')
  rows.sort((a, b) => String(b.last_activity_at || '').localeCompare(String(a.last_activity_at || '')))
  return { rows, counts, source }
}

/** New abandoned and suspicious sign-ups in the last 24 hours, for the overview. */
export async function signupPulse(db: any, now = Date.now()): Promise<{ abandoned24h: number; suspicious24h: number; missing: boolean }> {
  try {
    const { data, error } = await db.from(TABLE).select('id, account_created_at, spam_at, risk_score, last_activity_at').gte('last_activity_at', iso(now - 86_400_000)).limit(1000)
    if (error) return { abandoned24h: 0, suspicious24h: 0, missing: missingTable(error) }
    const open = (data || []).filter((r: any) => !r.account_created_at && !r.spam_at)
    return {
      abandoned24h: open.filter((r: any) => now - ms(r.last_activity_at) > ABANDONED_AFTER_MS).length,
      suspicious24h: open.filter((r: any) => (r.risk_score || 0) >= SUSPICIOUS_SCORE).length,
      missing: false,
    }
  } catch { return { abandoned24h: 0, suspicious24h: 0, missing: true } }
}

// ── Retention ──────────────────────────────────────────────────────────────

/**
 * Delete abandoned sign-ups that weren't suspicious or marked spam once
 * they've been quiet for RETENTION_DAYS (and the contacts only they made, if
 * nothing links to them: see removeSignupContact), plus sign-up verification
 * rows that old and expired rate-limit counters.
 */
export async function pruneSignupAttempts(db: any, now = Date.now()): Promise<{ deleted: number; contacts: number; verifications: number; missing: boolean }> {
  const cutoff = iso(now - RETENTION_DAYS * 864e5)
  const out = { deleted: 0, contacts: 0, verifications: 0, missing: false }
  const { data, error } = await db.from(TABLE).select('id, contact_id, risk_score, spam_at, account_created_at, last_activity_at')
    .is('account_created_at', null).is('spam_at', null).lt('last_activity_at', cutoff).limit(2000)
  if (error) { out.missing = missingTable(error); if (!out.missing) throw new Error(error.message) }
  const due = (data || []).filter((r: any) => (r.risk_score || 0) < SUSPICIOUS_SCORE)
  for (const r of due) {
    if (r.contact_id && (await removeSignupContact(db, r)) === 'deleted') out.contacts++
    const { error: dErr } = await db.from(TABLE).delete().eq('id', r.id)
    if (!dErr) out.deleted++
  }
  try {
    const { data: gone } = await db.from('signup_verifications').delete().lt('created_at', cutoff).select('id')
    out.verifications = (gone || []).length
  } catch {}
  // Rate-limit counters only matter for their hour.
  try { await db.from('signup_rate_windows').delete().lt('window_start', iso(now - 2 * 864e5)) } catch {}
  return out
}
