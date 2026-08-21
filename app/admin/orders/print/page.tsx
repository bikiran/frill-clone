'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { fmtMoney, CARRIER_LABEL, carrierTrackUrl } from '@/lib/orders'
import { barcodeSVG } from '@/lib/barcode'

type Order = any

// Print-optimised packing slips + shipping labels. Opened in a new tab from the
// Orders board (drawer or bulk toolbar) as:
//   /admin/orders/print?doc=packing_slip&company=<id>&ids=<a,b,c>
//   /admin/orders/print?doc=label&company=<id>&ids=<a,b,c>
export default function OrdersPrintPage() {
  const [doc, setDoc] = useState<'packing_slip' | 'label'>('packing_slip')
  const [orders, setOrders] = useState<Order[]>([])
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({})
  const [shipByOrder, setShipByOrder] = useState<Record<string, any>>({})
  const [company, setCompany] = useState<any>(null)
  const [fromAddr, setFromAddr] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoPrinted, setAutoPrinted] = useState(false)

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search)
      const d = (p.get('doc') as any) === 'label' ? 'label' : 'packing_slip'
      setDoc(d)
      const ids = (p.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
      let cid = p.get('company') || peekCompanyUser()?.companyId || null
      if (!cid || !ids.length) { setLoading(false); return }

      // Orders through the service-role API (RLS-proof), preserving the requested order.
      let rows: Order[] = []
      try {
        const { data: s } = await supabase.auth.getSession()
        const token = s?.session?.access_token
        const res = await fetch(`/api/orders?companyId=${encodeURIComponent(cid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const j = await res.json().catch(() => ({}))
        const byId = new Map<string, Order>((j.orders || []).map((o: Order) => [o.id, o]))
        rows = ids.map(id => byId.get(id)).filter(Boolean) as Order[]
      } catch {}
      setOrders(rows)

      const [{ data: co }, { data: loc }, { data: items }, { data: ships }] = await Promise.all([
        (supabase as any).from('companies').select('*').eq('id', cid).maybeSingle(),
        (supabase as any).from('company_locations').select('*').eq('company_id', cid).order('is_primary', { ascending: false }).limit(1).maybeSingle(),
        (supabase as any).from('order_items').select('*').in('order_id', ids),
        (supabase as any).from('order_shipments').select('*').in('order_id', ids).order('created_at', { ascending: false }),
      ])
      setCompany(co || null)
      setFromAddr(loc || null)
      const ib: Record<string, any[]> = {}
      for (const it of items || []) (ib[it.order_id] ||= []).push(it)
      setItemsByOrder(ib)
      const sb: Record<string, any> = {}
      for (const sh of ships || []) if (!sb[sh.order_id]) sb[sh.order_id] = sh // latest first
      setShipByOrder(sb)
      setLoading(false)
    })()
  }, [])

  // Auto-open the print dialog once content is on screen.
  useEffect(() => {
    if (!loading && orders.length && !autoPrinted) {
      setAutoPrinted(true)
      const t = setTimeout(() => { try { window.print() } catch {} }, 350)
      return () => clearTimeout(t)
    }
  }, [loading, orders, autoPrinted])

  const accent = company?.accent_color || '#0f172a'
  const senderName = company?.name || 'Warehouse'

  if (loading) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>Preparing documents…</div>
  if (!orders.length) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>Nothing to print. Close this tab and try again from the Orders board.</div>

  return (
    <div className="print-root" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif', color: '#0f172a', background: '#fff' }}>
      <style>{`
        @media print {
          @page { size: ${doc === 'label' ? '4in 6in' : 'A4'}; margin: ${doc === 'label' ? '0' : '14mm'}; }
          body * { visibility: hidden; }
          .print-root, .print-root * { visibility: visible; }
          .print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .doc-page { page-break-after: always; }
          .doc-page:last-child { page-break-after: auto; }
        }
        .doc-page { box-sizing: border-box; }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print" style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#0f172a', color: '#fff', zIndex: 10 }}>
        <strong style={{ fontSize: 14 }}>{doc === 'label' ? 'Shipping Labels' : 'Packing Slips'}</strong>
        <span style={{ fontSize: 12.5, opacity: 0.8 }}>{orders.length} document{orders.length === 1 ? '' : 's'}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Print</button>
        <button onClick={() => window.close()} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
      </div>

      <div style={{ padding: doc === 'label' ? 0 : '10px 0' }}>
        {orders.map(o => doc === 'label'
          ? <LabelDoc key={o.id} order={o} ship={shipByOrder[o.id]} senderName={senderName} from={fromAddr} accent={accent} />
          : <PackingSlip key={o.id} order={o} items={itemsByOrder[o.id] || []} company={company} from={fromAddr} accent={accent} />
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

function PackingSlip({ order, items, company, from, accent }: any) {
  const ship = order.shipping_address || {}
  const total = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0)
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', padding: '8px 8px', borderBottom: '2px solid #0f172a' }
  const td: React.CSSProperties = { fontSize: 13, padding: '9px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }
  return (
    <div className="doc-page" style={{ maxWidth: 720, margin: '0 auto', padding: '10px 20px 26px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 14, borderBottom: `3px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt="" style={{ height: 40, objectFit: 'contain' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 9, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{(company?.name || 'C')[0]}</div>}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{company?.name || 'Company'}</div>
            {addrLines(from).slice(1).map((l, i) => <div key={i} style={{ fontSize: 11.5, color: '#64748b' }}>{l}</div>)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>PACKING SLIP</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 2 }}>Order {order.order_number}</div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{order.order_date ? new Date(order.order_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</div>
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

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '55%' }}>Item</th>
            <th style={th}>SKU</th>
            <th style={{ ...th, textAlign: 'center' }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => (
            <tr key={it.id}>
              <td style={td}>{it.product_name || 'Item'}</td>
              <td style={{ ...td, color: '#475569', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{it.sku || '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No items on this order.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: '10px 8px', fontWeight: 700 }} />
            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: 12 }}>Total units</td>
            <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: 15 }}>{total}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11.5, color: '#94a3b8' }}>
        Thank you for your order{company?.website ? ` · ${company.website}` : ''}
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
      {/* Carrier band */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 800, textTransform: 'uppercase' }}>{CARRIER_LABEL[carrier] || carrier}</div>
        {service && <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', border: '1.5px solid #000', borderRadius: 4 }}>{service}</div>}
      </div>

      {/* From */}
      <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.35 }}>
        <span style={{ fontWeight: 700 }}>FROM: </span>{senderName}
        {addrLines(from).slice(1).map((l: string, i: number) => <div key={i} style={{ paddingLeft: 34 }}>{l}</div>)}
      </div>

      {/* To — big */}
      <div style={{ marginTop: 10, border: '2px solid #000', padding: '10px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>DELIVER TO</div>
        <div style={{ marginTop: 4 }}>
          {addrLines(to, order.customer_name).map((l: string, i: number) => (
            <div key={i} style={{ fontSize: i === 0 ? 18 : 15, fontWeight: i === 0 ? 800 : 600, lineHeight: 1.3 }}>{l}</div>
          ))}
          {order.customer_phone && <div style={{ fontSize: 12, marginTop: 3 }}>{order.customer_phone}</div>}
        </div>
      </div>

      {/* Order ref */}
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <div><span style={{ fontWeight: 700 }}>ORDER:</span> {order.order_number}</div>
        <div><span style={{ fontWeight: 700 }}>WEIGHT:</span> {ship?.weight_grams ? `${(ship.weight_grams / 1000).toFixed(2)} kg` : '—'}</div>
      </div>

      {/* Barcode */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: '100%' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:60px" ') }} />
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', marginTop: 2 }}>{tn}</div>
        {carrierTrackUrl(carrier, tn) && <div style={{ fontSize: 8.5, color: '#333', marginTop: 3 }}>Track at {(carrierTrackUrl(carrier, tn) || '').replace(/^https?:\/\//, '').split('/')[0]}</div>}
      </div>

      {!ship?.tracking_url && (
        <div style={{ marginTop: 10, fontSize: 8, color: '#666', textAlign: 'center' }}>
          Printable label · not yet lodged with the carrier
        </div>
      )}
    </div>
  )
}
