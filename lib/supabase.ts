import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mtfhctgdayeqrguodksv.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2JjaAFpxrqOb4BvEQjeAsw_4Ohehd_O'

// ── Cross-subdomain session sharing ──────────────────────────────────────────
// By default, Supabase stores the session in a cookie scoped to the current
// hostname. A user who signs in on colvy.com gets a cookie that neplay.colvy.com
// can't read — they have to sign in again on each subdomain.
//
// Fix: use localStorage (which persists per-origin, but is readable by JS on
// the same origin) combined with a redirect flow: after signing in on colvy.com
// we redirect to the user's subdomain URL with the session tokens in the hash
// fragment, and the subdomain picks them up and stores them locally.
//
// Supabase already supports this pattern via the 'implicit' flow + detectSessionInUrl.

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

export const supabase = (() => {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Use localStorage so the session persists across page navigations
        // without relying on same-site cookies.
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'colvy-auth-token',
        // Automatically detect the access_token / refresh_token in the URL
        // hash when we redirect from colvy.com → subdomain after sign-in.
        detectSessionInUrl: true,
        // Use PKCE flow — more secure and works with redirects across origins
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return supabaseClient
})()

export const createClient = () => supabase
