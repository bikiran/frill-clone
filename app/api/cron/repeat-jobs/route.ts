import { cronOr401 } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { jobsDb } from '@/lib/jobs/server'
import { runRepeatJobs } from '@/lib/jobs/repeat-server'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/repeat-jobs
 *
 * Repeating jobs (Jobs & quotes): makes each series' visits a few weeks
 * ahead, so they're on the board, the Calendar and the team's phones in time
 * (lib/jobs/repeat-server.ts). Vercel Cron runs it each morning; CRON_SECRET
 * guards it like the other crons.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const result = await runRepeatJobs(jobsDb())
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('repeat-jobs', getHandler)
