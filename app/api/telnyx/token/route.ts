import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Mints a short-lived WebRTC login token for the browser client.
// The browser NEVER sees the API key — only this ephemeral JWT.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return NextResponse.json({ error: 'Calling isn\'t set up yet. Add a number in Integrations → Phone & SMS.' }, { status: 400 })
    if (!integ.connection_id) return NextResponse.json({ error: 'No WebRTC connection configured' }, { status: 400 })

    const svc = new TelnyxService(integ.api_key)

    // SELF-HEAL on every token mint (cheap, and fixes calling with no manual
    // step). Two things must be true or Telnyx rejects the call outright:
    //   1. The outbound voice profile must whitelist AU (it defaults to US/CA).
    //   2. That profile must be ATTACHED to the WebRTC connection.
    try {
      const profile = await svc.ensureOutboundVoiceProfile(`Colvy ${companyId.slice(0, 8)}`)  // adds AU if missing
      const conn = await svc.getCredentialConnection(integ.connection_id)
      const attached = conn?.outbound?.outbound_voice_profile_id
      if (profile?.id && attached !== profile.id) {
        await svc.attachOutboundProfile(integ.connection_id, profile.id)
      }
    } catch (e) { console.error('[telnyx token] outbound profile heal failed', e) }

    // ROUTING (Option B — Voice API / Call Control): the number must be assigned
    // to the VOICE API APPLICATION so inbound calls fire our webhook. Critically,
    // we NO LONGER re-point the number on every token mint — the old code snapped
    // it back to the WebRTC connection each time Colvy loaded, stealing it from
    // the Voice API app and breaking inbound. We only nudge it toward the Voice
    // API app when its id is explicitly configured; otherwise we leave whatever
    // routing is set in the Telnyx UI untouched so it STAYS put.
    try {
      const voiceAppId = (integ as any).voice_api_application_id
      if (integ.phone_number && voiceAppId) {
        const num = await svc.getNumber(integ.phone_number)
        if (num && String(num.connection_id || '') !== String(voiceAppId)) {
          await svc.assignNumberToConnection(integ.phone_number, voiceAppId)
          console.log('[telnyx token] pointed number at Voice API app', integ.phone_number, '->', voiceAppId)
        }
      }
    } catch (e) { console.error('[telnyx token] number routing heal failed', e) }

    // The browser must register on a CREDENTIAL SIP CONNECTION to RECEIVE
    // inbound calls. A telephony credential on the Voice API app connects but
    // never receives the invite (the whole "registered but browser never rings"
    // bug). So ensure a dedicated WebRTC credential connection exists, and put
    // the telephony credential on THAT — separate from the Voice API app that
    // owns the number and originates the dial.
    let webrtcConnId = (integ as any).webrtc_connection_id
    if (!webrtcConnId) {
      try {
        const conn = await svc.createCredentialConnection(`Colvy WebRTC ${companyId.slice(0, 8)}`)
        webrtcConnId = conn?.data?.id
        console.log('[telnyx token] createCredentialConnection result', JSON.stringify({ id: conn?.data?.id, err: (conn as any)?.errors }))
        if (webrtcConnId) {
          const { error: persistErr } = await db.from('telnyx_integrations').update({ webrtc_connection_id: webrtcConnId }).eq('company_id', companyId)
          if (persistErr) console.error('[telnyx token] could not persist webrtc_connection_id (run migration V183):', persistErr.message)
        } else {
          console.error('[telnyx token] createCredentialConnection returned NO id', JSON.stringify(conn))
        }
      } catch (e: any) {
        console.error('[telnyx token] could not create WebRTC credential connection', e?.message || e)
      }
    }

    // Reuse a stored credential ONLY if it's on the WebRTC connection; otherwise
    // (re)create it there. The old credential lived on the Voice API app, which
    // is why delivery failed — so a mismatch forces a fresh one.
    let credentialId = (integ as any).credential_id
    let storedSipUser = (integ as any).sip_username
    const credOnWrongConn = credentialId && (integ as any).credential_connection_id && (integ as any).credential_connection_id !== webrtcConnId
    const looksLikeUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

    // If we have no credential, or it's on the wrong connection, or its
    // sip_username is a UUID, create a fresh credential on the WebRTC connection.
    let needFresh = !credentialId || looksLikeUuid(storedSipUser)
    // Verify the existing credential is actually on the WebRTC connection.
    if (credentialId && webrtcConnId && !needFresh) {
      try {
        const existing = await svc.getTelephonyCredential(credentialId)
        if (String(existing?.data?.connection_id || '') !== String(webrtcConnId)) needFresh = true
        else storedSipUser = existing?.data?.sip_username || storedSipUser
      } catch { needFresh = true }
    }

    if (needFresh && webrtcConnId) {
      const cred = await svc.createTelephonyCredential(webrtcConnId, `colvy-${companyId.slice(0, 8)}`)
      credentialId = cred?.data?.id
      const sipUsername = cred?.data?.sip_username || null
      if (credentialId) {
        await db.from('telnyx_integrations').update({
          credential_id: credentialId,
          ...(sipUsername ? { sip_username: sipUsername } : {}),
        }).eq('company_id', companyId)
        storedSipUser = sipUsername
        console.log('[telnyx token] created credential on WebRTC connection', { credentialId, sipUsername })
      }
    }
    if (!credentialId) return NextResponse.json({ error: 'Could not create WebRTC credential' }, { status: 500 })

    const token = await svc.createCredentialToken(credentialId)

    // Pick the caller ID: if the conversation belongs to a location that has its
    // own number, use it; else the company's primary number; else the legacy one.
    let fromNumber: string | undefined = integ.phone_number
    try {
      const { data: primary } = await db.from('phone_numbers')
        .select('phone_number, location_id, is_primary').eq('company_id', companyId).neq('status', 'released')
      if (primary && primary.length > 0) {
        let chosen = primary.find((n: any) => n.is_primary) || primary[0]
        if (conversationId) {
          const { data: conv } = await db.from('conversations').select('location_id').eq('id', conversationId).maybeSingle()
          if (conv?.location_id) {
            const forLoc = primary.find((n: any) => n.location_id === conv.location_id)
            if (forLoc) chosen = forLoc
          }
        }
        fromNumber = chosen.phone_number
      }
    } catch {}

    return NextResponse.json({ token, from: fromNumber })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
