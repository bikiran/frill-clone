import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { logJobRun } from '@/lib/job-log'
import { powersDb, loadPowers, sweepCompany, isMissingPowersSchema } from '@/lib/powers/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/powers (every 10 minutes, vercel.json)
 *
 * The background half of Colvy Powers' rewards, for businesses that use it:
 * conversations closed and tasks ticked anywhere (the phone app included),
 * happy reviews that name a teammate, and taking back rewards for tasks that
 * were unticked or deleted. Every reward has a key, so this and the in-app
 * check can both see the same work and it still pays once.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = powersDb()
  const totals = { companies: 0, resolve: 0, task: 0, feedback: 0, reversed: 0, errors: 0 }
  try {
    const { data, error } = await db.from('powers_settings').select('company_id').eq('enabled', true).limit(2000)
    if (error) {
      if (isMissingPowersSchema(error)) return NextResponse.json({ ok: true, skipped: 'Colvy Powers tables not set up' })
      throw error
    }
    for (const row of data || []) {
      if (Date.now() - t0 > 100_000) break
      try {
        const st = await loadPowers(db, row.company_id)
        const c = await sweepCompany(db, row.company_id, st)
        totals.companies++; totals.resolve += c.resolve; totals.task += c.task; totals.feedback += c.feedback; totals.reversed += c.reversed
      } catch (e: any) {
        totals.errors++
        console.error('[cron/powers]', row.company_id, e?.message)
      }
    }
    await logJobRun({ job: 'powers', status: totals.errors ? 'error' : 'success', startedAt, durationMs: Date.now() - t0, detail: totals })
    return NextResponse.json({ ok: true, ...totals })
  } catch (e: any) {
    await logJobRun({ job: 'powers', status: 'error', startedAt, durationMs: Date.now() - t0, error: e?.message })
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
