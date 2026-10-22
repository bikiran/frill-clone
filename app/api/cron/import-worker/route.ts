import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { adminDb, drive, missingTable, STEP_BUDGET_MS } from '@/lib/import/server'
import { claimable } from '@/lib/import/engine'
import { logJobRun } from '@/lib/job-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/import-worker
 *
 * Carries imports forward when nobody has the Import page open: picks up jobs
 * that are queued, or whose worker died (expired lease), and runs them for up
 * to ~4 minutes. Wired in vercel.json every minute. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const deadline = t0 + STEP_BUDGET_MS
  const db = adminDb()
  let ran = 0
  try {
    const ids = await claimable(db)
    for (const id of ids) {
      if (Date.now() > deadline - 10_000) break
      const r = await drive(db, id, deadline)
      if (r) ran++
    }
    if (ran) await logJobRun({ job: 'import-worker', startedAt, durationMs: Date.now() - t0, status: 'success', detail: { ran } })
    return NextResponse.json({ ok: true, ran })
  } catch (e: any) {
    if (missingTable(e)) return NextResponse.json({ ok: true, ran: 0 })
    await logJobRun({ job: 'import-worker', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
