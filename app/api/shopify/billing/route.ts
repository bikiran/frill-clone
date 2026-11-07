import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, callerUser } from '@/lib/company-access'
import { needsRecheck, partnerApiConfigured, planSelectionUrl, shopifyBillingStore, syncShopifyBilling, PAID_STATUSES } from '@/lib/shopify-billing'
import { CLAIM_COOKIE, findPendingInstall } from '@/lib/shopify-install'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId=[&refresh=1][&chosen=1] → how this workspace's Colvy plan is billed.
// Shopify-billed: { provider: 'shopify', plan, complimentary, store, planUrl, subscription }
// (re-read from Shopify when it's more than a couple of minutes old; chosen=1
// on the way back from Shopify's plan page applies the plan just picked).
// Installed from Shopify in this browser but not connected to a workspace
// yet: { provider: 'shopify', pending: { shop, name } } — never card plans.
// Otherwise: { provider: 'stripe' }.
export async function GET(req: NextRequest) {
  const db = admin()
  // ?mine=1 → { shopify }: does this person use Colvy through Shopify (a store
  // installed in this browser and waiting, or any workspace they own billed
  // through Shopify)? The public plan page asks before showing card plans.
  if (req.nextUrl.searchParams.get('mine') === '1') {
    const user = await callerUser(req, db)
    if (!user) return NextResponse.json({ shopify: false })
    const pending = await findPendingInstall(db, req.cookies.get(CLAIM_COOKIE)?.value).catch(() => null)
    if (pending) return NextResponse.json({ shopify: true, pending: true })
    const { data: owned } = await db.from('companies').select('id').eq('owner_id', user.id).limit(20)
    for (const c of owned || []) if (await shopifyBillingStore(db, c.id)) return NextResponse.json({ shopify: true })
    return NextResponse.json({ shopify: false })
  }
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  // Any store connected through the app makes the workspace Shopify-billed
  // (App Store rule 1.2.1); older connections are adopted here.
  await shopifyBillingStore(db, companyId)
  const { data: co } = await db.from('companies').select('id, owner_id, plan, is_complimentary, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
  if (!co || co.billing_provider !== 'shopify' || !co.billing_integration_id) {
    // Just installed from Shopify and not connected yet (App Store rule 1.2.2):
    // a Shopify merchant is never offered card billing, even for a moment.
    const p = await findPendingInstall(db, req.cookies.get(CLAIM_COOKIE)?.value).catch(() => null)
    if (p) return NextResponse.json({ provider: 'shopify', pending: { shop: p.shop, name: p.store_name || p.shop }, plan: co?.plan || 'free', configured: partnerApiConfigured() })
    return NextResponse.json({ provider: 'stripe' })
  }

  const { data: integ } = await db.from('shopify_integrations')
    .select('id, store_name, store_domain, is_active, billing, billing_checked_at').eq('id', co.billing_integration_id).maybeSingle()
  let subscription = integ?.billing || null
  let note: string | null = null
  if (integ?.is_active && (req.nextUrl.searchParams.get('refresh') === '1' || needsRecheck(integ, 2 * 60 * 1000))) {
    const chosen = req.nextUrl.searchParams.get('chosen') === '1'
    try { subscription = await syncShopifyBilling(db, co.id, { chosen }) } catch { note = 'Shopify didn’t answer just now — showing your last known plan.' }
  }
  const { data: after } = await db.from('companies').select('plan, trial_ends_at, is_complimentary').eq('id', co.id).maybeSingle()
  // Still paying Colvy by card from before the store was connected: the page
  // says so and links to the card portal to cancel once the Shopify plan starts.
  let cardSubscription: { tier: string | null; customerId: string } | null = null
  if (co.owner_id) {
    const { data: subs } = await db.from('subscriptions').select('tier, status, stripe_subscription_id, stripe_customer_id').eq('user_id', co.owner_id).limit(1)
    const sub = subs?.[0]
    if (sub?.stripe_subscription_id && sub.stripe_customer_id && PAID_STATUSES.includes(String(sub.status))) cardSubscription = { tier: sub.tier || null, customerId: sub.stripe_customer_id }
  }
  const plan = after?.plan || co.plan
  return NextResponse.json({
    provider: 'shopify',
    plan,
    // Given free by Colvy: no Shopify plan needed (the sync never overrides it).
    complimentary: !!(after ? after.is_complimentary : co.is_complimentary),
    // Set up by the Colvy team (Enterprise): nothing to choose or buy here.
    managed: plan === 'enterprise' || plan === 'suspended',
    cardSubscription,
    trialEndsAt: after?.trial_ends_at || null,
    store: integ ? { name: integ.store_name || integ.store_domain, domain: integ.store_domain, active: !!integ.is_active } : null,
    planUrl: integ ? planSelectionUrl(integ.store_domain) : null,
    subscription,
    configured: partnerApiConfigured(),
    note,
  })
}
