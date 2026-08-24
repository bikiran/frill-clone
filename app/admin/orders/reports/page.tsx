'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { fmtMoney, channelMeta } from '@/lib/orders'

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
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<Report>('fulfillment')
  const [range, setRange] = useState('30d')
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([])
  const [location, setLocation] = useState('all')
  const [channel, setChannel] = useState('all')

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) { const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle(); return co?.id || null }
    return null
  }

  // The aggregates are computed SERVER-SIDE — the page fetches a compact summary
  // (a few KB) instead of every order row, so it's instant regardless of how many
  // orders the window contains. A stale summary stays on screen while the new
  // range loads, so switching ranges never blanks the report.
  const load = useCallback(async (cid: string, rangeKey: string, loc: string, chan: string) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const params = new URLSearchParams({ companyId: cid, range: rangeKey })
      if (loc && loc !== 'all') params.set('location', loc)
      if (chan && chan !== 'all') params.set('channel', chan)
      const res = await fetch(`/api/orders/reports?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = await res.json().catch(() => ({}))
      if (res.ok && !j.error) setSummary(j)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      // Accent shouldn't gate the report — load it detached.
      ;(async () => { try { const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', cid).maybeSingle(); if (co?.accent_color) setAccent(co.accent_color) } catch {} })()
      // Outlets for the location filter.
      ;(async () => { try { const { data } = await (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false }); setOutlets((data || []).map((l: any) => ({ id: l.id, name: l.label || l.suburb || 'Outlet' }))) } catch {} })()
      load(cid, range, location, channel)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refetch when the range or a filter changes (server returns a tiny summary).
  const firstRangeRef = useRef(true)
  useEffect(() => {
    if (firstRangeRef.current) { firstRangeRef.current = false; return }
    if (companyId) load(companyId, range, location, channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, location, channel])

  const days = RANGES.find(r => r.key === range)?.days ?? null
  const fulfil = summary?.fulfil || { total: 0, shipped: 0, cancelled: 0, awaiting: 0, onHold: 0, rate: 0, avgHrs: 0, buckets: { fresh: 0, mod: 0, late: 0 }, byStatus: [] }
  const shippingR = summary?.shipping || { labels: 0, cost: 0, avg: 0, charged: 0, margin: 0, detail: [], carriers: [], services: [], track: [] }
  const sales = summary?.sales || { revenue: 0, orderN: 0, aov: 0, units: 0, channels: [], topSku: [] }

  const ACCENT = accent

  // CSV pulls the raw rows for the window on demand (only when exporting), so the
  // report itself never loads them.
  const exportCsv = async () => {
    if (!companyId) return
    const sinceISO = days != null ? new Date(Date.now() - days * 864e5).toISOString() : null
    const acc: any[] = []
    for (let offset = 0; offset < 500000; offset += 1000) {
      let q = (supabase as any).from('orders').select('order_number, order_date, customer_name, status, sales_channel, item_count, total, carrier, tracking_number').eq('company_id', companyId)
      if (sinceISO) q = q.gte('order_date', sinceISO)
      if (location !== 'all') q = location === 'unassigned' ? q.is('store_location_id', null) : q.eq('store_location_id', location)
      if (channel !== 'all') q = q.eq('sales_channel', channel)
      const { data, error } = await q.order('order_date', { ascending: false }).range(offset, offset + 999)
      if (error || !data?.length) break
      acc.push(...data)
      if (data.length < 1000) break
    }
    const rows = [['Order', 'Date', 'Customer', 'Status', 'Channel', 'Items', 'Total', 'Carrier', 'Tracking']]
    for (const o of acc) rows.push([o.order_number, o.order_date || '', o.customer_name || '', o.status || '', o.sales_channel || '', String(o.item_count || 0), String(o.total || 0), o.carrier || '', o.tracking_number || ''])
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

  const dailyOrders = summary?.dailyOrders || []
  const dailyRevenue = summary?.dailyRevenue || []

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
          {outlets.length > 0 && (
            <select value={location} onChange={e => setLocation(e.target.value)} style={ctrl} title="Filter by outlet">
              <option value="all">All outlets</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="unassigned">Unassigned</option>
            </select>
          )}
          <select value={channel} onChange={e => setChannel(e.target.value)} style={ctrl} title="Filter by sales channel">
            <option value="all">All channels</option>
            {(summary?.channelsAll || []).map((c: string) => <option key={c} value={c}>{channelMeta(c).label}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)} style={ctrl}>{RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          {(location !== 'all' || channel !== 'all') && (
            <button type="button" onClick={() => { setLocation('all'); setChannel('all') }} style={{ ...ctrl, color: ACCENT }}>Clear filters</button>
          )}
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
            <DailyChart series={dailyOrders} />
          </div>
        </div>
      )}

      {report === 'shipping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi label="Charged to Customer" value={fmtMoney(shippingR.charged)} color="#16a34a" />
            <Kpi label="Actual Cost (incurred)" value={fmtMoney(shippingR.cost)} color="#dc2626" />
            <Kpi label="Margin" value={fmtMoney(shippingR.margin)} color={shippingR.margin >= 0 ? '#16a34a' : '#dc2626'} />
            <Kpi label="Labels Created" value={String(shippingR.labels)} />
            <Kpi label="Avg Cost / Label" value={fmtMoney(shippingR.avg)} />
          </div>

          {/* Per tracking / per customer: charged vs actual */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <p style={{ ...kick, padding: '16px 18px 0' }}>Shipping — Charged vs Actual (per tracking)</p>
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>{['Order', 'Customer', 'Carrier', 'Tracking', 'Charged', 'Actual', 'Margin'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', textAlign: i >= 4 ? 'right' : 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {shippingR.detail.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>No shipments in this range. Charged-to-customer totals above still reflect what customers paid for shipping.</td></tr>}
                  {shippingR.detail.slice(0, 200).map((r: any) => { const m = r.charged - r.incurred; return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 700, color: ACCENT }}>{r.order}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12.5 }}>{r.customer}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12.5, color: 'var(--slate)' }}>{r.carrier}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--slate)', fontFamily: 'ui-monospace, monospace' }}>{r.tracking}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.charged)}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12.5, textAlign: 'right', color: r.incurred ? 'var(--ink)' : 'var(--slate)' }}>{r.incurred ? fmtMoney(r.incurred) : '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12.5, textAlign: 'right', fontWeight: 700, color: m >= 0 ? '#16a34a' : '#dc2626' }}>{fmtMoney(m)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            {shippingR.detail.length > 200 && <p style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--slate)' }}>Showing first 200 of {shippingR.detail.length}. Export CSV for the full list.</p>}
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
            <DailyChart series={dailyRevenue} color="#16a34a" money />
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
