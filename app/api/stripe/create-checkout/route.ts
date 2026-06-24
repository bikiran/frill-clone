import { NextRequest, NextResponse } from 'next/server'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

// Stripe Price IDs — set these in Vercel env vars
const PRICE_IDS: Record<string, Record<string, string>> = {
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
    annual:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID  || 'price_pro_annual',
  },
  enterprise: {
    monthly: process.env.STRIPE_ENT_MONTHLY_PRICE_ID || 'price_ent_monthly',
    annual:  process.env.STRIPE_ENT_ANNUAL_PRICE_ID  || 'price_ent_annual',
  },
}

export async function POST(req: NextRequest) {
  try {
    const { userId, tier, billing = 'monthly', email } = await req.json()

    if (!userId || !tier) {
      return NextResponse.json({ error: 'Missing userId or tier' }, { status: 400 })
    }
    if (!STRIPE_SECRET || !STRIPE_SECRET.startsWith('sk_')) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured', setup: true }, { status: 200 })
    }

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' as any })

    const priceId = PRICE_IDS[tier]?.[billing]
    if (!priceId || priceId.startsWith('price_pro') || priceId.startsWith('price_ent')) {
      return NextResponse.json({ error: 'Price ID not configured for ' + tier, setup: true }, { status: 200 })
    }

    const origin = req.headers.get('origin') || 'https://frill-clone.vercel.app'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, tier, billing },
      success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/upgrade`,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('Stripe error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
