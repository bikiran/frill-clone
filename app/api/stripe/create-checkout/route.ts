import { NextRequest, NextResponse } from 'next/server'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

const PRICE_IDS: Record<string, Record<string, string>> = {
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
  // Legacy aliases
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID || '',
    annual:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID  || process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID  || '',
  },
}

export async function POST(req: NextRequest) {
  try {
    const { userId, tier, billing = 'monthly', email } = await req.json()

    if (!userId || !tier) {
      return NextResponse.json({ error: 'Missing userId or tier' }, { status: 400 })
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, tier, billing },
      success_url: `${origin}/admin/billing?success=1`,
      cancel_url:  `${origin}/admin/billing`,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
