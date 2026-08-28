// Contact-name validation — the single source of truth for "is this string an
// actual person's or business's name, or is it a sentence / phrase / fragment of
// a message or call transcript?".
//
// A contact's `name` must NEVER be a sentence, a conversational phrase, message
// content, a transcription fragment, a subject line, or enquiry text. Every
// LOW-CONFIDENCE name source (AI extraction, self-introduction regexes, the
// call-summary heuristic) is gated through `isLikelyPersonName` before it can be
// persisted, so junk like "looking for" or "I need help" can never become a
// contact name. High-confidence structured sources (caller-ID/CNAM, CRM /
// customer / order records, a form field the customer filled in, a channel
// profile) are trusted and skip the heuristic — see `shouldWriteContactName`.
//
// Confidence order (highest → lowest):
//   explicit contact/profile name  >  matched CRM/customer/order name
//   >  a name the customer explicitly states ("my name is …")  >  AI-inferred
// Only the top three are trusted; an AI-inferred value is persisted ONLY when it
// clearly resembles a real name (isLikelyPersonName) AND no real name exists yet.
//
// Keep this file DEPENDENCY-FREE and identical in spirit between colvy-mobile
// and frill-clone, and Hermes-safe (no \p{...} unicode property escapes).

// Latin letters incl. common accents (AU/English customer base), no \p{L} so it
// runs on Hermes. A single name-ish token: a letter, then letters/’/-/. only.
const LETTER = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF"
const NAME_TOKEN = new RegExp(`^[${LETTER}][${LETTER}'.\\-]*$`)
const ONLY_LETTERS = new RegExp(`[^${LETTER}]`, 'g')

// Intent verbs / contractions that NEVER appear in a real name. If ANY token
// matches (case-insensitive), the value is a phrase, not a name.
const HARD_PHRASE_WORDS = new Set([
  "i'm", 'im', "i've", 'ive', "i'd", "i'll", "you're", 'youre', "we're",
  "they're", "it's", "that's", "what's", "here's", "can't", "don't", "won't",
  "isn't", "wasn't", "doesn't", "didn't",
  'looking', 'want', 'wants', 'wanting', 'wanted', 'need', 'needs', 'needing',
  'needed', 'trying', 'tried', 'calling', 'called', 'asking', 'asked',
  'wondering', 'wondered', 'hoping', 'hoped', 'enquiring', 'enquire', 'enquiry',
  'inquiring', 'inquire', 'inquiry', 'interested', 'seeking', 'chasing',
  'checking', 'requesting', 'regarding', 'wanna', 'gonna',
  'quote', 'refund', 'complaint', 'appointment', 'booking', 'query', 'queries',
])

// Sentence starters / filler. Rejected when they LEAD the value, and any value
// containing two or more of them anywhere is treated as a phrase. Deliberately
// excludes real given names that double as words (Will, May, Grace, Hope, June,
// Rose, Faith, Joy, Dawn, April, Summer, Bill, Mark…).
const STARTER_WORDS = new Set([
  'i', 'hi', 'hiya', 'hello', 'hey', 'yeah', 'yep', 'yes', 'no', 'nah', 'ok',
  'okay', 'um', 'uh', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'we', 'you', 'they', 'he', 'she', 'it',
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'do', 'does', 'did',
  'can', 'could', 'would', 'should', 'have', 'has', 'had', 'please', 'thanks',
  'thank', 'cheers', 'sorry', 'just', 'still', 'also', 'about', 'for', 'to',
  'of', 'with', 'from', 'and', 'or', 'but', 'so', 'get', 'got', 'help',
  'good', 'morning', 'afternoon', 'evening', 'call', 'phone', 'there',
])

const PHONE_LIKE = /^\+?\d[\d\s()\-]{5,}$/
// Sentence punctuation / symbols that a real name never contains (a name may
// carry ' . -). Presence of any of these ⇒ not a name.
const SENTENCE_PUNCT = /[?!,:;@/\\()"_+*=]|\.\./

/**
 * True when `value` plausibly IS a real person's or business's name, rather than
 * a sentence, phrase, or fragment of message/transcript/summary text. Used as
 * the final gate on every low-confidence (AI / extracted) name before it may be
 * saved. Conservative by design: when unsure, it returns false so the caller
 * leaves the name unknown instead of inventing one.
 */
export function isLikelyPersonName(value?: string | null): boolean {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  if (raw.length > 60) return false
  if (/\d/.test(raw)) return false            // no order/phone numbers in a name
  if (SENTENCE_PUNCT.test(raw)) return false  // no sentence punctuation

  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 5) return false
  const lower = tokens.map(t => t.toLowerCase())

  if (lower.some(t => HARD_PHRASE_WORDS.has(t))) return false   // intent verb anywhere
  if (STARTER_WORDS.has(lower[0])) return false                 // leads with filler
  if (lower.filter(t => STARTER_WORDS.has(t)).length >= 2) return false // "is there a"

  if (!tokens.every(t => NAME_TOKEN.test(t))) return false      // every token name-shaped
  if (!tokens.some(t => t.replace(ONLY_LETTERS, '').length >= 2)) return false // ≥1 real word
  return true
}

/**
 * Placeholder names that a chat/call auto-creates (or a bare phone number).
 * These may be REPLACED by a detected real name. Anything else is treated as a
 * human-confirmed name and must not be overwritten by a lower-confidence value.
 */
export function isPlaceholderContactName(v?: string | null): boolean {
  const s = String(v ?? '').trim()
  if (!s) return true
  return /^(visitor|guest|unknown|unknown contact|customer|caller|no caller id|anonymous|new (sms|live chat|email|chat) enquiry.*)$/i.test(s)
    || PHONE_LIKE.test(s)
}

/**
 * Central decision for whether `candidate` should be written over `existing`.
 *  - `trusted` marks a high-confidence structured source (caller-ID/CNAM, CRM /
 *    customer / order record, a form field, a channel profile). Those skip the
 *    person-name heuristic (a legitimate business name may not look like a
 *    personal name) but must still be non-empty and not a bare phone number.
 *  - Low-confidence values (AI / transcript / message extraction) MUST pass
 *    `isLikelyPersonName`.
 *  - An existing real (non-placeholder) name is never overwritten.
 */
export function shouldWriteContactName(
  existing: string | null | undefined,
  candidate: string | null | undefined,
  opts: { trusted?: boolean } = {},
): boolean {
  const cand = String(candidate ?? '').trim()
  if (!cand) return false
  if (opts.trusted) {
    if (PHONE_LIKE.test(cand)) return false
  } else if (!isLikelyPersonName(cand)) {
    return false
  }
  return isPlaceholderContactName(existing)
}
