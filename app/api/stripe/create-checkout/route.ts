import { callerUser, requireCompanyAccess } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

const PRICE_IDS: Record<string, Record<string, string>> = {
  // Modular, product-based plans (see /pricing). One Stripe price per plan ×
  // billing period. Add these to the Vercel env in every environment.
  feedback: {
    monthly: process.env.STRIPE_FEEDBACK_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_FEEDBACK_ANNUAL_PRICE_ID  || '',
  },
  omnichannel: {
    monthly: process.env.STRIPE_OMNICHANNEL_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_OMNICHANNEL_ANNUAL_PRICE_ID  || '',
  },
  everything: {
    monthly: process.env.STRIPE_EVERYTHING_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_EVERYTHING_ANNUAL_PRICE_ID  || '',
  },
  startup: {
    monthly: process.env.STRIPE_STARTUP_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_STARTUP_ANNUAL_PRICE_ID  || '',
  },
  business: {
    monthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID  || '',
  },
  growth: {
    monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID  || '',
  },
  branding_removal: {
    monthly: process.env.STRIPE_BRANDING_REMOVAL_PRICE_ID || '',
    annual:  process.env.STRIPE_BRANDING_REMOVAL_PRICE_ID || '',
  },
  // Legacy aliases
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID  || process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID  || '',
  },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tier, billing = 'monthly', trial = false } = body
    // Who is subscribing comes from the sign-in, not the request: a body userId
    // let anyone attach a checkout to someone else's subscription row.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const caller = await callerUser(req, db)
    if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const userId = caller.id
    const email = body.email || caller.email
    let companyId: string | null = body.companyId || null
    if (companyId && !(await requireCompanyAccess(req, db, companyId)).ok) companyId = null

    if (!tier) {
      return NextResponse.json({ error: 'Missing tier' }, { status: 400 })
    }

    // A workspace using Colvy through the Shopify app pays through Shopify
    // (App Store rule, lib/shopify-billing) — never a second, Stripe charge.
    {
      const q = db.from('companies').select('id').eq('billing_provider', 'shopify').limit(1)
      const { data: viaShopify } = await (companyId ? q.eq('id', companyId) : q.eq('owner_id', userId))
      if (viaShopify?.length) return NextResponse.json({ error: 'Your Colvy plan is billed through Shopify. Change it from Billing → Choose plan in Shopify.', shopify: true }, { status: 409 })
    }

    const stripeKey = (STRIPE_SECRET || '').trim()
    if (!stripeKey || (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('sk_test_'))) {
      return NextResponse.json({
        error: `Stripe key missing or invalid. Got: "${stripeKey ? stripeKey.slice(0,8) + '...' : 'empty'}". Add STRIPE_SECRET_KEY (must start with sk_live_ or sk_test_) to ALL Vercel environments, then redeploy.`,
        setup: true
      }, { status: 200 })
    }

    const priceId = PRICE_IDS[tier]?.[billing]
    if (!priceId) {
      return NextResponse.json({
        error: `No price ID configured for plan "${tier}" (${billing}). Add STRIPE_${tier.toUpperCase()}_${billing.toUpperCase()}_PRICE_ID to Vercel env vars.`,
        setup: true
      }, { status: 200 })
    }

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any })

    const origin = req.headers.get('origin') || 'https://colvy.com'

    // "Start free trial" (marketing CTAs) starts a 14-day trial with no card up
    // front — matching the pricing promise. A plain upgrade collects the card now.
    const trialParams: any = trial
      ? { subscription_data: { trial_period_days: 14 }, payment_method_collection: 'if_required' }
      : {}

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, tier, billing, ...(companyId ? { companyId } : {}) },
      success_url: `${origin}/admin/billing?success=1`,
      cancel_url:  `${origin}/admin/billing`,
      ...trialParams,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
