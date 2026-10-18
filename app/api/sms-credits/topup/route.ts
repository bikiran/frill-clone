import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsCreditsAccess } from '@/lib/sms-credits-access'
import { getWallet, platformStripe } from '@/lib/sms-credits'
import { fmtCents, validateAutoTopUp, validateTopUpCents } from '@/lib/sms-credits-core'
import { billingUnavailableCopy, secretKeyOk } from '@/lib/billing-config'
import { alertBillingNotConfigured } from '@/lib/billing-alert'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

export const dynamic = 'force-dynamic'

// POST /api/sms-credits/topup
//   { companyId, amountCents, autoTopUp?: { thresholdCents, amountCents } }
// Starts a Stripe Checkout (payment mode, AUD, the amount as charged: SMS
// prices are GST inclusive) for prepaid SMS credit. With autoTopUp the card is
// saved for off-session use (setup_future_usage) and auto top-up switches on
// once the webhook confirms the payment. The webhook credits the wallet
// (checkout.session.completed, metadata.kind 'sms_credit').
// Owner / admin only. Same "billing unavailable" answer as plan checkout when
// Colvy's Stripe key isn't set up.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

function unavailable() {
  const copy = billingUnavailableCopy()
  return NextResponse.json({ setup: true, title: copy.title, error: copy.message }, { status: 200 })
}

export async function POST(req: NextRequest) {
  let companyId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    companyId = body?.companyId ? String(body.companyId) : null
    const db: any = admin()
    const access = await smsCreditsAccess(req, db, companyId, 'manage')
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const id = String(companyId)

    const amount = validateTopUpCents(body.amountCents)
    if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 })
    let auto: { thresholdCents: number; amountCents: number } | null = null
    if (body.autoTopUp) {
      const v = validateAutoTopUp(body.autoTopUp.thresholdCents, body.autoTopUp.amountCents)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      auto = { thresholdCents: v.thresholdCents, amountCents: v.amountCents }
    }

    const { data: co } = await db.from('companies').select('id, name, owner_id, billing_provider').eq('id', id).maybeSingle()
    if (!co) return NextResponse.json({ error: 'Couldn’t find your workspace. Refresh the page and try again.' }, { status: 404 })
    // Shopify App Store rule: a workspace billed through Shopify pays through Shopify.
    if (co.billing_provider === 'shopify') {
      return NextResponse.json({ error: 'Your Colvy plan is billed through Shopify, so SMS credits can’t be bought by card here yet. Contact us and we’ll add credit for you.', shopify: true }, { status: 409 })
    }
    const wallet = await getWallet(db, id)
    if (!wallet.ready) return NextResponse.json({ error: 'SMS credits aren’t set up yet. Try again later.', notReady: true }, { status: 409 })

    if (!secretKeyOk(process.env)) {
      console.error('[sms-credits/topup] billing not set up: missing or wrong STRIPE_SECRET_KEY')
      await alertBillingNotConfigured(db, { companyId: id, companyName: co.name || null, tier: 'sms_credit', missing: ['STRIPE_SECRET_KEY'] })
      return unavailable()
    }
    const stripe = await platformStripe()

    // Reuse the wallet's Stripe customer, else the owner's billing customer.
    let customer = wallet.stripeCustomerId
    if (!customer && co.owner_id) {
      try {
        const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', co.owner_id).maybeSingle()
        customer = sub?.stripe_customer_id || null
      } catch {}
    }
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    const metadata: Record<string, string> = {
      companyId: id, kind: 'sms_credit', amountCents: String(amount.cents), userId: access.userId || '',
      saveCard: auto ? '1' : '0',
      ...(auto ? { autoThreshold: String(auto.thresholdCents), autoAmount: String(auto.amountCents) } : {}),
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(customer ? { customer } : { customer_creation: 'always', ...(access.email ? { customer_email: access.email } : {}) }),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: amount.cents,
          product_data: { name: 'Colvy SMS credit', description: `${fmtCents(amount.cents)} of prepaid SMS credit for ${co.name || 'your workspace'}. Price includes GST.` },
        },
      }],
      payment_intent_data: {
        description: 'Colvy SMS credit',
        metadata: { companyId: id, kind: 'sms_credit' },
        ...(auto ? { setup_future_usage: 'off_session' } : {}),
      },
      metadata,
      success_url: `${origin}/admin/billing?sms_credit=1#sms-credits`,
      cancel_url: `${origin}/admin/billing#sms-credits`,
    })
    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('[sms-credits/topup] checkout error', err?.message)
    const t = String(err?.type || '')
    if (t === 'StripeAuthenticationError' || t === 'StripePermissionError') {
      try { await alertBillingNotConfigured(admin(), { companyId, tier: 'sms_credit', missing: [], detail: `Stripe said: ${String(err?.message || '').slice(0, 200)}` }) } catch {}
      return unavailable()
    }
    return NextResponse.json({ error: `We couldn’t start the checkout. Please try again in a minute, or contact us at ${COLVY_CONTACT.email} or ${COLVY_CONTACT.phoneDisplay}.` }, { status: 500 })
  }
}
