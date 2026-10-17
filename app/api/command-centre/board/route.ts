import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, loadBoard, parseWindow } from '@/lib/command-centre-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/board?companyId=&from=<ms>&to=<ms|open>
 *
 * The Command Centre's first screen in one request: the period's calls (as
 * /calls returns them) plus the board's settings (timezone, stores, the
 * missed-call text, the AI receptionist and whether AI agents are paused).
 * The page works out `from`/`to` in the timezone it last saw; if `timezone`
 * here differs it asks /calls again for the right period. The missed callers
 * and opening hours come from /overview, which the page asks for alongside.
 * Staff with the Command Centre or Call Logs permission.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const win = parseWindow(sp.get('from'), sp.get('to'))
  if (!companyId || !win) return NextResponse.json({ error: 'companyId and a valid from/to are required' }, { status: 400 })
  const db = admin()
  if (!(await requireCallsAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    return NextResponse.json(await loadBoard(db, companyId, win), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t load the board' }, { status: 500 })
  }
}
