// Live stock + price for waitlisted VARIATIONS (server only).
//
// Website sign-ups store the variation id (e.g. the 4-5cm size), but the synced
// catalogue (woocommerce_products) only holds parent products, so a variation
// had no price and no stock to show. For those ids:
//   1. find the parent whose variation_ids lists it
//   2. ask WooCommerce for those variations — one request per parent
//   3. if the store doesn't answer, fall back to the parent's price, marked
//      `approx` (a variable product's price is its cheapest size)
// Results are cached per warm server instance for 10 minutes. With
// `live: false` step 2 is skipped (cache hits still count), so a page can paint
// from the database straight away and ask for live sizes in a second request.

export type ItemStock = {
  stock_status: string | null
  stock_quantity: number | null
  permalink?: string | null
  price: number | null
  regular_price: number | null
  on_sale: boolean
  approx?: boolean
  parent_id?: number
}

export const priceNum = (v: any): number | null => {
  const n = parseFloat(String(v ?? ''))
  return isFinite(n) && n > 0 ? n : null
}

/** Active price, regular price and sale flag from a WooCommerce product/variation row. */
export function pricing(p: any): Pick<ItemStock, 'price' | 'regular_price' | 'on_sale'> {
  const price = priceNum(p?.price) ?? (p?.on_sale ? priceNum(p?.sale_price) : null) ?? priceNum(p?.regular_price)
  const regular = priceNum(p?.regular_price)
  return { price, regular_price: regular, on_sale: !!p?.on_sale && price != null && regular != null && price < regular }
}

export { waitlistItemKey } from '@/lib/waitlist-keys'

/** Stock + price for a Shopify variant (or the whole product, for "any option"). */
export function shopifyItemStock(p: any, variantId: number | null): ItemStock {
  const v = variantId ? (p.variants || []).find((x: any) => Number(x.id) === variantId) : null
  if (v) {
    const price = priceNum(v.price), cmp = priceNum(v.compare_at_price)
    const onSale = price != null && cmp != null && cmp > price
    const base = p.permalink || null
    return {
      stock_status: v.available ? 'instock' : 'outofstock',
      stock_quantity: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
      permalink: base && p.has_variations ? `${base}${base.includes('?') ? '&' : '?'}variant=${v.id}` : base,
      price, regular_price: onSale ? cmp : price, on_sale: onSale,
    }
  }
  const price = priceNum(p.price), cmp = priceNum(p.compare_at_price)
  const onSale = price != null && cmp != null && cmp > price
  return { stock_status: p.stock_status || null, stock_quantity: p.stock_quantity ?? null, permalink: p.permalink || null, price, regular_price: onSale ? cmp : price, on_sale: onSale }
}

const TTL = 10 * 60_000
const cache = new Map<string, { at: number; v: ItemStock }>()

export async function variationStock(db: any, companyId: string, ids: number[], opts: { fetchImpl?: typeof fetch; timeoutMs?: number; live?: boolean } = {}): Promise<Record<string, ItemStock>> {
  const out: Record<string, ItemStock> = {}
  const doFetch = opts.fetchImpl || fetch
  const now = Date.now()
  const todo: number[] = []
  for (const id of ids) {
    const hit = cache.get(`${companyId}:${id}`)
    if (hit && now - hit.at < TTL) out[String(id)] = hit.v
    else todo.push(id)
  }
  if (!todo.length) return out

  // 1. Parents that list these variations.
  const cols = 'woo_product_id, price, regular_price, sale_price, on_sale, permalink, variation_ids'
  let parents: any[] = []
  try {
    const { data, error } = await db.from('woocommerce_products').select(cols)
      .eq('company_id', companyId)
      .or(todo.slice(0, 100).map(id => `variation_ids.cs.[${id}]`).join(','))
    if (error) {
      // Filter not accepted — scan the variable products instead.
      const { data: all } = await db.from('woocommerce_products').select(cols)
        .eq('company_id', companyId).eq('type', 'variable').limit(5000)
      parents = all || []
    } else parents = data || []
  } catch { return out }
  const parentOf = new Map<number, any>()
  for (const p of parents) {
    for (const v of Array.isArray(p.variation_ids) ? p.variation_ids : []) {
      const vid = Number(v)
      if (todo.includes(vid) && !parentOf.has(vid)) parentOf.set(vid, p)
    }
  }
  if (!parentOf.size) return out

  // 2. Live variation data from the store, one request per parent.
  const live = new Map<number, any>()
  if (opts.live !== false) try {
    const { data: integ } = await db.from('woocommerce_integrations')
      .select('store_url, consumer_key, consumer_secret')
      .eq('company_id', companyId).eq('is_active', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (integ?.store_url && integ.consumer_key) {
      const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`
      const byParent = new Map<number, number[]>()
      for (const [vid, p] of Array.from(parentOf.entries())) byParent.set(p.woo_product_id, [...(byParent.get(p.woo_product_id) || []), vid])
      await Promise.all(Array.from(byParent.entries()).slice(0, 25).map(async ([pid, vids]) => {
        try {
          const url = `${String(integ.store_url).replace(/\/$/, '')}/wp-json/wc/v3/products/${pid}/variations?include=${vids.join(',')}&per_page=100`
          const res = await doFetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) })
          if (!res.ok) return
          const list = await res.json()
          for (const v of Array.isArray(list) ? list : []) live.set(Number(v.id), v)
        } catch { /* this parent falls back below */ }
      }))
    }
  } catch { /* no store connection — fall back to parent prices */ }

  // 3. Merge: live variation first, parent price as an estimate otherwise.
  for (const [vid, p] of Array.from(parentOf.entries())) {
    const v = live.get(vid)
    const row: ItemStock = v
      ? { ...pricing(v), stock_status: v.stock_status ?? null, stock_quantity: v.stock_quantity ?? null, permalink: v.permalink || p.permalink || null, parent_id: p.woo_product_id }
      : { ...pricing(p), stock_status: null, stock_quantity: null, permalink: p.permalink || null, approx: true, parent_id: p.woo_product_id }
    out[String(vid)] = row
    if (v) cache.set(`${companyId}:${vid}`, { at: now, v: row })
  }
  return out
}
