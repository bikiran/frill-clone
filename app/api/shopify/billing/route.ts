import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { needsRecheck, partnerApiConfigured, planSelectionUrl, syncShopifyBilling } from '@/lib/shopify-billing'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId=[&refresh=1] → how this workspace's Colvy plan is billed.
// Shopify-billed: { provider: 'shopify', plan, store, planUrl, subscription }
// (re-read from Shopify when it's more than a couple of minutes old).
// Otherwise: { provider: 'stripe' }.
export async function GET(req: NextRequest) {
  const db = admin()
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { data: co } = await db.from('companies').select('id, plan, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
  if (!co || co.billing_provider !== 'shopify' || !co.billing_integration_id) return NextResponse.json({ provider: 'stripe' })

  const { data: integ } = await db.from('shopify_integrations')
    .select('id, store_name, store_domain, is_active, billing, billing_checked_at').eq('id', co.billing_integration_id).maybeSingle()
  let subscription = integ?.billing || null
  let note: string | null = null
  if (integ?.is_active && (req.nextUrl.searchParams.get('refresh') === '1' || needsRecheck(integ, 2 * 60 * 1000))) {
    try { subscription = await syncShopifyBilling(db, co.id) } catch { note = 'Shopify didn’t answer just now — showing your last known plan.' }
  }
  const { data: after } = await db.from('companies').select('plan, trial_ends_at').eq('id', co.id).maybeSingle()
  return NextResponse.json({
    provider: 'shopify',
    plan: after?.plan || co.plan,
    trialEndsAt: after?.trial_ends_at || null,
    store: integ ? { name: integ.store_name || integ.store_domain, domain: integ.store_domain, active: !!integ.is_active } : null,
    planUrl: integ ? planSelectionUrl(integ.store_domain) : null,
    subscription,
    configured: partnerApiConfigured(),
    note,
  })
}
