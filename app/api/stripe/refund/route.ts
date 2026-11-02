import { requireCompanyAdmin } from '@/lib/company-access'
import { checkRefundPin, isPinRefused } from '@/lib/refund-guard'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { stripeSecretFor } from '@/lib/company-secrets'
import { audit } from '@/lib/activity-logging'

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
    const { companyId, paymentId, amount, refundPin } = await req.json()
    if (!companyId || !paymentId) return NextResponse.json({ error: 'Missing companyId or paymentId' }, { status: 400 })

    const db = admin()
    // Owner / admin only: a refund sends the business's money back out.
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the owner or an admin can refund payments.' : 'Not authorized' }, { status: 403 })
    // And the refund PIN, when the workspace has one (lib/refund-guard).
    const pin = await checkRefundPin(db, companyId, refundPin, { req })
    if (isPinRefused(pin)) return NextResponse.json({ error: pin.error, code: pin.code, ...(pin.attemptsLeft != null ? { attemptsLeft: pin.attemptsLeft } : {}) }, { status: pin.code === 'refund_pin_locked' ? 429 : 403 })
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).eq('company_id', companyId).maybeSingle()
    if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (pay.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 })
    if (pay.status !== 'paid') return NextResponse.json({ error: 'Only paid payments can be refunded' }, { status: 400 })

    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    const ownKey = await stripeSecretFor(company)
    const useOwnKeys = !!ownKey
    const key = ownKey || process.env.STRIPE_SECRET_KEY
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
      // confirmChatPayment keys a pay link's credit by the payment intent (the
      // webhook and verify-payment always pass one), else pay_<id> (older rows,
      // the V287 backfill). Both are unique to this payment.
      const payKeys = Array.from(new Set([`pay_${pay.id}`, pay.stripe_payment_intent, paymentIntent].filter(Boolean))) as string[]
      try { await db.from('link_conversions').delete().eq('company_id', companyId).in('order_id', payKeys).eq('stage', 'paid') } catch {}
      // A pay link for a WooCommerce order is keyed by the Woo order id instead,
      // on the pay link itself (found the same way confirmChatPayment found it).
      try {
        if (pay.message_id) {
          const { data: m } = await db.from('messages').select('message_payload').eq('id', pay.message_id).maybeSingle()
          const p = (m as { message_payload?: { checkout_url?: string; order_id?: string | number | null } } | null)?.message_payload || {}
          const code = (String(p.checkout_url || '').match(/\/l\/([A-Za-z0-9_-]+)/) || [])[1]
          if (code && p.order_id) {
            const { data: link } = await db.from('short_links').select('id').eq('code', code).maybeSingle()
            if (link?.id) await db.from('link_conversions').delete().eq('company_id', companyId).eq('link_id', link.id).eq('order_id', String(p.order_id)).eq('stage', 'paid')
          }
        }
      } catch {}
      // A booking's online payment is credited as book_<booking id>
      // (lib/link-attribution.ts) — same as refundBooking(), reverse it too.
      try {
        const { data: bks } = await db.from('bookings').select('id').eq('company_id', companyId).eq('chat_payment_id', pay.id).limit(5)
        const ids = (bks || []).map((b: { id: string }) => `book_${b.id}`)
        if (ids.length) await db.from('link_conversions').delete().eq('company_id', companyId).in('order_id', ids).eq('stage', 'paid')
      } catch {}
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

    await audit(req, db, companyId, 'refund_issued', `Refunded ${amtStr} on a card payment${full ? '' : ' (partial)'}`, { payment_id: pay.id, amount_cents: refundedCents, conversation_id: pay.conversation_id || null })
    return NextResponse.json({ ok: true, refundId: refund.id, refundedCents, totalRefunded, full })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Refund failed' }, { status: 500 })
  }
}
