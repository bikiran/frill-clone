'use client'

// Campaign Insights: every email and SMS campaign in a period, compared. The
// figures come from /api/campaigns/insights (lib/campaign-insights), the
// same measures each campaign's own report leads with.
//
// Charts: one axis each, a legend, a tooltip on hover and keyboard focus, and
// a table for screen readers. Series colours are the report's validated pair
// (email = slot 1, SMS = slot 2) in light and dark; SMS points are squares and
// email points circles, so the channels never rely on colour alone.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import { RK_CSS } from '@/components/campaigns/ReportKit'
import type { Insights, InsightCampaign, ChannelTotals } from '@/lib/campaign-insights'

type Channel = 'email' | 'sms'
const RANGES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 365, label: '12 months' }, { days: 0, label: 'All time' }]
const CH_LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS' }
const DAY = 86400_000
const MIN_SAMPLE = 20   // a campaign this small doesn't count as "best" or "lowest"

const money = (n: number, cents = false) => {
  const frac = cents || (Math.abs(n) < 100 && n % 1 !== 0) ? 2 : 0
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n || 0)
}
const num = (n: number) => (n || 0).toLocaleString('en-AU')
const rate = (n: number) => `${(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`
const roi = (revenue: number, cost: number) => (cost > 0 ? Math.round(((revenue - cost) / cost) * 100) : null)
const roiText = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('en-AU')}%`)
const day = (iso: string, year = false) => { try { return new Date(iso).toLocaleDateString('en-AU', year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) } catch { return '' } }
const reportUrl = (c: InsightCampaign) => `/admin/campaigns/${c.id}/report`

const ChannelMark = ({ ch, size = 10 }: { ch: Channel; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className="ci-mark">
    {ch === 'email' ? <circle cx="5" cy="5" r="4.2" fill="var(--s1)" /> : <rect x="1" y="1" width="8" height="8" rx="1.6" fill="var(--s2)" />}
  </svg>
)
const ChannelTag = ({ ch }: { ch: Channel }) => <span className="ci-ch"><ChannelMark ch={ch} size={8} />{CH_LABEL[ch]}</span>

export default function CampaignInsightsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId ?? null)
  const [resolving, setResolving] = useState(!companyId)
  const [days, setDays] = useState(90)
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The business: the admin already knows it; else look it up as the report does.
  useEffect(() => {
    if (companyId) return
    ;(async () => {
      try {
        let cid: string | null = (await resolveCompanyUser().catch(() => null))?.companyId || null
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', host.replace('.colvy.com', '')).maybeSingle()
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
        setCompanyId(cid)
      } finally { setResolving(false) }
    })()
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let live = true
    setLoading(true); setError('')
    authFetch(`/api/campaigns/insights?companyId=${encodeURIComponent(companyId)}&days=${days}`)
      .then(async r => { const j: any = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t load the insights'); if (live) setData(j) })
      .catch(e => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [companyId, days])

  const rangeLabel = days ? `the last ${RANGES.find(r => r.days === days)?.label.toLowerCase()}` : 'all time'
  const back = () => router.push('/admin/campaigns')

  if (resolving || (!data && loading && !error)) return <div style={{ padding: '24px 28px' }}><SkeletonList rows={6} /></div>
  if (!companyId) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>Couldn’t find your business. <a href="/admin/campaigns" style={{ color: 'var(--coral)' }}>Back to campaigns</a></div>

  const t = data?.totals
  const list = data?.campaigns || []

  return (
    <div className="ci">
      <style>{RK_CSS}</style>
      <style>{CI_CSS}</style>
      <button type="button" onClick={back} className="ci-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Campaigns
      </button>
      <div className="ci-head">
        <h1>Campaign insights</h1>
        <p>Your emails and texts side by side: who clicked, what sold, and what it cost.</p>
      </div>

      {/* One filter row; it scopes everything below. */}
      <div className="ci-filters">
        <div className="ci-seg" role="radiogroup" aria-label="Period">
          {RANGES.map(r => (
            <button key={r.days} type="button" role="radio" aria-checked={days === r.days} className={days === r.days ? 'on' : ''} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
        {loading && data && <span className="ci-loading" role="status">Updating…</span>}
      </div>

      {error && <div className="rk-card ci-err">{error}</div>}

      {data && t && (
        <div className={`ci-body${loading ? ' stale' : ''}`} aria-busy={loading}>
          {list.length === 0 ? (
            <div className="rk-card ci-empty">
              <b>No campaigns sent in {rangeLabel}</b>
              <span>Once a campaign goes out, how it did shows up here next to the others.</span>
              <div className="ci-empty-acts">
                {days !== 0 && <button type="button" className="ci-pill" onClick={() => setDays(0)}>Show all time</button>}
                <button type="button" className="rk-btn" onClick={back}>Go to campaigns</button>
              </div>
            </div>
          ) : (<>
            <Kpis t={t} />
            <Highlights list={list} onOpen={c => router.push(reportUrl(c))} />
            <div className="ci-grid">
              <section className="rk-card" aria-labelledby="ci-trend-h">
                <div className="ci-card-h">
                  <h2 id="ci-trend-h" className="rk-h">Click rate by campaign</h2>
                  <span className="ci-sub">People who clicked, of people it reached</span>
                </div>
                <ClickRateChart list={list} totals={t} onOpen={c => router.push(reportUrl(c))} />
              </section>
              <section className="rk-card" aria-labelledby="ci-vs-h">
                <div className="ci-card-h">
                  <h2 id="ci-vs-h" className="rk-h">Email vs SMS</h2>
                  <span className="ci-sub">{rangeLabel === 'all time' ? 'All time' : rangeLabel.replace(/^the /, 'The ')}</span>
                </div>
                <Versus t={t} />
              </section>
            </div>
            <section className="rk-card ci-sec" aria-labelledby="ci-rev-h">
              <div className="ci-card-h">
                <h2 id="ci-rev-h" className="rk-h">Revenue by campaign</h2>
                <span className="ci-sub">Paid orders through each campaign’s links</span>
              </div>
              <RevenueBars list={list} onOpen={c => router.push(reportUrl(c))} />
            </section>
            <section className="rk-card ci-sec" aria-labelledby="ci-all-h">
              <CampaignTable list={list} onOpen={c => router.push(reportUrl(c))} />
            </section>
            {data.capped && <p className="rk-note">Showing the {list.length} most recent campaigns in this period.</p>}
            <p className="rk-note">Orders are credited to a campaign when someone clicks its link and then buys. Email opens are approximate (Apple Mail opens emails by itself), so click rates are used here. Email campaigns are included in your plan, so return on spend is for texts.</p>
          </>)}
        </div>
      )}
    </div>
  )
}

// ── Headline figures ────────────────────────────────────────────────────────
function Kpis({ t }: { t: Insights['totals'] }) {
  const a = t.all
  const tiles: { label: string; value: string; sub: string; hot?: boolean }[] = [
    { label: 'Revenue', value: money(a.revenue), sub: `${num(a.orders)} order${a.orders === 1 ? '' : 's'}${a.bookings ? ` · ${num(a.bookings)} booking${a.bookings === 1 ? '' : 's'}` : ''}`, hot: true },
    { label: 'Click rate', value: rate(a.clickRate), sub: `${num(a.clickers)} people clicked` },
    { label: 'Ordered or booked', value: rate(a.conversion), sub: 'of people who clicked' },
    { label: 'Messages sent', value: num(a.sent), sub: `${num(a.campaigns)} campaign${a.campaigns === 1 ? '' : 's'}` },
    { label: 'Return on SMS spend', value: roiText(t.sms.returnOnSpend), sub: t.sms.cost > 0 ? `${money(t.sms.cost, true)} spent on texts` : 'No texts paid for' },
  ]
  return (
    <div className="ci-kpis">
      {tiles.map(k => (
        <div key={k.label} className={`rk-card ci-kpi${k.hot ? ' hot' : ''}`}>
          <span className="ci-kpi-l">{k.label}</span>
          <span className="ci-kpi-v">{k.value}</span>
          <span className="ci-kpi-s">{k.sub}</span>
        </div>
      ))}
    </div>
  )
}

// ── Best and lowest ─────────────────────────────────────────────────────────
function Highlights({ list, onOpen }: { list: InsightCampaign[]; onOpen: (c: InsightCampaign) => void }) {
  const items = useMemo(() => {
    const big = list.filter(c => (c.channel === 'email' ? c.delivered || c.sent : c.sent) >= MIN_SAMPLE)
    const pool = big.length ? big : list
    const top = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<T | null>((b, x) => (b == null || f(x) > f(b) ? x : b), null)
    type Metric = { label: string; value: string; caption: string }
    const cards: { c: InsightCampaign; metrics: Metric[]; low?: boolean }[] = []
    // A campaign that wins several gets one card listing them all.
    const best = (c: InsightCampaign | null, m: Metric) => {
      if (!c) return
      const card = cards.find(k => k.c.id === c.id && !k.low)
      if (card) card.metrics.push(m); else cards.push({ c, metrics: [m] })
    }
    const bestRate = top(pool, c => c.clickRate + c.clickers / 1e6)
    if (bestRate && bestRate.clickRate > 0) best(bestRate, { label: 'Best click rate', value: rate(bestRate.clickRate), caption: `${num(bestRate.clickers)} clicked` })
    const bestRev = top(list, c => c.revenue)
    if (bestRev && bestRev.revenue > 0) best(bestRev, { label: 'Most revenue', value: money(bestRev.revenue), caption: `${num(bestRev.orders)} order${bestRev.orders === 1 ? '' : 's'}` })
    const bestRoi = top(list.filter(c => c.cost > 0 && c.revenue > 0), c => (c.revenue - c.cost) / c.cost)
    if (bestRoi) best(bestRoi, { label: 'Best return on spend', value: roiText(roi(bestRoi.revenue, bestRoi.cost)), caption: `from ${money(bestRoi.cost, true)}` })
    const lowRate = pool.length >= 3 ? top(pool, c => -(c.clickRate - c.clickers / 1e6)) : null
    if (lowRate && lowRate.id !== bestRate?.id) cards.push({ c: lowRate, low: true, metrics: [{ label: 'Lowest click rate', value: rate(lowRate.clickRate), caption: `${num(lowRate.clickers)} of ${num(lowRate.channel === 'email' ? lowRate.delivered || lowRate.sent : lowRate.sent)} clicked` }] })
    return cards
  }, [list])
  if (!items.length) return null
  const title = (ms: { label: string }[]) => ms.map((m, i) => (i ? m.label.charAt(0).toLowerCase() + m.label.slice(1) : m.label))
    .reduce((t, l, i, all) => (i === 0 ? l : `${t}${i === all.length - 1 ? ' and ' : ', '}${l}`), '')
  return (
    <div className="ci-hl">
      {items.map(h => (
        <button key={h.c.id + (h.low ? ':low' : '')} type="button" className={`rk-card ci-hl-card${h.low ? ' low' : ''}`} onClick={() => onOpen(h.c)} aria-label={`${title(h.metrics)}: ${h.c.name}. Open the report`}>
          <span className="ci-hl-l">
            {h.low
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 17 13.5 8.5l-5 5L2 7" /><path d="M16 17h6v-6" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></svg>}
            {title(h.metrics)}
          </span>
          <span className="ci-hl-ms">
            {h.metrics.map(m => <span key={m.label} className="ci-hl-m"><span className="ci-hl-v">{m.value}</span><small>{m.caption}</small></span>)}
          </span>
          <span className="ci-hl-n">{h.c.name}</span>
          <span className="ci-hl-s"><ChannelTag ch={h.c.channel} /> · {day(h.c.sentAt)}</span>
        </button>
      ))}
    </div>
  )
}

// ── Click rate by campaign, over time ───────────────────────────────────────
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: Math.max(240, Math.round(el.clientWidth)), h: Math.round(el.clientHeight) })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function niceStep(max: number) {
  for (const s of [1, 2, 5, 10, 20, 25, 50]) if (max / s <= 4) return s
  return 100
}

function ClickRateChart({ list, totals, onOpen }: { list: InsightCampaign[]; totals: Insights['totals']; onOpen: (c: InsightCampaign) => void }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = useMemo(() => list.map(c => ({ c, t: Date.parse(c.sentAt) })).filter(p => Number.isFinite(p.t)).sort((a, b) => a.t - b.t), [list])
  // The plot fills its card (as tall as Email vs SMS beside it), within reason.
  const w = size.w || 600, H = Math.min(440, Math.max(230, size.h || 230)), L = 40, R = 14, T = 12, B = 28
  const iw = Math.max(10, w - L - R), ih = H - T - B
  const t0 = pts.length ? pts[0].t : 0, t1 = pts.length ? pts[pts.length - 1].t : 0
  const [d0, d1] = t1 - t0 < 2 * DAY ? [t0 - 3 * DAY, t1 + 3 * DAY] : [t0 - (t1 - t0) * 0.04, t1 + (t1 - t0) * 0.04]
  const x = (t: number) => L + ((t - d0) / (d1 - d0)) * iw
  const maxRate = Math.max(0, ...pts.map(p => p.c.clickRate))
  const step = niceStep(Math.max(maxRate, 1))
  const yMax = Math.max(step, Math.ceil(maxRate / step) * step)
  const y = (v: number) => T + ih - (v / yMax) * ih
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)
  const nX = w < 420 ? 3 : 5
  const long = d1 - d0 > 300 * DAY
  const xTicks = Array.from({ length: nX }, (_, i) => d0 + ((d1 - d0) * (i + 0.5)) / nX)
  const series = (['email', 'sms'] as Channel[]).map(ch => ({ ch, pts: pts.map((p, i) => ({ ...p, i })).filter(p => p.c.channel === ch) })).filter(s => s.pts.length)
  if (!pts.length) return <p className="rk-muted">Nothing sent yet.</p>

  const nearest = (px: number) => {
    let best = 0, d = Infinity
    pts.forEach((p, i) => { const dd = Math.abs(x(p.t) - px); if (dd < d) { d = dd; best = i } })
    return best
  }
  const h = hover != null ? pts[hover] : null
  // Everything sent the same day as the hovered point, so stacked points all read.
  const same = h ? pts.filter(p => Math.abs(x(p.t) - x(h.t)) < 3) : []
  const tipLeft = h ? x(h.t) : 0
  const flip = tipLeft > w * 0.55

  return (
    <div className="rk-chart ci-chart">
      <div className="rk-legend">
        {series.map(s => <span key={s.ch}><ChannelMark ch={s.ch} /><span className="ci-key" style={{ background: `var(--${s.ch === 'email' ? 's1' : 's2'})` }} aria-hidden />{CH_LABEL[s.ch]} <b>{rate(totals[s.ch].clickRate)}</b></span>)}
      </div>
      <div className="ci-plot" ref={ref}>
        {size.w > 0 && <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-roledescription="chart" tabIndex={0}
          aria-label={`Click rate by campaign. ${series.map(s => `${CH_LABEL[s.ch]}: ${s.pts.length} campaign${s.pts.length === 1 ? '' : 's'}, ${rate(totals[s.ch].clickRate)} overall`).join('. ')}. Use the arrow keys to go through them.`}
          onPointerMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(nearest(e.clientX - r.left)) }}
          onPointerLeave={() => setHover(null)}
          onClick={() => { if (h) onOpen(h.c) }}
          onFocus={() => setHover(i => i ?? pts.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setHover(i => Math.min(pts.length - 1, Math.max(0, (i ?? pts.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)))) }
            if (e.key === 'Enter' && h) onOpen(h.c)
          }}
          style={{ cursor: h ? 'pointer' : 'default' }}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'ci-base' : 'ci-gl'} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="ci-tick">{v}%</text>
            </g>
          ))}
          {xTicks.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor="middle" className="ci-tick">{new Date(t).toLocaleDateString('en-AU', long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })}</text>)}
          {h && <line x1={x(h.t)} x2={x(h.t)} y1={T} y2={T + ih} className="ci-cross" />}
          {series.map(s => (
            <g key={s.ch}>
              {s.pts.length > 1 && <path d={s.pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.c.clickRate).toFixed(1)}`).join(' ')} fill="none" stroke={`var(--${s.ch === 'email' ? 's1' : 's2'})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
              {s.pts.map(p => {
                const on = hover === p.i, cx = x(p.t), cy = y(p.c.clickRate), r = on ? 5.5 : 4
                return s.ch === 'email'
                  ? <circle key={p.c.id} cx={cx} cy={cy} r={r} fill="var(--s1)" className="ci-dot" />
                  : <rect key={p.c.id} x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.6} fill="var(--s2)" className="ci-dot" />
              })}
            </g>
          ))}
        </svg>}
        {h && (
          <div className="rk-tip ci-tip" role="tooltip" style={flip ? { right: w - tipLeft + 12, left: 'auto' } : { left: tipLeft + 12 }}>
            <b>{day(h.c.sentAt, true)}</b>
            {same.map(p => (
              <span key={p.c.id} className="ci-tip-row">
                <i className="ci-tip-key" style={{ background: `var(--${p.c.channel === 'email' ? 's1' : 's2'})` }} aria-hidden />
                <span className="ci-tip-name">{p.c.name}</span>
                <em>{rate(p.c.clickRate)}</em>
              </span>
            ))}
            {same.length === 1 && <small>{num(h.c.clickers)} of {num(h.c.channel === 'email' ? h.c.delivered || h.c.sent : h.c.sent)} clicked · {CH_LABEL[h.c.channel]}</small>}
          </div>
        )}
      </div>
      <table className="rk-sr">
        <caption>Click rate by campaign</caption>
        <thead><tr><th>Sent</th><th>Campaign</th><th>Channel</th><th>Click rate</th><th>People who clicked</th></tr></thead>
        <tbody>{pts.map(p => <tr key={p.c.id}><td>{day(p.c.sentAt, true)}</td><td>{p.c.name}</td><td>{CH_LABEL[p.c.channel]}</td><td>{rate(p.c.clickRate)}</td><td>{num(p.c.clickers)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// ── Email vs SMS ────────────────────────────────────────────────────────────
function Versus({ t }: { t: Insights['totals'] }) {
  const e = t.email, s = t.sms
  type Row = { label: string; hint?: string; e: number | null; s: number | null; fmt: (n: number) => string; eText?: string; sText?: string; bars?: boolean }
  const rows: Row[] = [
    { label: 'Campaigns', e: e.campaigns, s: s.campaigns, fmt: num, bars: true },
    { label: 'Messages sent', e: e.sent, s: s.sent, fmt: num, bars: true },
    { label: 'Click rate', hint: 'of people reached', e: e.clickRate, s: s.clickRate, fmt: rate, bars: true },
    { label: 'Ordered or booked', hint: 'of people who clicked', e: e.conversion, s: s.conversion, fmt: rate, bars: true },
    { label: 'Revenue', e: e.revenue, s: s.revenue, fmt: n => money(n), bars: true },
    { label: 'Revenue per message', e: e.revenuePerMessage, s: s.revenuePerMessage, fmt: n => money(n, true), bars: true },
    { label: 'Cost', e: null, s: s.cost, fmt: n => money(n, true), eText: 'In your plan' },
    { label: 'Return on spend', e: null, s: s.returnOnSpend, fmt: n => roiText(n), eText: '—' },
  ]
  const none = (c: ChannelTotals) => c.campaigns === 0
  const cell = (ch: Channel, v: number | null, row: Row, max: number) => {
    const c = ch === 'email' ? e : s
    const text = none(c) ? '—' : v == null ? (ch === 'email' ? row.eText : row.sText) || '—' : row.fmt(v)
    const share = row.bars && v != null && max > 0 && !none(c) ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : null
    return (
      <div className={`ci-vs-cell ${ch}`}>
        <span className="ci-vs-v">{text}</span>
        {share != null && <span className="ci-vs-track" aria-hidden><span style={{ width: `${share}%`, background: `var(--${ch === 'email' ? 's1' : 's2'})` }} /></span>}
      </div>
    )
  }
  return (
    <div className="rk-chart ci-vs">
      <div className="ci-vs-row ci-vs-headrow">
        <span />
        <span className="ci-vs-ch"><ChannelMark ch="email" />Email{none(e) ? <small>none sent</small> : null}</span>
        <span className="ci-vs-ch"><ChannelMark ch="sms" />SMS{none(s) ? <small>none sent</small> : null}</span>
      </div>
      {rows.map(r => {
        const max = Math.max(r.e || 0, r.s || 0)
        return (
          <div key={r.label} className="ci-vs-row">
            <span className="ci-vs-l">{r.label}{r.hint && <small>{r.hint}</small>}</span>
            {cell('email', r.e, r, max)}
            {cell('sms', r.s, r, max)}
          </div>
        )
      })}
      {!none(e) && <p className="rk-note">Email opens: {rate(e.openRate || 0)} (approximate) · Unsubscribed: {rate(e.unsubscribeRate || 0)}</p>}
    </div>
  )
}

// ── Revenue by campaign ─────────────────────────────────────────────────────
function RevenueBars({ list, onOpen }: { list: InsightCampaign[]; onOpen: (c: InsightCampaign) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const top = useMemo(() => list.filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8), [list])
  const earning = list.filter(c => c.revenue > 0).length
  if (!top.length) return <p className="rk-muted">No paid orders through campaign links in this period yet.</p>
  const max = top[0].revenue
  const chans = [...new Set(top.map(c => c.channel))].sort() as Channel[]
  return (
    <div className="rk-chart ci-bars">
      {chans.length > 1 && <div className="rk-legend">{chans.map(ch => <span key={ch}><i className={ch === 'email' ? 's1' : 's2'} aria-hidden />{CH_LABEL[ch]}</span>)}</div>}
      <ol className="ci-bar-list">
        {top.map(c => {
          const r = roi(c.revenue, c.cost)
          return (
            <li key={c.id} className="ci-bar-row">
              <button type="button" className={`ci-bar-btn${hover === c.id ? ' on' : ''}`} onClick={() => onOpen(c)}
                onPointerEnter={() => setHover(c.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
                aria-label={`${c.name}, ${CH_LABEL[c.channel]}: ${money(c.revenue)} from ${num(c.orders)} order${c.orders === 1 ? '' : 's'}`}>
                <span className="ci-bar-name"><span>{c.name}</span><small><ChannelTag ch={c.channel} /> · {day(c.sentAt)}</small></span>
                <span className="ci-bar-track">
                  <span className="ci-bar" style={{ width: `calc((100% - 84px) * ${c.revenue / max})`, background: `var(--${c.channel === 'email' ? 's1' : 's2'})` }} />
                  <span className="ci-bar-v">{money(c.revenue)}</span>
                </span>
              </button>
              {hover === c.id && (
                <div className="rk-tip ci-bar-tip" role="tooltip">
                  <b>{c.name}</b>
                  <span>Revenue<em>{money(c.revenue, true)}</em></span>
                  <span>Orders<em>{num(c.orders)}</em></span>
                  {c.bookings > 0 && <span>Bookings<em>{num(c.bookings)}</em></span>}
                  <span>People who clicked<em>{num(c.clickers)}</em></span>
                  {c.channel === 'sms' && <span>Cost<em>{money(c.cost, true)}</em></span>}
                  {c.channel === 'sms' && <span>Return<em>{roiText(r)}</em></span>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {earning > top.length && <p className="rk-note">The top {top.length} of {earning} campaigns with orders. Every campaign is in the table below.</p>}
    </div>
  )
}

// ── Every campaign, sortable ────────────────────────────────────────────────
type SortKey = 'sentAt' | 'name' | 'sent' | 'clickers' | 'clickRate' | 'orders' | 'revenue' | 'cost' | 'roi'
const COLS: { key: SortKey; label: string; num?: boolean; hide?: boolean }[] = [
  { key: 'name', label: 'Campaign' },
  { key: 'sentAt', label: 'Date', hide: true },
  { key: 'sent', label: 'Sent', num: true, hide: true },
  { key: 'clickers', label: 'Clicked', num: true, hide: true },
  { key: 'clickRate', label: 'Click rate', num: true },
  { key: 'orders', label: 'Orders', num: true, hide: true },
  { key: 'revenue', label: 'Revenue', num: true },
  { key: 'cost', label: 'Cost', num: true, hide: true },
  { key: 'roi', label: 'Return', num: true, hide: true },
]

function CampaignTable({ list, onOpen }: { list: InsightCampaign[]; onOpen: (c: InsightCampaign) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'sentAt', desc: true })
  const [ch, setCh] = useState<'all' | Channel>('all')
  const [q, setQ] = useState('')
  const val = (c: InsightCampaign, k: SortKey): number | string => k === 'roi' ? roi(c.revenue, c.cost) ?? -Infinity : k === 'name' ? c.name.toLowerCase() : (c as any)[k]
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return list.filter(c => (ch === 'all' || c.channel === ch) && (!term || c.name.toLowerCase().includes(term)))
      .sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); const d = x < y ? -1 : x > y ? 1 : 0; return sort.desc ? -d : d })
  }, [list, ch, q, sort])
  const count = (k: 'all' | Channel) => (k === 'all' ? list.length : list.filter(c => c.channel === k).length)
  const toggle = (key: SortKey) => setSort(s => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }))
  return (
    <>
      <div className="rk-ph">
        <h2 id="ci-all-h" className="rk-h">All campaigns</h2>
        <input className="rk-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" />
      </div>
      <div className="rk-chips" role="tablist" aria-label="Channel">
        {(['all', 'email', 'sms'] as const).map(k => (
          <button key={k} type="button" role="tab" aria-selected={ch === k} className={ch === k ? 'on' : ''} onClick={() => setCh(k)}>{k === 'all' ? 'All' : CH_LABEL[k]}<span>{count(k)}</span></button>
        ))}
      </div>
      <div className="ci-table-wrap">
        <table className="ci-table">
          <thead>
            <tr>
              {COLS.map(c => {
                const dir = sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'
                return (
                  <th key={c.key} className={`${c.num ? 'n' : ''}${c.hide ? ' hide-sm' : ''}`} aria-sort={dir as any}>
                    <button type="button" onClick={() => toggle(c.key)} className={sort.key === c.key ? 'on' : ''}>
                      {c.label}
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`ci-sort${sort.key === c.key ? (sort.desc ? ' d' : ' a') : ''}`}><path d="M2.5 4 5 1.5 7.5 4" /><path d="M2.5 6 5 8.5 7.5 6" /></svg>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const r = roi(c.revenue, c.cost)
              return (
                <tr key={c.id} onClick={() => onOpen(c)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(c) }} aria-label={`${c.name}: open the report`}>
                  <td className="ci-name"><b>{c.name}</b><small><ChannelTag ch={c.channel} /><span className="show-sm"> · {day(c.sentAt, true)}</span>{c.status === 'sending' ? <span className="ci-st">Sending</span> : c.status === 'cancelled' ? <span className="ci-st">Stopped part-way</span> : null}</small></td>
                  <td className="hide-sm ci-date">{day(c.sentAt, true)}</td>
                  <td className="n hide-sm">{num(c.sent)}</td>
                  <td className="n hide-sm">{num(c.clickers)}</td>
                  <td className="n">{rate(c.clickRate)}</td>
                  <td className="n hide-sm">{num(c.orders)}{c.bookings ? <small> +{num(c.bookings)} booked</small> : null}</td>
                  <td className="n"><b>{money(c.revenue)}</b></td>
                  <td className="n hide-sm">{c.channel === 'email' ? <span className="ci-muted">In plan</span> : money(c.cost, true)}</td>
                  <td className={`n hide-sm${r != null && r > 0 ? ' up' : r != null && r < 0 ? ' down' : ''}`}>{roiText(r)}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={COLS.length} className="ci-none">No campaigns match.</td></tr>}
          </tbody>
        </table>
      </div>
      <button type="button" className="rk-more ci-sort-sm" onClick={() => toggle(sort.key === 'revenue' ? 'sentAt' : 'revenue')}>
        {sort.key === 'revenue' ? 'Sort by date' : 'Sort by revenue'}
      </button>
    </>
  )
}

const CI_CSS = `
.ci{padding:24px 28px 48px;box-sizing:border-box;width:100%;max-width:1280px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--ci-surface:#fff;--s1:#2a78d6;--s2:#eb6834}
.ci button::before{display:none!important}
.ci-back{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 14px 0 10px;margin-bottom:14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}.ci-back:hover{background:#ececef;color:#18181b}
.ci-head{margin-bottom:16px}.ci-head h1{font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.15;color:var(--ink);margin:0}.ci-head p{color:#71717a;font-size:14px;margin:6px 0 0}
.ci-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.ci-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5;max-width:100%;overflow-x:auto;scrollbar-width:none}
.ci-seg button{flex-shrink:0;height:32px;padding:0 14px;border:none;border-radius:999px;background:transparent;color:#52525b;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.ci-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(16,24,40,.08),0 0 0 1px rgba(0,0,0,.04)}
.ci-loading{font-size:12.5px;color:var(--slate)}
.ci-body{transition:opacity .15s}.ci-body.stale{opacity:.55;pointer-events:none}
.ci-err{background:#fef2f2!important;box-shadow:0 0 0 1px #fecaca!important;color:#7f1d1d;font-size:13px;margin-bottom:16px}
.ci-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 20px!important;text-align:center}
.ci-empty b{font-size:16px;color:var(--ink)}.ci-empty span{font-size:13.5px;color:var(--slate);max-width:420px}
.ci-empty-acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center}
.ci-pill{height:38px;padding:0 16px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
.ci-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:10px;margin-bottom:12px}
.ci-kpi{display:flex;flex-direction:column;gap:4px}.ci-kpi.hot{box-shadow:0 0 0 1.5px var(--coral)!important}
.ci-kpi-l{font-size:13.5px;font-weight:600;color:#71717a}
.ci-kpi-v{font-size:28px;font-weight:800;letter-spacing:-.02em;color:var(--ink);line-height:1.15}
.ci-kpi-s{font-size:12.5px;color:#8e8e93}
.ci-hl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:10px;margin-bottom:12px}
.ci-hl-card{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:none;font:inherit;text-align:left;cursor:pointer;color:inherit;transition:box-shadow .15s,transform .15s}
.ci-hl-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 6px 18px -8px rgba(16,24,40,.18)}
.ci-hl-card:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
.ci-hl-l{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:700;line-height:1.35;color:#15803d}.ci-hl-l svg{flex-shrink:0;margin-top:1px}
.ci-hl-card.low .ci-hl-l{color:#71717a}
.ci-hl-ms{display:flex;flex-wrap:wrap;gap:4px 22px;margin:2px 0 4px}
.ci-hl-m{display:flex;flex-direction:column}.ci-hl-m small{font-size:12px;color:#8e8e93}
.ci-hl-v{font-size:24px;font-weight:800;letter-spacing:-.02em;color:var(--ink);line-height:1.2}
.ci-hl-n{max-width:100%;font-size:14px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ci-hl-s{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:12px;color:#8e8e93}
.ci-ch{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:#52525b}
.ci-mark{flex-shrink:0;display:inline-block}
.ci-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
.ci-sec{margin-bottom:12px}
.ci-card-h{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}.ci-card-h h2{margin:0}
.ci-sub{font-size:12.5px;color:#8e8e93}
.ci-chart .rk-legend span{gap:5px}
.ci-key{display:inline-block;width:12px;height:2px;border-radius:2px;margin-left:-2px}
.ci-grid>.rk-card{display:flex;flex-direction:column}
.ci-chart{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.ci-plot{position:relative;flex:1 1 auto;min-height:230px}
.ci-plot svg{position:absolute;left:0;top:0;display:block;outline:none;touch-action:pan-y}
.ci-plot svg:focus-visible{outline:2px solid var(--coral);outline-offset:4px;border-radius:8px}
.ci-plot .ci-gl{stroke:#f0f0f2;stroke-width:1}
.ci-plot .ci-base{stroke:#e4e4e7;stroke-width:1}
.ci-plot .ci-cross{stroke:#a1a1aa;stroke-width:1}
.ci-plot .ci-tick{font-size:11px;fill:#a1a1aa;font-variant-numeric:tabular-nums}
.ci-plot .ci-dot{stroke:var(--ci-surface);stroke-width:2}
.ci-tip{top:8px;min-width:180px;max-width:280px}
.ci-tip-row{display:flex;align-items:center;gap:7px}
.ci-tip-key{width:10px;height:2px!important;border-radius:2px!important;flex-shrink:0}
.ci-tip-name{min-width:0;overflow:hidden;text-overflow:ellipsis;color:#d4d4d8}
.ci-tip small{color:#a1a1aa;font-size:11.5px}
.ci-vs{display:flex;flex-direction:column}
.ci-vs-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding:8px 0;border-top:1px solid #f0f0f2}
.ci-vs-headrow{border-top:none;padding-top:0}
.ci-vs-ch{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--ink)}
.ci-vs-ch small{font-weight:500;color:#a1a1aa;margin-left:2px}
.ci-vs-l{display:flex;flex-direction:column;font-size:13px;color:#52525b}.ci-vs-l small{font-size:11.5px;color:#a1a1aa}
.ci-vs-cell{display:flex;flex-direction:column;gap:5px;min-width:0}
.ci-vs-v{font-size:14px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ci-vs-track{display:block;height:6px;border-radius:999px;background:#f4f4f5;overflow:hidden}
.ci-vs-track span{display:block;height:100%;border-radius:999px}
.ci-bar-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.ci-bar-row{position:relative}
.ci-bar-btn{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);align-items:center;gap:14px;width:100%;padding:7px 8px;margin:0 -8px;width:calc(100% + 16px);border:none;border-radius:12px;background:transparent;font:inherit;text-align:left;cursor:pointer;color:inherit}
.ci-bar-btn.on,.ci-bar-btn:focus-visible{background:#f7f7f8;outline:none}
.ci-bar-name{display:flex;flex-direction:column;min-width:0}
.ci-bar-name>span{font-size:13.5px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ci-bar-name small{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#8e8e93}
.ci-bar-track{display:flex;align-items:center;gap:8px;min-width:0}
.ci-bar{display:block;height:14px;min-width:3px;border-radius:0 4px 4px 0}
.ci-bar-v{font-size:13px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.ci-bar-tip{top:calc(100% - 2px);left:236px}
.ci-table-wrap{margin:0 -6px}
.ci-table{width:100%;border-collapse:collapse;font-size:13px}
.ci-table th{padding:0 6px 6px;font-size:11.5px;font-weight:700;color:var(--slate);text-align:left;white-space:nowrap}
.ci-table th.n{text-align:right}
.ci-table th button{display:inline-flex;align-items:center;gap:4px;padding:4px 0;border:none;background:none;font:inherit;color:inherit;cursor:pointer}
.ci-table th button:hover,.ci-table th button.on{color:var(--ink)}
.ci-sort{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;opacity:.45}
.ci-sort.a path:last-child,.ci-sort.d path:first-child{opacity:.2}.ci-sort.a,.ci-sort.d{opacity:1}
.ci-table td{padding:10px 6px;border-top:1px solid #f0f0f2;color:#52525b;vertical-align:middle}
.ci-table td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ci-table td.n b{color:var(--ink)}
.ci-table td.n small{color:#a1a1aa;font-size:11.5px}
.ci-table td.up{color:#15803d;font-weight:650}.ci-table td.down{color:#b91c1c;font-weight:650}
.ci-table tbody tr{cursor:pointer}
.ci-table tbody tr:hover td,.ci-table tbody tr:focus-visible td{background:#fafafa}
.ci-table tbody tr:focus-visible{outline:none}
.ci-table tbody tr td:first-child{border-radius:0}
.ci-name{max-width:340px}
.ci-name b{display:block;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ci-name small{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11.5px;color:#8e8e93;margin-top:2px}
.ci-muted{color:#a1a1aa}
.ci-st{display:inline-flex;align-items:center;height:18px;padding:0 7px;margin-left:2px;border-radius:999px;background:#f4f4f5;color:#71717a;font-size:11px;font-weight:650}
.ci-date{white-space:nowrap}
.ci-table .show-sm{display:none}
.ci-none{text-align:center;color:var(--slate);padding:24px 6px!important}
.ci-sort-sm{display:none}
@media (max-width:1000px){.ci-grid{grid-template-columns:1fr}}
@media (max-width:640px){
  .ci{padding:16px 16px 32px}
  .ci-head h1{font-size:26px}
  .ci-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ci-kpis .ci-kpi:first-child{grid-column:1/-1}
  .ci-kpi-v{font-size:24px}
  .ci-bar-btn{grid-template-columns:minmax(0,1fr);gap:6px}
  .ci-bar-tip{left:8px}
  .ci-vs-row{grid-template-columns:minmax(0,1fr) minmax(0,.9fr) minmax(0,.9fr);gap:8px}
  .ci-table .hide-sm{display:none}
  .ci-table .show-sm{display:inline}
  .ci-name{max-width:none}
  .ci-sort-sm{display:block}
}
[data-theme="dark"] .ci{--ci-surface:#1c1c1f;--s1:#3987e5;--s2:#d95926}
[data-theme="dark"] .ci-back,[data-theme="dark"] .ci-pill,[data-theme="dark"] .ci-seg{background:#2a2a2e;color:#e4e4e7}
[data-theme="dark"] .ci-seg button{color:#a1a1aa}
[data-theme="dark"] .ci-seg button.on{background:#3a3a40;color:#fafafa;box-shadow:none}
[data-theme="dark"] .ci-hl-l{color:#4ade80}[data-theme="dark"] .ci-hl-card.low .ci-hl-l{color:#a1a1aa}
[data-theme="dark"] .ci-hl-card:hover{box-shadow:0 0 0 1px rgba(255,255,255,.14)}
[data-theme="dark"] .ci-ch,[data-theme="dark"] .ci-vs-l,[data-theme="dark"] .ci-table td{color:#c4c4cc}
[data-theme="dark"] .ci-plot .ci-gl{stroke:#26262b}[data-theme="dark"] .ci-plot .ci-base{stroke:#3a3a40}[data-theme="dark"] .ci-plot .ci-cross{stroke:#71717a}
[data-theme="dark"] .ci-plot .ci-tick{fill:#8e8e93}
[data-theme="dark"] .rk-tip{background:#2e2e33;box-shadow:0 10px 24px -8px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}
[data-theme="dark"] .ci-vs-row,[data-theme="dark"] .ci-table td{border-color:#2c2c31}
[data-theme="dark"] .ci-vs-track,[data-theme="dark"] .ci-st{background:#2a2a2e}
[data-theme="dark"] .ci-bar-btn.on,[data-theme="dark"] .ci-bar-btn:focus-visible,[data-theme="dark"] .ci-table tbody tr:hover td,[data-theme="dark"] .ci-table tbody tr:focus-visible td{background:#232327}
[data-theme="dark"] .ci-table td.up{color:#4ade80}[data-theme="dark"] .ci-table td.down{color:#f87171}
`
