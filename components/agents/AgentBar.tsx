'use client'

import { useEffect, useRef, useState } from 'react'
import AgentFace from '@/components/agents/AgentFace'
import type { AgentFace as Face } from '@/lib/agent-faces'

// Above the reply box (Sellio-style): which agent is answering this
// conversation, and the controls to take it over — Take control (pause the AI
// here and assign it to you), or hand it back — with a ••• menu for Assign to
// agent, Add a note, Create ticket and Pause / Resume AI.

type Member = { user_id?: string | null; name: string }

export default function AgentBar({ face, name, aiOff, autoSend, members, assignedTo, onTakeControl, onHandBack, onPause, onAssign, onNote, onTicket }: {
  face: Face
  name: string
  aiOff: boolean
  autoSend: boolean
  members: Member[]
  assignedTo?: string | null
  onTakeControl: () => void
  onHandBack: () => void
  onPause: () => void
  onAssign: (m: Member | null) => void
  onNote: () => void
  onTicket: () => void
}) {
  const [menu, setMenu] = useState<'' | 'main' | 'assign'>('')
  const wrap = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menu) return
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu('') }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu('') }
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [menu])
  const pick = (fn: () => void) => () => { setMenu(''); fn() }

  return (
    <div className={`agb${aiOff ? ' off' : ''}`} style={{ ['--c' as any]: face.color }} role="status">
      <style>{AGB_CSS}</style>
      <span className="agb-face">
        <AgentFace face={face} size={30} />
        <span className="agb-dot" aria-hidden>{aiOff && <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>}</span>
      </span>
      <span className="agb-txt">
        {aiOff
          ? <><span className="agb-l1">Your team is answering · <b>{name}</b> is paused here</span><span className="agb-l2">It won’t send anything here. It can still suggest replies.</span></>
          : <><span className="agb-l1"><b>{name}</b> is answering this conversation</span><span className="agb-l2">{autoSend ? 'Replies on its own when it’s sure; the rest waits for you.' : 'Suggests replies for your team to send.'}</span></>}
      </span>
      <div className="agb-act" ref={wrap}>
        <button type="button" className={`agb-more${menu ? ' on' : ''}`} aria-label="More" aria-haspopup="menu" aria-expanded={!!menu} onClick={() => setMenu(m => (m ? '' : 'main'))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>
        </button>
        {menu === 'main' && (
          <div className="agb-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => setMenu('assign')}>
              {I.assign}<span>Assign to agent</span><svg className="agb-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button type="button" role="menuitem" onClick={pick(onNote)}>{I.note}<span>Add a note</span></button>
            <button type="button" role="menuitem" onClick={pick(onTicket)}>{I.ticket}<span>Create ticket</span></button>
            <span className="agb-sep" aria-hidden />
            {aiOff
              ? <button type="button" role="menuitem" onClick={pick(onHandBack)}>{I.play}<span>Resume AI</span></button>
              : <button type="button" role="menuitem" onClick={pick(onPause)}>{I.pause}<span>Pause AI</span></button>}
          </div>
        )}
        {menu === 'assign' && (
          <div className="agb-menu" role="menu" aria-label="Assign to agent">
            <button type="button" className="agb-back" onClick={() => setMenu('main')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
              Assign to agent
            </button>
            <div className="agb-list">
              {members.map(m => (
                <button key={m.user_id || m.name} type="button" role="menuitemradio" aria-checked={!!m.user_id && m.user_id === assignedTo} onClick={pick(() => onAssign(m))}>
                  <span className="agb-av" aria-hidden>{m.name.charAt(0).toUpperCase()}</span><span>{m.name}</span>
                  {!!m.user_id && m.user_id === assignedTo && <svg className="agb-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              ))}
              {assignedTo && <button type="button" role="menuitem" onClick={pick(() => onAssign(null))}><span className="agb-av none" aria-hidden>–</span><span>Unassign</span></button>}
            </div>
          </div>
        )}
        {aiOff
          ? <button type="button" className="agb-btn ghost" onClick={onHandBack}>{I.play}<span>Hand back</span></button>
          : <button type="button" className="agb-btn" onClick={onTakeControl}>{I.hand}<span>Take control</span></button>}
      </div>
    </div>
  )
}

const ico = (d: React.ReactNode) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const I = {
  assign: ico(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  note: ico(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>),
  ticket: ico(<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />),
  pause: ico(<><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>),
  play: ico(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  hand: ico(<><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" /></>),
}

const AGB_CSS = `
.agb{display:flex;align-items:center;gap:11px;margin:0 0 10px;padding:8px 8px 8px 11px;border-radius:18px;background:#f4f4f5;animation:agbIn .35s cubic-bezier(.22,1,.36,1) both}
.agb button::before{display:none!important}
.agb-face{position:relative;display:inline-flex;flex-shrink:0}
.agb-dot{position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2.5px #f4f4f5;display:inline-flex;align-items:center;justify-content:center}
.agb.off .agb-dot{background:#f59e0b}
.agb.off .agb-face>svg,.agb.off .agb-face>img{filter:saturate(.35);opacity:.75}
.agb-txt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.agb-l1{font-size:13.5px;color:#52525b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agb-l1 b{color:#111;font-weight:700}
.agb-l2{font-size:11.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agb-act{position:relative;display:flex;align-items:center;gap:6px;flex-shrink:0}
.agb-more{width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s}
.agb-more:hover,.agb-more.on{background:#fff}
.agb-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px;border-radius:999px;border:none;background:#0d0d0d;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;white-space:nowrap;transition:transform .15s,background .15s}
.agb-btn:hover{background:#27272a}
.agb-btn:active{transform:scale(.97)}
.agb-btn.ghost{background:#fff;color:#111;box-shadow:inset 0 0 0 1.5px #e4e4e7}
.agb-btn.ghost:hover{background:#fafafa}
.agb-btn svg{width:16px;height:16px}
.agb-more:focus-visible,.agb-btn:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent)}
.agb-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:60;width:236px;padding:6px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 44px -14px rgba(16,24,40,.3);animation:agbMenu .18s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom right}
.agb-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;border-radius:12px;background:none;font:inherit;font-size:13.5px;color:#18181b;text-align:left;cursor:pointer}
.agb-menu button:hover,.agb-menu button:focus-visible{background:#f4f4f5;outline:none}
.agb-menu button>svg{color:#71717a;flex-shrink:0}
.agb-menu button>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agb-chev{margin-left:auto;color:#a1a1aa!important}
.agb-sep{display:block;height:1px;margin:5px 6px;background:#ececef}
.agb-back{font-weight:650!important;color:#52525b!important}
.agb-list{max-height:240px;overflow-y:auto}
.agb-av{width:22px;height:22px;flex:0 0 22px!important;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#6a9f3e;color:#fff;font-size:11px;font-weight:700}
.agb-av.none{background:#e4e4e7;color:#71717a}
@container (max-width:560px){.agb-l2{display:none}.agb-btn span{display:none}.agb-btn{width:36px;padding:0;justify-content:center}}
@keyframes agbIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes agbMenu{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.agb,.agb-menu{animation:none}}
`
