import { NextRequest, NextResponse } from 'next/server'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

export async function POST(req: NextRequest) {
  try {
    const { userId, tier } = await req.json()
    if (!userId || !tier) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // Placeholder — in production, integrate with Stripe SDK
    return NextResponse.json({ 
      sessionId: 'cs_test_' + Math.random().toString(36).slice(2),
      message: 'Stripe integration requires STRIPE_SECRET_KEY env var and Stripe SDK'
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
