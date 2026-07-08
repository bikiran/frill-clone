import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mtfhctgdayeqrguodksv.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2JjaAFpxrqOb4BvEQjeAsw_4Ohehd_O'

// ── Session config ────────────────────────────────────────────────────────────
// Keep this simple — PKCE flow and custom storage broke Next.js Link navigation
// (caused "page couldn't load" on /signin and /signup from the landing page).
// The cross-subdomain session handoff is done via explicit token-in-URL redirect
// in the signin page, which works regardless of cookie storage.

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

export const supabase = (() => {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Use implicit flow (default) — simpler and more compatible with Next.js routing
        flowType: 'implicit',
      },
    })
  }
  return supabaseClient
})()

export const createClient = () => supabase
