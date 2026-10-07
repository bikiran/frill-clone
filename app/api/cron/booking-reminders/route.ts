import { cronOr401 } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runBookingSweep } from '@/lib/booking-sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/booking-reminders
 *
 * Booking reminders, wrap-up (completed + review request), rebook nudges and
 * expired holds — see lib/booking-sweep.ts. Vercel Cron runs it every 10
 * minutes; CRON_SECRET guards it like the other crons.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const result = await runBookingSweep(admin(), req.nextUrl.origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}
