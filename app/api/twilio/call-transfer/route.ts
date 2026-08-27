import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService, twilioIdentity, xmlEscape } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Resolve a colleague's display name for the "Talking to …" label. Prefers the
// auth profile name, then a team_members.name, then the raw phone number.
async function colleagueName(db: any, companyId: string, toUserId?: string, toNumber?: string): Promise<string> {
  if (toUserId) {
    try {
      const { data } = await db.auth.admin.getUserById(toUserId)
      const nm = data?.user?.user_metadata?.display_name || data?.user?.user_metadata?.full_name
      if (nm) return nm
    } catch { /* not an auth user */ }
    try {
      const { data } = await db.from('team_members').select('name').eq('company_id', companyId).eq('user_id', toUserId).maybeSingle()
      if (data?.name) return data.name
    } catch {}
  }
  return toNumber || 'colleague'
}

/**
 * POST /api/twilio/call-transfer — warm (attended) transfer, Twilio edition.
 *
 * A 2-leg call can't hold one side while consulting a third party, so both legs
 * are moved into a named Conference where each participant is independently
 * holdable and colleagues can be dialled in. The mobile app is a thin client
 * (colvy-mobile docs/CALL_TRANSFER.md): it POSTs an intent and renders whatever
 * this route writes onto the calls row via Supabase realtime.
 *
 * Roles (inbound call): customer = the parent leg (twilio_call_sid); agent = the
 * answered browser leg (twilio_child_call_sid); colleague = the participant we
 * dial in (consult_call_control_id).
 *
 * Request: { companyId, callId, action, actorName?, toUserId?, toNumber? }
 *   (callSid accepted instead of callId for older web calls).
 *
 * Actions (contract): consult · swap · complete · cancel · status
 * Also kept for the web client: conference · hold · unhold
 *
 * Calls-row columns written (drive the mobile UI):
 *   transfer_state  null/idle·ringing·active·completed·cancelled
 *   transfer_with   colleague display name
 *   transfer_talking_to  customer|colleague  ('colleague' ⇒ customer on hold)
 *   conference_sid  Twilio Conference SID
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, callSid, callId, action, actorName, toUserId, toNumber } = await req.json()
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

    // ── status: report the row state the webhooks keep current ─────────────────
    // Read-only, so it needs no live legs or Twilio credentials.
    if (action === 'status') {
      return NextResponse.json({
        ok: true,
        state: call.transfer_state || 'idle',
        with: call.transfer_with || null,
        talkingTo: call.transfer_talking_to || null,
        conferenceSid: call.conference_sid || call.conference_id || null,
        onHold: !!call.customer_on_hold,
      })
    }

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
    // Record the conference so audio AFTER the transfer (the colleague + customer)
    // is captured — the original <Dial record> stops when the legs are moved in.
    // The completed callback stores it as the call's conference recording, which
    // the transcriber stitches onto the pre-transfer recording.
    const recBase = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
    const recCb = `${recBase}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=conference`
    const conferenceTwiml = () =>
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" ` +
      `record="record-from-start" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST">` +
      `${confName}</Conference></Dial></Response>`

    // Move both live legs into the conference, then resolve its SID. Mirrors the
    // SID into both conference_id (existing logic) and conference_sid (contract).
    const ensureConference = async (): Promise<string> => {
      if (call.conference_id) return call.conference_id
      // The two legs are a <Dial> bridge: one is the PARENT (the call that ran
      // the <Dial>) and the other is the dialed CHILD. Redirecting the PARENT
      // first tears the bridge down and Twilio hangs up the CHILD before it can
      // join — which is exactly why pressing Hold dropped the agent. So:
      //   1) move the CHILD leg in first (it survives the redirect), then
      //   2) move the PARENT leg — by now its Dial has no live child, so
      //      redirecting it is safe. As a belt-and-braces path, the pending flag
      //      makes the parent's Dial action (inbound-status) re-join the same
      //      conference if that Dial ends before our redirect lands.
      const dir = String(call.direction || '').toLowerCase()
      const parentLeg = dir === 'outbound' ? agentLeg : customerLeg
      const childLeg = dir === 'outbound' ? customerLeg : agentLeg
      try { await db.from('calls').update({ conference_pending: confName }).eq('id', call.id) } catch {}
      if (childLeg) { try { await svc.updateCall(childLeg, { twiml: conferenceTwiml() }) } catch { /* may already be gone */ } }
      if (parentLeg) { try { await svc.updateCall(parentLeg, { twiml: conferenceTwiml() }) } catch { /* the Dial-action fallback will catch it */ } }
      // The conference exists once the first participant joins — poll briefly.
      let confSid: string | null = null
      for (let i = 0; i < 8 && !confSid; i++) {
        await new Promise(r => setTimeout(r, 500))
        try { confSid = await svc.getConferenceSid(confName) } catch {}
      }
      // Clear the handoff flag either way — it only guards the redirect window.
      try { await db.from('calls').update({ conference_pending: null }).eq('id', call.id) } catch {}
      if (!confSid) throw new Error('Conference did not start in time')
      await db.from('calls').update({ conference_id: confSid, conference_name: confName, conference_sid: confSid }).eq('id', call.id)
      call.conference_id = confSid
      call.conference_sid = confSid
      return confSid
    }

    // Hold (or unhold) a participant that may still be joining the conference —
    // retry through the join window so we don't 404 on the first attempt.
    const holdWithRetry = async (confSid: string, sid: string, hold: boolean): Promise<any> => {
      let lastErr: any = null
      for (let i = 0; i < 8; i++) {
        try { await svc.holdParticipant(confSid, sid, hold, integ.hold_music_url || undefined); return null }
        catch (e: any) { lastErr = e; await new Promise(r => setTimeout(r, 500)) }
      }
      return lastErr
    }

    // ── consult: hold the customer, ring a colleague (or the team) in ──────────
    if (action === 'consult') {
      const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
      const confSid = await ensureConference()
      await holdWithRetry(confSid, customerLeg, true)
      await db.from('calls').update({ customer_on_hold: true }).eq('id', call.id)

      // Participant status callback lets us flip ringing → active when the
      // colleague answers, and revert if they never do (see participant-status).
      const cbFor = (role: string) => `${base}/api/twilio/call-transfer/participant-status?callId=${encodeURIComponent(call.id)}&role=${role}`

      // Targeted (mobile): a specific colleague by app identity or phone number.
      if (toUserId || toNumber) {
        const to = toUserId ? `client:${twilioIdentity(toUserId, companyId)}` : String(toNumber)
        const withName = await colleagueName(db, companyId, toUserId, toNumber)
        let colleagueSid: string | null = null
        try {
          const p = await svc.addParticipant(confSid, { from: fromCallerId, to, timeout: 30, statusCallback: cbFor('colleague') })
          colleagueSid = p.callSid
        } catch (e: any) {
          // Dial failed outright — don't strand the customer on hold.
          try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
          await db.from('calls').update({ customer_on_hold: false, transfer_state: 'idle' }).eq('id', call.id)
          return NextResponse.json({ error: `Could not reach ${withName}: ${e.message}` }, { status: 502 })
        }
        await db.from('calls').update({
          consult_call_control_id: colleagueSid,
          consult_user_id: toUserId || null,
          transfer_state: 'ringing',
          transfer_with: withName,
          transfer_talking_to: 'colleague',
          transfer_started_at: new Date().toISOString(),
        }).eq('id', call.id)
        try { await db.from('call_transfers').insert({ company_id: companyId, call_id: call.id, from_name: actorName || null, to_name: withName, outcome: 'ringing' }) } catch {}
        return NextResponse.json({ ok: true, state: 'ringing', with: withName, ringing: withName, targeted: true })
      }

      // Untargeted (web): ring every online team member into the conference.
      const cutoff = new Date(Date.now() - 120000).toISOString()
      const { data: online } = await db.from('agent_presence')
        .select('user_id').eq('company_id', companyId).gte('last_seen_at', cutoff).neq('available', false)
      const identities = Array.from(new Set((online || []).map((a: any) => twilioIdentity(a.user_id, companyId))))
      if (identities.length === 0) {
        try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
        await db.from('calls').update({ customer_on_hold: false }).eq('id', call.id)
        return NextResponse.json({ error: 'No team members are online to consult' }, { status: 400 })
      }
      let firstConsultSid: string | null = null
      for (const id of identities) {
        try {
          const p = await svc.addParticipant(confSid, { from: fromCallerId, to: `client:${id}`, timeout: 30, statusCallback: cbFor('colleague') })
          if (!firstConsultSid) firstConsultSid = p.callSid
        } catch { /* try the next agent */ }
      }
      await db.from('calls').update({
        consult_call_control_id: firstConsultSid,
        transfer_state: 'ringing',
        transfer_with: 'the team',
        transfer_talking_to: 'colleague',
        transfer_started_at: new Date().toISOString(),
      }).eq('id', call.id)
      try { await db.from('call_transfers').insert({ company_id: companyId, call_id: call.id, from_name: actorName || null, to_name: 'the team', outcome: 'ringing' }) } catch {}
      return NextResponse.json({ ok: true, state: 'ringing', ringing: 'the team', targeted: false })
    }

    // ── swap: flip who the agent is talking to (customer ↔ colleague) ──────────
    if (action === 'swap') {
      const confSid = call.conference_id
      const colleagueLeg = call.consult_call_control_id
      if (!confSid || !colleagueLeg) return NextResponse.json({ error: 'No consultation in progress' }, { status: 400 })
      // Currently talking to the colleague ⇒ switch back to the customer:
      // unhold the customer, hold the colleague. And vice-versa.
      const toCustomer = call.transfer_talking_to === 'colleague'
      try { await svc.holdParticipant(confSid, customerLeg, !toCustomer, integ.hold_music_url || undefined) } catch {}
      try { await svc.holdParticipant(confSid, colleagueLeg, toCustomer, integ.hold_music_url || undefined) } catch {}
      const talkingTo = toCustomer ? 'customer' : 'colleague'
      await db.from('calls').update({ transfer_talking_to: talkingTo, customer_on_hold: !toCustomer }).eq('id', call.id)
      return NextResponse.json({ ok: true, talkingTo })
    }

    // ── conference: everyone hears everyone (take the customer off hold) ───────
    // (web client action; not in the mobile contract but harmless to keep)
    if (action === 'conference') {
      const confSid = call.conference_id
      if (!confSid) return NextResponse.json({ error: 'No conference active' }, { status: 400 })
      try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
      if (call.consult_call_control_id) { try { await svc.holdParticipant(confSid, call.consult_call_control_id, false) } catch {} }
      await db.from('calls').update({ transfer_state: 'active', transfer_talking_to: 'customer', customer_on_hold: false }).eq('id', call.id)
      return NextResponse.json({ ok: true, state: 'conference' })
    }

    // ── complete: colleague keeps the customer, original agent drops ───────────
    if (action === 'complete') {
      const confSid = call.conference_id
      if (!confSid) return NextResponse.json({ error: 'No consultation in progress' }, { status: 400 })
      try { await svc.holdParticipant(confSid, customerLeg, false) } catch {}
      if (call.consult_call_control_id) { try { await svc.holdParticipant(confSid, call.consult_call_control_id, false) } catch {} }
      try { await svc.removeParticipant(confSid, agentLeg) } catch {}
      await db.from('calls').update({
        transfer_state: 'completed', customer_on_hold: false, transfer_talking_to: 'customer',
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
      await db.from('calls').update({
        transfer_state: 'cancelled', customer_on_hold: false, transfer_talking_to: 'customer',
        transfer_with: null, consult_call_control_id: null, consult_user_id: null,
      }).eq('id', call.id)
      try { await db.from('call_transfers').update({ outcome: 'cancelled', ended_at: new Date().toISOString() }).eq('call_id', call.id).eq('outcome', 'ringing') } catch {}
      return NextResponse.json({ ok: true, state: 'cancelled' })
    }

    // ── plain hold / unhold ────────────────────────────────────────────────────
    if (action === 'hold' || action === 'unhold') {
      const confSid = await ensureConference()
      // ensureConference returns as soon as the conference EXISTS (its first leg
      // joined) — but the customer (parent) leg is moved in second and may still
      // be joining. Holding a participant that hasn't joined yet makes Twilio
      // 404 ("resource not found"), which is exactly the error a first Hold press
      // showed while a second press (once the leg had joined) worked. Retry
      // through the join window so the first press just works.
      const err = await holdWithRetry(confSid, customerLeg, action === 'hold')
      if (err) return NextResponse.json({ error: err.message }, { status: 500 })
      await db.from('calls').update({ customer_on_hold: action === 'hold' }).eq('id', call.id)
      return NextResponse.json({ ok: true, onHold: action === 'hold' })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
