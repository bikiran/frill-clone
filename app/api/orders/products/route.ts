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

async function wooFor(companyId: string, integrationId?: string) {
  const db = admin()
  let integ: any = null
  if (integrationId) {
    const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
    integ = r.data
  } else {
    const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
    integ = r.data?.[0] || null
  }
  if (!integ?.store_url) return null
  return new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })
}

// GET ?companyId=&q=  → product search
// GET ?companyId=&productId=  → variations for a variable product
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const integrationId = req.nextUrl.searchParams.get('integrationId') || undefined
    const q = req.nextUrl.searchParams.get('q')
    const productId = req.nextUrl.searchParams.get('productId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const woo = await wooFor(companyId, integrationId)
    if (!woo) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    if (productId) {
      const variations = await woo.getProductVariations(Number(productId))
      return NextResponse.json({ variations })
    }
    if (!q || q.trim().length < 2) return NextResponse.json({ products: [] })
    const products = await woo.searchProducts(q.trim())
    return NextResponse.json({ products })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
