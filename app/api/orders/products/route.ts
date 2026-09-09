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


/**
 * Search the synced catalogue. Returns null when this company has no products
 * mirrored yet, which tells the caller to fall back to WooCommerce.
 *
 * Candidates come from the FIRST word only — the widest reliable net, and the
 * one thing WordPress search gets wrong while someone is still typing. Ranking
 * then happens here, where "starts with what you typed" can outrank "mentioned
 * somewhere in the description", which WooCommerce cannot express.
 */
async function searchLocal(companyId: string, query: string): Promise<any[] | null> {
  const db = admin()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return null

  const first = terms[0].replace(/[%,()]/g, ' ').trim()
  if (!first) return null

  const { data, error } = await db
    .from('woocommerce_products')
    .select('woo_product_id, name, sku, type, price, regular_price, sale_price, on_sale, tax_status, tax_class, stock_status, stock_quantity, manage_stock, image, permalink, short_description, variation_ids')
    .eq('company_id', companyId)
    .or(`name.ilike.%${first}%,sku.ilike.%${first}%`)
    .limit(300)

  // A missing table or any other failure means "fall back", never "no results".
  if (error || !data || data.length === 0) return null

  const ql = query.toLowerCase()
  const score = (p: any): number => {
    const name = String(p.name || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    if (sku === ql) return 0
    if (name === ql) return 1
    if (name.startsWith(ql)) return 2
    if (name.includes(ql)) return 3
    if (sku.startsWith(ql)) return 4
    const hit = terms.filter(t => name.includes(t)).length
    if (hit === terms.length) return 5
    if (hit > 0) return 6 + (terms.length - hit)
    return 50
  }

  return data
    .map((p: any, i: number) => ({ p, s: score(p), i }))
    .sort((a, b) => (a.s - b.s) || (a.i - b.i))
    .slice(0, 20)
    // Shaped exactly like WooCommerceService.searchProducts, so the picker and
    // Create Order cannot tell which source answered.
    .map(({ p }) => ({
      id: p.woo_product_id,
      name: p.name, sku: p.sku, type: p.type,
      price: p.price, regular_price: p.regular_price, sale_price: p.sale_price,
      on_sale: !!p.on_sale,
      tax_status: p.tax_status, tax_class: p.tax_class,
      stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock,
      image: p.image,
      permalink: p.permalink,
      short_description: p.short_description || '',
      has_variations: p.type === 'variable' && (p.variation_ids?.length || 0) > 0,
      variation_ids: p.variation_ids || [],
    }))
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

    // Search the LOCAL mirror first. A live WooCommerce call per keystroke is
    // both slow and bound to WordPress search semantics, which require every
    // term to match and miss a partial last word — "Cichlid col" did not return
    // "Cichlid Color Food" at all. Falls back to WooCommerce when the catalogue
    // has not been synced yet, so this is safe before the first sync runs.
    const local = await searchLocal(companyId, q.trim())
    if (local) return NextResponse.json({ products: local, source: 'local' })

    const products = await woo.searchProducts(q.trim())
    return NextResponse.json({ products, source: 'woocommerce' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
