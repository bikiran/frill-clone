'use client'

// Order history for the Insights pages (Customer Insights, Location Insights).
//
// 1. The last result for this workspace is shown straight away from this
//    browser's cache (stale-while-revalidate), so a return visit is instant.
// 2. Fresh data comes from Colvy's own synced copy of the store's orders
//    (/api/insights/orders, a quick database read).
// 3. Only when nothing is synced yet does it fall back to pulling orders live
//    from the store (/api/orders/all), which is slow.

import { authFetch } from '@/lib/auth-fetch'

const KEY = () => `insights_orders_v2:${typeof window !== 'undefined' ? window.location.hostname : ''}`

export type InsightsLoad = { orders: any[]; stale: boolean; diag?: any }

export async function loadInsightsOrders(onData: (r: InsightsLoad) => void): Promise<void> {
  let shownCached = false
  try {
    const raw = localStorage.getItem(KEY())
    if (raw) {
      const c = JSON.parse(raw)
      if (Array.isArray(c.orders) && c.orders.length) { onData({ orders: c.orders, stale: true }); shownCached = true }
    }
  } catch {}

  const save = (orders: any[]) => { try { localStorage.setItem(KEY(), JSON.stringify({ t: Date.now(), orders })) } catch {} }

  let diag: any = {}
  try {
    const res = await authFetch('/api/insights/orders')
    const j = await res.json().catch(() => ({}))
    diag = { synced: { httpStatus: res.status, count: j?.count ?? 0, source: j?.source, ...(j?.debug ? { debug: j.debug } : {}) } }
    if (res.ok && Array.isArray(j.orders) && j.orders.length) { save(j.orders); onData({ orders: j.orders, stale: false, diag }); return }
  } catch (e: any) { diag = { syncedError: String(e?.message || e) } }

  // Nothing synced yet: ask the store directly.
  try {
    const res = await authFetch('/api/orders/all')
    const j = await res.json().catch(() => ({}))
    const { orders: _o, ...rest } = j || {}
    diag = { ...diag, httpOk: res.ok, httpStatus: res.status, ...rest }
    const orders = Array.isArray(j.orders) ? j.orders : []
    if (orders.length) save(orders)
    if (orders.length || !shownCached) onData({ orders, stale: false, diag })
  } catch (e: any) {
    if (!shownCached) onData({ orders: [], stale: false, diag: { ...diag, clientError: String(e?.message || e) } })
  }
}
