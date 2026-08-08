import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncReviews } from '@/lib/google-business'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/sync-reviews
 *
 * Pulls new Google reviews into every connected + location-selected business,
 * and (via syncReviews → notifyNewReviews) emails the business when a fresh
 * review lands. Runs on a slow cadence (every 6 hours — see vercel.json) to stay
 * well inside the Google Business Profile API quota: a business with a few
 * hundred reviews is ~ceil(reviews/50) calls per run, a handful of calls each.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const { data: accounts } = await db.from('google_business_accounts')
    .select('company_id, account_name, location_name, is_active')
    .eq('is_active', true)
    .not('account_name', 'is', null)
    .not('location_name', 'is', null)

  const results: any[] = []
  // De-dupe by company (one connected account each) and sync sequentially so we
  // never burst the quota.
  const seen = new Set<string>()
  for (const acc of (accounts || [])) {
    if (seen.has(acc.company_id)) continue
    seen.add(acc.company_id)
    try {
      const r = await syncReviews(acc.company_id)
      results.push({ companyId: acc.company_id, ...r })
    } catch (e: any) {
      results.push({ companyId: acc.company_id, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, companies: results.length, results })
}
