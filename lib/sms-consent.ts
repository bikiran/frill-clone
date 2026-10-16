// SMS opt-outs (STOP) and opt-ins (START): recording them, and asking whether a
// customer may be texted automatically. Shared by both inbound-SMS paths
// (lib/inbound-sms for Twilio, the Telnyx webhook), the missed-call text and
// the automatic upload-link replies, so they all agree.
//
// When in doubt these answer "don't text": a missed text costs little, a text
// to someone who said STOP is a compliance breach.

import { phoneKey } from '@/lib/phone'
import { ensureContactByPhone } from '@/lib/contact-capture'

export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']
export const START_WORDS = ['START', 'SUBSCRIBE', 'YES', 'OPTIN', 'UNSTOP']

/** A text reduced to its letters, so "Stop." and "STOP ALL" read as keywords. */
export function smsKeyword(text: string | null | undefined): string {
  return String(text || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
}

/** Is this contact's latest say texting the business START, YES or similar? */
export function isTextedOptIn(c: any): boolean {
  return c?.consent_basis === 'express' && /^replied [A-Z]+ by SMS$/.test(String(c?.consent_source || ''))
}

/**
 * Every contact of the company with this number, however it was saved
 * ("+61412…", "0412 345 678"), plus the one given by id. Rows are read whole,
 * so a column an older database lacks can't hide an opt-out. null when they
 * can't be read.
 */
export async function findContactsByPhone(db: any, companyId: string, phone: string | null | undefined, contactId?: string | null): Promise<any[] | null> {
  const key = phoneKey(phone)
  const found = new Map<string, any>()
  const same = (c: any) => phoneKey(c?.phone) === key
  try {
    if (contactId) {
      const { data, error } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (error) return null
      if (data) found.set(data.id, data)
    }
    if (key.length >= 8) {
      const { data, error } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${key}%`).limit(200)
      if (error) return null
      for (const c of data || []) if (same(c)) found.set(c.id, c)
      // phone_norm (kept filled by V359) also finds numbers saved with spaces.
      const norm = await db.from('contacts').select('*').eq('company_id', companyId).eq('phone_norm', key).limit(200)
      if (!norm.error) for (const c of norm.data || []) found.set(c.id, c)
      else {
        // No phone_norm column yet: look through numbers ending the same way.
        const { data: tail, error: tailErr } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${key.slice(-3)}`).limit(1000)
        if (tailErr) return null
        for (const c of tail || []) if (same(c)) found.set(c.id, c)
      }
    }
  } catch { return null }
  return [...found.values()]
}

/**
 * Record a STOP or START the customer texted, on every contact with their
 * number. A STOP from a number with no contact saves the number as a contact,
 * so the opt-out is remembered (and isn't lost when a contact is made for them
 * later). The message itself is stored by the caller either way. Never throws.
 */
export async function recordSmsKeyword(db: any, companyId: string, from: string, keyword: string): Promise<void> {
  const optingOut = STOP_WORDS.includes(keyword)
  if (!from || (!optingOut && !START_WORDS.includes(keyword))) return
  try {
    let contacts = await findContactsByPhone(db, companyId, from)
    if (!contacts) { console.error('[sms consent] contacts could not be read; keyword not recorded', keyword); return }
    if (!contacts.length && optingOut) {
      const id = await ensureContactByPhone(db, companyId, from, { source: 'sms', known: true })
      if (id) contacts = [{ id }]
    }
    const now = new Date().toISOString()
    const patch = optingOut
      ? { subscribed_to_marketing: false, consent_basis: 'none', consent_source: `replied ${keyword} by SMS`, unsubscribed_at: now, unsubscribe_method: 'sms_keyword' }
      : { subscribed_to_marketing: true, consent_basis: 'express', consent_source: `replied ${keyword} by SMS`, consent_recorded_at: now, unsubscribed_at: null, unsubscribe_method: null }
    for (const c of contacts) {
      await db.from('contacts').update(patch).eq('id', c.id).eq('company_id', companyId)
      await db.from('consent_events').insert({
        company_id: companyId, contact_id: c.id,
        action: optingOut ? 'unsubscribed' : 'subscribed',
        basis: optingOut ? 'none' : 'express',
        source: `SMS keyword: ${keyword}`, actor: 'customer',
      })
    }
  } catch (e) { console.error('[sms consent] keyword handling failed', e) }
}

// Words a keyword text contains, to narrow the search in the database; each
// text found is then checked exactly with smsKeyword.
const KEYWORD_HINTS = ['stop', 'subscribe', 'cancel', 'end', 'quit', 'opt', 'start', 'yes']

/**
 * When this number last texted the business a STOP word, and a START word, in
 * any thread. The message is stored even when no contact matched, so this
 * still knows about a STOP that never reached a contact. It reads the newest
 * 500 of their texts that could be a keyword, so a keyword it finds is their
 * latest; one older than all of those is left to their contacts. null when
 * the messages can't be read.
 */
export async function smsKeywordTimes(db: any, companyId: string, phone: string | null | undefined): Promise<{ stop: number | null; start: number | null } | null> {
  const key = phoneKey(phone)
  if (key.length < 8) return { stop: null, start: null }
  try {
    const { data, error } = await db.from('messages').select('content, created_at')
      .eq('company_id', companyId).eq('sender_type', 'visitor').eq('delivery_channel', 'sms')
      .ilike('sender_name', `%${key}%`)
      .or(KEYWORD_HINTS.map(w => `content.ilike.%${w}%`).join(','))
      .order('created_at', { ascending: false }).limit(500)
    if (error) return null
    let stop: number | null = null, start: number | null = null
    for (const m of data || []) {
      const k = smsKeyword(m.content), at = Date.parse(m.created_at || '')
      if (!Number.isFinite(at)) continue
      if (STOP_WORDS.includes(k) && (stop === null || at > stop)) stop = at
      if (START_WORDS.includes(k) && (start === null || at > start)) start = at
    }
    return { stop, start }
  } catch { return null }
}

/**
 * May Colvy text this customer automatically? 'opted_out' when any contact with
 * their number (or the contact given) opted out or is blocked, or when the
 * last keyword they texted was a STOP with no opt-in by text after it.
 * 'unknown' when that can't be read: don't text. `contacts` are the rows read.
 */
export async function textOptOut(db: any, companyId: string, phone: string | null | undefined, contactId?: string | null): Promise<{ state: 'ok' | 'opted_out' | 'unknown'; contacts: any[] }> {
  const contacts = await findContactsByPhone(db, companyId, phone, contactId)
  if (!contacts) return { state: 'unknown', contacts: [] }
  if (contacts.some(c => c.is_blocked || c.unsubscribed_at)) return { state: 'opted_out', contacts }
  if (phoneKey(phone).length >= 8) {
    const kw = await smsKeywordTimes(db, companyId, phone)
    if (!kw) return { state: 'unknown', contacts }
    if (kw.stop !== null) {
      // An opt-in recorded on a contact counts too: its message may be in a
      // deleted thread.
      const optIns = contacts.filter(isTextedOptIn).map(c => Date.parse(c.consent_recorded_at || '')).filter(Number.isFinite)
      const lastStart = Math.max(kw.start ?? -Infinity, ...optIns)
      if (kw.stop >= lastStart) return { state: 'opted_out', contacts }
    }
  }
  return { state: 'ok', contacts }
}
