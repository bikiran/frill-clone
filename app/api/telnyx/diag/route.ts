import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/telnyx/diag?companyId=…
// Shows the values the inbound call flow depends on, so we can see WHY the
// browser isn't ringing: the SIP username being dialed, and who's online.
export async function GET(req: NextRequest) {
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()

  const { data: integ } = await db.from('telnyx_integrations')
    .select('phone_number, connection_id, sip_username, credential_id, voice_api_application_id, ring_seconds, voicemail_enabled')
    .eq('company_id', companyId).maybeSingle()

  const cutoff = new Date(Date.now() - 120000).toISOString()
  const { data: online } = await db.from('agent_presence')
    .select('user_id, sip_username, last_seen_at').eq('company_id', companyId)
    .gte('last_seen_at', cutoff)

  // A real Telnyx SIP username is a short alphanumeric string. If sip_username
  // looks like a UUID, it's actually the credential ID (wrong) — that would
  // dial a SIP address that routes nowhere.
  const looksLikeUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

  return NextResponse.json({
    integration: {
      phone_number: integ?.phone_number,
      connection_id: integ?.connection_id,
      sip_username: integ?.sip_username,
      sip_username_looks_wrong: looksLikeUuid(integ?.sip_username),
      credential_id: integ?.credential_id,
      dial_target: integ?.sip_username ? `sip:${integ.sip_username}@sip.telnyx.com` : null,
      ring_seconds: integ?.ring_seconds,
      voicemail_enabled: integ?.voicemail_enabled,
    },
    online_agents: (online || []).length,
    online_detail: online || [],
    hint: !integ?.sip_username
      ? 'No sip_username stored — open Colvy to provision it (token route).'
      : looksLikeUuid(integ?.sip_username)
        ? 'sip_username looks like a credential ID (UUID), not a SIP username — this dials nowhere. Needs re-provisioning.'
        : (online || []).length === 0
          ? 'sip_username looks OK but no agents online — open Colvy and wait ~1 min for the heartbeat.'
          : 'Values look correct. If the browser still does not ring, the WebRTC client is connected but not registered to receive this SIP address.',
  })
}
