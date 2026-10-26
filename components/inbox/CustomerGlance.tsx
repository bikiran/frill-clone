'use client'

// Who you're talking to, at a glance: what they've spent, how many orders, the
// last one, new or returning, and their tags, in one slim line under the
// thread header. Click it for their recent orders and payments, when they
// became a customer, and "All orders ›" (the contact panel's Orders tab). The
// web twin of the mobile app's CustomerSnapshot.
//
// Orders are the ones the inbox already loaded for the contact (WooCommerce,
// Shopify, Prexty in-store sales). Money taken in the chats themselves
// (payment links, saved-card charges, sales staff recorded) never reaches the
// store, so it's read here and added on top, as on mobile. Hidden for someone
// with no orders, payments or tags.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PrextyMark from '@/components/PrextyMark'

type Payment = { id: string; amount: number; status: 'paid' | 'refunded'; date: string; label: string }

const MONEY = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const money = (n: number) => `$${MONEY.format(Math.round(n))}`
const parse = (d?: string | null) => {
  if (!d) return null
  const t = new Date(d.includes('Z') || d.includes('+') ? d : d.replace(' ', 'T') + 'Z')
  return isNaN(t.getTime()) ? null : t
}
const shortDate = (d: Date | null) => d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' }) : ''
// Orders that count towards what they've spent.
const PAID = ['completed', 'processing', 'on-hold', 'shipped', 'awaiting_shipment', 'packed']

// Payments per contact, kept for the page's life so switching back is instant.
const payCache = new Map<string, Payment[]>()

async function loadPayments(companyId: string, contactId: string): Promise<Payment[]> {
  const { data: convs } = await (supabase as any).from('conversations')
    .select('id').eq('company_id', companyId).eq('contact_id', contactId).limit(50)
  const ids = (convs || []).map((c: any) => c.id)
  if (!ids.length) return []
  const [pays, sales] = await Promise.all([
    (supabase as any).from('chat_payments').select('id, amount_cents, status, payment_method, card_last4, paid_at, created_at')
      .in('conversation_id', ids).in('status', ['paid', 'refunded'])
      .order('created_at', { ascending: false }).limit(100),
    (supabase as any).from('conversation_sales').select('id, amount, payment_method, created_at')
      .eq('company_id', companyId).in('conversation_id', ids)
      .order('created_at', { ascending: false }).limit(100),
  ])
  const out: Payment[] = []
  for (const p of pays.data || []) {
    const card = p.payment_method === 'saved_card'
    out.push({
      id: 'pay-' + p.id, amount: (Number(p.amount_cents) || 0) / 100,
      status: p.status === 'refunded' ? 'refunded' : 'paid', date: p.paid_at || p.created_at,
      label: [card ? 'Saved card' : 'Payment link', p.card_last4 ? `· ${p.card_last4}` : ''].filter(Boolean).join(' '),
    })
  }
  for (const r of sales.data || []) {
    out.push({ id: 'sale-' + r.id, amount: Number(r.amount) || 0, status: 'paid', date: r.created_at, label: r.payment_method ? `Sale · ${r.payment_method}` : 'Sale' })
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/** Where an order came from, as a small mark: Prexty (in store), Shopify or WooCommerce. */
function SourceMark({ o }: { o: any }) {
  if (o.pos_source === 'prexty') return <PrextyMark size={13} title={`In store${o.pos_sale_id ? ` · ${o.pos_sale_id}` : ''}`} />
  const src = o._channel === 'shopify' ? ['/logos/shopify.svg', 'Shopify order'] : o.woo_order_id != null || o._live ? ['/logos/woocommerce.svg', 'Online store order'] : null
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src[0]} alt={src[1]} title={src[1]} width={13} height={13} style={{ width: 13, height: 13, objectFit: 'contain', flexShrink: 0 }} /> : null
}

export default function CustomerGlance({ companyId, contactId, orders, tags, onOpenOrders }: {
  companyId: string | null
  contactId: string | null | undefined
  /** The contact's orders as the inbox loaded them (newest first or not). */
  orders: any[]
  tags?: string[] | null
  /** Open the contact panel on its Orders tab. */
  onOpenOrders?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [payments, setPayments] = useState<Payment[]>(() => (contactId && payCache.get(contactId)) || [])
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
    setPayments((contactId && payCache.get(contactId)) || [])
    if (!companyId || !contactId) return
    let live = true
    loadPayments(companyId, contactId)
      .then(p => { payCache.set(contactId, p); if (live) setPayments(p) })
      .catch(() => {})
    return () => { live = false }
  }, [companyId, contactId])

  // Closes on a click elsewhere or Esc, like any dropdown.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const s = useMemo(() => {
    const list = (orders || []).slice().sort((a, b) => (parse(b.order_date)?.getTime() || 0) - (parse(a.order_date)?.getTime() || 0))
    const counted = list.filter(o => PAID.includes(String(o.status || '').toLowerCase()))
    const paid = payments.filter(p => p.status === 'paid')
    const spent = counted.reduce((n, o) => n + (parseFloat(o.total) || 0), 0) + paid.reduce((n, p) => n + p.amount, 0)
    const dates = [...list.map(o => parse(o.order_date)), ...payments.map(p => parse(p.date))].filter(Boolean) as Date[]
    const first = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
    const lastAt = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
    return { list, count: list.length, payCount: paid.length, spent, first, lastAt }
  }, [orders, payments])

  const tagList = (Array.isArray(tags) ? tags : []).filter(Boolean).slice(0, 6)
  const any = s.count + s.payCount
  if (!any && !tagList.length) return null
  const returning = any > 1
  const counts = [s.count ? `${s.count} order${s.count === 1 ? '' : 's'}` : '', s.payCount ? `${s.payCount} payment${s.payCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')

  return (
    <div ref={wrap} className="cg-wrap">
      <style>{CSS}</style>
      <button type="button" className="cg-row" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Customer summary">
        {any ? (
          <>
            <b className="cg-spent">{money(s.spent)}</b>
            <span className="cg-dot">·</span>
            <span className="cg-meta">{counts}</span>
            {s.lastAt && <span className="cg-last"><span className="cg-dot">·</span><span className="cg-meta">last {shortDate(s.lastAt)}</span></span>}
            <span className={`cg-pill ${returning ? 'back' : 'new'}`}>{returning ? 'Returning' : 'New'}</span>
          </>
        ) : <span className="cg-meta">No orders yet</span>}
        <span style={{ flex: 1 }} />
        {tagList.length > 0 && <span className="cg-taghint">{tagList[0]}{tagList.length > 1 ? ` +${tagList.length - 1}` : ''}</span>}
        <svg className="cg-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="cg-body" role="region" aria-label="Recent orders">
          {tagList.length > 0 && <div className="cg-tags">{tagList.map(t => <span key={t} className="cg-tag">{t}</span>)}</div>}
          {s.list.slice(0, 3).map(o => (
            <div key={String(o.woo_order_id ?? o.order_number ?? o.id)} className="cg-line">
              <span className="cg-no">#{o.order_number || o.woo_order_id}<SourceMark o={o} /></span>
              <span className="cg-st">{String(o.status || '').replace(/[-_]/g, ' ')}</span>
              <span className="cg-date">{shortDate(parse(o.order_date))}</span>
              <span className="cg-total">{money(parseFloat(o.total) || 0)}</span>
            </div>
          ))}
          {payments.slice(0, 3).map(p => (
            <div key={p.id} className="cg-line">
              <span className="cg-st" style={{ textTransform: 'none' }}>{p.label}{p.status === 'refunded' ? ' · refunded' : ''}</span>
              <span className="cg-date">{shortDate(parse(p.date))}</span>
              <span className="cg-total" style={p.status === 'refunded' ? { textDecoration: 'line-through', color: '#8e8e93' } : undefined}>{money(p.amount)}</span>
            </div>
          ))}
          <div className="cg-foot">
            {s.first ? <span className="cg-since">Customer since {shortDate(s.first)}</span> : <span />}
            {s.count > 0 && onOpenOrders && <button type="button" className="cg-all" onClick={() => { setOpen(false); onOpenOrders() }}>All orders ›</button>}
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.cg-wrap{position:relative;z-index:5;background:#fffaf8;border-bottom:1px solid var(--border)}
.cg-row{display:flex;align-items:center;gap:7px;width:100%;padding:7px 16px;border:none;background:none;cursor:pointer;text-align:left;font-family:inherit;min-width:0;container-type:inline-size}
.cg-row:hover{background:#fff4f1}
.cg-spent{font-size:13px;font-weight:800;color:var(--ink)}
.cg-dot{font-size:12px;color:#c4c4c8}
.cg-meta{font-size:12.5px;font-weight:600;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cg-last{display:inline-flex;align-items:center;gap:7px;min-width:0}
.cg-pill{margin-left:3px;padding:1px 8px;border-radius:99px;font-size:10.5px;font-weight:800;flex-shrink:0}
.cg-pill.new{background:#ffe1db;color:#d4412c}
.cg-pill.back{background:#dcfce7;color:#15803d}
.cg-taghint{font-size:11.5px;font-weight:700;color:#7c3aed;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
/* When the thread is narrow, the tag hint goes first (the tags are in the
   dropdown), then the last-order date; spend, counts and New/Returning stay. */
@container (max-width: 520px){.cg-taghint{display:none}}
@container (max-width: 380px){.cg-last{display:none}}
.cg-chev{color:var(--slate);flex-shrink:0;transition:transform .2s cubic-bezier(.22,1,.36,1)}
.cg-row[aria-expanded="true"] .cg-chev{transform:rotate(180deg)}
.cg-body{position:absolute;left:0;right:0;top:100%;background:#fffaf8;border-bottom:1px solid var(--border);box-shadow:0 14px 28px -18px rgba(15,23,42,.35);padding:2px 16px 10px;display:flex;flex-direction:column;gap:2px;transform-origin:top;animation:cgIn .2s cubic-bezier(.22,1,.36,1) both}
@keyframes cgIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.cg-body{animation:none}.cg-chev{transition:none}}
.cg-tags{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 6px}
.cg-tag{font-size:11.5px;font-weight:700;color:#7c3aed;background:#f3e8ff;padding:2px 9px;border-radius:99px}
.cg-line{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #f3ece9}
.cg-no{display:inline-flex;align-items:center;gap:5px;width:104px;flex-shrink:0;font-size:12.5px;font-weight:800;color:var(--ink)}
.cg-st{flex:1;min-width:0;font-size:12px;color:var(--slate);text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-date{font-size:12px;color:var(--slate);white-space:nowrap}
.cg-total{min-width:56px;text-align:right;font-size:12.5px;font-weight:800;color:var(--ink)}
.cg-foot{display:flex;align-items:center;justify-content:space-between;margin-top:4px}
.cg-since{font-size:11.5px;color:#9a9aa0}
.cg-all{border:none;background:none;padding:2px 0;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;color:var(--coral)}
`
