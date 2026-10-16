import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, loadOverview } from '@/lib/command-centre-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/overview?companyId=
 *
 * What the board needs besides the calls: the business's timezone (so "Today"
 * is its today), whether it's open now, its stores, the missed callers nobody
 * has called or texted back in the last 7 days (with whether each call came in
 * during opening hours), and how the missed-call text and AI phone agent are
 * set up.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCallsAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    return NextResponse.json(await loadOverview(db, companyId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t load the board' }, { status: 500 })
  }
}
