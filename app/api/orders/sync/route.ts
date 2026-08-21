import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncWooOrders } from '@/lib/orders-sync'

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
 * POST /api/orders/sync  { companyId }
 *
 * Backfills the operational `orders` table from the storefront orders already in
 * woocommerce_orders. Fast + idempotent (only NEW orders are processed; existing
 * ones flow in through the webhook). Ongoing new orders no longer need this — it's
 * a one-off/reconcile — the webhook keeps the board live.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json().catch(() => ({}))
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    // Page through the WHOLE woocommerce_orders book, not just the first page.
    // PostgREST caps a single response at ~1000 rows regardless of .limit(), so a
    // flat .limit(2000) silently backfilled only the 1000 most-recent orders and
    // left everything older (e.g. an order from months ago) missing from the
    // board entirely. Sync each page (syncWooOrders only inserts the new ones).
    const PAGE = 1000
    let synced = 0
    for (let from = 0; from < 500000; from += PAGE) {
      const { data: woo } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', companyId).order('order_date', { ascending: false }).range(from, from + PAGE - 1)
      if (!woo?.length) break
      synced += await syncWooOrders(db, companyId, woo)
      if (woo.length < PAGE) break
    }
    return NextResponse.json({ ok: true, synced })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
