import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { logJobRun } from '@/lib/job-log'
import { colvyStripe } from '@/lib/tax-invoices'
import { alertColvyTeamOncePerDay } from '@/lib/billing-alert'
import { forwardingPeriod, previousPeriod } from '@/lib/forwarding-usage'
import { chargeForwardingOverage } from '@/lib/forwarding-overage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily (Vercel Cron): last month's forwarded call minutes past each plan's
// allowance go on the business's next Colvy invoice (lib/forwarding-overage
// has the rules: once per business per month, claimed before Stripe is called).

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const t0 = Date.now(), startedAt = new Date().toISOString()
  const period = previousPeriod(forwardingPeriod())
  try {
    const run = await chargeForwardingOverage(admin(), period, { stripe: await colvyStripe(), alert: alertColvyTeamOncePerDay })
    await logJobRun({ job: 'forwarding-overage', startedAt, durationMs: Date.now() - t0, status: run.charged.length ? 'success' : 'idle', detail: run })
    return NextResponse.json({ ok: true, period, considered: run.considered, charged: run.charged.length, owed: run.owed.length, failed: run.failed.length })
  } catch (e: any) {
    await logJobRun({ job: 'forwarding-overage', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
