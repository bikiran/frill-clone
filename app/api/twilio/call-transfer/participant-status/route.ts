import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Twilio participant status callback for the colleague leg dialled during a warm
 * transfer (registered by /api/twilio/call-transfer consult). It keeps the calls
 * row's transfer_state honest without the agent polling:
 *
 *   answered   → ringing becomes active (colleague picked up)
 *   completed  → if still ringing/active (declined / no-answer / hung up mid-
 *                consult, i.e. BEFORE a complete), revert to a 1:1 call: unhold
 *                the customer and clear the consult so the agent resumes.
 *
 * After `complete` the state is already 'completed', so the colleague's eventual
 * hangup is the natural end of the call and we leave it alone.
 *
 * Always answers 200 — a webhook error must never wedge the call.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('callId')
    if (!callId) return NextResponse.json({ ok: true })

    const form = await req.formData().catch(() => null)
    const callSid = form?.get('CallSid')?.toString() || ''
    const status = (form?.get('CallStatus') || form?.get('ParticipantStatus') || '').toString().toLowerCase()

    const db = admin()
    const { data: rows } = await db.from('calls').select('*').eq('id', callId).limit(1)
    const call = rows?.[0]
    if (!call) return NextResponse.json({ ok: true })

    // Only react to the colleague leg we're tracking (ignore other participants).
    if (call.consult_call_control_id && callSid && call.consult_call_control_id !== callSid) {
      return NextResponse.json({ ok: true })
    }

    const answered = ['in-progress', 'answered'].includes(status)
    const ended = ['completed', 'busy', 'no-answer', 'failed', 'canceled', 'cancelled'].includes(status)

    if (answered && call.transfer_state === 'ringing') {
      await db.from('calls').update({ transfer_state: 'active' }).eq('id', callId)
    } else if (ended && ['ringing', 'active'].includes(call.transfer_state)) {
      // Colleague never stayed — bring the customer back to the agent 1:1.
      if (call.conference_id && call.twilio_call_sid) {
        try {
          const { data: integ } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', call.company_id).maybeSingle()
          if (integ?.account_sid && integ.auth_token) {
            const svc = new TwilioService(integ.account_sid, integ.auth_token)
            await svc.holdParticipant(call.conference_id, call.twilio_call_sid, false)
          }
        } catch {}
      }
      await db.from('calls').update({
        transfer_state: 'idle', transfer_talking_to: 'customer', transfer_with: null,
        customer_on_hold: false, consult_call_control_id: null, consult_user_id: null,
      }).eq('id', callId)
      try { await db.from('call_transfers').update({ outcome: 'no_answer', ended_at: new Date().toISOString() }).eq('call_id', callId).eq('outcome', 'ringing') } catch {}
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
