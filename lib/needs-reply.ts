// Does this customer message need an answer? Used by the "Answer customers"
// goal (lib/agent/goals.ts) so Needs you doesn't list people as waiting when
// they only closed the conversation themselves.
//
// No answer needed:
//   • an iPhone / Google Messages reaction sent as text ("Loved “…”");
//   • a sign-off on its own: "Thank you", "Thanks Biki!", "ok cheers", "👍";
//   • an email from an automated or accounts address (no-reply@, notifications@,
//     accounts.receivable@, invoices@, remittance@…): supplier invoices and
//     statements, not customers.
// Anything with a question in it, or more than a short sign-off, still counts.

import { parseTapback } from '@/lib/sms-tapback'

const AUTOMATED = /(^|[.+_-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|newsletters?|alerts?)([.+_-]|@)/i
const ACCOUNTS = /^(accounts?([._-]?(receivable|payable|dept|team))?|ar|ap|billing|invoices?|invoicing|receivables?|payables?|finance|statements?|remittances?|payments?|creditors?|debtors?)(@|[._-]\d*@)/i

const PHRASES = [
  'thank you', 'thank u', 'no worries', 'no problem', 'all good', 'sounds good', 'will do', 'got it', 'too easy',
  'see you', 'see ya', 'much appreciated', 'appreciate it', 'have a good', 'have a great', 'have a nice', 'take care', 'all sorted', 'that works',
]
const WORDS = new Set([
  'thanks', 'thank', 'thankyou', 'thanku', 'thx', 'ty', 'tq', 'cheers', 'ta', 'ok', 'okay', 'okey', 'k', 'kk', 'okie',
  'great', 'perfect', 'awesome', 'noted', 'cool', 'nice', 'lovely', 'legend', 'legends', 'done', 'bye', 'then', 'so', 'much', 'heaps', 'very',
  'mate', 'guys', 'team', 'again', 'alright', 'sweet', 'brilliant', 'amazing', 'wonderful', 'appreciated', 'you', 'u', 'all', 'a', 'and',
  'day', 'night', 'one', 'weekend', 'evening', 'morning', 'afternoon', 'tonight', 'tomorrow', 'soon', 'later', 'xx', 'x', 'haha', 'lol',
])
const SIGN_OFF_START = new Set(['thanks', 'thank', 'thankyou', 'thx', 'ty', 'cheers', 'ta'])

/** True when the text is only a short sign-off or emoji, with no question in it. */
export function isSignOff(text: string | null | undefined): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (raw.includes('?') || raw.length > 80) return false
  let t = raw.toLowerCase().replace(/[’']/g, '')
  // Emoji, punctuation and symbols only (👍, ❤️, 🙏🙏, "!!").
  const letters = t.replace(/[^\p{L}\p{N}]+/gu, '')
  if (!letters) return /\p{Extended_Pictographic}/u.test(raw)
  for (const p of PHRASES) t = t.split(p).join(' ')
  const words = t.replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const unknown = words.filter(w => !WORDS.has(w))
  if (!unknown.length) return true
  // "Thanks Biki", "Cheers Sam!": a sign-off plus one name.
  const first = raw.toLowerCase().replace(/[^\p{L} ]+/gu, ' ').trim().split(/\s+/)[0]
  return SIGN_OFF_START.has(first) && unknown.length === 1 && words.length <= 5
}

/** True when the sender is an automated or accounts mailbox rather than a customer. */
export function isAutomatedSender(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase()
  if (!e.includes('@')) return false
  return AUTOMATED.test(e) || ACCOUNTS.test(e)
}

/** True when this customer message doesn't call for an answer. */
export function noReplyNeeded(m: { content?: string | null; sender_email?: string | null }): boolean {
  if (isAutomatedSender(m.sender_email)) return true
  if (parseTapback(m.content)) return true
  return isSignOff(m.content)
}
