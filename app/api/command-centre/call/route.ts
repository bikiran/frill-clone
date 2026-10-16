import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, loadCallDetail } from '@/lib/command-centre-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/command-centre/call?companyId=&callId=
 *
 * One call's story for the drawer: the call, the contact and conversation, the
 * tasks and waiting-list entries made from it, what happened next (the
 * automatic text, replies, call-backs) and what the AI phone agent did.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId'), callId = sp.get('callId')
  if (!companyId || !callId) return NextResponse.json({ error: 'companyId and callId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCallsAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const detail = await loadCallDetail(db, companyId, callId)
    if (!detail) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t load the call' }, { status: 500 })
  }
}
