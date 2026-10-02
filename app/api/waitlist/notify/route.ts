import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, notifyWaitlist } from '@/lib/waitlist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, ids? | wooProductId? | itemName? } — the team pressed
// "Notify now": text everyone waiting on that item immediately (a deliberate
// press isn't held for sending hours; automatic stock triggers are).
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (!b.ids?.length && !b.wooProductId && !b.itemName) return NextResponse.json({ error: 'Which item?' }, { status: 400 })

    const r = await notifyWaitlist(db, {
      companyId,
      ids: Array.isArray(b.ids) ? b.ids : undefined,
      wooProductIds: b.wooProductId ? [b.wooProductId] : undefined,
      itemName: b.itemName ? String(b.itemName) : undefined,
      respectHours: false,
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
