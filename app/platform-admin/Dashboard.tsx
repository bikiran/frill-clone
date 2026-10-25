'use client'

// Super Admin → Dashboard: the first page. Top to bottom, in the order you
// act on it: what needs you now, the handful of numbers that matter, platform
// health, growth, plans and recent activity, then shortcuts. Every row links
// to the page that explains it. Numbers come from /api/platform-admin/analytics
// (saved and refreshed in the background, lib/intel/cache), /pulse (failures in
// the last 24 hours) and /status (the public status page's verdict).

import { useState } from 'react'
import { NAV_GROUPS } from './nav'

type Go = (page: string) => void
const CORAL = '#ff7a6b', GREEN = '#10b981', AMBER = '#d97706', RED = '#ef4444', INDIGO = '#6366f1', PURPLE = '#8b5cf6', CYAN = '#0891b2'

const n = (v: any) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-AU'))
const money = (v: any) => (v == null ? '—' : `$${Number(v).toLocaleString('en-AU')}`)
const ago = (iso?: string | null) => {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 45 ? 'just now' : s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, minWidth: 0 }
const grid = (min: number, gap = 14): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap })
const h2: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }

function Card({ title, note, action, children, style }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ ...card, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
          {note && <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '3px 0 0' }}>{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function LinkBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ background: 'none', border: 'none', color: CORAL, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}>{label} →</button>
}

function Skeleton({ h = 18, w = '60%' }: { h?: number; w?: string | number }) {
  return <span style={{ display: 'block', height: h, width: w, borderRadius: 6, background: 'var(--sa-hover)', animation: 'pulse 1s ease-in-out infinite alternate' }} />
}

// ── Key numbers ──────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color, onClick, loading }: { label: string; value: string; sub?: string; color: string; onClick?: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} className="pa-stat" style={{ ...card, padding: '16px 18px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)' }}>{label}</span>
      {loading ? <Skeleton h={30} w="55%" /> : <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--sa-text)', letterSpacing: '-0.02em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
      {sub && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{sub}</span>}
    </button>
  )
}

// ── Needs your attention ─────────────────────────────────────────────────────

type Item = { key: string; tone: 'red' | 'amber' | 'blue' | 'green'; title: string; detail?: string; go?: string; cta?: string; chips?: { id: string; name: string; slug: string | null }[]; more?: number }
const TONE = { red: RED, amber: AMBER, blue: INDIGO, green: GREEN }

function attentionItems(data: any, pulse: any, live: any): Item[] {
  const out: Item[] = []
  const lv = live?.overall?.status
  if (lv === 'outage' || lv === 'degraded') out.push({ key: 'status', tone: lv === 'outage' ? 'red' : 'amber', title: live.overall.title, detail: live.overall.sub, go: 'status', cta: 'Status' })
  const a = data?.attention || {}
  const companies = (k: string, tone: Item['tone'], title: (c: number) => string, detail: string, go = 'companies', cta = 'Companies') => {
    const b = a[k]; if (!b?.count) return
    out.push({ key: k, tone, title: title(b.count), detail, go, cta, chips: b.items, more: Math.max(0, b.count - (b.items?.length || 0)) })
  }
  companies('pastDue', 'red', c => `${c} business${c === 1 ? '' : 'es'} with a failing payment`, 'Their card was declined; Stripe is retrying.', 'intel_revenue', 'Revenue')
  if (pulse && !pulse.error) {
    const p = pulse
    if (p.jobs?.errors) out.push({ key: 'jobs', tone: 'red', title: `${p.jobs.errors} background job run${p.jobs.errors === 1 ? '' : 's'} failed`, detail: `Out of ${n(p.jobs.runs)} in the last 24 hours`, go: 'jobs', cta: 'Jobs' })
    if (p.webhooks?.errors) out.push({ key: 'hooks', tone: 'amber', title: `${p.webhooks.errors} webhook${p.webhooks.errors === 1 ? '' : 's'} failed or rejected`, detail: `Out of ${n(p.webhooks.total)} received in 24 hours`, go: 'webhooks', cta: 'Webhooks' })
    if (p.api?.errors) out.push({ key: 'api', tone: 'amber', title: `${p.api.errors} server error${p.api.errors === 1 ? '' : 's'}`, detail: 'In the last 24 hours', go: 'apilogs', cta: 'API logs' })
    if ((p.agents?.failed || 0) + (p.agents?.stuck || 0) > 0 || p.agents?.platformPaused) out.push({ key: 'agents', tone: p.agents?.platformPaused ? 'red' : 'amber', title: p.agents?.platformPaused ? 'AI agents are paused platform-wide' : `${(p.agents.failed || 0) + (p.agents.stuck || 0)} AI agent run${(p.agents.failed || 0) + (p.agents.stuck || 0) === 1 ? '' : 's'} failed or stuck`, detail: `${n(p.agents?.runs)} runs in 24 hours`, go: 'agents', cta: 'AI agents' })
    if (p.connections?.broken) out.push({ key: 'conn', tone: 'amber', title: `${p.connections.broken} connection${p.connections.broken === 1 ? '' : 's'} need reconnecting`, detail: (p.connections.sample || []).slice(0, 3).map((s: any) => [s.company, s.type].filter(Boolean).join(' · ')).join(', ') || undefined, go: 'integrations', cta: 'Integrations' })
    if (p.emailReceiving && p.emailReceiving.status !== 'working') out.push({ key: 'email', tone: 'amber', title: 'Customer email replies can’t be read', detail: p.emailReceiving.status === 'blocked' ? 'The Resend key can only send. Add a full-access key as RESEND_RECEIVING_API_KEY.' : p.emailReceiving.label, go: 'system', cta: 'Service checks' })
    const ab = p.signupLeads?.abandoned24h || 0
    if (ab) out.push({ key: 'signups', tone: 'blue', title: `${ab} sign-up${ab === 1 ? '' : 's'} not finished`, detail: 'Asked for a code in the last 24 hours and stopped. Worth a follow-up.', go: 'signups', cta: 'Sign-ups' })
  }
  companies('trialEnding', 'amber', c => `${c} trial${c === 1 ? '' : 's'} end in the next 3 days`, 'A good moment to reach out.')
  companies('suspended', 'red', c => `${c} suspended business${c === 1 ? '' : 'es'}`, 'Review or reactivate.')
  companies('newSignups', 'green', c => `${c} new business${c === 1 ? '' : 'es'} to welcome`, 'Joined in the last 2 days.')
  companies('trialExpired', 'blue', c => `${c} expired trial${c === 1 ? '' : 's'} still on the trial plan`, 'Never converted. Follow up or tidy up.')
  companies('longFree', 'blue', c => `${c} long-time free business${c === 1 ? '' : 'es'}`, 'On the free plan for 45+ days. Upsell candidates.')
  return out
}

function Attention({ items, loading, onGo }: { items: Item[]; loading: boolean; onGo: Go }) {
  const urgent = items.filter(i => i.tone === 'red' || i.tone === 'amber').length
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  return (
    <Card title="Needs your attention" note={loading && !items.length ? 'Checking…' : items.length ? `${urgent ? `${urgent} to fix · ` : ''}${items.length - urgent} to follow up` : undefined}>
      {loading && !items.length ? <div style={{ display: 'grid', gap: 10 }}><Skeleton w="70%" /><Skeleton w="50%" /><Skeleton w="60%" /></div>
        : !items.length ? <p style={{ margin: 0, fontSize: 13.5, color: GREEN, fontWeight: 600 }}>✓ All clear. Nothing needs you right now.</p>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((it, i) => (
            <div key={it.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE[it.tone], marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>{it.title}</p>
                {it.detail && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>{it.detail}</p>}
                {!!it.chips?.length && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {it.chips.map(c => (
                      <a key={c.id} href={c.slug ? `https://${c.slug}.colvy.com/admin` : undefined} target="_blank" rel="noopener" title={`Open ${c.name}`}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', color: 'var(--sa-text)', textDecoration: 'none', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</a>
                    ))}
                    {!!it.more && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', alignSelf: 'center' }}>+{it.more} more</span>}
                  </div>
                )}
              </div>
              {it.go && <LinkBtn label={it.cta || 'Open'} onClick={() => onGo(it.go!)} />}
            </div>
          ))}
          {items.length > 6 && (
            <button onClick={() => setAll(v => !v)} style={{ marginTop: 6, padding: '9px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {all ? 'Show less' : `Show ${items.length - 6} more`}
            </button>
          )}
        </div>}
    </Card>
  )
}

// ── Health ───────────────────────────────────────────────────────────────────

function Health({ pulse, onGo }: { pulse: any; onGo: Go }) {
  const rows = !pulse || pulse.error ? [] : [
    { label: 'Background jobs', value: `${n(pulse.jobs?.errors || 0)} failed of ${n(pulse.jobs?.runs || 0)}`, bad: (pulse.jobs?.errors || 0) > 0, go: 'jobs' },
    { label: 'Webhooks', value: `${n(pulse.webhooks?.errors || 0)} failed of ${n(pulse.webhooks?.total || 0)}`, bad: (pulse.webhooks?.errors || 0) > 0, go: 'webhooks' },
    { label: 'Server errors', value: `${n(pulse.api?.errors || 0)} errors · ${n(pulse.api?.warnings || 0)} warnings`, bad: (pulse.api?.errors || 0) > 0, go: 'apilogs' },
    { label: 'AI agent runs', value: `${n(pulse.agents?.failed || 0)} failed · ${n(pulse.agents?.stuck || 0)} stuck of ${n(pulse.agents?.runs || 0)}`, bad: (pulse.agents?.failed || 0) + (pulse.agents?.stuck || 0) > 0 || !!pulse.agents?.platformPaused, go: 'agents' },
    { label: 'Connections', value: `${n(pulse.connections?.broken || 0)} broken of ${n(pulse.connections?.total || 0)}`, bad: (pulse.connections?.broken || 0) > 0, go: 'integrations' },
    { label: 'Stripe events', value: `${n(pulse.stripe?.events || 0)} received`, bad: false, go: 'webhooks' },
  ]
  return (
    <Card title="Platform health" note="Last 24 hours" action={<LinkBtn label="System health" onClick={() => onGo('intel_system')} />}>
      {pulse === null ? <div style={{ display: 'grid', gap: 12 }}>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} w={`${80 - i * 8}%`} />)}</div>
        : pulse?.error ? <p style={{ margin: 0, fontSize: 12.5, color: RED }}>Couldn’t load health: {pulse.error}</p>
        : rows.map(r => (
          <button key={r.label} onClick={() => onGo(r.go)} className="pa-row" style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', border: 'none', borderBottom: '1px solid var(--sa-border)', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sa-text)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.bad ? RED : GREEN }} />{r.label}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: r.bad ? RED : 'var(--sa-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
          </button>
        ))}
    </Card>
  )
}

// ── Growth ───────────────────────────────────────────────────────────────────

function Bars({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} title={`${d.label}: ${d.value}`}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--sa-muted)' }}>{d.value || ''}</span>
          <div style={{ width: '100%', maxWidth: 34, height: `${Math.max(3, (d.value / max) * 78)}%`, borderRadius: 6, background: i === data.length - 1 ? color : color + '70' }} />
          <span style={{ fontSize: 10.5, color: 'var(--sa-muted)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--sa-hover)', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--sa-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--sa-text)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

const PLAN_ORDER = ['enterprise', 'everything', 'omnichannel', 'inbox', 'feedback', 'growth', 'pro', 'business', 'startup', 'trial', 'free', 'suspended']
const PLAN_COLOR: Record<string, string> = { enterprise: PURPLE, everything: '#ff6a4d', omnichannel: '#2b59ff', inbox: '#2b59ff', feedback: '#7c5cff', growth: CORAL, pro: GREEN, business: '#2563eb', startup: CYAN, trial: '#f59e0b', free: '#9ca3af', suspended: RED }

function Plans({ dist, onGo }: { dist: Record<string, number> | undefined; onGo: Go }) {
  const total = Object.values(dist || {}).reduce((a, b) => a + b, 0)
  const keys = Object.keys(dist || {}).sort((a, b) => (PLAN_ORDER.indexOf(a) + 1 || 99) - (PLAN_ORDER.indexOf(b) + 1 || 99))
  return (
    <Card title="Plans" note={total ? `${n(total)} workspaces` : undefined} action={<LinkBtn label="Companies" onClick={() => onGo('companies')} />}>
      {!dist ? <div style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <Skeleton key={i} />)}</div>
        : !total ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sa-muted)' }}>No companies yet.</p>
        : <>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 14, background: 'var(--sa-border)' }}>
            {keys.map(k => <div key={k} title={`${k}: ${dist![k]}`} style={{ width: `${(dist![k] / total) * 100}%`, background: PLAN_COLOR[k] || '#9ca3af' }} />)}
          </div>
          <div style={grid(130, 8)}>
            {keys.map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: PLAN_COLOR[k] || '#9ca3af', flexShrink: 0 }} />
                <span style={{ color: 'var(--sa-text)', textTransform: 'capitalize', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                <span style={{ color: 'var(--sa-muted)', fontVariantNumeric: 'tabular-nums' }}>{dist![k]} · {Math.round((dist![k] / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </>}
    </Card>
  )
}

function Activity({ pulse }: { pulse: any }) {
  const items = [
    ...((pulse?.audit || []) as any[]).map(a => ({ k: `a-${a.id}`, at: a.created_at, color: PURPLE, action: a.summary || String(a.action || '').replace(/[._]/g, ' '), detail: [a.company, a.admin_email].filter(Boolean).join(' · ') })),
    ...((pulse?.signups || []) as any[]).map(c => ({ k: `c-${c.id}`, at: c.created_at, color: GREEN, action: `${c.name || c.slug} signed up`, detail: `${c.slug}.colvy.com · ${c.plan || 'free'}` })),
  ].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 8)
  return (
    <Card title="Recent activity" note="Sign-ups and admin actions">
      {pulse === null ? <div style={{ display: 'grid', gap: 12 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} w={`${85 - i * 10}%`} />)}</div>
        : !items.length ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sa-muted)' }}>Nothing recorded yet.</p>
        : items.map(a => (
          <div key={a.k} style={{ display: 'flex', gap: 12, padding: '8px 0', alignItems: 'flex-start' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, marginTop: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.action}>{a.action}</p>
              <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</p>
            </div>
            <span style={{ fontSize: 11, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{ago(a.at)}</span>
          </div>
        ))}
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard({ data, pulse, live, refreshing, onRefresh, onGo }: { data: any; pulse: any; live: any; refreshing: boolean; onRefresh: () => void; onGo: Go }) {
  const loading = !data || data.mrr === undefined
  const items = attentionItems(data, pulse, live)
  const lv = live?.overall?.status as string | undefined
  const statusColor = lv === 'operational' ? GREEN : lv === 'degraded' ? AMBER : lv === 'outage' ? RED : '#6b7280'
  const mrrNote = data?.mrrSource === 'billing' ? 'Stripe & Shopify, live' : data?.mrrSource === 'subscriptions' ? 'from Stripe subscriptions' : 'estimated from plans'
  const salesTop: any[] = Array.isArray(data?.topSalesCompanies) ? data.topSalesCompanies : []

  return (
    <div>
      <style>{`.pa-stat:hover, .pa-short:hover { border-color: ${CORAL}66 !important; } .pa-row:hover span:first-child { color: ${CORAL} !important; }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--sa-muted)' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--sa-text)', letterSpacing: '-0.02em' }}>{greeting()}, Bikiran</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {live?.overall && (
            <button onClick={() => onGo('status')} title={live.overall.sub || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, border: 'none', background: statusColor + '1c', color: statusColor, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />{live.overall.title}
            </button>
          )}
          <button onClick={onRefresh} title="Recalculate now" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            {refreshing ? 'Updating…' : data?.cachedAt ? `Updated ${ago(data.cachedAt)}` : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Key numbers */}
      <div style={{ ...grid(170, 12), marginBottom: 18 }}>
        <Stat label="MRR" value={money(data?.mrr)} sub={loading ? undefined : `${money(data?.arr)} a year · ${mrrNote}`} color={PURPLE} onClick={() => onGo('intel_revenue')} loading={loading} />
        <Stat label="Paying businesses" value={n(data?.paid)} sub={loading ? undefined : `${money(data?.arpa)} average a month`} color={GREEN} onClick={() => onGo('subs')} loading={loading} />
        <Stat label="Active businesses" value={n(data?.active)} sub={loading ? undefined : `of ${n(data?.companies)} · active in 30 days`} color={INDIGO} onClick={() => onGo('intel_health')} loading={loading} />
        <Stat label="New sign-ups · 7 days" value={n(data?.newLast7)} sub={loading ? undefined : `${n(data?.today)} today`} color={CORAL} onClick={() => onGo('signups')} loading={loading} />
        <Stat label="On trial" value={n(data?.activeTrials)} sub={loading ? undefined : `${n(data?.trialsEndingSoon)} end this week · ${data?.conversion ?? 0}% convert`} color="#f59e0b" onClick={() => onGo('intel_business')} loading={loading} />
        <Stat label="Churn · 30 days" value={data?.churn != null ? `${data.churn}%` : '—'} sub={loading ? undefined : `${n(data?.canceledLast30)} cancelled · ${n(data?.newPaidLast30)} new paid`} color={RED} onClick={() => onGo('intel_revenue')} loading={loading} />
      </div>

      {/* What needs you + health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14, marginBottom: 18, alignItems: 'start' }}>
        <Attention items={items} loading={loading || pulse === null} onGo={onGo} />
        <Health pulse={pulse} onGo={onGo} />
      </div>

      {/* Growth & plans */}
      <div style={{ ...grid(320), marginBottom: 18, alignItems: 'start' }}>
        <Card title="Active businesses each day" note="With a conversation or idea, last 7 days" action={<LinkBtn label="Customer health" onClick={() => onGo('intel_health')} />}>
          {loading ? <Skeleton h={110} w="100%" /> : <Bars data={(data.activeSeries || []).map((d: any) => ({ label: new Date(d.day).toLocaleDateString('en-AU', { weekday: 'short' }), value: d.count }))} color={INDIGO} />}
          <div style={{ ...grid(110, 8), marginTop: 14 }}>
            <Mini label="Active today" value={n(data?.dac)} />
            <Mini label="Trials ending · 7d" value={n(data?.trialsEndingSoon)} color={AMBER} />
            <Mini label="Expired trials" value={n(data?.expiredTrials)} />
          </div>
        </Card>
        <Plans dist={loading ? undefined : data.planDistribution} onGo={onGo} />
      </div>

      {/* Business on Colvy + activity */}
      <div style={{ ...grid(320), marginBottom: 18, alignItems: 'start' }}>
        <Card title="Business done through Colvy" note="Across every workspace, last 30 days" action={<LinkBtn label="Billing & payments" onClick={() => onGo('billing')} />}>
          <div style={{ ...grid(110, 8), marginBottom: salesTop.length ? 14 : 0 }}>
            <Mini label="Sales logged in chat" value={loading ? '…' : money(data.salesLogged30d)} color="#16a34a" />
            <Mini label="Pay links paid" value={loading ? '…' : n(data.payLinksPaid30d)} />
            <Mini label="Bookings" value={loading ? '…' : n(data.bookings30d)} />
          </div>
          {salesTop.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none', fontSize: 13 }}>
              <span style={{ color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>{money(c.total)}</span>
            </div>
          ))}
        </Card>
        <Activity pulse={pulse} />
      </div>

      {/* Shortcuts */}
      <p style={h2}>Shortcuts</p>
      <div style={{ ...grid(220, 10), marginBottom: 18 }}>
        {[
          { label: 'New company', desc: 'Set up a customer workspace', href: 'https://colvy.com/admin/create-company', color: GREEN },
          { label: 'Manage colvy.com', desc: 'Widget, help centre and content for the main site', href: 'https://colvy.com/admin', color: CORAL },
          { label: 'View colvy.com', desc: 'Open the public website', href: 'https://colvy.com', color: INDIGO },
        ].map(s => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener" className="pa-short" style={{ ...card, padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: s.color + '1f', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>↗</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--sa-muted)' }}>{s.desc}</span>
            </span>
          </a>
        ))}
      </div>

      {/* Every area, one click away */}
      <p style={h2}>Everything in Super Admin</p>
      <div style={grid(240, 10)}>
        {NAV_GROUPS.map(g => (
          <div key={g.title} style={{ ...card, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: 'var(--sa-text)' }}>{g.title}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.items.map(it => (
                <button key={it.key} onClick={() => onGo(it.key)} title={it.desc} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', cursor: 'pointer' }}>{it.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
