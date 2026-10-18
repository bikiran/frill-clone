// Email addresses not to send marketing to (server only), and the
// per-recipient checks every campaign email goes through.
//
// Suppressions (email_suppressions, V396):
//   • hard bounce          → this business's list (the address doesn't exist)
//   • 3 soft bounces in 30 days → this business's list
//   • spam complaint       → this business's list AND the global list
//                            (company_id NULL): every business sends through
//                            one Resend account, and complaints count against
//                            all of them.
// Consent (contacts): blocked, unsubscribed from everything (unsubscribed_at),
// email marketing off (email_marketing_opt_out_at), or no marketing consent.
// Before V396 the table and column don't exist: nothing reads as suppressed
// there, and email-only opt-outs are stored as unsubscribed_at instead
// (lib/email-preferences), which this still honours.

import { isMissingColumn, isMissingTable, normEmail } from '@/lib/email-db'

export const SOFT_BOUNCE_LIMIT = 3
export const SOFT_BOUNCE_WINDOW_DAYS = 30

export type SuppressReason = 'hard_bounce' | 'soft_bounce' | 'complaint' | 'manual'

/** Add an address to a business's list (and the global one for complaints). Never throws. */
export async function suppress(db: any, companyId: string | null, email: string, reason: SuppressReason, extra: { detail?: string | null; campaignId?: string | null } = {}): Promise<boolean> {
  const addr = normEmail(email)
  if (!addr) return false
  const scopes: (string | null)[] = companyId ? [companyId] : []
  if (reason === 'complaint') scopes.push(null)
  let any = false
  for (const co of scopes) {
    try {
      let q = db.from('email_suppressions').select('id').ilike('email', addr).limit(1)
      q = co ? q.eq('company_id', co) : q.is('company_id', null)
      const { data, error } = await q
      if (error) { if (!isMissingTable(error)) console.error('[email suppression] read failed', error.message); continue }
      if (data?.length) { any = true; continue }
      const { error: insErr } = await db.from('email_suppressions').insert({
        company_id: co, email: addr, reason, detail: extra.detail ? String(extra.detail).slice(0, 500) : null, campaign_id: extra.campaignId || null,
      })
      if (!insErr || /duplicate|unique/i.test(insErr.message || '')) any = true
      else if (!isMissingTable(insErr)) console.error('[email suppression] insert failed', insErr.message)
    } catch (e: any) { console.error('[email suppression] failed', e?.message) }
  }
  return any
}

/** Which of these addresses are suppressed for this business (its own list plus the global one). */
export async function suppressedSet(db: any, companyId: string, emails: string[]): Promise<Set<string>> {
  const want = [...new Set(emails.map(normEmail).filter(Boolean))]
  const out = new Set<string>()
  for (let i = 0; i < want.length; i += 200) {
    const chunk = want.slice(i, i + 200)
    try {
      const { data, error } = await db.from('email_suppressions').select('email, company_id').in('email', chunk)
      if (error) { if (isMissingTable(error)) return out; throw error }
      for (const r of data || []) if (!r.company_id || r.company_id === companyId) out.add(normEmail(r.email))
    } catch (e: any) {
      // Can't read the list: treat this chunk as suppressed rather than risk
      // emailing someone who bounced or complained.
      console.error('[email suppression] list unreadable', e?.message)
      for (const e2 of chunk) out.add(e2)
    }
  }
  return out
}

/** Soft bounces for this address in the window; suppress once it reaches the limit. */
export async function noteSoftBounce(db: any, companyId: string, email: string, campaignId?: string | null, now = Date.now()): Promise<boolean> {
  const addr = normEmail(email)
  if (!addr || !companyId) return false
  try {
    const since = new Date(now - SOFT_BOUNCE_WINDOW_DAYS * 86400_000).toISOString()
    const { count, error } = await db.from('email_events').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).ilike('email', addr).eq('type', 'soft_bounced').gte('occurred_at', since)
    if (error) return false
    if ((count || 0) >= SOFT_BOUNCE_LIMIT) return suppress(db, companyId, addr, 'soft_bounce', { detail: `${count} soft bounces in ${SOFT_BOUNCE_WINDOW_DAYS} days`, campaignId })
  } catch {}
  return false
}

export type ConsentSkip = 'blocked' | 'unsubscribed' | 'no_consent' | 'suppressed' | 'invalid_email'

/** Why a contact may not get marketing email, or null when they may. */
export function emailConsentSkip(c: any): ConsentSkip | null {
  if (!c) return 'no_consent'
  if (c.is_blocked) return 'blocked'
  if (c.unsubscribed_at || c.email_marketing_opt_out_at) return 'unsubscribed'
  if (!c.subscribed_to_marketing || c.consent_basis === 'none') return 'no_consent'
  return null
}

const CONTACT_COLS = 'id, email, is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at, email_marketing_opt_out_at'
const CONTACT_COLS_OLD = 'id, email, is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at'

/** Contacts by id, live, with the consent columns (the V396 column only when it exists). null if unreadable. */
export async function loadConsent(db: any, companyId: string, ids: string[]): Promise<Map<string, any> | null> {
  const out = new Map<string, any>()
  const uniq = [...new Set(ids.filter(Boolean))]
  let cols = CONTACT_COLS
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200)
    let r = await db.from('contacts').select(cols).eq('company_id', companyId).in('id', chunk)
    if (r.error && isMissingColumn(r.error) && cols === CONTACT_COLS) { cols = CONTACT_COLS_OLD; r = await db.from('contacts').select(cols).eq('company_id', companyId).in('id', chunk) }
    if (r.error) return null
    for (const c of r.data || []) out.set(c.id, c)
  }
  return out
}

/**
 * Keep only the people who may get marketing email right now: consent read
 * live from their contact, and not suppressed. For senders that resolved
 * their audience earlier (announcement emails). On a read failure, nobody.
 */
export async function filterEmailable<T extends { contact_id: string; email: string | null }>(db: any, companyId: string, list: T[]): Promise<{ keep: T[]; dropped: number }> {
  if (!list.length) return { keep: [], dropped: 0 }
  const consent = await loadConsent(db, companyId, list.map(r => r.contact_id))
  if (!consent) return { keep: [], dropped: list.length }
  const supp = await suppressedSet(db, companyId, list.map(r => String(r.email || '')))
  const keep = list.filter(r => {
    const addr = normEmail(r.email)
    return addr && !supp.has(addr) && !emailConsentSkip(consent.get(r.contact_id))
  })
  return { keep, dropped: list.length - keep.length }
}
