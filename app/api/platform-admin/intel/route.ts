import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { posthogConfig } from '@/lib/intel/posthog'
import { cachedReport } from '@/lib/intel/cache'
import { computeReport, isSupabaseOnly, period, reportKey, reportTtl, INTEL_REPORTS } from '@/lib/intel/web-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/platform-admin/intel?report=overview|live|traffic|pages|journeys|funnels|business|health|revenue|system
//   &range=24h|7d|28d|90d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&fresh=1
//
// Super Admin → Intelligence (lib/intel/web-report). Answers from the saved
// copy when there is one (lib/intel/cache: shown at once, refreshed in the
// background when it's getting old); fresh=1 recomputes now.

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const report = (INTEL_REPORTS as readonly string[]).includes(sp.get('report') || '') ? sp.get('report')! : 'overview'
  const cfg = posthogConfig()
  const p = period(sp)
  const meta = { report, range: p.label, from: p.from.toISOString(), to: p.to.toISOString(), prevFrom: p.prevFrom.toISOString(), prevTo: p.prevTo.toISOString(), posthog: cfg }

  // Without the PostHog read key, only the Supabase-backed parts can answer.
  if (!cfg.ok && !isSupabaseOnly(report) && report !== 'funnels') return NextResponse.json({ ...meta, configured: false })

  try {
    const key = reportKey(report, p.label, sp.get('from') || '', sp.get('to') || '')
    const data = await cachedReport(db, key, { ...reportTtl(report), fresh: sp.get('fresh') === '1' }, () => computeReport(db, report, p))
    return NextResponse.json({ ...meta, configured: isSupabaseOnly(report) || cfg.ok, ...data })
  } catch (e: any) {
    console.error('[intel]', report, e?.message || e)
    return NextResponse.json({ ...meta, configured: isSupabaseOnly(report) || cfg.ok, error: e?.message || 'failed' }, { status: 500 })
  }
}
