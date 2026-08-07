import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService, createVoiceAccessToken, twilioIdentity } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Mint a short-lived Twilio Voice Access Token for the browser SDK. Never
// exposes the account credentials — only this JWT, scoped to the TwiML App.
export async function POST(req: NextRequest) {
  try {
    const { companyId, userId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.account_sid || !integ.auth_token) {
      return NextResponse.json({ error: 'Twilio isn\'t connected. Add your credentials in Integrations → Twilio.' }, { status: 400 })
    }

    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
    const svc = new TwilioService(integ.account_sid, integ.auth_token)

    // ── Self-provision the Voice pieces (parity with Telnyx "set up calling") ──
    // Browser calling needs an API Key pair (to sign tokens) and a TwiML App
    // (whose Voice URL points at our outbound handler). Create either if missing
    // so voice works without manual Console steps. Best-effort — a failure here
    // still lets an owner paste their own SIDs in settings.
    let apiKeySid = integ.api_key_sid
    let apiKeySecret = integ.api_key_secret
    let twimlAppSid = integ.twiml_app_sid
    const voiceUrl = `${base}/api/twilio/voice/outbound`

    try {
      if (!apiKeySid || !apiKeySecret) {
        const key = await svc.createApiKey(`Colvy ${String(companyId).slice(0, 8)}`)
        if (key?.sid && key?.secret) {
          apiKeySid = key.sid
          apiKeySecret = key.secret
          await db.from('twilio_integrations').update({ api_key_sid: apiKeySid, api_key_secret: apiKeySecret }).eq('company_id', companyId)
        }
      }
      if (!twimlAppSid) {
        const app = await svc.createTwimlApp({ friendlyName: `Colvy ${String(companyId).slice(0, 8)}`, voiceUrl })
        twimlAppSid = app?.sid
        if (twimlAppSid) await db.from('twilio_integrations').update({ twiml_app_sid: twimlAppSid }).eq('company_id', companyId)
      } else {
        // Keep the app's Voice URL current (e.g. if the domain changed).
        try { await svc.updateTwimlApp(twimlAppSid, { voiceUrl }) } catch {}
      }
    } catch (e: any) {
      console.error('[twilio token] voice self-provision failed', e?.message || e)
    }

    if (!apiKeySid || !apiKeySecret || !twimlAppSid) {
      return NextResponse.json({ error: 'Twilio voice isn\'t fully set up (need an API Key + TwiML App). Add them in Integrations → Twilio.' }, { status: 400 })
    }

    const identity = twilioIdentity(userId, companyId)
    const token = createVoiceAccessToken({
      accountSid: integ.account_sid,
      apiKeySid, apiKeySecret,
      identity, twimlAppSid,
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
    })

    return NextResponse.json({ token, identity, from: integ.phone_number || null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
