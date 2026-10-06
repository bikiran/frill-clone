import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Inbound email webhooks. Resend signs them Svix-style: svix-signature carries
 * "v1,<base64 HMAC-SHA256(key, `${svix-id}.${svix-timestamp}.${body}`)>" where
 * key is the base64 part of the whsec_… secret (Resend → Webhooks → Signing
 * secret). Other providers can instead add ?token=<EMAIL_WEBHOOK_TOKEN> to the URL.
 *
 * With neither RESEND_WEBHOOK_SECRET nor EMAIL_WEBHOOK_TOKEN set the check can't
 * run, so mail is let through with a warning. EMAIL_WEBHOOK_VERIFY=log turns
 * enforcement off as an emergency switch.
 */
const MAX_AGE_SEC = 5 * 60

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function emailWebhookOk(req: NextRequest, raw: string): boolean {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim()
  const token = (process.env.EMAIL_WEBHOOK_TOKEN || '').trim()
  if (!secret && !token) {
    console.warn('[email webhook] RESEND_WEBHOOK_SECRET / EMAIL_WEBHOOK_TOKEN not set; inbound mail is not being verified')
    return true
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
  if (!ok) console.warn('[email webhook] signature check failed')
  return ok || ['log', 'off'].includes((process.env.EMAIL_WEBHOOK_VERIFY || '').toLowerCase())
}
