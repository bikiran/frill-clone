import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { platformTwilio, platformTwilioConfigured, TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'
import { consumeFreeCredit, refundFreeCredit } from '@/lib/free-number-credits'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Called by the Get-a-number page after returning from Stripe checkout for a
// Twilio-backed number. Verifies the session is paid, then provisions the number
// DIRECTLY against the platform Twilio account (no dependence on the webhook).
// Idempotent. Mirrors /api/telnyx/number-finalize.
export async function POST(req: NextRequest) {
  let freeConsumed = false
  let freeCompanyId: string | undefined
  try {
    const body = await req.json()
    const { companyId, sessionId, free } = body
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()

    let paid = true
    let phoneNumberWanted: string | undefined
    let subscriptionId: string | undefined
    let locationId: string | undefined
    let numberType: string | undefined

    // Free path: an admin granted this company a free number. Consume a credit
    // (authoritative check) instead of verifying a Stripe payment. The number
    // details come straight from the request since there's no checkout session.
    if (free && !sessionId) {
      const ok = await consumeFreeCredit(db, companyId)
      if (!ok) return NextResponse.json({ error: 'No free number credits available for this business.' }, { status: 403 })
      freeConsumed = true
      freeCompanyId = companyId
      phoneNumberWanted = body.phoneNumber || undefined
      numberType = body.numberType || 'local'
      locationId = body.locationId || undefined
    }

    if (sessionId) {
      const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
      if (secret.startsWith('sk_')) {
        const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        paid = session.payment_status === 'paid' || session.status === 'complete'
        phoneNumberWanted = (session.metadata?.phoneNumber as string) || undefined
        locationId = (session.metadata?.locationId as string) || undefined
        numberType = (session.metadata?.numberType as string) || 'local'
        subscriptionId = (session.subscription as string) || undefined
        if (!paid) return NextResponse.json({ error: 'Payment not completed yet', pending: true }, { status: 202 })
      }
    }

    // Idempotency: already provisioned this number?
    if (phoneNumberWanted) {
      const { data: dupe } = await db.from('phone_numbers').select('id, phone_number').eq('phone_number', phoneNumberWanted).maybeSingle()
      if (dupe) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false } // nothing was provisioned
        return NextResponse.json({ ok: true, phoneNumber: dupe.phone_number, alreadyDone: true })
      }
    }

    if (!platformTwilioConfigured()) {
      if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
      return NextResponse.json({ error: 'Provisioning not configured: TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN missing on the server.' }, { status: 503 })
    }
    const svc = platformTwilio()!
    const base = colvyBaseUrl()

    // Pick / substitute the number.
    const wantedType: any = numberType === 'mobile' ? 'mobile' : 'local'
    let numberToBuy = phoneNumberWanted
    let substituted = false
    if (!numberToBuy) {
      const available = await svc.searchAvailableNumbers({ country: 'AU', type: wantedType, limit: 1 })
      numberToBuy = available?.[0]?.phone_number
      if (!numberToBuy) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
        return NextResponse.json({ error: 'No Australian numbers available right now — please contact support; your payment is safe.' }, { status: 502 })
      }
    }

    // Regulatory bundle, if the company has one.
    let bundleSid: string | undefined
    try {
      const { data: reg } = await db.from('number_regulatory_bundles')
        .select('twilio_bundle_id').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      bundleSid = reg?.twilio_bundle_id || undefined
    } catch {}

    let bought: { sid: string | null }
    try {
      bought = await svc.buyNumber({
        phoneNumber: numberToBuy,
        friendlyName: `Colvy ${String(companyId).slice(0, 8)}`,
        smsUrl: `${base}/api/twilio/webhook`,
        voiceUrl: `${base}/api/twilio/voice/inbound`,
        bundleSid,
      })
    } catch (e: any) {
      // The exact number may have been taken while paying — substitute an
      // equivalent one so a paid customer always ends up with a working number.
      try {
        const alt = await svc.searchAvailableNumbers({ country: 'AU', type: wantedType, limit: 5 })
        const pick = (alt || []).map((a: any) => a.phone_number).find((p: string) => p && p !== numberToBuy)
        if (!pick) throw e
        bought = await svc.buyNumber({
          phoneNumber: pick,
          friendlyName: `Colvy ${String(companyId).slice(0, 8)}`,
          smsUrl: `${base}/api/twilio/webhook`,
          voiceUrl: `${base}/api/twilio/voice/inbound`,
          bundleSid,
        })
        numberToBuy = pick
        substituted = true
      } catch (e2: any) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
        return NextResponse.json({ error: e2.message }, { status: 502 })
      }
    }

    // Free numbers cost the customer nothing and carry no Stripe subscription.
    const monthly = freeConsumed ? 0 : parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15')

    // Store platform config on the company's Twilio integration.
    const { data: integ } = await db.from('twilio_integrations').select('id, phone_number').eq('company_id', companyId).maybeSingle()
    const isFirst = !integ?.phone_number
    const payload: any = {
      company_id: companyId,
      account_sid: TWILIO_MASTER.accountSid, auth_token: TWILIO_MASTER.authToken,
      api_key_sid: TWILIO_MASTER.apiKeySid || null, api_key_secret: TWILIO_MASTER.apiKeySecret || null,
      twiml_app_sid: TWILIO_MASTER.twimlAppSid || null, messaging_service_sid: TWILIO_MASTER.messagingServiceSid || null,
      number_sid: bought.sid || null, provisioned_by_colvy: true, monthly_cost: monthly,
      provisioned_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(),
    }
    if (isFirst) payload.phone_number = numberToBuy
    if (subscriptionId) payload.stripe_subscription_id = subscriptionId
    if (integ) await db.from('twilio_integrations').update(payload).eq('company_id', companyId)
    else await db.from('twilio_integrations').insert(payload)

    // Route the company's SMS + calls through Twilio.
    try { await db.from('companies').update({ sms_provider: 'twilio', voice_provider: 'twilio', number_provider: 'twilio' }).eq('id', companyId) } catch {}

    // Multi-number table.
    await db.from('phone_numbers').insert({
      company_id: companyId, phone_number: numberToBuy, provider: 'twilio', twilio_sid: bought.sid || null,
      number_type: String(numberToBuy).replace(/^\+61/, '').startsWith('4') ? 'mobile' : 'local',
      location_id: locationId || null, is_primary: isFirst, status: 'active',
      provisioned_by_colvy: true, monthly_cost: monthly, is_free: freeConsumed,
    })

    if (locationId) {
      try {
        const { data: pn } = await db.from('phone_numbers').select('id').eq('phone_number', numberToBuy).maybeSingle()
        if (pn) await db.from('company_locations').update({ phone_number_id: pn.id }).eq('id', locationId)
      } catch {}
    }

    return NextResponse.json({
      ok: true, phoneNumber: numberToBuy, substituted,
      ...(substituted ? { notice: `The number you picked was taken while payment completed, so we provisioned ${numberToBuy} for you instead.` } : {}),
    })
  } catch (err: any) {
    console.error('Twilio number finalize error:', err)
    // Don't let an unexpected failure eat a granted credit.
    if (freeConsumed && freeCompanyId) { try { await refundFreeCredit(admin(), freeCompanyId) } catch {} }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
