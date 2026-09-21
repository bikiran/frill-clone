import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/log'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService, toE164 } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/telnyx/outbound-start — place an outbound call SERVER-SIDE via Call
 * Control, so the call has controllable legs (hold / warm transfer / ring team /
 * switch device), exactly like an inbound call.
 *
 * WHY THIS EXISTS
 * A browser WebRTC newCall() dials the customer directly. That leg has no
 * server-side call_control_id, so it can never be moved into a conference — which
 * is what hold/transfer/ring-team need. This route instead makes an outbound call
 * land in the SAME database shape an inbound call does (a `calls` row carrying
 * telnyx_call_control_id = customer + agent_call_control_id = agent, bridged), so
 * the existing /api/telnyx/call-transfer route works on it unchanged.
 *
 * FLOW (agent-first, mirrors inbound in reverse):
 *   1. (here) dial the AGENT's registered SIP client — their browser rings and
 *      auto-answers the outbound leg.
 *   2. (webhook, call.answered role=agent) dial the CUSTOMER.
 *   3. (webhook, call.answered role=customer) bridge the two + start recording.
 *
 * The browser hears its own local ringback while the customer is dialled, so no
 * server-side ringback playback is needed.
 *
 * Feature-flagged: the browser only calls this when the outbound-bridge flag is
 * on; otherwise it keeps using the direct WebRTC dial. If this route errors the
 * browser falls back to the WebRTC dial too, so outbound calling never breaks.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, to: toRaw, from, conversationId, contactId, contactName, agentName, userId } = await req.json()
    if (!companyId || !toRaw) return NextResponse.json({ error: 'Missing companyId or to' }, { status: 400 })
    // Normalise the customer number to E.164 before it's stored or dialled. The
    // webhook dials the customer with this stored value, and Telnyx can't route a
    // national-format number ("0421175430") — the carrier answers it with a "the
    // number you have called is switched off / not available" announcement. The
    // direct-dial and Twilio paths already normalise; this closes the gap for the
    // Telnyx server-bridge path. (toE164 returns an already-E.164 number as-is.)
    const to = toE164(String(toRaw)) || String(toRaw)
    if (!userId) return NextResponse.json({ error: 'Missing userId (needed to ring your device back)' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return NextResponse.json({ error: 'Telnyx is not configured' }, { status: 400 })

    // The agent's own SIP identity — the browser registers on this (see
    // /api/telnyx/token). Without it we have nothing to ring back.
    const webrtcConnId = (integ as any).webrtc_connection_id
    let agentSip: string | null = null
    try {
      let q = db.from('telnyx_user_credentials')
        .select('sip_username, connection_id')
        .eq('company_id', companyId).eq('user_id', userId)
        .not('sip_username', 'is', null)
      if (webrtcConnId) q = q.eq('connection_id', webrtcConnId)
      const { data: creds } = await q.order('created_at', { ascending: false }).limit(1)
      agentSip = creds?.[0]?.sip_username || null
    } catch {}
    // Fall back to the shared credential if the per-user one isn't provisioned.
    if (!agentSip) agentSip = (integ as any).sip_username || null
    if (!agentSip) {
      return NextResponse.json({ error: 'No SIP handset provisioned for you yet — open Colvy so your device registers, then try again' }, { status: 400 })
    }

    // The Voice API (Call Control) app is the only connection that can originate
    // a CONTROLLABLE leg. Mirror the inbound dial-connection preference.
    const dialConnectionId = (integ as any).voice_api_application_id || integ.connection_id
    if (!dialConnectionId) return NextResponse.json({ error: 'No Voice API application configured for outbound control' }, { status: 400 })

    const fromNumber = from || integ.phone_number
    if (!fromNumber) return NextResponse.json({ error: 'No caller ID number configured' }, { status: 400 })

    // Create the call row up front so the browser can drive hold/transfer against
    // its id immediately, and the webhook can find it by client_state.
    const { data: row, error: insErr } = await db.from('calls').insert({
      company_id: companyId,
      direction: 'outbound',
      provider: 'telnyx',
      from_number: fromNumber,
      to_number: to,
      conversation_id: conversationId || null,
      contact_id: contactId || null,
      contact_name: contactName || null,
      agent_name: agentName || 'Agent',
      answered_by_user_id: userId,
      status: 'dialing_agent',
    }).select().maybeSingle()
    if (insErr || !row) {
      return NextResponse.json({ error: insErr?.message || 'Could not create call' }, { status: 500 })
    }
    const callId = row.id

    const svc = new TelnyxService(integ.api_key)
    const webhookUrl = `${new URL(req.url).origin}/api/telnyx/webhook`

    // Ring the agent's browser. Show the CUSTOMER's number as the caller so the
    // browser can label the leg, and tag the leg with client_state (for the
    // webhook) plus an X- header (for the browser to auto-answer it as outbound).
    try {
      const agentLeg: any = await svc.dial({
        connection_id: dialConnectionId,
        to: `sip:${agentSip}@sip.telnyx.com`,
        from: to,                     // customer number → shows on the agent's device
        timeout_secs: 30,
        webhook_url: webhookUrl,
        client_state: JSON.stringify({ t: 'ob', callId, role: 'agent', to, companyId }),
        sip_headers: [{ name: 'X-Colvy-Outbound', value: callId }],
      })
      const agentLegId = agentLeg?.data?.call_control_id || agentLeg?.call_control_id || null
      if (!agentLegId) throw new Error('No agent leg id returned')
      await db.from('calls').update({ agent_call_control_id: agentLegId }).eq('id', callId)
      log.info('[telnyx outbound] rang agent', { callId, agentLegId })
    } catch (e: any) {
      // Clean up the row so a failed start doesn't leave a phantom "dialing" call.
      try { await db.from('calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callId) } catch {}
      return NextResponse.json({ error: e?.message || 'Could not ring your device' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, callId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
