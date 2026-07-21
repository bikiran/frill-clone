import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/orders/detail?companyId=&orderId=&integrationId=
 *
 * Returns a single order with its line items, fetched live from WooCommerce.
 * The synced order rows frequently have an empty line_items array, so anything
 * that needs the actual items (the refund modal) reads them here instead.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const orderId = req.nextUrl.searchParams.get('orderId')
    const integrationId = req.nextUrl.searchParams.get('integrationId')
    if (!companyId || !orderId) {
      return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })
    }

    const db = admin()

    // Try the stored row first — it may already have items.
    const { data: stored } = await db.from('woocommerce_orders')
      .select('*').eq('company_id', companyId)
      .or(`order_id.eq.${orderId},order_number.eq.${orderId}`).maybeSingle()
    if (stored && Array.isArray(stored.line_items) && stored.line_items.length > 0) {
      return NextResponse.json({ order: stored })
    }

    // Otherwise fetch live.
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*')
        .eq('company_id', companyId).eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) {
      // No live source — return the stored row even if items are empty.
      return NextResponse.json({ order: stored || { order_id: orderId, line_items: [] } })
    }

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`
    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    })
    const order = await res.json().catch(() => null)
    if (!res.ok || !order) {
      return NextResponse.json({ order: stored || { order_id: orderId, line_items: [] } })
    }

    // Persist the items so the next refund doesn't need a live call.
    try {
      await db.from('woocommerce_orders')
        .update({ line_items: order.line_items || [], shipping_total: order.shipping_total || null })
        .eq('company_id', companyId).eq('order_id', order.id)
    } catch {}

    return NextResponse.json({
      order: {
        order_id: order.id,
        order_number: order.number,
        line_items: order.line_items || [],
        shipping_total: order.shipping_total,
        total: order.total,
        status: order.status,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
