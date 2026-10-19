// Stock by store: the server side (lib/outlet-stock has the pure rules).
//
//   • the saved mapping (outlet_stock_locations, V401; a missing table reads
//     as "nothing saved", so everything works as before until it runs)
//   • live per-location stock from Shopify and from WooCommerce's "Stock
//     Locations for WooCommerce" plugin, cached for a minute like the order
//     look-ups
//   • which store a conversation belongs to (the number the customer rang or
//     texted, the conversation's outlet, the customer's own outlet)
//   • check_stock for a Shopify store, and per-store stock added to the
//     WooCommerce one

import { ShopifyService } from '@/lib/shopify-service'
import { getAccessToken } from '@/lib/shopify-auth'
import type { WooCommerceService } from '@/lib/woocommerce-service'
import {
  buildStoreIndex, detectSlw, parseSlwLocations, parseSlwTerms, slwLocationsFromProducts, parseShopifyLocations, parseShopifyStock,
  productLevels, shopifyAccessDenied, shopifyQueryShape, shopifyScopesMissing, shopifyStockQuery, storesFromLevels, withStoreStock,
  LOCATIONS_QUERY,
  type ExternalLocation, type LevelRow, type MappingRow, type Outlet, type ShopifyLiveProduct, type StockProvider, type StoreIndex, type StoreStock,
} from '@/lib/outlet-stock'

export const MAPPING_TABLE = 'outlet_stock_locations'
export const isMissingTable = (e: any) => /does not exist|schema cache|PGRST205|42P01/i.test(String(e?.message || e?.code || e || ''))

const digits = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)

// ── The mapping ──────────────────────────────────────────────────────────────

export async function loadMappings(db: any, companyId: string, provider: StockProvider, integrationId: string): Promise<{ rows: MappingRow[]; missingTable: boolean }> {
  try {
    const { data, error } = await db.from(MAPPING_TABLE).select('external_location_id, location_name, outlet_id, hidden')
      .eq('company_id', companyId).eq('provider', provider).eq('integration_id', integrationId).limit(200)
    if (error) return { rows: [], missingTable: isMissingTable(error) }
    return { rows: (data || []) as MappingRow[], missingTable: false }
  } catch (e) { return { rows: [], missingTable: isMissingTable(e) } }
}

export async function loadOutlets(db: any, companyId: string): Promise<Outlet[]> {
  try {
    const { data } = await db.from('company_locations').select('id, label, suburb, street_address, postcode, state, is_primary').eq('company_id', companyId).limit(100)
    return (data || []) as Outlet[]
  } catch { return [] }
}

/** The stores this integration's stock is answered for, or null (per-store answers off). */
export async function storeIndexFor(db: any, companyId: string, provider: StockProvider, integrationId: string | null | undefined): Promise<StoreIndex | null> {
  if (!integrationId) return null
  const { rows } = await loadMappings(db, companyId, provider, integrationId)
  if (!rows.length) return null
  return buildStoreIndex(rows, await loadOutlets(db, companyId))
}

/**
 * The outlet this conversation is tied to: the store number the customer rang
 * or texted, then the conversation's outlet, then the customer's own outlet,
 * then (Colvy AI on an outlet's page) the outlet in view. Null when none.
 */
export async function contextOutletId(db: any, companyId: string, c: { conversationId?: string | null; contactId?: string | null; dialledNumber?: string | null; outletId?: string | null }): Promise<string | null> {
  const safe = async (q: any) => { try { const { data, error } = await q; return error ? null : data } catch { return null } }
  const dialled = digits(c.dialledNumber)
  if (dialled.length >= 8) {
    const [nums, locs] = await Promise.all([
      safe(db.from('phone_numbers').select('phone_number, location_id').eq('company_id', companyId).limit(200)),
      safe(db.from('company_locations').select('id, phone').eq('company_id', companyId).limit(100)),
    ])
    const n = (nums || []).find((r: any) => r.location_id && digits(r.phone_number) === dialled)
    if (n) return String(n.location_id)
    const l = (locs || []).find((r: any) => digits(r.phone) === dialled)
    if (l) return String(l.id)
  }
  if (c.conversationId) {
    const conv = await safe(db.from('conversations').select('assigned_location_id, location_id, contact_id').eq('company_id', companyId).eq('id', c.conversationId).maybeSingle())
    if (conv?.assigned_location_id || conv?.location_id) return String(conv.assigned_location_id || conv.location_id)
    if (!c.contactId && conv?.contact_id) c = { ...c, contactId: conv.contact_id }
  }
  if (c.contactId) {
    const ct = await safe(db.from('contacts').select('location_id').eq('company_id', companyId).eq('id', c.contactId).maybeSingle())
    if (ct?.location_id) return String(ct.location_id)
  }
  return c.outletId || null
}

// ── A short cache (a run that checks the same thing twice asks once) ─────────

const TTL = 60_000
const cache = new Map<string, { at: number; p: Promise<any> }>()
function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.p
  const p = make()
  cache.set(key, { at: Date.now(), p })
  p.catch(() => { if (cache.get(key)?.p === p) cache.delete(key) })
  if (cache.size > 500) { const first = cache.keys().next().value; if (first) cache.delete(first) }
  return p
}
export const clearStockCache = () => cache.clear()

// ── Shopify ──────────────────────────────────────────────────────────────────

export async function shopifyServiceFor(db: any, integ: any): Promise<ShopifyService> {
  const token = await getAccessToken(db, integ)
  return new ShopifyService({ storeDomain: integ.store_domain, accessToken: token, onUnauthorized: () => getAccessToken(db, integ, { force: true }) })
}

type ShopifyGql = Pick<ShopifyService, 'gql'> & { shop?: string }

/** The store's active locations; denied when the app can't read them. */
export async function shopifyLocationList(svc: ShopifyGql): Promise<{ locations: ExternalLocation[]; denied: boolean }> {
  try {
    const { data, errors } = await svc.gql<any>(LOCATIONS_QUERY)
    if (!data?.locations) return { locations: [], denied: shopifyAccessDenied(errors) }
    return { locations: parseShopifyLocations(data), denied: false }
  } catch (e: any) {
    if (shopifyAccessDenied([{ message: e?.message }])) return { locations: [], denied: true }
    throw e
  }
}

/**
 * Live stock for these products (by legacy id). With levels, each variant's
 * stock at every location too; a store that refuses those (permissions) still
 * answers the overall stock, with denied set.
 */
export async function shopifyLiveStock(svc: ShopifyGql, ids: number[], opts: { levels: boolean; knownLocations?: number }): Promise<{ products: ShopifyLiveProduct[]; denied: boolean }> {
  const want = Array.from(new Set(ids.filter(n => Number.isFinite(n) && n > 0)))
  if (!want.length) return { products: [], denied: false }
  const shape = shopifyQueryShape(want.length, opts.knownLocations || 0)
  const run = async (levels: boolean) => {
    const variants = levels ? shape.variants : 20
    const { data, errors } = await svc.gql<any>(shopifyStockQuery(levels, variants, shape.levels), { ids: want.map(id => `gid://shopify/Product/${id}`) })
    return { products: parseShopifyStock(data), denied: levels && shopifyAccessDenied(errors) }
  }
  return cached(`shopify:${svc.shop || ''}:${opts.levels ? 'L' : 'O'}:${want.join(',')}`, async () => {
    try { return await run(opts.levels) } catch (e: any) {
      // Nothing came back at all because of the per-location part: ask again without it.
      if (opts.levels && shopifyAccessDenied([{ message: e?.message }])) return { ...(await run(false)), denied: true }
      throw e
    }
  })
}

// ── WooCommerce (Stock Locations for WooCommerce) ────────────────────────────

type WooLike = Pick<WooCommerceService, 'getLocationFields' | 'getVariationLocationFields' | 'sampleLocationFields' | 'getStockLocationTerms'>

/** Is the plugin on this store, and its locations. Throws when the store can't be reached. */
export async function wooStockLocations(woo: WooLike): Promise<{ detected: boolean; locations: ExternalLocation[] }> {
  const sample = await woo.sampleLocationFields(20)
  if (!detectSlw(sample)) return { detected: false, locations: [] }
  const terms = parseSlwTerms(await woo.getStockLocationTerms())
  return { detected: true, locations: terms.length ? terms : slwLocationsFromProducts(sample) }
}

// A product the plugin hasn't been given any locations for keeps its stock
// overall: that's "not known per store", never "none at every store".
const assigned = (field: any): LevelRow[] | null => {
  const lv = parseSlwLocations(field)
  return lv && lv.length ? lv : null
}

/**
 * Per-location stock for products and for the options of the variable
 * products in `expand`. A simple product's comes from its own field; a
 * variable product's only as the sum of its options (expanded ones), never
 * from the parent's own field. Nothing when the plugin isn't answering.
 */
export async function wooLevels(woo: WooLike, storeKey: string, products: { id: number; variable: boolean }[], expand: number[]): Promise<{ byProduct: Record<string, LevelRow[] | null>; byOption: Record<string, LevelRow[] | null> }> {
  const productIds = products.map(p => p.id).filter(n => n > 0)
  const variableIds = expand.filter(id => products.some(p => p.id === id && p.variable))
  const byProduct: Record<string, LevelRow[] | null> = {}
  const byOption: Record<string, LevelRow[] | null> = {}
  const fields = await cached(`woo:${storeKey}:p:${productIds.join(',')}`, () => woo.getLocationFields(productIds))
  if (!detectSlw(fields)) return { byProduct, byOption }
  const variable = new Set(products.filter(p => p.variable).map(p => p.id))
  for (const f of fields) if (!variable.has(Number(f.id))) byProduct[String(f.id)] = assigned(f.locations)
  const vars = await Promise.all(variableIds.map(id => cached(`woo:${storeKey}:v:${id}`, () => woo.getVariationLocationFields(id)).catch(() => null)))
  variableIds.forEach((pid, i) => {
    const list = vars[i]
    if (!list || !detectSlw(list)) return
    const sum = new Map<string, LevelRow>()
    let complete = true
    for (const v of list) {
      const lv = assigned(v.locations)
      byOption[String(v.id)] = lv
      if (!lv) { complete = false; continue }
      for (const l of lv) {
        const cur = sum.get(l.locationId)
        if (cur) cur.available = (cur.available || 0) + (l.available || 0)
        else sum.set(l.locationId, { ...l })
      }
    }
    // A full page (50) may not be all of them: no product total then.
    if (complete && list.length && list.length < 50) byProduct[String(pid)] = Array.from(sum.values())
  })
  return { byProduct, byOption }
}

type StockCtx = { companyId: string; conversationId?: string | null; contactId?: string | null; dialledNumber?: string | null; outletId?: string | null }

/**
 * Add per-store stock to a WooCommerce check_stock result (products are the
 * raw searchProducts rows it was built from). Anything missing — no mapping,
 * no plugin, the store not answering — returns the result unchanged.
 */
export async function wooStoreStock<T extends { products: any[] }>(db: any, ctx: StockCtx, integ: { id: string; store_url?: string }, woo: WooLike, raw: any[], result: T, asked?: string | null): Promise<T> {
  try {
    const index = await storeIndexFor(db, ctx.companyId, 'woocommerce', integ.id)
    if (!index || !raw.length) return result
    // Options are listed for the first three variable products (as check_stock does).
    const variableIds = raw.filter((p, i) => p.has_variations && i < 3).map(p => Number(p.id))
    const lv = await wooLevels(woo, integ.store_url || integ.id, raw.map(p => ({ id: Number(p.id), variable: !!p.has_variations })), variableIds)
    const byProduct: Record<string, StoreStock[] | null> = {}
    const byOption: Record<string, StoreStock[] | null> = {}
    for (const [k, v] of Object.entries(lv.byProduct)) byProduct[k] = storesFromLevels(v, index)
    for (const [k, v] of Object.entries(lv.byOption)) byOption[k] = storesFromLevels(v, index)
    if (!Object.values(byProduct).some(Boolean) && !Object.values(byOption).some(Boolean)) return result
    const contextOutlet = await contextOutletId(db, ctx.companyId, ctx)
    return withStoreStock(result, { byProduct, byOption }, { index, asked, contextOutletId: contextOutlet })
  } catch { return result }
}

// ── check_stock for a Shopify store ──────────────────────────────────────────

// "Starts with what you typed" outranks "mentioned somewhere" (as the product picker ranks).
export function rankCatalogue(rows: any[], query: string, limit = 8): any[] {
  const ql = query.toLowerCase().trim()
  const terms = ql.split(/\s+/).filter(Boolean)
  const score = (p: any): number => {
    const name = String(p.name || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    const skus = String(p.skus || '').toLowerCase().split(/\s+/)
    if (sku === ql || skus.includes(ql)) return 0
    if (name === ql) return 1
    if (name.startsWith(ql)) return 2
    if (name.includes(ql)) return 3
    const hit = terms.filter(t => name.includes(t)).length
    if (hit === terms.length) return 5
    if (hit > 0) return 6 + (terms.length - hit)
    return 50
  }
  const scored = rows.map((p, i) => ({ p, s: score(p), i }))
  const strong = scored.filter(x => x.s < 50)
  return (strong.length ? strong : scored).sort((a, b) => (a.s - b.s) || (a.i - b.i)).slice(0, limit).map(x => x.p)
}

/**
 * check_stock against a Shopify store: the synced catalogue finds the
 * products, Shopify answers their stock live (as WooCommerce does), in the same
 * shape the WooCommerce lookup returns. Per-store stock is added when the
 * store mapping is saved and the app may read locations.
 */
export async function shopifyCheckStock(db: any, ctx: StockCtx, integ: any, query: string, opts: { asked?: string | null; money: (n: any) => string; svc?: ShopifyGql }): Promise<any> {
  const first = query.toLowerCase().split(/\s+/).filter(Boolean)[0]?.replace(/[%,()]/g, ' ').trim()
  if (!first) return { error: 'Give a product name or SKU.' }
  const { data: rows } = await db.from('shopify_products')
    .select('shopify_product_id, name, sku, skus, price, stock_status, stock_quantity, has_variations, variants, status')
    .eq('company_id', ctx.companyId).eq('integration_id', integ.id)
    .or(`name.ilike.%${first}%,skus.ilike.%${first}%`).limit(300)
  const top = rankCatalogue((rows || []).filter((p: any) => p.status !== 'ARCHIVED' && p.status !== 'DRAFT'), query, 8)
  if (!top.length) return { products: [] }

  const index = shopifyScopesMissing(integ).length ? null : await storeIndexFor(db, ctx.companyId, 'shopify', integ.id)
  let svc = opts.svc
  try { svc = svc || await shopifyServiceFor(db, integ) } catch (e: any) { return { error: e?.message || 'Could not reach Shopify.' } }
  const ids = top.map((p: any) => Number(p.shopify_product_id))
  // Per-store for the four best matches (Shopify's query-cost limit); overall for the rest.
  const withLevels = index ? ids.slice(0, 4) : []
  const rest = ids.filter(id => !withLevels.includes(id))
  let live: ShopifyLiveProduct[] = []
  try {
    const [a, b] = await Promise.all([
      withLevels.length ? shopifyLiveStock(svc!, withLevels, { levels: true, knownLocations: index?.stores.length || 0 }) : Promise.resolve({ products: [], denied: false }),
      rest.length ? shopifyLiveStock(svc!, rest, { levels: false }) : Promise.resolve({ products: [], denied: false }),
    ])
    live = [...a.products, ...b.products]
  } catch (e: any) { return { error: e?.message || 'Could not reach Shopify.' } }
  const byId = new Map(live.map(p => [p.id, p]))

  const byProduct: Record<string, StoreStock[] | null> = {}
  const byOption: Record<string, StoreStock[] | null> = {}
  const products = top.map((row: any, i: number) => {
    const id = Number(row.shopify_product_id)
    const p = byId.get(id)
    // Deleted in Shopify since the last sync: leave it out rather than guess.
    if (!p) return null
    const hasVariations = !p.hasOnlyDefaultVariant && p.variants.length > 1
    const productId = `shopify:${id}`
    if (index) {
      byProduct[productId] = storesFromLevels(productLevels(p), index)
      if (hasVariations) for (const v of p.variants) byOption[`shopify:${id}:${v.id}`] = v.tracked ? storesFromLevels(v.levels, index) : null
    }
    return {
      productId, name: p.title || row.name, sku: p.variants[0]?.sku || row.sku || null,
      stockStatus: p.variants.some(v => v.available) ? 'instock' : 'outofstock',
      stockQty: p.tracksInventory ? p.totalInventory : null,
      price: opts.money(p.price ?? row.price), hasVariations,
      ...(hasVariations ? {
        note: 'Has sizes/options: stock is per option. Use the productId of the option the customer wants.',
        ...(i < 3 ? { options: p.variants.slice(0, 15).map(v => ({ productId: `shopify:${id}:${v.id}`, option: v.title || `Option ${v.id}`, stockStatus: v.available ? 'instock' : 'outofstock', price: v.price != null ? opts.money(v.price) : null })) } : {}),
      } : {}),
    }
  }).filter(Boolean)
  const result = { products }
  if (!index) return result
  const contextOutlet = await contextOutletId(db, ctx.companyId, ctx)
  return withStoreStock(result, { byProduct, byOption }, { index, asked: opts.asked, contextOutletId: contextOutlet })
}

// ── The inbox product search ─────────────────────────────────────────────────

/**
 * Stock per store for products in the picker's shape ({ id, has_variations }),
 * added as `stores` where known. Unchanged when per-store stock is off.
 */
export async function attachStoreStock(db: any, companyId: string, store: { provider: 'shopify'; integ: any } | { provider: 'woocommerce'; integ: any; woo: WooLike }, products: any[]): Promise<any[]> {
  try {
    if (!products.length) return products
    if (store.provider === 'shopify' && shopifyScopesMissing(store.integ).length) return products
    const index = await storeIndexFor(db, companyId, store.provider, store.integ?.id)
    if (!index) return products
    const stores: Record<string, StoreStock[] | null> = {}
    if (store.provider === 'shopify') {
      const ids = products.slice(0, 6).map(p => Number(p.id)).filter(n => n > 0)
      const svc = await shopifyServiceFor(db, store.integ)
      const { products: live } = await shopifyLiveStock(svc, ids, { levels: true, knownLocations: index.stores.length })
      for (const p of live) stores[String(p.id)] = storesFromLevels(productLevels(p), index)
    } else {
      const top = products.slice(0, 10)
      const variable = (p: any) => !!p.has_variations || p.type === 'variable'
      const lv = await wooLevels(store.woo, store.integ.store_url || store.integ.id, top.map(p => ({ id: Number(p.id), variable: variable(p) })), top.filter(variable).slice(0, 3).map(p => Number(p.id)))
      for (const [k, v] of Object.entries(lv.byProduct)) stores[k] = storesFromLevels(v, index)
    }
    return products.map(p => (stores[String(p.id)] ? { ...p, stores: stores[String(p.id)] } : p))
  } catch { return products }
}
