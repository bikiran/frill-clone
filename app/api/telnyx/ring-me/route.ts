import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { TelnyxService } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId } — "I'm free now: ring me if a call is still waiting."
//
// While an agent is on a call they report themselves busy, so a second inbound
// call skips them and rings everyone else. If that call is STILL ringing when
// they hang up, nothing used to ring them — the call just sat there as
// "incoming" with no way to answer it. The browser calls this the moment a call
// ends; if an inbound call for the company is still ringing agents, we dial this
// agent's own SIP identity into it as one more leg. It answers like any other
// leg (first answer wins, the rest are cancelled).
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const { companyId, callId } = await req.json().catch(() => ({}))
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok || !access.userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // A call that's still ringing agents — not answered, not gone to voicemail —
    // and recent enough that the caller is plausibly still on the line. The
    // specific one the agent chose to answer, when given; else the longest wait.
    const since = new Date(Date.now() - 90_000).toISOString()
    let q = db.from('calls').select('*')
      .eq('company_id', companyId).eq('direction', 'inbound').eq('status', 'ringing_agents')
      .gte('created_at', since)
    if (typeof callId === 'string' && callId) q = q.eq('id', callId)
    const { data: rows } = await q.order('created_at', { ascending: true }).limit(1)
    const call = rows?.[0]
    if (!call?.telnyx_call_control_id) return NextResponse.json({ ringing: false })

    const rs: any = call.routing_state || {}
    const late: any[] = Array.isArray(rs.late_legs) ? rs.late_legs : []
    if (late.some(l => l.user === access.userId && !l.ended)) return NextResponse.json({ ringing: true, already: true })

    const [{ data: cred }, { data: integ }] = await Promise.all([
      db.from('telnyx_user_credentials').select('sip_username').eq('company_id', companyId).eq('user_id', access.userId).maybeSingle(),
      db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle(),
    ])
    if (!cred?.sip_username || !integ?.api_key) return NextResponse.json({ ringing: false })
    const connId = rs.connId || (integ as any).voice_api_application_id || integ.connection_id
    if (!connId) return NextResponse.json({ ringing: false })

    const svc = new TelnyxService(integ.api_key)
    const child = await svc.createChildCall({
      connection_id: connId,
      to: `sip:${cred.sip_username}@sip.telnyx.com`,
      from: rs.from || call.from_number,
      timeout_secs: Math.max(Number(rs.ring || integ.ring_seconds || 25), 20),
      link_to: call.telnyx_call_control_id,
      webhook_url: `${new URL(req.url).origin}/api/telnyx/webhook`,
    })
    const legId = (child as any)?.data?.call_control_id || null
    if (!legId) return NextResponse.json({ ringing: false })

    const legs: string[] = Array.isArray(call.ringing_leg_ids) ? call.ringing_leg_ids : []
    await db.from('calls').update({
      ringing_leg_ids: Array.from(new Set([...legs, legId])),
      routing_state: { ...rs, late_legs: [...late, { leg: legId, user: access.userId, at: new Date().toISOString() }] },
    }).eq('id', call.id)
    return NextResponse.json({ ringing: true, callId: call.id })
  } catch (e: any) {
    return NextResponse.json({ ringing: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}
