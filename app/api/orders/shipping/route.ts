import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: the store's configured shipping methods. Loaded separately from /sources
// so the create-order panel can show instantly while these fetch in the
// background (they need several WooCommerce round-trips).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const integrationId = req.nextUrl.searchParams.get('integrationId') || undefined
    if (!companyId) return NextResponse.json({ shippingMethods: [] })
    const db = admin()

    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ shippingMethods: [] })

    const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })
    const shippingMethods = await woo.getShippingMethods()
    return NextResponse.json({ shippingMethods })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, shippingMethods: [] }, { status: 500 })
  }
}
