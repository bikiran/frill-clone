import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { sweepNeedsYou } from '@/lib/agent/needs-you'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/needs-you
 *
 * Phone alerts for anything newly urgent on "Needs you" (missed goals, drafts
 * waiting too long, hand-overs nobody picked up) — once per item. See
 * lib/agent/needs-you.ts. Runs on a schedule (vercel.json); honours CRON_SECRET.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    return NextResponse.json({ ok: true, ...(await sweepNeedsYou(db)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('needs-you', getHandler)
