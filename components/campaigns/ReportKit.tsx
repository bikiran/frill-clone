'use client'

// Pieces shared by the email and SMS campaign reports: the People list (filter
// chips with counts, search, one row per person, "Show more"), the follow-up
// cards, and the day-by-day bars. Each report maps its own people into rows.

import { useEffect, useMemo, useState, type ReactNode } from 'react'

export const aud = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
export const ago = (iso?: string | null) => {
  if (!iso) return ''
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)}d ago`
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
export const shortUrl = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, '') } catch { return u } }
const HUES = ['#ff7a6b', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1']
const hue = (s: string) => HUES[[...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]

export type Tag = { t: string; c: 'good' | 'hot' | 'blue' | 'warn' | 'bad' | 'muted' }
export type PersonRowView = { contactId: string | null; name: string; sub: ReactNode; tags: Tag[]; when: string | null; extra?: ReactNode }
export type PeopleFilterDef<T> = { key: string; label: string; test: (p: T) => boolean; note?: ReactNode }

/** Everyone a campaign went to, with filters, search and one row each. */
export function PeopleList<T,>({ items, filters, text, sort, view, emptyText }: {
  items: T[] | null
  filters: PeopleFilterDef<T>[]
  text: (p: T) => string
  sort: (a: T, b: T) => number
  view: (p: T) => PersonRowView
  emptyText: string
}) {
  const [filter, setFilter] = useState(filters[0]?.key || 'all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(50)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of filters) c[f.key] = (items || []).filter(f.test).length
    return c
  }, [items, filters])
  const active = filters.find(f => f.key === filter) || filters[0]
  const list = useMemo(() => {
    const t = query.trim().toLowerCase()
    return (items || []).filter(p => active.test(p) && (!t || text(p).toLowerCase().includes(t))).sort(sort)
  }, [items, active, query, text, sort])
  useEffect(() => { setShown(50) }, [filter, query])

  return (
    <div className="rk-card rk-people">
      <div className="rk-ph">
        <div className="rk-h">People</div>
        <input className="rk-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email or number" aria-label="Search people" />
      </div>
      <div className="rk-chips" role="tablist" aria-label="Show">
        {filters.filter((f, i) => i === 0 || counts[f.key] > 0 || f.key === filter).map(f => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
            {f.label}<span>{(counts[f.key] || 0).toLocaleString()}</span>
          </button>
        ))}
      </div>
      {items === null ? <p className="rk-muted">Loading who it went to…</p>
        : list.length === 0 ? <p className="rk-muted">{items.length ? 'Nobody here.' : emptyText}</p>
        : (<>
          <ul className="rk-list">{list.slice(0, shown).map((p, i) => <Row key={i} v={view(p)} />)}</ul>
          {list.length > shown && <button type="button" className="rk-more" onClick={() => setShown(n => n + 100)}>Show more ({(list.length - shown).toLocaleString()} left)</button>}
        </>)}
      {active?.note && <p className="rk-note">{active.note}</p>}
    </div>
  )
}

function Row({ v }: { v: PersonRowView }) {
  const who = v.name || 'Customer'
  const inner = (<>
    <span className="rk-av" style={{ background: hue(who) }} aria-hidden>{who.trim().charAt(0).toUpperCase()}</span>
    <span className="rk-who"><b>{who}</b><small>{v.sub}</small>{v.extra}</span>
    <span className="rk-tags">{v.tags.map(x => <span key={x.t} className={`rk-tag ${x.c}`}>{x.t}</span>)}</span>
    <span className="rk-when">{ago(v.when)}</span>
  </>)
  return <li>{v.contactId ? <a href={`/admin/customers/profile?id=${v.contactId}`} className="rk-row" title="Open their profile">{inner}</a> : <div className="rk-row">{inner}</div>}</li>
}

const ICON = {
  resend: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />,
  click: <><path d="m9 9 5 12 1.8-5.2L21 14Z" /><path d="M7.2 2.2 8 5.1" /><path d="m5.1 8-2.9-.8" /><path d="M14 4.1 12 6" /></>,
}

/** A one-tap follow-up: who, why, and a button that makes the draft. */
export function FollowUpCard({ icon, title, text, button, busy, disabled, onClick }: { icon: keyof typeof ICON; title: string; text: string; button: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <div className="rk-fu-card">
      <span className="rk-fu-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg></span>
      <div className="rk-fu-t"><b>{title}</b><small>{text}</small></div>
      <button type="button" className="rk-btn" onClick={onClick} disabled={disabled}>{busy ? 'Creating…' : button}</button>
    </div>
  )
}

/** Clicks and replies per day: grouped bars on one axis, with a tooltip per day. */
export function DailyBars({ days, series }: { days: { day: string; [k: string]: any }[]; series: { key: string; label: string }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.flatMap(d => series.map(s => Number(d[s.key]) || 0)))
  const label = (d: string, long = false) => new Date(d + 'T12:00:00').toLocaleDateString('en-AU', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })
  const total = (k: string) => days.reduce((n, d) => n + (Number(d[k]) || 0), 0)
  if (!days.length) return <p className="rk-muted">Nothing yet.</p>
  return (
    <div className="rk-chart">
      <div className="rk-legend">
        {series.map((s, i) => <span key={s.key}><i className={`s${i + 1}`} aria-hidden />{s.label} <b>{total(s.key).toLocaleString()}</b></span>)}
      </div>
      <div className="rk-plot" onMouseLeave={() => setHover(null)}>
        <span className="rk-ymax" aria-hidden>{max}</span>
        <div className="rk-bars">
          {days.map((d, i) => (
            <div key={d.day} className={`rk-day${hover === i ? ' on' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
              aria-label={`${label(d.day, true)}: ${series.map(s => `${Number(d[s.key]) || 0} ${s.label.toLowerCase()}`).join(', ')}`}>
              <div className="rk-grp">
                {series.map((s, j) => <span key={s.key} className={`rk-bar s${j + 1}`} style={{ height: `${((Number(d[s.key]) || 0) / max) * 100}%` }} />)}
              </div>
              {hover === i && (
                <div className={`rk-tip${i > days.length / 2 ? ' left' : ''}`} role="tooltip">
                  <b>{label(d.day, true)}</b>
                  {series.map((s, j) => <span key={s.key}><i className={`s${j + 1}`} aria-hidden />{s.label}<em>{(Number(d[s.key]) || 0).toLocaleString()}</em></span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="rk-axis" aria-hidden>{days.map((d, i) => <span key={d.day}>{i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 5) === 0 ? label(d.day) : ''}</span>)}</div>
      <table className="rk-sr">
        <caption>Per day</caption>
        <thead><tr><th>Day</th>{series.map(s => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{days.map(d => <tr key={d.day}><td>{label(d.day, true)}</td>{series.map(s => <td key={s.key}>{Number(d[s.key]) || 0}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export const RK_CSS = `
.rk-card{border-radius:20px;background:#fff;padding:18px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0}
.rk-h{font-size:15px;font-weight:700;color:var(--ink)}
.rk-muted{margin:10px 0 0;font-size:13px;color:var(--slate)}
.rk-note{margin:10px 0 0;font-size:12px;color:var(--slate)}
.rk-fu{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:10px;margin:0 0 12px}
.rk-fu-card{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:20px;background:color-mix(in srgb,var(--coral) 7%,#fff);box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 22%,transparent)}
.rk-fu-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--coral);box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 18%,transparent)}
.rk-fu-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.rk-fu-t b{font-size:14px;color:var(--ink)}.rk-fu-t small{font-size:12.5px;line-height:1.4;color:#71717a}
.rk-btn{flex-shrink:0;height:38px;padding:0 16px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap}
.rk-btn::before{display:none!important}.rk-btn:disabled{opacity:.6;cursor:default}
.rk-ph{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.rk-search{flex:0 1 280px;min-width:0;height:38px;padding:0 14px;border:1.5px solid transparent;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13.5px;color:var(--ink);outline:none}
.rk-search:focus{background:#fff;border-color:#ececef;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)}
.rk-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:6px}.rk-chips::-webkit-scrollbar{display:none}
.rk-chips button{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.rk-chips button::before{display:none!important}
.rk-chips button span{font-size:12px;font-weight:700;color:#a1a1aa;font-variant-numeric:tabular-nums}
.rk-chips button.on{background:var(--ink);color:#fff}.rk-chips button.on span{color:rgba(255,255,255,.7)}
.rk-list{list-style:none;margin:0;padding:0}.rk-list li+li{border-top:1px solid #f0f0f2}
.rk-row{display:flex;align-items:center;gap:12px;padding:11px 6px;margin:0 -6px;border-radius:14px;color:inherit;text-decoration:none}
a.rk-row:hover{background:#fafafa}
.rk-av{width:36px;height:36px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700}
.rk-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rk-who b{font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-who small{font-size:12.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-quote{margin-top:3px;font-size:12.5px;color:#3f3f46;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-quote::before{content:'“'}.rk-quote::after{content:'”'}
.rk-link{color:#52525b}
.rk-tags{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.rk-tag{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:650;white-space:nowrap}
.rk-tag.good{background:#dcfce7;color:#15803d}.rk-tag.hot{background:color-mix(in srgb,var(--coral) 14%,#fff);color:color-mix(in srgb,var(--coral) 80%,#000)}
.rk-tag.blue{background:#e0ecff;color:#1d4ed8}.rk-tag.warn{background:#fef3c7;color:#b45309}.rk-tag.bad{background:#fee2e2;color:#b91c1c}.rk-tag.muted{background:#f4f4f5;color:#71717a}
.rk-when{flex-shrink:0;width:70px;text-align:right;font-size:12px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.rk-more{display:block;margin:10px auto 0;height:36px;padding:0 16px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.rk-more::before{display:none!important}.rk-more:hover{background:#ececef}
/* Chart: series colours validated for colour-blind separation and contrast (light and dark). */
.rk-chart{--s1:#2a78d6;--s2:#eb6834;position:relative}
.rk-legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 10px;font-size:12.5px;color:#52525b}
.rk-legend span{display:inline-flex;align-items:center;gap:6px}.rk-legend b{color:var(--ink);font-variant-numeric:tabular-nums}
.rk-legend i,.rk-tip i{width:10px;height:10px;border-radius:3px;display:inline-block}
.rk-chart .s1{background:var(--s1)}.rk-chart .s2{background:var(--s2)}
.rk-plot{position:relative;height:150px;padding-left:22px;border-bottom:1px solid #e4e4e7}
.rk-ymax{position:absolute;left:0;top:-6px;font-size:11px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.rk-plot::before{content:'';position:absolute;left:22px;right:0;top:0;border-top:1px solid #f0f0f2}
.rk-bars{position:relative;display:flex;align-items:stretch;gap:4px;height:100%}
.rk-day{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;justify-content:center;border-radius:6px;outline:none;cursor:default}
.rk-day.on,.rk-day:focus-visible{background:#f4f4f5}
.rk-grp{display:flex;align-items:flex-end;gap:2px;height:100%;width:min(100%,28px)}
.rk-bar{flex:1;min-height:0;border-radius:4px 4px 0 0}
.rk-tip{position:absolute;z-index:3;top:6px;left:calc(100% + 6px);display:flex;flex-direction:column;gap:3px;min-width:140px;padding:9px 11px;border-radius:12px;background:#18181b;color:#fff;font-size:12px;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap}
.rk-tip.left{left:auto;right:calc(100% + 6px)}
.rk-tip span{display:flex;align-items:center;gap:6px}.rk-tip em{margin-left:auto;padding-left:12px;font-style:normal;font-weight:700;font-variant-numeric:tabular-nums}
.rk-axis{display:flex;gap:4px;padding-left:22px;margin-top:6px}.rk-axis span{flex:1;min-width:0;text-align:center;font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:visible}
.rk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){
  .rk-row{flex-wrap:wrap;gap:4px 12px}
  .rk-who{flex-basis:calc(100% - 48px)}
  .rk-tags{order:3;margin-left:48px;justify-content:flex-start}
  .rk-when{order:4;width:auto;margin-left:auto}
  .rk-fu-card{flex-wrap:wrap}.rk-fu-card .rk-btn{width:100%}
  .rk-search{flex-basis:100%}
}
[data-theme="dark"] .rk-card{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
[data-theme="dark"] .rk-fu-card{background:color-mix(in srgb,var(--coral) 12%,#1c1c1f)}
[data-theme="dark"] .rk-fu-ic{background:#232327}
[data-theme="dark"] .rk-search,[data-theme="dark"] .rk-chips button:not(.on),[data-theme="dark"] .rk-more,[data-theme="dark"] .rk-tag.muted{background:#2a2a2e}
[data-theme="dark"] .rk-chips button.on{background:#f4f4f5;color:#18181b}[data-theme="dark"] .rk-chips button.on span{color:#71717a}
[data-theme="dark"] .rk-list li+li{border-color:#2c2c31}
[data-theme="dark"] a.rk-row:hover,[data-theme="dark"] .rk-day.on{background:#232327}
[data-theme="dark"] .rk-quote{color:#d4d4d8}
[data-theme="dark"] .rk-chart{--s1:#3987e5;--s2:#d95926}
[data-theme="dark"] .rk-plot{border-color:#2c2c31}[data-theme="dark"] .rk-plot::before{border-color:#2a2a2e}
[data-theme="dark"] .rk-legend{color:#a1a1aa}
`
