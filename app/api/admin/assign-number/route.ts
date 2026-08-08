import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { platformTwilio, platformTwilioConfigured, TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return (data?.user?.email || '').toLowerCase() === SUPER_ADMIN
  } catch { return false }
}

// GET: list the numbers currently on a company, so the edit drawer can show
// what's assigned (the POST field is an action input and doesn't reflect state).
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const companyId = new URL(req.url).searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const { data: numbers } = await db.from('phone_numbers')
      .select('phone_number, provider, number_type, is_primary, status, is_free, monthly_cost')
      .eq('company_id', companyId)
      .order('is_primary', { ascending: false })
    return NextResponse.json({ numbers: numbers || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Super-admin only: attach a number that ALREADY exists in Colvy's platform
// Twilio account to a company — no purchase, no Stripe. Used to hand a company a
// number that was bought manually in the Twilio console. Points the number's
// webhooks at Colvy and records it exactly like a provisioned number, so calls
// and SMS to it route to that company.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const db = admin()
    const { data: auth } = await db.auth.getUser(token)
    if ((auth?.user?.email || '').toLowerCase() !== SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { companyId, phoneNumber, makePrimary } = await req.json()
    if (!companyId || !phoneNumber) return NextResponse.json({ error: 'companyId and phoneNumber are required' }, { status: 400 })

    const number = String(phoneNumber).trim().replace(/\s+/g, '')
    if (!/^\+[1-9]\d{6,15}$/.test(number)) {
      return NextResponse.json({ error: 'Enter the number in E.164 format, e.g. +61468012345.' }, { status: 400 })
    }

    if (!platformTwilioConfigured()) {
      return NextResponse.json({ error: 'Twilio platform account not configured (TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN).' }, { status: 503 })
    }
    const svc = platformTwilio()!
    const base = colvyBaseUrl()

    // The number must live in Colvy's platform account, or we can't route it.
    const sid = await svc.getPhoneNumberSid(number)
    if (!sid) {
      return NextResponse.json({ error: `${number} isn't in Colvy's Twilio account. Buy it in the account whose credentials are configured (TWILIO_MASTER_*), then assign it here.` }, { status: 404 })
    }

    // Point its inbound webhooks at us so texts/calls reach this company.
    try {
      await svc.configureNumberWebhooks({
        phoneNumberSid: sid,
        smsUrl: `${base}/api/twilio/webhook`,
        voiceUrl: `${base}/api/twilio/voice/inbound`,
        statusCallback: `${base}/api/twilio/voice/status`,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Found the number but could not configure its webhooks: ${e.message}` }, { status: 502 })
    }

    // Record account-level config (first number lives on the integration row too).
    const { data: integ } = await db.from('twilio_integrations').select('id, phone_number').eq('company_id', companyId).maybeSingle()
    const isFirst = !integ?.phone_number
    const payload: any = {
      company_id: companyId,
      account_sid: TWILIO_MASTER.accountSid, auth_token: TWILIO_MASTER.authToken,
      api_key_sid: TWILIO_MASTER.apiKeySid || null, api_key_secret: TWILIO_MASTER.apiKeySecret || null,
      twiml_app_sid: TWILIO_MASTER.twimlAppSid || null, messaging_service_sid: TWILIO_MASTER.messagingServiceSid || null,
      number_sid: sid, provisioned_by_colvy: true, is_active: true, updated_at: new Date().toISOString(),
    }
    if (isFirst) payload.phone_number = number
    if (integ) await db.from('twilio_integrations').update(payload).eq('company_id', companyId)
    else await db.from('twilio_integrations').insert(payload)

    // Route this company's SMS + calls through Twilio.
    try { await db.from('companies').update({ sms_provider: 'twilio', voice_provider: 'twilio', number_provider: 'twilio' }).eq('id', companyId) } catch {}

    const numberType = number.replace(/^\+61/, '').startsWith('4') ? 'mobile' : 'local'
    const primary = makePrimary || isFirst

    // Multi-number table — update if we already track this number, else insert.
    const { data: existing } = await db.from('phone_numbers').select('id').eq('phone_number', number).maybeSingle()
    const pnRow: any = {
      company_id: companyId, phone_number: number, provider: 'twilio', twilio_sid: sid,
      number_type: numberType, is_primary: primary, status: 'active',
      provisioned_by_colvy: true, monthly_cost: 0,
    }
    if (existing) await db.from('phone_numbers').update(pnRow).eq('id', existing.id)
    else await db.from('phone_numbers').insert(pnRow)

    // Only one primary per company.
    if (primary) {
      try { await db.from('phone_numbers').update({ is_primary: false }).eq('company_id', companyId).neq('phone_number', number) } catch {}
    }

    return NextResponse.json({ ok: true, phoneNumber: number, sid, isPrimary: primary })
  } catch (err: any) {
    console.error('Assign number error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
