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
  billing: any
}

const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)
const pct = (n: number) => `${Math.round(n)}%`
const titleCase = (s: string) => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}

const PAID = ['processing', 'completed', 'on-hold']

export default function CustomerInsightsPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [range, setRange] = useState<'week' | 'month' | 'all'>('all')

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = null
        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        let loaded: any[] = []
        try {
          const res = await fetch(`/api/orders/all?companyId=${cid}`)
          const j = await res.json()
          if (Array.isArray(j.orders)) loaded = j.orders
        } catch { /* fall back below */ }
        if (loaded.length === 0) {
          const { data } = await (supabase as any).from('woocommerce_orders')
            .select('id, customer_email, woo_customer_id, total, order_date, status, billing')
            .eq('company_id', cid).order('order_date', { ascending: false }).limit(3000)
          loaded = data || []
        }
        setOrders(loaded)
      } finally { setLoading(false) }
    })()
  }, [])

  const window = useMemo(() => {
    const now = new Date()
    if (range === 'all') return new Date(0)
    return new Date(now.getTime() - (range === 'week' ? 7 : 30) * 86400000)
  }, [range])

  const stats = useMemo(() => {
    const paid = orders.filter(o => {
      if (!PAID.includes(String(o.status || '').toLowerCase())) return false
      const d = parseTs(o.order_date)
      return range === 'all' || (d && d >= window)
    })
    const nameOf = (o: Order) => {
      const b = o.billing || {}
      const n = [b.first_name, b.last_name].filter(Boolean).join(' ').trim()
      return n || o.customer_email || 'Guest'
    }
    const keyOf = (o: Order) => (o.woo_customer_id ? `c${o.woo_customer_id}` : (o.customer_email || '').toLowerCase()) || 'guest'

    const byCust: Record<string, { name: string; spend: number; orders: number; first: Date | null; last: Date | null }> = {}
    let revenue = 0
    for (const o of paid) {
      const k = keyOf(o); const t = Number(o.total) || 0; revenue += t
      const d = parseTs(o.order_date)
      const c = (byCust[k] ||= { name: nameOf(o), spend: 0, orders: 0, first: null, last: null })
      c.spend += t; c.orders += 1
      if (d) { if (!c.first || d < c.first) c.first = d; if (!c.last || d > c.last) c.last = d }
    }
    const customers = Object.values(byCust)
    const repeat = customers.filter(c => c.orders > 1).length
    const top = [...customers].sort((a, b) => b.spend - a.spend).slice(0, 12)
    const freq = { one: 0, two: 0, threePlus: 0 }
    for (const c of customers) {
      if (c.orders >= 3) freq.threePlus++
      else if (c.orders === 2) freq.two++
      else freq.one++
    }
    return {
      revenue,
      orderCount: paid.length,
      customers: customers.length,
      ltv: customers.length ? revenue / customers.length : 0,
      aov: paid.length ? revenue / paid.length : 0,
      ordersPerCust: customers.length ? paid.length / customers.length : 0,
      repeatRate: customers.length ? (repeat / customers.length) * 100 : 0,
      top, freq,
    }
  }, [orders, window, range])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
  const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }
  const statNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }
  const rangeBtn = (v: typeof range, label: string) => (
    <button key={v} type="button" onClick={() => setRange(v)}
      style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: range === v ? 'var(--peach)' : '#fff', color: range === v ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
      {label}
    </button>
  )

  if (loading) return <div style={{ padding: 24 }}><SkeletonList /></div>

  const totalFreq = stats.freq.one + stats.freq.two + stats.freq.threePlus
  const cards = [
    { label: 'Total Customers', value: String(stats.customers) },
    { label: 'Total Revenue', value: money(stats.revenue) },
    { label: 'Avg Lifetime Value', value: money(stats.ltv) },
    { label: 'Avg Order Value', value: money(stats.aov) },
    { label: 'Orders / Customer', value: stats.ordersPerCust.toFixed(1) },
    { label: 'Repeat Purchase Rate', value: pct(stats.repeatRate) },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Customer Insights</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '6px 0 20px' }}>
        Understand customer spending, purchasing behaviour, frequency and long-term value.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {rangeBtn('week', 'Last 7 days')}
        {rangeBtn('month', 'Last 30 days')}
        {rangeBtn('all', 'All time')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map(m => (
          <div key={m.label} style={card}>
            <div style={statLbl}>{m.label}</div>
            <p style={statNum}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div style={card}>
          <h2 style={h2}>Top Customers</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
                <th style={{ padding: '6px 8px' }}>Customer</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Spend</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Orders</th>
              </tr></thead>
              <tbody>
                {stats.top.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--ink)', fontWeight: 600 }}>{titleCase(c.name)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{money(c.spend)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{c.orders}</td>
                  </tr>
                ))}
                {stats.top.length === 0 && <tr><td colSpan={3} style={{ padding: 10, color: 'var(--slate)' }}>No paid orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>Purchase Frequency</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { name: 'One-time buyers', value: stats.freq.one, color: '#94a3b8' },
              { name: 'Two orders', value: stats.freq.two, color: '#6366f1' },
              { name: '3+ orders (loyal)', value: stats.freq.threePlus, color: '#15803d' },
            ].map(r => (
              <div key={r.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name}</span>
                  <span style={{ color: 'var(--slate)' }}>{r.value}{totalFreq ? ` (${pct((r.value / totalFreq) * 100)})` : ''}</span>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: 'var(--canvas)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${totalFreq ? Math.max(3, (r.value / totalFreq) * 100) : 0}%`, background: r.color, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '14px 0 0', lineHeight: 1.5 }}>
            {stats.repeatRate >= 30
              ? `A ${pct(stats.repeatRate)} repeat rate is healthy — keep loyal customers engaged with reminders and early access.`
              : `Only ${pct(stats.repeatRate)} of customers come back — win-back messages and post-purchase follow-ups could lift this.`}
          </p>
        </div>
      </div>
    </div>
  )
}
