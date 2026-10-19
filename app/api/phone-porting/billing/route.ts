import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAdmin } from '@/lib/company-access'
import { getPort } from '@/lib/number-porting-server'
import { formatAuNumber } from '@/lib/number-porting'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// A completed port's numbers bill like bought numbers: a monthly Stripe
// subscription (plus the one-off porting fee, when COLVY_PORT_FEE_AUD is set,
// on the first invoice). A bought number's subscription comes from its
// checkout; a ported number gets its checkout here, once it's live.
//
// POST { companyId, requestId }             → { url } to Stripe checkout
// POST { companyId, requestId, sessionId }  → confirms the paid checkout
//
// metadata.kind 'ported_number' is ignored by the Stripe webhook's number and
// plan branches, so nothing else acts on this checkout.
export async function POST(req: NextRequest) {
  try {
    const { companyId, requestId, sessionId, email } = await req.json().catch(() => ({}))
    if (!companyId || !requestId) return NextResponse.json({ error: 'Missing companyId or requestId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAdmin(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await getPort(db, String(requestId))
    if (!r || r.company_id !== companyId) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (r.status !== 'completed') return NextResponse.json({ error: 'Billing starts once the number has moved to Colvy.' }, { status: 409 })
    if (r.billing_status === 'active') return NextResponse.json({ ok: true, alreadyActive: true })
    if (r.billing_status !== 'pending') return NextResponse.json({ error: 'Nothing to pay for this request.' }, { status: 409 })

    const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!secret.startsWith('sk_')) return NextResponse.json({ error: 'Card payments aren’t available just yet. The Colvy team will set up billing for this number with you.' }, { status: 503 })
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })

    if (sessionId) {
      const s = await stripe.checkout.sessions.retrieve(String(sessionId))
      if (s.metadata?.kind !== 'ported_number' || s.metadata?.companyId !== companyId || s.metadata?.requestId !== r.id) {
        return NextResponse.json({ error: 'This payment is for a different purchase.' }, { status: 403 })
      }
      const paid = s.payment_status === 'paid' || s.status === 'complete'
      if (!paid) return NextResponse.json({ error: 'Payment not completed yet', pending: true }, { status: 202 })
      const subscription = typeof s.subscription === 'string' ? s.subscription : (s.subscription as any)?.id || null
      await db.from('porting_requests').update({ billing_status: 'active', stripe_subscription_id: subscription, stripe_checkout_session_id: s.id, updated_at: new Date().toISOString() }).eq('id', r.id)
      return NextResponse.json({ ok: true, active: true })
    }

    const nums: string[] = Array.isArray(r.numbers) ? r.numbers : []
    const monthly = Number(r.monthly_price_aud) || 0
    const fee = Number(r.port_fee_aud) || 0
    const lineItems: any[] = []
    if (monthly > 0) lineItems.push({
      price_data: {
        currency: 'aud',
        product_data: { name: nums.length > 1 ? `Colvy numbers (${nums.length}, moved to Colvy)` : 'Colvy Business Number (moved to Colvy)', description: nums.map(formatAuNumber).join(', ') },
        unit_amount: Math.round(monthly * 100),
        recurring: { interval: 'month' },
      },
      quantity: 1,
    })
    if (fee > 0) lineItems.push({ price_data: { currency: 'aud', product_data: { name: 'Number porting fee (one-off)' }, unit_amount: Math.round(fee * 100) }, quantity: 1 })
    if (!lineItems.length) return NextResponse.json({ error: 'Nothing to pay for this request.' }, { status: 409 })
    const origin = req.headers.get('origin') || 'https://colvy.com'
    const session = await stripe.checkout.sessions.create({
      mode: monthly > 0 ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: lineItems,
      metadata: { kind: 'ported_number', companyId, requestId: r.id },
      success_url: `${origin}/admin/crm-settings/channels/calls?port_billing=1&port_request=${encodeURIComponent(r.id)}&session_id={CHECKOUT_SESSION_ID}#porting`,
      cancel_url: `${origin}/admin/crm-settings/channels/calls#porting`,
    })
    try { await db.from('porting_requests').update({ stripe_checkout_session_id: session.id }).eq('id', r.id) } catch {}
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[phone-porting billing]', err)
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
