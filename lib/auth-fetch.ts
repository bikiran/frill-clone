'use client'

import { supabase } from '@/lib/supabase'

// fetch() for our own API routes that check who's calling: adds the signed-in
// user's access token as a Bearer header.
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const headers = new Headers(init?.headers || {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
