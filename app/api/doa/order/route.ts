import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'
import { resolveShopifyOrderRef, shopifyOrderForUi } from '@/lib/shopify-order-actions'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: look up a WooCommerce or Shopify order by number and return a
// normalized summary the DOA form can pre-populate from. A Shopify order is
// matched exactly on its synced number first (precise, unlike WooCommerce's
// search fallback); ?channel=shopify|woocommerce forces one.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const orderNumber = req.nextUrl.searchParams.get('order')
    if (!companyId || !orderNumber) return NextResponse.json({ error: 'Missing companyId or order' }, { status: 400 })

    const db = admin()
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const channel = req.nextUrl.searchParams.get('channel')
    const num = String(orderNumber).trim().replace(/^#/, '')
    const summarise = (order: any, extra: any = {}) => ({
      order_id: order.id,
      order_number: order.number || order.id,
      status: order.status,
      currency: order.currency,
      date: order.date_created,
      payment_method: order.payment_method_title || order.payment_method,
      first_name: order.billing?.first_name || '',
      last_name: order.billing?.last_name || '',
      email: order.billing?.email || '',
      phone: order.billing?.phone || '',
      address: [order.billing?.address_1, order.billing?.address_2, order.billing?.city, order.billing?.state, order.billing?.postcode].filter(Boolean).join(', '),
      items: (order.line_items || []).map((li: any) => ({
        id: li.id, name: li.name, quantity: li.quantity, total: li.total, sku: li.sku, product_id: li.product_id,
      })),
      subtotal: (order.line_items || []).reduce((s: number, li: any) => s + (parseFloat(li.total) || 0), 0).toFixed(2),
      shipping_total: order.shipping_total,
      total: order.total,
      already_refunded: order.refunds?.length ? order.refunds.reduce((s: number, r: any) => s + Math.abs(parseFloat(r.total) || 0), 0).toFixed(2) : '0.00',
      ...extra,
    })
    if (channel !== 'woocommerce') {
      const { data: rows } = await db.from('orders').select('id').eq('company_id', companyId).eq('sales_channel', 'shopify').eq('order_number', num).limit(1)
      if (rows?.[0]) {
        try {
          const ref = await resolveShopifyOrderRef(db, companyId, { orderId: rows[0].id })
          if (ref) {
            const o = await shopifyOrderForUi(db, ref)
            return NextResponse.json({ order: summarise(o, { order_id: `shopify-${ref.externalId}`, channel: 'shopify' }) })
          }
        } catch (e: any) { return NextResponse.json({ error: e.message }, { status: e?.status || 502 }) }
      }
      if (channel === 'shopify') return NextResponse.json({ error: `Order #${num} not found` }, { status: 404 })
    }

    // Use the company's first active WooCommerce store
    const { data: integs } = await db.from('woocommerce_integrations')
      .select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    const integ = integs?.[0]
    if (!integ?.store_url) return NextResponse.json({ error: `Order #${num} not found` }, { status: 404 })

    const woo = new WooCommerceService({
      storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret,
    })
    const order = await woo.getOrderByNumber(orderNumber)
    if (!order) return NextResponse.json({ error: `Order #${orderNumber} not found` }, { status: 404 })

    return NextResponse.json({ order: summarise(order) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
