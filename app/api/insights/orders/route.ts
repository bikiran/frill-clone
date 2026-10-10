import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/insights/orders?companyId=
 *
 * Order history for the Insights pages from Colvy's own copy of the store's
 * orders (woocommerce_orders — filled by the WooCommerce sync and webhooks), in
 * the same slim shape as /api/orders/all. A database read takes well under a
 * second; /api/orders/all pulls up to 12 pages live from the store and took
 * many seconds on every visit. Returns { orders: [], source: 'none' } when
 * nothing is synced, so the page can fall back to the live fetch.
 */
export async function GET(req: NextRequest) {
  try {
    let companyId = req.nextUrl.searchParams.get('companyId')
    const db = admin()
    if (!companyId) {
      const host = req.headers.get('host') || ''
      const m = host.match(/^([^.]+)\.colvy\.com$/)
      if (m && m[1] !== 'www') {
        const { data: co } = await db.from('companies').select('id').eq('slug', m[1]).maybeSingle()
        if (co) companyId = co.id
      }
    }
    if (!companyId) return NextResponse.json({ orders: [], source: 'none', debug: { reason: 'no_company_resolved' } })
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const PAGE = 1000
    const MAX = 30000
    // Pages fetched in parallel after the first tells us there is more.
    const page = (from: number) => db.from('woocommerce_orders')
      .select('woo_order_id, total, status, order_date, customer_email, woo_customer_id, billing, line_items')
      .eq('company_id', companyId!).order('order_date', { ascending: false }).range(from, from + PAGE - 1)

    const { count } = await db.from('woocommerce_orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
    const total = Math.min(MAX, count || 0)
    if (!total) return NextResponse.json({ orders: [], source: 'none', count: 0 })

    const offsets = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE)
    const rows: any[] = []
    for (let i = 0; i < offsets.length; i += 6) {
      const batch = await Promise.all(offsets.slice(i, i + 6).map(o => page(o)))
      for (const r of batch) if (r.data) rows.push(...r.data)
    }

    const orders = rows.map((o: any) => {
      const b = o.billing || {}
      return {
        id: o.woo_order_id,
        total: o.total,
        status: o.status,
        order_date: o.order_date,
        customer_email: o.customer_email || b.email || null,
        woo_customer_id: o.woo_customer_id || null,
        billing: { city: b.city || null, state: b.state || null, postcode: b.postcode || null, first_name: b.first_name || null, last_name: b.last_name || null },
        line_items: (o.line_items || []).map((li: any) => ({ name: li.name, total: li.total, quantity: li.quantity })),
      }
    })
    return NextResponse.json({ orders, source: 'synced', count: orders.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, orders: [] }, { status: 500 })
  }
}
