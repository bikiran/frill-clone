'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtMoney, CARRIER_LABEL, carrierTrackUrl, isClickCollect, buildOrderLineKeys } from '@/lib/orders'
import { barcodeSVG } from '@/lib/barcode'

type Order = any

// Renders packing slips or 4×6 shipping labels for a set of orders, self-loading
// its data. Used inline in the in-page print modal (no iframe, so no app-shell
// flash) and by the standalone /admin/orders/print page.
export default function OrderPrintDoc({ doc, companyId, ids, onLoaded }: { doc: 'packing_slip' | 'label'; companyId: string; ids: string[]; onLoaded?: () => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({})
  const [shipByOrder, setShipByOrder] = useState<Record<string, any>>({})
  const [notesByOrder, setNotesByOrder] = useState<Record<string, any[]>>({})
  const [fulByOrder, setFulByOrder] = useState<Record<string, Record<string, boolean>>>({})
  const [company, setCompany] = useState<any>(null)
  const [fromAddr, setFromAddr] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!companyId || !ids.length) { setLoading(false); return }
      let rows: Order[] = []
      try {
        const { data: s } = await supabase.auth.getSession()
        const token = s?.session?.access_token
        const res = await fetch(`/api/orders?companyId=${encodeURIComponent(companyId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const j = await res.json().catch(() => ({}))
        const byId = new Map<string, Order>((j.orders || []).map((o: Order) => [o.id, o]))
        rows = ids.map(id => byId.get(id)).filter(Boolean) as Order[]
        // The customer's checkout note (order.customer_note) is only stored once
        // V281 is applied and the order re-synced. Until then — and for older
        // orders — pull it live from WooCommerce so it always prints. Bounded so a
        // big bulk run doesn't fan out unboundedly.
        const needNote = rows.filter((o: any) => !(o.customer_note || o.note) && o.external_order_id).slice(0, 40)
        if (needNote.length) {
          try {
            const pairs = await Promise.all(needNote.map(async (o: any) => {
              try {
                const r = await fetch(`/api/orders/woo-notes?companyId=${encodeURIComponent(companyId)}&wooOrderId=${encodeURIComponent(String(o.external_order_id))}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                const jj = await r.json().catch(() => ({}))
                return [o.id, jj.customerNote || ''] as const
              } catch { return [o.id, ''] as const }
            }))
            const noteMap = new Map(pairs)
            rows = rows.map((o: any) => noteMap.get(o.id) ? { ...o, customer_note: o.customer_note || noteMap.get(o.id) } : o)
          } catch {}
        }
      } catch {}
      const [{ data: co }, { data: loc }, { data: items }, { data: ships }, { data: nts }, ful] = await Promise.all([
        (supabase as any).from('companies').select('*').eq('id', companyId).maybeSingle(),
        (supabase as any).from('company_locations').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).limit(1).maybeSingle(),
        (supabase as any).from('order_items').select('*').in('order_id', ids),
        (supabase as any).from('order_shipments').select('*').in('order_id', ids).order('created_at', { ascending: false }),
        (supabase as any).from('order_notes').select('*').in('order_id', ids).order('created_at', { ascending: true }),
        // Per-line fulfilment — which items are already sent. Absent table
        // (migration pending) just resolves to no sent flags.
        (supabase as any).from('order_fulfillments').select('order_id, line_key, sent').in('order_id', ids).then((r: any) => r, () => ({ data: [] })),
      ])
      if (cancelled) return
      setOrders(rows); setCompany(co || null); setFromAddr(loc || null)
      const ib: Record<string, any[]> = {}; for (const it of items || []) (ib[it.order_id] ||= []).push(it); setItemsByOrder(ib)
      const sb: Record<string, any> = {}; for (const sh of ships || []) if (!sb[sh.order_id]) sb[sh.order_id] = sh; setShipByOrder(sb)
      const nb: Record<string, any[]> = {}; for (const n of nts || []) (nb[n.order_id] ||= []).push(n); setNotesByOrder(nb)
      const fb: Record<string, Record<string, boolean>> = {}; for (const f of (ful?.data || [])) { (fb[f.order_id] ||= {})[f.line_key] = !!f.sent } setFulByOrder(fb)
      setLoading(false); onLoaded?.()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, ids.join(',')])

  const accent = company?.accent_color || '#0f172a'
  const senderName = company?.name || 'Warehouse'

  if (loading) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>Preparing documents…</div>
  if (!orders.length) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>Nothing to print.</div>

  return (
    <div className="order-print-root" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif', color: '#0f172a', background: '#fff' }}>
      <style>{`
        @media print {
          @page { size: ${doc === 'label' ? '4in 6in' : 'A4'}; margin: ${doc === 'label' ? '0' : '14mm'}; }
          .order-print-root { position: static !important; }
          /* Each order on its own page. */
          .doc-page { page-break-after: always; break-after: page; break-inside: avoid; }
          .doc-page:last-child { page-break-after: auto; break-after: auto; }
        }
        .doc-page { box-sizing: border-box; }
      `}</style>
      <div style={{ padding: doc === 'label' ? 0 : '10px 0' }}>
        {orders.map(o => doc === 'label'
          ? <LabelDoc key={o.id} order={o} ship={shipByOrder[o.id]} senderName={senderName} from={fromAddr} accent={accent} />
          : <PackingSlip key={o.id} order={o} items={itemsByOrder[o.id] || []} notes={notesByOrder[o.id] || []} sentByKey={fulByOrder[o.id] || {}} company={company} from={fromAddr} accent={accent} />
        )}
      </div>
    </div>
  )
}

function addrLines(a: any, name?: string | null): string[] {
  a = a || {}
  return [
    name || null,
    [a.address_1 || a.address1 || a.street, a.address_2 || a.address2].filter(Boolean).join(', ') || null,
    [a.city || a.suburb, (a.state || '').toUpperCase(), a.postcode].filter(Boolean).join(' ') || null,
    a.country || null,
  ].filter(Boolean) as string[]
}

// Outlet contact lines for the header, drawn from the company + primary location.
function contactLines(company: any, from: any): { label: string; value: string }[] {
  const phone = company?.business_phone || company?.phone || from?.phone
  const email = company?.business_email || company?.email
  const website = company?.website || company?.business_website || company?.site_url
  const out: { label: string; value: string }[] = []
  if (phone) out.push({ label: '☎', value: String(phone) })
  if (email) out.push({ label: '✉', value: String(email) })
  if (website) out.push({ label: '🌐', value: String(website).replace(/^https?:\/\//, '') })
  return out
}

function PackingSlip({ order, items, notes, sentByKey, company, from, accent }: any) {
  const ship = order.shipping_address || {}
  const total = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0)
  // Which lines are already sent (partial fulfilment) — cross them out so the
  // packer knows not to pack them again.
  const lineKeys = buildOrderLineKeys(items)
  const isSent = (it: any) => !!(sentByKey && sentByKey[lineKeys.get(it.id) || ''])
  const anySent = items.some(isSent)
  const barcode = useMemo(() => barcodeSVG(String(order.order_number || ''), { moduleWidth: 1.5, height: 52 }), [order.order_number])
  const subtotal = order.subtotal != null ? Number(order.subtotal) : items.reduce((s: number, it: any) => s + (Number(it.total_price) || 0), 0)
  const shipping = Number(order.shipping_total) || 0
  const grand = order.total != null ? Number(order.total) : subtotal + shipping
  const tax = Math.max(0, grand - subtotal - shipping)
  const isClickCollectSlip = isClickCollect(order)
  const customerNote = order.customer_note || order.note || ''
  const internalNotes = (notes || []).filter((n: any) => (n.body || '').trim())
  const contacts = contactLines(company, from)
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', padding: '8px 8px', borderBottom: '2px solid #0f172a' }
  const td: React.CSSProperties = { fontSize: 13, padding: '9px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }
  return (
    <div className="doc-page" style={{ maxWidth: 720, margin: '0 auto', padding: '10px 20px 26px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 14, borderBottom: `3px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt="" style={{ height: 44, objectFit: 'contain' }} />
            : <div style={{ width: 44, height: 44, borderRadius: 9, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{(company?.name || 'C')[0]}</div>}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{company?.name || 'Company'}</div>
            {addrLines(from).slice(1).map((l, i) => <div key={i} style={{ fontSize: 11.5, color: '#64748b' }}>{l}</div>)}
            {contacts.map((c, i) => <div key={`c${i}`} style={{ fontSize: 11.5, color: '#64748b' }}><span style={{ opacity: 0.7 }}>{c.label}</span> {c.value}</div>)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>PACKING SLIP</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 2 }}>Order {order.order_number}</div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{order.order_date ? new Date(order.order_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</div>
          <div style={{ marginTop: 8, display: 'inline-block', width: 200 }} dangerouslySetInnerHTML={{ __html: barcode.replace('<svg ', '<svg style="width:100%;height:40px" ') }} />
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: '#0f172a' }}>{order.order_number}</div>
        </div>
      </div>

      {/* Addresses */}
      <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Ship To</div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
            {addrLines(ship, order.customer_name).map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</div>)}
            {order.customer_phone && <div style={{ color: '#64748b' }}>{order.customer_phone}</div>}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Order Details</div>
          <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7 }}>
            <div><span style={{ color: '#64748b' }}>Order #:</span> <strong>{order.order_number}</strong></div>
            <div><span style={{ color: '#64748b' }}>Channel:</span> {order.sales_channel || '—'}</div>
            <div><span style={{ color: '#64748b' }}>Payment:</span> {order.payment_status || '—'}</div>
            {order.customer_email && <div><span style={{ color: '#64748b' }}>Email:</span> {order.customer_email}</div>}
          </div>
        </div>
      </div>

      {/* Partial-fulfilment notice for the packer */}
      {anySent && (
        <div style={{ marginTop: 16, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, fontWeight: 700 }}>
          ✕ Partially fulfilled — crossed-out items have already been sent. Do not pack them again.
        </div>
      )}

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 46 }}></th>
            <th style={th}>Item</th>
            <th style={th}>SKU</th>
            <th style={{ ...th, textAlign: 'right' }}>Unit Price</th>
            <th style={{ ...th, textAlign: 'center' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => {
            const qty = Number(it.quantity) || 1
            const line = it.total_price != null ? Number(it.total_price) : (Number(it.unit_price) || 0) * qty
            const unit = it.unit_price != null ? Number(it.unit_price) : line / qty
            const sent = isSent(it)
            const strike: React.CSSProperties = sent ? { textDecoration: 'line-through', color: '#94a3b8' } : {}
            return (
              <tr key={it.id} style={sent ? { background: '#f8fafc' } : undefined}>
                <td style={{ ...td, width: 46 }}>
                  <span style={{ position: 'relative', display: 'inline-flex', width: 38, height: 38, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                    {it.image_url
                      ? <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: sent ? 0.5 : 1 }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} />
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>}
                    {sent && (
                      <svg viewBox="0 0 38 38" width="38" height="38" style={{ position: 'absolute', inset: 0 }} stroke="#dc2626" strokeWidth="3" strokeLinecap="round">
                        <line x1="6" y1="6" x2="32" y2="32" /><line x1="32" y1="6" x2="6" y2="32" />
                      </svg>
                    )}
                  </span>
                </td>
                <td style={td}>
                  <span style={strike}>{it.product_name || 'Item'}</span>
                  {sent && <span style={{ marginLeft: 8, display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: '#dc2626', border: '1.5px solid #dc2626', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>✕ ALREADY SENT</span>}
                </td>
                <td style={{ ...td, color: '#475569', fontFamily: 'ui-monospace, monospace', fontSize: 12, ...strike }}>{it.sku || '—'}</td>
                <td style={{ ...td, textAlign: 'right', ...strike }}>{fmtMoney(unit, order.currency)}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700, ...strike }}>{qty}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, ...strike }}>{fmtMoney(line, order.currency)}</td>
              </tr>
            )
          })}
          {items.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No items on this order.</td></tr>}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <table style={{ minWidth: 260, borderCollapse: 'collapse' }}>
          <tbody>
            {([
              ['Total units', String(total), false],
              ['Subtotal', fmtMoney(subtotal, order.currency), false],
              ['Tax (GST)', fmtMoney(tax, order.currency), false],
              ['Shipping', isClickCollectSlip ? 'Click & Collect' : (shipping > 0 ? fmtMoney(shipping, order.currency) : 'Free'), false],
              ['Grand Total', `${fmtMoney(grand, order.currency)} ${order.currency || ''}`, true],
            ] as [string, string, boolean][]).map(([k, v, strong]) => (
              <tr key={k} style={{ borderTop: strong ? '2px solid #0f172a' : '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 10px', fontSize: strong ? 13.5 : 12.5, color: strong ? '#0f172a' : '#64748b', fontWeight: strong ? 800 : 500 }}>{k}</td>
                <td style={{ padding: '6px 10px', fontSize: strong ? 14 : 12.5, textAlign: 'right', fontWeight: strong ? 800 : 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes — customer note (from checkout) + internal notes */}
      {(customerNote || internalNotes.length > 0) && (
        <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
          {customerNote && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Customer Note</div>
              <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: '#0f172a', padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{customerNote}</div>
            </div>
          )}
          {internalNotes.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Internal Notes</div>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {internalNotes.map((n: any) => (
                  <div key={n.id} style={{ fontSize: 12, lineHeight: 1.45, color: '#0f172a', padding: '7px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    <div style={{ marginTop: 3, fontSize: 10, color: '#94a3b8' }}>{n.author_name || 'Staff'}{n.created_at ? ` · ${new Date(n.created_at).toLocaleDateString('en-AU')}` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11.5, color: '#94a3b8' }}>
        Thank you for your order{company?.website ? ` · ${String(company.website).replace(/^https?:\/\//, '')}` : ''}
      </div>
    </div>
  )
}

function LabelDoc({ order, ship, senderName, from, accent }: any) {
  const carrier = ship?.carrier || order.carrier || 'custom'
  const tn = ship?.tracking_number || order.tracking_number || order.order_number
  const service = ship?.service || order.shipping_method || ''
  const to = order.shipping_address || {}
  const svg = useMemo(() => barcodeSVG(String(tn), { moduleWidth: 1.5, height: 60 }), [tn])
  return (
    <div className="doc-page" style={{ width: '4in', minHeight: '6in', margin: '0 auto', padding: '0.18in', boxSizing: 'border-box', border: '2px solid #000', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 800, textTransform: 'uppercase' }}>{CARRIER_LABEL[carrier] || carrier}</div>
        {service && <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', border: '1.5px solid #000', borderRadius: 4 }}>{service}</div>}
      </div>
      <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.35 }}>
        <span style={{ fontWeight: 700 }}>FROM: </span>{senderName}
        {addrLines(from).slice(1).map((l: string, i: number) => <div key={i} style={{ paddingLeft: 34 }}>{l}</div>)}
      </div>
      <div style={{ marginTop: 10, border: '2px solid #000', padding: '10px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>DELIVER TO</div>
        <div style={{ marginTop: 4 }}>
          {addrLines(to, order.customer_name).map((l: string, i: number) => (
            <div key={i} style={{ fontSize: i === 0 ? 18 : 15, fontWeight: i === 0 ? 800 : 600, lineHeight: 1.3 }}>{l}</div>
          ))}
          {order.customer_phone && <div style={{ fontSize: 12, marginTop: 3 }}>{order.customer_phone}</div>}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <div><span style={{ fontWeight: 700 }}>ORDER:</span> {order.order_number}</div>
        <div><span style={{ fontWeight: 700 }}>WEIGHT:</span> {ship?.weight_grams ? `${(ship.weight_grams / 1000).toFixed(2)} kg` : '—'}</div>
      </div>
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: '100%' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:60px" ') }} />
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', marginTop: 2 }}>{tn}</div>
        {carrierTrackUrl(carrier, tn) && <div style={{ fontSize: 8.5, color: '#333', marginTop: 3 }}>Track at {(carrierTrackUrl(carrier, tn) || '').replace(/^https?:\/\//, '').split('/')[0]}</div>}
      </div>
      {!ship?.tracking_url && (
        <div style={{ marginTop: 10, fontSize: 8, color: '#666', textAlign: 'center' }}>Printable label · not yet lodged with the carrier</div>
      )}
    </div>
  )
}
