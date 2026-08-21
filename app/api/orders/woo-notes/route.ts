import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createWooCommerceService } from '@/lib/woocommerce-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isMember(db: any, req: NextRequest, companyId: string): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return false
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return false
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return true
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return !!tm?.id
  } catch { return false }
}

/**
 * GET /api/orders/woo-notes?companyId=…&wooOrderId=…
 * Returns the order's WooCommerce note history (system + staff + customer notes),
 * fetched live from the store. Membership-checked.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const wooOrderId = req.nextUrl.searchParams.get('wooOrderId') || ''
    if (!companyId || !wooOrderId) return NextResponse.json({ error: 'companyId and wooOrderId required', notes: [] }, { status: 400 })
    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed', notes: [] }, { status: 403 })
    const svc = await createWooCommerceService(db, companyId).catch(() => null)
    if (!svc) return NextResponse.json({ notes: [], error: 'WooCommerce not connected' })
    const [notes, order] = await Promise.all([
      svc.getOrderNotes(Number(wooOrderId)),
      svc.getOrderByNumber(Number(wooOrderId)).catch(() => null),
    ])
    return NextResponse.json({ notes, customerNote: order?.customer_note || null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), notes: [] }, { status: 500 })
  }
}
