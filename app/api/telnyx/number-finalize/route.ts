import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PLATFORM_KEY = process.env.TELNYX_MASTER_API_KEY
const PLATFORM_MESSAGING_PROFILE = process.env.TELNYX_MESSAGING_PROFILE_ID
const PLATFORM_CONNECTION = process.env.TELNYX_CONNECTION_ID

// Called by the Telnyx settings page after returning from Stripe checkout.
// Verifies the checkout session is paid, then provisions the number DIRECTLY
// (does not depend on the Stripe webhook being configured). Idempotent.
export async function POST(req: NextRequest) {
  try {
    const { companyId, sessionId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()

    // If the company already has a number, we're done.
    const { data: existing } = await db.from('telnyx_integrations').select('phone_number').eq('company_id', companyId).maybeSingle()
    if (existing?.phone_number) return NextResponse.json({ ok: true, phoneNumber: existing.phone_number, alreadyDone: true })

    // Verify payment if a session id was provided
    let paid = true
    let phoneNumberWanted: string | undefined
    let subscriptionId: string | undefined
    if (sessionId) {
      const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
      if (secret.startsWith('sk_')) {
        const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        paid = session.payment_status === 'paid' || session.status === 'complete'
        phoneNumberWanted = (session.metadata?.phoneNumber as string) || undefined
        subscriptionId = (session.subscription as string) || undefined
        if (!paid) return NextResponse.json({ error: 'Payment not completed yet', pending: true }, { status: 202 })
      }
    }

    if (!PLATFORM_KEY) {
      return NextResponse.json({ error: 'Provisioning not configured: TELNYX_MASTER_API_KEY missing on the server.' }, { status: 503 })
    }

    // Provision the number now
    const svc = new TelnyxService(PLATFORM_KEY)
    let numberToBuy = phoneNumberWanted
    if (!numberToBuy) {
      const available = await svc.searchAvailableNumbers({ country: 'AU', type: 'local', limit: 1 })
      numberToBuy = available?.[0]?.phone_number
      if (!numberToBuy) return NextResponse.json({ error: 'No Australian numbers available right now — please contact support; your payment is safe.' }, { status: 502 })
    }

    const order = await svc.orderNumber(numberToBuy, {
      messaging_profile_id: PLATFORM_MESSAGING_PROFILE,
      connection_id: PLATFORM_CONNECTION,
    })
    const orderId = order?.data?.id

    try {
      const pnId = await svc.getPhoneNumberId(numberToBuy)
      if (pnId) await svc.configureNumber(pnId, { messaging_profile_id: PLATFORM_MESSAGING_PROFILE, connection_id: PLATFORM_CONNECTION })
    } catch (e) { console.warn('Number config warning:', e) }

    const payload: any = {
      company_id: companyId, phone_number: numberToBuy, api_key: PLATFORM_KEY,
      messaging_profile_id: PLATFORM_MESSAGING_PROFILE || null, connection_id: PLATFORM_CONNECTION || null,
      provisioned_by_colvy: true, number_order_id: orderId || null, monthly_cost: 2,
      provisioned_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(),
    }
    if (subscriptionId) payload.stripe_subscription_id = subscriptionId

    const { data: row } = await db.from('telnyx_integrations').select('id').eq('company_id', companyId).maybeSingle()
    if (row) await db.from('telnyx_integrations').update(payload).eq('company_id', companyId)
    else await db.from('telnyx_integrations').insert(payload)

    return NextResponse.json({ ok: true, phoneNumber: numberToBuy })
  } catch (err: any) {
    console.error('Number finalize error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
