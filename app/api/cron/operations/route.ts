import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { queueOpsChecks } from '@/lib/agent/operations'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/operations
 *
 * The Operations Agent's sweep: for businesses that switched it on, checks
 * recent orders that may be late, stuck or waiting on stock (live tracking +
 * the business's thresholds) and queues a run for each real problem. The
 * agent worker does the rest. See lib/agent/operations.ts.
 * Runs on a schedule (see vercel.json). Honours CRON_SECRET like the others.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    return NextResponse.json({ ok: true, ...(await queueOpsChecks(db)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('operations-agent', getHandler)
