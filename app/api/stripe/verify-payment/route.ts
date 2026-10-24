import { isInternalCall } from '@/lib/internal-call'
import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcilePayments } from '@/lib/payment-links'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Verifies pending payments straight from Stripe, rather than relying on the
// webhook. If the Stripe webhook isn't configured (or a delivery was missed),
// payments would sit as "pending" in the chat forever — this reconciles them.
//
// Called with a conversationId (checks that chat's payments) or a paymentId.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, paymentId, companyId } = await req.json()
    const db = admin()

    let q = db.from('chat_payments').select('*').eq('status', 'pending')
    if (paymentId) q = q.eq('id', paymentId)
    else if (conversationId) q = q.eq('conversation_id', conversationId)
    else if (companyId) q = q.eq('company_id', companyId)
    else return NextResponse.json({ error: 'conversationId, paymentId or companyId required' }, { status: 400 })

    const { data: pending } = await q.limit(25)
    if (!pending || pending.length === 0) return NextResponse.json({ ok: true, checked: 0, updated: 0 })
    // Members of the workspace the payments belong to (or our own server).
    if (!isInternalCall(req)) {
      for (const cid of Array.from(new Set(pending.map((p: any) => p.company_id)))) {
        if (!(await requireCompanyAccess(req, db, cid as string)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }
    }

    const { updated, results } = await reconcilePayments(db, pending)

    return NextResponse.json({ ok: true, checked: pending.length, updated, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
