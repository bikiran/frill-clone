import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, loadCallRows, enrichCalls, parseWindow } from '@/lib/command-centre-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/calls?companyId=&from=<ms>&to=<ms|open>
 *
 * The Command Centre's calls for a period, newest first: one row per call
 * (duplicate provider rows merged), each with the caller's name from their
 * contact, the store it came in through, and what the AI phone agent did.
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
    const { rows, truncated, removed } = await loadCallRows(db, companyId, new Date(win.from).toISOString(), win.to ? new Date(win.to).toISOString() : null)
    const calls = await enrichCalls(db, companyId, rows)
    return NextResponse.json({ calls, truncated, removed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t load calls' }, { status: 500 })
  }
}
