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

// Refund a payment taken through a Colvy payment link. Full or partial (amount
// in dollars). Works on both Stripe modes: the business's own keys, or a
// connected account charged with the platform key.
export async function POST(req: NextRequest) {
  try {
    const { companyId, paymentId, amount } = await req.json()
    if (!companyId || !paymentId) return NextResponse.json({ error: 'Missing companyId or paymentId' }, { status: 400 })

    const db = admin()
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).eq('company_id', companyId).maybeSingle()
    if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (pay.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 })
    if (pay.status !== 'paid') return NextResponse.json({ error: 'Only paid payments can be refunded' }, { status: 400 })

    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
    const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
    if (!key) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
    const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
    const acct: any = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)

    // Prefer the payment intent; fall back to resolving it from the session.
    let paymentIntent: string | null = pay.stripe_payment_intent || null
    if (!paymentIntent && pay.stripe_session_id) {
      try {
        const sess: any = await s.checkout.sessions.retrieve(pay.stripe_session_id, acct)
        paymentIntent = (sess?.payment_intent as string) || null
      } catch {}
    }
    if (!paymentIntent) return NextResponse.json({ error: 'No Stripe payment reference on this record' }, { status: 400 })

    // Refunds accumulate: how much is still refundable on this charge.
    const alreadyRefunded = pay.refunded_cents || 0
    const remaining = (pay.amount_cents || 0) - alreadyRefunded
    if (remaining <= 0) return NextResponse.json({ error: 'Nothing left to refund' }, { status: 400 })

    // A dollar amount refunds that much; omitted refunds the whole remaining balance.
    let cents = amount != null ? Math.round(parseFloat(String(amount)) * 100) : remaining
    if (!cents || cents < 1) return NextResponse.json({ error: 'Refund amount must be at least $0.01' }, { status: 400 })
    if (cents > remaining) return NextResponse.json({ error: `Only ${(remaining / 100).toFixed(2)} left to refund` }, { status: 400 })

    const refund = await s.refunds.create({ payment_intent: paymentIntent, amount: cents }, acct)

    const totalRefunded = alreadyRefunded + cents
    const full = totalRefunded >= (pay.amount_cents || 0)
    // A partial refund keeps 'paid' but records the running refunded total; a
    // full (or fully-accumulated) refund flips to 'refunded'.
    try {
      await db.from('chat_payments').update({
        status: full ? 'refunded' : 'paid',
        refunded_cents: totalRefunded,
        refunded_at: new Date().toISOString(),
      }).eq('id', pay.id)
    } catch {
      // Older schema without the refund columns — at least flip the status.
      try { await db.from('chat_payments').update({ status: full ? 'refunded' : 'paid' }).eq('id', pay.id) } catch {}
    }
    const refundedCents = cents

    // Reverse the Link Reports revenue credit for a full refund so the report
    // reflects money actually kept.
    if (full) {
      try { await db.from('link_conversions').delete().eq('company_id', companyId).eq('order_id', `pay_${pay.id}`).eq('stage', 'paid') } catch {}
    }

    // Post a pill + timeline event into the conversation, and let the team know.
    const amtStr = `$${(refundedCents / 100).toFixed(2)} ${String(pay.currency || 'AUD').toUpperCase()}`
    if (pay.conversation_id) {
      try {
        await db.from('messages').insert({
          conversation_id: pay.conversation_id, company_id: companyId, sender_type: 'system',
          content: `↩️ Refund issued — ${amtStr}${full ? '' : ' (partial)'}`,
          metadata: { kind: 'payment_refunded', payment_id: pay.id, amount_cents: refundedCents },
        })
      } catch {}
      try {
        await db.from('conversation_events').insert({
          conversation_id: pay.conversation_id, company_id: companyId, event_type: 'payment_refunded',
          detail: `Refund issued — ${amtStr}${full ? '' : ' (partial)'}`,
        })
      } catch {}
      try {
        await db.from('conversations').update({ last_message: `↩️ Refund issued — ${amtStr}`, last_message_at: new Date().toISOString() }).eq('id', pay.conversation_id)
      } catch {}
    }

    return NextResponse.json({ ok: true, refundId: refund.id, refundedCents, totalRefunded, full })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Refund failed' }, { status: 500 })
  }
}
