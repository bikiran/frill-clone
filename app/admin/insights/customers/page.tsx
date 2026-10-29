'use client'

import { useState } from 'react'
import { Card, FreqBar, InsightsEmpty, InsightsPage, InsightsSkeleton, Kpi, RangePills, WeekChart, money } from '@/components/insights/InsightsUI'
import { useInsightsSummary } from '@/components/insights/useInsightsSummary'
import type { customerSummary } from '@/lib/insights-summary'

// Customer Insights: what customers spend, how often they come back and who the
// best ones are. The numbers are worked out on the server
// (/api/insights/summary) so the page only downloads the summary.

type Summary = ReturnType<typeof customerSummary>
type Range = 'week' | 'month' | 'all'
const RANGES: [Range, string][] = [['week', 'Last 7 days'], ['month', 'Last 30 days'], ['all', 'All time']]

const AV = ['#ff6a4d', '#6366f1', '#16a34a', '#f59e0b', '#0ea5e9', '#d946ef', '#14b8a6', '#ef4444']
const initials = (n: string) => (n.includes('@') ? n.charAt(0) : n.split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('')).toUpperCase() || '?'
const titleCase = (s: string) => (s.includes('@') ? s : s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
const ago = (t: number | null) => {
  if (!t) return ''
  const d = Math.floor((Date.now() - t) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`
}

export default function CustomerInsightsPage() {
  const [range, setRange] = useState<Range>('all')
  const { data: s, empty, loading, stale, error } = useInsightsSummary<Summary>('customers', { range })

  return (
    <InsightsPage title="Customer" accent="insights" sub="What your customers spend, how often they come back, and who your best ones are."
      controls={<RangePills value={range} options={RANGES} onChange={setRange} />}>
      {error && <p className="ins-err">{error}</p>}
      {loading && !s ? <InsightsSkeleton /> : empty || !s ? (
        <InsightsEmpty title="No orders yet" body="Once your store is connected and its orders have synced, you’ll see what customers spend and how often they come back."
          href="/admin/integrations" cta="Connect your store" />
      ) : (
        <div className={`ins-body${stale ? ' stale' : ''}`}>
          <div className="ins-kpis">
            <Kpi icon="people" label="Customers" value={s.customers.toLocaleString('en-AU')} sub={`${s.orders.toLocaleString('en-AU')} orders`} tone="#6366f1" />
            <Kpi icon="money" label="Revenue" value={money(s.revenue)} sub="Paid orders" tone="#16a34a" />
            <Kpi icon="heart" label="Lifetime value" value={money(s.ltv)} sub="Average per customer" tone="#ef4444" />
            <Kpi icon="bag" label="Average order" value={money(s.aov, true)} tone="#f59e0b" />
            <Kpi icon="basket" label="Orders per customer" value={s.ordersPerCustomer.toFixed(1)} tone="#0ea5e9" />
            <Kpi icon="repeat" label="Came back" value={`${s.repeatRate}%`} sub="Bought more than once" tone="#d946ef" />
          </div>

          <div className="ins-grid2">
            <Card title="Revenue by week" sub={range === 'week' ? 'This week' : range === 'month' ? 'The last 30 days' : 'The last 12 weeks'}>
              <WeekChart weeks={s.weeks} />
            </Card>
            <Card title="How often they buy" sub={`${s.customers.toLocaleString('en-AU')} customers`}>
              <FreqBar freq={s.freq} />
              {s.customers > 0 && (
                <p className="ins-note">
                  {s.repeatRate >= 30
                    ? <><b>{s.repeatRate}% come back</b>, a healthy, loyal base. Early access and reminders keep them coming.</>
                    : <><b>Only {s.repeatRate}% come back.</b> A follow-up after the first order or a win-back message could lift that.</>}
                </p>
              )}
            </Card>
          </div>

          <Card title="Top customers" sub="By what they’ve spent in this period">
            {s.top.length === 0 ? <p className="ins-empty">No paid orders in this period yet.</p> : (
              <ol className="ins-people">
                {s.top.map((c, i) => (
                  <li key={c.name + i} style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="ins-av" style={{ background: AV[i % AV.length] }} aria-hidden>{initials(c.name)}</span>
                    <span className="ins-people-t">
                      <b title={c.name}>{titleCase(c.name)}</b>
                      <small>{c.orders} order{c.orders === 1 ? '' : 's'}{c.last ? ` · last ${ago(c.last)}` : ''}</small>
                    </span>
                    <span className="ins-people-bar" aria-hidden><i style={{ width: `${Math.max(4, (c.spend / (s.top[0]?.spend || 1)) * 100)}%` }} /></span>
                    <span className="ins-people-v">{money(c.spend)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
      <style>{PAGE_CSS}</style>
    </InsightsPage>
  )
}

const PAGE_CSS = `
.ins-note{margin:16px 0 0;padding:12px 14px;border-radius:14px;background:#f7f7f8;font-size:13.5px;line-height:1.5;color:#52525b}
.ins-note b{color:#111;font-weight:650}
.ins-people{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));column-gap:28px}
.ins-people li{display:grid;grid-template-columns:36px minmax(0,1fr) minmax(60px,120px) auto;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f1f1f3;animation:insIn .4s cubic-bezier(.22,1,.36,1) both}
.ins-av{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;letter-spacing:.02em}
.ins-people-t{min-width:0;display:flex;flex-direction:column;line-height:1.3}
.ins-people-t b{font-size:14px;font-weight:600;color:#18181b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ins-people-t small{font-size:12px;color:#8e8e93}
.ins-people-bar{height:6px;border-radius:999px;background:#f4f4f5;overflow:hidden}
.ins-people-bar i{display:block;height:100%;border-radius:999px;background:#ff6a4d;transform-origin:left;animation:insGrow .7s cubic-bezier(.22,1,.36,1) both}
.ins-people-v{font-family:var(--fd);font-size:15px;font-weight:700;letter-spacing:-.02em;color:#111;font-variant-numeric:tabular-nums;text-align:right}
@media (max-width:520px){.ins-people li{grid-template-columns:36px minmax(0,1fr) auto}.ins-people-bar{display:none}}
`
