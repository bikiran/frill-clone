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

    // Reuse a stored credential if we have one, otherwise create one bound to
    // the company's connection.
    let credentialId = (integ as any).sip_username // we store the credential id here
    if (!credentialId) {
      const cred = await svc.createTelephonyCredential(integ.connection_id, `colvy-${companyId.slice(0, 8)}`)
      credentialId = cred?.data?.id
      if (credentialId) {
        await db.from('telnyx_integrations').update({ sip_username: credentialId }).eq('company_id', companyId)
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
