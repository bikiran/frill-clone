// Customer portal sign-in (docs: the "Colvy customer portal plan"). No
// passwords: a one-time code sent to the exact email or mobile on the
// customer's contact, or a link the business already sent them (a booking or
// quote link). Either gives a session token the page keeps in its own storage
// and sends as "Authorization: Bearer". Only hashes are stored.
//
// The rule everything here keeps: a session belongs to one business and one
// contact, and every read goes through that contact id.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { phoneKey, emailKey, ilikeExact, exactEmailRow } from '@/lib/phone'
import { resolvePortalSettings, type PortalSettings } from '@/lib/portal/settings'
import { PUBLIC_COMPANY_COLS } from '@/lib/booking'

export const portalDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MIN = 60_000
const DAY = 24 * 60 * MIN
export const CODE_TTL_MS = 10 * MIN
export const CODE_TRIES = 5
/** A code sign-in lasts 30 days from the last visit; a link sign-in, a day. */
export const SESSION_IDLE_MS = { code: 30 * DAY, link: DAY } as const

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** V432 isn't in yet (portal tables or companies.portal_settings missing). */
export function isMissingPortalSchema(e: any): boolean {
  const m = String(e?.message || '') + ' ' + String(e?.details || '')
  return /42P01|42703|PGRST20[45]/.test(String(e?.code || '')) && /portal_/i.test(m) || /portal_(codes|sessions|events|settings)/i.test(m) && /does not exist|could not find|schema cache/i.test(m)
}
export const PORTAL_HINT = 'The customer account page needs a database update (V432). Run migrations/COLVY_V432_CUSTOMER_PORTAL.sql in Supabase.'

export type PortalCompany = { company: any; settings: PortalSettings }

/** The business by its address (slug), with its portal settings; null when there's no such business. */
export async function portalCompany(db: any, slug: string): Promise<PortalCompany | null> {
  const s = String(slug || '').toLowerCase().trim()
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) return null
  const { data, error } = await db.from('companies').select(`${PUBLIC_COMPANY_COLS}, portal_settings, job_settings`).eq('slug', s).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { company: data, settings: resolvePortalSettings(data.portal_settings) }
}

/** What the customer typed: an email, or a mobile number. */
export function parseIdentifier(raw: any): { kind: 'email' | 'sms'; key: string } | null {
  const t = String(raw || '').trim().slice(0, 200)
  if (t.includes('@')) { const e = emailKey(t); return e ? { kind: 'email', key: e } : null }
  const k = phoneKey(t)
  return k.length >= 9 ? { kind: 'sms', key: k } : null
}

/**
 * Contacts of this business whose email (exactly, any case) or mobile (the
 * same last nine digits) is the one typed. Most recently active first.
 */
export async function contactsFor(db: any, companyId: string, id: { kind: 'email' | 'sms'; key: string }): Promise<any[]> {
  const cols = 'id, name, email, phone, created_at, last_seen_at'
  let rows: any[] = []
  if (id.kind === 'email') {
    const { data, error } = await db.from('contacts').select(cols).eq('company_id', companyId).ilike('email', ilikeExact(id.key)).limit(10)
    if (error) { const r = await db.from('contacts').select('id, name, email, phone, created_at').eq('company_id', companyId).ilike('email', ilikeExact(id.key)).limit(10); rows = r.data || [] } else rows = data || []
    rows = rows.filter(r => String(r.email || '').toLowerCase() === id.key)
    if (!rows.length) { const one = exactEmailRow(rows, id.key); if (one) rows = [one] }
  } else {
    const { data, error } = await db.from('contacts').select(cols).eq('company_id', companyId).ilike('phone', `%${id.key}%`).limit(10)
    if (error) { const r = await db.from('contacts').select('id, name, email, phone, created_at').eq('company_id', companyId).ilike('phone', `%${id.key}%`).limit(10); rows = r.data || [] } else rows = data || []
    rows = rows.filter(r => phoneKey(r.phone) === id.key)
  }
  return rows.sort((a, b) => Date.parse(b.last_seen_at || b.created_at || 0) - Date.parse(a.last_seen_at || a.created_at || 0))
}

/** A new six-digit code for this contact and destination. Returns the code to send. */
export async function makeCode(db: any, companyId: string, contactId: string, channel: 'email' | 'sms', destination: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const id = randomBytes(8).toString('hex')
  // Older unused codes for the same place stop working.
  await db.from('portal_codes').update({ used_at: new Date().toISOString() }).eq('company_id', companyId).eq('destination', destination).is('used_at', null)
  const { error } = await db.from('portal_codes').insert({
    company_id: companyId, contact_id: contactId, channel, destination, code_hash: `${id}:${sha(`${id}:${code}`)}`,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (error) throw error
  return code
}

/** Check a code. The contact it was for, or why not. */
export async function checkCode(db: any, companyId: string, destination: string, code: string): Promise<{ ok: true; contactId: string } | { ok: false; reason: 'wrong' | 'expired' | 'tries' }> {
  const c = String(code || '').replace(/\D/g, '')
  const { data, error } = await db.from('portal_codes').select('id, contact_id, code_hash, attempts, expires_at, used_at')
    .eq('company_id', companyId).eq('destination', destination).is('used_at', null).order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return { ok: false, reason: 'expired' }
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'expired' }
  if ((row.attempts || 0) >= CODE_TRIES) return { ok: false, reason: 'tries' }
  const [salt, hash] = String(row.code_hash).split(':')
  const good = c.length === 6 && !!salt && !!hash && sameHex(sha(`${salt}:${c}`), hash)
  if (!good) {
    await db.from('portal_codes').update({ attempts: (row.attempts || 0) + 1 }).eq('id', row.id)
    return { ok: false, reason: (row.attempts || 0) + 1 >= CODE_TRIES ? 'tries' : 'wrong' }
  }
  // Used once: the update only wins while it's still unused.
  const { data: used } = await db.from('portal_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id).is('used_at', null).select('id')
  if (!used?.length) return { ok: false, reason: 'expired' }
  return { ok: true, contactId: row.contact_id }
}

export async function startSession(db: any, companyId: string, contactId: string, via: 'code' | 'link', userAgent?: string | null) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_IDLE_MS[via]).toISOString()
  const { error } = await db.from('portal_sessions').insert({
    company_id: companyId, contact_id: contactId, token_hash: sha(token), via, expires_at: expiresAt, user_agent: String(userAgent || '').slice(0, 200) || null,
  })
  if (error) throw error
  return { token, expiresAt, via }
}

export function bearer(req: Request): string {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(h.trim())
  return m ? m[1] : ''
}

export type PortalSession = { id: string; contactId: string; via: 'code' | 'link'; expiresAt: string }

/** The signed-in customer for this business, or null. Keeps a code session alive while it's used. */
export async function sessionFor(db: any, req: Request, companyId: string): Promise<PortalSession | null> {
  const token = bearer(req)
  if (!token) return null
  const { data, error } = await db.from('portal_sessions').select('id, company_id, contact_id, via, expires_at, last_seen_at, revoked_at').eq('token_hash', sha(token)).maybeSingle()
  if (error) throw error
  if (!data || data.company_id !== companyId || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return null
  let expiresAt = data.expires_at
  // Slide a code session along (at most every ten minutes); a link session never grows.
  if (data.via === 'code' && Date.now() - Date.parse(data.last_seen_at) > 10 * MIN) {
    expiresAt = new Date(Date.now() + SESSION_IDLE_MS.code).toISOString()
    await db.from('portal_sessions').update({ last_seen_at: new Date().toISOString(), expires_at: expiresAt }).eq('id', data.id)
  }
  return { id: data.id, contactId: data.contact_id, via: data.via, expiresAt }
}

export async function endSession(db: any, sessionId: string) {
  await db.from('portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId)
}

/**
 * A link the business sent (a booking's manage link, a quote link) opens the
 * account of the contact it belongs to, for a day. Nothing for a record of
 * another business, or one with no contact.
 */
export async function contactFromLink(db: any, companyId: string, link: { booking?: string; quote?: string; invoice?: string }): Promise<string | null> {
  const b = String(link.booking || ''), q = String(link.quote || ''), inv = String(link.invoice || '')
  if (b && b.length >= 20 && b.length <= 80) {
    const { data } = await db.from('bookings').select('contact_id, company_id').eq('manage_token', b).maybeSingle()
    if (data && data.company_id === companyId && data.contact_id) return data.contact_id
  }
  if (q && q.length >= 16 && q.length <= 80) {
    const { data: qt } = await db.from('job_quotes').select('job_id, company_id').eq('public_token', q).maybeSingle()
    if (qt && qt.company_id === companyId && qt.job_id) {
      const { data: job } = await db.from('jobs').select('contact_id, company_id').eq('id', qt.job_id).maybeSingle()
      if (job && job.company_id === companyId && job.contact_id) return job.contact_id
    }
  }
  if (inv && inv.length >= 16 && inv.length <= 80) {
    const { data: it } = await db.from('job_invoices').select('job_id, company_id, status').eq('public_token', inv).maybeSingle()
    if (it && it.company_id === companyId && it.job_id && it.status !== 'draft') {
      const { data: job } = await db.from('jobs').select('contact_id, company_id').eq('id', it.job_id).maybeSingle()
      if (job && job.company_id === companyId && job.contact_id) return job.contact_id
    }
  }
  return null
}

/** "j•••@example.com", "•••• ••• 678": enough to recognise, not to read off a screen. */
export function maskEmail(e?: string | null): string {
  const s = String(e || '')
  const at = s.indexOf('@')
  if (at < 1) return ''
  return `${s[0]}•••${s.slice(at)}`
}
export function maskPhone(p?: string | null): string {
  const d = String(p || '').replace(/\D/g, '')
  return d.length >= 6 ? `•••• ••• ${d.slice(-3)}` : ''
}

/**
 * "Your account" for a booking or quote page or email, when the business has
 * accounts on: the account page with the record's own token, which signs the
 * customer in for a day (no token: the plain page, signed in with a code).
 * <business>.colvy.com/account, or colvy.com/account/<business> off the
 * subdomains. Null when it's off (or before V432).
 */
export async function accountLink(db: any, company: any, link: { b?: string | null; q?: string | null; i?: string | null }): Promise<string | null> {
  try {
    if (!company?.id || !company.slug) return null
    const { data, error } = await db.from('companies').select('portal_settings').eq('id', company.id).maybeSingle()
    if (error || !resolvePortalSettings(data?.portal_settings).enabled) return null
    const { companyBase } = await import('@/lib/booking')
    const q = link.b ? `?b=${encodeURIComponent(link.b)}` : link.q ? `?q=${encodeURIComponent(link.q)}` : link.i ? `?i=${encodeURIComponent(link.i)}` : ''
    const { base, onSubdomain } = companyBase(company)
    return `${base}/account${onSubdomain ? '' : `/${encodeURIComponent(company.slug)}`}${q}`
  } catch { return null }
}

export async function portalEvent(db: any, companyId: string, contactId: string | null, kind: string, detail?: any) {
  try { await db.from('portal_events').insert({ company_id: companyId, contact_id: contactId, kind, detail: detail || null }) } catch {}
}
