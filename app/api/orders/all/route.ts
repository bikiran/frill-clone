import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/orders/all?companyId=&pages=
 *
 * Bulk order history for the Insights pages, fetched live from WooCommerce
 * (the synced woocommerce_orders table only holds orders Colvy has touched, so
 * it's too sparse to build analytics on). Returns a lightweight, aggregation-
 * friendly shape. Capped at `pages` * 100 (default 1200) so it stays bounded.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ orders: [] })
    const maxPages = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get('pages') || 12)))

    const db = admin()
    const { data: integs } = await db.from('woocommerce_integrations')
      .select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    if (!integs || integs.length === 0) return NextResponse.json({ orders: [], count: 0, debug: { reason: 'no_active_woocommerce_integration' } })

    const orders: any[] = []
    const debug: any = { integrations: integs.length, stores: [] }
    for (const integ of integs) {
      const store: any = { url: integ.store_url, hasKey: !!integ.consumer_key, fetched: 0 }
      if (!integ.store_url) { store.error = 'no_store_url'; debug.stores.push(store); continue }
      const base = String(integ.store_url).replace(/\/+$/, '')
      const auth = 'Basic ' + Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')
      for (let page = 1; page <= maxPages; page++) {
        let batch: any[] = []
        try {
          const res = await fetch(`${base}/wp-json/wc/v3/orders?per_page=100&page=${page}&status=any&orderby=date&order=desc`, {
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
          })
          if (!res.ok) {
            if (page === 1) { store.httpStatus = res.status; store.error = (await res.text().catch(() => '')).slice(0, 300) }
            break
          }
          batch = await res.json()
        } catch (e: any) { if (page === 1) store.error = String(e?.message || e).slice(0, 200); break }
        if (!Array.isArray(batch) || batch.length === 0) break
        store.fetched += batch.length
        for (const o of batch) {
          orders.push({
            id: o.id,
            total: o.total,
            status: o.status,
            order_date: o.date_created,
            customer_email: o.billing?.email || null,
            woo_customer_id: o.customer_id || null,
            billing: {
              city: o.billing?.city || null,
              state: o.billing?.state || null,
              postcode: o.billing?.postcode || null,
              first_name: o.billing?.first_name || null,
              last_name: o.billing?.last_name || null,
            },
            shipping_city: o.shipping?.city || null,
            line_items: (o.line_items || []).map((li: any) => ({
              name: li.name, total: li.total, quantity: li.quantity,
            })),
          })
        }
        if (batch.length < 100) break
      }
      debug.stores.push(store)
    }

    return NextResponse.json({ orders, count: orders.length, debug })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, orders: [] }, { status: 500 })
  }
}
