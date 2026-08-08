import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { platformTwilio, platformTwilioConfigured, TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NOT_CONFIGURED = 'Twilio number provisioning is not configured yet. The platform admin needs to set TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN in the environment.'

// GET: search available AU numbers to show the customer before they buy. Mirrors
// /api/telnyx/number so the "Get a business number" UI is provider-agnostic.
export async function GET(req: NextRequest) {
  try {
    const svc = platformTwilio()
    if (!svc) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 })
    const type = (req.nextUrl.searchParams.get('type') as any) || 'local'
    const areaCode = req.nextUrl.searchParams.get('areaCode') || undefined
    const raw = await svc.searchAvailableNumbers({ country: 'AU', type, areaCode, limit: 12 })
    const monthly = parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15')
    const numbers = raw.slice(0, 6).map((n: any) => ({
      phone_number: n.phone_number,
      region: n.locality || n.region || (String(n.phone_number).replace(/^\+61/, '').startsWith('4') ? 'MOBILE' : 'AU'),
      monthly,
    }))
    if (numbers.length === 0) {
      return NextResponse.json({ numbers: [], error: type === 'mobile'
        ? 'No mobile numbers are available right now — landline numbers work for both calls and SMS, or try again shortly.'
        : 'No numbers available right now — please try again shortly.' })
    }
    return NextResponse.json({ numbers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: buy a number on the platform account and assign it to the company. The
// customer never touches Twilio — Colvy owns the account. Idempotent-ish: a
// company can own several numbers (tracked in phone_numbers).
export async function POST(req: NextRequest) {
  try {
    if (!platformTwilioConfigured()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 })
    const { companyId, phoneNumber, numberType, locationId, stripeSubscriptionId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const svc = platformTwilio()!
    const base = colvyBaseUrl()

    // Pick the number (first available if none chosen).
    let numberToBuy = phoneNumber
    if (!numberToBuy) {
      const available = await svc.searchAvailableNumbers({ country: 'AU', type: (numberType === 'mobile' ? 'mobile' : 'local'), limit: 1 })
      numberToBuy = available?.[0]?.phone_number
      if (!numberToBuy) return NextResponse.json({ error: 'No Australian numbers available right now — try again shortly.' }, { status: 502 })
    }

    // Any approved regulatory bundle for this company (AU requires it — Twilio
    // rejects the purchase otherwise, surfacing a clear error the UI shows).
    let bundleSid: string | undefined
    try {
      const { data: reg } = await db.from('number_regulatory_bundles')
        .select('twilio_bundle_id').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      bundleSid = reg?.twilio_bundle_id || undefined
    } catch {}

    // Buy + point the number's webhooks at Colvy (resolved per-number by the
    // receiving number, so the bare colvy host is fine).
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
      return NextResponse.json({ error: e.message }, { status: 502 })
    }

    const monthly = parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15')

    // Record on the company's Twilio integration using the PLATFORM credentials,
    // so calls/SMS work without the company ever touching Twilio.
    const payload: any = {
      company_id: companyId,
      account_sid: TWILIO_MASTER.accountSid,
      auth_token: TWILIO_MASTER.authToken,
      api_key_sid: TWILIO_MASTER.apiKeySid || null,
      api_key_secret: TWILIO_MASTER.apiKeySecret || null,
      twiml_app_sid: TWILIO_MASTER.twimlAppSid || null,
      messaging_service_sid: TWILIO_MASTER.messagingServiceSid || null,
      phone_number: numberToBuy,
      number_sid: bought.sid || null,
      provisioned_by_colvy: true,
      monthly_cost: monthly,
      provisioned_at: new Date().toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
      ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
    }
    const { data: existing } = await db.from('twilio_integrations').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) await db.from('twilio_integrations').update(payload).eq('company_id', companyId)
    else await db.from('twilio_integrations').insert(payload)

    // Route this company's SMS + calls through Twilio now, and remember Twilio as
    // its number-provisioning backend.
    try { await db.from('companies').update({ sms_provider: 'twilio', voice_provider: 'twilio', number_provider: 'twilio' }).eq('id', companyId) } catch {}

    // Multi-number table.
    try {
      await db.from('phone_numbers').insert({
        company_id: companyId, phone_number: numberToBuy, provider: 'twilio', twilio_sid: bought.sid || null,
        number_type: String(numberToBuy).replace(/^\+61/, '').startsWith('4') ? 'mobile' : 'local',
        location_id: locationId || null, is_primary: !existing, status: 'active',
        provisioned_by_colvy: true, monthly_cost: monthly,
      })
    } catch {}

    return NextResponse.json({ ok: true, phoneNumber: numberToBuy })
  } catch (err: any) {
    console.error('Twilio number provisioning error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
