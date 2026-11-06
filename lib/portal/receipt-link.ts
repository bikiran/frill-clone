// A private link to one receipt, for Send receipt (the team emails or texts a
// customer their receipt / tax invoice). No sign-in: the link is an HMAC over
// the business and the receipt it names (lib/portal/receipts keys such as
// "woo:<uuid>"), so it opens that one receipt and nothing else, and can't be
// changed to open another. It doesn't expire: a tax invoice is something a
// customer keeps.
//
// The key is RECEIPT_LINK_SECRET when set, otherwise derived from the service
// role key with its own label (so it can't be swapped for an email or OAuth
// token, lib/email-tokens, lib/oauth-state).

import { createHmac, timingSafeEqual } from 'crypto'
import { companyBase } from '@/lib/booking'
import { parseReceiptKey } from '@/lib/portal/receipts'

function key(): Buffer {
  const base = process.env.RECEIPT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base) throw new Error('No signing key for receipt links')
  return createHmac('sha256', base).update('colvy-receipt-link-v1').digest()
}

const mac = (body: string) => createHmac('sha256', key()).update(body).digest().subarray(0, 18).toString('base64url')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "<base64url of company|key>.<mac>" */
export function receiptToken(companyId: string, receiptKey: string): string {
  if (!UUID.test(companyId) || !parseReceiptKey(receiptKey)) throw new Error('Bad receipt')
  const body = Buffer.from(`${companyId}|${receiptKey}`).toString('base64url')
  return `${body}.${mac(body)}`
}

export function readReceiptToken(t: any): { companyId: string; key: string } | null {
  const m = /^([A-Za-z0-9_-]{20,200})\.([A-Za-z0-9_-]{24})$/.exec(String(t || ''))
  if (!m) return null
  const want = mac(m[1])
  const a = Buffer.from(m[2]), b = Buffer.from(want)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [companyId, ...rest] = Buffer.from(m[1], 'base64url').toString('utf8').split('|')
  const k = rest.join('|')
  return UUID.test(companyId) && parseReceiptKey(k) ? { companyId, key: k } : null
}

/** The receipt page on the business's own address. */
export function receiptUrl(company: any, token: string): string {
  return `${companyBase(company).base}/receipt/${token}`
}
