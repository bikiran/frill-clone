'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { statusMeta, channelMeta, fmtMoney, CARRIER_LABEL } from '@/lib/orders'

type Order = any
type Report = 'fulfillment' | 'shipping' | 'sales'

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
]

export default function OrdersReportsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [accent, setAccent] = useState('var(--coral)')
  const [orders, setOrders] = useState<Order[]>([])
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<Report>('fulfillment')
  const [range, setRange] = useState('30d')

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) { const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle(); return co?.id || null }
    return null
  }

  const load = useCallback(async (cid: string) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch(`/api/orders?companyId=${encodeURIComponent(cid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const j = await res.json().catch(() => ({}))
      setOrders(Array.isArray(j.orders) ? j.orders : [])
    } catch { setOrders([]) }
    try { const { data: sh } = await (supabase as any).from('order_shipments').select('*').eq('company_id', cid).limit(5000); setShipments(sh || []) } catch { setShipments([]) }
  }, [])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      try { const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', cid).maybeSingle(); if (co?.accent_color) setAccent(co.accent_color) } catch {}
      await load(cid)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const days = RANGES.find(r => r.key === range)?.days ?? null
  const since = days != null ? Date.now() - days * 864e5 : 0
  const inRange = useMemo(() => orders.filter(o => !since || (o.order_date && new Date(o.order_date).getTime() >= since)), [orders, since])
  const rangeIds = useMemo(() => new Set(inRange.map(o => o.id)), [inRange])
  const shipsInRange = useMemo(() => shipments.filter(s => rangeIds.has(s.order_id) || (s.created_at && (!since || new Date(s.created_at).getTime() >= since))), [shipments, rangeIds, since])

  const ACCENT = accent

  const exportCsv = () => {
    const rows = [['Order', 'Date', 'Customer', 'Status', 'Channel', 'Items', 'Total', 'Carrier', 'Tracking']]
    for (const o of inRange) rows.push([o.order_number, o.order_date || '', o.customer_name || '', o.status || '', o.sales_channel || '', String(o.item_count || 0), String(o.total || 0), o.carrier || '', o.tracking_number || ''])
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `orders-${report}-${range}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)' }
  const ctrl: React.CSSProperties = { padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card, #fff)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', outline: 'none' }
  const kick: React.CSSProperties = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }

  const Kpi = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ ...card, padding: '14px 16px', flex: 1, minWidth: 130 }}>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--slate)' }}>{label}</p>
      <p style={{ margin: '5px 0 0', fontSize: 23, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</p>
    </div>
  )
  const Bars = ({ rows }: { rows: { label: string; value: number; color?: string; sub?: string }[] }) => {
    const max = Math.max(1, ...rows.map(r => r.value))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
        {rows.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No data in this range.</p>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 130, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <div style={{ flex: 1, background: 'var(--canvas)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: r.color || ACCENT, borderRadius: 6, minWidth: r.value > 0 ? 3 : 0, transition: 'width .3s' }} />
            </div>
            <span style={{ width: 78, textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>{r.sub ?? r.value}</span>
          </div>
        ))}
      </div>
    )
  }
  const DailyChart = ({ series, color, money }: { series: { day: string; value: number }[]; color?: string; money?: boolean }) => {
    const max = Math.max(1, ...series.map(s => s.value))
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
          {series.map((s, i) => (
            <div key={i} title={`${s.day}: ${money ? fmtMoney(s.value) : s.value}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${(s.value / max) * 100}%`, background: color || ACCENT, borderRadius: '3px 3px 0 0', minHeight: s.value > 0 ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: 'var(--slate)' }}>
          <span>{series[0]?.day}</span><span>{series[series.length - 1]?.day}</span>
        </div>
      </div>
    )
  }

  // ── Computations ────────────────────────────────────────────────────────────
  const dailySeries = (valueOf: (o: Order) => number) => {
    const n = days || 30
    const out: { day: string; value: number }[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const byDay: Record<string, number> = {}
    for (const o of inRange) { if (!o.order_date) continue; const d = new Date(o.order_date); d.setHours(0, 0, 0, 0); const k = d.toISOString().slice(0, 10); byDay[k] = (byDay[k] || 0) + valueOf(o) }
    for (let i = n - 1; i >= 0; i--) { const d = new Date(today.getTime() - i * 864e5); const k = d.toISOString().slice(0, 10); out.push({ day: d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }), value: byDay[k] || 0 }) }
    return out
  }

  const fulfil = useMemo(() => {
    const total = inRange.length
    const shipped = inRange.filter(o => o.status === 'shipped').length
    const cancelled = inRange.filter(o => o.status === 'cancelled').length
    const awaiting = inRange.filter(o => o.status === 'awaiting_shipment').length
    const onHold = inRange.filter(o => o.status === 'on_hold').length
    const rate = total - cancelled > 0 ? Math.round((shipped / (total - cancelled)) * 100) : 0
    const shipTimes = inRange.filter(o => o.status === 'shipped' && o.shipped_at && o.order_date).map(o => new Date(o.shipped_at).getTime() - new Date(o.order_date).getTime()).filter(ms => ms > 0)
    const avgHrs = shipTimes.length ? shipTimes.reduce((a, b) => a + b, 0) / shipTimes.length / 3600e3 : 0
    const now = Date.now()
    const unshipped = inRange.filter(o => !['shipped', 'cancelled'].includes(o.status))
    const buckets = { fresh: 0, mod: 0, late: 0 }
    for (const o of unshipped) { if (!o.order_date) continue; const h = (now - new Date(o.order_date).getTime()) / 3600e3; if (h < 12) buckets.fresh++; else if (h < 48) buckets.mod++; else buckets.late++ }
    const statuses = ['awaiting_shipment', 'packed', 'on_hold', 'click_and_collect', 'shipped', 'cancelled']
    const byStatus = statuses.map(s => ({ label: statusMeta(s).label, value: inRange.filter(o => o.status === s).length, color: statusMeta(s).fg })).filter(r => r.value > 0)
    return { total, shipped, cancelled, awaiting, onHold, rate, avgHrs, buckets, byStatus }
  }, [inRange, days])

  const shippingR = useMemo(() => {
    const labels = shipsInRange.length
    const cost = shipsInRange.reduce((a, s) => a + (Number(s.cost) || 0), 0)
    const avg = labels ? cost / labels : 0
    const byCarrier: Record<string, { n: number; cost: number }> = {}
    for (const s of shipsInRange) { const k = s.carrier || 'custom'; (byCarrier[k] ||= { n: 0, cost: 0 }); byCarrier[k].n++; byCarrier[k].cost += Number(s.cost) || 0 }
    const carriers = Object.entries(byCarrier).map(([k, v]) => ({ label: CARRIER_LABEL[k] || k, value: v.n, sub: String(v.n) })).sort((a, b) => b.value - a.value)
    const byService: Record<string, number> = {}
    for (const s of shipsInRange) { const k = s.service || 'Unspecified'; byService[k] = (byService[k] || 0) + 1 }
    const services = Object.entries(byService).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8)
    const byTrack: Record<string, number> = {}
    for (const s of shipsInRange) { const k = s.status || 'created'; byTrack[k] = (byTrack[k] || 0) + 1 }
    const track = Object.entries(byTrack).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v }))
    return { labels, cost, avg, carriers, services, track }
  }, [shipsInRange])

  const sales = useMemo(() => {
    const nonCancelled = inRange.filter(o => o.status !== 'cancelled')
    const revenue = nonCancelled.reduce((a, o) => a + (Number(o.total) || 0), 0)
    const orderN = nonCancelled.length
    const aov = orderN ? revenue / orderN : 0
    const units = nonCancelled.reduce((a, o) => a + (Number(o.item_count) || 0), 0)
    const byChannel: Record<string, { n: number; rev: number }> = {}
    for (const o of nonCancelled) { const k = o.sales_channel || 'other'; (byChannel[k] ||= { n: 0, rev: 0 }); byChannel[k].n++; byChannel[k].rev += Number(o.total) || 0 }
    const channels = Object.entries(byChannel).map(([k, v]) => ({ label: `${channelMeta(k).icon} ${channelMeta(k).label}`, value: v.rev, sub: fmtMoney(v.rev) })).sort((a, b) => b.value - a.value)
    const bySku: Record<string, number> = {}
    for (const o of nonCancelled) { const k = o.primary_sku; if (!k) continue; bySku[k] = (bySku[k] || 0) + 1 }
    const topSku = Object.entries(bySku).map(([k, v]) => ({ label: k, value: v, sub: `${v} orders` })).sort((a, b) => b.value - a.value).slice(0, 8)
    return { revenue, orderN, aov, units, channels, topSku }
  }, [inRange])

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading reports…</div>

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`@media print { .no-print { display:none!important } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Order Reports</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>Fulfilment, shipping and sales performance</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={range} onChange={e => setRange(e.target.value)} style={ctrl}>{RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          <button type="button" onClick={exportCsv} style={ctrl}>Export CSV</button>
          <button type="button" onClick={() => window.print()} style={ctrl}>Print</button>
        </div>
      </div>

      {/* Report selector */}
      <div className="no-print" style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {([['fulfillment', 'Order Fulfilment'], ['shipping', 'Shipping'], ['sales', 'Sales']] as [Report, string][]).map(([k, label]) => {
          const active = report === k
          return <button key={k} type="button" onClick={() => setReport(k)} style={{ padding: '8px 2px', background: 'none', border: 'none', borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`, color: active ? ACCENT : 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        })}
      </div>

      {report === 'fulfillment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi label="Total Orders" value={String(fulfil.total)} />
            <Kpi label="Shipped" value={String(fulfil.shipped)} color="#16a34a" />
            <Kpi label="Awaiting" value={String(fulfil.awaiting)} color={ACCENT} />
            <Kpi label="On Hold" value={String(fulfil.onHold)} color="#d97706" />
            <Kpi label="Fulfilment Rate" value={`${fulfil.rate}%`} />
            <Kpi label="Avg Time to Ship" value={fulfil.avgHrs ? `${fulfil.avgHrs.toFixed(1)} h` : '—'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Unshipped Backlog by Age</p>
              <Bars rows={[
                { label: 'Fresh (< 12h)', value: fulfil.buckets.fresh, color: '#16a34a' },
                { label: 'Ageing (12–48h)', value: fulfil.buckets.mod, color: '#d97706' },
                { label: 'Delayed (> 48h)', value: fulfil.buckets.late, color: '#dc2626' },
              ]} />
            </div>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Orders by Status</p>
              <Bars rows={fulfil.byStatus} />
            </div>
          </div>
          <div style={{ ...card, padding: 18 }}>
            <p style={kick}>Orders per Day</p>
            <DailyChart series={dailySeries(() => 1)} />
          </div>
        </div>
      )}

      {report === 'shipping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi label="Labels Created" value={String(shippingR.labels)} />
            <Kpi label="Shipped Orders" value={String(fulfil.shipped)} color="#16a34a" />
            <Kpi label="Shipping Cost" value={fmtMoney(shippingR.cost)} />
            <Kpi label="Avg Cost / Label" value={fmtMoney(shippingR.avg)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Shipments by Carrier</p>
              <Bars rows={shippingR.carriers} />
            </div>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Shipments by Service</p>
              <Bars rows={shippingR.services} />
            </div>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Tracking Status</p>
              <Bars rows={shippingR.track} />
            </div>
          </div>
          {shippingR.labels === 0 && <div style={{ ...card, padding: 18, fontSize: 13, color: 'var(--slate)' }}>No labels created in this range yet. Create a label from an order to populate the shipping report.</div>}
        </div>
      )}

      {report === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi label="Revenue" value={fmtMoney(sales.revenue)} color="#16a34a" />
            <Kpi label="Orders" value={String(sales.orderN)} />
            <Kpi label="Avg Order Value" value={fmtMoney(sales.aov)} />
            <Kpi label="Units Sold" value={String(sales.units)} />
          </div>
          <div style={{ ...card, padding: 18 }}>
            <p style={kick}>Revenue per Day</p>
            <DailyChart series={dailySeries(o => o.status === 'cancelled' ? 0 : (Number(o.total) || 0))} color="#16a34a" money />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Revenue by Channel</p>
              <Bars rows={sales.channels} />
            </div>
            <div style={{ ...card, padding: 18 }}>
              <p style={kick}>Top SKUs (by orders)</p>
              <Bars rows={sales.topSku} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
