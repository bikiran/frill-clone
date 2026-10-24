import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { logJobRun } from '@/lib/job-log'
import { TwilioService } from '@/lib/twilio-service'
import { platformTwilio } from '@/lib/twilio-platform'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// How long a call may sit in a live state before we treat it as stale. Mirrors
// the Command Centre's client-side display cap so the board and the data agree.
const STALE_MS = 2 * 60 * 60 * 1000 // 2 hours

// A call still "live" this long after it began is checked with Twilio: if
// Twilio says it has ended, its end webhook was lost and it's closed now,
// rather than showing "Call in progress" for up to STALE_MS.
const CHECK_AFTER_MS = 3 * 60 * 1000
const TWILIO_ENDED = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled'])

const LIVE_STATES = ['ringing', 'initiated', 'in_progress', 'ringing_agents', 'dialing_agent', 'dialing_customer', 'voicemail_greeting', 'recording_voicemail']

/** How a call stuck in a live state ends up. Someone (or the AI receptionist) picking up wins over the voicemail state. */
function staleCallFinal(c: any): { status: string; is_voicemail?: boolean } {
  const pickedUp = !!c.answered_at || (String(c.direction || '').toLowerCase() !== 'outbound' && !!c.answered_by_user_id)
  if (pickedUp) return c.is_voicemail && !c.recording_url ? { status: 'completed', is_voicemail: false } : { status: c.is_voicemail ? 'voicemail' : 'completed' }
  if (c.is_voicemail) return c.recording_url ? { status: 'voicemail' } : { status: 'missed', is_voicemail: false }
  return { status: (Number(c.duration_seconds) || 0) > 0 ? 'completed' : 'missed' }
}

/**
 * GET /api/cron/sweep-stale-calls
 *
 * Closes calls that got stuck in a live state. A call whose end/hangup webhook
 * was lost stays status=ringing|initiated|in_progress with a null ended_at
 * forever — showing an ever-growing "live" duration on the Command Centre
 * (e.g. 409 min, or 10,494 min) and inflating the on-call count. This sweep
 * finds any such call older than STALE_MS and finalises it:
 *   • answered (has a duration or an answered_at) → status 'completed'
 *   • never connected                            → status 'missed'
 *   • went to voicemail with a recording         → status 'voicemail'
 *   • picked up (answered_at), even if it then went to voicemail and nothing
 *     was left (the AI receptionist took the call) → 'completed'
 *   • went to voicemail with no recording        → status 'missed' (the caller
 *     hung up during the greeting: Twilio sends nothing more then, so the row
 *     sat at "voicemail_greeting" and counted as a voicemail with nothing to
 *     play. Telnyx's hangup webhook already does the same.)
 * Every live state is covered, including ringing the team (ringing_agents),
 * dialling (dialing_agent / dialing_customer) and the voicemail greeting.
 * It stamps ended_at = now so the row is no longer "live". duration_seconds is
 * left as-is — we never fabricate a length from the stale start time.
 *
 * Idempotent: once ended_at is set, the row no longer matches. Runs on a
 * schedule (see vercel.json).
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  const cutoff = new Date(Date.now() - STALE_MS).toISOString()
  const nowIso = new Date().toISOString()

  let swept = 0
  let checked = 0
  // ── Ask Twilio about calls that look live but may have ended ──────────────
  try {
    const { data: recent } = await db.from('calls')
      .select('id, company_id, twilio_call_sid, direction, duration_seconds, answered_at, answered_by_user_id, is_voicemail, recording_url')
      .in('status', LIVE_STATES)
      .is('ended_at', null)
      .not('twilio_call_sid', 'is', null)
      .lt('created_at', new Date(Date.now() - CHECK_AFTER_MS).toISOString())
      .gte('created_at', cutoff)
      .limit(100)
    const services = new Map<string, TwilioService | null>()
    const serviceFor = async (companyId: string): Promise<TwilioService | null> => {
      if (services.has(companyId)) return services.get(companyId)!
      let svc: TwilioService | null = null
      try {
        const { data: t } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', companyId).maybeSingle()
        if ((t as any)?.account_sid && (t as any)?.auth_token) svc = new TwilioService((t as any).account_sid, (t as any).auth_token)
      } catch { /* no integration row */ }
      services.set(companyId, svc)
      return svc
    }
    const platform = platformTwilio()
    for (const c of (recent || []) as any[]) {
      checked++
      const own = await serviceFor(c.company_id)
      // The number may live on the business's own account or on Colvy's.
      const read = (svc: TwilioService | null) => svc ? svc.getCall(c.twilio_call_sid).catch(() => null) : Promise.resolve(null)
      const tw = (await read(own)) || (await read(platform))
      const st = String(tw?.status || '').toLowerCase()
      if (!TWILIO_ENDED.has(st)) continue
      const end = tw?.endTime ? new Date(tw.endTime) : null
      const endedAt = end && !isNaN(end.getTime()) ? end.toISOString() : nowIso
      // Only while it's still open, in case its real webhook lands meanwhile.
      const { data: done } = await db.from('calls').update({ ...staleCallFinal(c), ended_at: endedAt })
        .eq('id', c.id).is('ended_at', null).in('status', LIVE_STATES).select('id')
      if (done?.length) swept++
    }
  } catch (e: any) {
    console.error('[sweep-stale-calls] twilio check failed', e?.message)
  }

  try {
    const { data: stuck, error } = await db.from('calls')
      .select('id, direction, duration_seconds, answered_at, answered_by_user_id, is_voicemail, recording_url')
      .in('status', LIVE_STATES)
      .is('ended_at', null)
      .lt('created_at', cutoff)
      .limit(500)
    if (error) throw error

    for (const c of (stuck || [])) {
      await db.from('calls').update({ ...staleCallFinal(c), ended_at: nowIso }).eq('id', (c as any).id)
      swept++
    }
  } catch (e: any) {
    console.error('[sweep-stale-calls] failed', e?.message)
    await logJobRun({ job: 'sweep-stale-calls', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ error: e?.message || 'sweep failed' }, { status: 500 })
  }

  await logJobRun({ job: 'sweep-stale-calls', startedAt, durationMs: Date.now() - t0, status: swept ? 'success' : 'idle', detail: { swept, checked } })
  return NextResponse.json({ ok: true, swept, checked })
}
