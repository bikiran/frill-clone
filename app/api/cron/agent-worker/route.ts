import { NextRequest, NextResponse } from 'next/server'
import { agentDb } from '@/lib/agent/access'
import { claimableRuns, runAgent } from '@/lib/agent/engine'
import { expireApprovals } from '@/lib/agent/approvals'
import { logJobRun } from '@/lib/job-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/agent-worker
 *
 * Backstop for agent runs: picks up runs that are queued, or whose worker died
 * (expired lease), and works them for up to ~4 minutes. Runs normally start
 * straight away in an after() hook; this makes sure none are left behind.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const deadline = t0 + 240_000
  const db = agentDb()
  let ran = 0, expired = 0
  try {
    expired = await expireApprovals(db).catch(() => 0)
    for (const id of await claimableRuns(db)) {
      if (Date.now() > deadline - 20_000) break
      if (await runAgent(db, id, deadline)) ran++
    }
    if (ran || expired) await logJobRun({ job: 'agent-worker', startedAt, durationMs: Date.now() - t0, status: 'success', detail: { ran, expired } })
    return NextResponse.json({ ok: true, ran, expired })
  } catch (e: any) {
    await logJobRun({ job: 'agent-worker', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
