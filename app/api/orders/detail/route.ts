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

    // Try the stored row first — but only trust it if it's actually complete:
    // it must have line items, each with a product image, and a shipping total.
    // Synced rows are often missing images and shipping, so those go live.
    const { data: stored } = await db.from('woocommerce_orders')
      .select('*').eq('company_id', companyId)
      .or(`order_id.eq.${orderId},order_number.eq.${orderId}`).maybeSingle()
    const complete = (o: any) =>
      o && Array.isArray(o.line_items) && o.line_items.length > 0 &&
      o.shipping_total != null &&
      o.line_items.every((li: any) => li?.image?.src)
    if (complete(stored)) {
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

    // WooCommerce line items already carry image:{id,src}; keep it. Shipping
    // comes from shipping_lines (Flat Rate / Free shipping / Local pickup).
    const lineItems = order.line_items || []
    const shipLine = (order.shipping_lines || [])[0] || null
    const shippingMethod = shipLine?.method_title || null

    // Persist the enriched items + shipping so the next open is instant.
    try {
      await db.from('woocommerce_orders')
        .update({ line_items: lineItems, shipping_total: order.shipping_total ?? null })
        .eq('company_id', companyId).eq('order_id', order.id)
    } catch { /* cache only */ }

    return NextResponse.json({
      order: {
        order_id: order.id,
        order_number: order.number,
        line_items: lineItems,
        shipping_total: order.shipping_total,
        shipping_method: shippingMethod,
        shipping_tax: order.shipping_tax,
        discount_total: order.discount_total,
        total_tax: order.total_tax,
        total: order.total,
        total_refunded: (order.refunds || []).reduce((s: number, r: any) => s + Math.abs(parseFloat(r.total || 0)), 0),
        status: order.status,
        billing: order.billing,
        payment_method_title: order.payment_method_title,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
