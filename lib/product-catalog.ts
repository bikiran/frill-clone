'use client'

// The store catalogue on the device, shared by every product search on the web
// (checklist "Add products", Create Order). Like the mobile app: the synced
// catalogue loads once and is matched as you type, with no round trip per
// keystroke; the server search is only the fallback before a store has synced.

import { authFetch } from '@/lib/auth-fetch'

export type CatalogProduct = {
  id: any; name: string; sku?: string; price?: string; image?: string | null
  stock_status?: string; stock_quantity?: number | null
  type?: string; has_variations?: boolean; skus?: string
}
export type Variation = {
  id: any; sku?: string; price?: string; image?: string | null
  stock_status?: string; stock_quantity?: number | null; attributes?: string
}

// Prices arrive as strings like "16.9500"; always show two decimals.
export const fmtPrice = (v: any) => {
  const n = Number(v)
  return v === '' || v == null || !Number.isFinite(n) ? '' : `$${n.toFixed(2)}`
}

export const isVariable = (p: CatalogProduct) => !!p.has_variations || p.type === 'variable'

const qs = (companyId: string, integrationId?: string | null) =>
  `companyId=${encodeURIComponent(companyId)}${integrationId ? `&integrationId=${encodeURIComponent(integrationId)}` : ''}`

const TTL = 5 * 60 * 1000
const catalogs = new Map<string, { at: number; products: CatalogProduct[] }>()
const inflight = new Map<string, Promise<CatalogProduct[]>>()
const variationCache = new Map<string, Variation[]>()

// The whole synced catalogue ([] when nothing is synced yet).
export function loadCatalog(companyId: string, integrationId?: string | null): Promise<CatalogProduct[]> {
  const key = `${companyId}:${integrationId || ''}`
  const hit = catalogs.get(key)
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.products)
  if (inflight.has(key)) return inflight.get(key)!
  const p = (async () => {
    try {
      const res = await authFetch(`/api/orders/products?${qs(companyId, integrationId)}&catalog=1`)
      const d = await res.json().catch(() => ({}))
      const products: CatalogProduct[] = res.ok && Array.isArray(d.products) ? d.products : []
      if (products.length) catalogs.set(key, { at: Date.now(), products })
      return products
    } catch { return [] } finally { inflight.delete(key) }
  })()
  inflight.set(key, p)
  return p
}

// Server search, for before the catalogue is synced.
export async function searchServer(companyId: string, query: string, integrationId?: string | null): Promise<CatalogProduct[]> {
  const res = await authFetch(`/api/orders/products?${qs(companyId, integrationId)}&q=${encodeURIComponent(query)}`)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d?.error || 'Search failed')
  return d.products || []
}

export async function loadVariations(companyId: string, productId: any, integrationId?: string | null): Promise<Variation[]> {
  const key = `${companyId}:${integrationId || ''}:${productId}`
  if (variationCache.has(key)) return variationCache.get(key)!
  const res = await authFetch(`/api/orders/products?${qs(companyId, integrationId)}&productId=${encodeURIComponent(String(productId))}`)
  const d = await res.json().catch(() => ({}))
  const list: Variation[] = Array.isArray(d.variations) ? d.variations : []
  if (res.ok) variationCache.set(key, list)
  return list
}

// Same ranking as the server: exact SKU, then name starts with what you typed,
// then contains it, then every word present. Every word must match somewhere
// (a partial last word counts), so "cardinal t" finds "Cardinal Tetra".
export function searchCatalog(rows: CatalogProduct[], query: string, limit = 40): CatalogProduct[] {
  const ql = query.toLowerCase().trim()
  const terms = ql.split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const out: { p: CatalogProduct; s: number; i: number }[] = []
  rows.forEach((p, i) => {
    const name = String(p.name || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    const skus = String(p.skus || '').toLowerCase().split(/\s+/).filter(Boolean)
    const hay = `${name} ${sku} ${skus.join(' ')}`
    if (!terms.every(t => hay.includes(t))) return
    let s = 6
    if (sku === ql || skus.includes(ql)) s = 0
    else if (name === ql) s = 1
    else if (name.startsWith(ql)) s = 2
    else if (name.includes(ql)) s = 3
    else if (sku.startsWith(ql) || skus.some(x => x.startsWith(ql))) s = 4
    else if (terms.every(t => name.split(/[^a-z0-9]+/).some(w => w.startsWith(t)))) s = 5
    out.push({ p, s, i })
  })
  return out.sort((a, b) => (a.s - b.s) || (a.i - b.i)).slice(0, limit).map(x => x.p)
}

export const stockLabel = (p: { stock_status?: string }) => p.stock_status === 'outofstock' ? 'Out of stock' : p.stock_status === 'onbackorder' ? 'On backorder' : 'In stock'
export const stockColor = (p: { stock_status?: string }) => p.stock_status === 'outofstock' ? '#b91c1c' : p.stock_status === 'onbackorder' ? '#b45309' : '#059669'
