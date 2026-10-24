import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { runBusinessIntel } from '@/lib/intel/business-job'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/intel — hourly (vercel.json).
 *
 * Super Admin → Intelligence's business data (lib/intel/business-job): new
 * milestones, acquisition records for new businesses, and today's health
 * score for every live business. Running it twice in an hour changes
 * nothing. Before COLVY_V415 runs it reports "not set up" and does nothing.
 * Honours CRON_SECRET.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const out = await runBusinessIntel(db)
    if (out.setup === false) return NextResponse.json({ ok: true, skipped: 'intel tables not set up (COLVY_V415)' })
    return NextResponse.json(out, { status: out.ok ? 200 : 500 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('intel', getHandler)
