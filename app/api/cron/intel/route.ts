import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { runBusinessIntel } from '@/lib/intel/business-job'
import { runRevenue } from '@/lib/intel/revenue-job'
import { runAlerts } from '@/lib/intel/system'
import { compute } from '@/lib/intel/cache'
import { computeReport, period, reportKey } from '@/lib/intel/web-report'
import { posthogConfig } from '@/lib/intel/posthog'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/intel — hourly (vercel.json).
 *
 * Super Admin → Intelligence's own data, three independent parts (one
 * failing doesn't stop the others):
 *   business  milestones, acquisition, today's health scores (V415)
 *   revenue   Stripe/Shopify subscriptions → MRR snapshot and movements,
 *             history rebuilt once, cost per business (V416)
 *   alerts    System health rules → intel_alerts; new critical ones go to
 *             the Colvy team once a day (V416)
 *   warm      recomputes the reports Super Admin opens most (Overview for
 *             the last 7 days, Business, Customer health, Revenue, System
 *             health) and saves them (V418), so those pages open instantly
 * Running it twice in an hour changes nothing. Before the migrations run each
 * part reports "not set up" and does nothing. Honours CRON_SECRET.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const part = async (name: string, fn: () => Promise<any>) => {
    try {
      const r = await fn()
      return r?.setup === false ? { ok: true, skipped: `not set up (${name === 'business' ? 'COLVY_V415' : 'COLVY_V416'})` } : r
    } catch (e: any) { return { ok: false, error: e?.message || 'Failed' } }
  }
  const business = await part('business', () => runBusinessIntel(db))
  const revenue = await part('revenue', () => runRevenue(db))
  const alerts = await part('alerts', () => runAlerts(db))
  const warm = await part('warm', () => warmReports(db))
  const ok = business.ok && revenue.ok && alerts.ok
  const error = [business, revenue, alerts].map(r => r.error).filter(Boolean).join(' · ') || undefined
  return NextResponse.json({ ok, ...(error ? { error } : {}), business, revenue, alerts, warm }, { status: ok ? 200 : 500 })
}

/** Save fresh copies of the common reports. Best effort: never fails the job. */
async function warmReports(db: any) {
  const sp = new URLSearchParams({ range: '7d' })
  const p = period(sp)
  const reports = ['business', 'health', 'revenue', 'system', ...(posthogConfig().ok ? ['overview', 'funnels'] : [])]
  const done: string[] = [], failed: string[] = []
  await Promise.all(reports.map(r => compute(db, reportKey(r, '7d'), () => computeReport(db, r, p)).then(() => done.push(r), () => failed.push(r))))
  return { ok: true, done, ...(failed.length ? { failed } : {}) }
}

export const GET = withJobLog('intel', getHandler)
