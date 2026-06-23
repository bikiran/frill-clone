import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mtfhctgdayeqrguodksv.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2JjaAFpxrqOb4BvEQjeAsw_4Ohehd_O'

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

export const supabase = (() => {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseClient
})()

export const createClient = () => supabase
