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

    // SELF-HEAL 2 — INBOUND. A customer ringing the business number gets an
    // engaged/busy tone if the number isn't routed to this WebRTC connection:
    // Telnyx has nowhere to send the call, so it rejects it. Make sure the
    // company's number points at the connection we're about to hand a token for.
    try {
      if (integ.phone_number && integ.connection_id) {
        const num = await svc.getNumber(integ.phone_number)
        if (num && String(num.connection_id || '') !== String(integ.connection_id)) {
          await svc.assignNumberToConnection(integ.phone_number, integ.connection_id)
          console.log('[telnyx token] re-pointed', integ.phone_number, '->', integ.connection_id)
        }
      }
    } catch (e) { console.error('[telnyx token] number routing heal failed', e) }

    // Reuse a stored credential if we have one, otherwise create one bound to
    // the company's connection.
    let credentialId = (integ as any).credential_id || (integ as any).sip_username // legacy: id was stored in sip_username
    let storedSipUser = (integ as any).sip_username
    const looksLikeUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

    if (!credentialId) {
      const cred = await svc.createTelephonyCredential(integ.connection_id, `colvy-${companyId.slice(0, 8)}`)
      credentialId = cred?.data?.id
      // The credential's SIP username is what Call Control dials to ring this
      // browser client (sip:<username>@sip.telnyx.com). Store BOTH the id (to
      // mint tokens) and the sip_username (to route inbound calls).
      const sipUsername = cred?.data?.sip_username || null
      if (credentialId) {
        await db.from('telnyx_integrations').update({
          credential_id: credentialId,
          ...(sipUsername ? { sip_username: sipUsername } : {}),
        }).eq('company_id', companyId)
        storedSipUser = sipUsername
      }
    } else if (looksLikeUuid(storedSipUser)) {
      // SELF-HEAL: the sip_username column holds the credential ID (a UUID),
      // which is the legacy bug — Call Control was dialing sip:<uuid>@… which
      // routes nowhere, so the browser never rang. Fetch the credential's real
      // sip_username from Telnyx and correct the columns.
      try {
        const cred = await svc.getTelephonyCredential(credentialId)
        const realSip = cred?.data?.sip_username || null
        if (realSip) {
          await db.from('telnyx_integrations').update({
            credential_id: credentialId,   // move the UUID to its proper column
            sip_username: realSip,
          }).eq('company_id', companyId)
          storedSipUser = realSip
          console.log('[telnyx token] healed sip_username', { from: 'uuid', to: realSip })
        }
      } catch (e) {
        console.error('[telnyx token] could not heal sip_username', e)
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

    // Provision REGISTRATION credentials on the connection so the browser can
    // register (login/password) as a real SIP endpoint — required for inbound
    // Call Control to dial it. We set a known password and store it, since
    // Telnyx never returns an existing password. Reuse the stored one if present.
    let regUser = (integ as any).reg_username
    let regPass = (integ as any).reg_password
    if (!regUser || !regPass) {
      regUser = `colvy_${companyId.slice(0, 8)}`
      regPass = `Cv${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2).toUpperCase()}!`
      try {
        await svc.setConnectionCredentials(integ.connection_id, regUser, regPass)
        await db.from('telnyx_integrations').update({ reg_username: regUser, reg_password: regPass, sip_username: regUser }).eq('company_id', companyId)
        storedSipUser = regUser
      } catch (e) {
        console.error('[telnyx token] could not set connection credentials', e)
      }
    }

    return NextResponse.json({
      token,
      from: fromNumber,
      // Credential registration — the client registers with these so inbound
      // calls to sip:<regUser>@sip.telnyx.com actually reach this browser.
      sipUser: regUser,
      sipPassword: regPass,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
