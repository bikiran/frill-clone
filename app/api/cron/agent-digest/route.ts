import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWeeklyDigests } from '@/lib/agent/digest'
import { withJobLog } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/agent-digest
 *
 * The weekly agent summary email (lib/agent/digest.ts): one per business whose
 * agents worked this week, unless they switched it off. Runs on a schedule
 * (see vercel.json). Honours CRON_SECRET like the others.
 */
async function getHandler(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    return NextResponse.json({ ok: true, ...(await sendWeeklyDigests(db)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('agent-digest', getHandler)
