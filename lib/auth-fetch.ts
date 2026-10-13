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
  return fetchWithLimit(input, { ...init, headers }, read ? API_READ_TIMEOUT_MS : null)
}
