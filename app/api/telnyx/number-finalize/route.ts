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

    // Note: we NO LONGER block when a number already exists — a company can own
    // several numbers now. We only skip if THIS specific checkout session was
    // already finalized (idempotency), tracked by the number itself below.

    // Verify payment if a session id was provided
    let paid = true
    let phoneNumberWanted: string | undefined
    let subscriptionId: string | undefined
    let locationId: string | undefined
    if (sessionId) {
      const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
      if (secret.startsWith('sk_')) {
        const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        paid = session.payment_status === 'paid' || session.status === 'complete'
        phoneNumberWanted = (session.metadata?.phoneNumber as string) || undefined
        locationId = (session.metadata?.locationId as string) || undefined
        subscriptionId = (session.subscription as string) || undefined
        if (!paid) return NextResponse.json({ error: 'Payment not completed yet', pending: true }, { status: 202 })
      }
    }

    // Idempotency: if we already provisioned the requested number, return it.
    if (phoneNumberWanted) {
      const { data: dupe } = await db.from('phone_numbers').select('id, phone_number').eq('phone_number', phoneNumberWanted).maybeSingle()
      if (dupe) return NextResponse.json({ ok: true, phoneNumber: dupe.phone_number, alreadyDone: true })
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

    // telnyx_integrations holds ACCOUNT-level config (api key, connection). Keep
    // the company's first number there for backward compatibility, but every
    // purchased number now lives in phone_numbers so a company can own many.
    const { data: integ } = await db.from('telnyx_integrations').select('id, phone_number').eq('company_id', companyId).maybeSingle()
    const isFirst = !integ?.phone_number
    const payload: any = {
      company_id: companyId, api_key: PLATFORM_KEY,
      messaging_profile_id: PLATFORM_MESSAGING_PROFILE || null, connection_id: PLATFORM_CONNECTION || null,
      provisioned_by_colvy: true, number_order_id: orderId || null,
      provisioned_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(),
    }
    if (isFirst) payload.phone_number = numberToBuy
    if (subscriptionId) payload.stripe_subscription_id = subscriptionId

    if (integ) await db.from('telnyx_integrations').update(payload).eq('company_id', companyId)
    else await db.from('telnyx_integrations').insert(payload)

    // Add the number to the multi-number table
    const priceAud = parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15')
    await db.from('phone_numbers').insert({
      company_id: companyId,
      phone_number: numberToBuy,
      number_type: (phoneNumberWanted && phoneNumberWanted.replace(/^\+61/, '').startsWith('4')) ? 'mobile' : 'local',
      location_id: locationId || null,
      is_primary: isFirst,
      status: 'active',
      provisioned_by_colvy: true,
      monthly_cost: priceAud,
      telnyx_number_id: orderId || null,
    })

    // If assigned to a location, sync the back-reference
    if (locationId) {
      try {
        const { data: pn } = await db.from('phone_numbers').select('id').eq('phone_number', numberToBuy).maybeSingle()
        if (pn) await db.from('company_locations').update({ phone_number_id: pn.id }).eq('id', locationId)
      } catch {}
    }

    return NextResponse.json({ ok: true, phoneNumber: numberToBuy })
  } catch (err: any) {
    console.error('Number finalize error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
