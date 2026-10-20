import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { computeStatus, recordStatusSnapshot, statusDb } from '@/lib/status-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/cron/status-snapshot — every 5 minutes (vercel.json).
 *
 * Works out the live status (the same rules as the public page, uncached) and
 * stores it as one five-minute snapshot, from which the status page's 30-day
 * bars are drawn; prunes snapshots older than 90 days. Running twice in the
 * same five minutes changes nothing. Before COLVY_V405 runs it reports
 * "not set up" and does nothing.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const db = statusDb()
  const status = await computeStatus(db, { history: false })
  const r = await recordStatusSnapshot(db, status)
  if (r.unavailable) return NextResponse.json({ ok: true, skipped: 'status tables not set up (COLVY_V405)' })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'snapshot failed' }, { status: 500 })
  return NextResponse.json({ ok: true, bucket: r.bucket, duplicate: r.duplicate, overall: status.overall.status, pruned: r.pruned })
}

export const GET = withJobLog('status-snapshot', getHandler)
