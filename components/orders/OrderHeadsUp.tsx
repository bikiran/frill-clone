'use client'

import { useEffect, useMemo, useState } from 'react'

// "Heads-up" at the top of an order (under Assign outlet): the customer's
// checkout note, the team's latest notes and the open tasks, so nobody packs or
// ships an order without seeing them. They're also in full further down
// (Tasks, Customer notes, Order timeline), which people often never scroll to,
// or have folded away.
//
// Anything someone ELSE added since this person last opened the order is
// marked "New" and the card pulses once to catch the eye. "Last opened" is
// remembered per order on this device (a convenience; nothing depends on it).

type Note = { id: string; body?: string | null; author_id?: string | null; author_name?: string | null; created_at?: string | null }
type Task = { id: string; text?: string | null; title?: string | null; done?: boolean | null; status?: string | null; created_by?: string | null; created_by_id?: string | null; created_at?: string | null; assigned_to?: string | null }

const SEEN_KEY = (orderId: string) => `colvy-order-seen:${orderId}`
// Never opened on this device: what others added in the last three days counts as new.
const FIRST_LOOK_MS = 3 * 24 * 60 * 60 * 1000
const MAX_ROWS = 4

const taskDone = (t: Task) => !!t.done || t.status === 'done'
const ts = (d?: string | null) => { const n = d ? new Date(d).getTime() : NaN; return Number.isFinite(n) ? n : 0 }

function ago(d?: string | null): string {
  const t = ts(d); if (!t) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function OrderHeadsUp({ orderId, meId, notes, tasks, checkoutNote, onToggleTask, onSeeAll }: {
  orderId: string
  meId?: string | null
  notes: Note[]
  tasks: Task[]
  checkoutNote?: string | null
  onToggleTask: (t: Task) => void
  onSeeAll: (where: 'tasks' | 'notes' | 'customer') => void
}) {
  // When this person last opened this order (read once, then moved to now).
  const [seenBefore] = useState<number | null>(() => {
    try { const v = localStorage.getItem(SEEN_KEY(orderId)); return v ? Number(v) || null : null } catch { return null }
  })
  useEffect(() => {
    // A moment after opening, so a quick open-and-close still counts as seen.
    const id = setTimeout(() => { try { localStorage.setItem(SEEN_KEY(orderId), String(Date.now())) } catch {} }, 1500)
    return () => clearTimeout(id)
  }, [orderId])

  const since = seenBefore ?? Date.now() - FIRST_LOOK_MS
  const isNew = (createdAt?: string | null, by?: string | null) => !!by && by !== meId && ts(createdAt) > since

  // Ticked tasks linger for a moment (crossed out) before leaving the card.
  const [leaving, setLeaving] = useState<Record<string, boolean>>({})
  const openTasks = useMemo(() => tasks.filter(t => !taskDone(t) || leaving[t.id]), [tasks, leaving])
  const note = (checkoutNote || '').trim()

  const rows = useMemo(() => {
    const staff = notes.map(n => ({ kind: 'note' as const, key: 'n' + n.id, at: ts(n.created_at), fresh: isNew(n.created_at, n.author_id), n }))
    const todo = openTasks.map(t => ({ kind: 'task' as const, key: 't' + t.id, at: ts(t.created_at), fresh: isNew(t.created_at, t.created_by_id), t }))
    // New first, then newest; the customer's note always leads.
    const list = [...staff, ...todo].sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.at - a.at)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, openTasks, since, meId])

  const total = rows.length + (note ? 1 : 0)
  if (!total) return null
  const freshCount = rows.filter(r => r.fresh).length
  const shown = rows.slice(0, note ? MAX_ROWS - 1 : MAX_ROWS)
  const hidden = rows.length - shown.length
  const nNotes = notes.length, nTasks = openTasks.filter(t => !taskDone(t)).length

  const tick = (t: Task) => {
    const finishing = !taskDone(t)
    if (finishing) {
      setLeaving(l => ({ ...l, [t.id]: true }))
      setTimeout(() => setLeaving(l => { const c = { ...l }; delete c[t.id]; return c }), 900)
    }
    onToggleTask(t)
  }

  return (
    <section className={`ohu${freshCount ? ' fresh' : ''}`} aria-label="Heads-up for this order">
      <style href="colvy-order-heads-up" precedence="default">{OHU_CSS}</style>
      <div className="ohu-h">
        <span className="ohu-ic" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        <b>Heads-up</b>
        <span className="ohu-sum">
          {[note ? 'customer note' : '', nNotes ? `${nNotes} note${nNotes === 1 ? '' : 's'}` : '', nTasks ? `${nTasks} open task${nTasks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
        </span>
        {freshCount > 0 && <span className="ohu-new">{freshCount} new</span>}
      </div>

      <ul className="ohu-list">
        {note && (
          <li className="ohu-row cust" style={{ animationDelay: '60ms' }}>
            <span className="ohu-dot" aria-hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </span>
            <button type="button" className="ohu-body" onClick={() => onSeeAll('customer')}>
              <span className="ohu-text">{note}</span>
              <span className="ohu-meta">Customer’s note at checkout</span>
            </button>
          </li>
        )}
        {shown.map((r, i) => r.kind === 'note' ? (
          <li key={r.key} className={`ohu-row note${r.fresh ? ' is-new' : ''}`} style={{ animationDelay: `${(i + (note ? 2 : 1)) * 60}ms` }}>
            <span className="ohu-dot" aria-hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" /><path d="M15 3v6h6" /></svg>
            </span>
            <button type="button" className="ohu-body" onClick={() => onSeeAll('notes')}>
              <span className="ohu-text">{r.n.body}</span>
              <span className="ohu-meta">{r.n.author_name || 'Someone'}{r.n.created_at ? ` · ${ago(r.n.created_at)}` : ''}{r.fresh && <em>New</em>}</span>
            </button>
          </li>
        ) : (
          <li key={r.key} className={`ohu-row task${r.fresh ? ' is-new' : ''}${taskDone(r.t) ? ' done' : ''}`} style={{ animationDelay: `${(i + (note ? 2 : 1)) * 60}ms` }}>
            <button type="button" role="checkbox" aria-checked={taskDone(r.t)} className="ohu-check" onClick={() => tick(r.t)}
              aria-label={taskDone(r.t) ? `Mark “${r.t.title || r.t.text}” not done` : `Mark “${r.t.title || r.t.text}” done`}>
              {taskDone(r.t) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
            <button type="button" className="ohu-body" onClick={() => onSeeAll('tasks')}>
              <span className="ohu-text">{r.t.title || r.t.text}</span>
              <span className="ohu-meta">Task{r.t.created_by ? ` · ${r.t.created_by}` : ''}{r.t.created_at ? ` · ${ago(r.t.created_at)}` : ''}{r.fresh && <em>New</em>}</span>
            </button>
          </li>
        ))}
      </ul>

      {(hidden > 0 || nNotes > 0 || nTasks > 0) && (
        <div className="ohu-foot">
          {hidden > 0 && <span>+{hidden} more</span>}
          <button type="button" onClick={() => onSeeAll(nTasks && !nNotes ? 'tasks' : 'notes')}>
            See all notes &amp; tasks
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
          </button>
        </div>
      )}
    </section>
  )
}

const OHU_CSS = `
.ohu{--ohu-bg:#fffbeb;--ohu-line:#fde68a;--ohu-ink:#78350f;--ohu-soft:#a16207;position:relative;margin:0 12px 10px;padding:14px 14px 10px;border-radius:18px;background:var(--ohu-bg);box-shadow:inset 0 0 0 1.5px var(--ohu-line);animation:ohuIn .5s cubic-bezier(.22,1,.36,1) both}
[data-theme="dark"] .ohu{--ohu-bg:rgba(245,158,11,.1);--ohu-line:rgba(245,158,11,.32);--ohu-ink:#fcd34d;--ohu-soft:#fbbf24}
.ohu.fresh{animation:ohuIn .5s cubic-bezier(.22,1,.36,1) both,ohuPulse 1.6s .55s ease-out 2}
.ohu-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.ohu-h b{font-size:14.5px;font-weight:750;color:var(--ink)}
.ohu-ic{width:28px;height:28px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:#f59e0b;color:#fff;flex-shrink:0}
.ohu.fresh .ohu-ic svg{transform-origin:50% 10%;animation:ohuRing 1s .6s ease-in-out 2}
.ohu-sum{font-size:12.5px;color:var(--ohu-soft);font-weight:600}
.ohu-new{margin-left:auto;height:22px;padding:0 9px;border-radius:999px;background:#ef4444;color:#fff;font-size:11.5px;font-weight:750;display:inline-flex;align-items:center;letter-spacing:.01em}
.ohu-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ohu-row{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border-radius:16px;background:var(--card,#fff);box-shadow:0 1px 2px rgba(120,53,15,.06);animation:ohuRow .42s cubic-bezier(.22,1,.36,1) both}
.ohu-row.is-new{box-shadow:0 1px 2px rgba(120,53,15,.06),inset 3px 0 0 #ef4444}
.ohu-dot{width:24px;height:24px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#fef3c7;color:#b45309;margin-top:1px}
.ohu-row.cust .ohu-dot{background:#dbeafe;color:#1d4ed8}
[data-theme="dark"] .ohu-dot{background:rgba(245,158,11,.18);color:#fbbf24}
[data-theme="dark"] .ohu-row.cust .ohu-dot{background:rgba(59,130,246,.2);color:#93c5fd}
.ohu-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding:0;border:none;background:none;font:inherit;text-align:left;color:inherit;cursor:pointer}
.ohu-text{font-size:13.5px;line-height:1.45;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ohu-meta{font-size:11.5px;color:#8e8e93;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ohu-meta em{font-style:normal;height:18px;padding:0 7px;border-radius:999px;background:#fee2e2;color:#dc2626;font-size:10.5px;font-weight:750;display:inline-flex;align-items:center}
[data-theme="dark"] .ohu-meta em{background:rgba(239,68,68,.18);color:#fca5a5}
.ohu-check{width:22px;height:22px;flex-shrink:0;margin:2px 1px 0;border-radius:7px;border:2px solid #d4d4d8;background:var(--card,#fff);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s,border-color .15s}
.ohu-check:hover{border-color:#10b981}
.ohu-row.done .ohu-check{background:#10b981;border-color:#10b981}
.ohu-row.done{opacity:.6;transition:opacity .5s}
.ohu-row.done .ohu-text{text-decoration:line-through;color:#a1a1aa}
.ohu-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px}
.ohu-foot span{font-size:12px;color:var(--ohu-soft);font-weight:600;margin-right:auto;padding-left:4px}
.ohu-foot button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:none;border-radius:999px;background:transparent;color:var(--ohu-ink);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.ohu-foot button:hover{background:rgba(245,158,11,.14)}
.ohu button:focus-visible{outline:2px solid #f59e0b;outline-offset:2px;border-radius:8px}
@keyframes ohuIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes ohuRow{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes ohuPulse{0%{box-shadow:inset 0 0 0 1.5px var(--ohu-line),0 0 0 0 rgba(245,158,11,.45)}70%{box-shadow:inset 0 0 0 1.5px var(--ohu-line),0 0 0 12px rgba(245,158,11,0)}100%{box-shadow:inset 0 0 0 1.5px var(--ohu-line),0 0 0 0 rgba(245,158,11,0)}}
@keyframes ohuRing{0%,100%{transform:rotate(0)}20%{transform:rotate(16deg)}40%{transform:rotate(-14deg)}60%{transform:rotate(9deg)}80%{transform:rotate(-5deg)}}
@media (prefers-reduced-motion:reduce){.ohu,.ohu.fresh,.ohu-row,.ohu.fresh .ohu-ic svg{animation:none!important}}
/* "See all" lands here: a brief glow on the section. */
.ohu-target{animation:ohuTarget 1.6s ease-out 1}
@keyframes ohuTarget{0%{box-shadow:0 0 0 0 rgba(245,158,11,.55)}60%{box-shadow:0 0 0 8px rgba(245,158,11,.12)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}
`
