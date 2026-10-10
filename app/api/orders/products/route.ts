import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { WooCommerceService } from '@/lib/woocommerce-service'
import { productForUi, variationsForUi } from '@/lib/shopify-products'

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
    const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
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

  return rankProducts(data, query)
    // Shaped exactly like WooCommerceService.searchProducts, so the picker and
    // Create Order cannot tell which source answered.
    .map((p: any) => ({
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

/**
 * The whole synced WooCommerce catalogue, compact, for searching ON the device.
 * A per-keystroke round trip (auth, store lookup, query) was the slow part of
 * the app's product picker; with the catalogue in hand the app matches as you
 * type with no network at all, and refreshes this in the background. Paged in
 * 1000s (PostgREST's row cap). Returns null when nothing is synced yet.
 */
async function localCatalog(companyId: string): Promise<any[] | null> {
  const db = admin()
  const out: any[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db
      .from('woocommerce_products')
      .select('woo_product_id, name, sku, type, price, regular_price, sale_price, on_sale, stock_status, stock_quantity, manage_stock, image, variation_ids')
      .eq('company_id', companyId)
      .order('woo_product_id', { ascending: true })
      .range(from, from + 999)
    if (error) return out.length ? out : null
    if (!data?.length) break
    for (const p of data as any[]) {
      out.push({
        id: p.woo_product_id, name: p.name, sku: p.sku, type: p.type,
        price: p.price, regular_price: p.regular_price, sale_price: p.sale_price, on_sale: !!p.on_sale,
        stock_status: p.stock_status, stock_quantity: p.stock_quantity, manage_stock: p.manage_stock,
        image: p.image,
        has_variations: p.type === 'variable' && (p.variation_ids?.length || 0) > 0,
      })
    }
    if (data.length < 1000) break
  }
  return out.length ? out : null
}

// "Starts with what you typed" outranks "mentioned somewhere" — shared by the
// WooCommerce and Shopify catalogues.
function rankProducts(rows: any[], query: string): any[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const ql = query.toLowerCase()
  const score = (p: any): number => {
    const name = String(p.name || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    const skus = String(p.skus || '').toLowerCase().split(/\s+/)
    if (sku === ql || skus.includes(ql)) return 0
    if (name === ql) return 1
    if (name.startsWith(ql)) return 2
    if (name.includes(ql)) return 3
    if (sku.startsWith(ql) || skus.some(x => x.startsWith(ql))) return 4
    const hit = terms.filter(t => name.includes(t)).length
    if (hit === terms.length) return 5
    if (hit > 0) return 6 + (terms.length - hit)
    return 50
  }
  return rows
    .map((p: any, i: number) => ({ p, s: score(p), i }))
    .sort((a, b) => (a.s - b.s) || (a.i - b.i))
    .slice(0, 20)
    .map(x => x.p)
}

// The Shopify store to answer from: the one asked for, else the first active.
async function shopifyFor(companyId: string, integrationId?: string) {
  const db = admin()
  let q = db.from('shopify_integrations').select('id').eq('company_id', companyId).eq('is_active', true)
  if (integrationId) q = q.eq('id', integrationId)
  const { data } = await q.order('created_at', { ascending: true }).limit(1)
  return data?.[0] || null
}

async function searchShopify(companyId: string, integrationId: string, query: string): Promise<any[]> {
  const first = query.toLowerCase().split(/\s+/).filter(Boolean)[0]?.replace(/[%,()]/g, ' ').trim()
  if (!first) return []
  const { data } = await admin().from('shopify_products').select('*')
    .eq('company_id', companyId).eq('integration_id', integrationId).neq('status', 'ARCHIVED')
    .or(`name.ilike.%${first}%,skus.ilike.%${first}%`)
    .limit(300)
  return rankProducts(data || [], query).map(productForUi)
}

// GET ?companyId=&q=  → product search
// GET ?companyId=&productId=  → variations for a variable product
// GET ?companyId=&catalog=1  → the whole synced catalogue (on-device search)
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const integrationId = req.nextUrl.searchParams.get('integrationId') || undefined
    const q = req.nextUrl.searchParams.get('q')
    const productId = req.nextUrl.searchParams.get('productId')
    const wantCatalog = req.nextUrl.searchParams.get('catalog') === '1'
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    // It searched any workspace's store for whoever asked; only its members now.
    if (!(await requireCompanyAccess(req, admin(), companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // A Shopify store asked for by id, or the only kind of store connected,
    // answers from the synced Shopify catalogue.
    const asked = integrationId ? await shopifyFor(companyId, integrationId) : null
    const woo = asked ? null : await wooFor(companyId, integrationId)
    const shop = asked || (woo ? null : await shopifyFor(companyId))
    if (shop) {
      if (productId) {
        const { data: p } = await admin().from('shopify_products').select('*').eq('company_id', companyId).eq('shopify_product_id', Number(productId)).maybeSingle()
        return NextResponse.json({ variations: p ? variationsForUi(p) : [] })
      }
      if (wantCatalog) {
        const { data } = await admin().from('shopify_products').select('*')
          .eq('company_id', companyId).eq('integration_id', shop.id).neq('status', 'ARCHIVED').limit(10000)
        // skus: the variant SKUs, so a scanned variant barcode matches on the device too.
        return NextResponse.json({ products: (data || []).map((r: any) => ({ ...productForUi(r), skus: r.skus || '' })), source: 'shopify' })
      }
      if (!q || q.trim().length < 2) return NextResponse.json({ products: [] })
      return NextResponse.json({ products: await searchShopify(companyId, shop.id, q.trim()), source: 'shopify' })
    }
    if (!woo) return NextResponse.json({ error: 'No store connected' }, { status: 404 })

    if (productId) {
      const variations = await woo.getProductVariations(Number(productId))
      return NextResponse.json({ variations })
    }
    if (wantCatalog) {
      // Nothing synced yet → an empty list tells the app to keep using live search.
      const products = await localCatalog(companyId)
      return NextResponse.json({ products: products || [], source: products ? 'local' : 'none' })
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
