import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Enrich a payment for the detail drawer: card brand/last-4, receipt URL, the
// Stripe ids, and the list of refunds already issued. Best-effort — the drawer
// still renders from the DB row if Stripe is unreachable.
export async function POST(req: NextRequest) {
  try {
    const { companyId, paymentId } = await req.json()
    if (!companyId || !paymentId) return NextResponse.json({ error: 'Missing companyId or paymentId' }, { status: 400 })

    const db = admin()
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).eq('company_id', companyId).maybeSingle()
    if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
    const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
    if (!key) return NextResponse.json({ ok: true, details: null })
    const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
    const acct: any = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)

    let paymentIntent: string | null = pay.stripe_payment_intent || null
    if (!paymentIntent && pay.stripe_session_id) {
      try {
        const sess: any = await s.checkout.sessions.retrieve(pay.stripe_session_id, acct)
        paymentIntent = (sess?.payment_intent as string) || null
      } catch {}
    }
    if (!paymentIntent) return NextResponse.json({ ok: true, details: { paymentIntentId: null } })

    const pi: any = await s.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge', 'latest_charge.refunds'] }, acct)
    const charge: any = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
    const card = charge?.payment_method_details?.card || null
    const refundsList = (charge?.refunds?.data || []).map((r: any) => ({
      id: r.id, amount: r.amount, currency: r.currency, status: r.status, created: r.created, reason: r.reason,
    }))

    return NextResponse.json({
      ok: true,
      details: {
        paymentIntentId: paymentIntent,
        chargeId: charge?.id || null,
        brand: card?.brand || null,
        last4: card?.last4 || null,
        wallet: card?.wallet?.type || null,
        receiptUrl: charge?.receipt_url || pay.receipt_url || null,
        amountRefunded: charge?.amount_refunded ?? (pay.refunded_cents || 0),
        created: charge?.created ? charge.created * 1000 : null,
        refunds: refundsList,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: true, details: null, error: e?.message })
  }
}
