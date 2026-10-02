import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'
import { ensureCallConference, logHandoff } from '@/lib/call-handoff'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function userFromReq(db: any, req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  try { const { data } = await db.auth.getUser(token); return data?.user?.id || null } catch { return null }
}

/**
 * POST /api/calls/:callId/handoff/accept   { deviceId }
 *
 * Step 3 — the target device explicitly takes over. We move the handoff to
 * "joining" and hand back the conference name + token this device needs to
 * self-join (via device.connect({ params: { handoff:'1', handoffCallId,
 * handoffToken } })). We do NOT drop the old agent leg yet — that happens only
 * after the new leg is confirmed in the conference (the /confirm callback).
 *
 * A device may only accept a handoff that targets it, on a call whose current
 * agent is the same authenticated user.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await ctx.params
    const db = admin()
    const userId = await userFromReq(db, req)
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const deviceId = String(body?.deviceId || '')
    if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    if (String(call.handoff_status || '') !== 'requested') {
      return NextResponse.json({ error: 'No pending handoff to accept', status: call.handoff_status || 'idle' }, { status: 409 })
    }
    if (call.handoff_expires_at && new Date(call.handoff_expires_at).getTime() < Date.now()) {
      await db.from('calls').update({ handoff_status: 'cancelled', handoff_target_device_id: null, handoff_token: null }).eq('id', callId)
      return NextResponse.json({ error: 'Handoff expired' }, { status: 410 })
    }
    if (call.handoff_target_device_id !== deviceId) {
      return NextResponse.json({ error: 'This device is not the handoff target' }, { status: 403 })
    }
    // Same-user gate: the initiating agent and the accepting device's user match.
    if (call.handoff_by_user_id && call.handoff_by_user_id !== userId) {
      return NextResponse.json({ error: 'A call can only be taken over by the same user' }, { status: 403 })
    }
    const { data: dev } = await db.from('call_devices').select('user_id, company_id, platform').eq('device_id', deviceId).maybeSingle()
    if (!dev || dev.user_id !== userId || String(dev.company_id) !== String(call.company_id)) {
      return NextResponse.json({ error: 'This device may not take over the call' }, { status: 403 })
    }
    await logHandoff(db, { callId, companyId: call.company_id, event: 'accept_attempt', deviceId, platform: dev.platform, userId })

    // Promote the live call into its conference NOW (not at request time) so the
    // current device stays connected until the target actually takes over. This
    // moves the customer (and the current agent leg) into the conference; the
    // target then self-joins the same conference and /confirm drops the old leg.
    const { data: integ } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', call.company_id).maybeSingle()
    if (!integ?.account_sid || !integ.auth_token) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 400 })
    const svc = new TwilioService(integ.account_sid, integ.auth_token)
    let conf: { confName: string; confSid: string; agentLeg: string | null }
    try { conf = await ensureCallConference(svc, db, call) }
    catch (e: any) {
      await logHandoff(db, { callId, companyId: call.company_id, event: 'error', deviceId, platform: dev.platform, userId, detail: `promote failed: ${e.message}` })
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
    await logHandoff(db, { callId, companyId: call.company_id, event: 'promoted', deviceId, platform: dev.platform, userId, detail: `conference ${conf.confName}` })

    await db.from('calls').update({
      handoff_status: 'joining',
      active_agent_call_sid: conf.agentLeg || call.active_agent_call_sid || call.twilio_child_call_sid || null,
    }).eq('id', callId)
    await logHandoff(db, { callId, companyId: call.company_id, event: 'joining', deviceId, platform: dev.platform, userId })

    return NextResponse.json({
      ok: true,
      status: 'joining',
      callId,
      conferenceName: conf.confName,
      handoffToken: call.handoff_token,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
