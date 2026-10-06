import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signed values for the "Connect" flows (Facebook/Instagram, Gmail, Google
 * Reviews). The state used to be plain base64 JSON naming the company, so a
 * crafted link could attach someone's Page, inbox or reviews to another
 * workspace. Now:
 *   1. the settings page asks /api/oauth/ticket (members only) for a ticket;
 *   2. the start route checks the ticket and puts a signed state (company, the
 *      member who started it, where to return) in the provider link;
 *   3. the callback only trusts a state with a valid signature and expiry.
 * Server-only: keyed off the service-role key.
 */
const key = () => createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update('colvy-oauth-state-v1').digest()

export function signValue(data: Record<string, any>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString('base64url')
  const sig = createHmac('sha256', key()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function readValue(value: string | null | undefined, kind: string): Record<string, any> | null {
  if (!value || !value.includes('.')) return null
  const [body, sig] = value.split('.', 2)
  const want = createHmac('sha256', key()).update(body).digest('base64url')
  const a = Buffer.from(sig || ''), b = Buffer.from(want)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (data?.kind !== kind || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return data
  } catch { return null }
}

// Where a flow may send the browser back to: Colvy itself (any subdomain) or a
// local dev server. Anything else becomes ''.
export function safeReturn(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (u.protocol === 'https:' && (host === 'colvy.com' || host.endsWith('.colvy.com'))) return url
    if (u.protocol === 'http:' && host === 'localhost') return url
  } catch {}
  return ''
}
