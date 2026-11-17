import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { logJobRun } from '@/lib/job-log'
import { resumeDue } from '@/lib/automations/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/automations (every minute, vercel.json)
 *
 * Carries on automation runs whose Wait is over (lib/automations/engine). Each
 * waiting run is handed to one worker only (automation_claim_due), so an
 * overlapping minute can't run a step twice. Run history older than 90 days is
 * cleared, a batch at a time.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  try {
    const res = await resumeDue(db, { limit: 50, deadline: t0 + 90_000 })
    let cleared = 0
    if (new Date().getUTCMinutes() % 30 === 0) {
      const cutoff = new Date(Date.now() - 90 * 864e5).toISOString()
      const { data: old } = await db.from('automation_runs').select('id').lt('created_at', cutoff).neq('status', 'waiting').limit(500)
      if (old?.length) {
        await db.from('automation_runs').delete().in('id', old.map((r: any) => r.id))
        cleared = old.length
      }
    }
    if (res.resumed || res.skipped || cleared) await logJobRun({ job: 'automations', status: 'success', startedAt, durationMs: Date.now() - t0, detail: { ...res, cleared } })
    return NextResponse.json({ ok: true, ...res, cleared })
  } catch (e: any) {
    await logJobRun({ job: 'automations', status: 'error', startedAt, durationMs: Date.now() - t0, error: e?.message })
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
