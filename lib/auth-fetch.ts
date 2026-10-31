'use client'

import { supabase } from '@/lib/supabase'
import { fetchWithLimit, API_READ_TIMEOUT_MS } from '@/lib/net-timeout'

// fetch() for our own API routes that check who's calling: adds the signed-in
// user's access token as a Bearer header.
//
// Reads (GET) give up after API_READ_TIMEOUT_MS so a page shows an error rather
// than hanging when the database is down. Writes and AI calls (POST etc.) have
// no limit; pass your own `signal` to choose a different one.
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const headers = new Headers(init?.headers || {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const read = String(init?.method || 'GET').toUpperCase() === 'GET'
  return readableJson(await fetchWithLimit(input, { ...init, headers }, read ? API_READ_TIMEOUT_MS : null))
}

/**
 * What to say when the server answers with something that isn't JSON. That's
 * usually Vercel's own plain-text page ("An error occurred with your
 * deployment … FUNCTION_INVOCATION_TIMEOUT") after a route runs out of time or
 * crashes, which res.json() would report as "Unexpected token 'A'…".
 */
export function serverErrorText(status: number, body: string): string {
  if (status === 504 || /TIMEOUT/i.test(body)) return 'Colvy’s server took too long to finish this, so it stopped. Please try again in a moment.'
  if (status === 413 || /PAYLOAD_TOO_LARGE|Entity Too Large/i.test(body)) return 'That was too big to send. Try a smaller file or fewer items.'
  if (status >= 500) return `Colvy’s server ran into a problem (error ${status}). Please try again in a moment.`
  return `Colvy got an unexpected reply from the server${status >= 400 ? ` (error ${status})` : ''}. Please try again.`
}

// res.json() that throws serverErrorText() instead of a JSON parse error, so
// every caller's existing catch shows something a person can act on.
function readableJson(res: Response): Response {
  res.json = async () => {
    const text = await res.text()
    try { return JSON.parse(text) } catch { throw new Error(serverErrorText(res.status, text)) }
  }
  return res
}
