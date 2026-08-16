import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/orders/emails-by-status?companyId=&status=processing
 *
 * Returns { emails } — the billing emails of customers whose WooCommerce orders
 * are in the given status. The inbox "Order status" filter uses this to find
 * which contacts to show.
 *
 * It reads the synced woocommerce_orders table AND queries WooCommerce live, so
 * it still works when the synced table is incomplete (e.g. orders placed before
 * the sync was fixed, or a store that has never been fully synced) — which was
 * why "Processing" could show nothing.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const status = (req.nextUrl.searchParams.get('status') || '').toLowerCase()
    if (!companyId || !status) return NextResponse.json({ emails: [] })

    const db = admin()
    const emails = new Set<string>()

    // Woo stores the status bare ("processing") or wc-prefixed ("wc-processing")
    // depending on the sync path. "Order placed" also covers a draft checkout.
    const statusVals = status === 'pending'
      ? ['pending', 'wc-pending', 'checkout-draft', 'wc-checkout-draft']
      : [status, `wc-${status}`]

    // 1) Synced rows (fast).
    try {
      const { data } = await db.from('woocommerce_orders')
        .select('customer_email').eq('company_id', companyId).in('status', statusVals).limit(10000)
      for (const o of data || []) { const e = String(o.customer_email || '').toLowerCase(); if (e) emails.add(e) }
    } catch { /* fall through to live */ }

    // 2) Live from every active WooCommerce store (covers unsynced orders).
    const { data: integs } = await db.from('woocommerce_integrations')
      .select('store_url, consumer_key, consumer_secret').eq('company_id', companyId).eq('is_active', true)
    const wcStatus = status  // WooCommerce expects the bare slug (e.g. "processing")
    for (const integ of integs || []) {
      if (!integ.store_url) continue
      const auth = 'Basic ' + Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')
      for (let page = 1; page <= 15; page++) {
        try {
          const res = await fetch(
            `${integ.store_url}/wp-json/wc/v3/orders?status=${encodeURIComponent(wcStatus)}&per_page=100&page=${page}&_fields=id,billing`,
            { headers: { Authorization: auth } }
          )
          if (!res.ok) break
          const orders = await res.json()
          if (!Array.isArray(orders) || orders.length === 0) break
          for (const o of orders) { const e = String(o?.billing?.email || '').toLowerCase(); if (e) emails.add(e) }
          if (orders.length < 100) break
        } catch { break }
      }
    }

    return NextResponse.json({ emails: Array.from(emails) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, emails: [] }, { status: 500 })
  }
}
