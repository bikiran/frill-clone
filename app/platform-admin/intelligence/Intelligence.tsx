'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Super Admin → Intelligence (Phase 1: website analytics). Reads
// /api/platform-admin/intel, which queries PostHog and Supabase on the server.
// Every number on these pages is a real count of collected data; with nothing
// collected yet a page says so instead of showing anything made up.

export type IntelView = 'intel' | 'intel_live' | 'intel_traffic' | 'intel_pages' | 'intel_journeys' | 'intel_funnels'

const CORAL = '#ff7a6b'
const GREEN = '#16a34a'
const RED = '#dc2626'
const REPORT: Record<IntelView, string> = { intel: 'overview', intel_live: 'live', intel_traffic: 'traffic', intel_pages: 'pages', intel_journeys: 'journeys', intel_funnels: 'funnels' }
const TITLES: Record<IntelView, [string, string]> = {
  intel: ['Executive overview', 'Visitors, engagement and conversion on colvy.com, against the previous period'],
  intel_live: ['Live visitors', 'Who is on colvy.com and in the app right now. Refreshes every 15 seconds'],
  intel_traffic: ['Traffic acquisition', 'Where visits come from: channels, referrers, campaigns, landing pages, devices and places'],
  intel_pages: ['Pages & clicks', 'The pages people view, how long they stay, and the buttons they press'],
  intel_journeys: ['Visitor journeys', 'The paths people take through the site, where they arrive and where they leave'],
  intel_funnels: ['Signup funnels', 'From first visit to a working workspace, and where people drop off'],
}
const RANGES = [['24h', '24h'], ['7d', '7d'], ['28d', '28d'], ['90d', '90d'], ['custom', 'Custom']] as const

// ── Formatting ───────────────────────────────────────────────────────────────
const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-AU') : '0')
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`)
const ago = (iso?: string) => {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
}

function downloadCsv(name: string, rows: Record<string, any>[], cols: { key: string; label: string }[]) {
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(r[c.key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Data ─────────────────────────────────────────────────────────────────────
type Range = { range: string; from?: string; to?: string }

function useIntel(report: string, r: Range, pollMs = 0) {
  const [res, setRes] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const load = useCallback(async (fresh = false) => {
    const my = ++seq.current
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const q = new URLSearchParams({ report, range: r.range, ...(r.range === 'custom' && r.from && r.to ? { from: r.from, to: r.to } : {}), ...(fresh ? { fresh: '1' } : {}) })
      const resp = await fetch(`/api/platform-admin/intel?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const j = await resp.json().catch(() => ({ error: 'Bad response' }))
      if (my === seq.current) setRes(resp.ok || j.configured === false ? j : { error: j.error || `HTTP ${resp.status}` })
    } catch (e: any) { if (my === seq.current) setRes({ error: e?.message || 'Could not reach the server' }) }
    finally { if (my === seq.current) setLoading(false) }
  }, [report, r.range, r.from, r.to])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!pollMs) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, pollMs)
    return () => clearInterval(t)
  }, [pollMs, load])
  return { res, loading, reload: () => load(true) }
}

// ── Primitives ───────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 18, padding: '18px 20px' }
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)', margin: 0, letterSpacing: '-0.005em' }
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--sa-muted)', margin: '3px 0 0' }

function Card({ title, note, action, children, style }: { title?: string; note?: string; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ ...card, minWidth: 0, ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div>{title && <h3 style={h3}>{title}</h3>}{note && <p style={sub}>{note}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Empty({ text = 'No data collected for this period yet.' }: { text?: string }) {
  return <div style={{ padding: '22px 8px', textAlign: 'center', fontSize: 12.5, color: 'var(--sa-muted)' }}>{text}</div>
}

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev && !cur) return <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>—</span>
  if (!prev) return <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-muted)' }}>new</span>
  const d = (cur - prev) / prev
  const good = invert ? d < 0 : d > 0
  const c = Math.abs(d) < 0.005 ? 'var(--sa-muted)' : good ? GREEN : RED
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{d > 0 ? '↑' : d < 0 ? '↓' : ''} {Math.abs(d * 100).toFixed(Math.abs(d) < 0.1 ? 1 : 0)}%</span>
}

function Kpi({ label, value, cur, prev, invert, hint }: { label: string; value: string; cur: number; prev?: number; invert?: boolean; hint?: string }) {
  return (
    <div style={{ ...card, padding: '16px 18px', minWidth: 0 }} title={hint}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--sa-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {prev !== undefined && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Delta cur={cur} prev={prev} invert={invert} /><span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>vs previous</span></div>}
    </div>
  )
}

/** A smooth area chart with hover read-out. */
function AreaChart({ points, series, height = 180 }: { points: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 800, H = height, padY = 12
  if (!points.length) return <Empty />
  const max = Math.max(1, ...points.flatMap(p => p.values))
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W)
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2)
  const line = (k: number) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[k]).toFixed(1)}`).join(' ')
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--sa-muted)', marginBottom: 8 }}>
          {series.map(s => <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
        onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))))) }}>
        <defs>{series.map((s, k) => <linearGradient key={k} id={`ig${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="0.22" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--sa-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {series.map((s, k) => <path key={`a${k}`} d={`${line(k)} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#ig${k})`} />)}
        {series.map((s, k) => <path key={`l${k}`} d={line(k)} fill="none" stroke={s.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--sa-muted)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover !== null && (
        <div style={{ position: 'absolute', top: 0, left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
          <div style={{ fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>{points[hover].label}</div>
          {series.map((s, k) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--sa-muted)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.name}: <b style={{ color: 'var(--sa-text)' }}>{fmt(points[hover].values[k])}</b></div>)}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--sa-muted)', marginTop: 6 }}>
        <span>{points[0].label}</span>{points.length > 2 && <span>{points[Math.floor(points.length / 2)].label}</span>}<span>{points[points.length - 1].label}</span>
      </div>
    </div>
  )
}

/** Ranked rows with a soft proportional bar behind each. */
function BarList({ rows, value = 'sessions', label = 'key', extra, limit = 10, color = CORAL }: { rows: any[]; value?: string; label?: string; extra?: (r: any) => React.ReactNode; limit?: number; color?: string }) {
  const [all, setAll] = useState(false)
  if (!rows?.length) return <Empty />
  const max = Math.max(1, ...rows.map(r => Number(r[value]) || 0))
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {shown.map((r, i) => (
        <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 9, overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, width: `${(Number(r[value]) / max) * 100}%`, background: color, opacity: 0.1, borderRadius: 9 }} />
          <span style={{ position: 'relative', flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r[label])}>{String(r[label])}</span>
          {extra && <span style={{ position: 'relative', fontSize: 11.5, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{extra(r)}</span>}
          <span style={{ position: 'relative', fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{fmt(Number(r[value]))}</span>
        </div>
      ))}
      {rows.length > limit && <button onClick={() => setAll(v => !v)} style={{ alignSelf: 'flex-start', marginTop: 4, background: 'none', border: 'none', color: CORAL, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 10px' }}>{all ? 'Show less' : `Show all ${rows.length}`}</button>}
    </div>
  )
}

function Table({ rows, cols, name }: { rows: any[]; cols: { key: string; label: string; num?: boolean; render?: (r: any) => React.ReactNode }[]; name: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const sorted = useMemo(() => !sort ? rows : [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir), [rows, sort])
  if (!rows?.length) return <Empty />
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{cols.map(c => (
            <th key={c.key} onClick={() => setSort(s => ({ key: c.key, dir: s?.key === c.key && s.dir === -1 ? 1 : -1 }))}
              style={{ textAlign: c.num ? 'right' : 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--sa-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {c.label}{sort?.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
            </th>))}</tr></thead>
          <tbody>{sorted.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {cols.map(c => <td key={c.key} style={{ padding: '8px 10px', textAlign: c.num ? 'right' : 'left', color: 'var(--sa-text)', fontVariantNumeric: c.num ? 'tabular-nums' : undefined, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.render ? c.render(r) : c.num ? fmt(Number(r[c.key])) : String(r[c.key] ?? '')}</td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <ExportButton onClick={() => downloadCsv(name, sorted, cols)} />
    </div>
  )
}

const ExportButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    Export CSV
  </button>
)

function Funnel({ steps, name }: { steps: { label: string; count: number }[]; name: string }) {
  if (!steps.length || !steps[0].count) return <Empty text="Nobody has reached the first step in this period yet." />
  const first = steps[0].count
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          const prev = i ? steps[i - 1].count : s.count
          const conv = prev ? s.count / prev : 0
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)' }}><span style={{ color: 'var(--sa-muted)', marginRight: 6 }}>{i + 1}</span>{s.label}</span>
                <span style={{ fontSize: 12, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>
                  <b style={{ color: 'var(--sa-text)', fontSize: 13 }}>{fmt(s.count)}</b> · {pct(s.count / first, 0)} of start{i > 0 && <> · <span style={{ color: conv < 0.3 ? RED : 'var(--sa-muted)' }}>{pct(conv, 0)} from previous</span></>}
                </span>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: 'var(--sa-border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(s.count ? 1.5 : 0, (s.count / first) * 100)}%`, height: '100%', borderRadius: 6, background: `linear-gradient(90deg, ${CORAL}, #ff9a8b)`, transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
              </div>
            </div>
          )
        })}
      </div>
      <ExportButton onClick={() => downloadCsv(name, steps.map((s, i) => ({ step: i + 1, label: s.label, people: s.count, of_start: first ? (s.count / first).toFixed(4) : '0' })), [{ key: 'step', label: 'Step' }, { key: 'label', label: 'Step name' }, { key: 'people', label: 'People' }, { key: 'of_start', label: 'Share of start' }])} />
    </div>
  )
}

function Setup({ missing }: { missing: string[] }) {
  return (
    <Card title="Connect PostHog to see website analytics" note="The Intelligence Centre reads Colvy's own PostHog project. Nothing is shown until real data is collected.">
      <ol style={{ margin: '4px 0 0', paddingLeft: 20, listStyle: 'decimal', fontSize: 13, lineHeight: 1.8, color: 'var(--sa-text)' }}>
        <li>Create a project at <b>posthog.com</b> (the free tier covers 1 million events a month). Choose the US or EU region.</li>
        <li>In Vercel → Settings → Environment Variables, add <code>NEXT_PUBLIC_POSTHOG_KEY</code> (Project settings → Project API key). For an EU project also add <code>NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com</code>.</li>
        <li>Create a personal API key (Account → Personal API keys) with read access to <b>Query</b> and <b>Person</b> (write, for deletions), and add it as <code>POSTHOG_API_KEY</code>, with <code>POSTHOG_PROJECT_ID</code> (the number in the project URL).</li>
        <li>Redeploy. Visits start appearing within a minute.</li>
      </ol>
      {missing.length > 0 && <p style={{ ...sub, marginTop: 12 }}>Not set yet: {missing.map(m => <code key={m} style={{ marginRight: 8 }}>{m}</code>)}</p>}
    </Card>
  )
}

const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 14 })

// ── Views ────────────────────────────────────────────────────────────────────

function OverviewView({ d }: { d: any }) {
  const c = d.current, p = d.previous
  const points = (d.series || []).map((s: any) => ({ label: new Date(`${s.day}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), values: [s.visitors, s.pageviews] }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={grid(170)}>
        <Kpi label="Visitors" value={fmt(c.visitors)} cur={c.visitors} prev={p.visitors} />
        <Kpi label="Sessions" value={fmt(c.sessions)} cur={c.sessions} prev={p.sessions} />
        <Kpi label="Page views" value={fmt(c.pageviews)} cur={c.pageviews} prev={p.pageviews} />
        <Kpi label="Avg. session" value={dur(c.avgDuration)} cur={c.avgDuration} prev={p.avgDuration} />
        <Kpi label="Bounce rate" value={pct(c.bounceRate, 0)} cur={c.bounceRate} prev={p.bounceRate} invert hint="Sessions with a single page view" />
      </div>
      <Card title="Traffic" note="Unique visitors and page views per day">
        <AreaChart points={points} series={[{ name: 'Visitors', color: CORAL }, { name: 'Page views', color: '#6366f1' }]} />
      </Card>
      <div style={grid(170)}>
        <Kpi label="Viewed pricing" value={fmt(c.pricingViews)} cur={c.pricingViews} prev={p.pricingViews} />
        <Kpi label="Pricing clicks" value={fmt(c.pricingClicks)} cur={c.pricingClicks} prev={p.pricingClicks} />
        <Kpi label="Started signup" value={fmt(c.signupStarted)} cur={c.signupStarted} prev={p.signupStarted} />
        <Kpi label="Accounts created" value={fmt(c.signups)} cur={c.signups} prev={p.signups} />
        <Kpi label="New workspaces" value={fmt(c.newWorkspaces)} cur={c.newWorkspaces} prev={p.newWorkspaces} hint="From Colvy's database, including workspaces created before analytics was switched on" />
        <Kpi label="Visitor → account" value={pct(c.conversionRate, 2)} cur={c.conversionRate} prev={p.conversionRate} />
      </div>
    </div>
  )
}

function LiveView({ d }: { d: any }) {
  const max = Math.max(1, ...(d.minutes || []).map((m: any) => m.sessions))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...grid(220) }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ position: 'relative', width: 14, height: 14 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, animation: 'ilPulse 1.8s ease-out infinite' }} />
            <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: GREEN }} />
          </span>
          <div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--sa-text)', lineHeight: 1 }}>{fmt(d.activeSessions)}</div>
            <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 4 }}>active sessions · last 5 minutes</div>
          </div>
        </div>
        <Kpi label="Active visitors" value={fmt(d.activeVisitors)} cur={d.activeVisitors} />
        <Kpi label="In the Colvy app" value={fmt(d.appSessions)} cur={d.appSessions} hint="Signed-in sessions in the app, in the last 5 minutes" />
      </div>
      <Card title="Last 30 minutes" note="Active sessions per minute">
        {d.minutes?.length ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
            {d.minutes.map((m: any, i: number) => <div key={i} title={`${new Date(m.minute).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}: ${m.sessions}`} style={{ flex: 1, height: `${Math.max(4, (m.sessions / max) * 100)}%`, background: CORAL, opacity: 0.35 + 0.65 * (i / d.minutes.length), borderRadius: '4px 4px 1px 1px' }} />)}
          </div>
        ) : <Empty text="No one on the site in the last 30 minutes." />}
      </Card>
      <div style={grid(320)}>
        <Card title="Pages right now" note="Last 30 minutes"><BarList rows={d.pages} label="path" extra={r => r.site === 'app' ? 'app' : ''} /></Card>
        <Card title="Where they are" note="Approximate, from IP address"><BarList rows={d.countries} label="country" color="#6366f1" /></Card>
      </div>
      <Card title="Activity" note="The latest events, newest first. No names, emails or message content are collected.">
        {d.recent?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {d.recent.map((e: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(48px,70px) minmax(0,150px) minmax(0,1fr) minmax(0,160px)', gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--sa-border)', fontSize: 12.5, alignItems: 'center' }}>
                <span style={{ color: 'var(--sa-muted)', fontVariantNumeric: 'tabular-nums' }}>{ago(e.at)}</span>
                <span style={{ fontWeight: 700, color: e.event.startsWith('$') ? 'var(--sa-muted)' : CORAL, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.event.replace(/^\$/, '')}</span>
                <span style={{ color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.cta ? `${e.cta} · ` : ''}{e.path}</span>
                <span style={{ color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{e.place || e.device}</span>
              </div>
            ))}
          </div>
        ) : <Empty text="No activity in the last 30 minutes." />}
      </Card>
    </div>
  )
}

const signupsCol = (r: any) => r.signups ? <span style={{ color: GREEN, fontWeight: 700 }}>{r.signups} signup{r.signups === 1 ? '' : 's'}</span> : ''

function TrafficView({ d }: { d: any }) {
  const cols = [{ key: 'key', label: 'Name' }, { key: 'sessions', label: 'Sessions', num: true }, { key: 'visitors', label: 'Visitors', num: true }, { key: 'signups', label: 'Signups', num: true }]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={grid(320)}>
        <Card title="Channels" note={`${fmt(d.totalSessions)} sessions, grouped by how they arrived`}><BarList rows={d.channels} extra={signupsCol} /></Card>
        <Card title="Referrers" note="The site that sent the visit"><BarList rows={d.referrers} extra={signupsCol} /></Card>
      </div>
      <Card title="Campaigns" note="From utm_campaign tags">
        <Table rows={d.campaigns} cols={cols} name="colvy-campaigns" />
      </Card>
      <div style={grid(320)}>
        <Card title="Sources (utm_source)"><BarList rows={d.sources} extra={signupsCol} /></Card>
        <Card title="Mediums (utm_medium)"><BarList rows={d.mediums} extra={signupsCol} /></Card>
      </div>
      <Card title="Landing pages" note="The first page of each visit">
        <Table rows={d.landing} cols={[{ key: 'key', label: 'Page' }, ...cols.slice(1)]} name="colvy-landing-pages" />
      </Card>
      <div style={grid(260)}>
        <Card title="Devices"><BarList rows={d.devices} color="#6366f1" /></Card>
        <Card title="Browsers"><BarList rows={d.browsers} color="#6366f1" /></Card>
        <Card title="Operating systems"><BarList rows={d.os} color="#6366f1" /></Card>
      </div>
      <div style={grid(320)}>
        <Card title="Countries" note="Approximate, from IP address"><BarList rows={d.countries} color="#0ea5e9" extra={signupsCol} /></Card>
        <Card title="Cities" note="Approximate, from IP address"><BarList rows={d.cities} color="#0ea5e9" /></Card>
      </div>
    </div>
  )
}

function PagesView({ d }: { d: any }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Pages" note="Marketing pages, by views">
        <Table rows={d.pages} name="colvy-pages" cols={[{ key: 'path', label: 'Page' }, { key: 'views', label: 'Views', num: true }, { key: 'visitors', label: 'Visitors', num: true }, { key: 'sessions', label: 'Sessions', num: true }, { key: 'avgSeconds', label: 'Avg. time', num: true, render: r => r.avgSeconds ? dur(r.avgSeconds) : '—' }]} />
      </Card>
      <div style={grid(360)}>
        <Card title="Button clicks" note="Buttons tagged with data-cta">
          <Table rows={d.ctas} name="colvy-clicks" cols={[{ key: 'cta', label: 'Button' }, { key: 'location', label: 'Where' }, { key: 'clicks', label: 'Clicks', num: true }, { key: 'people', label: 'People', num: true }]} />
        </Card>
        <Card title="Pricing plan clicks" note="Plan buttons on /pricing">
          <Table rows={d.pricing} name="colvy-pricing-clicks" cols={[{ key: 'plan', label: 'Plan' }, { key: 'billing', label: 'Billing' }, { key: 'clicks', label: 'Clicks', num: true }, { key: 'people', label: 'People', num: true }]} />
        </Card>
      </div>
    </div>
  )
}

function JourneysView({ d }: { d: any }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={grid(180)}>
        <Kpi label="Sessions" value={fmt(d.sessions)} cur={d.sessions} />
        <Kpi label="Pages per session" value={(d.avgPages || 0).toFixed(1)} cur={d.avgPages} />
      </div>
      <Card title="Most common paths" note="The first four pages of each visit">
        <Table rows={d.paths} name="colvy-journeys" cols={[{ key: 'key', label: 'Path' }, { key: 'sessions', label: 'Sessions', num: true }]} />
      </Card>
      <div style={grid(320)}>
        <Card title="Where visits start"><BarList rows={d.entries} /></Card>
        <Card title="Where visits end"><BarList rows={d.exits} color="#6366f1" /></Card>
      </div>
      <Card title="What people do next" note="From each of the busiest pages, the next page (or leaving)">
        {d.transitions?.length ? (
          <div style={grid(280)}>
            {d.transitions.map((t: any) => (
              <div key={t.from} style={{ border: '1px solid var(--sa-border)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.from}</div>
                <BarList rows={t.next} limit={5} color={CORAL} />
              </div>
            ))}
          </div>
        ) : <Empty />}
      </Card>
      {d.truncated && <p style={sub}>This period has more page views than the journey view reads at once; shorten the range for complete paths.</p>}
    </div>
  )
}

function FunnelsView({ d, configured }: { d: any; configured: boolean }) {
  const STEP_LABELS: Record<string, string> = { started: 'Opened signup', about_you: 'About you', business: 'Business', business_details: 'Business details', contact: 'Contact details', verify_email: 'Verified email', verify_mobile: 'Verified mobile', password: 'Created password' }
  const steps = (d.signupSteps || []).map((s: any) => ({ label: STEP_LABELS[s.name] || `Step ${s.step}`, count: s.people }))
  const a = d.attempts || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {configured && (
        <Card title="Visit to workspace" note="People who did each step, in order, within 14 days">
          <Funnel steps={d.website || []} name="colvy-website-funnel" />
        </Card>
      )}
      {configured && (
        <div style={grid(360)}>
          <Card title="Signup form, step by step"><Funnel steps={steps} name="colvy-signup-steps" /></Card>
          <Card title="Signup errors" note="What stopped people, by error type and step">
            <Table rows={d.signupErrors || []} name="colvy-signup-errors" cols={[{ key: 'code', label: 'Error' }, { key: 'step', label: 'Step', num: true }, { key: 'count', label: 'Times', num: true }, { key: 'people', label: 'People', num: true }]} />
          </Card>
        </div>
      )}
      <Card title="Signup attempts" note="Colvy's own record of every signup, including before analytics was switched on">
        {a.available === false ? <Empty text="The signup_attempts table isn't available." /> : (
          <Funnel name="colvy-signup-attempts" steps={[
            { label: 'Started (details entered)', count: a.total || 0 },
            { label: 'Code sent', count: a.codeSent || 0 },
            { label: 'Email verified', count: a.emailVerified || 0 },
            { label: 'Mobile verified', count: a.mobileVerified || 0 },
            { label: 'Account created', count: a.accountCreated || 0 },
          ]} />
        )}
        {!!a.wrongCodes && <p style={{ ...sub, marginTop: 10 }}>{fmt(a.wrongCodes)} wrong codes entered in this period.</p>}
      </Card>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Intelligence({ view }: { view: IntelView }) {
  const [r, setR] = useState<Range>(() => {
    try { const s = JSON.parse(localStorage.getItem('colvy_intel_range') || 'null'); if (s?.range) return s } catch {}
    return { range: '7d' }
  })
  useEffect(() => { try { localStorage.setItem('colvy_intel_range', JSON.stringify(r)) } catch {} }, [r])
  const report = REPORT[view]
  const { res, loading, reload } = useIntel(report, r, view === 'intel_live' ? 15_000 : 0)
  const [title, note] = TITLES[view]
  const d = res?.data
  const showRange = view !== 'intel_live'

  return (
    <div>
      <style>{`@keyframes ilPulse { 0% { transform: scale(1); opacity: .6 } 100% { transform: scale(2.6); opacity: 0 } } @keyframes ilFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: CORAL, marginBottom: 6 }}>Intelligence</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--sa-text)', margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
          <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: '5px 0 0' }}>{note}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '100%' }}>
          {showRange && (
            <div style={{ display: 'inline-flex', maxWidth: '100%', overflowX: 'auto', padding: 3, borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)' }}>
              {RANGES.map(([k, l]) => (
                <button key={k} onClick={() => setR(prev => k === 'custom' ? { range: 'custom', from: prev.from || new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10), to: prev.to || new Date().toISOString().slice(0, 10) } : { range: k })}
                  style={{ padding: '6px 11px', borderRadius: 8, border: 'none', background: r.range === k ? 'var(--sa-text)' : 'transparent', color: r.range === k ? 'var(--sa-card)' : 'var(--sa-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
              ))}
            </div>
          )}
          {showRange && r.range === 'custom' && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={r.from || ''} max={r.to} onChange={e => setR(p => ({ ...p, from: e.target.value }))} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 12 }} />
              <span style={{ color: 'var(--sa-muted)', fontSize: 12 }}>to</span>
              <input type="date" value={r.to || ''} min={r.from} onChange={e => setR(p => ({ ...p, to: e.target.value }))} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 12 }} />
            </span>
          )}
          <button onClick={reload} title="Refresh now" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            {res?.cachedAt ? `Updated ${ago(res.cachedAt)}` : loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {res?.error && <Card><p style={{ margin: 0, fontSize: 13, color: RED }}>Couldn’t load this report: {res.error}</p></Card>}
      {!res && loading && <div style={{ ...grid(170) }}>{[0, 1, 2, 3].map(i => <div key={i} style={{ ...card, height: 96, opacity: 0.5 }} />)}</div>}
      {res && res.configured === false && (view !== 'intel_funnels' || !d) && <Setup missing={res.posthog?.missing || []} />}
      {res && !res.error && d && (
        <div style={{ animation: 'ilFade .35s ease both' }}>
          {view === 'intel' && <OverviewView d={d} />}
          {view === 'intel_live' && <LiveView d={d} />}
          {view === 'intel_traffic' && <TrafficView d={d} />}
          {view === 'intel_pages' && <PagesView d={d} />}
          {view === 'intel_journeys' && <JourneysView d={d} />}
          {view === 'intel_funnels' && <FunnelsView d={d} configured={!!res.configured} />}
          {Array.isArray(res.errors) && res.errors.length > 0 && res.configured && (
            <p style={{ ...sub, marginTop: 14 }}>Some figures couldn’t load: {res.errors.slice(0, 3).join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  )
}
