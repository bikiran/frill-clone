import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
 * GET /api/orders?companyId=…
 *
 * Lists the operational orders for a company via the service role, so the board
 * reads reliably regardless of RLS state (the anon client can be blocked by a
 * mis-applied policy even when the rows exist). Membership-checked + scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    if (!companyId) return NextResponse.json({ error: 'companyId required', orders: [] }, { status: 400 })
    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed', orders: [] }, { status: 403 })

    // Single order (for the full order details page).
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const { data, error } = await db.from('orders').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
      if (error) return NextResponse.json({ error: error.message, order: null }, { status: 500 })
      return NextResponse.json({ order: data || null })
    }

    // Specific orders by id (e.g. printing a set of slips) — avoids pulling the
    // whole book just to render a handful.
    const idsParam = req.nextUrl.searchParams.get('ids')
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 500)
      const { data, error } = await db.from('orders').select('*').eq('company_id', companyId).in('id', ids)
      if (error) return NextResponse.json({ error: error.message, orders: [] }, { status: 500 })
      return NextResponse.json({ orders: data || [] })
    }

    // One page of the book. The board pages through with offset/limit (PostgREST
    // caps a single response at ~1000 rows regardless of .limit()), so a 50k-order
    // store loads fully across several small requests instead of one huge one.
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0') || 0)
    const limit = Math.min(1000, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '1000') || 1000))
    // Optional date-range filter (Reports only fetches the window it charts, so a
    // 30-day report over a 50k-order store loads a few hundred rows, not the book).
    const since = req.nextUrl.searchParams.get('since')
    let q = db.from('orders').select('*').eq('company_id', companyId)
    if (since) q = q.gte('order_date', since)
    const { data, error } = await q.order('order_date', { ascending: false }).range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: error.message, orders: [] }, { status: 500 })
    return NextResponse.json({ orders: data || [], hasMore: (data?.length || 0) === limit })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, orders: [] }, { status: 500 })
  }
}
