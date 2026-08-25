'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { orderAge } from '@/lib/orders'

/**
 * Out of Stock List — every order line staff flagged as out of stock, grouped
 * by order so you can see the customer, order number and what they're waiting
 * on at a glance.
 *
 * A flag is "done" when it's been resolved by hand OR its order has shipped /
 * been cancelled — the list reads each referenced order's live status, so a
 * fulfilled order clears itself without anyone touching the flag. Done rows
 * render struck through and are hidden by default (a filter reveals them).
 */

type Alert = {
  id: string
  order_id: string
  order_number: string | null
  order_date: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  store_location_id: string | null
  line_key: string
  product_name: string | null
  sku: string | null
  image_url: string | null
  quantity: number | null
  status: string
  resolved_at: string | null
  created_at: string
}

const TERMINAL = new Set(['shipped', 'cancelled'])

export default function OutOfStockModal({
  companyId, accent, locations = [], onClose, onOpenOrder,
}: {
  companyId: string
  accent?: string
  locations?: { id: string; name: string }[]
  onClose: () => void
  onOpenOrder?: (orderId: string) => void
}) {
  const ACCENT = accent || 'var(--coral)'
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [orderStatus, setOrderStatus] = useState<Record<string, string>>({})
  // The order's CURRENT outlet, read live — the alert's own store_location_id is
  // a snapshot taken when the line was flagged and can be null (older alerts
  // saved before the outlet was set, or via the minimal fallback that omitted
  // it) or stale (outlet reassigned after flagging). Filtering on the live value
  // is what makes the outlet filter actually match.
  const [orderLoc, setOrderLoc] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [locFilter, setLocFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'oldest' | 'newest' | 'customer'>('oldest')

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('order_stock_alerts').select('*').eq('company_id', companyId)
        .order('created_at', { ascending: true }).limit(1000)
      const rows: Alert[] = data || []
      setAlerts(rows)
      // Read each referenced order's live status so a shipped order clears the list.
      const ids = Array.from(new Set(rows.map(r => r.order_id)))
      if (ids.length) {
        const { data: ords } = await (supabase as any).from('orders').select('id, status, store_location_id').in('id', ids)
        const m: Record<string, string> = {}
        const loc: Record<string, string | null> = {}
        for (const o of ords || []) { m[o.id] = o.status; loc[o.id] = o.store_location_id || null }
        setOrderStatus(m); setOrderLoc(loc)
      } else { setOrderStatus({}); setOrderLoc({}) }
      // The list is ready — show it now. Product-image backfill (a live
      // WooCommerce lookup) runs AFTER, in the background, so it never blocks the
      // modal opening. Thumbnails pop in as they resolve.
      setLoading(false)
      backfillImages(rows)
      return
    } catch { setAlerts([]) }
    setLoading(false)
  }, [companyId])

  // Resolve any missing product thumbnails by SKU from WooCommerce, show them,
  // and cache them onto the alert rows so we don't look them up again. Fully
  // background — never awaited by load(), so it can't slow the modal.
  const backfillImages = useCallback(async (rows: Alert[]) => {
    const needSkus = Array.from(new Set(rows.filter(r => !r.image_url && r.sku).map(r => r.sku as string)))
    if (!needSkus.length || !companyId) return
    try {
      const res = await fetch('/api/orders/product-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, skus: needSkus }),
      })
      const { images } = await res.json()
      if (!images || !Object.keys(images).length) return
      setAlerts(prev => prev.map(a => (!a.image_url && a.sku && images[a.sku]) ? { ...a, image_url: images[a.sku] } : a))
      // Persist in parallel, best-effort, so the cache is warm next time.
      await Promise.all(rows
        .filter(a => !a.image_url && a.sku && images[a.sku])
        .map(a => (supabase as any).from('order_stock_alerts').update({ image_url: images[a.sku!] }).eq('id', a.id).then(() => {}, () => {})))
    } catch {}
  }, [companyId])
  useEffect(() => { load() }, [load])

  // Manually resolve (restocked) or reopen a flag.
  const setResolved = async (a: Alert, resolved: boolean) => {
    setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, status: resolved ? 'resolved' : 'pending', resolved_at: resolved ? new Date().toISOString() : null } : x))
    try {
      await (supabase as any).from('order_stock_alerts')
        .update({ status: resolved ? 'resolved' : 'pending', resolved_at: resolved ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq('id', a.id)
    } catch {}
  }
  const remove = async (a: Alert) => {
    setAlerts(prev => prev.filter(x => x.id !== a.id))
    try { await (supabase as any).from('order_stock_alerts').delete().eq('id', a.id) } catch {}
  }

  // An alert is "done" (struck through / off the default list) when resolved by
  // hand or its order reached a terminal state.
  const isDone = useCallback((a: Alert) => a.status === 'resolved' || TERMINAL.has(orderStatus[a.order_id] || ''), [orderStatus])
  // Prefer the order's live outlet; fall back to the snapshot on the alert.
  const locOf = useCallback((a: Alert): string | null => {
    const live = orderLoc[a.order_id]
    return (live !== undefined ? live : a.store_location_id) || null
  }, [orderLoc])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return alerts.filter(a => {
      const done = isDone(a)
      if (statusFilter === 'pending' && done) return false
      if (statusFilter === 'resolved' && !done) return false
      if (locFilter === 'none' && locOf(a)) return false
      if (locFilter !== 'all' && locFilter !== 'none' && (locOf(a) || '') !== locFilter) return false
      if (q) {
        const hay = `${a.order_number || ''} ${a.customer_name || ''} ${a.customer_phone || ''} ${a.customer_email || ''} ${a.product_name || ''} ${a.sku || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [alerts, statusFilter, locFilter, search, isDone, locOf])

  // Group by order, preserving each order's meta.
  const groups = useMemo(() => {
    const g = new Map<string, { order: Alert; items: Alert[] }>()
    for (const a of filtered) {
      if (!g.has(a.order_id)) g.set(a.order_id, { order: a, items: [] })
      g.get(a.order_id)!.items.push(a)
    }
    let list = [...g.values()]
    if (sort === 'oldest') list.sort((a, b) => +new Date(a.order.order_date || a.order.created_at) - +new Date(b.order.order_date || b.order.created_at))
    else if (sort === 'newest') list.sort((a, b) => +new Date(b.order.order_date || b.order.created_at) - +new Date(a.order.order_date || a.order.created_at))
    else list.sort((a, b) => (a.order.customer_name || '').localeCompare(b.order.customer_name || ''))
    return list
  }, [filtered, sort])

  const pendingCount = useMemo(() => alerts.filter(a => !isDone(a)).length, [alerts, isDone])
  const totalUnits = useMemo(() => filtered.reduce((n, a) => n + (Number(a.quantity) || 1), 0), [filtered])

  const ctrl: React.CSSProperties = { padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }
  const locName = (id: string | null) => locations.find(l => l.id === id)?.name

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 5200, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 760, maxWidth: '96vw', background: 'var(--card,#fff)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: '#fee2e2', color: '#dc2626' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Out of Stock List</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>{pendingCount} item{pendingCount === 1 ? '' : 's'} waiting on stock</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['pending', 'resolved', 'all'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                style={{ padding: '7px 12px', border: 'none', background: statusFilter === s ? ACCENT : 'var(--card,#fff)', color: statusFilter === s ? '#fff' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{s}</button>
            ))}
          </div>
          {locations.length > 0 && (
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={ctrl}>
              <option value="all">Any outlet</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value="none">No outlet</option>
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value as any)} style={ctrl}>
            <option value="oldest">Oldest order first</option>
            <option value="newest">Newest order first</option>
            <option value="customer">By customer</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order #, customer, product, SKU…"
              style={{ ...ctrl, width: '100%', boxSizing: 'border-box', fontWeight: 500, cursor: 'text' }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '8px 12px 16px' }}>
          {loading ? (
            <p style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--slate)' }}>Loading…</p>
          ) : groups.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--slate)' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Nothing out of stock 🎉</p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>Flag a line item as out of stock from an order to see it listed here.</p>
            </div>
          ) : groups.map(({ order, items }) => {
            const age = orderAge(order.order_date)
            const orderDone = TERMINAL.has(orderStatus[order.order_id] || '')
            return (
              <div key={order.order_id} style={{ margin: '8px 8px 0', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card,#fff)' }}>
                {/* Order header */}
                <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--slate) 4%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { onOpenOrder?.(order.order_id); onClose() }} title="Open order"
                        style={{ fontSize: 13.5, fontWeight: 800, color: ACCENT, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>#{order.order_number || '—'}</button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{order.customer_name || 'Customer'}</span>
                      {orderDone && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>SENT</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, fontSize: 11.5, color: 'var(--slate)', flexWrap: 'wrap' }}>
                      {order.order_date && <span style={{ color: age.color, fontWeight: 700 }}>{age.label} old</span>}
                      {order.customer_phone && <span>{order.customer_phone}</span>}
                      {locOf(order) && locName(locOf(order)) && <span>· {locName(locOf(order))}</span>}
                    </div>
                  </div>
                </div>
                {/* Out-of-stock lines */}
                <div>
                  {items.map(a => {
                    const done = isDone(a)
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
                        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: done ? '#9ca3af' : '#dc2626' }} />
                        <span style={{ position: 'relative', flexShrink: 0, width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: 'var(--peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: done ? 0.55 : 1 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>
                          {a.image_url && <img src={a.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: done ? 'var(--slate)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.product_name || 'Item'}</p>
                          {a.sku && <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)', textDecoration: done ? 'line-through' : 'none' }}>SKU: {a.sku}</p>}
                        </div>
                        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--slate)' }}>Qty {a.quantity || 1}</span>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!done ? (
                            <button type="button" onClick={() => setResolved(a, true)} title="Mark restocked / resolved"
                              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #059669', background: 'var(--card,#fff)', color: '#059669', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Resolve</button>
                          ) : a.status === 'resolved' ? (
                            <button type="button" onClick={() => setResolved(a, false)} title="Reopen"
                              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Reopen</button>
                          ) : null}
                          <button type="button" onClick={() => remove(a)} title="Remove from list"
                            style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        {!loading && groups.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--slate)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{groups.length} order{groups.length === 1 ? '' : 's'} · {filtered.length} line{filtered.length === 1 ? '' : 's'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
