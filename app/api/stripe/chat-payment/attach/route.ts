import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { linkPaymentMessages } from '@/lib/payment-links'

export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

/**
 * POST /api/stripe/chat-payment/attach { companyId, conversationId }
 *
 * Called by the inbox right after a reply with a payment link goes out: that
 * message becomes the payment's card (lib/payment-links). Workspace members only.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId } = await req.json().catch(() => ({}))
    if (!companyId || !conversationId) return NextResponse.json({ error: 'companyId and conversationId are required' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data: conv } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
    if (!conv || conv.company_id !== companyId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const linked = await linkPaymentMessages(db, { conversationId })
    return NextResponse.json({ ok: true, linked })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
