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
// are never stored here.
//
// Everything is best-effort: before V390 runs (or if a write fails) sign-up
// carries on exactly as before.

import { after } from 'next/server'
import { checkBurst } from '@/lib/rate-limit'
import { parseUserAgent } from '@/lib/link-tracking'
import { findContactByPhone } from '@/lib/contact-capture'
import { emailDomain, isDisposableEmail } from '@/lib/disposable-email'
import { SUPER_ADMIN } from '@/app/api/platform-admin/_lib/super-admin'

export const TABLE = 'signup_attempts'
/** No activity for this long and no account: abandoned. Codes expire after 10 minutes. */
export const ABANDONED_AFTER_MS = 30 * 60_000
/** Abandoned, not suspicious, not marked spam: deleted after this many days. */
export const RETENTION_DAYS = 180
/** Risk score at or above this reads "Suspicious". */
export const SUSPICIOUS_SCORE = 3
/** perEmailHour is per channel (email codes and SMS codes counted separately). */
export const OTP_LIMITS = { perEmailHour: 8, perIpHour: 15, emailsPerIpHour: 5, perEmailMinute: 3, perIpMinute: 6 }
const MAX_EVENTS = 100

export type SignupEventType =
  | 'code_sent' | 'send_failed' | 'rate_limited' | 'wrong_code'
  | 'email_verified' | 'mobile_verified' | 'account_created' | 'complete_failed'
  | 'marked_spam' | 'unmarked_spam' | 'emailed'

export type SignupStatus = 'code_sent' | 'verified' | 'account_created' | 'abandoned' | 'spam'

export type SignupProfile = {
  fullName?: string; businessName?: string; businessSlug?: string; industry?: string; website?: string
  businessPhone?: string; businessCity?: string; businessState?: string; businessCountry?: string
}
export type SignupAttribution = {
  utm?: Record<string, string>; referrer?: string; landing?: string; plan?: string; ref?: string
}

type HeaderBag = { get(name: string): string | null }

const missingTable = (e: any) =>
  /^(42P01|PGRST205|42703|PGRST204)$/.test(String(e?.code || '')) || /does not exist|could not find|schema cache/i.test(String(e?.message || e || ''))
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

/** What the wizard knew about them when it asked for codes. */
export function cleanProfile(raw: any): SignupProfile {
  if (!raw || typeof raw !== 'object') return {}
  const out: SignupProfile = {
    fullName: str(raw.fullName, 120), businessName: str(raw.businessName, 160), businessSlug: str(raw.businessSlug, 60)?.toLowerCase(),
    industry: str(raw.industry, 60), website: str(raw.website, 200), businessPhone: str(raw.businessPhone, 40),
    businessCity: str(raw.businessCity, 80), businessState: str(raw.businessState, 60), businessCountry: str(raw.businessCountry, 60),
  }
  for (const k of Object.keys(out) as (keyof SignupProfile)[]) if (out[k] === undefined) delete out[k]
  return out
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
const hourly = new Map<string, { start: number; hits: number }>()
const tooManyEmail = { ok: false, reason: 'email' as const, message: 'Too many codes have been sent to this email. Please wait an hour and try again, or email support@colvy.com.' }
const tooManyIp = { ok: false, reason: 'ip' as const, message: 'Too many sign-up codes have been requested from this network. Please try again in an hour.' }
const waitAMinute = (reason: 'email' | 'ip') => ({ ok: false, reason, message: 'Please wait a minute before asking for another code.' })

/** Per-instance stand-in for signup_rate_claim() before V390: same keys and limits, not shared between servers. */
function claimInMemory(keys: string[], limits: number[], now: number): string | null {
  for (let i = 0; i < keys.length; i++) {
    const w = hourly.get(keys[i])
    if (w && now - w.start < RATE_WINDOW_SECS * 1000 && w.hits + 1 > limits[i]) return keys[i]
  }
  for (const k of keys) {
    const w = hourly.get(k)
    if (!w || now - w.start >= RATE_WINDOW_SECS * 1000) hourly.set(k, { start: now, hits: 1 })
    else w.hits++
  }
  return null
}

/**
 * Claim one code send for this email (per channel) and IP, or say why not.
 * Call it only once the request has passed Cloudflare Turnstile (fresh sign-ups)
 * or the token checks (resends), and the email isn't already registered, so
 * refused bots and existing accounts don't use up a real person's budget.
 *
 *   • per minute, in memory: 3 per email, 6 per IP;
 *   • per hour: 8 email codes and 8 SMS codes per email, 15 requests per IP,
 *     counted atomically by signup_rate_claim() (V390), which locks and bumps
 *     its counters in one statement, so neither a burst of parallel requests
 *     nor a long timeline can get round it. Before V390: the same limits per
 *     server instance, plus fresh sign-ups per email from signup_verifications;
 *   • 5 different emails per IP an hour, from the recorded attempts.
 */
export async function claimOtpSend(db: any, o: { email: string; ip?: string | null; channel?: 'both' | 'email' | 'sms'; now?: number }): Promise<{ ok: boolean; reason?: 'email' | 'ip'; message?: string }> {
  const now = o.now ?? Date.now()
  const email = String(o.email || '').toLowerCase()
  const ip = o.ip || null
  const channel = o.channel || 'both'
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
  if (channel !== 'sms') { keys.push(`e:${email}:email`); limits.push(OTP_LIMITS.perEmailHour) }
  if (channel !== 'email') { keys.push(`e:${email}:sms`); limits.push(OTP_LIMITS.perEmailHour) }
  if (ip) { keys.push(`ip:${ip}`); limits.push(OTP_LIMITS.perIpHour) }
  let over: string | null = null
  let claimed = false
  try {
    const { data, error } = await db.rpc('signup_rate_claim', { p_keys: keys, p_limits: limits, p_window_secs: RATE_WINDOW_SECS })
    if (!error) { claimed = true; over = data || null }
    else if (!missingTable(error) && !/function|signup_rate_claim/i.test(String(error.message || ''))) claimed = true   // can't tell: don't block a real person
  } catch {}
  if (!claimed) {
    over = claimInMemory(keys, limits, now)
    if (!over) {
      try {
        const { count } = await db.from('signup_verifications').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', hourAgo)
        if ((count || 0) >= OTP_LIMITS.perEmailHour) over = `e:${email}:email`
      } catch {}
    }
  }
  if (over) return over.startsWith('ip:') ? tooManyIp : tooManyEmail
  return { ok: true }
}

// ── Recording ──────────────────────────────────────────────────────────────

export type RequestMeta = ReturnType<typeof requestMeta>
export type SignupEvent = {
  type: SignupEventType
  email: string
  channel?: 'email' | 'sms' | 'both'
  detail?: string
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
export async function recordSignupEvent(db: any, ev: SignupEvent): Promise<any | null> {
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

    const p = ev.profile || {}
    const set = (col: string, v: any) => { if (v !== undefined && v !== null && v !== '') row[col] = v }
    set('name', p.fullName); set('business_name', p.businessName); set('business_slug', p.businessSlug); set('industry', p.industry)
    set('website', p.website); set('business_phone', p.businessPhone); set('business_city', p.businessCity)
    set('business_state', p.businessState); set('business_country', p.businessCountry)
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

    const saved = existing
      ? await db.from(TABLE).update(row).eq('id', existing.id).select('*').maybeSingle()
      : await db.from(TABLE).insert(row).select('*').maybeSingle()
    if (saved.error) {
      // Two first sends at the same moment: the other insert won, add to it.
      if (!existing && /duplicate|23505/i.test(`${saved.error.code} ${saved.error.message}`)) return recordSignupEvent(db, ev)
      console.warn('[signup-attempts] save failed:', saved.error.message)
      return null
    }
    const out = saved.data || { ...row, id: existing?.id }

    // Into Colvy's own CRM: when they first get a code, as each channel is
    // verified, and when they finish.
    if ((ev.type === 'code_sent' && !out.contact_id) || ['email_verified', 'mobile_verified', 'account_created'].includes(ev.type)) {
      const contactId = await syncSignupContact(db, out)
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
let workspaceCache: { at: number; co: any } | null = null

/**
 * Colvy's own workspace. Pinned by COLVY_WORKSPACE_ID when set; otherwise the
 * company with slug 'colvy' (super admin → Companies), and only when its owner
 * is the platform admin, so a business that somehow took the slug never
 * receives sign-ups.
 */
export async function colvyWorkspace(db: any): Promise<{ id: string; name: string; slug: string } | null> {
  if (workspaceCache && Date.now() - workspaceCache.at < 10 * 60_000) return workspaceCache.co
  let co: any = null
  try {
    const pinned = process.env.COLVY_WORKSPACE_ID
    if (pinned) {
      const { data } = await db.from('companies').select('id, name, slug, owner_id').eq('id', pinned).maybeSingle()
      co = data || null
    } else {
      const { data } = await db.from('companies').select('id, name, slug, owner_id').eq('slug', process.env.COLVY_WORKSPACE_SLUG || 'colvy').maybeSingle()
      if (data?.owner_id) {
        const { data: u } = await db.auth.admin.getUserById(data.owner_id)
        if (String(u?.user?.email || '').toLowerCase() === SUPER_ADMIN) co = data
        else console.warn('[signup-attempts] the colvy workspace isn’t owned by the platform admin: set COLVY_WORKSPACE_ID')
      }
    }
  } catch { co = null }
  workspaceCache = { at: Date.now(), co: co ? { id: co.id, name: co.name, slug: co.slug } : null }
  return workspaceCache.co
}
export function resetColvyWorkspaceCache() { workspaceCache = null }

const statusTag = (row: any) => row.spam_at ? 'signup-spam' : row.account_created_at ? 'signup-completed' : 'signup-abandoned'
const likeExact = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c)

/**
 * Add (or update) the person as a contact in Colvy's workspace, tagged with
 * how their sign-up went, so the owner can follow up from the normal inbox.
 *
 * Nothing they typed is trusted until it's verified: before the email code is
 * entered only a contact this sign-up flow made can be matched by email (an
 * existing customer's contact is left alone), and the mobile is only used to
 * match or fill once it's verified. Fills empty fields only. Suspicious
 * attempts stay out until an admin looks. No marketing consent is recorded.
 */
export async function syncSignupContact(db: any, row: any): Promise<string | null> {
  try {
    const email = cleanEmail(row?.email)
    if (!email) return null
    if ((row.risk_score || 0) >= SUSPICIOUS_SCORE && !row.account_created_at && !row.contact_id) return null
    const co = await colvyWorkspace(db)
    if (!co) return null
    const emailOk = !!(row.email_verified_at || row.account_created_at)
    const mobileOk = !!(row.mobile_verified_at || row.account_created_at) && !!row.phone
    const cols = 'id, name, email, phone, tags, source, company_name, city, notes'

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
      const hit = await findContactByPhone(db, co.id, row.phone)
      if (hit) { const { data } = await db.from('contacts').select(cols).eq('id', hit.id).maybeSingle(); c = data || null }
    }
    if (!c) {
      const base = { company_id: co.id, name: row.name || null, email, phone: mobileOk ? row.phone : null, source: 'signup', tags: ['signup', statusTag(row)] }
      let ins = await db.from('contacts').insert({ ...base, subscribed_to_marketing: false }).select(cols).maybeSingle()
      if (ins.error) ins = await db.from('contacts').insert(base).select(cols).maybeSingle()
      c = ins.data || null
      if (!c) return null
    }

    const tags = (Array.isArray(c.tags) ? c.tags : []).filter((t: string) => !SIGNUP_TAGS.includes(t))
    const patch: any = { tags: Array.from(new Set([...tags, 'signup', statusTag(row)])) }
    if (!c.name && row.name) patch.name = row.name
    if (!c.email) patch.email = email
    if (!c.phone && mobileOk) patch.phone = row.phone
    const extra: any = {}
    if (!c.company_name && row.business_name) extra.company_name = row.business_name
    if (!c.city && (row.business_city || row.ip_city)) extra.city = row.business_city || row.ip_city
    if (!c.notes && c.source === 'signup') extra.notes = `Started a Colvy sign-up${row.business_name ? ` for ${row.business_name}` : ''}. Transactional follow-up only: no marketing consent given.`
    const { error } = await db.from('contacts').update({ ...patch, ...extra }).eq('id', c.id)
    if (error) await db.from('contacts').update(patch).eq('id', c.id)
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

// ── Admin list ─────────────────────────────────────────────────────────────

export type ListFilter = 'all' | 'abandoned' | 'suspicious' | 'completed' | 'spam'
export type ListRange = 'today' | '7d' | '30d' | 'all'

/** One row as the Signups page shows it. */
export function presentSignup(row: any, now = Date.now()) {
  const status = signupStatus(row, now)
  const risk = assessRisk(row)
  return {
    ...row,
    status,
    step: stepReached(row),
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
  if (s) rows = rows.filter(r => [r.email, r.name, r.business_name, r.business_slug, r.phone, r.ip, r.ip_city, r.industry].some(v => String(v || '').toLowerCase().includes(s)))
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
