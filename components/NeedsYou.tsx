'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// "Needs you": everything waiting on a person, most urgent first — drafts to
// approve, goals being missed now, hand-overs nobody picked up, and agent runs
// that went wrong. useNeedsYou loads it; NeedsYouCard sits at the top of the
// Agents page; the page itself is components/NeedsYouPage.tsx.

export type Urgency = 'now' | 'soon' | 'fyi'
export type Item = {
  key: string; kind: 'approval' | 'reply' | 'review' | 'order' | 'quote' | 'handover' | 'failed'; urgency: Urgency; title: string; detail: string; at: string; href: string
  conversationId?: string | null; runId?: string | null; approval?: any
  // Added for the page (lib/agent/needs-you-enrich.ts)
  customer?: { name: string | null; phone: string | null; email: string | null; contactId?: string | null } | null
  channel?: string | null; preview?: string | null; previewAt?: string | null; value?: number | null
}
export type GoalLite = { key: string; label: string; rate: number | null; open: number; met: number; missed: number }
export type Payload = { items: Item[]; counts: Record<Urgency, number>; alerts: { enabled: boolean }; goals?: GoalLite[] }

export const EASE = 'cubic-bezier(.22,1,.36,1)'
export const ico = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>{d}</svg>
export const ICON: Record<Item['kind'], React.ReactNode> = {
  approval: ico(<><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /></>),
  reply: ico(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  review: ico(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  order: ico(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></>),
  quote: ico(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>),
  handover: ico(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>),
  failed: ico(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
}
export const Check = () => ico(<polyline points="20 6 9 17 4 12" />, 18)
export const Bell = () => ico(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>)
export const Target = () => ico(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>)
export const Arrow = () => ico(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 14)
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

/** Agents page: the count and the first few things that need a person. */
export function NeedsYouCard({ companyId }: { companyId: string }) {
  const { data } = useNeedsYou(companyId)
  if (!data) return null
  // The same thing twice (two threads from one address) is one row with a count.
  const rows: { item: Item; n: number }[] = []
  for (const i of data.items) {
    const r = rows.find(x => x.item.kind === i.kind && x.item.title === i.title)
    if (r) r.n++; else rows.push({ item: i, n: 1 })
  }
  const top = rows.slice(0, 4)
  return (
    <div className="ny ny-card ny-mini ag-fade">
      <style>{NY_CSS}</style>
      <div className="ny-head">
        <p className="ny-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.items.length ? <>Needs you <span className={`ny-pill ${data.counts.now ? 'now' : 'soon'}`}>{data.items.length}</span></> : <><span className="ny-ok sm"><Check /></span> Nothing needs you right now</>}
        </p>
        <a className="ny-link" href="/admin/agents/needs-you">{data.items.length ? 'See all' : 'Open'} <Arrow /></a>
      </div>
      {top.length > 0 && (
        <ul className="ny-mini-grid">
          {top.map(({ item: i, n }) => {
            // "Sam is waiting for a reply" reads better as Sam, then what's up.
            const waiting = i.title.match(/^(.+?) is waiting for a reply$/)
            const who = i.customer?.name || (waiting ? waiting[1] : null)
            const sub = waiting ? `Waiting for a reply${i.channel ? ` · ${CHANNEL_NAME[i.channel] || i.channel}` : ''}` : i.detail
            const hue = Array.from(String(who || i.kind)).reduce((h, x) => (h * 31 + x.charCodeAt(0)) % 360, 7)
            return (
              <li key={i.key}>
                <a href={i.kind === 'approval' ? '/admin/agents/needs-you' : i.href} className={`ny-mini-row ${i.urgency}`} title={i.detail}>
                  {who
                    ? <span className="ny-mini-av" style={{ ['--h' as any]: hue }} aria-hidden>{who.replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '#'}</span>
                    : <span className={`ny-mini-ic ny-ic ${i.kind}`} aria-hidden>{ICON[i.kind]}</span>}
                  <span className="ny-mini-txt">
                    <b>{who || i.title}</b>
                    <small>{sub}</small>
                  </span>
                  {n > 1 && <span className="ny-mini-n" title={`${n} of these`}>×{n}</span>}
                  <span className={`ny-mini-age ${i.urgency}`}>{shortAgo(i.at)}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const CHANNEL_NAME: Record<string, string> = { sms: 'SMS', email: 'Email', chat: 'Website chat', widget: 'Website chat', instagram: 'Instagram', facebook: 'Messenger', messenger: 'Messenger', whatsapp: 'WhatsApp', phone: 'Phone' }

// "12d", "3h", "42m": how long it's been waiting.
function shortAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (!isFinite(s)) return ''
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export const NY_CSS = `
.ny .ny-card,.ny.ny-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px}
.ny-mini{margin-bottom:16px}
.ny-mini-grid{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:8px}
.ny-mini-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:16px;background:#f7f7f8;color:inherit;text-decoration:none;min-width:0;transition:background .2s,box-shadow .2s,transform .2s ${EASE}}
.ny-mini-row:hover{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 8px 20px -12px rgba(16,24,40,.25);transform:translateY(-1px)}
.ny-mini-row:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 30%,transparent)}
.ny-mini-av{width:34px;height:34px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(160deg,hsl(var(--h) 90% 72%),hsl(var(--h) 72% 55%));color:#fff;font-size:14px;font-weight:700}
.ny-mini-ic{width:34px!important;height:34px!important;border-radius:50%!important}
.ny-mini-txt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.ny-mini-txt b{font-size:13.5px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ny-mini-txt small{font-size:12px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ny-mini-n{flex-shrink:0;padding:2px 7px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px #ececef;font-size:11.5px;font-weight:650;color:#52525b}
.ny-mini-age{flex-shrink:0;min-width:36px;text-align:center;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;background:#f0f0f2;color:#52525b}
.ny-mini-age.now{background:#fef3f2;color:#d92d20}
.ny-mini-age.soon{background:#fffaeb;color:#b54708}
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
}
`
