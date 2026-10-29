'use client'

import { useEffect, useState } from 'react'
import AgentFace from '@/components/agents/AgentFace'
import type { AgentFace as Face } from '@/lib/agent-faces'

// One agent on the AI agents page, shown rather than described: its face and
// what it's for, then what it watches for → what it does about it, and the
// rules it keeps. While the agent is working, it "scans" down the list in its
// own colour.

export type ShowIcon = 'box' | 'truck' | 'alert' | 'stock' | 'clock' | 'chat' | 'calendar' | 'move' | 'link' | 'star' | 'comment' | 'frown' | 'cart' | 'quote' | 'task' | 'send' | 'pen' | 'shield' | 'skip' | 'hand' | 'search' | 'tag'

export type ShowItem = { icon: ShowIcon; t: string; s?: string }

export default function AgentShowcase({ id, name, tagline, face, state, onEditFace, editing, watchTitle, watches, doesTitle = 'Then it', does, rules, toggle, children }: {
  id: string
  name: string
  tagline: string
  face: Face
  /** '' while loading. */
  state: 'on' | 'off' | 'paused' | ''
  onEditFace?: (el: HTMLElement) => void
  editing?: boolean
  watchTitle: string
  watches: ShowItem[]
  doesTitle?: string
  does: ShowItem[]
  rules: ShowItem[]
  toggle: React.ReactNode
  children?: React.ReactNode
}) {
  // The scan: one "watches" row at a time, while the agent is on.
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (state !== 'on' || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const iv = setInterval(() => setActive(a => (a + 1) % watches.length), 1900)
    return () => clearInterval(iv)
  }, [state, watches.length])
  const scanning = state === 'on'

  return (
    <div id={id} className={`ag-card ag-fade agsc ${state}`} style={{ marginBottom: 16, ['--c' as any]: face.color }}>
      <style>{AGX_CSS}</style>
      <div className="agsc-head">
        <span className="agsc-face">
          <AgentFace face={face} size={52} />
          {onEditFace && (
            <button type="button" className={`agsc-edit${editing ? ' on' : ''}`} aria-label={`Change how the ${name} looks`} aria-expanded={!!editing}
              onClick={e => onEditFace(e.currentTarget)}>
              <GearIcon />
            </button>
          )}
        </span>
        <div className="agsc-title">
          <h3>{name}<span className="agsc-state"><i />{state === 'on' ? 'Working' : state === 'paused' ? 'Paused' : state === 'off' ? 'Off' : '…'}</span></h3>
          <p>{tagline}</p>
        </div>
        <div className="agsc-switch">{toggle}</div>
      </div>

      <div className="agsc-flow">
        <div className="agsc-col agsc-watch">
          <p className="agsc-col-t">{watchTitle}</p>
          {watches.map((w, i) => (
            <div key={w.t} className={`agsc-row${scanning && i === active ? ' hot' : ''}`}>
              <span className="agsc-ic">{ICON[w.icon]}</span>
              <span className="agsc-txt"><b>{w.t}</b>{w.s && <span>{w.s}</span>}</span>
            </div>
          ))}
        </div>
        <div className={`agsc-arrow${scanning ? ' go' : ''}`} aria-hidden="true" key={scanning ? active : 'still'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <div className="agsc-col agsc-does">
          <p className="agsc-col-t">{doesTitle}</p>
          {does.map(d => (
            <div key={d.t} className="agsc-row">
              <span className="agsc-ic solid">{ICON[d.icon]}</span>
              <span className="agsc-txt"><b>{d.t}</b>{d.s && <span>{d.s}</span>}</span>
            </div>
          ))}
        </div>
      </div>

      {rules.length > 0 && (
        <ul className="agsc-rules" aria-label="Rules it keeps">
          {rules.map(r => <li key={r.t}>{ICON[r.icon]}{r.t}</li>)}
        </ul>
      )}
      {children}
    </div>
  )
}

export const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
)

const P = (d: React.ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
const ICON: Record<ShowIcon, React.ReactNode> = {
  box: P(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
  truck: P(<><path d="M1 4h14v12H1zM15 9h4l3 3v4h-7z" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>),
  alert: P(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  stock: P(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m9.5 10.5 5 5M14.5 10.5l-5 5" /></>),
  clock: P(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  chat: P(<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z" />),
  calendar: P(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  move: P(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 10h18M9 15h6M13 13l2 2-2 2" /></>),
  link: P(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>),
  star: P(<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />),
  comment: P(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>),
  frown: P(<><circle cx="12" cy="12" r="9" /><path d="M16 16.5s-1.5-2-4-2-4 2-4 2M9 9.5h.01M15 9.5h.01" /></>),
  cart: P(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" /></>),
  quote: P(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  task: P(<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></>),
  send: P(<path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />),
  pen: P(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />),
  shield: P(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  skip: P(<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>),
  hand: P(<><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" /></>),
  search: P(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  tag: P(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><path d="M7 7h.01" /></>),
}

const AGX_CSS = `
.agsc{position:relative;overflow:hidden}
.agsc::before{content:"";position:absolute;right:-80px;top:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--c) 16%,transparent),transparent 68%);pointer-events:none;opacity:.55;transition:opacity .5s}
.agsc.on::before{opacity:1}
.agsc-head{position:relative;display:flex;align-items:flex-start;gap:14px}
.agsc-face{position:relative;display:inline-flex;flex-shrink:0}
.agsc.on .agsc-face>svg,.agsc.on .agsc-face>img{animation:agscBob 3.2s ease-in-out infinite}
.agsc-edit{position:absolute;right:-7px;bottom:-5px;width:26px;height:26px;border-radius:50%;border:none;background:#fff;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 2px 6px rgba(16,24,40,.14);transition:transform .2s cubic-bezier(.34,1.56,.64,1),color .15s}
.agsc-edit::before{display:none!important}
.agsc-edit:hover,.agsc-edit.on{transform:rotate(45deg) scale(1.08);color:var(--c)}
.agsc-edit:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent)}
.agsc-title{flex:1;min-width:0}
.agsc-title h3{margin:2px 0 0;display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;font-size:18px;font-weight:750;letter-spacing:-.015em;color:var(--ink,#111)}
.agsc-title p{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--slate,#52525b);max-width:620px}
.agsc-state{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:600;color:#71717a;letter-spacing:0}
.agsc-state i{position:relative;width:7px;height:7px;border-radius:50%;background:#d4d4d8}
.agsc.on .agsc-state{background:#ecfdf3;color:#15803d}
.agsc.on .agsc-state i{background:#22c55e}
.agsc.on .agsc-state i::after{content:"";position:absolute;inset:0;border-radius:50%;background:#22c55e;animation:agscPing 1.8s cubic-bezier(0,0,.2,1) infinite}
.agsc.paused .agsc-state{background:#fffbeb;color:#b45309}
.agsc.paused .agsc-state i{background:#f59e0b}
.agsc-switch{flex-shrink:0;padding-top:4px}
.agsc-flow{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);align-items:stretch;gap:8px;margin-top:16px}
.agsc-col{border-radius:18px;padding:12px;background:color-mix(in srgb,var(--c) 5%,#f7f7f8)}
.agsc-does{background:#f7f7f8}
.agsc-col-t{margin:2px 4px 6px;font-size:12.5px;font-weight:650;color:#71717a}
.agsc-row{display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:13px;transition:background .35s,box-shadow .35s}
.agsc-row.hot{background:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 22%,transparent),0 6px 16px -8px color-mix(in srgb,var(--c) 45%,transparent)}
.agsc-ic{flex-shrink:0;width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--c);box-shadow:0 0 0 1px rgba(0,0,0,.05);transition:background .35s,color .35s}
.agsc-row.hot .agsc-ic{background:var(--c);color:#fff;box-shadow:none}
.agsc-ic.solid{background:color-mix(in srgb,var(--c) 14%,#fff);box-shadow:none}
.agsc-txt{display:flex;flex-direction:column;min-width:0;padding-top:1px}
.agsc-txt b{font-size:13.5px;font-weight:650;color:#18181b;line-height:1.35}
.agsc-txt span{font-size:12.5px;line-height:1.4;color:#71717a;margin-top:1px}
.agsc-arrow{display:flex;align-items:center;justify-content:center;color:var(--c)}
.agsc-arrow.go svg{animation:agscNudge 1.9s cubic-bezier(.22,1,.36,1)}
.agsc-rules{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.agsc-rules li{display:inline-flex;align-items:center;gap:6px;padding:6px 11px 6px 9px;border-radius:999px;background:#f4f4f5;font-size:12.5px;font-weight:500;color:#3f3f46;line-height:1.3}
.agsc-rules li svg{color:var(--c);flex-shrink:0;width:14px;height:14px}
.agsc.off .agsc-row .agsc-ic{color:color-mix(in srgb,var(--c) 75%,#71717a)}
@media (max-width:720px){
  .agsc-flow{grid-template-columns:minmax(0,1fr);gap:6px}
  .agsc-arrow{transform:rotate(90deg);height:24px}
  .agsc-head{flex-wrap:wrap}
  .agsc-title{flex-basis:calc(100% - 140px)}
}
@keyframes agscBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes agscPing{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(2.4);opacity:0}}
@keyframes agscNudge{0%{transform:translateX(-4px);opacity:.4}35%{transform:translateX(3px);opacity:1}100%{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.agsc.on .agsc-face>svg,.agsc.on .agsc-face>img,.agsc-arrow.go svg,.agsc.on .agsc-state i::after{animation:none}.agsc-row,.agsc-ic{transition:none}}
`
