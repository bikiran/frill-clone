import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'
import { shopifyValidateCode, ShopifyCreateError } from '@/lib/shopify-create'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: validate a coupon before it's applied to a draft order — a WooCommerce
// coupon, or a Shopify discount code for a Shopify store.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, code, subtotal, email, productIds } = await req.json()
    if (!companyId || !code) return NextResponse.json({ error: 'Missing companyId or code' }, { status: 400 })

    const db = admin()
    // Workspace members only (customer details, orders and refunds).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (integrationId) {
      const { data: shop } = await db.from('shopify_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
      if (shop) {
        if (!shop.is_active) return NextResponse.json({ ok: false, error: 'This Shopify store is disconnected.' }, { status: 404 })
        try { return NextResponse.json(await shopifyValidateCode(db, shop, String(code).trim(), { subtotal: Number(subtotal) || undefined })) }
        catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: e instanceof ShopifyCreateError ? e.status : 502 }) }
      }
    }
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
      integ = r.data
    } else {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })
    const result = await woo.validateCoupon(code, { subtotal, email, productIds })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
