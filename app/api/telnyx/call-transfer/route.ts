import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/telnyx/call-transfer — warm (attended) transfer.
 *
 * WHY A CONFERENCE:
 * A live call is two bridged legs. Bridged legs can only hear each other, so
 * there's no way to hold one side and speak privately to a third party. Moving
 * both legs into a Telnyx conference makes each participant independently
 * holdable, and lets a colleague's leg join without the customer hearing it.
 *
 * WHY THIS GOES THROUGH TELNYX AT ALL:
 * The customer's audio lives inside a Telnyx call leg. Browser-to-browser
 * WebRTC between two agents is a separate media path and cannot be joined to
 * it, so a colleague reached that way could never actually take the customer.
 * Agent legs are SIP/WebRTC and don't touch the PSTN, so the internal ring
 * costs little or nothing — it's dialling someone's *mobile* that's billable.
 *
 * Actions:
 *   consult  — hold the customer, ring a colleague, talk privately
 *   complete — hand the customer over and drop the original agent
 *   conference — bring everyone into a three-way
 *   cancel   — drop the colleague, return to the customer
 *   hold / unhold — hold controls on their own
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, callId, action, toUserId, actorName } = await req.json()
    if (!companyId || !callId || !action) {
      return NextResponse.json({ error: 'Missing companyId, callId or action' }, { status: 400 })
    }

    const db = admin()
    const { data: call } = await db.from('calls')
      .select('*').eq('id', callId).eq('company_id', companyId).maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    const customerLeg = call.telnyx_call_control_id
    const agentLeg = call.agent_call_control_id
    if (!customerLeg) return NextResponse.json({ error: 'This call has no active leg' }, { status: 400 })

    const { data: integ } = await db.from('telnyx_integrations')
      .select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return NextResponse.json({ error: 'Telnyx is not configured' }, { status: 400 })
    const svc = new TelnyxService(integ.api_key)

    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin
    const holdAudio = integ.hold_music_url || undefined

    // ── Make sure the call is in a conference before doing anything else ────
    const ensureConference = async (): Promise<string> => {
      if (call.conference_id) return call.conference_id
      const name = `colvy-${callId}`
      const created: any = await svc.createConference({
        call_control_id: customerLeg, name, hold_audio_url: holdAudio,
      })
      const confId = created?.data?.id || created?.id
      if (!confId) throw new Error('Could not create the conference')
      // The original agent joins so they stay with the customer.
      if (agentLeg) {
        try { await svc.joinConference(confId, agentLeg) } catch { /* may already be in */ }
      }
      await db.from('calls').update({
        conference_id: confId, conference_name: name,
      }).eq('id', callId)
      call.conference_id = confId
      return confId
    }

    // ── consult: hold the customer and ring a colleague ────────────────────
    if (action === 'consult') {
      // TARGETED RINGING IS NOT POSSIBLE YET.
      // Every agent's browser registers with the SAME company-level SIP
      // credential (agent_presence.sip_username is filled from the integration,
      // not provisioned per user). Dialling that SIP URI therefore rings every
      // connected browser — ring-all, not one person. Per-agent credentials
      // would have to be provisioned in Telnyx before `toUserId` could pick out
      // an individual, so the request is honoured as "ring the team" and the
      // response says so rather than pretending otherwise.
      const sipUser = (integ as any).sip_conn_username || integ.sip_username
      if (!sipUser) {
        return NextResponse.json(
          { error: 'No calling handset is set up for this company yet' }, { status: 400 })
      }

      // Who's actually online to answer? No point holding the customer for a
      // consultation nobody can pick up.
      const cutoff = new Date(Date.now() - 120000).toISOString()
      const { data: online } = await db.from('agent_presence')
        .select('user_id, agent_name').eq('company_id', companyId)
        .gte('last_seen_at', cutoff).neq('available', false)

      // Exclude the agent already on the call — if they're the only one
      // connected, there is nobody to consult.
      const others = (online || []).filter((a: any) => a.user_id !== call.answered_by_user_id)
      if (others.length === 0) {
        return NextResponse.json(
          { error: 'No other team members are online to take a consultation' }, { status: 400 })
      }

      const confId = await ensureConference()

      // Hold the customer FIRST, so they can't hear the consultation.
      await svc.holdConference(confId, [customerLeg], holdAudio)
      await db.from('calls').update({ customer_on_hold: true }).eq('id', callId)

      // Ring the team. This is a SIP leg on Telnyx's own network, so it doesn't
      // touch the PSTN.
      const child: any = await svc.createChildCall({
        connection_id: integ.connection_id,
        to: `sip:${sipUser}@sip.telnyx.com`,
        from: call.from_number || integ.phone_number,
        timeout_secs: 30,
        webhook_url: `${origin}/api/telnyx/webhook`,
      })
      const consultLeg = child?.data?.call_control_id || child?.call_control_id
      if (!consultLeg) {
        // Ringing failed — don't leave the customer sitting on hold.
        await svc.unholdConference(confId, [customerLeg])
        await db.from('calls').update({ customer_on_hold: false }).eq('id', callId)
        return NextResponse.json({ error: 'Could not ring the team' }, { status: 500 })
      }

      const toName = others.length === 1 ? (others[0].agent_name || 'a colleague') : `${others.length} available agents`

      await db.from('calls').update({
        consult_call_control_id: consultLeg,
        consult_user_id: toUserId || null,
        consult_name: toName,
        transfer_state: 'ringing',
        transfer_started_at: new Date().toISOString(),
      }).eq('id', callId)

      await db.from('call_transfers').insert({
        company_id: companyId, call_id: callId,
        from_name: actorName || null, to_user_id: toUserId || null, to_name: toName,
        outcome: 'ringing',
      })

      return NextResponse.json({
        ok: true, state: 'ringing', consultLeg, conferenceId: confId,
        ringing: toName,
        // Surfaced so the UI doesn't claim a specific person is being rung.
        targeted: false,
        note: 'All available agents are being rung — per-agent handsets are needed to ring one person.',
      })
    }

    // ── complete: colleague takes the customer, original agent drops ───────
    if (action === 'complete') {
      const confId = call.conference_id
      if (!confId || !call.consult_call_control_id) {
        return NextResponse.json({ error: 'No consultation in progress' }, { status: 400 })
      }
      // Customer comes off hold to meet the colleague.
      await svc.unholdConference(confId, [customerLeg])
      // Original agent steps out.
      if (agentLeg) {
        try { await svc.leaveConference(confId, agentLeg) } catch {}
        try { await svc.hangupCall(agentLeg) } catch {}
      }
      await db.from('calls').update({
        transfer_state: 'completed',
        customer_on_hold: false,
        transferred_at: new Date().toISOString(),
        agent_call_control_id: call.consult_call_control_id,
        assigned_to: call.consult_user_id || null,
      }).eq('id', callId)
      await db.from('call_transfers').update({
        outcome: 'completed', ended_at: new Date().toISOString(),
      }).eq('call_id', callId).eq('outcome', 'ringing')

      return NextResponse.json({ ok: true, state: 'completed' })
    }

    // ── conference: three-way, everyone hears everyone ─────────────────────
    if (action === 'conference') {
      const confId = call.conference_id
      if (!confId) return NextResponse.json({ error: 'No conference active' }, { status: 400 })
      await svc.unholdConference(confId, [customerLeg])
      await db.from('calls').update({
        transfer_state: 'consulting', customer_on_hold: false,
      }).eq('id', callId)
      return NextResponse.json({ ok: true, state: 'conference' })
    }

    // ── cancel: drop the colleague, go back to the customer ────────────────
    if (action === 'cancel') {
      const confId = call.conference_id
      if (call.consult_call_control_id) {
        try { await svc.hangupCall(call.consult_call_control_id) } catch {}
      }
      if (confId) {
        try { await svc.unholdConference(confId, [customerLeg]) } catch {}
      }
      await db.from('calls').update({
        transfer_state: 'cancelled',
        customer_on_hold: false,
        consult_call_control_id: null,
        consult_user_id: null,
        consult_name: null,
      }).eq('id', callId)
      await db.from('call_transfers').update({
        outcome: 'cancelled', ended_at: new Date().toISOString(),
      }).eq('call_id', callId).eq('outcome', 'ringing')

      return NextResponse.json({ ok: true, state: 'cancelled' })
    }

    // ── plain hold / unhold ────────────────────────────────────────────────
    if (action === 'hold' || action === 'unhold') {
      const confId = await ensureConference()
      if (action === 'hold') await svc.holdConference(confId, [customerLeg], holdAudio)
      else await svc.unholdConference(confId, [customerLeg])
      await db.from('calls').update({ customer_on_hold: action === 'hold' }).eq('id', callId)
      return NextResponse.json({ ok: true, onHold: action === 'hold' })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
