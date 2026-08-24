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

// Resend the Stripe receipt for a paid payment. Setting receipt_email on the
// succeeded charge makes Stripe (re)send its own email receipt. We also return
// the hosted receipt URL so the caller can share it directly if preferred.
export async function POST(req: NextRequest) {
  try {
    const { companyId, paymentId, email: emailIn } = await req.json()
    if (!companyId || !paymentId) return NextResponse.json({ error: 'Missing companyId or paymentId' }, { status: 400 })

    const db = admin()
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).eq('company_id', companyId).maybeSingle()
    if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (pay.status !== 'paid') return NextResponse.json({ error: 'Only paid payments have a receipt' }, { status: 400 })

    // Work out the customer's email: explicit override, else the contact on the
    // conversation.
    let email = String(emailIn || '').trim()
    if (!email && pay.conversation_id) {
      try {
        const { data: conv } = await db.from('conversations').select('contact_id').eq('id', pay.conversation_id).maybeSingle()
        if (conv?.contact_id) {
          const { data: ct } = await db.from('contacts').select('email').eq('id', conv.contact_id).maybeSingle()
          email = String(ct?.email || '').trim()
        }
      } catch {}
    }
    if (!email) return NextResponse.json({ error: 'No email on file — add one to resend the receipt' }, { status: 400 })

    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
    const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
    if (!key) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
    const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
    const acct: any = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)

    // Resolve the payment intent → its latest charge.
    let paymentIntent: string | null = pay.stripe_payment_intent || null
    if (!paymentIntent && pay.stripe_session_id) {
      try {
        const sess: any = await s.checkout.sessions.retrieve(pay.stripe_session_id, acct)
        paymentIntent = (sess?.payment_intent as string) || null
      } catch {}
    }
    if (!paymentIntent) return NextResponse.json({ error: 'No Stripe payment reference on this record' }, { status: 400 })

    const pi: any = await s.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge'] }, acct)
    const charge: any = pi?.latest_charge
    const chargeId = typeof charge === 'string' ? charge : charge?.id
    if (!chargeId) return NextResponse.json({ error: 'No charge found for this payment' }, { status: 400 })

    // Setting receipt_email on a succeeded charge triggers Stripe to email the
    // receipt. Update it (even to the same address) to force a resend.
    const updated: any = await s.charges.update(chargeId, { receipt_email: email }, acct)
    const receiptUrl = updated?.receipt_url || (typeof charge === 'object' ? charge?.receipt_url : null) || pay.receipt_url || null

    if (receiptUrl && receiptUrl !== pay.receipt_url) {
      try { await db.from('chat_payments').update({ receipt_url: receiptUrl }).eq('id', pay.id) } catch {}
    }

    return NextResponse.json({ ok: true, email, receiptUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not resend receipt' }, { status: 500 })
  }
}
