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

// POST: validate a coupon before it's applied to a draft order.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, code, subtotal, email, productIds } = await req.json()
    if (!companyId || !code) return NextResponse.json({ error: 'Missing companyId or code' }, { status: 400 })

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
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
