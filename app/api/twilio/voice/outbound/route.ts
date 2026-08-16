import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

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
  const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }

  const to = get('To')
  const from = get('From')
  const callRowId = get('callRowId')
  const companyId = get('companyId')
  const conversationId = get('conversationId')
  const callSid = get('CallSid')

  if (!to) return twiml('<Response><Say>No number was provided.</Say><Hangup/></Response>')

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
      await db.from('calls').update({ twilio_call_sid: callSid, status: 'in_progress' }).eq('id', callRowId)
    } catch { /* never block the call on this */ }
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId)}`
  const recordingCb = `${base}/api/twilio/voice/recording?${cbQuery}`
  const actionCb = `${base}/api/twilio/voice/status?${cbQuery}`

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

  const dialTarget = dialNumber
    ? `<Number>${xmlEscape(dialNumber)}</Number>`
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
