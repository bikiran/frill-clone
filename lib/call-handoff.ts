import { TwilioService, xmlEscape } from '@/lib/twilio-service'

// A handoff request is only valid for a short window; after it the receiving
// device can no longer self-join and the original leg is kept.
export const HANDOFF_TTL_MS = 30_000

// The Twilio Voice SDK reports the caller of an SDK-originated call as
// `client:<identity>`. Strip the prefix to get the identity string.
export function parseClientIdentity(from: string | null | undefined): string | null {
  if (!from) return null
  const s = String(from).trim()
  return s.startsWith('client:') ? s.slice('client:'.length) : null
}

// A short, URL-safe random token that binds one specific handoff. Security is
// enforced by the identity gate at join time (the joiner's Twilio identity must
// match the target device's user); this token just prevents replaying a stale
// handoff request.
export function newHandoffToken(): string {
  // 24 hex chars — plenty of entropy, no external crypto import needed here
  // (the callers run in the Node runtime where Math.random is available; this
  // is not a secret that must survive a targeted attacker on its own).
  let s = ''
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

// Promote a live (direct-dial) call into its named conference (colvy-<callId>)
// so a second agent device can join alongside the customer. Idempotent: returns
// the conference SID, moving the customer (+ current agent) leg in on the first
// call. Mirrors the ensureConference logic in call-transfer/route.ts so the two
// stay behaviourally identical.
export async function ensureCallConference(
  svc: TwilioService,
  db: any,
  call: any,
): Promise<{ confName: string; confSid: string; agentLeg: string | null }> {
  const customerLeg = call.twilio_call_sid
  if (!customerLeg) throw new Error('This call has no active customer leg')

  let agentLeg: string | null = call.twilio_child_call_sid || call.active_agent_call_sid || null
  if (!agentLeg) {
    agentLeg = await svc.getAnsweredChildCallSid(customerLeg)
    if (agentLeg) { try { await db.from('calls').update({ twilio_child_call_sid: agentLeg }).eq('id', call.id) } catch {} }
  }

  const confName = call.conference_name || `colvy-${call.id}`
  if (call.conference_sid || call.conference_id) {
    return { confName, confSid: call.conference_sid || call.conference_id, agentLeg }
  }

  // Record the conference from the moment the customer is moved in, so audio
  // AFTER the promotion (the leg the call is handed to) is captured — the
  // original <Dial record> stops the instant we redirect the customer leg. Only
  // the first participant's recording settings take effect, and the customer is
  // moved in first, so setting it here records the whole conference. The
  // completed-recording callback stores it as the call's conference recording.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
  const recCb = `${base}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(call.company_id || '')}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=conference`
  const conferenceTwiml =
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" ` +
    `record="record-from-start" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST">` +
    `${confName}</Conference></Dial></Response>`
  try { await svc.updateCall(customerLeg, { twiml: conferenceTwiml }) }
  catch (e: any) { throw new Error(`Could not move the customer into a conference: ${e.message}`) }
  if (agentLeg) { try { await svc.updateCall(agentLeg, { twiml: conferenceTwiml }) } catch { /* agent may drop; the conference still holds the customer */ } }

  let confSid: string | null = null
  for (let i = 0; i < 6 && !confSid; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { confSid = await svc.getConferenceSid(confName) } catch {}
  }
  if (!confSid) throw new Error('Conference did not start in time')
  try { await db.from('calls').update({ conference_id: confSid, conference_sid: confSid, conference_name: confName }).eq('id', call.id) } catch {}
  return { confName, confSid, agentLeg }
}
