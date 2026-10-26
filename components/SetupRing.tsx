'use client'

// "Getting started" in the sidebar: a small progress ring with the number of
// setup steps done, and a checklist that opens beside it (the dashboard's
// setup steps: lib/setup-status, components/setup-steps). Each step links to
// the page that does it; finished ones are ticked and struck through. Only for
// the people who run the workspace, in its first couple of months, and it
// follows the dashboard checklist: gone once every step is done or skipped
// there, or when someone pressed Hide on it.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { setupSteps, stepAction } from '@/components/setup-steps'
import { readPrefs } from '@/components/SetupChecklist'
import type { SetupStatus, SetupStepKey } from '@/lib/setup-status'

const RING_MAX_AGE_DAYS = 60
const cacheKey = (id: string) => `colvy:setup-ring:${id}`

function Ring({ done, total, size = 30 }: { done: number; total: number; size?: number }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const pct = total ? done / total : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e5ea" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#34c759" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="11" fontWeight="700" fill="#3a3a3c">{done}</text>
    </svg>
  )
}

export default function SetupRing({ companyId, collapsed }: { companyId: string | null | undefined; collapsed?: boolean }) {
  const [status, setStatus] = useState<(SetupStatus & { full?: boolean }) | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!companyId) return
    let live = true
    // Last numbers this tab had first (read after mount, so the server render matches).
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey(companyId)) || 'null')
      setStatus(cached && Array.isArray(cached.steps) ? cached : null)
    } catch { setStatus(null) }
    authFetch(`/api/setup/status?companyId=${encodeURIComponent(companyId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!live || !d || !Array.isArray(d.steps)) return
        setStatus(d)
        try { sessionStorage.setItem(cacheKey(companyId), JSON.stringify(d)) } catch {}
      })
      .catch(() => {})
    return () => { live = false }
  }, [companyId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!companyId || !status || status.complete || !status.total || status.full === false) return null
  if (status.ageDays != null && status.ageDays > RING_MAX_AGE_DAYS) return null
  const prefs = readPrefs(companyId)
  const steps = setupSteps(status)
  const byKey = new Map(status.steps.map(s => [s.key, s]))
  // Skipped on the dashboard counts as finished, unless it needs attention.
  const finished = (key: SetupStepKey) => byKey.get(key)?.state === 'done' || (prefs.skipped.includes(key) && !byKey.get(key)?.attention)
  if (prefs.hidden || steps.every(m => finished(m.key))) return null
  const label = `${status.done} of ${status.total} complete`

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.right + 10, window.innerWidth - 336), bottom: Math.max(12, window.innerHeight - r.bottom) })
    setOpen(o => !o)
  }

  const sheet = open && pos && (
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9990 }} />
      <div role="dialog" aria-label="Getting started" className="sr-pop" style={{ left: Math.max(12, pos.left), bottom: pos.bottom }}>
        <style>{`
          .sr-pop { position: fixed; z-index: 9991; width: 320px; max-width: calc(100vw - 24px); background: #fff; border-radius: 20px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 20px 50px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.05); padding: 18px 14px 12px; transform-origin: bottom left; animation: srIn .22s cubic-bezier(.2,.8,.2,1) both; }
          @keyframes srIn { from { opacity: 0; transform: translateY(6px) scale(.96); } to { opacity: 1; transform: none; } }
          .sr-row { display: flex; align-items: center; gap: 12px; padding: 9px 8px; border-radius: 12px; text-decoration: none; color: #1c1c1e; font-size: 14.5px; }
          .sr-row:hover { background: #f2f2f7; }
          .sr-row.done { color: #8e8e93; text-decoration: line-through; pointer-events: none; }
          .sr-circle { width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed #c7c7cc; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
          .sr-circle.done { border: none; background: #34c759; }
          .sr-circle.waiting { border-style: solid; border-color: #ff9f0a; }
          .sr-go { margin-left: auto; color: #c7c7cc; flex-shrink: 0; }
          @media (prefers-reduced-motion: reduce) { .sr-pop { animation: none; } }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 8px 10px' }}>
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1c1c1e' }}>Getting started</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8e8e93' }}>{label}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8e8e93', padding: 4, display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {steps.map(m => {
          const st = byKey.get(m.key)
          const state = st?.state || 'todo'
          const action = stepAction(m, st)
          return (
            <Link key={m.key} href={action.href} onClick={() => setOpen(false)} className={`sr-row${state === 'done' ? ' done' : ''}`} title={st?.detail || m.desc}>
              <span className={`sr-circle ${state}`}>
                {state === 'done' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>{state === 'done' ? m.doneTitle : m.title}{state === 'waiting' && <span style={{ display: 'block', fontSize: 12, color: '#ff9f0a', textDecoration: 'none' }}>{st?.detail || 'Waiting'}</span>}</span>
              {state !== 'done' && <svg className="sr-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>}
            </Link>
          )
        })}
      </div>
    </>
  )

  return (
    // Pinned to the bottom of the (scrolling) sidebar, like a status line.
    <div style={{ position: 'sticky', bottom: 0, zIndex: 1, background: '#fff', padding: collapsed ? '8px 6px' : '8px 10px', borderTop: '1px solid var(--border)' }}>
      <button ref={btn} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} title={collapsed ? `Getting started: ${label}` : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: collapsed ? '6px 0' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start', border: 'none', borderRadius: 12, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#f2f2f7' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        <Ring done={status.done} total={status.total} />
        {!collapsed && (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Getting started</span>
            <span style={{ display: 'block', fontSize: 12, color: '#8e8e93' }}>{label}</span>
          </span>
        )}
      </button>
      {typeof document !== 'undefined' && sheet ? createPortal(sheet, document.body) : null}
    </div>
  )
}
