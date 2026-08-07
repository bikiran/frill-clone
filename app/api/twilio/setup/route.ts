import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const isMasked = (s?: string | null) => !!s && s.includes('••')

// Save / update Bring-Your-Own Twilio config for a company, and (optionally) set
// which provider is live for SMS and/or Voice. Verifies credentials first.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      companyId, accountSid, authToken, phoneNumber, messagingServiceSid,
      apiKeySid, apiKeySecret, twimlAppSid, smsProvider, voiceProvider, isUpdate,
    } = body
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()

    // Update provider selection alone (no credential change) — e.g. flipping the
    // toggle back to Telnyx.
    if (smsProvider || voiceProvider) {
      const upd: any = {}
      if (smsProvider === 'telnyx' || smsProvider === 'twilio') upd.sms_provider = smsProvider
      if (voiceProvider === 'telnyx' || voiceProvider === 'twilio') upd.voice_provider = voiceProvider
      if (Object.keys(upd).length) {
        try { await db.from('companies').update(upd).eq('id', companyId) }
        catch (e: any) { return NextResponse.json({ error: `Could not set provider (run migration V249?): ${e.message}` }, { status: 500 }) }
      }
    }

    // Provider-only flip with no credentials in the body → done.
    if (!accountSid && !authToken && !phoneNumber && !messagingServiceSid && !apiKeySid && !apiKeySecret && !twimlAppSid) {
      return NextResponse.json({ ok: true })
    }

    // Verify credentials when a real (unmasked) token is supplied.
    if (accountSid && authToken && !isMasked(authToken)) {
      try {
        const svc = new TwilioService(accountSid, authToken)
        await svc.verify() // throws on bad credentials
      } catch (e: any) {
        return NextResponse.json({ error: `Could not verify Twilio credentials: ${e.message}` }, { status: 400 })
      }
    }

    const { data: existing } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()

    const payload: any = {
      company_id: companyId,
      account_sid: accountSid || existing?.account_sid || null,
      phone_number: phoneNumber ?? existing?.phone_number ?? null,
      messaging_service_sid: messagingServiceSid ?? existing?.messaging_service_sid ?? null,
      api_key_sid: apiKeySid ?? existing?.api_key_sid ?? null,
      twiml_app_sid: twimlAppSid ?? existing?.twiml_app_sid ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    // Only overwrite secrets when a fresh (unmasked) value is provided.
    if (authToken && !isMasked(authToken)) payload.auth_token = authToken
    if (apiKeySecret && !isMasked(apiKeySecret)) payload.api_key_secret = apiKeySecret

    if (existing) await db.from('twilio_integrations').update(payload).eq('company_id', companyId)
    else await db.from('twilio_integrations').insert(payload)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Fetch config (masked) + current provider selection for the settings page.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const { data } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()

    let smsProvider = 'telnyx', voiceProvider = 'telnyx'
    try {
      const { data: co } = await db.from('companies').select('sms_provider, voice_provider').eq('id', companyId).maybeSingle()
      smsProvider = co?.sms_provider || 'telnyx'
      voiceProvider = co?.voice_provider || 'telnyx'
    } catch {}

    const mask = (s?: string | null) => (s ? `••••••••${String(s).slice(-4)}` : null)
    return NextResponse.json({
      smsProvider,
      voiceProvider,
      integration: data ? {
        ...data,
        auth_token: mask(data.auth_token),
        api_key_secret: mask(data.api_key_secret),
      } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
