// Who a campaign's "Send a test" goes to: up to a few email addresses or
// Australian mobiles typed in by staff. Pure (no server imports), so the
// browser and the test-send routes check them the same way.

export const MAX_TEST_RECIPIENTS = 5

export type TestResult = { to: string; ok: boolean; error?: string }

/** Split what was typed or pasted into separate entries. Phone numbers keep their spaces. */
export function splitRecipients(kind: 'email' | 'sms', input: unknown): string[] {
  const parts = Array.isArray(input) ? input.map(String) : [String(input ?? '')]
  const sep = kind === 'email' ? /[\s,;]+/ : /[,;\n\r]+/
  return parts.flatMap(p => p.split(sep)).map(s => s.trim()).filter(Boolean)
}

/** A clean, lower-case email address, or '' when it isn't one. */
export function testEmail(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/^mailto:/i, '').toLowerCase()
  return /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i.test(s) ? s : ''
}

/** An Australian mobile as 04XXXXXXXX (from 04…, 4…, 614… or +614…), or '' when it isn't one. */
export function testMobile(raw: unknown): string {
  let d = String(raw ?? '').replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('61')) d = '0' + d.slice(2)
  if (/^4\d{8}$/.test(d)) d = '0' + d
  return /^04\d{8}$/.test(d) ? d : ''
}

/** 0412 345 678 */
export const fmtMobile = (m: string) => (/^04\d{8}$/.test(m) ? `${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}` : m)

/** The clean form of one entry for this channel, or '' when it isn't valid. */
export const cleanRecipient = (kind: 'email' | 'sms', raw: unknown) => (kind === 'email' ? testEmail(raw) : testMobile(raw))

/**
 * Check a request's list: every entry valid, no more than the limit, no
 * repeats. Returns the clean list, or the problem in words.
 */
export function readRecipients(kind: 'email' | 'sms', input: unknown): { list: string[]; error?: string } {
  const raw = splitRecipients(kind, input)
  const bad = raw.find(r => !cleanRecipient(kind, r))
  if (bad) return { list: [], error: kind === 'email' ? `“${bad.slice(0, 80)}” isn’t an email address.` : `“${bad.slice(0, 40)}” isn’t an Australian mobile number.` }
  const list = [...new Set(raw.map(r => cleanRecipient(kind, r)))]
  if (list.length > MAX_TEST_RECIPIENTS) return { list: [], error: `Send a test to up to ${MAX_TEST_RECIPIENTS} ${kind === 'email' ? 'addresses' : 'numbers'} at a time.` }
  return { list }
}
