import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { pruneSignupAttempts, RETENTION_DAYS } from '@/lib/signup-attempts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/signup-retention (daily, see vercel.json)
 *
 * Deletes sign-up attempts that were abandoned, weren't suspicious and weren't
 * marked spam, once they've been quiet for RETENTION_DAYS (180), along with
 * the contact a sign-up made in Colvy's workspace if nobody talked to them,
 * and signup_verifications rows that old. Kept: completed sign-ups (they're
 * customers), suspicious ones and ones marked spam. Honours CRON_SECRET.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const out = await pruneSignupAttempts(db)
    return NextResponse.json({ ok: true, retentionDays: RETENTION_DAYS, ...out })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('signup-retention', getHandler)
