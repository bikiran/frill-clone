import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TWILIO_MASTER } from '@/lib/twilio-platform'

/**
 * Twilio signs every webhook (SMS, voice, status callbacks) with the auth token
 * of the account it belongs to: X-Twilio-Signature = base64(HMAC-SHA1(token,
 * url + each POST field name+value, sorted by name)). Without this check anyone
 * could post a fake inbound text or call event.
 *
 * The token is picked from the request's AccountSid: Colvy's master account
 * (numbers Colvy provisioned) or the business's own connected Twilio account.
 *
 * TWILIO_WEBHOOK_VERIFY=log (or off) in the environment turns enforcement off
 * as an emergency switch; failures are always logged.
 */

function sign(token: string, url: string, form: FormData): string {
  const pairs: [string, string][] = []
  form.forEach((v, k) => { pairs.push([k, typeof v === 'string' ? v : '']) })
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const data = url + pairs.map(([k, v]) => k + v).join('')
  return createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// The URL as Twilio called it. Behind Vercel, req.url already carries the public
// host; the forwarded headers and the configured site URL cover proxies.
function candidateUrls(req: NextRequest): string[] {
  const u = new URL(req.url)
  const tail = u.pathname + u.search
  const out = new Set<string>([req.url])
  const fh = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const fp = req.headers.get('x-forwarded-proto') || 'https'
  if (fh) out.add(`${fp}://${fh}${tail}`)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (site) out.add(`${site}${tail}`)
  return Array.from(out)
}

async function tokensFor(accountSid: string): Promise<string[]> {
  const tokens: string[] = []
  if (accountSid && accountSid === TWILIO_MASTER.accountSid && TWILIO_MASTER.authToken) tokens.push(TWILIO_MASTER.authToken)
  if (accountSid && accountSid !== TWILIO_MASTER.accountSid) {
    try {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
      const { data } = await db.from('twilio_integrations').select('auth_token').eq('account_sid', accountSid).limit(5)
      for (const r of data || []) if (r?.auth_token && !tokens.includes(r.auth_token)) tokens.push(r.auth_token)
    } catch {}
  }
  if (!tokens.length && TWILIO_MASTER.authToken) tokens.push(TWILIO_MASTER.authToken)
  return tokens
}

/** True when the request really came from Twilio (or enforcement is switched off). */
export async function twilioSignatureOk(req: NextRequest, form: FormData | null): Promise<boolean> {
  const mode = (process.env.TWILIO_WEBHOOK_VERIFY || 'enforce').toLowerCase()
  const sig = req.headers.get('x-twilio-signature') || ''
  let ok = false
  if (sig && form) {
    const tokens = await tokensFor(String(form.get('AccountSid') || ''))
    outer: for (const t of tokens) for (const url of candidateUrls(req)) {
      if (same(sign(t, url, form), sig)) { ok = true; break outer }
    }
  }
  if (!ok) console.warn('[twilio] signature check failed for', new URL(req.url).pathname, sig ? '(bad signature)' : '(no signature)')
  return ok || mode === 'log' || mode === 'off'
}
