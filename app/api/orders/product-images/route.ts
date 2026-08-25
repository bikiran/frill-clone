import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function wooFor(companyId: string) {
  const db = admin()
  const { data } = await db.from('woocommerce_integrations').select('*')
    .eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
  const integ = data?.[0]
  if (!integ?.store_url) return null
  return new WooCommerceService({ companyId, storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret } as any)
}

// POST { companyId, skus: string[] } → { images: { [sku]: url } }
// Resolves product images by SKU from WooCommerce (order line items rarely carry
// them). Used to backfill thumbnails on the Out of Stock list.
export async function POST(req: NextRequest) {
  try {
    const { companyId, skus } = await req.json()
    if (!companyId || !Array.isArray(skus) || skus.length === 0) return NextResponse.json({ images: {} })
    const woo = await wooFor(companyId)
    if (!woo) return NextResponse.json({ images: {} })
    const images = await woo.imagesForSkus(skus.map(String))
    return NextResponse.json({ images })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, images: {} }, { status: 500 })
  }
}
