// Stock by store (outlet): the pure part, shared by the server (AI stock
// lookups, the inbox product search, the mapping API) and the tests.
//
// Where per-store stock comes from:
//   • Shopify: each location's "available" quantity for a variant
//     (InventoryItem.inventoryLevels → quantities(names: ["available"])). Needs
//     read_inventory + read_locations, which the Colvy app has asked for since
//     its first release; a pasted-token store may not have them.
//   • WooCommerce: WooCommerce itself keeps one stock number per product. The
//     "Stock Locations for WooCommerce" plugin (slw) keeps one per location and
//     adds a `locations` field to the REST product and variation responses:
//       locations: [{ id, name, slug, quantity }]   (quantity = the product's
//       `_stock_at_<term id>` meta, '' when never set)
//     Colvy reads only that field, through the store's existing API key, and
//     only when every product it sees carries it in exactly that shape.
//
// Per-store answers are opt-in: they start once the owner saves the store
// mapping (Shopify location / WooCommerce stock location → Colvy outlet, table
// outlet_stock_locations, V401). With no mapping saved, one visible location,
// missing Shopify permissions or no plugin, every output is exactly what it
// was before.

export type StockProvider = 'shopify' | 'woocommerce'
export const STOCK_PROVIDERS: StockProvider[] = ['shopify', 'woocommerce']

export type Outlet = {
  id: string
  label?: string | null
  suburb?: string | null
  street_address?: string | null
  postcode?: string | null
  state?: string | null
}

/** A place the store keeps stock (a Shopify location, a WooCommerce stock location). */
export type ExternalLocation = {
  id: string
  name: string
  address1?: string | null
  city?: string | null
  province?: string | null
  zip?: string | null
}

/** One saved mapping row (outlet_stock_locations). */
export type MappingRow = {
  external_location_id: string
  location_name?: string | null
  outlet_id: string | null
  hidden?: boolean | null
}

/** One location's stock for one product or option. available null = not counted there. */
export type LevelRow = { locationId: string; locationName: string; available: number | null }

/** What the AI and the inbox see for one store. */
export type StoreStock = { store: string; available: number }

// ── Shopify ──────────────────────────────────────────────────────────────────

export const SHOPIFY_STOCK_SCOPES = ['read_inventory', 'read_locations']

/** Scopes this connection is known to lack (empty when it has them, or nothing was recorded). */
export function shopifyScopesMissing(integ: { scopes?: string | null } | null | undefined): string[] {
  const have = String(integ?.scopes || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!have.length) return []
  // write_inventory implies read_inventory.
  return SHOPIFY_STOCK_SCOPES.filter(s => !have.includes(s) && !(s === 'read_inventory' && have.includes('write_inventory')))
}

/** A GraphQL errors array that says the app isn't allowed to read locations / inventory. */
export function shopifyAccessDenied(errors: any[] | null | undefined): boolean {
  return (errors || []).some((e: any) => e?.extensions?.code === 'ACCESS_DENIED'
    || /access denied|read_locations|read_inventory|requires? .*scope|not approved/i.test(String(e?.message || '')))
}

const fin = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const LOCATIONS_QUERY = `{ locations(first: 50) { nodes { id name isActive address { address1 city province zip } } } }`

/** `locations` query → active locations. */
export function parseShopifyLocations(data: any): ExternalLocation[] {
  const nodes: any[] = Array.isArray(data?.locations?.nodes) ? data.locations.nodes : []
  return nodes
    .filter(n => n && typeof n.id === 'string' && n.id && typeof n.name === 'string' && n.isActive !== false)
    .map(n => ({ id: n.id, name: n.name.trim() || n.id, address1: n.address?.address1 || null, city: n.address?.city || null, province: n.address?.province || null, zip: n.address?.zip || null }))
}

/** How many products / variants / levels one live query asks for, under Shopify's 1000-point limit. */
export function shopifyQueryShape(products: number, knownLocations: number) {
  const levels = Math.min(Math.max(knownLocations + 2, 5), 15)
  const variants = Math.min(Math.max(Math.floor(900 / Math.max(1, products) / (levels + 1)), 5), 20)
  return { levels, variants }
}

export function shopifyStockQuery(withLevels: boolean, variants: number, levels: number): string {
  const lv = withLevels
    ? ` inventoryLevels(first: ${levels}) { pageInfo { hasNextPage } nodes { location { id name } quantities(names: ["available"]) { name quantity } } }`
    : ''
  return `query StoreStock($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id legacyResourceId title status tracksInventory totalInventory hasOnlyDefaultVariant
      priceRangeV2 { minVariantPrice { amount } }
      variants(first: ${variants}) {
        pageInfo { hasNextPage }
        nodes { id legacyResourceId title sku price availableForSale inventoryQuantity inventoryItem { tracked${lv} } }
      }
    }
  }
}`
}

export type ShopifyLiveVariant = {
  id: number; title: string; sku: string; price: number | null; available: boolean
  qty: number | null; tracked: boolean
  /** Per-location stock; null when not asked for, not tracked, or incomplete. */
  levels: LevelRow[] | null
}
export type ShopifyLiveProduct = {
  id: number; title: string; status: string | null; tracksInventory: boolean; totalInventory: number | null
  hasOnlyDefaultVariant: boolean; price: number | null; variants: ShopifyLiveVariant[]; moreVariants: boolean
}

const legacy = (v: any, gid: any): number | null => {
  const n = Number(v); if (Number.isFinite(n) && n > 0) return n
  const m = String(gid ?? '').match(/(\d+)$/); return m ? Number(m[1]) : null
}
const numOrNull = (v: any): number | null => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }

/** One variant's per-location "available" quantities, or null (untracked / incomplete / malformed). */
export function shopifyVariantLevels(v: any): LevelRow[] | null {
  const item = v?.inventoryItem
  if (!item || item.tracked === false) return null
  const conn = item.inventoryLevels
  if (!conn || !Array.isArray(conn.nodes)) return null
  if (conn.pageInfo?.hasNextPage) return null          // more locations than asked for: no partial answers
  const out: LevelRow[] = []
  for (const n of conn.nodes) {
    const loc = n?.location
    if (!loc || typeof loc.id !== 'string') return null
    const q = (Array.isArray(n.quantities) ? n.quantities : []).find((x: any) => x?.name === 'available')
    const qty = fin(q?.quantity)
    if (qty == null) return null
    out.push({ locationId: loc.id, locationName: String(loc.name || '').trim() || loc.id, available: qty })
  }
  return out
}

/** `nodes(ids:)` StoreStock query → products. Levels only where the query asked for them. */
export function parseShopifyStock(data: any): ShopifyLiveProduct[] {
  const nodes: any[] = Array.isArray(data?.nodes) ? data.nodes : []
  const out: ShopifyLiveProduct[] = []
  for (const p of nodes) {
    if (!p || !p.id || !String(p.id).includes('/Product/')) continue
    const id = legacy(p.legacyResourceId, p.id)
    if (!id) continue
    const vs: any[] = Array.isArray(p.variants?.nodes) ? p.variants.nodes : []
    out.push({
      id, title: String(p.title || ''), status: p.status || null,
      tracksInventory: !!p.tracksInventory, totalInventory: fin(p.totalInventory),
      hasOnlyDefaultVariant: !!p.hasOnlyDefaultVariant,
      price: numOrNull(p.priceRangeV2?.minVariantPrice?.amount),
      moreVariants: !!p.variants?.pageInfo?.hasNextPage,
      variants: vs.map(v => ({
        id: legacy(v?.legacyResourceId, v?.id) || 0,
        title: String(v?.title || ''), sku: String(v?.sku || ''), price: numOrNull(v?.price),
        available: v?.availableForSale !== false, qty: fin(v?.inventoryQuantity),
        tracked: v?.inventoryItem?.tracked !== false,
        levels: v?.inventoryItem && 'inventoryLevels' in v.inventoryItem ? shopifyVariantLevels(v) : null,
      })).filter(v => v.id),
    })
  }
  return out
}

/**
 * A product's stock at each location: the sum over its variants. Null unless
 * every variant is tracked, has complete levels, and none were left unfetched.
 */
export function productLevels(p: ShopifyLiveProduct): LevelRow[] | null {
  if (!p.variants.length || p.moreVariants) return null
  const by = new Map<string, LevelRow>()
  for (const v of p.variants) {
    if (!v.tracked || !v.levels) return null
    for (const l of v.levels) {
      const cur = by.get(l.locationId)
      if (cur) cur.available = (cur.available || 0) + (l.available || 0)
      else by.set(l.locationId, { ...l })
    }
  }
  return Array.from(by.values())
}

// ── WooCommerce: Stock Locations for WooCommerce ─────────────────────────────

/**
 * The plugin's REST `locations` field → levels, or null when it isn't that
 * field (absent, or any entry not shaped { id: positive integer, name: text,
 * quantity: number | numeric text | '' | null }). '' / null = no stock entered
 * for that location: counted as none there.
 */
export function parseSlwLocations(field: any): LevelRow[] | null {
  if (!Array.isArray(field)) return null
  const out: LevelRow[] = []
  for (const e of field) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null
    const id = typeof e.id === 'number' ? e.id : /^\d+$/.test(String(e.id ?? '')) ? Number(e.id) : NaN
    if (!Number.isInteger(id) || id <= 0) return null
    if (typeof e.name !== 'string' || !e.name.trim()) return null
    if (!('quantity' in e)) return null
    const q = e.quantity
    let available: number | null
    if (q === '' || q == null || q === false) available = null
    else if (typeof q === 'number' && Number.isFinite(q)) available = q
    else if (typeof q === 'string' && /^-?\d+(\.\d+)?$/.test(q.trim())) available = Number(q.trim())
    else return null
    out.push({ locationId: String(id), locationName: e.name.trim(), available })
  }
  return out
}

/**
 * Is the plugin answering on this store? Every product returned must carry a
 * well-formed `locations` field. One product without it (another plugin's
 * field of the same name, a cache in front of the store…) and the answer is no.
 */
export function detectSlw(products: any[] | null | undefined): boolean {
  const list = Array.isArray(products) ? products.filter(p => p && typeof p === 'object') : []
  if (!list.length) return false
  return list.every(p => 'locations' in p && parseSlwLocations(p.locations) !== null)
}

/** The plugin's location terms (wp/v2/location) → locations. */
export function parseSlwTerms(terms: any): ExternalLocation[] {
  if (!Array.isArray(terms)) return []
  return terms
    .filter(t => t && Number.isInteger(Number(t.id)) && Number(t.id) > 0 && typeof t.name === 'string' && t.name.trim())
    .map(t => ({ id: String(Number(t.id)), name: decodeEntities(t.name.trim()) }))
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Locations seen across products' fields (when the terms endpoint isn't reachable). */
export function slwLocationsFromProducts(products: any[]): ExternalLocation[] {
  const seen = new Map<string, ExternalLocation>()
  for (const p of products || []) for (const l of parseSlwLocations(p?.locations) || []) if (!seen.has(l.locationId)) seen.set(l.locationId, { id: l.locationId, name: decodeEntities(l.locationName) })
  return Array.from(seen.values())
}

// ── Mapping a location to an outlet ──────────────────────────────────────────

const GENERIC = new Set(['the', 'and', 'store', 'shop', 'outlet', 'location', 'branch', 'pty', 'ltd', 'main', 'retail', 'au', 'australia', 'st', 'street', 'rd', 'road', 'ave', 'avenue', 'shopping', 'centre', 'center', 'unit', 'shop', 'level', 'default'])
const norm = (s: any) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const wordsOf = (s: any) => norm(s).split(' ').filter(w => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w))

/** Words every entry shares (the business's own name, usually): they say nothing about which store. */
function sharedWords(texts: string[]): Set<string> {
  if (texts.length < 2) return new Set()
  const sets = texts.map(t => new Set(wordsOf(t)))
  return new Set(Array.from(sets[0]).filter(w => sets.every(s => s.has(w))))
}

/** How well a location matches an outlet (0 = not at all). */
export function matchScore(loc: ExternalLocation, o: Outlet, ignore: Set<string> = new Set()): number {
  let s = 0
  const lname = norm(loc.name)
  const label = norm(o.label)
  if (label && lname && label === lname) s += 5
  const lw = new Set(wordsOf(`${loc.name} ${loc.city || ''}`).filter(w => !ignore.has(w)))
  const ow = new Set(wordsOf(`${o.label || ''} ${o.suburb || ''}`).filter(w => !ignore.has(w)))
  const common = Array.from(ow).filter(w => lw.has(w))
  s += common.length * 2
  const suburb = norm(o.suburb)
  if (suburb && (norm(loc.city) === suburb || ` ${lname} `.includes(` ${suburb} `))) s += 2
  const zip = String(loc.zip || '').trim(), pc = String(o.postcode || '').trim()
  if (zip && pc && zip === pc) s += 2
  const a1 = norm(loc.address1), st = norm(o.street_address)
  if (a1 && st && (a1 === st || a1.startsWith(st) || st.startsWith(a1))) s += 3
  return s
}

const SUGGEST_MIN = 3

/**
 * A suggested outlet for each location (or null): best matches first, each
 * outlet used once, and only a clear match (score ≥ 3, no tie for the best).
 */
export function suggestMapping(locations: ExternalLocation[], outlets: Outlet[]): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const l of locations) out[l.id] = null
  if (!locations.length || !outlets.length) return out
  const ignore = new Set([
    ...Array.from(sharedWords(outlets.map(o => `${o.label || ''}`))),
    ...Array.from(sharedWords(locations.map(l => l.name))),
  ])
  const pairs: { l: string; o: string; s: number }[] = []
  for (const l of locations) {
    const scores = outlets.map(o => ({ o: o.id, s: matchScore(l, o, ignore) })).sort((a, b) => b.s - a.s)
    // A tie for this location's best: not a clear match.
    if (!scores[0] || scores[0].s < SUGGEST_MIN || (scores[1] && scores[1].s === scores[0].s)) continue
    for (const x of scores) if (x.s >= SUGGEST_MIN) pairs.push({ l: l.id, o: x.o, s: x.s })
  }
  pairs.sort((a, b) => b.s - a.s)
  const usedO = new Set<string>()
  for (const p of pairs) {
    if (out[p.l] || usedO.has(p.o)) continue
    out[p.l] = p.o; usedO.add(p.o)
  }
  return out
}

export const outletName = (o: Outlet | null | undefined) => String(o?.label || o?.suburb || '').trim() || 'Store'

// ── From levels to stores ────────────────────────────────────────────────────

type StoreMeta = { key: string; store: string; outletId: string | null; aliases: string[] }

/**
 * Which stores a business's stock is answered for, from its saved mapping.
 * Null = per-store answers are off (nothing saved, or fewer than two stores
 * to tell apart).
 */
export type StoreIndex = {
  /** location id → the store it counts towards (null = hidden). */
  byLocation: Map<string, StoreMeta | null>
  /** Every visible store, in display order. */
  stores: StoreMeta[]
}

export function buildStoreIndex(rows: MappingRow[] | null | undefined, outlets: Outlet[]): StoreIndex | null {
  if (!rows?.length) return null
  const byOutlet = new Map(outlets.map(o => [o.id, o]))
  const byLocation = new Map<string, StoreMeta | null>()
  const stores = new Map<string, StoreMeta>()
  for (const r of rows) {
    const lid = String(r.external_location_id || '')
    if (!lid) continue
    if (r.hidden) { byLocation.set(lid, null); continue }
    const o = r.outlet_id ? byOutlet.get(r.outlet_id) : null
    const key = o ? `outlet:${o.id}` : `loc:${lid}`
    let meta = stores.get(key)
    if (!meta) {
      const store = o ? outletName(o) : (String(r.location_name || '').trim() || 'Store')
      meta = { key, store, outletId: o?.id || null, aliases: [store, o?.label, o?.suburb, r.location_name].filter(Boolean).map(String) }
      stores.set(key, meta)
    } else if (r.location_name) meta.aliases.push(String(r.location_name))
    byLocation.set(lid, meta)
  }
  const list = Array.from(stores.values())
  if (list.length < 2) return null
  return { byLocation, stores: list }
}

/**
 * Levels → stock per visible store. A location nobody mapped (new since the
 * mapping was saved) shows by its own name; a hidden one doesn't count; a
 * mapped store with no level for this item has none of it. Null when the
 * levels are unknown.
 */
export function storesFromLevels(levels: LevelRow[] | null | undefined, index: StoreIndex | null): StoreStock[] | null {
  if (!levels || !index) return null
  const totals = new Map<string, { meta: StoreMeta; n: number }>()
  for (const m of index.stores) totals.set(m.key, { meta: m, n: 0 })
  for (const l of levels) {
    let meta = index.byLocation.get(l.locationId)
    if (meta === null) continue                       // hidden
    if (meta === undefined) {
      const key = `loc:${l.locationId}`
      meta = totals.get(key)?.meta || { key, store: l.locationName || 'Store', outletId: null, aliases: [l.locationName] }
    }
    const t = totals.get(meta.key) || { meta, n: 0 }
    t.n += Math.max(0, Math.trunc(l.available || 0))  // oversold (negative) counts as none
    totals.set(meta.key, t)
  }
  const out = Array.from(totals.values()).map(t => ({ store: t.meta.store, available: t.n }))
  return out.length >= 2 ? out : null
}

/** The store a customer named ("the Richmond one", "fitzroy"), or null. */
export function matchStore(asked: any, index: StoreIndex | null): string | null {
  const a = ` ${norm(asked)} `
  if (!index || a.trim() === '') return null
  const ignore = sharedWords(index.stores.map(s => s.store))
  let best: { store: string; len: number } | null = null
  for (const s of index.stores) {
    for (const alias of s.aliases) {
      const n = norm(alias)
      if (!n) continue
      // The whole name, or one of its distinctive words, as a word in what they said.
      const hit = a.includes(` ${n} `) ? n.length + 100
        : Math.max(0, ...wordsOf(alias).filter(w => !ignore.has(w) && w.length >= 4 && a.includes(` ${w} `)).map(w => w.length))
      if (hit && (!best || hit > best.len)) best = { store: s.store, len: hit }
    }
  }
  return best?.store || null
}

/** The display name of the store an outlet id counts as, if it's one of the stores. */
export function storeForOutlet(outletId: string | null | undefined, index: StoreIndex | null): string | null {
  if (!outletId || !index) return null
  return index.stores.find(s => s.outletId === outletId)?.store || null
}

/** "3 at Richmond, none at Fitzroy" — for staff-facing summaries. */
export function storesText(stores: StoreStock[] | null | undefined): string {
  return (stores || []).map(s => `${s.available > 0 ? s.available : 'none'} at ${s.store}`).join(', ')
}

export const STORE_STOCK_NOTE = 'Live stock at each store (available = units there now). When the customer names a store or suburb, or askedStore / conversationStore is set, answer for that store and mention where else it is, e.g. “We have 3 at Richmond and none at Fitzroy.” Only name stores listed here; for a store that isn’t listed, say you can’t see that store’s stock.'

/**
 * Add per-store stock to a check_stock result, in place of nothing: products
 * and options get `stores` where known, and the result gets `storeStock`. With
 * no stores anywhere the result is returned untouched.
 */
export function withStoreStock<T extends { products: any[] }>(
  result: T,
  stock: { byProduct: Record<string, StoreStock[] | null>; byOption?: Record<string, StoreStock[] | null> },
  ctx: { index: StoreIndex | null; asked?: string | null; contextOutletId?: string | null },
): T {
  if (!ctx.index) return result
  let any = false
  const products = result.products.map((p: any) => {
    const st = p?.productId != null ? stock.byProduct[String(p.productId)] : null
    const opts = Array.isArray(p?.options) ? p.options.map((o: any) => {
      const os = o?.productId != null ? stock.byOption?.[String(o.productId)] : null
      if (os) { any = true; return { ...o, stores: os } }
      return o
    }) : p?.options
    if (st) any = true
    return { ...p, ...(st ? { stores: st } : {}), ...(opts !== p?.options ? { options: opts } : {}) }
  })
  if (!any) return result
  const askedText = String(ctx.asked || '').trim()
  const askedStore = askedText ? matchStore(askedText, ctx.index) : null
  const conversationStore = storeForOutlet(ctx.contextOutletId, ctx.index)
  return {
    ...result,
    products,
    storeStock: {
      note: STORE_STOCK_NOTE,
      stores: ctx.index.stores.map(s => s.store),
      ...(askedText ? (askedStore ? { askedStore } : { askedStore: null, askedStoreNote: `“${askedText.slice(0, 60)}” isn’t one of the stores listed; say which stores you can see.` }) : {}),
      ...(conversationStore ? { conversationStore } : {}),
    },
  }
}
