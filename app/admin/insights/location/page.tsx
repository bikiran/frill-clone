'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

type Order = {
  id: string
  customer_email: string | null
  woo_customer_id: number | null
  total: number
  order_date: string | null
  status: string | null
  line_items: any[]
  billing: any
}

const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)
const pct = (n: number) => `${Math.round(n)}%`
const titleCase = (s: string) =>
  s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}

const PAID = ['processing', 'completed', 'on-hold']
const DEAD = ['cancelled', 'refunded', 'failed', 'trash', 'checkout-draft', 'draft', 'pending', 'pending-payment']

export default function LocationInsightsPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'all' | 'custom'>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [suburb, setSuburb] = useState('')

  useEffect(() => {
    ;(async () => {
      // Live fetch FIRST — endpoint resolves the company from the host, so no
      // client-side lookup (which can throw under RLS) blocks it.
      let loaded: any[] = []
      try {
        const res = await fetch('/api/orders/all')
        const j = await res.json()
        if (Array.isArray(j.orders)) loaded = j.orders
      } catch { /* fall back below */ }
      if (loaded.length === 0) {
        try {
          let cid: string | null = null
          const host = typeof window !== 'undefined' ? window.location.hostname : ''
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
          if (cid) {
            setCompanyId(cid)
            const { data } = await (supabase as any).from('woocommerce_orders')
              .select('id, customer_email, woo_customer_id, total, order_date, status, line_items, billing')
              .eq('company_id', cid).order('order_date', { ascending: false }).limit(3000)
            loaded = data || []
          }
        } catch { /* leave empty */ }
      }
      setOrders(loaded)
      setLoading(false)
    })()
  }, [])

  // ── Date window ────────────────────────────────────────────────────────────
  const window = useMemo(() => {
    const now = new Date()
    if (range === 'all') return { start: new Date(0), end: new Date(8640000000000000) }
    if (range === 'custom') {
      return {
        start: from ? new Date(from + 'T00:00:00') : new Date(0),
        end: to ? new Date(to + 'T23:59:59') : now,
      }
    }
    const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
    return { start: new Date(now.getTime() - days * 86400000), end: now }
  }, [range, from, to])

  const suburbOf = (o: Order): string => {
    const c = o.billing?.city || o.billing?.suburb || ''
    return c ? titleCase(String(c).trim()) : 'Unknown'
  }
  const customerOf = (o: Order): string =>
    (o.woo_customer_id ? `c${o.woo_customer_id}` : (o.customer_email || '').toLowerCase()) || 'guest'

  // ── Filtered orders ─────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    return orders.filter(o => {
      const d = parseTs(o.order_date)
      if (!d) return range === 'all'
      if (d < window.start || d > window.end) return false
      if (suburb && suburbOf(o) !== suburb) return false
      return true
    })
  }, [orders, window, suburb, range])

  const suburbList = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => set.add(suburbOf(o)))
    return Array.from(set).filter(s => s && s !== 'Unknown').sort()
  }, [orders])

  // ── Aggregations ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const paid = visible.filter(o => !DEAD.includes(String(o.status || '').toLowerCase().replace(/^wc-/, '')))
    const bySuburb: Record<string, { revenue: number; orders: number; customers: Set<string> }> = {}
    const byCustomer: Record<string, number> = {}
    const byProduct: Record<string, { revenue: number; qty: number }> = {}
    let revenue = 0

    for (const o of paid) {
      const s = suburbOf(o)
      const t = Number(o.total) || 0
      revenue += t
      const cust = customerOf(o)
      byCustomer[cust] = (byCustomer[cust] || 0) + 1
      ;(bySuburb[s] ||= { revenue: 0, orders: 0, customers: new Set() })
      bySuburb[s].revenue += t
      bySuburb[s].orders += 1
      bySuburb[s].customers.add(cust)
      for (const li of (o.line_items || [])) {
        const name = titleCase(String(li.name || 'Item'))
        ;(byProduct[name] ||= { revenue: 0, qty: 0 })
        byProduct[name].revenue += Number(li.total || 0)
        byProduct[name].qty += Number(li.quantity || 1)
      }
    }

    const suburbs = Object.entries(bySuburb)
      .map(([name, v]) => ({ name, revenue: v.revenue, orders: v.orders, customers: v.customers.size }))
      .sort((a, b) => b.revenue - a.revenue)

    const products = Object.entries(byProduct)
      .map(([name, v]) => ({ name, revenue: v.revenue, qty: v.qty }))
      .sort((a, b) => b.revenue - a.revenue)

    const customers = Object.keys(byCustomer)
    const repeatCustomers = customers.filter(c => byCustomer[c] > 1).length
    const freq = { one: 0, two: 0, threePlus: 0 }
    for (const c of customers) {
      const n = byCustomer[c]
      if (n >= 3) freq.threePlus++
      else if (n === 2) freq.two++
      else freq.one++
    }

    return {
      revenue,
      orders: paid.length,
      customers: customers.length,
      suburbs,
      products,
      repeatRate: customers.length ? (repeatCustomers / customers.length) * 100 : 0,
      avgSpend: customers.length ? revenue / customers.length : 0,
      topSuburb: suburbs[0] || null,
      mostActive: [...suburbs].sort((a, b) => b.customers - a.customers)[0] || null,
      topProduct: products[0] || null,
      freq,
    }
  }, [visible])

  const insights = useMemo(() => {
    const out: string[] = []
    if (stats.orders === 0) return out
    if (stats.topSuburb) {
      const share = stats.revenue ? (stats.topSuburb.revenue / stats.revenue) * 100 : 0
      out.push(`${stats.topSuburb.name} is your strongest area — ${money(stats.topSuburb.revenue)} across ${stats.topSuburb.orders} orders (${pct(share)} of revenue in this period).`)
    }
    if (stats.mostActive && stats.topSuburb && stats.mostActive.name !== stats.topSuburb.name) {
      out.push(`${stats.mostActive.name} has the most distinct customers (${stats.mostActive.customers}) even though it isn't your highest-spending suburb — a good target for repeat-purchase campaigns.`)
    }
    out.push(`Repeat purchase rate is ${pct(stats.repeatRate)} — ${stats.repeatRate >= 30 ? 'strong loyalty' : 'room to grow with follow-ups and reminders'}.`)
    if (stats.topProduct) {
      out.push(`Your top seller is "${stats.topProduct.name}" (${money(stats.topProduct.revenue)}), worth featuring in campaigns to your best suburbs.`)
    }
    if (stats.suburbs.length >= 3) {
      const top3 = stats.suburbs.slice(0, 3).reduce((s, x) => s + x.revenue, 0)
      const share = stats.revenue ? (top3 / stats.revenue) * 100 : 0
      out.push(`Your top 3 suburbs drive ${pct(share)} of revenue — ${share > 60 ? 'quite concentrated, so a delivery push into nearby suburbs could expand reach.' : 'a healthy spread across areas.'}`)
    }
    return out
  }, [stats])

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
  const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }
  const statNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const sub: React.CSSProperties = { fontSize: 12, color: 'var(--slate)', marginTop: 2 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }
  const rangeBtn = (v: typeof range, label: string) => (
    <button key={v} type="button" onClick={() => setRange(v)}
      style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: range === v ? 'var(--peach)' : '#fff', color: range === v ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
      {label}
    </button>
  )

  const Bars = ({ rows, max, color, valueFmt }: { rows: { name: string; value: number; meta?: string }[]; max: number; color: string; valueFmt: (n: number) => string }) => (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map(r => (
        <div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name}</span>
            <span style={{ color: 'var(--slate)' }}>{valueFmt(r.value)}{r.meta ? ` · ${r.meta}` : ''}</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: 'var(--canvas)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${max ? Math.max(3, (r.value / max) * 100) : 0}%`, background: color, borderRadius: 6 }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No data for this period.</p>}
    </div>
  )

  if (loading) return <div style={{ padding: 24 }}><SkeletonList /></div>

  const metricCards: { label: string; value: string; sub?: string }[] = [
    { label: 'Total Customers', value: String(stats.customers) },
    { label: 'Total Suburbs', value: String(stats.suburbs.length) },
    { label: 'Total Location Revenue', value: money(stats.revenue) },
    { label: 'Avg Spend / Customer', value: money(stats.avgSpend) },
    { label: 'Highest-Spending Suburb', value: stats.topSuburb?.name || '—', sub: stats.topSuburb ? money(stats.topSuburb.revenue) : undefined },
    { label: 'Most Popular Product', value: stats.topProduct?.name || '—', sub: stats.topProduct ? money(stats.topProduct.revenue) : undefined },
    { label: 'Most Active Area', value: stats.mostActive?.name || '—', sub: stats.mostActive ? `${stats.mostActive.customers} customers` : undefined },
    { label: 'Repeat Purchase Rate', value: pct(stats.repeatRate) },
  ]

  const totalFreq = stats.freq.one + stats.freq.two + stats.freq.threePlus

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Location Insights</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '6px 0 20px' }}>
        Where your customers are, what they spend, and which suburbs drive your business.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {rangeBtn('day', 'Daily')}
        {rangeBtn('week', 'Weekly')}
        {rangeBtn('month', 'Monthly')}
        {rangeBtn('all', 'All time')}
        {rangeBtn('custom', 'Custom')}
        {range === 'custom' && (
          <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
            <span style={{ color: 'var(--slate)' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
          </>
        )}
        <select value={suburb} onChange={e => setSuburb(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, background: '#fff', marginLeft: 4 }}>
          <option value="">All suburbs</option>
          {suburbList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 24 }}>
        {metricCards.map(m => (
          <div key={m.label} style={card}>
            <div style={statLbl}>{m.label}</div>
            <p style={{ ...statNum, fontSize: m.value.length > 12 ? 18 : 26, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.value}</p>
            {m.sub && <div style={sub}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Geographic Overview */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={h2}>Geographic Overview</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: 0, lineHeight: 1.6 }}>
          {stats.orders === 0
            ? 'No paid orders in this period yet.'
            : `In this period you served ${stats.customers} customer${stats.customers === 1 ? '' : 's'} across ${stats.suburbs.length} suburb${stats.suburbs.length === 1 ? '' : 's'}, generating ${money(stats.revenue)} from ${stats.orders} order${stats.orders === 1 ? '' : 's'}. ${stats.topSuburb ? `${stats.topSuburb.name} leads with ${money(stats.topSuburb.revenue)}.` : ''}`}
        </p>
      </div>

      {/* Customer Map (v1 — ranked suburbs) */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ ...h2, margin: 0 }}>Customer Map</h2>
          <span style={{ fontSize: 11, color: 'var(--slate)', background: 'var(--canvas)', padding: '3px 8px', borderRadius: 10 }}>Ranked by revenue</span>
        </div>
        <Bars color="var(--coral)" max={stats.suburbs[0]?.revenue || 0}
          rows={stats.suburbs.slice(0, 12).map(s => ({ name: s.name, value: s.revenue, meta: `${s.customers} cust` }))}
          valueFmt={money} />
        <p style={{ fontSize: 11.5, color: 'var(--slate)', margin: '12px 0 0' }}>
          An interactive geographic map (pins on a real map) is coming next — this ranks your suburbs by revenue for now.
        </p>
      </div>

      {/* Two-column: Suburb Performance + Purchase Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <h2 style={h2}>Suburb Performance</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
                <th style={{ padding: '6px 8px' }}>Suburb</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Revenue</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Orders</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Customers</th>
              </tr></thead>
              <tbody>
                {stats.suburbs.slice(0, 10).map(s => (
                  <tr key={s.name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--ink)', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{money(s.revenue)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{s.orders}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{s.customers}</td>
                  </tr>
                ))}
                {stats.suburbs.length === 0 && <tr><td colSpan={4} style={{ padding: 10, color: 'var(--slate)' }}>No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>Purchase Categories</h2>
          <Bars color="#6366f1" max={stats.products[0]?.revenue || 0}
            rows={stats.products.slice(0, 8).map(p => ({ name: p.name, value: p.revenue, meta: `${p.qty} sold` }))}
            valueFmt={money} />
          <p style={{ fontSize: 11.5, color: 'var(--slate)', margin: '12px 0 0' }}>
            Shown at product level. True WooCommerce category grouping is a follow-up (needs product taxonomy sync).
          </p>
        </div>
      </div>

      {/* Spending by Location + Purchase Frequency */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <h2 style={h2}>Spending by Location</h2>
          <Bars color="#15803d" max={stats.suburbs[0]?.revenue || 0}
            rows={stats.suburbs.slice(0, 10).map(s => ({ name: s.name, value: s.revenue }))}
            valueFmt={money} />
        </div>
        <div style={card}>
          <h2 style={h2}>Purchase Frequency</h2>
          <Bars color="#f59e0b" max={Math.max(stats.freq.one, stats.freq.two, stats.freq.threePlus)}
            rows={[
              { name: 'One-time', value: stats.freq.one },
              { name: 'Twice', value: stats.freq.two },
              { name: '3+ times', value: stats.freq.threePlus },
            ]}
            valueFmt={n => `${n}${totalFreq ? ` (${pct((n / totalFreq) * 100)})` : ''}`} />
          <p style={{ fontSize: 12, color: 'var(--slate)', margin: '12px 0 0' }}>
            Repeat purchase rate: <strong style={{ color: 'var(--ink)' }}>{pct(stats.repeatRate)}</strong>
          </p>
        </div>
      </div>

      {/* AI Geographic Insights */}
      <div style={{ ...card, background: 'linear-gradient(180deg,#faf9ff,#fff)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#8b5cf6"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/></svg>
          <h2 style={{ ...h2, margin: 0 }}>AI Geographic Insights</h2>
        </div>
        {insights.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: 0 }}>Insights appear once there are paid orders in the selected period.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {insights.map((t, i) => (
              <li key={i} style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
