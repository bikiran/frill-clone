import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
 * It stamps ended_at = now so the row is no longer "live". duration_seconds is
 * left as-is — we never fabricate a length from the stale start time.
 *
 * Idempotent: once ended_at is set, the row no longer matches. Runs on a
 * schedule (see vercel.json).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const cutoff = new Date(Date.now() - STALE_MS).toISOString()
  const nowIso = new Date().toISOString()

  let swept = 0
  try {
    const { data: stuck, error } = await db.from('calls')
      .select('id, duration_seconds, answered_at, is_voicemail')
      .in('status', ['ringing', 'initiated', 'in_progress'])
      .is('ended_at', null)
      .lt('created_at', cutoff)
      .limit(500)
    if (error) throw error

    for (const c of (stuck || [])) {
      const answered = (Number((c as any).duration_seconds) || 0) > 0 || !!(c as any).answered_at
      const status = (c as any).is_voicemail ? 'voicemail' : answered ? 'completed' : 'missed'
      await db.from('calls').update({ status, ended_at: nowIso }).eq('id', (c as any).id)
      swept++
    }
  } catch (e: any) {
    console.error('[sweep-stale-calls] failed', e?.message)
    return NextResponse.json({ error: e?.message || 'sweep failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, swept })
}
