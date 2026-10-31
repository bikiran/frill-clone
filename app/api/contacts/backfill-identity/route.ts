import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkContactsBatch } from '@/lib/contact-identity-link'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST /api/contacts/backfill-identity  { companyId }
//
// Group every existing contact that shares an email or phone under a single
// identity_group_id, so the "also reachable on" panel and merged timeline work
// for people who existed BEFORE identity linking shipped. New contacts link
// automatically; this catches the history.
//
// One batch per call (lib/contact-identity-link): it answers with what's left
// ({ remaining }) and the Contacts page keeps calling until that's 0. Doing it
// all in one call ran past the 60-second limit on big stores (and only ever
// saw the first 1000 contacts).
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    // Leaves room under maxDuration for reading every contact first.
    return NextResponse.json({ ok: true, ...await linkContactsBatch(db, companyId, 40_000) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
