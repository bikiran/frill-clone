import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

// Creates a $2/month subscription checkout for a phone number. The number is
// provisioned by the Stripe webhook once payment succeeds (see stripe/webhook).
export async function POST(req: NextRequest) {
  try {
    const { companyId, email, phoneNumber, numberType } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!secret.startsWith('sk_')) {
      return NextResponse.json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to Vercel.' }, { status: 500 })
    }
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
    const origin = req.headers.get('origin') || 'https://colvy.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: { name: 'Colvy Business Number', description: 'Australian phone number for calls & SMS' },
          unit_amount: 200, // $2.00 AUD
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: {
        kind: 'phone_number',
        companyId,
        phoneNumber: phoneNumber || '',
        numberType: numberType || 'local',
      },
      success_url: `${origin}/admin/integrations/telnyx?provisioning=1`,
      cancel_url: `${origin}/admin/integrations/telnyx`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Number checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
