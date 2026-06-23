import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton pattern - only one instance
let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

export const supabase = (() => {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseClient
})()

// Export for backward compatibility
export const createClient = () => supabase
