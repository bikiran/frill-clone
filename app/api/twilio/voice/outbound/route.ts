import { NextRequest, NextResponse } from 'next/server'
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

  if (!to) return twiml('<Response><Say>No number was provided.</Say><Hangup/></Response>')

  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId)}`
  const recordingCb = `${base}/api/twilio/voice/recording?${cbQuery}`
  const actionCb = `${base}/api/twilio/voice/status?${cbQuery}`

  // record-from-answer-dual keeps agent and caller on separate tracks (a proper
  // dialogue transcript). answerOnBridge means the caller hears real ringback
  // until the far end answers, instead of dead air.
  const isE164 = /^\+?\d{6,}$/.test(to.replace(/\s/g, ''))
  const dialTarget = isE164
    ? `<Number>${xmlEscape(to)}</Number>`
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
