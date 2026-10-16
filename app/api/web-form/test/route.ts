import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFormsTest, checkFormsTest } from '@/lib/forms-mail'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A real end-to-end test of a web-form address: Colvy emails it through
// Resend, exactly as a website form would, and the page then polls GET until
// the conversation shows up (it's filed closed and read, so nobody is
// notified). It used to write a sample conversation straight into the
// database, which said "working" even when no email could ever arrive.
// Auth: staff of the address's company.

async function channelFor(db: any, q: { address?: string | null; channelId?: string | null }) {
  let query = db.from('email_channels').select('id, company_id, inbound_address').eq('provider', 'webform')
  query = q.channelId ? query.eq('id', String(q.channelId)) : query.ilike('inbound_address', String(q.address || ''))
  const { data } = await query.maybeSingle()
  return data || null
}

// POST { address } → { ok, token, emailId, channelId }
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const { address } = await req.json().catch(() => ({}))
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
    const chan = await channelFor(db, { address })
    if (!chan) return NextResponse.json({ error: 'Unknown web-form address' }, { status: 404 })
    const access = await requireCompanyAccess(req, db, chan.company_id)
    if (!access.ok) return NextResponse.json({ error: access.unavailable ? 'Can’t check access right now' : 'Not authorized for this address' }, { status: access.unavailable ? 503 : 403 })
    const r = await sendFormsTest(String(chan.inbound_address))
    return NextResponse.json({ ...r, channelId: chan.id }, { status: r.ok ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// GET ?channelId&token&emailId → { arrived, conversationId, delivery }
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const chan = await channelFor(db, { channelId: sp.get('channelId') })
    if (!chan) return NextResponse.json({ error: 'Unknown web-form address' }, { status: 404 })
    const access = await requireCompanyAccess(req, db, chan.company_id)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized for this address' }, { status: access.unavailable ? 503 : 403 })
    const r = await checkFormsTest(db, { token: String(sp.get('token') || ''), channelId: chan.id, emailId: sp.get('emailId') })
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
