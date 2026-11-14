import { cronOr401 } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { jobsDb } from '@/lib/jobs/server'
import { runInvoiceReminders } from '@/lib/jobs/invoices'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/invoice-reminders
 *
 * Overdue invoices (Jobs & quotes): texts or emails the customer 1, 7 and 14
 * days after the due date, for businesses with reminders on, until it's paid
 * or voided (lib/jobs/invoices.ts). Vercel Cron runs it each morning;
 * CRON_SECRET guards it like the other crons.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const result = await runInvoiceReminders(jobsDb(), req.nextUrl.origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('invoice-reminders', getHandler)
