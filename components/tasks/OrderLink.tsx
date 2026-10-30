'use client'

// A task's linked order: the "Link to an order" picker (WooCommerce, Shopify
// and the in-store Prexty POS sales, each with its platform's logo) and the
// card that shows the linked order. Shared by the task panel and New task.
//
// Where an order came from rides on its id, so no extra column is needed:
// "shopify-<id>" is a Shopify order, "prexty-<id>" a Prexty sale, and anything
// else a WooCommerce order (every order linked before Prexty and Shopify could be).
// "View" opens the whole order (OrderViewSheet), with a way to the customer's
// conversation when we can find them.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
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

/** The linked order, with its platform's logo, View and Remove. */
export function LinkedOrderCard({ companyId, orderId, orderNumber, customer, total, onRemove, removeClassName }: {
  companyId?: string | null; orderId?: string | null; orderNumber: string; customer?: string | null; total?: number | string | null
  onRemove: () => void; removeClassName?: string
}) {
  const src = orderSource(orderId)
  const [viewing, setViewing] = useState(false)
  const canView = !!(companyId && orderId)
  return (
    // The sheet is drawn on <body> but its clicks still bubble here through
    // React; only clicks on the card itself open it (closing must stay closed).
    <div className={`ol-card${canView ? ' can-view' : ''}`} onClick={e => { if (canView && e.currentTarget.contains(e.target as Node)) setViewing(true) }} role={canView ? 'button' : undefined} tabIndex={canView ? 0 : undefined}
      onKeyDown={e => { if (canView && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setViewing(true) } }}
      aria-label={canView ? `View ${src === 'prexty' ? 'sale' : 'order'} #${orderNumber}` : undefined}>
      <style href="colvy-order-link" precedence="default">{OL_CSS}</style>
      <span className="ol-logo" title={platformName(src)}><PlatformLogo platform={src} size={36} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ol-card-t">{src === 'prexty' ? 'Sale' : 'Order'} #{orderNumber}</div>
        <div className="ol-card-s">{[platformName(src) + (src === 'prexty' ? ' · in store' : ''), customer, total != null && total !== '' ? money(total) : ''].filter(Boolean).join(' · ')}</div>
      </div>
      {canView && <button type="button" className={removeClassName} onClick={e => { e.stopPropagation(); setViewing(true) }} style={{ height: 30, fontSize: 12.5 }}>View</button>}
      <button type="button" className={removeClassName} onClick={e => { e.stopPropagation(); onRemove() }} style={{ height: 30, fontSize: 12.5, color: '#dc2626' }}>Remove</button>
      {viewing && companyId && orderId && <OrderViewSheet companyId={companyId} orderId={orderId} orderNumber={orderNumber} customer={customer} onClose={() => setViewing(false)} />}
    </div>
  )
}

const digits = (p: any) => String(p || '').replace(/\D/g, '')
const addressLines = (a: any): string[] => {
  if (!a || typeof a !== 'object') return []
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ')
  const town = [a.city, a.state, a.postcode].filter(Boolean).join(' ')
  return [name, a.company, a.address_1, a.address_2, town, a.country && a.country !== 'AU' ? a.country : ''].filter(Boolean)
}
const prettyKey = (k: string) => k.replace(/^prexty_/i, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

/** Find the customer's conversation: the order's own, else their contact's newest, else one on their number. */
async function findConversation(companyId: string, o: any): Promise<{ id: string; name: string | null } | null> {
  try {
    if (o?.conversation_id) return { id: String(o.conversation_id), name: null }
    const email = String(o?.billing?.email || o?.customer_email || o?.email || '').trim().toLowerCase()
    const phone = digits(o?.billing?.phone || o?.phone || '')
    const tail = phone.slice(-9)
    const ids: string[] = []
    let name: string | null = null
    if (email) {
      const { data } = await (supabase as any).from('contacts').select('id, name, email').eq('company_id', companyId).ilike('email', email).limit(5)
      for (const c of data || []) { ids.push(c.id); name = name || c.name || null }
    }
    if (tail.length >= 8) {
      const { data } = await (supabase as any).from('contacts').select('id, name, phone').eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(10)
      for (const c of data || []) if (digits(c.phone).endsWith(tail) && !ids.includes(c.id)) { ids.push(c.id); name = name || c.name || null }
    }
    if (ids.length) {
      const { data } = await (supabase as any).from('conversations').select('id').eq('company_id', companyId).in('contact_id', ids).order('last_message_at', { ascending: false }).limit(1)
      if (data?.[0]?.id) return { id: data[0].id, name }
    }
    if (tail.length >= 8) {
      const { data } = await (supabase as any).from('conversations').select('id').eq('company_id', companyId).ilike('sms_number', `%${tail}%`).order('last_message_at', { ascending: false }).limit(1)
      if (data?.[0]?.id) return { id: data[0].id, name }
    }
  } catch { /* no conversation to offer */ }
  return null
}

/** The whole order: items, totals, payment, delivery, notes and Prexty's own details. */
export function OrderViewSheet({ companyId, orderId, orderNumber, customer, onClose }: {
  companyId: string; orderId: string; orderNumber: string; customer?: string | null; onClose: () => void
}) {
  const router = useRouter()
  const src = orderSource(orderId)
  const [order, setOrder] = useState<any>(null)
  const [error, setError] = useState('')
  const [conv, setConv] = useState<{ id: string; name: string | null } | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        // A Prexty sale is a WooCommerce order underneath; Shopify keeps its prefix.
        const id = orderId.replace(/^prexty-/, '')
        const res = await authFetch(`/api/orders/detail?companyId=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(id)}`)
        const d = await res.json().catch(() => ({}))
        if (!live) return
        if (!res.ok || !d.order) { setError(d.error || 'Could not load this order.'); setConv(null); return }
        setOrder(d.order)
        const found = await findConversation(companyId, d.order)
        if (live) setConv(found)
      } catch { if (live) { setError('Could not load this order.'); setConv(null) } }
    })()
    return () => { live = false }
  }, [companyId, orderId])

  const cur = order?.currency && order.currency !== 'AUD' ? `${order.currency} ` : ''
  const m = (v: any) => `${cur}$${(parseFloat(v) || 0).toFixed(2)}`
  const items: any[] = Array.isArray(order?.line_items) ? order.line_items : []
  const itemsTotal = items.reduce((t, li) => t + (parseFloat(li.total ?? li.subtotal ?? 0) || 0), 0)
  const fees: any[] = Array.isArray(order?.fee_lines) ? order.fee_lines.filter((f: any) => parseFloat(f.total)) : []
  const coupons: any[] = Array.isArray(order?.coupon_lines) ? order.coupon_lines : []
  const name = [order?.billing?.first_name, order?.billing?.last_name].filter(Boolean).join(' ') || order?.customer_name || customer || conv?.name || 'Customer'
  const email = order?.billing?.email || order?.customer_email || ''
  const phone = order?.billing?.phone || ''
  const ship = addressLines(order?.shipping && Object.values(order.shipping).some(Boolean) ? order.shipping : null)
  const bill = addressLines(order?.billing)
  const prexty = order?.prexty && typeof order.prexty === 'object' ? Object.entries(order.prexty).filter(([, v]) => v != null && v !== '') : []
  const STATUS_TONE: Record<string, string> = { completed: '#16a34a', processing: '#2563eb', 'on-hold': '#d97706', pending: '#ea580c', refunded: '#7c3aed', cancelled: '#dc2626', failed: '#dc2626', paid: '#16a34a' }
  const status = String(order?.status || '')

  const sheet = (
    <div className="sk-scrim side" style={{ '--sk-z': 10050 } as React.CSSProperties} onClick={onClose}>
      <SkStyle />
      <style href="colvy-order-link" precedence="default">{OL_CSS}</style>
      <div className="sk side ov" role="dialog" aria-modal="true" aria-labelledby="ov-title" style={{ '--sk-w': '500px' } as React.CSSProperties}
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className="sk-head">
          <span className="ol-logo ov-badge" aria-hidden><PlatformLogo platform={src} size={44} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 id="ov-title">{src === 'prexty' ? 'Sale' : 'Order'} #{orderNumber}</h2>
            <p className="sk-sub ov-sub">
              {status && <span className="ov-tag" style={{ ['--tag' as any]: STATUS_TONE[status.toLowerCase()] || '#71717a' }}><span className="ov-tag-dot" />{status.replace(/[-_]/g, ' ')}</span>}
              <span>{[platformName(src) + (src === 'prexty' ? ' · in store' : ''), when(order?.date_created || order?.order_date)].filter(Boolean).join(' · ')}</span>
            </p>
          </div>
          <SkClose onClick={onClose} />
        </div>

        <div className="sk-body">
          {error ? <p className="sk-err" role="alert">{error}</p> : !order ? (
            <div aria-busy="true" aria-label="Loading the order">{[64, 160, 120].map((h, i) => <div key={i} className="ol-skel" style={{ height: h, marginTop: 12, animationDelay: `${i * 110}ms` }} />)}</div>
          ) : (
            <>
              {/* Who */}
              <div className="sk-item" style={{ marginTop: 6 }}>
                <span className="ov-av" aria-hidden>{String(name).trim().charAt(0).toUpperCase() || '?'}</span>
                <span className="sk-item-t">
                  <b>{name}</b>
                  <small style={{ overflowWrap: 'anywhere' }}>{[email, phone].filter(Boolean).join(' · ') || 'No contact details on the order'}</small>
                </span>
              </div>

              {/* What they bought */}
              <span className="sk-lbl">{items.length ? `${items.reduce((n, li) => n + (Number(li.quantity) || 1), 0)} item${items.reduce((n, li) => n + (Number(li.quantity) || 1), 0) === 1 ? '' : 's'}` : 'Items'}</span>
              {items.length === 0 && <p className="sk-note" style={{ marginTop: 0 }}>The store didn&rsquo;t send the items for this order.</p>}
              <div className="ov-items">
                {items.map((li, i) => {
                  const q = Number(li.quantity) || 1
                  const total = parseFloat(li.total ?? li.subtotal ?? 0) || 0
                  const img = li.image?.src || li.image_url || null
                  return (
                    <div key={li.id ?? i} className="ov-item">
                      {img
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={img} alt="" className="ov-thumb" loading="lazy" />
                        : <span className="ov-thumb" aria-hidden>{SkIcon.box}</span>}
                      <span className="sk-item-t">
                        <b style={{ whiteSpace: 'normal' }}>{li.name || li.product_name || 'Item'}</b>
                        <small>{q} × {m(total / q)}{li.sku ? ` · SKU ${li.sku}` : ''}</small>
                      </span>
                      <span className="sk-amt">{m(total)}</span>
                    </div>
                  )
                })}
              </div>

              <div className="sk-sum">
                {items.length > 0 && <div className="sk-sum-r"><span>Items</span><b>{m(itemsTotal)}</b></div>}
                {parseFloat(order.discount_total) > 0 && <div className="sk-sum-r"><span>Discount{coupons.length ? ` · ${coupons.map((c: any) => c.code).filter(Boolean).join(', ')}` : ''}</span><b style={{ color: '#dc2626' }}>-{m(order.discount_total)}</b></div>}
                {fees.map((f, i) => <div key={i} className="sk-sum-r"><span>{f.name || 'Fee'}</span><b>{m(f.total)}</b></div>)}
                {order.shipping_total != null && <div className="sk-sum-r"><span>Shipping{order.shipping_method ? ` · ${order.shipping_method}` : ''}</span><b>{parseFloat(order.shipping_total) > 0 ? m(order.shipping_total) : 'Free'}</b></div>}
                {parseFloat(order.total_tax) > 0 && <div className="sk-sum-r"><span>Tax</span><b style={{ color: 'var(--sk-muted)', fontWeight: 500 }}>{m(order.total_tax)}</b></div>}
                {parseFloat(order.total_refunded) > 0 && <div className="sk-sum-r"><span>Refunded</span><b style={{ color: '#dc2626' }}>-{m(order.total_refunded)}</b></div>}
                <div className="sk-sum-r total"><span>Total</span><b>{m(order.total)}</b></div>
              </div>

              {/* Payment and delivery */}
              <div className="ov-grid">
                <div className="sk-card">
                  <span className="ov-k">Payment</span>
                  <p className="ov-v">{order.payment_method_title || order.payment_method || '—'}</p>
                  {order.date_paid && <p className="ov-s">Paid {when(order.date_paid)}</p>}
                  {order.transaction_id && <p className="ov-s" style={{ overflowWrap: 'anywhere' }}>Ref {order.transaction_id}</p>}
                </div>
                <div className="sk-card">
                  <span className="ov-k">{ship.length ? 'Delivers to' : 'Delivery'}</span>
                  {ship.length ? ship.map((l, i) => <p key={i} className={i ? 'ov-s' : 'ov-v'}>{l}</p>) : <p className="ov-v">{order.shipping_method || (src === 'prexty' ? 'Taken in store' : 'No delivery address')}</p>}
                </div>
              </div>
              {bill.length > 0 && bill.join('|') !== ship.join('|') && (
                <div className="sk-card" style={{ marginTop: 8 }}>
                  <span className="ov-k">Billing address</span>
                  {bill.map((l, i) => <p key={i} className={i ? 'ov-s' : 'ov-v'}>{l}</p>)}
                </div>
              )}

              {order.customer_note && (
                <>
                  <span className="sk-lbl">Customer note</span>
                  <div className="sk-card ov-note">{order.customer_note}</div>
                </>
              )}

              {prexty.length > 0 && (
                <>
                  <span className="sk-lbl">In store (Prexty)</span>
                  <div className="sk-card ov-kv">
                    {prexty.map(([k, v]) => <div key={k}><span>{prettyKey(k)}</span><b>{String(v)}</b></div>)}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="sk-foot">
          <div className="sk-actions" style={{ marginTop: 0 }}>
            <button type="button" className="sk-btn" onClick={onClose}>Close</button>
            <button type="button" className="sk-btn primary" disabled={!conv}
              onClick={() => { if (conv) { onClose(); router.push(`/admin/inbox?conversation=${encodeURIComponent(conv.id)}`) } }}>
              {SkIcon.chat}{conv === undefined ? 'Finding their conversation…' : conv ? 'Go to conversation' : 'No conversation yet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
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
.ol-card.can-view{cursor:pointer;transition:box-shadow .15s,background .15s}
.ol-card.can-view:hover{box-shadow:0 0 0 1px rgba(0,0,0,.09),0 4px 14px rgba(0,0,0,.05)}
.ol-card.can-view:focus-visible{outline:2px solid var(--coral,#ff7a6b);outline-offset:2px}
.ov .sk-body{padding-top:0}
.ov-badge{width:44px;height:44px;border-radius:14px;overflow:hidden}
.ov-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ov-tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px 0 7px;border-radius:999px;background:color-mix(in srgb,var(--tag) 11%,var(--card,#fff));color:color-mix(in srgb,var(--tag) 85%,var(--ink));font-size:11.5px;font-weight:600;text-transform:capitalize;white-space:nowrap}
.ov-tag-dot{width:6px;height:6px;border-radius:50%;background:var(--tag)}
.ov-av{width:40px;height:40px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:var(--coral,#ff7a6b);font-weight:800;font-size:15px}
.ov-items{display:flex;flex-direction:column;gap:8px}
.ov-item{display:flex;align-items:center;gap:12px;padding:10px 14px 10px 10px;border-radius:18px;background:var(--sk-fill)}
.ov-thumb{width:46px;height:46px;flex-shrink:0;border-radius:12px;object-fit:cover;background:var(--card,#fff);color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center}
.ov-item .sk-item-t b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ov-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:18px}
.ov-k{display:block;margin-bottom:6px;font-size:12.5px;font-weight:600;color:var(--sk-muted)}
.ov-v{margin:0;font-size:14px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.ov-s{margin:2px 0 0;font-size:13px;line-height:1.45;color:var(--sk-muted)}
.ov-note{font-size:14px;line-height:1.55;white-space:pre-wrap;color:var(--ink)}
.ov-kv{display:grid;gap:8px}
.ov-kv div{display:flex;justify-content:space-between;gap:12px;font-size:13.5px}
.ov-kv span{color:var(--sk-muted)}
.ov-kv b{font-weight:600;text-align:right;overflow-wrap:anywhere}
.ov .sk-btn.primary svg{flex-shrink:0}
@media (max-width:420px){.ov-grid{grid-template-columns:1fr}}
@keyframes olShimmer{from{background-position:100% 0}to{background-position:-100% 0}}
@keyframes olSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ol-skel,.ol-spin{animation:none}}
`
