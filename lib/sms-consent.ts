// SMS opt-outs (STOP) and opt-ins (START): recording them, asking whether a
// customer may be texted automatically, and the one guard every automated or
// system text goes through (assertMayText / resolveAutomatedSmsSender, and the
// same check in /api/telnyx/sms/send for internal calls). Shared by both
// inbound-SMS paths (lib/inbound-sms for Twilio, the Telnyx webhook), the
// missed-call text, upload links and the AI replies, so they all agree.
//
// When in doubt these answer "don't text": a missed text costs little, a text
// to someone who said STOP is a compliance breach.

import { phoneKey, toE164 } from '@/lib/phone'
import { ensureContactByPhone } from '@/lib/contact-capture'
import { resolveSmsSender, type SmsSender } from '@/lib/sms-provider'

export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE']
export const START_WORDS = ['START', 'SUBSCRIBE', 'YES', 'OPTIN', 'UNSTOP']

// Whole messages that ask to stop, read as STOP. Only the whole message counts:
// "Can you stop by on Friday?" or "the tap won't stop leaking" are ordinary
// messages from a customer who wants an answer, and reading them as an opt-out
// would unsubscribe them business-wide in the middle of a conversation. The
// carriers act on whole-message keywords too, and staff see every message in
// the thread.
const STOP_PHRASES = new Set([
  'PLEASESTOP', 'STOPPLEASE', 'STOPTEXTING', 'STOPTEXTINGME', 'PLEASESTOPTEXTINGME', 'STOPMESSAGING',
  'STOPMESSAGINGME', 'PLEASESTOPMESSAGINGME', 'STOPSENDINGMETEXTS', 'UNSUBSCRIBEME', 'OPTMEOUT',
])

/**
 * The keyword a whole text is, reduced to its letters ("Stop.", "S T O P",
 * "ＳＴＯＰ" and "please stop" all read STOP), or its letters when it's no
 * keyword.
 */
export function smsKeyword(text: string | null | undefined): string {
  const letters = String(text || '').normalize('NFKC').toUpperCase().replace(/[^A-Z]/g, '')
  return STOP_PHRASES.has(letters) ? 'STOP' : letters
}

/** Is this contact's latest say texting the business START or similar (not YES)? */
export function isTextedOptIn(c: any): boolean {
  return c?.consent_basis === 'express' && /^replied [A-Z]+ by SMS$/.test(String(c?.consent_source || ''))
}

const digitCount = (phone: string | null | undefined) => String(phone || '').replace(/\D/g, '').length
const isMissingTable = (e: any) =>
  /^(42P01|PGRST205)$/.test(String(e?.code || '')) || /does not exist|could not find the table|schema cache/i.test(String(e?.message || ''))

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
      // phone_norm (indexed, kept filled by V359) answers almost every lookup.
      const norm = await db.from('contacts').select('*').eq('company_id', companyId).eq('phone_norm', key).limit(200)
      if (!norm.error) for (const c of norm.data || []) found.set(c.id, c)
      if (norm.error || !(norm.data || []).length) {
        // Nobody by phone_norm: a contact saved before it was filled in.
        const { data, error } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${key}%`).limit(200)
        if (error) return null
        for (const c of data || []) if (same(c)) found.set(c.id, c)
        if (norm.error) {
          // No phone_norm column at all: numbers saved with spaces only show up this way.
          const { data: tail, error: tailErr } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${key.slice(-3)}`).limit(1000)
          if (tailErr) return null
          for (const c of tail || []) if (same(c)) found.set(c.id, c)
        }
      }
    }
  } catch { return null }
  return [...found.values()]
}

/**
 * Save a number that texted STOP and has no contact, so the opt-out is
 * remembered. Two STOPs arriving together could each make one: after the
 * insert the contacts with the number are read again, and a new contact that
 * isn't the first of them is removed. Only for real numbers (8+ digits).
 */
async function contactsForStop(db: any, companyId: string, from: string): Promise<any[]> {
  if (digitCount(from) < 8) return []
  const id = await ensureContactByPhone(db, companyId, from, { source: 'sms', known: true })
  if (!id) return []
  const all = await findContactsByPhone(db, companyId, from)
  if (!all || !all.length) return [{ id }]
  const first = [...all].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))[0]
  if (first.id !== id) {
    try { await db.from('contacts').delete().eq('id', id).eq('company_id', companyId) } catch {}
    return all.filter(c => c.id !== id)
  }
  return all
}

/**
 * Record a STOP or START the customer texted: in sms_keywords (V378, the
 * normalised keyword, read back by smsKeywordTimes) and on every contact with
 * their number. A STOP from a number with no contact saves the number as a
 * contact. The message itself is stored by the caller either way. Never throws.
 *
 * A START word lifts only an opt-out that came by text (unsubscribe_method
 * 'sms_keyword': a STOP, or one the carrier reported); an email unsubscribe or
 * one staff recorded stays. YES lifts it too (carriers treat YES as opting
 * back in) but never gives marketing consent: it's often just an answer.
 */
export async function recordSmsKeyword(db: any, companyId: string, from: string, keyword: string): Promise<void> {
  const optingOut = STOP_WORDS.includes(keyword)
  if (!from || (!optingOut && !START_WORDS.includes(keyword))) return
  const key = phoneKey(from)
  if (key.length >= 8) {
    try {
      const { error } = await db.from('sms_keywords').insert({ company_id: companyId, phone_norm: key, keyword })
      if (error && !isMissingTable(error)) console.error('[sms consent] keyword not saved', error.message)
    } catch {}
  }
  try {
    let contacts = await findContactsByPhone(db, companyId, from)
    if (!contacts) { console.error('[sms consent] contacts could not be read; keyword not recorded', keyword); return }
    if (!contacts.length && optingOut) contacts = await contactsForStop(db, companyId, from)
    const now = new Date().toISOString()
    for (const c of contacts) {
      let patch: Record<string, any>
      let event: Record<string, any>
      if (optingOut) {
        patch = { subscribed_to_marketing: false, consent_basis: 'none', consent_source: `replied ${keyword} by SMS`, unsubscribed_at: now, unsubscribe_method: 'sms_keyword' }
        event = { action: 'unsubscribed', basis: 'none' }
      } else {
        // An opt-out some other way (an email link, staff) isn't theirs to lift by text.
        if (c.unsubscribed_at && c.unsubscribe_method !== 'sms_keyword') continue
        if (keyword === 'YES') {
          if (!c.unsubscribed_at) continue
          patch = { unsubscribed_at: null, unsubscribe_method: null }
          event = { action: 'texts_resumed', basis: null, note: 'Texted YES: texts resume, no marketing consent' }
        } else {
          patch = { subscribed_to_marketing: true, consent_basis: 'express', consent_source: `replied ${keyword} by SMS`, consent_recorded_at: now, unsubscribed_at: null, unsubscribe_method: null }
          event = { action: 'subscribed', basis: 'express' }
        }
      }
      await db.from('contacts').update(patch).eq('id', c.id).eq('company_id', companyId)
      await db.from('consent_events').insert({ company_id: companyId, contact_id: c.id, source: `SMS keyword: ${keyword}`, actor: 'customer', ...event })
    }
  } catch (e) { console.error('[sms consent] keyword handling failed', e) }
}

/**
 * When this number last texted the business a STOP word, and a START word.
 * From sms_keywords (V378, filled as texts arrive and backfilled from the
 * message history), newest first, one row each. Before V378 runs, from that
 * number's own conversations only (by its number, or the contacts given),
 * never the whole company's messages. null when it can't be read.
 */
export async function smsKeywordTimes(db: any, companyId: string, phone: string | null | undefined, contactIds: string[] = []): Promise<{ stop: number | null; start: number | null } | null> {
  const key = phoneKey(phone)
  if (key.length < 8) return { stop: null, start: null }
  const at = (rows: any[] | null | undefined) => { const t = Date.parse(rows?.[0]?.created_at || ''); return Number.isFinite(t) ? t : null }
  try {
    const latest = (words: string[]) => db.from('sms_keywords').select('created_at')
      .eq('company_id', companyId).eq('phone_norm', key).in('keyword', words)
      .order('created_at', { ascending: false }).limit(1)
    const [stop, start] = await Promise.all([latest(STOP_WORDS), latest(START_WORDS)])
    if (!stop.error && !start.error) return { stop: at(stop.data), start: at(start.data) }
    if (!isMissingTable(stop.error || start.error)) return null
  } catch { return null }
  return keywordTimesFromThreads(db, companyId, phone!, key, contactIds)
}

/** Before V378: the number's conversations, then their newest inbound texts. */
async function keywordTimesFromThreads(db: any, companyId: string, phone: string, key: string, contactIds: string[]): Promise<{ stop: number | null; start: number | null } | null> {
  try {
    const numbers = [...new Set([phone, toE164(phone), `0${key}`, key].filter(Boolean))]
    const ids = new Set<string>()
    const byNumber = await db.from('conversations').select('id').eq('company_id', companyId).in('sms_number', numbers).limit(50)
    if (byNumber.error) return null
    for (const c of byNumber.data || []) ids.add(c.id)
    if (contactIds.length) {
      const byContact = await db.from('conversations').select('id').eq('company_id', companyId).in('contact_id', contactIds).limit(50)
      if (byContact.error) return null
      for (const c of byContact.data || []) ids.add(c.id)
    }
    if (!ids.size) return { stop: null, start: null }
    const { data, error } = await db.from('messages').select('content, created_at, sender_name')
      .in('conversation_id', [...ids]).eq('sender_type', 'visitor').eq('delivery_channel', 'sms')
      .order('created_at', { ascending: false }).limit(500)
    if (error) return null
    let stop: number | null = null, start: number | null = null
    for (const m of data || []) {
      if (phoneKey(m.sender_name) !== key) continue
      const k = smsKeyword(m.content), t = Date.parse(m.created_at || '')
      if (!Number.isFinite(t)) continue
      if (STOP_WORDS.includes(k) && (stop === null || t > stop)) stop = t
      if (START_WORDS.includes(k) && (start === null || t > start)) start = t
    }
    return { stop, start }
  } catch { return null }
}

/**
 * May Colvy text this customer automatically? 'opted_out' when any contact with
 * their number (or the contact given) opted out or is blocked, or when the
 * last keyword they texted was a STOP with no START word after it.
 * 'unknown' when that can't be read: don't text. `contacts` are the rows read.
 *
 * Deliberately, an opt-in that didn't come by text (a Shopify or checkout
 * marketing tick, a form) doesn't outrank a STOP the customer texted: only
 * the customer texting START (or YES) lifts it.
 */
export async function textOptOut(db: any, companyId: string, phone: string | null | undefined, contactId?: string | null): Promise<{ state: 'ok' | 'opted_out' | 'unknown'; contacts: any[] }> {
  const contacts = await findContactsByPhone(db, companyId, phone, contactId)
  if (!contacts) return { state: 'unknown', contacts: [] }
  if (contacts.some(c => c.is_blocked || c.unsubscribed_at)) return { state: 'opted_out', contacts }
  if (phoneKey(phone).length >= 8) {
    const kw = await smsKeywordTimes(db, companyId, phone, contacts.map(c => c.id))
    if (!kw) return { state: 'unknown', contacts }
    if (kw.stop !== null) {
      // An opt-in by text recorded on a contact counts too: its message may be
      // in a deleted thread.
      const optIns = contacts.filter(isTextedOptIn).map(c => Date.parse(c.consent_recorded_at || '')).filter(Number.isFinite)
      const lastStart = Math.max(kw.start ?? -Infinity, ...optIns)
      if (kw.stop >= lastStart) return { state: 'opted_out', contacts }
    }
  }
  return { state: 'ok', contacts }
}

/** An automated or system text refused because of an opt-out (or because it couldn't be checked). */
export class SmsOptOutError extends Error {
  reason: 'opted_out' | 'unknown'
  constructor(reason: 'opted_out' | 'unknown') {
    super(reason === 'opted_out'
      ? 'This customer has opted out of texts (they replied STOP), so it wasn’t texted.'
      : 'Couldn’t check whether this customer opted out of texts, so it wasn’t texted.')
    this.name = 'SmsOptOutError'
    this.reason = reason
  }
}

/**
 * The guard for automated and system texts: throws SmsOptOutError unless the
 * number being texted (and the contact the text is for, when known) may be
 * texted.
 */
export async function assertMayText(db: any, companyId: string, to: string, contactId?: string | null): Promise<void> {
  const { state } = await textOptOut(db, companyId, to, contactId)
  if (state !== 'ok') throw new SmsOptOutError(state)
}

/**
 * The company's SMS sender for automated and system texts: each send checks
 * the number it goes to first (assertMayText). null when texting isn't set up.
 */
export async function resolveAutomatedSmsSender(db: any, companyId: string, opts: { contactId?: string | null } = {}): Promise<SmsSender | null> {
  const sender = await resolveSmsSender(db, companyId)
  if (!sender) return null
  return {
    ...sender,
    async send(p) {
      await assertMayText(db, companyId, p.to, opts.contactId)
      return sender.send(p)
    },
  }
}
