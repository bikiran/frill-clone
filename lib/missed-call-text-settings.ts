// Missed-call text back: the setting (companies.inbox_settings.missed_call_text)
// and the rules for which callers may get the text. Kept apart from
// lib/missed-call-text so the Calls settings screen can preview exactly the
// wording the server sends, and so the rules can be tested on their own.

import { toE164 } from '@/lib/phone'

// Plain apostrophe on purpose: one curly quote makes a text cost twice as much
// (see lib/sms-segments).
export const MISSED_CALL_TEXT_DEFAULT =
  "Sorry we missed your call! This is {business}. Reply here and we'll get back to you shortly."

/** Two text messages' worth. Longer costs more and reads like spam. */
export const MISSED_CALL_TEXT_MAX = 320

/** A caller gets at most one text in this many hours, however often they ring. */
export const MISSED_CALL_TEXT_HOURS = 12

export type MissedCallTextWhen = 'always' | 'after_hours'
export type MissedCallTextSettings = { enabled: boolean; message: string; when: MissedCallTextWhen }

/** The saved setting, with defaults filled in. Off unless switched on. */
export function missedCallTextSettings(inboxSettings: any): MissedCallTextSettings {
  const s = inboxSettings?.missed_call_text || {}
  const message = typeof s.message === 'string' && s.message.trim() ? s.message.trim().slice(0, MISSED_CALL_TEXT_MAX) : MISSED_CALL_TEXT_DEFAULT
  return { enabled: s.enabled === true, message, when: s.when === 'after_hours' ? 'after_hours' : 'always' }
}

/**
 * The text the caller receives: {business} becomes the business's name. Curly
 * quotes (phones type them) are straightened so the text stays one message.
 */
export function renderMissedCallText(message: string, businessName: string): string {
  const name = String(businessName || '').trim() || 'our team'
  return String(message || MISSED_CALL_TEXT_DEFAULT)
    .replace(/\{\s*business\s*\}/gi, () => name)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .trim()
}

// ── Who can be texted ─────────────────────────────────────────────────────────

// Every two-digit country calling code. The rest are one digit (1, 7) or three,
// and no code is the start of another, so the first digits of an E.164 number
// say which country it is.
const TWO_DIGIT_CODES = new Set(['20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98'])

/** '61' for +61 4…, '1' for +1 …, '353' for +353 …. Empty for no number. */
export function countryCode(e164: string): string {
  const d = String(e164 || '').replace(/\D/g, '')
  if (!d) return ''
  if (d[0] === '1' || d[0] === '7') return d[0]
  if (TWO_DIGIT_CODES.has(d.slice(0, 2))) return d.slice(0, 2)
  return d.slice(0, 3)
}

// Countries where a number's first digits say whether it's a mobile. A
// landline, a 13/1300/1800 number or a shared business line there can't get a
// text, so we don't try. Elsewhere (e.g. the US) any number might be a mobile.
const MOBILE_RULES: Record<string, { starts: string[]; lengths: number[] }> = {
  '61': { starts: ['4'], lengths: [9] },              // Australia: 04xx xxx xxx
  '64': { starts: ['2'], lengths: [8, 9, 10] },       // New Zealand: 02x
  '44': { starts: ['7'], lengths: [10] },             // UK: 07xxx
  '353': { starts: ['8'], lengths: [9] },             // Ireland: 08x
  '65': { starts: ['8', '9'], lengths: [8] },         // Singapore
}

// What carriers (and Twilio) put in place of a hidden caller ID — the words
// Anonymous, Restricted, Unavailable, Blocked and Unknown spelt on a keypad.
const WITHHELD = new Set(['266696687', '7378742833', '86282452253', '2562533', '8656696'])

/** A hidden caller ID: there's no number to text or ring back. */
export function isWithheldNumber(from: string | null | undefined): boolean {
  const raw = String(from || '').trim()
  const digits = raw.replace(/\D/g, '')
  return !raw || /[a-z]/i.test(raw) || !digits || WITHHELD.has(digits)
}

export type CallerSkip = 'withheld' | 'short_code' | 'international' | 'not_mobile'
export type CallerVerdict = { ok: true; e164: string } | { ok: false; reason: CallerSkip }

/**
 * Can this caller be texted back from this business number? Only a real,
 * visible mobile number in the same country as the line they rang: never a
 * hidden number, a short code, a landline or an overseas number.
 */
export function textableCaller(from: string | null | undefined, businessNumber: string | null | undefined): CallerVerdict {
  // "anonymous", "restricted", "+266696687"…
  if (isWithheldNumber(from)) return { ok: false, reason: 'withheld' }
  const raw = String(from || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return { ok: false, reason: 'short_code' }
  const e164 = toE164(raw)
  const cc = countryCode(e164)
  // No business number to compare with: Colvy's home market.
  const home = countryCode(toE164(businessNumber || '')) || '61'
  if (!cc || cc !== home) return { ok: false, reason: 'international' }
  const national = e164.replace(/\D/g, '').slice(cc.length)
  if (national.length < 7) return { ok: false, reason: 'short_code' }
  const rule = MOBILE_RULES[cc]
  if (rule && (!rule.starts.some(p => national.startsWith(p)) || !rule.lengths.includes(national.length))) {
    return { ok: false, reason: 'not_mobile' }
  }
  return { ok: true, e164 }
}

/**
 * Can a text be sent FROM this business number? In Australia only mobile
 * numbers carry texts, so a call to the shop's landline is answered from the
 * business's texting number instead.
 */
export function canTextFrom(num: string | null | undefined): boolean {
  const e164 = toE164(num || '')
  if (!e164) return false
  const cc = countryCode(e164)
  const rule = MOBILE_RULES[cc]
  return !rule || rule.starts.some(p => e164.replace(/\D/g, '').slice(cc.length).startsWith(p))
}
