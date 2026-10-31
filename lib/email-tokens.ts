// Signed tokens for links in marketing email (server only). No sign-in is
// needed to use them, so each one is an HMAC over what it names:
//
//   • unsubscribe / preferences token: one contact of one business (and the
//     campaign it came from, for the report). Never expires: an unsubscribe
//     link has to keep working (Spam Act 2003), and all it can do is turn
//     marketing OFF for that one person, or show their preference page.
//   • recipient ref: one row of email_campaign_recipients, for the open pixel
//     and tracked links. Short, so 5,000 emails don't carry kilobytes each.
//
// The key is EMAIL_LINK_SECRET when set, otherwise derived from the service
// role key with its own label, so these can't be swapped for OAuth states
// (lib/oauth-state) or the other way round. Announcement emails sent before
// this used lib/oauth-state's 'ann-unsub' tokens; readUnsubToken still accepts
// those.

import { createHmac, timingSafeEqual } from 'crypto'
import { readValue } from '@/lib/oauth-state'

function key(label: string): Buffer {
  const base = process.env.EMAIL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base) throw new Error('No signing key for email links')
  return createHmac('sha256', base).update(`colvy-email-${label}-v1`).digest()
}

const mac = (label: string, body: string, bytes = 32) =>
  createHmac('sha256', key(label)).update(body).digest().subarray(0, bytes).toString('base64url')

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type UnsubToken = { co: string; c: string; cam?: string | null; legacy?: boolean; preview?: boolean }

const UUIDISH = /^[A-Za-z0-9-]{1,64}$/

/**
 * Token for one contact's unsubscribe / preference links. `preview` is for test
 * emails: the links open the real pages in the business's branding, but
 * nothing is changed (there's no customer behind them).
 */
export function signUnsubToken(t: { co: string; c: string; cam?: string | null; preview?: boolean }): string {
  const data: Record<string, string> = { k: 'u', co: t.co, c: t.c }
  if (t.cam) data.cam = t.cam
  if (t.preview) data.pv = '1'
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${mac('unsub', body, 18)}`
}

/** The contact and business a token names, or null if it's altered or unknown. */
export function readUnsubToken(token: string | null | undefined): UnsubToken | null {
  const s = String(token || '').trim()
  if (!s || s.length > 600 || !s.includes('.')) return null
  const [body, sig] = s.split('.', 2)
  try {
    if (sig && same(sig, mac('unsub', body, 18))) {
      const d = JSON.parse(Buffer.from(body, 'base64url').toString())
      if (d?.k !== 'u' || !UUIDISH.test(String(d.co || '')) || !UUIDISH.test(String(d.c || ''))) return null
      return { co: d.co, c: d.c, cam: d.cam && UUIDISH.test(String(d.cam)) ? d.cam : null, ...(d.pv === '1' ? { preview: true } : {}) }
    }
  } catch { return null }
  // Announcement emails sent before this module (lib/announcement-notify).
  const old = readValue(s, 'ann-unsub')
  if (old?.co && old?.c) return { co: String(old.co), c: String(old.c), cam: null, legacy: true }
  return null
}

/** Short ref for one recipient row: "<row id>.<mac>". */
export function signRecipientRef(recipientId: string): string {
  return `${recipientId}.${mac('ref', recipientId, 12)}`
}

/** The recipient row id a ref names, or null. */
export function readRecipientRef(ref: string | null | undefined): string | null {
  const s = String(ref || '').trim()
  const i = s.lastIndexOf('.')
  if (i <= 0 || s.length > 120) return null
  const id = s.slice(0, i), sig = s.slice(i + 1)
  if (!UUIDISH.test(id)) return null
  try { return same(sig, mac('ref', id, 12)) ? id : null } catch { return null }
}
