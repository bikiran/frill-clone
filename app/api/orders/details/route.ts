import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveShopifyOrderRef, shopifyOrderForUi, ShopifyActionError } from '@/lib/shopify-order-actions'
import { WooCommerceService } from '@/lib/woocommerce-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: full order detail (line items, totals, billing) for invoice generation.
// WooCommerce, or Shopify for a Shopify order reference.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const orderId = req.nextUrl.searchParams.get('orderId')
    const integrationId = req.nextUrl.searchParams.get('integrationId') || undefined
    const channel = req.nextUrl.searchParams.get('channel')
    if (!companyId || !orderId) return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })

    const db = admin()
    // Workspace members only (customer details, orders and refunds).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    // A Shopify order (orderId "shopify-<id>", an `orders` row id, or
    // channel=shopify) is read from Shopify in the same shape.
    let order: any = null
    try {
      const shop = await resolveShopifyOrderRef(db, companyId, { orderId, channel })
      if (shop) order = await shopifyOrderForUi(db, shop)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e instanceof ShopifyActionError ? e.status : 502 })
    }
    if (!order) {
      let integ: any = null
      if (integrationId) {
        const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
        integ = r.data
      }
      if (!integ) {
        const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
        integ = r.data?.[0] || null
      }
      if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

      const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })
      order = await woo.getOrderByNumber(orderId)
    }
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Company details for the invoice header
    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()

    return NextResponse.json({
      order: {
        number: order.number || order.id,
        date: order.date_created,
        status: order.status,
        currency: order.currency,
        billing: order.billing,
        shipping: order.shipping,
        line_items: (order.line_items || []).map((li: any) => ({ id: li.id, name: li.name, quantity: li.quantity, total: li.total, sku: li.sku, variation_id: li.variation_id, meta_data: li.meta_data })),
        shipping_total: order.shipping_total,
        discount_total: order.discount_total,
        // Coupon codes applied and any manual fees, so the drawer can show what
        // the customer actually paid vs the line-item subtotal.
        coupon_lines: (order.coupon_lines || []).map((c: any) => ({ code: c.code, discount: c.discount })),
        fee_lines: (order.fee_lines || []).map((f: any) => ({ name: f.name, total: f.total })),
        total_tax: order.total_tax,
        total: order.total,
        payment_method: order.payment_method_title,
      },
      company: company || {},
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
