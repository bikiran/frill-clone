import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureCallCard } from '@/lib/call-card'
import { callerNeverSpoke, missedIfCallerSilent, setupOf, type PhoneCallState } from '@/lib/phone-agent'

export const dynamic = 'force-dynamic'
// Room for the missed-call check a few seconds after an AI call's hang-up.
export const maxDuration = 30

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// action= handler for an OUTBOUND (SDK) call's <Dial>. Fires when the dial ends.
// Records the outcome on the call row; the call is over, so we return an empty
// response (no further TwiML).
//
// Also a number's status callback (no callRowId): an incoming call ended. A
// turn-by-turn AI call whose caller hung up on the greeting gives no other
// sign (Twilio doesn't post the <Gather> action on a hang-up), so that's where
// it becomes a missed call, as ringing out would have been. Real-time AI
// calls are decided by the relay's "closed".
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    // Only Twilio (signed with the account's auth token).
    if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callRowId = req.nextUrl.searchParams.get('callRowId') || ''

    const dialStatus = (get('DialCallStatus') || '').toLowerCase()
    const durSecs = parseInt(get('DialCallDuration') || '0', 10) || 0
    const answered = dialStatus === 'completed' || dialStatus === 'answered'
    const callSid = get('CallSid')
    // In bridge mode twilio_call_sid holds the CUSTOMER leg (stamped by
    // outbound-child-status); the parent CallSid here is the agent leg, so don't
    // clobber it.
    const bridge = req.nextUrl.searchParams.get('bridge') === '1'

    if (callRowId) {
      const db = admin()
      // Who ended an answered call. Here CallStatus is the AGENT's leg (the SDK
      // call): completed → the agent hung up (or their app dropped); still in
      // progress → the customer hung up. Shown as "Hangup cause".
      const parentStatus = (get('CallStatus') || '').toLowerCase()
      const cause = answered
        ? `${parentStatus === 'completed' ? 'agent_hung_up' : parentStatus === 'in-progress' ? 'customer_hung_up' : `parent_${parentStatus || 'unknown'}`}: dur=${durSecs}s`
        : null
      const status = answered && durSecs > 0 ? 'completed'
        : ['busy', 'no-answer', 'failed', 'canceled'].includes(dialStatus) ? (durSecs > 0 ? 'completed' : 'missed')
        : 'completed'
      try {
        await db.from('calls').update({
          status,
          ended_at: new Date().toISOString(),
          // Backfill the SID here too, so the row is always linkable even if the
          // dial-time stamp was missed — but never in bridge mode (see above).
          ...(callSid && !bridge ? { twilio_call_sid: callSid } : {}),
          ...(durSecs ? { duration_seconds: durSecs } : {}),
          ...(cause ? { cause } : {}),
        }).eq('id', callRowId)
      } catch {}
      // Guarantee the call logs in the thread even if the browser never posted
      // the card (tab closed before hang-up, missed disconnect event, etc.).
      // Idempotent — no-op when the browser already posted it.
      await ensureCallCard(db, callRowId)
    } else if (callSid) {
      const db = admin()
      const { data: call } = await db.from('calls').select('id, company_id, conversation_id, routing_state')
        .eq('twilio_call_sid', callSid).eq('direction', 'inbound').limit(1).maybeSingle()
      const state: PhoneCallState | null = call?.routing_state?.phone_agent || null
      if (call && state && !state.realtime && callerNeverSpoke(state) && setupOf(state).reason !== 'test') {
        missedIfCallerSilent(db, call, 'caller hung up without saying anything')
      }
    }
    return twiml('<Response></Response>')
  } catch {
    return twiml('<Response></Response>')
  }
}
