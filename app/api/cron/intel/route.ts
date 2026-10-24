import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { runBusinessIntel } from '@/lib/intel/business-job'
import { runRevenue } from '@/lib/intel/revenue-job'
import { runAlerts } from '@/lib/intel/system'

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
  const ok = business.ok && revenue.ok && alerts.ok
  const error = [business, revenue, alerts].map(r => r.error).filter(Boolean).join(' · ') || undefined
  return NextResponse.json({ ok, ...(error ? { error } : {}), business, revenue, alerts }, { status: ok ? 200 : 500 })
}

export const GET = withJobLog('intel', getHandler)
