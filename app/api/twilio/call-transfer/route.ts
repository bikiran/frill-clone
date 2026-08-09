import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService, twilioIdentity } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/twilio/call-transfer — warm (attended) transfer, Twilio edition.
 *
 * Same idea as the Telnyx route: a 2-leg call can't hold one side while
 * consulting a third party, so both legs are moved into a named conference where
 * each participant is independently holdable and colleagues can be dialled in.
 *
 * Roles (inbound call): customer = the parent leg (twilio_call_sid); agent = the
 * answered browser leg (twilio_child_call_sid, captured by the child-status
 * callback). Both SIDs are required, so transfer is available once a received
 * call is answered.
 *
 * Actions: consult · complete · conference · cancel · hold · unhold
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, callSid, callId, action, actorName } = await req.json()
    if (!companyId || !action || (!callSid && !callId)) {
      return NextResponse.json({ error: 'Missing companyId, action or call reference' }, { status: 400 })
    }

    const db = admin()
    const { data: rows } = callId
      ? await db.from('calls').select('*').eq('company_id', companyId).eq('id', callId).limit(1)
      : await db.from('calls').select('*').eq('company_id', companyId)
          .or(`twilio_call_sid.eq.${callSid},twilio_child_call_sid.eq.${callSid}`)
          .order('created_at', { ascending: false }).limit(1)
    let call = rows?.[0]

    // Fallback: the browser leg's CallSid doesn't always match the stored row
    // (and older calls predate the callRowId parameter). Use the company's most
    // recent answered, still-live inbound call — that's the one the agent is on.
    if (!call) {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      const { data: recent } = await db.from('calls').select('*')
        .eq('company_id', companyId).eq('direction', 'inbound').eq('provider', 'twilio')
        .not('twilio_child_call_sid', 'is', null)
        .is('ended_at', null)
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false }).limit(1)
      call = recent?.[0]
    }
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    const customerLeg = call.twilio_call_sid
    if (!customerLeg) return NextResponse.json({ error: 'This call has no active leg' }, { status: 400 })

    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.account_sid || !integ.auth_token) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 400 })
    const svc = new TwilioService(integ.account_sid, integ.auth_token)

    // The agent (browser <Client>) leg SID is normally captured by the
    // child-status webhook at answer. If that callback didn't land, the column
    // is null and transfer would be permanently blocked on a call that's plainly
    // answered and running. Resolve it live from Twilio before giving up, and
    // persist it so subsequent actions on this call are instant.
    let agentLeg = call.twilio_child_call_sid
    if (!agentLeg) {
      agentLeg = await svc.getAnsweredChildCallSid(customerLeg)
      if (agentLeg) {
        call.twilio_child_call_sid = agentLeg
        try { await db.from('calls').update({ twilio_child_call_sid: agentLeg, status: 'in_progress' }).eq('id', call.id) } catch {}
      }
    }
    if (!agentLeg) return NextResponse.json({ error: 'Transfer is available once the call is answered' }, { status: 400 })
    const fromCallerId = integ.phone_number || call.to_number || call.from_number

    const confName = call.conference_name || `colvy-${call.id}`
    const conferenceTwiml = () =>
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${confName}</Conference></Dial></Response>`

    // Move both live legs into the conference, then resolve its SID.
    const ensureConference = async (): Promise<string> => {
      if (call.conference_id) return call.conference_id
      try { await svc.updateCall(customerLeg, { twiml: conferenceTwiml() }) } catch (e: any) { throw new Error(`Could not move the customer into a conference: ${e.message}`) }
      try { await svc.updateCall(agentLeg, { twiml: conferenceTwiml() }) } catch { /* agent may drop; conference still holds the customer */ }
      // The conference exists once the first participant joins — poll briefly.
      let confSid: string | null = null
      for (let i = 0; i < 6 && !confSid; i++) {
        await new Promise(r => setTimeout(r, 500))
        try { confSid = await svc.getConferenceSid(confName) } catch {}
      }
      if (!confSid) throw new Error('Conference did not start in time')
      await db.from('calls').update({ conference_id: confSid, conference_name: confName }).eq('id', call.id)
      call.conference_id = confSid
      return confSid
    }

    // ── consult: hold the customer, ring the team into the conference ──────────
    if (action === 'consult') {
      const cutoff = new Date(Date.now() - 120000).toISOString()
      const { data: online } = await db.from('agent_presence')
        .select('user_id').eq('company_id', companyId).gte('last_seen_at', cutoff).neq('available', false)
      const identities = Array.from(new Set((online || []).map((a: any) => twilioIdentity(a.user_id, companyId))))
      if (identities.length === 0) return NextResponse.json({ error: 'No team members are online to consult' }, { status: 400 })

      const confSid = await ensureConference()
      try { await svc.holdParticipant(confSid, customerLeg, true, integ.hold_music_url || undefined) } catch {}
      await db.from('calls').update({ customer_on_hold: true }).eq('id', call.id)

      const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
      let firstConsultSid: string | null = null
      for (const id of identities) {
        try {
          const p = await svc.addParticipant(confSid, { from: fromCallerId, to: `client:${id}`, timeout: 30, statusCallback: `${base}/api/twilio/voice/status?callRowId=${encodeURIComponent(call.id)}` })
          if (!firstConsultSid) firstConsultSid = p.callSid
        } catch { /* try the next agent */ }
      }

      await db.from('calls').update({
        consult_call_control_id: firstConsultSid,
        transfer_state: 'ringing',
        transfer_started_at: new Date().toISOString(),
      }).eq('id', call.id)
      try { await db.from('call_transfers').insert({ company_id: companyId, call_id: call.id, from_name: actorName || null, to_name: 'the team', outcome: 'ringing' }) } catch {}

      return NextResponse.json({ ok: true, state: 'ringing', ringing: 'the team', targeted: false })
    }

    // ── conference: everyone hears everyone (take the customer off hold) ───────
    if (action === 'conference') {
      const confSid = call.conference_id
      if (!confSid) return NextResponse.json({ error: 'No conference active' }, { status: 400 })
      try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
      await db.from('calls').update({ transfer_state: 'consulting', customer_on_hold: false }).eq('id', call.id)
      return NextResponse.json({ ok: true, state: 'conference' })
    }

    // ── complete: colleague keeps the customer, original agent drops ───────────
    if (action === 'complete') {
      const confSid = call.conference_id
      if (!confSid) return NextResponse.json({ error: 'No consultation in progress' }, { status: 400 })
      try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
      try { await svc.removeParticipant(confSid, agentLeg) } catch {}
      await db.from('calls').update({
        transfer_state: 'completed', customer_on_hold: false,
        transferred_at: new Date().toISOString(),
        twilio_child_call_sid: call.consult_call_control_id || agentLeg,
      }).eq('id', call.id)
      try { await db.from('call_transfers').update({ outcome: 'completed', ended_at: new Date().toISOString() }).eq('call_id', call.id).eq('outcome', 'ringing') } catch {}
      return NextResponse.json({ ok: true, state: 'completed' })
    }

    // ── cancel: drop the colleague, return to the customer ─────────────────────
    if (action === 'cancel') {
      const confSid = call.conference_id
      if (call.consult_call_control_id && confSid) { try { await svc.removeParticipant(confSid, call.consult_call_control_id) } catch {} }
      if (confSid) { try { await svc.holdParticipant(confSid, customerLeg, false) } catch {} }
      await db.from('calls').update({ transfer_state: 'cancelled', customer_on_hold: false, consult_call_control_id: null }).eq('id', call.id)
      try { await db.from('call_transfers').update({ outcome: 'cancelled', ended_at: new Date().toISOString() }).eq('call_id', call.id).eq('outcome', 'ringing') } catch {}
      return NextResponse.json({ ok: true, state: 'cancelled' })
    }

    // ── plain hold / unhold ────────────────────────────────────────────────────
    if (action === 'hold' || action === 'unhold') {
      const confSid = await ensureConference()
      try { await svc.holdParticipant(confSid, customerLeg, action === 'hold', integ.hold_music_url || undefined) } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
      await db.from('calls').update({ customer_on_hold: action === 'hold' }).eq('id', call.id)
      return NextResponse.json({ ok: true, onHold: action === 'hold' })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
