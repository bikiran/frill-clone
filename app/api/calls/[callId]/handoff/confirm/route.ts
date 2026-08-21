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
 * POST /api/calls/:callId/handoff/confirm   (Twilio Conference statusCallback)
 *
 * Step 4 — the new agent leg has JOINED the conference. Set it as the active
 * leg, mark the handoff complete, and ONLY THEN remove the old agent leg. This
 * ordering is what keeps the customer connected with no gap. Fired by the
 * conference `statusCallbackEvent="join"` on the receiving device's join TwiML
 * (see /api/twilio/voice/outbound handoff branch), so the joining CallSid is
 * the new device's leg.
 *
 * Twilio callback — not user-authenticated. It's safe because it only ever acts
 * on a call already in `handoff_status='joining'`, and the effect (swap active
 * leg, drop the previous leg) is idempotent.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await ctx.params
    const form = await req.formData().catch(() => null)
    const get = (k: string) => { const v = form?.get(k); return v == null ? '' : String(v) }
    const event = get('StatusCallbackEvent')       // 'participant-join' | 'participant-leave' | …
    const joinedSid = get('CallSid')
    const conferenceSid = get('ConferenceSid')

    // Only care about a participant joining.
    if (event && !/join/i.test(event)) return NextResponse.json({ ok: true, ignored: event })

    const db = admin()
    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call) return NextResponse.json({ ok: true, ignored: 'no-call' })
    if (String(call.handoff_status || '') !== 'joining') return NextResponse.json({ ok: true, ignored: 'not-joining' })

    // The joining leg is the new agent device. Ignore the customer/old-agent legs
    // (they were already in the conference before we entered 'joining').
    const oldAgentLeg: string | null = call.active_agent_call_sid || call.twilio_child_call_sid || null
    if (joinedSid && (joinedSid === call.twilio_call_sid || joinedSid === oldAgentLeg)) {
      return NextResponse.json({ ok: true, ignored: 'existing-participant' })
    }

    // Resolve the target device's type (web/ios/android) for the record.
    let deviceType: string | null = null
    try {
      const { data: dev } = await db.from('call_devices').select('platform').eq('device_id', call.handoff_target_device_id).maybeSingle()
      deviceType = dev?.platform || null
    } catch {}

    // Swap the active leg to the new device and complete the handoff. Keep
    // twilio_child_call_sid current so a later transfer/handoff acts on the right
    // leg.
    await db.from('calls').update({
      active_agent_call_sid: joinedSid || call.active_agent_call_sid,
      active_device_id: call.handoff_target_device_id,
      active_device_type: deviceType,
      twilio_child_call_sid: joinedSid || call.twilio_child_call_sid,
      answered_by_user_id: call.handoff_by_user_id || call.answered_by_user_id,
      handoff_status: 'completed',
      handoff_target_device_id: null,
      handoff_token: null,
      handoff_expires_at: null,
    }).eq('id', callId)

    // Now (and only now) drop the previous agent leg from the conference. The
    // customer never left it, so there's no interruption.
    if (oldAgentLeg && oldAgentLeg !== joinedSid) {
      try {
        const { data: integ } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', call.company_id).maybeSingle()
        if (integ?.account_sid && integ.auth_token) {
          const svc = new TwilioService(integ.account_sid, integ.auth_token)
          const confSid = conferenceSid || call.conference_sid || call.conference_id
          if (confSid) { try { await svc.removeParticipant(confSid, oldAgentLeg) } catch {} }
          // Belt & braces: end the old leg outright in case it isn't in the conf.
          try { await svc.hangupCall(oldAgentLeg) } catch {}
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, status: 'completed' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
