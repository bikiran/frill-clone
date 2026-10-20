import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { billingUnavailableCopy } from '@/lib/billing-config'
import { alertBillingNotConfigured } from '@/lib/billing-alert'
import { checkoutTaxParams } from '@/lib/tax-invoice-core'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Creates a $2/month subscription checkout for a phone number. The number is
// provisioned by the Stripe webhook once payment succeeds (see stripe/webhook).
export async function POST(req: NextRequest) {
  try {
    const { companyId, email, phoneNumber, numberType, locationId, locality, areaCode } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Workspace members only.
    if (!(await requireCompanyAccess(req, admin(), companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // Free number credit granted by a platform admin? Skip payment entirely —
    // the finalize route consumes the credit and provisions directly. The credit
    // is authoritatively checked+decremented there, so this is only a fast path.
    try {
      const { data: co } = await admin().from('companies').select('free_number_credits').eq('id', companyId).maybeSingle()
      if ((co?.free_number_credits || 0) > 0) return NextResponse.json({ free: true })
    } catch {}

    const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!secret.startsWith('sk_')) {
      // Never an env var name to a customer: plain words, and the Colvy team hears about it.
      console.error('[number-checkout] STRIPE_SECRET_KEY is missing or invalid')
      const { data: co } = await admin().from('companies').select('name').eq('id', companyId).maybeSingle()
      await alertBillingNotConfigured(admin(), { companyId, companyName: co?.name || null, tier: 'phone_number', missing: ['STRIPE_SECRET_KEY'] })
      const copy = billingUnavailableCopy()
      return NextResponse.json({ error: `Buying a number online isn’t available just yet. ${copy.message}`, setup: true }, { status: 503 })
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
          // Price to the customer. Telnyx charges Colvy ~USD5/mo (~AUD7.50) plus
          // upfront per number, so keep this above cost. Configurable via env.
          unit_amount: Math.round(parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15') * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: {
        kind: 'phone_number',
        companyId,
        phoneNumber: phoneNumber || '',
        numberType: numberType || 'local',
        locationId: locationId || '',
        // Kept so that if the chosen number is gone by the time payment
        // completes, we can substitute an equivalent one from the same region.
        locality: locality || '',
        areaCode: areaCode || '',
      },
      // Whose number it is on every renewal's tax invoice (lib/tax-invoices).
      subscription_data: { metadata: { kind: 'phone_number', companyId } },
      success_url: `${origin}/admin/crm-settings/channels/calls?provisioning=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/crm-settings/channels/calls`,
      ...checkoutTaxParams(process.env, { mode: 'subscription' }),
    } as any)

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Number checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
