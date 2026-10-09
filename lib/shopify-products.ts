// Shopify products → shopify_products (the catalogue twin of woocommerce_products).
//
// Stock and price use WooCommerce's words (stock_status instock/outofstock,
// price, compare_at_price) so the composer, the AI and the waitlist can treat a
// product the same whichever store it came from.

import type { ShopifyService } from '@/lib/shopify-service'

const num = (v: any): number | null => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }
const idOf = (gid: any): number | null => { const m = String(gid ?? '').match(/(\d+)$/); return m ? Number(m[1]) : null }

export function mapShopifyProduct(p: any, companyId: string, integrationId: string) {
  const id = p?.legacyResourceId ? Number(p.legacyResourceId) : idOf(p?.id)
  if (!id) return null
  const vs: any[] = p.variants?.nodes || []
  const variants = vs.map(v => ({
    id: v.legacyResourceId ? Number(v.legacyResourceId) : idOf(v.id),
    title: v.title || null,
    sku: v.sku || '',
    price: num(v.price),
    compare_at_price: num(v.compareAtPrice),
    inventory_quantity: typeof v.inventoryQuantity === 'number' ? v.inventoryQuantity : null,
    available: v.availableForSale !== false,
    tracked: v.inventoryItem?.tracked !== false,
    options: (v.selectedOptions || []).filter((o: any) => !(o?.name === 'Title' && o?.value === 'Default Title')),
    inventory_item_id: idOf(v.inventoryItem?.id),
  }))
  const cheapest = variants.filter(v => v.price != null).sort((a, b) => (a.price! - b.price!))[0]
  const anyAvailable = variants.length ? variants.some(v => v.available) : (p.totalInventory || 0) > 0
  return {
    company_id: companyId,
    integration_id: integrationId,
    shopify_product_id: id,
    handle: p.handle || null,
    name: p.title || '',
    status: p.status || null,
    product_type: p.productType || null,
    vendor: p.vendor || null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    sku: variants[0]?.sku || '',
    skus: variants.map(v => v.sku).filter(Boolean).join(' '),
    price: num(p.priceRangeV2?.minVariantPrice?.amount) ?? cheapest?.price ?? null,
    max_price: num(p.priceRangeV2?.maxVariantPrice?.amount),
    compare_at_price: cheapest && cheapest.compare_at_price && cheapest.compare_at_price > (cheapest.price || 0) ? cheapest.compare_at_price : null,
    currency: p.priceRangeV2?.minVariantPrice?.currencyCode || null,
    // A product is in stock if any variant can be sold (Shopify folds
    // "continue selling when out of stock" into availableForSale).
    stock_status: anyAvailable ? 'instock' : 'outofstock',
    stock_quantity: p.tracksInventory ? (typeof p.totalInventory === 'number' ? p.totalInventory : null) : null,
    tracks_inventory: !!p.tracksInventory,
    image: p.featuredMedia?.preview?.image?.url || null,
    permalink: p.onlineStoreUrl || null,
    has_variations: !p.hasOnlyDefaultVariant && variants.length > 1,
    variants,
    inventory_item_ids: variants.map(v => v.inventory_item_id).filter((x): x is number => !!x),
    shopify_updated_at: p.updatedAt || null,
    synced_at: new Date().toISOString(),
  }
}
export type ShopifyProductRow = NonNullable<ReturnType<typeof mapShopifyProduct>>

/**
 * Map and upsert a page of product nodes. A product with more variants than a
 * list page carries (variants.pageInfo.hasNextPage) is fetched on its own with
 * the full set first.
 */
export async function saveShopifyProducts(db: any, svc: ShopifyService | null, companyId: string, integrationId: string, nodes: any[]): Promise<number> {
  const full: any[] = []
  for (const n of nodes) {
    if (n?.variants?.pageInfo?.hasNextPage && svc) {
      try { full.push((await svc.getProduct(n.id)) || n); continue } catch {}
    }
    full.push(n)
  }
  const rows = full.map(n => mapShopifyProduct(n, companyId, integrationId)).filter(Boolean) as ShopifyProductRow[]
  if (!rows.length) return 0
  const { error } = await db.from('shopify_products').upsert(rows, { onConflict: 'company_id,shopify_product_id' })
  if (error) throw new Error(`shopify_products: ${error.message}`)
  return rows.length
}

/**
 * The shape the composer / Create Order / AI expect from /api/orders/products —
 * the same keys a WooCommerce product has, so the UI needs no channel checks.
 */
export function productForUi(r: any) {
  const onSale = !!(r.compare_at_price && r.price != null && r.compare_at_price > r.price)
  return {
    id: r.shopify_product_id,
    name: r.name,
    sku: r.sku || '',
    type: r.has_variations ? 'variable' : 'simple',
    price: r.price != null ? String(r.price) : '',
    regular_price: onSale ? String(r.compare_at_price) : (r.price != null ? String(r.price) : ''),
    sale_price: onSale ? String(r.price) : '',
    on_sale: onSale,
    stock_status: r.stock_status,
    stock_quantity: r.stock_quantity,
    manage_stock: !!r.tracks_inventory,
    image: r.image,
    permalink: r.permalink,
    short_description: '',
    has_variations: !!r.has_variations,
    variation_ids: (r.variants || []).map((v: any) => v.id),
    source: 'shopify',
  }
}

/** Variations in the shape /api/orders/products?productId= returns for WooCommerce. */
export function variationsForUi(r: any) {
  return (r.variants || []).map((v: any) => ({
    id: v.id,
    sku: v.sku || '',
    price: v.price != null ? String(v.price) : '',
    regular_price: v.compare_at_price && v.price != null && v.compare_at_price > v.price ? String(v.compare_at_price) : (v.price != null ? String(v.price) : ''),
    stock_status: v.available ? 'instock' : 'outofstock',
    stock_quantity: v.inventory_quantity,
    manage_stock: !!v.tracked,
    image: r.image,
    attributes: (v.options || []).map((o: any) => `${o.name}: ${o.value}`).join(', ') || v.title || '',
  }))
}
