import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService, twilioIdentity } from '@/lib/twilio-service'
import { inspectFcmSecret } from '@/lib/fcm-secret'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Super-admin diagnostic for a company's Twilio browser-calling setup. Answers
// "why is the phone erroring / calls going to voicemail" by checking each piece
// the Voice SDK depends on and reporting what's wrong in plain terms.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = token ? await db.auth.getUser(token) : { data: null as any }
    if ((auth?.user?.email || '').toLowerCase() !== SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const companyId = new URL(req.url).searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
    const expectedVoiceUrl = `${base}/api/twilio/voice/outbound`
    const out: any = { companyId, checks: [], ok: false }
    const add = (name: string, ok: boolean, detail: string) => out.checks.push({ name, ok, detail })

    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ) { add('integration', false, 'No twilio_integrations row — assign or provision a number first.'); return NextResponse.json(out) }

    add('account credentials', !!(integ.account_sid && integ.auth_token), integ.account_sid ? `account ${integ.account_sid}` : 'missing account_sid/auth_token')
    add('phone number', !!integ.phone_number, integ.phone_number || 'no number on the integration')

    if (!integ.account_sid || !integ.auth_token) return NextResponse.json(out)
    const svc = new TwilioService(integ.account_sid, integ.auth_token)

    // API key (for signing the browser token).
    if (!integ.api_key_sid || !integ.api_key_secret) {
      add('api key', false, 'No API key/secret stored — a token can’t be signed (the token route will try to create one on next call).')
    } else {
      const exists = await svc.keyExists(integ.api_key_sid)
      add('api key', exists, exists ? `${integ.api_key_sid} exists on this account` : `${integ.api_key_sid} is NOT on this account (wrong account/subaccount) — will be regenerated`)
    }

    // TwiML app (routes the SDK's outbound leg).
    if (!integ.twiml_app_sid) {
      add('twiml app', false, 'No TwiML App stored (will be created on next token).')
    } else {
      const app = await svc.getTwimlApp(integ.twiml_app_sid)
      if (!app) add('twiml app', false, `${integ.twiml_app_sid} not found on this account — will be recreated`)
      else add('twiml app', app.voice_url === expectedVoiceUrl, `voice_url = ${app.voice_url || '(unset)'} (expected ${expectedVoiceUrl})`)
    }

    // The number's own inbound webhooks (so calls + texts to it reach us).
    if (integ.phone_number) {
      try {
        const pn = await svc.getIncomingNumber(integ.phone_number)
        if (!pn) add('number webhooks', false, 'Number not found in this Twilio account.')
        else {
          const wantVoice = `${base}/api/twilio/voice/inbound`
          const wantSms = `${base}/api/twilio/webhook`
          const okVoice = pn.voice_url === wantVoice
          const okSms = pn.sms_url === wantSms
          add('number inbound webhooks', okVoice && okSms,
            `voice_url=${pn.voice_url || '(unset)'} sms_url=${pn.sms_url || '(unset)'} (expected ${wantVoice} / ${wantSms})`)
        }
      } catch (e: any) { add('number inbound webhooks', false, e.message) }
    }

    // ── Mobile push credential — the piece that makes an inbound call RING a
    // phone (browser calling doesn't need it). Without a valid one the phone
    // registers fine but Twilio has no channel to deliver the invite, so it
    // never rings even though outbound works. This is the usual cause of "only
    // inbound doesn't ring the app".
    const fcmInfo = inspectFcmSecret(process.env.TWILIO_FCM_SECRET)
    if (!fcmInfo.present) {
      add('fcm push secret', false, 'TWILIO_FCM_SECRET is not set — mobile tokens carry no push credential, so phones never ring on inbound.')
    } else if (fcmInfo.kind === 'legacy') {
      add('fcm push secret', false, 'TWILIO_FCM_SECRET looks like a LEGACY FCM server key — Google shut these down. Replace it with an FCM v1 service-account JSON.')
    } else if (fcmInfo.kind === 'unknown') {
      add('fcm push secret', false, 'TWILIO_FCM_SECRET is set but is not a recognisable FCM v1 service-account JSON.')
    } else {
      add('fcm push secret', true, `FCM v1 service account for Firebase project "${fcmInfo.projectId}" — this MUST match the mobile app's google-services.json project_id.`)
    }

    if (!integ.push_credential_sid) {
      add('push credential', false, 'No push_credential_sid stored — it is created on the next mobile token mint (needs TWILIO_FCM_SECRET set).')
    } else {
      const cred = await svc.getPushCredential(integ.push_credential_sid)
      if (!cred) {
        add('push credential', false, `${integ.push_credential_sid} not found on this account — it will be recreated on the next token mint.`)
      } else {
        const fresh = !!(fcmInfo.fingerprint && typeof cred.friendly_name === 'string' && cred.friendly_name.includes(`#${fcmInfo.fingerprint}`))
        add('push credential', fresh, fresh
          ? `${cred.sid} (${cred.type}) is built from the current secret.`
          : `${cred.sid} (${cred.type}) was built from a DIFFERENT/older secret — it will be rebuilt on the next token mint.`)
      }
    }

    // Who's online to receive an inbound call right now.
    const cutoff = new Date(Date.now() - 120000).toISOString()
    const { data: online } = await db.from('agent_presence').select('user_id').eq('company_id', companyId).gte('last_seen_at', cutoff).neq('available', false)
    const identities = Array.from(new Set((online || []).map((a: any) => twilioIdentity(a.user_id, companyId))))
    add('agents online', identities.length > 0, identities.length ? `${identities.length} online: ${identities.join(', ')}` : 'nobody online in the last 2 min — inbound would go straight to voicemail')

    out.ok = out.checks.every((c: any) => c.ok)
    out.expectedVoiceUrl = expectedVoiceUrl
    return NextResponse.json(out)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
