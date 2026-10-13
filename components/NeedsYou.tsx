'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { SuggestionCard } from '@/components/AgentSuggestion'

// "Needs you": everything waiting on a person, most urgent first — drafts to
// approve (right here), goals being missed now, hand-overs nobody picked up,
// and agent runs that went wrong. NeedsYouView is the page; NeedsYouCard sits
// at the top of the Agents page.

type Urgency = 'now' | 'soon' | 'fyi'
type Item = { key: string; kind: 'approval' | 'reply' | 'review' | 'order' | 'quote' | 'handover' | 'failed'; urgency: Urgency; title: string; detail: string; at: string; href: string; conversationId?: string | null; runId?: string | null; approval?: any }
type GoalLite = { key: string; label: string; rate: number | null; open: number; met: number; missed: number }
type Payload = { items: Item[]; counts: Record<Urgency, number>; alerts: { enabled: boolean }; goals?: GoalLite[] }

const EASE = 'cubic-bezier(.22,1,.36,1)'
const ico = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>{d}</svg>
const ICON: Record<Item['kind'], React.ReactNode> = {
  approval: ico(<><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /></>),
  reply: ico(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  review: ico(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  order: ico(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></>),
  quote: ico(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>),
  handover: ico(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>),
  failed: ico(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
}
const Check = () => ico(<polyline points="20 6 9 17 4 12" />, 18)
const Bell = () => ico(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>)
const Target = () => ico(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>)
const Arrow = () => ico(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 14)
const OPEN: Record<Item['kind'], string> = { approval: 'Open conversation', reply: 'Reply', review: 'Reply to review', order: 'Open', quote: 'Follow up', handover: 'Take over', failed: 'See what happened' }
const GROUPS: { key: Urgency; label: string; hint: string }[] = [
  { key: 'now', label: 'Now', hint: 'Missing a goal, or a customer is waiting' },
  { key: 'soon', label: 'Soon', hint: 'Waiting for you, still within your goals' },
  { key: 'fyi', label: 'For your information', hint: 'Worth a look when you have a minute' },
]

// The last list is kept in this browser, so the page shows it at once and refreshes underneath.
const cacheKey = (companyId: string) => `colvy:needs-you:${companyId}`
const readCache = (companyId: string | null): Payload | null => {
  if (!companyId) return null
  try { const v = JSON.parse(localStorage.getItem(cacheKey(companyId)) || 'null'); return v && Array.isArray(v.items) ? v : null } catch { return null }
}

export function useNeedsYou(companyId: string | null) {
  const [data, setDataState] = useState<Payload | null>(null)
  const setData = useCallback((d: Payload | null) => {
    setDataState(d)
    if (d && companyId) { try { localStorage.setItem(cacheKey(companyId), JSON.stringify({ ...d, items: d.items })) } catch {} }
  }, [companyId])
  useEffect(() => { const c = readCache(companyId); if (c) setDataState(d => d || c) }, [companyId])
  const load = useCallback(async () => {
    if (!companyId) return
    try { const r = await authFetch(`/api/agent/needs-you?companyId=${companyId}`); if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.items)) setData({ ...d, counts: d.counts || { now: 0, soon: 0, fyi: 0 }, alerts: d.alerts || { enabled: false } }) } } catch {}
  }, [companyId, setData])
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t) }, [load])
  return { data, reload: load, setData }
}

function Row({ item, companyId, onDone }: { item: Item; companyId: string; onDone: () => void }) {
  return (
    <li className={`ny-item ${item.urgency}`}>
      <div className="ny-row">
        <span className={`ny-ic ${item.kind}`}>{ICON[item.kind]}</span>
        <div className="ny-txt">
          <p className="ny-t">{item.title}</p>
          <p className="ny-d">{item.detail}</p>
        </div>
        {item.kind !== 'approval' && <a className="ny-open" href={item.href}>{OPEN[item.kind]} <Arrow /></a>}
      </div>
      {item.kind === 'approval' && item.approval && (
        <div className="ny-sg">
          <SuggestionCard s={item.approval} companyId={companyId} compact onDone={onDone} />
          {item.conversationId && <a className="ny-link" href={item.href}>Open the conversation <Arrow /></a>}
        </div>
      )}
    </li>
  )
}

/** The full "Needs you" page. */
export function NeedsYouView({ companyId }: { companyId: string | null }) {
  const { data, reload, setData } = useNeedsYou(companyId)
  const [saving, setSaving] = useState(false)
  const toggleAlerts = async () => {
    if (!data || !companyId) return
    const enabled = !data.alerts.enabled
    setSaving(true)
    try { const r = await authFetch('/api/agent/needs-you', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'alerts', enabled }) }); if (r.ok) setData({ ...data, alerts: { enabled } }) } finally { setSaving(false) }
  }
  const remove = (key: string) => { if (data) setData({ ...data, items: data.items.filter(i => i.key !== key) }); setTimeout(reload, 900) }

  const total = data?.items.length || 0
  return (
    <div className="ny" style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div className="ny-page">
        <nav className="ny-crumbs" aria-label="Breadcrumb"><a href="/admin/agents">AI Agents</a><span aria-hidden="true">/</span><span>Needs you</span></nav>
        <h1 className="ny-title">Needs you</h1>
        <p className="ny-sub">Everything your agents and goals need a person for, most urgent first. When this is empty, you can get on with your day.</p>

        {!data && (
          <div className="ny-cols" aria-busy="true" aria-label="Loading">
            <div className="ny-main"><ul className="ny-list">{[0, 1, 2].map(n => <li key={n} className="ny-item ny-skel"><span className="ny-sk ic" /><span style={{ flex: 1 }}><span className="ny-sk t" /><span className="ny-sk d" /></span></li>)}</ul></div>
            <aside className="ny-side"><div className="ny-card ny-skel" style={{ height: 150 }} /></aside>
          </div>
        )}
        {data && (
          <div className="ny-cols">
            <div className="ny-main">
              {total === 0 && (
                <div className="ny-card ny-empty">
                  <span className="ny-ok"><Check /></span>
                  <div><p className="ny-t">Nothing needs you right now</p><p className="ny-d">Your agents are on it and every goal is on track.</p></div>
                </div>
              )}
              {GROUPS.map(g => {
                const list = data.items.filter(i => i.urgency === g.key)
                if (!list.length) return null
                return (
                  <section key={g.key} id={`ny-${g.key}`} className="ny-group">
                    <p className="ny-gh"><span className={`ny-dot ${g.key}`} />{g.label} <span className="ny-count">{list.length}</span><span className="ny-ghint">{g.hint}</span></p>
                    <ul className="ny-list">{list.map(i => <Row key={i.key} item={i} companyId={companyId!} onDone={() => remove(i.key)} />)}</ul>
                  </section>
                )
              })}
            </div>

            <aside className="ny-side">
              <div className="ny-card ny-overview">
                <p className="ny-t">Overview</p>
                <ul className="ny-sum">
                  {GROUPS.map(g => {
                    const n = data.counts[g.key] || 0
                    return (
                      <li key={g.key}>
                        <a href={n ? `#ny-${g.key}` : undefined} className={n ? '' : 'none'}>
                          <span className={`ny-dot ${g.key}`} /><span className="ny-sum-l">{g.label}</span><span className="ny-sum-n">{n}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {!!data.goals?.length && (
                <div className="ny-card">
                  <div className="ny-head"><p className="ny-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ny-side-ic"><Target /></span>Goals · last 2 weeks</p></div>
                  <ul className="ny-goals">
                    {data.goals.map(g => {
                      const pct = g.rate == null ? null : Math.round(g.rate * 100)
                      return (
                        <li key={g.key}>
                          <div className="ny-goal-top">
                            <span className="ny-goal-l">{g.label}</span>
                            <span className={`ny-goal-p ${pct == null ? '' : pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad'}`}>{pct == null ? '—' : `${pct}%`}</span>
                          </div>
                          <span className="ny-goal-m" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></span>
                          {g.open > 0 && <span className="ny-goal-o">{g.open} missing now</span>}
                        </li>
                      )
                    })}
                  </ul>
                  <a className="ny-link" href="/admin/agents/results">Change goals <Arrow /></a>
                </div>
              )}

              <div className="ny-card ny-alerts">
                <span className="ny-side-ic"><Bell /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="ny-t">Phone alerts</p>
                  <p className="ny-d">A notification on the Colvy app when something lands in “Now” — once per item, a few at a time.</p>
                </div>
                <button type="button" role="switch" aria-checked={data.alerts.enabled} aria-label="Phone alerts" className={`ny-switch ${data.alerts.enabled ? 'on' : ''}`} onClick={toggleAlerts} disabled={saving}><span /></button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

/** Agents page: the count and the first few things that need a person. */
export function NeedsYouCard({ companyId }: { companyId: string }) {
  const { data } = useNeedsYou(companyId)
  if (!data) return null
  const top = data.items.slice(0, 3)
  return (
    <div className="ny ny-card ny-mini ag-fade">
      <style>{CSS}</style>
      <div className="ny-head">
        <p className="ny-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.items.length ? <>Needs you <span className={`ny-pill ${data.counts.now ? 'now' : 'soon'}`}>{data.items.length}</span></> : <><span className="ny-ok sm"><Check /></span> Nothing needs you right now</>}
        </p>
        <a className="ny-link" href="/admin/agents/needs-you">{data.items.length ? 'See all' : 'Open'} <Arrow /></a>
      </div>
      {top.length > 0 && (
        <ul className="ny-mini-list">
          {top.map(i => (
            <li key={i.key}><a href={i.kind === 'approval' ? '/admin/agents/needs-you' : i.href}>
              <span className={`ny-dot ${i.urgency}`} /><span className="ny-mini-t">{i.title}</span><span className="ny-mini-d">{i.detail}</span>
            </a></li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CSS = `
.ny .ny-card,.ny.ny-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px}
.ny-mini{margin-bottom:16px}
.ny-page{max-width:1240px;margin:0 auto;padding:20px 16px 120px}
@media (min-width:900px){.ny-page{padding:24px 28px 120px}}
.ny-crumbs{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:var(--slate)}
.ny-crumbs a{color:var(--slate);text-decoration:none;font-weight:600}.ny-crumbs a:hover{color:var(--ink)}
.ny-crumbs span:last-child{color:var(--ink);font-weight:700}
.ny-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media (min-width:1080px){.ny-cols{grid-template-columns:minmax(0,1fr) 320px;gap:20px}.ny-side{position:sticky;top:76px}}
.ny-side{display:flex;flex-direction:column;gap:12px}
@media (max-width:1079px){.ny-overview{display:none}}
.ny-side-ic{width:30px;height:30px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.ny-sum{list-style:none;margin:8px 0 0;padding:0}
.ny-sum a{display:flex;align-items:center;gap:10px;padding:10px 10px;margin:0 -10px;border-radius:12px;text-decoration:none;color:var(--ink);font-size:13.5px;transition:background .2s ease}
.ny-sum a[href]:hover{background:var(--canvas,#f6f7f9)}
.ny-sum a.none{opacity:.55}
.ny-sum-l{flex:1;font-weight:600}
.ny-sum-n{font-weight:800;font-size:15px}
.ny-goals{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.ny-goal-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.ny-goal-l{font-size:13px;font-weight:600;color:var(--ink)}
.ny-goal-p{font-size:14px;font-weight:800;color:var(--ink)}
.ny-goal-p.good{color:#067647}.ny-goal-p.ok{color:#b54708}.ny-goal-p.bad{color:#b42318}
.ny-goal-m{display:block;height:5px;margin-top:5px;border-radius:999px;background:color-mix(in srgb,var(--slate) 14%,#fff);overflow:hidden}
.ny-goal-m span{display:block;height:100%;border-radius:999px;background:var(--ink);opacity:.7;transition:width .6s ${EASE}}
.ny-goal-o{display:block;margin-top:4px;font-size:12px;font-weight:700;color:#b42318}
.ny-title{margin:0;font-size:clamp(22px,3.4vw,28px);font-weight:800;letter-spacing:-0.02em;color:var(--ink)}
.ny-sub{margin:4px 0 20px;font-size:14px;color:var(--slate);line-height:1.5;max-width:680px}
.ny-t{margin:0;font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.35}
.ny-d{margin:3px 0 0;font-size:13px;color:var(--slate);line-height:1.45}
.ny-empty{display:flex;gap:12px;align-items:center;animation:nyIn .45s ${EASE} both}
.ny-ok{width:36px;height:36px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:#ecfdf3;color:#067647;flex-shrink:0}
.ny-ok.sm{width:24px;height:24px;border-radius:8px}
.ny-group{margin-bottom:18px;scroll-margin-top:80px}
.ny-main>.ny-group:last-child{margin-bottom:0}
.ny-gh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--slate)}
.ny-ghint{font-weight:500;letter-spacing:0;text-transform:none;font-size:12px;color:var(--slate);opacity:.8}
.ny-count{padding:1px 7px;border-radius:999px;background:#fff;border:1px solid var(--border);font-size:11px;color:var(--ink);letter-spacing:0}
.ny-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}
.ny-dot.now{background:#f04438}.ny-dot.soon{background:#f79009}.ny-dot.fyi{background:#98a2b3}
.ny-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ny-item{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px;animation:nyIn .4s ${EASE} both;transition:box-shadow .25s ease}
.ny-item.now{border-left:3px solid #f04438}
.ny-item:hover{box-shadow:0 6px 18px rgba(15,23,42,.06)}
.ny-row{display:flex;align-items:flex-start;gap:12px}
.ny-txt{min-width:0;flex:1}
.ny-ic{width:34px;height:34px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--canvas,#f3f4f6);color:var(--slate)}
.ny-ic.reply,.ny-ic.handover{background:#fef3f2;color:#d92d20}.ny-ic.review{background:#fffaeb;color:#b54708}.ny-ic.approval{background:color-mix(in srgb,var(--coral) 12%,#fff);color:var(--coral)}
.ny-ic.order,.ny-ic.quote{background:#eff8ff;color:#175cd3}
.ny-open{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;height:34px;padding:0 12px;border-radius:11px;border:1px solid var(--border);color:var(--ink);font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;transition:border-color .2s ease,transform .15s ${EASE}}
.ny-open:hover{border-color:var(--coral)}.ny-open:active{transform:scale(.97)}
.ny-sg{margin-top:10px}
.ny-link{display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:13px;font-weight:700;color:var(--coral);text-decoration:none}
.ny-alerts{display:flex;align-items:flex-start;gap:12px}
.ny-alerts .ny-switch{margin-top:2px}
.ny-switch{position:relative;width:46px;height:28px;flex-shrink:0;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.ny-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.ny-switch.on{background:var(--coral)}.ny-switch.on span{transform:translateX(18px)}
.ny-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ny-pill{padding:1px 8px;border-radius:999px;font-size:12px;font-weight:800;color:#fff}
.ny-pill.now{background:#f04438}.ny-pill.soon{background:#f79009}
.ny-mini-list{list-style:none;margin:10px 0 0;padding:0}
.ny-mini-list li a{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent);text-decoration:none;min-width:0}
.ny-mini-t{font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0}
.ny-mini-d{font-size:12.5px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.ny-skel{display:flex;gap:12px;align-items:flex-start}
.ny-sk{display:block;border-radius:8px;background:linear-gradient(90deg,#eef0f3 25%,#f6f7f9 50%,#eef0f3 75%);background-size:200% 100%;animation:nySk 1.2s ease-in-out infinite}
.ny-sk.ic{width:34px;height:34px;border-radius:11px;flex-shrink:0}.ny-sk.t{height:14px;width:55%;margin:3px 0 8px}.ny-sk.d{height:12px;width:80%}
@keyframes nySk{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes nyIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ny-item,.ny-empty{animation:none}}
@media (max-width:560px){
  .ny-row{flex-wrap:wrap}
  .ny-txt{flex-basis:calc(100% - 46px)}
  .ny-open{margin-left:46px}
  .ny-mini-d{display:none}
}
`
