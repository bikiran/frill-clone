import { callerStripeCustomer } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // The caller's own billing customer — never one named in the request.
    const customerId = await callerStripeCustomer(req, createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }))
    if (!customerId) return NextResponse.json({ error: 'No billing account found for you.' }, { status: 404 })
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
