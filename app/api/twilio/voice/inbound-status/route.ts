import { internalHeaders } from '@/lib/internal-call'
import { twilioSignatureOk, twilioSignedFor } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape } from '@/lib/twilio-service'
import { setCallPreview } from '@/lib/call-card'
import { resolveAgentName } from '@/lib/agent-name'
import { emitCallEvent } from '@/lib/integration-hooks'
import { alertCall } from '@/lib/call-alerts'
import { getPhoneAgent, answerWithAgent, phoneBookable } from '@/lib/phone-agent'
import { aiAnswerDecision } from '@/lib/phone-receptionist'
import { agentsPaused } from '@/lib/agent/pilot'
import { getPhoneCatalog } from '@/lib/phone-catalog'
import { queueMissedCallText } from '@/lib/missed-call-text'
import { nextStep, planFor, routingNeedsHours, formatAu, type CallCtx } from '@/lib/call-routing'
import { getCallRouting, ringTargets, forwardingAllowed, noteRouting, noteStep, readCallRow, setRoutingColumns } from '@/lib/call-routing-server'
import { businessClosedNow } from '@/lib/phone-agent'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// action= handler for an INBOUND call's ring-all <Dial>. If an agent answered,
// the dial is over and we end cleanly. If nobody picked up (no-answer/busy/
// failed), fall through to voicemail.
//
// Call routing (lib/call-routing): a step of a ring order, forward or menu
// choice carries route= and step=. When that step isn't answered and the
// caller is still on the line, the next step with someone to ring is dialled
// instead; after the last one, the fallback below runs once, as for ring-all.
// A forwarded leg (fwd=1) only counts as answered when it was really taken:
// with screening (scr=1), when the person pressed 1 (forward-screen).
// nobody=1: a route had nobody to ring at all (a menu choice), so straight to
// the fallback.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    // Only Twilio (signed with the account's auth token).
    if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const sp = req.nextUrl.searchParams
    const callRowId = sp.get('callRowId') || ''
    const companyId = sp.get('companyId') || ''
    const conversationId = sp.get('conversationId') || ''
    const soloUser = sp.get('soloUser') || ''
    const rang = sp.get('rang') || '?'
    const route = sp.get('route') || ''
    const stepIndex = Number.parseInt(sp.get('step') || '', 10)
    const forwarded = sp.get('fwd') === '1'
    const screened = sp.get('scr') === '1'
    const nobody = sp.get('nobody') === '1'

    let dialStatus = (get('DialCallStatus') || '').toLowerCase()
    const durSecs = parseInt(get('DialCallDuration') || '0', 10) || 0
    // A route with nobody to ring is handled as a ring nobody answered.
    if (nobody && !dialStatus) dialStatus = 'no-answer'
    // Why a rung call ended up here — recorded on `cause` (shown as "Hangup
    // cause" in Call Diagnostics) so an agent-ring that doesn't connect is
    // diagnosable rather than a silent 0s→voicemail. `no-answer` = the client
    // leg(s) rang the full timeout and nobody picked up; `busy`/`failed` =
    // a registration declined the leg or wasn't reachable (the usual cause of
    // "1 ring → voicemail"); `completed` dur=0 = bridged then dropped instantly.
    let ringOutcome = nobody ? `no_agent: nobody to ring (route ${route || "?"})` : `agent_${dialStatus || 'unknown'}: rang=${rang} dur=${durSecs}s`
    // The SID of the child leg that actually answered (this callback ALWAYS
    // fires, unlike the per-<Client> "answered" callback). Map it back to the
    // agent via call_legs.
    const dialSid = get('DialCallSid')
    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
    // Signed by Colvy's account or this business's own, not another business's,
    // and the call row (when named) is this business's.
    if (!(await twilioSignedFor(req, form, db, companyId))) return new NextResponse('Forbidden', { status: 403 })
    if (callRowId) {
      const { data: own } = await db.from('calls').select('company_id').eq('id', callRowId).maybeSingle()
      if (!own || own.company_id !== companyId) return twiml('<Response><Hangup/></Response>')
    }

    // Hold / warm-transfer in flight: the agent leg was moved into a conference,
    // which ends this (customer) leg's <Dial>. Instead of hanging up or going to
    // voicemail, re-join this leg into the SAME conference so the customer stays
    // connected (on hold) and the agent isn't left talking to nobody.
    if (callRowId) {
      try {
        const { data: c } = await db.from('calls').select('conference_pending').eq('id', callRowId).maybeSingle()
        const confName = (c as any)?.conference_pending
        if (confName) {
          return twiml(`<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${xmlEscape(confName)}</Conference></Dial></Response>`)
        }
      } catch {}
    }

    // A forwarded leg to an outside number. Twilio says "completed" whenever the
    // outside phone picked up, which includes its own voicemail; with screening
    // on, only a press of 1 (recorded by forward-screen against this leg's SID)
    // means a person took the call. Anything else is a ring nobody answered.
    if (forwarded && callRowId) {
      const call = await readCallRow(db, callRowId)
      const fwd = call?.routing_state?.routing?.forward || null
      const pickedUp = dialStatus === 'completed' || dialStatus === 'answered'
      // Accepted for THIS step (each forward step starts with a fresh note).
      const accepted = !screened || (fwd?.accepted === true && fwd.step === stepIndex && fwd.route === route)
      const to = String(fwd?.to || '')
      ringOutcome = `forward_${dialStatus || 'unknown'}${pickedUp && !accepted ? '_not_accepted' : ''}: to=${to || '?'} dur=${durSecs}s`
      if (pickedUp && accepted && call?.company_id === companyId) {
        const parentStatus = (get('CallStatus') || '').toLowerCase()
        const endedBy = parentStatus === 'completed' ? 'caller_hung_up' : parentStatus === 'in-progress' ? 'forwarded_leg_ended' : `parent_${parentStatus || 'unknown'}`
        const who = `Forwarded to ${formatAu(to)}`
        const now = new Date().toISOString()
        try {
          await db.from('calls').update({
            status: 'completed', answered_at: now, ended_at: now, answered_by: who, agent_name: who,
            cause: `${endedBy}: forwarded to=${to} dur=${durSecs}s`, ...(durSecs ? { duration_seconds: durSecs } : {}),
          }).eq('id', callRowId)
        } catch {}
        // The forwarded leg's minutes are outbound calls on Colvy's Twilio
        // account: kept on the call (V399 columns, and the routing note).
        await setRoutingColumns(db, callRowId, { forwarded_to: to, forwarded_seconds: durSecs })
        await noteRouting(db, callRowId, { forward: { ...(fwd || { to, step: stepIndex, route }), seconds: durSecs } }, call)
        try { await setCallPreview(db as any, conversationId, durSecs ? `📞 Call ended · ${Math.floor(durSecs / 60)}:${String(durSecs % 60).padStart(2, '0')}` : '📞 Call ended') } catch {}
        return twiml('<Response><Hangup/></Response>')
      }
      // Picked up but not taken (its voicemail, or declined): not answered.
      if (pickedUp) dialStatus = 'no-answer'
    }

    // An agent answered → mark it and finish.
    if (dialStatus === 'completed' || dialStatus === 'answered') {
      // Who ended it. This action fires when the <Dial> ends; CallStatus is the
      // CUSTOMER's leg. Already completed → the customer hung up. Still in
      // progress → the agent's leg ended (they hung up, or their app or
      // connection dropped it). Shown as "Hangup cause" in Call Diagnostics, so
      // a call that drops a second after it's answered says whose end it was.
      const parentStatus = (get('CallStatus') || '').toLowerCase()
      const endedBy = parentStatus === 'completed' ? 'caller_hung_up'
        : parentStatus === 'in-progress' ? 'agent_leg_ended'
        : `parent_${parentStatus || 'unknown'}`
      const hangupCause = `${endedBy}: rang=${rang} dur=${durSecs}s`
      if (callRowId) {
        try { await db.from('calls').update({ status: 'completed', answered_at: new Date().toISOString(), ended_at: new Date().toISOString(), cause: hangupCause, ...(durSecs ? { duration_seconds: durSecs } : {}) }).eq('id', callRowId) } catch {}
        // Record WHO answered when the per-<Client> callback didn't. Prefer the
        // exact answering leg (call_legs mapping by DialCallSid — works even in a
        // simultaneous multi-agent ring); fall back to the solo-ring user id when
        // only one agent was rung. Claim only if still unattributed, so we never
        // overwrite a real answerer or double-fire.
        if (dialStatus === 'completed' && durSecs > 0) {
          let answerUser = ''
          if (dialSid) {
            try {
              const { data: leg } = await db.from('call_legs').select('user_id').eq('child_sid', dialSid).maybeSingle()
              answerUser = (leg as any)?.user_id || ''
            } catch {}
          }
          if (!answerUser && soloUser) answerUser = soloUser
          if (answerUser) {
            try {
              const name = await resolveAgentName(db, answerUser, companyId)
              const { data: claimed } = await db.from('calls')
                .update({ answered_by_user_id: answerUser, answered_by: name, agent_name: name })
                .eq('id', callRowId).is('answered_by_user_id', null)
                .select('id, contact_name, caller_name, from_number')
              // Notify the rest of the team who took it — once (claim-guarded, so
              // it never double-fires with the per-<Client> callback).
              if (Array.isArray(claimed) && claimed.length) {
                const row = claimed[0] as any
                const caller = String(row.contact_name || row.caller_name || row.from_number || '').trim()
                try {
                  await fetch(`${base}/api/push/send`, {
                    method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                      companyId,
                      title: 'Call answered',
                      body: `${name} received the call${caller ? ` from ${caller}` : ''}`,
                      excludeUserId: answerUser,
                      channelId: 'calls',
                      ...(callRowId ? { route: `/call-detail/${callRowId}` } : {}),
                    }),
                  })
                } catch {}
              }
            } catch {}
          }
        }
      }
      // The call is over — show the outcome (with duration when we have it).
      try { await setCallPreview(db as any, conversationId, durSecs ? `📞 Call ended · ${Math.floor(durSecs / 60)}:${String(durSecs % 60).padStart(2, '0')}` : '📞 Call ended') } catch {}
      return twiml('<Response><Hangup/></Response>')
    }

    // Nobody picked up (rang out, declined or unreachable) and the caller is
    // still on the line: this is where voicemail starts. The AI receptionist
    // takes the call instead when the owner chose "when nobody answers". Any
    // other outcome, or anything going wrong here, goes to voicemail as before.
    const callerStatus = (get('CallStatus') || '').toLowerCase()
    const callerOnLine = !['completed', 'canceled', 'busy', 'failed', 'no-answer'].includes(callerStatus)

    // A step of a ring order / forward / menu choice wasn't answered: ring the
    // next step that has someone to ring. Nothing left → the fallback below.
    if (route && !nobody && Number.isFinite(stepIndex) && callRowId && companyId && callerOnLine && ['no-answer', 'busy', 'failed'].includes(dialStatus)) {
      try {
        const call = await readCallRow(db, callRowId)
        const routing = call && call.company_id === companyId ? await getCallRouting(db, companyId, call.to_number || '') : null
        if (call && routing) {
          const { data: integ } = await db.from('twilio_integrations').select('ring_seconds').eq('company_id', companyId).maybeSingle()
          const steps = planFor(routing, route, Math.max(Number(integ?.ring_seconds || 25), 20))
          const later = steps.slice(stepIndex + 1)
          const [targets, closedNow, forwardAllowed, { data: co }] = await Promise.all([
            ringTargets(db, companyId),
            later.some(s => s.when !== 'always') || routingNeedsHours(routing) ? businessClosedNow(db, companyId) : Promise.resolve(null),
            later.some(s => s.kind === 'forward') ? forwardingAllowed(db, companyId) : Promise.resolve(false),
            db.from('companies').select('name').eq('id', companyId).maybeSingle(),
          ])
          const ctx: CallCtx = {
            base, callRowId, companyId, conversationId, callerName: call.caller_name || null, contactId: call.contact_id || null,
            from: call.from_number || '', to: call.to_number || '', businessName: co?.name || '',
          }
          // A menu answered the call already; a ring order's first steps haven't.
          const next = nextStep(ctx, steps, stepIndex + 1, route, { ringable: targets.ringUsers, closedNow, forwardAllowed, answered: route !== 'main' })
          if (next) {
            try { await db.from('calls').update({ status: 'ringing_agents', cause: ringOutcome }).eq('id', callRowId) } catch {}
            await noteStep(db, callRowId, route, next, call)
            return twiml(next.twiml)
          }
        }
      } catch (e) { console.error('[twilio inbound-status] next ring step failed — fallback as normal', e instanceof Error ? e.message : e) }
    }

    if (callRowId && companyId && ['no-answer', 'busy', 'failed'].includes(dialStatus) && callerOnLine) {
      try {
        const agent = await getPhoneAgent(db, companyId)
        if (agent.enabled && agent.mode !== 'test') {
          const { data: call } = await db.from('calls').select('id, company_id, from_number, contact_id, conversation_id, routing_state').eq('id', callRowId).maybeSingle()
          if (call && call.company_id === companyId) {
            const paused = (await agentsPaused(db, companyId)).paused
            const reason = aiAnswerDecision(agent, { from: call.from_number || '', moment: 'no_answer', paused })
            if (reason) {
              const [{ data: co }, catalog, bookable] = await Promise.all([
                db.from('companies').select('name').eq('id', companyId).maybeSingle(),
                getPhoneCatalog(db, companyId),
                agent.skills.booking ? phoneBookable(db, companyId) : Promise.resolve(false),
              ])
              const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId || call.conversation_id || '')}`
              const body = await answerWithAgent(db, {
                agent, reason, bookable, base, cbQuery, callRowId, companyId, companyName: co?.name || '', catalog,
                conversationId: call.conversation_id || conversationId || null, contactId: call.contact_id || null, from: call.from_number || '',
                // Why the team's ring ended, for Call Diagnostics.
                routing: call.routing_state, causeDetail: `after ${ringOutcome}`,
              })
              return twiml(body)
            }
          }
        }
      } catch (e) { console.error('[twilio inbound-status] phone agent failed — voicemail as normal', e instanceof Error ? e.message : e) }
    }

    // Nobody answered → voicemail (if enabled).
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
    if (integ?.voicemail_enabled === false) {
      if (callRowId) { try { await db.from('calls').update({ status: 'missed', ended_at: new Date().toISOString(), cause: ringOutcome }).eq('id', callRowId) } catch {} }
      try { await setCallPreview(db as any, conversationId, '📞 Missed call') } catch {}
      await emitCallEvent(db, 'call.missed', callRowId)
      try {
        const { data: c } = await db.from('calls').select('caller_name, from_number').eq('id', callRowId).maybeSingle()
        await alertCall(db, companyId, conversationId || null, 'Missed call', c?.caller_name || c?.from_number || 'a caller')
      } catch {}
      // Text the caller back, if the business switched that on.
      queueMissedCallText({ db, companyId, callId: callRowId })
      return twiml('<Response><Hangup/></Response>')
    }
    if (callRowId) { try { await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true, cause: ringOutcome }).eq('id', callRowId) } catch {} }
    // Nobody answered, so text the caller back if switched on. Sent now rather
    // than after the voicemail: a caller who hangs up at the greeting leaves no
    // recording, and is the one most likely to ring someone else.
    queueMissedCallText({ db, companyId, callId: callRowId })
    // Provisional — if they hang up without leaving a message it stays "Missed
    // call"; the recording callback upgrades it to "Voicemail" if one is left.
    try { await setCallPreview(db as any, conversationId, '📞 Missed call') } catch {}

    const greeting = integ?.voicemail_greeting || 'Please leave a message after the tone.'
    const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId)}&kind=voicemail`
    const recCb = `${base}/api/twilio/voice/recording?${cbQuery}`
    return twiml(
      `<Response>` +
        `<Say voice="Polly.Nicole">${xmlEscape(greeting)}</Say>` +
        `<Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed"/>` +
        `<Hangup/>` +
      `</Response>`
    )
  } catch {
    return twiml('<Response><Hangup/></Response>')
  }
}
