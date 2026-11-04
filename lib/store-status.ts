'use client'

// Is an online store connected to this workspace? The e-commerce tools
// (product search, back-in-stock waitlists, abandoned carts, creating an
// order, coupons, DOA claims, shipping, order automation) only make sense with
// one, so they show only then.
//
//   store   WooCommerce or Shopify is connected (active).
//   orders  there are orders to show: a store, or Prexty (in-store sales).
//
// Members can read these tables' non-secret columns (id, is_active), so the
// answer is the same for everyone in the workspace. The last answer is kept in
// this browser so pages don't flash tools in and out while it's checked again,
// and when it can't be told (first visit, a failed read) everything shows, as
// before, so a real store never loses its tools to a hiccup.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { readStored, writeStored } from '@/lib/client-cache'

export type StoreStatus = { store: boolean; orders: boolean; known: boolean }

const ALL: StoreStatus = { store: true, orders: true, known: false }
const key = (cid: string) => `store-status:${cid}`
const inflight = new Map<string, Promise<StoreStatus | null>>()

async function load(cid: string): Promise<StoreStatus | null> {
  const sb = supabase as any
  // true / false, or null when the read failed (so it can't be told).
  const any = (table: string) => sb.from(table).select('id').eq('company_id', cid).eq('is_active', true).limit(1)
    .then((r: any) => (r?.error ? null : (r?.data?.length || 0) > 0), () => null)
  const [woo, shopify, prexty] = await Promise.all([any('woocommerce_integrations'), any('shopify_integrations'), any('prexty_integrations')])
  if (woo === null && shopify === null) return null
  const store = woo === true || shopify === true
  return { store, orders: store || prexty === true, known: true }
}

/** Check (again) for this workspace; concurrent callers share one check. */
export function resolveStoreStatus(cid: string): Promise<StoreStatus | null> {
  const running = inflight.get(cid)
  if (running) return running
  const p = load(cid)
    .then(s => { if (s) writeStored(key(cid), s); return s })
    .catch(() => null)
    .finally(() => { inflight.delete(cid) })
  inflight.set(cid, p)
  return p
}

/** The last known answer for this workspace, without checking. */
export function peekStoreStatus(cid: string | null | undefined): StoreStatus | null {
  return cid ? (readStored<StoreStatus>(key(cid)) || null) : null
}

/**
 * Whether this workspace has a store (and orders). Shows everything until it
 * knows otherwise; checks again each time a page using it opens, so connecting
 * or disconnecting a store shows up on the next page.
 */
export function useStoreStatus(cid: string | null | undefined): StoreStatus {
  const [s, setS] = useState<StoreStatus | null>(null)
  useEffect(() => {
    if (!cid) { setS(null); return }
    setS(peekStoreStatus(cid))
    let live = true
    resolveStoreStatus(cid).then(v => { if (live && v) setS(v) })
    return () => { live = false }
  }, [cid])
  return s || ALL
}

// Pages that only make sense with a store, and those that need orders.
const STORE_PAGES = ['/admin/waitlists', '/admin/orders/shipping', '/admin/crm-settings/order-automation']
const ORDER_PAGES = ['/admin/orders']
const under = (path: string, roots: string[]) => roots.some(r => path === r || path.startsWith(r + '/'))

/** May this admin page show in the menus, given the store status? */
export function storeAllowsPage(href: string, s: StoreStatus): boolean {
  const path = href.split(/[?#]/)[0]
  if (!s.store && under(path, STORE_PAGES)) return false
  if (!s.orders && under(path, ORDER_PAGES)) return false
  return true
}
