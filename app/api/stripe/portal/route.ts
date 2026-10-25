import { callerStripeCustomer, callerUser } from '@/lib/company-access'
import { shopifyBillingStore } from '@/lib/shopify-billing'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

export async function POST(req: NextRequest) {
  try {
    // The caller's own billing customer — never one named in the request.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const customerId = await callerStripeCustomer(req, db)
    if (!customerId) return NextResponse.json({ error: 'No billing account found for you.' }, { status: 404 })
    // A workspace using Colvy through the Shopify app manages billing in
    // Shopify, never on a Stripe page (App Store rule 1.2.1).
    const user = await callerUser(req, db)
    const { data: owned } = user ? await db.from('companies').select('id').eq('owner_id', user.id).limit(5) : { data: [] as any[] }
    for (const c of owned || []) {
      if (await shopifyBillingStore(db, c.id)) return NextResponse.json({ error: 'Your Colvy billing is managed in Shopify: open Billing to change your plan.', shopify: true }, { status: 409 })
    }
    const secret = process.env.STRIPE_SECRET_KEY || ''
    if (!secret.startsWith('sk_')) {
      console.error('[stripe/portal] STRIPE_SECRET_KEY is missing or invalid')
      return NextResponse.json({ error: `Managing billing online isn’t available just yet. Contact us at ${COLVY_CONTACT.email} or ${COLVY_CONTACT.phoneDisplay} and we’ll help.` }, { status: 503 })
    }

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
