import { callerUser, requireCompanyAccess } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { BRANDING_ADDON } from '@/lib/branding-addon'
import { shopifyChargeBlock } from '@/lib/shopify-billing'
import { billingUnavailableCopy, checkoutBlockers, isKnownTier, priceIdFor } from '@/lib/billing-config'
import { alertBillingNotConfigured } from '@/lib/billing-alert'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import { checkoutTaxParams } from '@/lib/tax-invoice-core'

// The secret key and price IDs come from the environment (lib/billing-config
// lists them; super admin → Billing shows which are missing). When they're
// not set the customer gets a plain message with Colvy's contact details,
// never env var names, and the Colvy team is alerted once a day.

/** The response when billing isn't set up: friendly copy, plus `setup` so the page knows. */
function unavailable() {
  const copy = billingUnavailableCopy()
  return NextResponse.json({ setup: true, title: copy.title, error: copy.message }, { status: 200 })
}

async function companyName(db: any, companyId: string | null, userId: string): Promise<{ id: string | null; name: string | null }> {
  try {
    const q = db.from('companies').select('id, name').limit(1)
    const { data } = await (companyId ? q.eq('id', companyId) : q.eq('owner_id', userId))
    return { id: data?.[0]?.id || companyId, name: data?.[0]?.name || null }
  } catch { return { id: companyId, name: null } }
}

// A Stripe error that means Colvy's setup is wrong (bad key, a price ID that
// doesn't exist in this Stripe account or mode), not something the customer did.
function isSetupError(err: any): boolean {
  const t = String(err?.type || err?.rawType || '')
  if (t === 'StripeAuthenticationError' || t === 'authentication_error' || t === 'StripePermissionError') return true
  if ((t === 'StripeInvalidRequestError' || t === 'invalid_request_error') && (err?.code === 'resource_missing' || /price|product/i.test(String(err?.param || '')))) return true
  return false
}

export async function POST(req: NextRequest) {
  let tierOf = '', billingOf = 'monthly'
  try {
    const body = await req.json()
    const { tier, billing = 'monthly', trial = false } = body
    tierOf = String(tier || ''); billingOf = String(billing || 'monthly')
    // Who is subscribing comes from the sign-in, not the request: a body userId
    // let anyone attach a checkout to someone else's subscription row.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const caller = await callerUser(req, db)
    if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const userId = caller.id
    const email = body.email || caller.email
    let companyId: string | null = body.companyId || null
    if (companyId && !(await requireCompanyAccess(req, db, companyId)).ok) companyId = null

    if (!tier || !isKnownTier(tier)) {
      return NextResponse.json({ error: 'That plan isn’t available. Refresh the page and try again.' }, { status: 400 })
    }

    // A workspace using Colvy through the Shopify app pays through Shopify
    // (App Store rule 1.2.1, lib/shopify-billing): no plan or add-on by card.
    {
      let cid = companyId
      if (!cid) {
        const { data: owned } = await db.from('companies').select('id').eq('owner_id', userId).limit(1)
        cid = owned?.[0]?.id || null
      }
      const viaShopify = await shopifyChargeBlock(db, cid, tier === BRANDING_ADDON ? 'addon' : 'plan')
      if (viaShopify) return NextResponse.json(viaShopify, { status: 409 })
    }

    const blockers = checkoutBlockers(tier, billing, process.env)
    if (blockers.length) {
      console.error(`[stripe/create-checkout] billing not set up for ${tier} (${billing}): missing or wrong ${blockers.join(', ')}`)
      const co = await companyName(db, companyId, userId)
      await alertBillingNotConfigured(db, { companyId: co.id, companyName: co.name, tier, billing, missing: blockers })
      return unavailable()
    }
    const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim()
    const priceId = priceIdFor(tier, billing, process.env)

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any })

    const origin = req.headers.get('origin') || 'https://colvy.com'

    // Checkout always takes the card. A workspace still in its Colvy trial
    // isn't charged until that trial ends (Stripe trial_end = the company's
    // trial_ends_at), so choosing a plan early never stacks a second 14 days
    // and the first charge lands when the trial they signed up for runs out.
    // Past the trial (or no trial on record), the first payment is taken now.
    // With 'if_required' and a fresh 14 days, Stripe asked for an email only,
    // so trials ended with no card on file and nothing to charge.
    let trialEnd: number | null = null
    if (trial) {
      try {
        const q = db.from('companies').select('trial_ends_at').limit(1)
        const { data } = await (companyId ? q.eq('id', companyId) : q.eq('owner_id', userId))
        const ends = Date.parse(String(data?.[0]?.trial_ends_at || ''))
        // Stripe needs trial_end at least 48 hours out; a shorter remainder is charged now.
        if (Number.isFinite(ends) && ends - Date.now() > 48 * 3600_000) trialEnd = Math.floor(ends / 1000)
      } catch {}
    }
    const trialParams: any = {
      payment_method_collection: 'always',
      ...(trialEnd ? { subscription_data: { trial_end: trialEnd, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } } : {}),
    }

    // The branding add-on is its own subscription on top of whatever plan the
    // workspace has. Tag it (session AND subscription metadata) so the webhook
    // grants the add-on instead of treating it as a plan change, and put it on
    // the customer's existing Stripe customer so the billing portal shows both.
    if (tier === BRANDING_ADDON) {
      if (!companyId) {
        const { data: own } = await db.from('companies').select('id').eq('owner_id', userId).limit(1)
        companyId = own?.[0]?.id || null
      }
      if (!companyId) return NextResponse.json({ error: 'Couldn’t find your workspace. Refresh the page and try again.' }, { status: 400 })
      const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
      const addonMeta = { kind: 'addon', addon: BRANDING_ADDON, companyId, userId }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        ...(sub?.stripe_customer_id ? { customer: sub.stripe_customer_id } : { customer_email: email }),
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: addonMeta,
        subscription_data: { metadata: addonMeta },
        success_url: `${origin}/admin/billing?addon=branding`,
        cancel_url:  `${origin}/admin/billing`,
        // The buyer can add their ABN for the tax invoice (lib/tax-invoice-core).
        ...checkoutTaxParams(process.env, { mode: 'subscription', customer: sub?.stripe_customer_id || null }),
      } as any)
      return NextResponse.json({ url: session.url, sessionId: session.id })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, tier, billing, ...(companyId ? { companyId } : {}) },
      success_url: `${origin}/admin/billing?success=1`,
      cancel_url:  `${origin}/admin/billing`,
      ...trialParams,
      // The workspace on the subscription too, so every renewal's tax invoice
      // knows whose it is (lib/tax-invoices), and the buyer can add their ABN.
      subscription_data: { ...(trialParams.subscription_data || {}), metadata: { userId, tier, ...(companyId ? { companyId } : {}) } },
      ...checkoutTaxParams(process.env, { mode: 'subscription' }),
    } as any)

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    if (isSetupError(err)) {
      try {
        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
        await alertBillingNotConfigured(db, { tier: String(tierOf || ''), billing: billingOf, missing: [], detail: `Stripe said: ${String(err?.message || '').slice(0, 200)}` })
      } catch {}
      return unavailable()
    }
    return NextResponse.json({ error: `We couldn’t start the checkout. Please try again in a minute, or contact us at ${COLVY_CONTACT.email} or ${COLVY_CONTACT.phoneDisplay}.` }, { status: 500 })
  }
}
