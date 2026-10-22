import { twilioSignatureOk, twilioSignedFor } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape, twilioIdentity } from '@/lib/twilio-service'
import { parseClientIdentity } from '@/lib/call-handoff'
import { SUPER_ADMIN, isStaffMember } from '@/lib/company-access'
import { companyForInboundNumber } from '@/lib/inbound-company'

export const dynamic = 'force-dynamic'

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

const dbAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A receiving device taking over a live call self-joins its conference. The
// device calls device.connect({ params: { handoff:'1', handoffCallId,
// handoffToken } }) with NO custom From — so Twilio's standard `From` here is
// `client:<identity>`, which is bound to the device's access token and cannot be
// spoofed. We verify that identity matches the handoff target's user (the
// same-user security gate) before returning conference-join TwiML.
async function handoffJoinTwiml(req: NextRequest, get: (k: string) => string): Promise<NextResponse> {
  const callId = get('handoffCallId')
  const handoffToken = get('handoffToken')
  const fromIdentity = parseClientIdentity(get('From') || get('Caller'))
  if (!callId || !handoffToken || !fromIdentity) return twiml('<Response><Say>Handoff is not available.</Say><Hangup/></Response>')

  const db = dbAdmin()
  const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
  if (!call) return twiml('<Response><Say>That call could not be found.</Say><Hangup/></Response>')
  if (String(call.handoff_status || '') !== 'joining' || call.handoff_token !== handoffToken) {
    return twiml('<Response><Say>This handoff is no longer available.</Say><Hangup/></Response>')
  }
  if (call.handoff_expires_at && new Date(call.handoff_expires_at).getTime() < Date.now()) {
    return twiml('<Response><Say>This handoff has expired.</Say><Hangup/></Response>')
  }
  // Same-user gate: the joining identity must equal the target device's user id.
  const { data: dev } = await db.from('call_devices').select('user_id, company_id').eq('device_id', call.handoff_target_device_id).maybeSingle()
  if (!dev) return twiml('<Response><Say>The target device is no longer available.</Say><Hangup/></Response>')
  const expected = twilioIdentity(dev.user_id, String(dev.company_id))
  if (fromIdentity !== expected) return twiml('<Response><Say>Not authorised.</Say><Hangup/></Response>')

  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const confName = call.conference_name || `colvy-${callId}`
  const confirmCb = `${base}/api/calls/${encodeURIComponent(callId)}/handoff/confirm`
  // Join the SAME conference the customer is already in. statusCallbackEvent
  // "join" fires /confirm with this leg's CallSid → it becomes the active leg and
  // the old one is removed. No <Dial record> here: the recording belongs to the
  // original customer leg (matching how warm transfer behaves today).
  // endConferenceOnExit="true": once this device is the sole agent, hanging up
  // ends the whole call (drops the customer) — the expected behaviour. During
  // the brief overlap the old agent's leg has endConferenceOnExit="false", so
  // removing it after confirm does NOT end the call.
  return twiml(
    `<Response>` +
      `<Dial answerOnBridge="true">` +
        `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" ` +
          `statusCallback="${xmlEscape(confirmCb)}" statusCallbackEvent="join" statusCallbackMethod="POST">` +
          `${xmlEscape(confName)}` +
        `</Conference>` +
      `</Dial>` +
    `</Response>`
  )
}

// The SDK's params (To, From, callRowId, companyId) are whatever the caller's
// app sends, and every Colvy business's tokens use the same TwiML App, so
// before dialling check they name the caller's own business: the token's
// identity (Caller = client:<identity>) is on its team, the call row is its
// outbound call and the caller ID is one of its numbers. Without this anyone
// with a voice token could ring out as another business's number and point
// the recording and status callbacks at its calls.
async function outboundAllowed(db: any, get: (k: string) => string): Promise<boolean> {
  const companyId = get('companyId')
  if (!companyId) return false
  const identity = parseClientIdentity(get('Caller')) || parseClientIdentity(get('From')) || ''
  if (identity.startsWith('co_')) {
    if (identity !== twilioIdentity(null, companyId)) return false
  } else {
    // u_<user id without its dashes> (twilioIdentity).
    const m = /^u_([0-9a-f]{32})$/i.exec(identity)
    if (!m) return false
    const h = m[1].toLowerCase()
    const userId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    const { data: own } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', userId).maybeSingle()
    if (!own && !(await isStaffMember(db, companyId, userId))) {
      // The platform admin may act for any workspace (requireCompanyAccess).
      const { data: u } = await db.auth.admin.getUserById(userId).catch(() => ({ data: null as any }))
      if (u?.user?.email !== SUPER_ADMIN) return false
    }
  }
  const callRowId = get('callRowId')
  if (callRowId) {
    const { data: row } = await db.from('calls').select('company_id, direction').eq('id', callRowId).maybeSingle()
    if (!row || row.company_id !== companyId || row.direction !== 'outbound') return false
  }
  const from = get('From')
  if (/^\+?\d{6,}$/.test(from.replace(/[\s()-]/g, ''))) {
    if ((await companyForInboundNumber(db, from, 'twilio')) !== companyId) return false
  }
  return true
}

// TwiML for a browser-originated (SDK) outbound call. The Twilio Voice SDK hits
// this via the company's TwiML App when the agent dials. Custom params from
// device.connect({ params }) arrive as form fields.
//
//   To            – destination number (E.164)
//   From          – caller ID (the company's Twilio number)
//   callRowId     – our calls row, so recording/status callbacks can find it
//   companyId, conversationId – threaded through to the callbacks
export async function POST(req: NextRequest) {
  const form = await req.formData()
  // Only Twilio (signed with the account's auth token).
  if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
  const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }

  // Device handoff: a second device self-joining the live call's conference.
  if (get('handoff') === '1') {
    try { return await handoffJoinTwiml(req, get) }
    catch { return twiml('<Response><Say>Could not join the call.</Say><Hangup/></Response>') }
  }

  const to = get('To')
  const from = get('From')
  const callRowId = get('callRowId')
  const companyId = get('companyId')
  const conversationId = get('conversationId')
  const callSid = get('CallSid')
  // Server-bridge outbound: the call must gain controllable legs so hold /
  // transfer / ring-team work (parity with inbound). The transfer route expects
  // twilio_call_sid = CUSTOMER leg and twilio_child_call_sid = the agent's
  // browser leg. So in bridge mode we stamp the browser (parent) CallSid as the
  // AGENT leg here, and capture the dialed CUSTOMER (child) leg SID via a
  // <Number statusCallback> → outbound-child-status. In the normal (non-bridge)
  // path we keep the original behaviour: stamp the parent as twilio_call_sid.
  const bridge = get('bridge') === '1'

  if (!to) return twiml('<Response><Say>No number was provided.</Say><Hangup/></Response>')
  try {
    const db = dbAdmin()
    // Signed by Colvy's account or this business's own, and for the caller's own business.
    if (!(await twilioSignedFor(req, form, db, companyId))) return new NextResponse('Forbidden', { status: 403 })
    if (!(await outboundAllowed(db, get))) {
      console.warn('[twilio outbound] refused: params don\'t match the caller', { companyId, callRowId, from, caller: get('Caller') })
      return twiml('<Response><Say>This call could not be placed.</Say><Hangup/></Response>')
    }
  } catch {
    return twiml('<Response><Say>This call could not be placed.</Say><Hangup/></Response>')
  }

  // Stamp the Twilio Call SID onto our outbound row at dial time — this is the
  // one point where we hold both callRowId (from the SDK params) and the parent
  // CallSid. Without it the row stays with a null twilio_call_sid, so if a later
  // recording/status callback arrives without callRowId it can't fall back to
  // matching by SID — the outbound call ends up with no recording attached.
  if (callRowId && callSid) {
    try {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      await db.from('calls').update(
        bridge
          ? { twilio_child_call_sid: callSid, status: 'in_progress' }   // browser = agent leg
          : { twilio_call_sid: callSid, status: 'in_progress' },
      ).eq('id', callRowId)
    } catch { /* never block the call on this */ }
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId)}`
  const recordingCb = `${base}/api/twilio/voice/recording?${cbQuery}`
  // In bridge mode, tell the dial-end action not to overwrite twilio_call_sid
  // (which now holds the customer leg) with the parent SID.
  const actionCb = `${base}/api/twilio/voice/status?${cbQuery}${bridge ? '&bridge=1' : ''}`
  // Captures the dialed CUSTOMER (child) leg SID for the bridge path.
  const childCb = `${base}/api/twilio/voice/outbound-child-status?callRowId=${encodeURIComponent(callRowId)}`

  // record-from-answer-dual keeps agent and caller on separate tracks (a proper
  // dialogue transcript). answerOnBridge means the caller hears real ringback
  // until the far end answers, instead of dead air.
  // Route a real phone number vs a Voice-SDK client identity. A phone number
  // must be E.164 (+<cc><national>) or Twilio can't route it — the bug that
  // failed outbound calls was dialing a national number verbatim
  // ("0433979848"), which is all-digits so it passed a naive E.164 test yet is
  // unroutable. Normalise: keep a leading +, turn "00" into "+", and a leading
  // "0" (national) into "+<cc>" using the country code from the company's own
  // caller ID (`from`, always E.164). AU national numbers are 9 digits.
  const cleaned = to.replace(/[^\d+]/g, '')
  const fromDigits = from.replace(/[^\d]/g, '')
  const cc = fromDigits.length >= 10 ? fromDigits.slice(0, fromDigits.length - 9) : '61'
  let dialNumber = ''
  if (/^\+\d{6,}$/.test(cleaned)) dialNumber = cleaned
  else if (/^00\d{6,}$/.test(cleaned)) dialNumber = '+' + cleaned.slice(2)
  else if (/^0\d{7,}$/.test(cleaned)) dialNumber = '+' + cc + cleaned.slice(1)
  else if (/^\d{8,}$/.test(cleaned)) dialNumber = '+' + cleaned

  // In bridge mode, attach a statusCallback to the dialed leg so we capture the
  // CUSTOMER child SID (needed for hold/transfer). Only meaningful for a real
  // <Number>; a <Client> dial isn't the customer-facing PSTN leg.
  const numberAttrs = bridge
    ? ` statusCallback="${xmlEscape(childCb)}" statusCallbackEvent="initiated answered" statusCallbackMethod="POST"`
    : ''
  const dialTarget = dialNumber
    ? `<Number${numberAttrs}>${xmlEscape(dialNumber)}</Number>`
    : `<Client><Identity>${xmlEscape(to)}</Identity></Client>`

  return twiml(
    `<Response>` +
      `<Dial callerId="${xmlEscape(from)}" answerOnBridge="true" record="record-from-answer-dual" ` +
        `recordingStatusCallback="${xmlEscape(recordingCb)}" recordingStatusCallbackEvent="completed" ` +
        `action="${xmlEscape(actionCb)}" method="POST">` +
        dialTarget +
      `</Dial>` +
    `</Response>`
  )
}
