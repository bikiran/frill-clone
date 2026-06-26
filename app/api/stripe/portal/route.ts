import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json()
    const secret = process.env.STRIPE_SECRET_KEY || ''
    if (!secret.startsWith('sk_')) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })

    const origin = req.headers.get('origin') || 'https://colvy.com'
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/admin/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
