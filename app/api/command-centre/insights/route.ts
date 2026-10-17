import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, buildInsights, parseWindow, companyTimezone } from '@/lib/command-centre-server'
import { checkBurst } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/insights?companyId=&from=<ms>&to=<ms|open>[&fresh=1]
 *
 * The AI summary of a period's calls: the numbers (busiest hour, when calls go
 * unanswered, who answered most, what the AI phone agent did) worked out
 * exactly, plus the reasons people called, grouped from the calls' summaries
 * by the call_summary job on the AI switchboard. Kept for 10 minutes.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const win = parseWindow(sp.get('from'), sp.get('to'))
  if (!companyId || !win) return NextResponse.json({ error: 'companyId and a valid from/to are required' }, { status: 400 })
  const db = admin()
  const access = await requireCallsAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  // Each person: 20 summaries a minute, and 4 of those may skip the cache.
  const fresh = sp.get('fresh') === '1'
  if (!checkBurst(`cc-insights:${access.userId}`, 20) || (fresh && !checkBurst(`cc-insights-fresh:${access.userId}`, 4))) {
    return NextResponse.json({ error: 'That’s a lot of summaries in a minute. Try again shortly.' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  try {
    // The timezone lookup runs alongside the calls read inside buildInsights.
    return NextResponse.json(await buildInsights(db, companyId, { from: win.from, to: win.to, tz: companyTimezone(db, companyId), fresh }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t summarise these calls' }, { status: 500 })
  }
}
