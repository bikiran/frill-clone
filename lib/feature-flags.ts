import { createClient } from '@supabase/supabase-js'

// Operational feature toggles — distinct from PLAN features (lib/plan.ts).
//
// These are NOT about what a plan includes. They are runtime on/off switches for
// operational behaviours that ship ON for everyone and can be turned OFF per
// company by a super admin (platform-admin → company → Entitlements). They are
// stored in the SAME place as plan overrides (company_entitlements.features) but
// with DEFAULT-ON semantics: an absent key means enabled, so a flag can never
// silently disable a running feature just because no row exists.

export const OPERATIONAL_FLAGS: { key: string; label: string; desc: string }[] = [
  {
    key: 'order_auto_reconcile',
    label: 'Order auto-reconcile',
    desc: 'The order-sync worker reconciles the board to the store every few minutes (recovers paid-but-cancelled orders, applies terminal states, refreshes payment). Off = new orders still import, but no automatic reconciliation of existing ones.',
  },
  // media_sms_fallback and posthog_analytics are added in a follow-up once their
  // client-side gates are wired, so a shown toggle always takes full effect.
]
export const OPERATIONAL_FLAG_KEYS = OPERATIONAL_FLAGS.map(f => f.key)

// Default-ON read from an already-resolved features map (client or server).
// undefined/null → enabled; only an explicit `false` disables.
export function flagEnabled(features: Record<string, any> | null | undefined, key: string): boolean {
  const v = features?.[key]
  return v === undefined || v === null ? true : !!v
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Server-side: is an operational flag enabled for a company? Default ON; only an
// explicit per-company `false` override disables it. Never throws — a lookup
// failure leaves the feature ON so an outage can't silently switch it off.
export async function companyFlagEnabled(db: any, companyId: string, key: string): Promise<boolean> {
  try {
    const client = db || admin()
    const { data } = await client.from('company_entitlements').select('features').eq('company_id', companyId).maybeSingle()
    return flagEnabled(data?.features, key)
  } catch {
    return true
  }
}
