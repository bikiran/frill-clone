import { NextRequest, NextResponse } from 'next/server'
import { shopifySmsBilling, shopifySmsRefusal } from '@/lib/shopify-usage'
import { createClient } from '@supabase/supabase-js'
import { smsCreditsAccess } from '@/lib/sms-credits-access'
import { getWallet, platformStripe, shopifyTopUp } from '@/lib/sms-credits'
import { getSmsPolicy, topUpRefusal } from '@/lib/sms-policy'
import { fmtCents, validateAutoTopUp, validateTopUpCents } from '@/lib/sms-credits-core'
import { billingUnavailableCopy, secretKeyOk } from '@/lib/billing-config'
import { alertBillingNotConfigured } from '@/lib/billing-alert'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import { checkoutTaxParams } from '@/lib/tax-invoice-core'

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
// The company's SMS billing policy must allow it (lib/sms-policy): no top-ups
// when Colvy manages them or the plan doesn't use credit, and no auto top-up
// when that's not allowed: 403 { managed: true }, whatever the page shows.
//
// A workspace that uses Colvy through the Shopify app is never charged by card
// (App Store rule 1.2.1). Its credit is billed through its Shopify plan's usage
// meter (lib/shopify-usage) and added straight away: { ok, shopify: true,
// balanceCents }, no checkout. Without the meter: 409 { shopify: true, planUrl }.

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

    const refusal = topUpRefusal(await getSmsPolicy(db, id), !!body.autoTopUp)
    if (refusal) return NextResponse.json({ error: refusal, managed: true }, { status: 403 })

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
    // Using Colvy through the Shopify app: billed through the Shopify plan, never by card.
    const shop = await shopifySmsBilling(db, id, { fresh: true })
    if (shop && !shop.ready) return NextResponse.json({ error: shopifySmsRefusal(shop), shopify: true, planUrl: shop.planUrl }, { status: 409 })
    const wallet = await getWallet(db, id)
    if (!wallet.ready) return NextResponse.json({ error: 'SMS credits aren’t set up yet. Try again later.', notReady: true }, { status: 409 })
    if (shop?.ready) {
      if (auto) {
        // Auto top-up through Shopify needs no card: switch it on with these amounts.
        await db.from('sms_credit_accounts').upsert({
          company_id: id, auto_topup_enabled: true, auto_topup_threshold_cents: auto.thresholdCents, auto_topup_amount_cents: auto.amountCents,
          auto_topup_failures: 0, auto_topup_last_error: null, updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' })
      }
      const t = await shopifyTopUp(db, { companyId: id, amountCents: amount.cents, kind: 'topup', shopGid: shop.shopGid, createdBy: access.userId || null })
      if (!t.charged) return NextResponse.json({ error: t.error }, { status: 502 })
      if (!t.ok) {
        return NextResponse.json({ shopify: true, error: `Shopify has the charge, but the credit didn’t save. Contact us at ${COLVY_CONTACT.email} with reference ${t.key} and we’ll add it straight away.` }, { status: 500 })
      }
      return NextResponse.json({ ok: true, shopify: true, creditedCents: amount.cents, balanceCents: t.balanceCents })
    }

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
      // The buyer can add their ABN for the tax invoice (lib/tax-invoice-core).
      ...checkoutTaxParams(process.env, { mode: 'payment', customer, description: 'Colvy SMS credit (prepaid). Price includes GST.' }),
    } as any)
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
