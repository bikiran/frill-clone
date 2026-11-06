// "Have questions? Let's talk." The call-back form above the footer on every
// marketing page (components/marketing/LetsTalk.tsx posts to /api/lets-talk,
// which files it in Colvy's own inbox). These are the checks both sides share,
// so the form can say what's wrong before it sends anything.

import { toE164Au, formatAuPhone } from '@/lib/colvy-contact'

/** The conversation's subject in Colvy's inbox. */
export const LETS_TALK_SUBJECT = 'Let’s talk: call-back request'
/** The tag on the contact. */
export const LETS_TALK_TAG = 'lets-talk'
/** The form has to have been open this long before it's sent (bots post at once). */
export const LETS_TALK_MIN_MS = 2500
/** How long the form's ticket lasts. */
export const LETS_TALK_TOKEN_TTL_MS = 2 * 60 * 60_000

// Control and invisible characters (zero-width spaces, bidi overrides, line
// separators) are dropped.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/**
 * A person's name, tidied, or '' when it doesn't look like one: links, email
 * addresses, markup, long runs of digits, or more than six words (a sentence
 * pasted into the name box).
 */
export function cleanLeadName(raw: unknown): string {
  const s = String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').replace(INVISIBLE, '').trim()
  if (s.length < 2 || s.length > 60) return ''
  if (!/\p{L}/u.test(s)) return ''
  if (/https?:|www\.|\.(com|net|org|io|co|ru|cn|xyz|top|info|biz|au|link|site|online)\b/i.test(s)) return ''
  if (/[<>{}[\]\\|@#$%^*=~`_/]/.test(s) || /\d{3,}/.test(s)) return ''
  if (s.split(' ').length > 6) return ''
  return s
}

/**
 * A number we can call back, in E.164 (+61… for Australian numbers, or any
 * +country number), or '' when it isn't one: letters in it, too short or too
 * long, or an obvious fake (all one digit).
 */
export function cleanLeadPhone(raw: unknown): string {
  const s = String(raw ?? '').replace(INVISIBLE, '').trim()
  if (!s || s.length > 24 || !/^\+?[\d\s().-]+$/.test(s)) return ''
  const digits = s.replace(/\D/g, '')
  // A mobile typed without its 0 (412 345 678).
  const e164 = toE164Au(/^4\d{8}$/.test(digits) && !s.startsWith('+') ? `0${digits}` : s)
  if (!e164) return ''
  const tail = e164.replace(/\D/g, '').slice(-8)
  if (/^(\d)\1+$/.test(tail)) return ''
  return e164
}

/** How the number reads in the inbox: 0412 345 678, or +44 … as sent. */
export const displayLeadPhone = (e164: string) => (e164.startsWith('+61') ? formatAuPhone(e164) : e164)

/** The page the form was sent from: a path on Colvy's site, nothing else. */
export function leadPage(raw: unknown): string {
  const s = String(raw ?? '').split(/[?#]/)[0].replace(/\/{2,}/g, '/').slice(0, 160)
  return /^\/[\w\-./]*$/.test(s) && !s.includes('..') ? s : '/'
}
