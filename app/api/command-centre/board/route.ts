import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, loadBoard, parseWindow } from '@/lib/command-centre-server'
import { boardSpan, isRangeKey } from '@/lib/command-centre'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/board?companyId=&range=<today|7d|…>[&cfrom=&cto=]&from=<ms>&to=<ms|open>
 *
 * The Command Centre's first screen in one request: the period's calls (as
 * /calls returns them) plus the board's settings (timezone, stores, the
 * missed-call text, the AI receptionist and whether AI agents are paused).
 *
 * With `range` (and `cfrom`/`cto`, YYYY-MM-DD, for a custom period) the period
 * is worked out here in the business's own timezone, read with the access
 * check, so the first answer is right even when the page doesn't know the
 * timezone yet. `from`/`to` are what the page worked out itself: used when
 * there's no `range`. `from`/`to` in the answer say which period was read.
 * The missed callers and opening hours come from /overview, which the page
 * asks for alongside. Staff with the Command Centre or Call Logs permission.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const asked = parseWindow(sp.get('from'), sp.get('to'))
  const range = sp.get('range')
  if (!companyId || !asked) return NextResponse.json({ error: 'companyId and a valid from/to are required' }, { status: 400 })
  const db = admin()
  const access = await requireCallsAccess(req, db, companyId, { timezone: true })
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const win = range && isRangeKey(range) && access.timezone
    ? boardSpan(range, Date.now(), access.timezone, { from: sp.get('cfrom') || undefined, to: sp.get('cto') || undefined })
    : asked
  try {
    return NextResponse.json(await loadBoard(db, companyId, win), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t load the board' }, { status: 500 })
  }
}
