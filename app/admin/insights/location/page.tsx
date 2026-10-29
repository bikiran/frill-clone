'use client'

import { useMemo, useState } from 'react'
import { BarList, Card, FreqBar, InsightsEmpty, InsightsPage, InsightsSkeleton, Kpi, RangePills, money } from '@/components/insights/InsightsUI'
import { useInsightsSummary } from '@/components/insights/useInsightsSummary'
import type { locationSummary } from '@/lib/insights-summary'
import { CustomerMap, type MapPoint } from './CustomerMap'

// Location Insights: where customers are, what they spend and which suburbs
// drive the business. Worked out on the server (/api/insights/summary); orders
// with no address (mostly in-store sales) are counted in the totals but kept
// off the map and the suburb list.

type Summary = ReturnType<typeof locationSummary>
type Range = 'day' | 'week' | 'month' | 'all' | 'custom'
const RANGES: [Range, string][] = [['day', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom']]

export default function LocationInsightsPage() {
  const [range, setRange] = useState<Range>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [suburb, setSuburb] = useState('')
  const custom = range === 'custom'
  const { data: s, empty, loading, stale, error } = useInsightsSummary<Summary>('location', { range, from: custom ? from : '', to: custom ? to : '', suburb })

  const points = useMemo<MapPoint[]>(() => (s?.suburbs || []).filter(x => x.lat != null && x.lng != null)
    .map(x => ({ name: x.name, revenue: x.revenue, customers: x.customers, orders: x.orders, lat: x.lat as number, lng: x.lng as number })), [s])

  const controls = (
    <>
      <RangePills value={range} options={RANGES} onChange={setRange} />
      {custom && (
        <span className="loc-dates">
          <input className="ins-field" type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
          <span>to</span>
          <input className="ins-field" type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
        </span>
      )}
      <span className="loc-sub">
        <select className="ins-field" aria-label="Suburb" value={suburb} onChange={e => setSuburb(e.target.value)}>
          <option value="">All suburbs</option>
          {(s?.suburbList || []).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </span>
    </>
  )

  return (
    <InsightsPage title="Location" accent="insights" sub="Where your customers are, what they spend, and which suburbs drive your business." controls={controls}>
      {error && <p className="ins-err">{error}</p>}
      {loading && !s ? <InsightsSkeleton /> : empty || !s ? (
        <InsightsEmpty title="No orders yet" body="Once your store is connected and its orders have synced, you’ll see which suburbs your customers come from."
          href="/admin/integrations" cta="Connect your store" />
      ) : (
        <div className={`ins-body${stale ? ' stale' : ''}`}>
          <div className="ins-kpis">
            <Kpi icon="money" label="Revenue" value={money(s.revenue)} sub={`${s.orders.toLocaleString('en-AU')} paid orders`} tone="#16a34a" />
            <Kpi icon="people" label="Customers" value={s.customers.toLocaleString('en-AU')} sub={`${money(s.avgSpend)} each on average`} tone="#6366f1" />
            <Kpi icon="pin" label="Suburbs" value={s.suburbCount.toLocaleString('en-AU')} sub="With at least one order" tone="#0ea5e9" />
            <Kpi icon="trophy" label="Top suburb" value={s.topSuburb?.name || '—'} sub={s.topSuburb ? `${money(s.topSuburb.revenue)} · ${s.topSuburb.orders} orders` : 'No orders in this period'} tone="#f59e0b" />
            <Kpi icon="people" label="Most customers" value={s.mostActive?.name || '—'} sub={s.mostActive ? `${s.mostActive.customers} customers` : undefined} tone="#d946ef" />
            <Kpi icon="repeat" label="Came back" value={`${s.repeatRate}%`} sub="Bought more than once" tone="#ff6a4d" />
          </div>

          <div className="ins-grid-map">
            <Card className="loc-mapcard" title="Customer map" sub={points.length ? `${points.length} suburb${points.length === 1 ? '' : 's'} by postcode · bubble size is revenue` : undefined}>
              {points.length > 0
                ? <div className="ins-map"><CustomerMap points={points} /></div>
                : <p className="ins-empty">{s.orders ? 'None of the orders in this period have a postcode to map.' : 'No orders in this period.'}</p>}
            </Card>
            <Card title="Top suburbs" sub="By revenue">
              <BarList color="#16a34a" fmt={n => money(n)} empty="No orders with an address in this period."
                rows={s.suburbs.slice(0, 8).map(x => ({ name: x.name, value: x.revenue, meta: `${x.orders} order${x.orders === 1 ? '' : 's'} · ${x.customers} customer${x.customers === 1 ? '' : 's'}${x.state ? ` · ${x.state}` : ''}` }))} />
              {s.noAddress.orders > 0 && (
                <p className="loc-noaddr"><b>{s.noAddress.orders.toLocaleString('en-AU')} orders</b> ({money(s.noAddress.revenue)}) have no address, mostly in-store sales. They count in the totals but not here.</p>
              )}
            </Card>
          </div>

          <div className="ins-grid2">
            <Card title="Top products" sub={suburb ? `Bought in ${suburb}` : 'Across every suburb'}>
              <BarList color="#6366f1" fmt={n => money(n)} rows={s.products.map(p => ({ name: p.name, value: p.revenue, meta: `${p.qty.toLocaleString('en-AU')} sold` }))} />
            </Card>
            <div className="loc-stack">
              <Card title="How often they buy" sub={`${s.customers.toLocaleString('en-AU')} customers`}>
                <FreqBar freq={s.freq} />
              </Card>
              {s.takeaways.length > 0 && (
                <Card title="What stands out" sub="From this period’s orders" className="loc-take">
                  <ul>
                    {s.takeaways.map((t, i) => <li key={i} style={{ animationDelay: `${i * 50}ms` }}><span aria-hidden>{i + 1}</span><p>{t}</p></li>)}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{PAGE_CSS}</style>
    </InsightsPage>
  )
}

const PAGE_CSS = `
.loc-dates{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#8e8e93}
.loc-sub{position:relative;display:inline-flex;align-items:center;margin-left:auto}
.loc-sub select{appearance:none;-webkit-appearance:none;padding-right:34px;cursor:pointer;max-width:220px}
.loc-sub svg{position:absolute;right:13px;pointer-events:none;color:#71717a}
@media (max-width:700px){.loc-sub{margin-left:0}}
.loc-noaddr{margin:16px 0 0;padding:11px 13px;border-radius:14px;background:#f7f7f8;font-size:12.5px;line-height:1.5;color:#71717a}
.loc-noaddr b{color:#3f3f46;font-weight:650}
.loc-take{background:linear-gradient(180deg,#fff7f4 0%,#fff 70%)}
.loc-stack{display:flex;flex-direction:column;gap:14px;min-width:0}
.loc-mapcard{display:flex;flex-direction:column}
.loc-mapcard .ins-map{flex:1;min-height:400px}
.loc-mapcard .ins-map .cmap{position:absolute!important;inset:0;height:auto!important}
.loc-take ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.loc-take li{display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05);animation:insIn .4s cubic-bezier(.22,1,.36,1) both}
.loc-take li span{flex-shrink:0;width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#ff6a4d;color:#fff;font-family:var(--fd);font-size:13px;font-weight:700}
.loc-take li p{margin:0;font-size:13.5px;line-height:1.5;color:#3f3f46}
`
