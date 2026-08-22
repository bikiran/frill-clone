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
    const { companyId, full } = await req.json().catch(() => ({}))
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    // Default (automatic, on board open) is a LIGHT pass over just the most
    // recent page — the webhook keeps the board live, so this only mops up
    // anything it missed, and it must not do a 50k-row scan on every open.
    // `full: true` (the manual Sync button) pages through the WHOLE
    // woocommerce_orders book to backfill older orders. syncWooOrders only ever
    // inserts the new ones, so both are idempotent.
    const PAGE = 1000
    let synced = 0
    for (let from = 0; from < (full ? 500000 : PAGE); from += PAGE) {
      const { data: woo } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', companyId).order('order_date', { ascending: false }).range(from, from + PAGE - 1)
      if (!woo?.length) break
      synced += await syncWooOrders(db, companyId, woo)
      if (woo.length < PAGE || !full) break
    }
    return NextResponse.json({ ok: true, synced })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
