'use client'

import { useEffect, useRef } from 'react'

// The reply box in Ticket mode (Sellio-style): picked from "Create ticket", it
// takes the place of the reply box with a title, "What needs tracking?", who
// it's for and how urgent it is, and a tick to create it. The Ticket tab only
// exists while a ticket is being written; the drawer it replaces covered the
// conversation you were turning into a ticket.

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
const PRIORITIES: [TicketPriority, string][] = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']]

export default function TicketComposer({ head, customer, subject, onSubject, description, onDescription, priority, onPriority, saving, onCreate, onDiscard, bodyHeight }: {
  head: React.ReactNode
  customer: string
  subject: string
  onSubject: (v: string) => void
  description: string
  onDescription: (v: string) => void
  priority: string
  onPriority: (v: TicketPriority) => void
  saving: boolean
  onCreate: () => void
  onDiscard: () => void
  bodyHeight?: number
}) {
  const titleRef = useRef<HTMLInputElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  // Straight into the box: the title when it's empty, otherwise the details.
  useEffect(() => {
    const t = setTimeout(() => (subject.trim() ? bodyRef.current : titleRef.current)?.focus(), 40)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const ready = !!subject.trim() && !saving
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (ready) onCreate() }
    else if (e.key === 'Escape') { e.preventDefault(); onDiscard() }
  }

  return (
    <div className="cmp-card ticket tkc">
      <style>{TKC_CSS}</style>
      {head}
      <div className="tkc-body" onKeyDown={keys}>
        <input ref={titleRef} className="tkc-title" value={subject} onChange={e => onSubject(e.target.value)} placeholder="Ticket title"
          aria-label="Ticket title" maxLength={200}
          onKeyDown={e => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); bodyRef.current?.focus() } }} />
        <textarea ref={bodyRef} className="tkc-desc" value={description} onChange={e => onDescription(e.target.value)} placeholder="What needs tracking?"
          aria-label="What needs tracking" style={{ height: bodyHeight ? Math.max(56, Math.min(bodyHeight - 34, 220)) : 64 }} />
      </div>
      <div className="tkc-foot">
        <span className="tkc-chip" title="The ticket is linked to this customer and conversation">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          <span>{customer || 'Customer'}</span>
        </span>
        <label className={`tkc-chip tkc-pri p-${priority}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5" /></svg>
          <select value={priority} onChange={e => onPriority(e.target.value as TicketPriority)} aria-label="Priority">
            {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <span className="tkc-grow" />
        <button type="button" className="tkc-discard" onClick={onDiscard}>Discard</button>
        <button type="button" className={`tkc-go${ready || saving ? ' on' : ''}`} onClick={onCreate} disabled={!ready}
          aria-label={saving ? 'Creating ticket' : 'Create ticket'} title="Create ticket (Ctrl + Enter)">
          {saving
            ? <span className="tkc-spin" aria-hidden />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>}
        </button>
      </div>
    </div>
  )
}

const TKC_CSS = `
.cmp-card.ticket{background:#eaf2ff;border-color:#bcd4fb;animation:tkcIn .28s cubic-bezier(.22,1,.36,1) both}
.cmp-card.ticket:focus-within{background:#eef4ff;border-color:#93b8f5;box-shadow:0 0 0 4px rgba(59,130,246,.12)}
.cmp-card.ticket .cmp-mode{background:rgba(29,78,216,.08)}
.cmp-card.ticket .cmp-mode button[aria-selected="true"]{color:#1d4ed8}
.tkc button::before{display:none!important}
.tkc-body{display:flex;flex-direction:column;padding:2px 14px 0}
.tkc-title{border:none;outline:none;background:transparent;font:inherit;font-size:15px;font-weight:650;color:#0f172a;padding:6px 0 2px;min-width:0}
.tkc-title:focus,.tkc-title:focus-visible,.tkc-desc:focus,.tkc-desc:focus-visible,.tkc-pri select:focus{outline:none!important;box-shadow:none!important;border:none!important}
.tkc-title::placeholder{color:#7b8db0;font-weight:600}
.tkc-desc{border:none;outline:none;background:transparent;font:inherit;font-size:14.5px;line-height:1.5;color:#1e293b;padding:4px 0;resize:none;min-height:48px}
.tkc-desc::placeholder{color:#6b7fa6}
.tkc-foot{display:flex;align-items:center;gap:6px;padding:6px 10px 10px 12px;flex-wrap:wrap}
.tkc-chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:999px;color:#3b5a99;font-size:13px;font-weight:600;max-width:200px}
.tkc-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tkc-chip svg{flex-shrink:0;color:#3b82f6}
.tkc-pri{cursor:pointer;background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 1px rgba(59,130,246,.18)}
.tkc-pri:hover{background:#fff}
.tkc-pri select{appearance:none;-webkit-appearance:none;border:none;background:transparent;font:inherit;color:inherit;cursor:pointer;padding:0;outline:none}
.tkc-pri.p-high svg{color:#f59e0b}.tkc-pri.p-high{color:#b45309}
.tkc-pri.p-urgent svg{color:#ef4444}.tkc-pri.p-urgent{color:#b91c1c}
.tkc-pri.p-low svg{color:#94a3b8}
.tkc-grow{flex:1}
.tkc-discard{height:32px;padding:0 12px;border:none;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:600;color:#5b6b8c;cursor:pointer}
.tkc-discard:hover{background:rgba(255,255,255,.6);color:#1e293b}
.tkc-go{width:40px;height:40px;border-radius:50%;border:none;display:inline-flex;align-items:center;justify-content:center;background:rgba(29,78,216,.1);color:#7b8db0;cursor:not-allowed;transition:background .18s,color .18s,transform .12s}
.tkc-go.on{background:#1d4ed8;color:#fff;cursor:pointer;box-shadow:0 6px 16px -6px rgba(29,78,216,.6)}
.tkc-go.on:hover{background:#1e40af}
.tkc-go.on:active{transform:scale(.94)}
.tkc-go:focus-visible,.tkc-discard:focus-visible,.tkc-pri:focus-within{outline:2px solid #3b82f6;outline-offset:2px}
.tkc-spin{width:16px;height:16px;border-radius:50%;border:2.2px solid rgba(255,255,255,.4);border-top-color:#fff;animation:tkcSpin .7s linear infinite}
@keyframes tkcIn{from{opacity:.4;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes tkcSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.cmp-card.ticket{animation:none}}
`
