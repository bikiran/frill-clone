import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { drainQueue, backfillLegacy } from '@/lib/transcode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/cron/transcode-worker
 *
 * Backstop for the transcode pipeline: drains pending video jobs the after()
 * hook on /api/storage/transcode didn't finish (cold enqueue, retry after a
 * failure, or a crashed run). Also reclaims rows stuck in `processing`.
 *
 * Wire it in vercel.json on a minute cadence (Pro). Protected by CRON_SECRET
 * when set — Vercel sends it as `Authorization: Bearer <secret>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    // Catch-up: queue a small batch of never-transcoded originals each run, then
    // drain. Clears the pre-pipeline backlog automatically over a few minutes.
    const backfilled = await backfillLegacy(admin())
    const processed = await drainQueue(admin())
    return NextResponse.json({ ok: true, backfilled, processed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
