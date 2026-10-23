import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'

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

export function sign(token: string, url: string, form: FormData): string {
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

// The URL as Twilio called it, which is the URL Colvy gave Twilio (status
// callbacks) or the one set on the number. Behind Vercel, req.url already
// carries the public host; behind another proxy the forwarded headers do. The
// configured site URL (colvyBaseUrl, which builds every callback URL) covers a
// request that reached the app under an internal host. Twilio's own validators
// also try the URL with and without the default port, so do we.
export function candidateUrls(req: { url: string; headers: Headers }): string[] {
  const u = new URL(req.url)
  const tail = u.pathname + u.search
  const out = new Set<string>([req.url])
  const first = (v: string | null) => (v || '').split(',')[0].trim()
  const fh = first(req.headers.get('x-forwarded-host')) || first(req.headers.get('host'))
  const fp = first(req.headers.get('x-forwarded-proto')) || 'https'
  if (fh) out.add(`${fp}://${fh}${tail}`)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (site) out.add(`${site}${tail}`)
  out.add(`${colvyBaseUrl()}${tail}`)
  for (const x of Array.from(out)) {
    try {
      const v = new URL(x)
      const dflt = v.protocol === 'https:' ? '443' : '80'
      if (v.port === dflt || !v.port) {
        out.add(`${v.protocol}//${v.hostname}${v.pathname}${v.search}`)
        out.add(`${v.protocol}//${v.hostname}:${dflt}${v.pathname}${v.search}`)
      }
    } catch {}
  }
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

/**
 * twilioSignatureOk takes a signature from Colvy's master account or from ANY
 * business's connected Twilio account, so on its own it doesn't say which
 * business a request is about: a business that connected its own Twilio
 * account could sign a made-up inbound text or call to another business's
 * number, or a callback naming another business's call. Once the route knows
 * the business (from the dialled number or the callback's companyId), this
 * checks the request was signed by Colvy's master account or by that
 * business's own account. With no business, only the master account counts.
 * TWILIO_WEBHOOK_VERIFY=log/off switches it off too.
 */
export async function twilioSignedFor(req: NextRequest, form: FormData | null, db: any, companyId: string | null | undefined): Promise<boolean> {
  const mode = (process.env.TWILIO_WEBHOOK_VERIFY || 'enforce').toLowerCase()
  if (mode === 'log' || mode === 'off') return true
  const sig = req.headers.get('x-twilio-signature') || ''
  if (!sig || !form) return false
  const tokens: string[] = []
  if (TWILIO_MASTER.authToken) tokens.push(TWILIO_MASTER.authToken)
  const accountSid = String(form.get('AccountSid') || '')
  if (companyId && accountSid && accountSid !== TWILIO_MASTER.accountSid) {
    try {
      const { data } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', companyId).maybeSingle()
      if (data?.auth_token && data.account_sid === accountSid && !tokens.includes(data.auth_token)) tokens.push(data.auth_token)
    } catch {}
  }
  const urls = candidateUrls(req)
  const ok = tokens.some(t => urls.some(url => same(sign(t, url, form), sig)))
  if (!ok) console.warn('[twilio] not signed by Colvy or this business\'s own Twilio account:', new URL(req.url).pathname, 'company', companyId || '-', 'account', accountSid || '-')
  return ok
}

/**
 * Strict check for callbacks only Colvy's own (master) Twilio account can send,
 * such as sign-up code delivery reports: the AccountSid must be the master
 * account and the signature must match its auth token. Unlike
 * twilioSignatureOk, TWILIO_WEBHOOK_VERIFY doesn't switch this off, and a
 * business's own Twilio credentials never count.
 */
export function twilioMasterSignatureOk(req: NextRequest, form: FormData | null): boolean {
  const sig = req.headers.get('x-twilio-signature') || ''
  if (!sig || !form || !TWILIO_MASTER.accountSid || !TWILIO_MASTER.authToken) return false
  if (String(form.get('AccountSid') || '') !== TWILIO_MASTER.accountSid) return false
  const ok = candidateUrls(req).some(url => same(sign(TWILIO_MASTER.authToken, url, form), sig))
  // Says which URL was checked, so a host or proxy mismatch shows in the logs.
  if (!ok) console.warn('[twilio] master signature check failed for', new URL(req.url).pathname, 'host', req.headers.get('x-forwarded-host') || req.headers.get('host') || '?', 'tried', candidateUrls(req).map(u => new URL(u).origin).filter((v, i, a) => a.indexOf(v) === i).join(' '))
  return ok
}
