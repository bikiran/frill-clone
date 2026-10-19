import { cronOr401 } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processWaitlistJobs } from '@/lib/booking-waitlist'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/booking-waitlist
 *
 * The booking waitlist queue (lib/booking-waitlist.ts): freed times are
 * offered to the people waiting for them, "in order" holds that ran out move
 * to the next person, and lapsed entries expire. Most jobs are already worked
 * straight after the cancellation that queued them; this picks up the rest,
 * and the ones held overnight for sending hours. Not the back-in-stock
 * waitlist — that's /api/cron/waitlist. Vercel Cron runs it every five
 * minutes; CRON_SECRET guards it like the other crons.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const result = await processWaitlistJobs(admin(), req.nextUrl.origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('booking-waitlist', getHandler)
