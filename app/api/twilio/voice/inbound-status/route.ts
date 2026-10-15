import { internalHeaders } from '@/lib/internal-call'
import { twilioSignatureOk } from '@/lib/twilio-signature'
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

    const dialStatus = (get('DialCallStatus') || '').toLowerCase()
    const durSecs = parseInt(get('DialCallDuration') || '0', 10) || 0
    // Why a rung call ended up here — recorded on `cause` (shown as "Hangup
    // cause" in Call Diagnostics) so an agent-ring that doesn't connect is
    // diagnosable rather than a silent 0s→voicemail. `no-answer` = the client
    // leg(s) rang the full timeout and nobody picked up; `busy`/`failed` =
    // a registration declined the leg or wasn't reachable (the usual cause of
    // "1 ring → voicemail"); `completed` dur=0 = bridged then dropped instantly.
    const ringOutcome = `agent_${dialStatus || 'unknown'}: rang=${rang} dur=${durSecs}s`
    // The SID of the child leg that actually answered (this callback ALWAYS
    // fires, unlike the per-<Client> "answered" callback). Map it back to the
    // agent via call_legs.
    const dialSid = get('DialCallSid')
    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

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
    if (callRowId && companyId && ['no-answer', 'busy', 'failed'].includes(dialStatus) && !['completed', 'canceled', 'busy', 'failed', 'no-answer'].includes(callerStatus)) {
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
