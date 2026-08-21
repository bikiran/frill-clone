import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'
import { ensureCallConference, newHandoffToken, HANDOFF_TTL_MS } from '@/lib/call-handoff'

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
 * POST /api/calls/:callId/handoff   { targetDeviceId }
 *
 * Step 1 of a device handoff. The device the agent is currently on asks to move
 * this LIVE call to another of the same user's devices. We validate, promote
 * the call into its conference (so the customer stays connected while a second
 * agent leg joins), and mark the handoff "requested". The target device learns
 * of it by subscribing to this calls row (realtime) and then calls .../accept.
 *
 * Security: the target device must belong to the SAME authenticated user, in the
 * same company, and be online. The customer is never transferred to a number —
 * only the agent media leg moves.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await ctx.params
    const db = admin()
    const userId = await userFromReq(db, req)
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const targetDeviceId = String(body?.targetDeviceId || '')
    if (!targetDeviceId) return NextResponse.json({ error: 'targetDeviceId is required' }, { status: 400 })

    // ── Load & validate the call ──────────────────────────────────────────────
    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    if (call.provider && call.provider !== 'twilio') return NextResponse.json({ error: 'Device handoff is available on Twilio calls only' }, { status: 400 })
    if (call.ended_at || ['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(String(call.status || ''))) {
      return NextResponse.json({ error: 'This call has already ended' }, { status: 409 })
    }
    if (['requested', 'joining'].includes(String(call.handoff_status || '')) && call.handoff_expires_at && new Date(call.handoff_expires_at).getTime() > Date.now()) {
      return NextResponse.json({ error: 'A handoff is already in progress for this call' }, { status: 409 })
    }

    const companyId = call.company_id
    // Requester must be a participant: either the agent who answered, or (when
    // that wasn't captured, e.g. outbound) any member of the call's company.
    if (call.answered_by_user_id && call.answered_by_user_id !== userId) {
      return NextResponse.json({ error: 'Only the agent on the call can move it' }, { status: 403 })
    }
    const inCompany = await isCompanyMember(db, companyId, userId)
    if (!inCompany) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })

    // ── Validate the target device (same user, same company, online) ──────────
    const { data: target } = await db.from('call_devices').select('*').eq('device_id', targetDeviceId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Target device not found' }, { status: 404 })
    if (target.user_id !== userId || String(target.company_id) !== String(companyId)) {
      return NextResponse.json({ error: 'That device belongs to a different user or workspace' }, { status: 403 })
    }
    if (target.online === false || !target.last_seen_at || (Date.now() - new Date(target.last_seen_at).getTime()) > 70_000) {
      return NextResponse.json({ error: 'That device is offline' }, { status: 409 })
    }

    // ── Promote the live call into its conference (customer stays connected) ──
    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.account_sid || !integ.auth_token) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 400 })
    const svc = new TwilioService(integ.account_sid, integ.auth_token)

    let conf: { confName: string; confSid: string; agentLeg: string | null }
    try { conf = await ensureCallConference(svc, db, call) }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }) }

    // ── Mark the handoff requested ────────────────────────────────────────────
    const token = newHandoffToken()
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString()
    await db.from('calls').update({
      handoff_status: 'requested',
      handoff_target_device_id: targetDeviceId,
      handoff_by_user_id: userId,
      handoff_token: token,
      handoff_expires_at: expiresAt,
      // The agent leg currently carrying the call — removed once the new one is
      // confirmed. Record it now so a later confirm knows which leg to drop.
      active_agent_call_sid: conf.agentLeg || call.active_agent_call_sid || call.twilio_child_call_sid || null,
    }).eq('id', callId)

    // A backgrounded mobile target also gets a push so the user can reopen Colvy
    // and accept. Best-effort — the realtime banner is the primary path, this
    // just wakes a phone whose app isn't foreground. Never blocks the handoff.
    if (target.platform === 'ios' || target.platform === 'android') {
      try { await pushTakeover(db, companyId, userId, call) } catch { /* push is best-effort */ }
    }

    return NextResponse.json({ ok: true, status: 'requested', conferenceName: conf.confName, expiresAt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Nudge the target user's phone(s) to continue the call there. Reuses the Expo
// push_tokens registry (per user+company) — only phones register there, so this
// naturally reaches the mobile devices and skips web sessions. Foregrounding the
// app is enough: the mobile CallProvider's realtime subscription then raises the
// "Continue call on this phone" banner for the requested handoff.
async function pushTakeover(db: any, companyId: string, userId: string, call: any) {
  const { data: tokens } = await db.from('push_tokens')
    .select('expo_token').eq('company_id', companyId).eq('user_id', userId)
  const seen = new Set<string>()
  const to: string[] = (tokens || [])
    .map((t: any) => t.expo_token)
    .filter((x: string) => x && !seen.has(x) && (seen.add(x), true))
  if (!to.length) return

  const who = call.contact_name || call.caller_name ||
    (call.direction === 'inbound' ? call.from_number : call.to_number) || 'a customer'
  const messages = to.map((token: string) => ({
    to: token,
    sound: 'default',
    title: 'Continue call on this phone',
    body: `Tap to take over your call with ${who}.`,
    data: { type: 'call', kind: 'call_handoff', route: '/(tabs)/inbox', callId: call.id, companyId },
    priority: 'high',
    channelId: 'calls',
  }))

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
}

// Is this user a member (or owner) of the company?
async function isCompanyMember(db: any, companyId: string, userId: string): Promise<boolean> {
  try {
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === userId) return true
  } catch {}
  try {
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
    if (tm?.id) return true
  } catch {}
  return false
}
