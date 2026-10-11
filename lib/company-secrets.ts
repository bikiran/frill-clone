// Server-only access to a business's own secrets.
//
// A business that pastes its own Stripe secret key (Settings → Stripe → "use
// your own keys") used to have it stored on companies.stripe_secret_key — a
// table the browser can read. V351 moves it into company_secrets (server-only)
// and a trigger keeps it there, so this is the one place that reads it.
//
// Until V351 has run, it falls back to the old column, so deploying this code
// first changes nothing.

import { createClient } from '@supabase/supabase-js'

function serviceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as any
}

/** The business's own Stripe secret key, or null when it charges through
 *  Colvy's platform account (Connect) instead. */
export async function stripeSecretFor(company: any): Promise<string | null> {
  if (!company || company.stripe_mode !== 'keys') return null
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && company.id) {
    try {
      const { data } = await serviceDb().from('company_secrets').select('stripe_secret_key').eq('company_id', company.id).maybeSingle()
      const key = String(data?.stripe_secret_key || '').trim()
      if (key) return key
    } catch {}
  }
  const legacy = String(company.stripe_secret_key || '').trim()
  return legacy || null
}
