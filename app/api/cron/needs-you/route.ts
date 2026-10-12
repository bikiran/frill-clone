import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sweepNeedsYou } from '@/lib/agent/needs-you'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/needs-you
 *
 * Phone alerts for anything newly urgent on "Needs you" (missed goals, drafts
 * waiting too long, hand-overs nobody picked up) — once per item. See
 * lib/agent/needs-you.ts. Runs on a schedule (vercel.json); honours CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    return NextResponse.json({ ok: true, ...(await sweepNeedsYou(db)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}
