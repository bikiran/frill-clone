// Cloudflare Turnstile: a free, mostly invisible "are you human?" check on
// sign-up, so bots can't create accounts or make Colvy send them SMS codes.
//
// Off until both keys are set (NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget,
// TURNSTILE_SECRET_KEY for this check), so deploying it can't block sign-ups.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY

/** The caller's IP, for Cloudflare's check (optional, but makes it stricter). */
export function requestIp(headers: Headers): string | undefined {
  const fwd = headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || headers.get('x-real-ip') || undefined
}

/**
 * Is this token from a real visitor? Always true when Turnstile isn't set up.
 * A token passes once only, and expires after five minutes.
 */
export async function verifyTurnstile(token: unknown, ip?: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true }
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'missing' }
  try {
    const form = new URLSearchParams({ secret, response: token })
    if (ip) form.set('remoteip', ip)
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const data: any = await res.json().catch(() => ({}))
    if (data?.success) return { ok: true }
    return { ok: false, reason: (data?.['error-codes'] || []).join(',') || `http ${res.status}` }
  } catch (e: any) {
    // Cloudflare unreachable: let the person through rather than block every
    // sign-up during an outage (the email + SMS codes still have to be entered).
    console.warn('[turnstile] verify failed, allowing:', e?.message || e)
    return { ok: true, reason: 'unreachable' }
  }
}

export const TURNSTILE_FAILED = 'Please confirm you’re human (tick the check above) and try again.'
