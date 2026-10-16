import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Inbound email webhooks. Resend signs them Svix-style: svix-signature carries
 * "v1,<base64 HMAC-SHA256(key, `${svix-id}.${svix-timestamp}.${body}`)>" where
 * key is the base64 part of the whsec_… secret (Resend → Webhooks → Signing
 * secret). Other providers can instead add ?token=<EMAIL_WEBHOOK_TOKEN> to the URL.
 *
 * With neither RESEND_WEBHOOK_SECRET nor EMAIL_WEBHOOK_TOKEN set the check can't
 * run, so the payload is treated as untrusted (see emailWebhookTrust) rather
 * than refused. EMAIL_WEBHOOK_VERIFY=log (or off) is the emergency switch for a
 * failing check: the payload is then handled as untrusted too.
 */
const MAX_AGE_SEC = 5 * 60

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type EmailWebhookTrust = 'verified' | 'unverified' | 'refused'

/** Is the inbound webhook set up to be verified (a signing secret or token)? */
export function emailWebhookSigned(): boolean {
  return !!((process.env.RESEND_WEBHOOK_SECRET || '').trim() || (process.env.EMAIL_WEBHOOK_TOKEN || '').trim())
}

let warnedUnverified = false

/**
 * How far to trust an inbound email webhook:
 *   verified   — the Resend (Svix) signature or ?token= matched.
 *   unverified — nothing is configured to check it with. Not refused (that
 *                would silently stop all inbound email if the secret isn't
 *                set), but the payload is UNTRUSTED: the route uses only its
 *                email_id and takes everything else from Resend's own copy
 *                of the email (app/api/webhooks/email).
 *   refused    — a secret/token IS configured and this request doesn't match.
 * EMAIL_WEBHOOK_VERIFY=log|off downgrades a failed check to 'unverified'.
 */
export function emailWebhookTrust(req: NextRequest, raw: string): EmailWebhookTrust {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim()
  const token = (process.env.EMAIL_WEBHOOK_TOKEN || '').trim()
  if (!secret && !token) {
    if (!warnedUnverified) {
      warnedUnverified = true
      console.warn('[email webhook] RESEND_WEBHOOK_SECRET / EMAIL_WEBHOOK_TOKEN not set: payloads are unverified, so only their email_id is used and the email is re-fetched from Resend')
    }
    return 'unverified'
  }
  let ok = false
  const given = req.nextUrl.searchParams.get('token') || ''
  if (token && given && same(given, token)) ok = true
  if (!ok && secret) {
    try {
      const id = req.headers.get('svix-id') || ''
      const ts = req.headers.get('svix-timestamp') || ''
      const sigs = (req.headers.get('svix-signature') || '').split(' ').map(s => s.split(',')[1] || '').filter(Boolean)
      const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= MAX_AGE_SEC
      if (id && ts && sigs.length && fresh) {
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
        const want = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64')
        ok = sigs.some(s => same(s, want))
      }
    } catch { ok = false }
  }
  if (ok) return 'verified'
  console.warn('[email webhook] signature check failed')
  return ['log', 'off'].includes((process.env.EMAIL_WEBHOOK_VERIFY || '').toLowerCase()) ? 'unverified' : 'refused'
}

/** Back-compat: anything but a refusal. */
export function emailWebhookOk(req: NextRequest, raw: string): boolean {
  return emailWebhookTrust(req, raw) !== 'refused'
}
