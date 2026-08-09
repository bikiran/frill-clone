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
    const label = `Colvy ${String(companyId).slice(0, 8)}`

    try {
      // The API key must have BOTH a SID and secret AND actually belong to this
      // account. A key SID copied from another account (or a stale/blank env
      // value) mints a token Twilio rejects — the browser Device then never
      // registers ("Phone error"), outbound throws, inbound falls to voicemail.
      // Regenerate a fresh key (via the account auth token, always valid) when
      // what we have doesn't check out.
      let keyOk = !!(apiKeySid && apiKeySecret)
      if (keyOk) keyOk = await svc.keyExists(apiKeySid)
      if (!keyOk) {
        const key = await svc.createApiKey(label)
        if (key?.sid && key?.secret) {
          apiKeySid = key.sid
          apiKeySecret = key.secret
          await db.from('twilio_integrations').update({ api_key_sid: apiKeySid, api_key_secret: apiKeySecret }).eq('company_id', companyId)
        }
      }

      // The TwiML App must exist on this account and point its Voice URL at our
      // outbound handler, or Device.connect() has nowhere to route the call.
      const app = twimlAppSid ? await svc.getTwimlApp(twimlAppSid) : null
      if (!app) {
        const created = await svc.createTwimlApp({ friendlyName: label, voiceUrl })
        twimlAppSid = created?.sid
        if (twimlAppSid) await db.from('twilio_integrations').update({ twiml_app_sid: twimlAppSid }).eq('company_id', companyId)
      } else if (app.voice_url !== voiceUrl) {
        // Keep the Voice URL current (e.g. the domain changed).
        try { await svc.updateTwimlApp(twimlAppSid, { voiceUrl }) } catch {}
      }
    } catch (e: any) {
      console.error('[twilio token] voice self-provision failed', e?.message || e)
    }

    if (!apiKeySid || !apiKeySecret || !twimlAppSid) {
      return NextResponse.json({ error: 'Twilio voice isn\'t fully set up (need an API Key + TwiML App). Add them in Integrations → Twilio.' }, { status: 400 })
    }

    const identity = twilioIdentity(userId, companyId)

    // ── Mobile push credential (auto-provisioned, per Twilio account) ──────────
    // The mobile SDK only rings when the token names a Push Credential (see
    // createVoiceAccessToken). It's account-scoped, so — exactly like the API Key
    // and TwiML App above — each company's Twilio account needs its own, made
    // once from the app's single Firebase credential (TWILIO_FCM_SECRET). This
    // removes any per-company setup: it's created + cached automatically, and a
    // SID that was made in a different account (Twilio "31404 Not Found") is
    // detected here and re-created on the right one. Best-effort: if it fails,
    // the token is still minted (browser calling unaffected; mobile just won't
    // ring until the next successful provision).
    let pushCredentialSid = integ.push_credential_sid || null
    const fcmSecret = process.env.TWILIO_FCM_SECRET
    if (fcmSecret) {
      try {
        let credOk = !!pushCredentialSid
        if (credOk) credOk = !!(await svc.getPushCredential(pushCredentialSid!))
        if (!credOk) {
          const cred = await svc.createPushCredential({
            friendlyName: `Colvy Mobile ${String(companyId).slice(0, 8)}`,
            fcmSecret,
          })
          if (cred?.sid) {
            pushCredentialSid = cred.sid
            await db.from('twilio_integrations').update({ push_credential_sid: pushCredentialSid }).eq('company_id', companyId)
          }
        }
      } catch (e: any) {
        console.error('[twilio token] push credential provision failed', e?.message || e)
      }
    }

    const token = createVoiceAccessToken({
      accountSid: integ.account_sid,
      apiKeySid, apiKeySecret,
      identity, twimlAppSid,
      pushCredentialSid,
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
    })

    return NextResponse.json({ token, identity, from: integ.phone_number || null, hasPushCredential: !!pushCredentialSid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
