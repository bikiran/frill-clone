'use client'

// A task's linked order: the "Link to an order" picker (WooCommerce, Shopify
// and the in-store Prexty POS sales, each with its platform's logo) and the
// card that shows the linked order. Shared by the task panel and New task.
//
// Where an order came from rides on its id, so no extra column is needed:
// "shopify-<id>" is a Shopify order, "prexty-<id>" a Prexty sale, and anything
// else a WooCommerce order (every order linked before Prexty and Shopify could be).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { authFetch } from '@/lib/auth-fetch'
import { PlatformLogo, platformName } from '@/components/StoreLogo'
import { SkClose, SkIcon, SkStyle } from '@/components/ui/SheetKit'

export type OrderSource = 'woocommerce' | 'shopify' | 'prexty'

export const orderSource = (orderId?: string | null, source?: string | null): OrderSource => {
  if (source === 'shopify' || source === 'prexty' || source === 'woocommerce') return source
  const id = String(orderId || '')
  return id.startsWith('shopify-') ? 'shopify' : id.startsWith('prexty-') ? 'prexty' : 'woocommerce'
}

const money = (n: any) => `$${(Number(n) || 0).toFixed(2)}`
const when = (d?: string | null) => {
  const t = d ? new Date(d) : null
  return t && !isNaN(+t) ? t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : ''
}

/** The linked order, with its platform's logo and a Remove button. */
export function LinkedOrderCard({ orderId, orderNumber, customer, total, onRemove, removeClassName }: {
  orderId?: string | null; orderNumber: string; customer?: string | null; total?: number | string | null
  onRemove: () => void; removeClassName?: string
}) {
  const src = orderSource(orderId)
  return (
    <div className="ol-card">
      <style href="colvy-order-link" precedence="default">{OL_CSS}</style>
      <span className="ol-logo" title={platformName(src)}><PlatformLogo platform={src} size={36} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ol-card-t">{src === 'prexty' ? 'Sale' : 'Order'} #{orderNumber}</div>
        <div className="ol-card-s">{[platformName(src) + (src === 'prexty' ? ' · in store' : ''), customer, total != null && total !== '' ? money(total) : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <button type="button" className={removeClassName} onClick={onRemove} style={{ height: 30, fontSize: 12.5, color: '#dc2626' }}>Remove</button>
    </div>
  )
}

/** Search every connected store's orders (and Prexty sales) and pick one. */
export function OrderSearchModal({ companyId, onClose, onPick, zIndex = 10050 }: {
  companyId: string; onClose: () => void; onPick: (o: any) => void; zIndex?: number
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [only, setOnly] = useState<OrderSource | 'all'>('all')
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try { const res = await authFetch(`/api/orders/search?companyId=${companyId}&q=${encodeURIComponent(q.trim())}`); const d = await res.json(); setResults(d.orders || []) }
      catch { setResults([]) } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, companyId])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of results) { const s = orderSource(o.order_id, o.source); c[s] = (c[s] || 0) + 1 }
    return c
  }, [results])
  const sources = (['woocommerce', 'shopify', 'prexty'] as OrderSource[]).filter(s => counts[s])
  const shown = only === 'all' || !counts[only] ? results : results.filter(o => orderSource(o.order_id, o.source) === only)
  const typed = q.trim().length >= 2

  // Drawn on <body>: the task pane slides in with a transform, which would pin
  // a fixed pop-up inside the pane (clipped, its header scrolled out of view).
  const modal = (
    <div className="sk-scrim" style={{ '--sk-z': zIndex } as React.CSSProperties} onClick={onClose}>
      <SkStyle />
      <style href="colvy-order-link" precedence="default">{OL_CSS}</style>
      <div className="sk ol" role="dialog" aria-modal="true" aria-labelledby="ol-title" style={{ '--sk-w': '520px' } as React.CSSProperties}
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className="sk-head">
          <span className="sk-badge" aria-hidden>{SkIcon.cart}</span>
          <div style={{ minWidth: 0 }}>
            <h3 id="ol-title">Link to an order</h3>
            <p className="sk-sub">Search your WooCommerce and Shopify orders, and Prexty in-store sales.</p>
          </div>
          <SkClose onClick={onClose} />
        </div>

        <div className="sk-field" style={{ marginTop: 14 }}>
          {SkIcon.search}
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Order or sale #, name, phone, email or item" aria-label="Search orders" />
          {loading && <span className="ol-spin" aria-label="Searching" />}
        </div>
        <div className="ol-brands" aria-hidden>
          {(['woocommerce', 'shopify', 'prexty'] as OrderSource[]).map(s => <PlatformLogo key={s} platform={s} size={16} />)}
          <span>e.g. 10452, R49966, Jane, 0412…</span>
        </div>

        {sources.length > 1 && (
          <div className="sk-chips" role="group" aria-label="Show orders from" style={{ marginTop: 12 }}>
            <button type="button" className={`sk-chip${only === 'all' ? ' on' : ''}`} aria-pressed={only === 'all'} onClick={() => setOnly('all')}><span>All {results.length}</span></button>
            {sources.map(s => (
              <button key={s} type="button" className={`sk-chip${only === s ? ' on' : ''}`} aria-pressed={only === s} onClick={() => setOnly(s)}>
                <PlatformLogo platform={s} size={16} /><span>{platformName(s)} {counts[s]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ol-list" aria-live="polite">
          {!typed && <p className="ol-msg">Start typing to find an order.</p>}
          {typed && loading && results.length === 0 && [0, 1, 2].map(i => <div key={i} className="ol-skel" style={{ animationDelay: `${i * 110}ms` }} />)}
          {typed && !loading && results.length === 0 && <p className="ol-msg">No orders match &ldquo;{q.trim()}&rdquo;.</p>}
          {shown.map(o => {
            const src = orderSource(o.order_id, o.source)
            const sub = [o.customer, src === 'prexty' ? ['In store', o.outlet].filter(Boolean).join(' · ') : o.status, when(o.date)].filter(Boolean).join(' · ')
            return (
              <button key={o.order_id} type="button" className="ol-row" onClick={() => onPick({ ...o, source: src })}>
                <span className="ol-logo" title={platformName(src)}><PlatformLogo platform={src} size={36} /></span>
                <span className="sk-item-t">
                  <b>{src === 'prexty' ? 'Sale' : 'Order'} #{o.order_number}{src === 'prexty' && o.store_number && o.store_number !== o.order_number ? <span className="ol-alt"> · online #{o.store_number}</span> : null}</b>
                  <small>{sub}</small>
                  {o.items?.length > 0 && <small className="ol-items">{o.items.join(', ')}</small>}
                </span>
                <span className="sk-amt">{money(o.total)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body)
}

const OL_CSS = `
.ol-card{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:16px;background:#fafafa;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
[data-theme="dark"] .ol-card{background:rgba(255,255,255,.04);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
.ol-card-t{font-size:14px;font-weight:700;color:var(--ink)}
.ol-card-s{margin-top:1px;font-size:12.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ol-logo{display:inline-flex;flex-shrink:0;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.ol-brands{display:flex;align-items:center;gap:5px;margin:8px 4px 0;font-size:12px;color:var(--sk-muted)}
.ol-brands span{margin-left:4px}
.ol-list{display:flex;flex-direction:column;gap:8px;margin-top:14px;min-height:120px}
.ol-msg{margin:18px 0;text-align:center;font-size:13.5px;color:var(--sk-muted)}
.ol-row{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px 11px 11px;border:none;border-radius:18px;background:var(--sk-fill);font:inherit;text-align:left;color:var(--ink);cursor:pointer;transition:background .15s,transform .12s}
.ol-row:hover{background:var(--sk-fill-2)}
.ol-row:active{transform:scale(.99)}
.ol-row .sk-item-t small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ol-items{opacity:.8}
.ol-alt{font-weight:500;color:var(--sk-muted)}
.ol-skel{height:64px;border-radius:18px;background:linear-gradient(90deg,var(--sk-fill) 25%,var(--sk-fill-2) 50%,var(--sk-fill) 75%);background-size:200% 100%;animation:olShimmer 1.2s ease-in-out infinite}
.ol-spin{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:2px solid var(--sk-fill-2);border-top-color:var(--coral,#ff7a6b);animation:olSpin .7s linear infinite}
.ol .sk-chip img{border-radius:4px}
@keyframes olShimmer{from{background-position:100% 0}to{background-position:-100% 0}}
@keyframes olSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ol-skel,.ol-spin{animation:none}}
`
