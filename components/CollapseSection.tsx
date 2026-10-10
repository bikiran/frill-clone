'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

// A drawer section whose body folds away under its heading. Open by default;
// the choice is remembered per section (storageKey) on this device. The body
// eases its height with the grid 0fr↔1fr trick, so content of any size folds
// smoothly with no measuring; reduced motion turns the easing off.

const EASE = 'cubic-bezier(.32,.72,0,1)'

export default function CollapseSection({
  title, right, storageKey, defaultOpen = true, style, headStyle, children, id,
}: {
  title: ReactNode
  right?: ReactNode
  storageKey?: string
  defaultOpen?: boolean
  style?: CSSProperties
  headStyle?: CSSProperties
  children: ReactNode
  id?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Clip only while folded or mid-animation; once open, let menus inside
  // (tag pickers, popovers) spill out of the section.
  const [clip, setClip] = useState(!defaultOpen)
  useEffect(() => {
    if (!storageKey) return
    try { const v = localStorage.getItem(`colvy-sect-${storageKey}`); if (v != null) { setOpen(v === '1'); setClip(v !== '1') } } catch {}
  }, [storageKey])
  const toggle = () => {
    const n = !open
    setClip(true)
    setOpen(n)
    // Fallback for when no transitionend fires (reduced motion).
    if (n) setTimeout(() => setClip(false), 420)
    if (storageKey) { try { localStorage.setItem(`colvy-sect-${storageKey}`, n ? '1' : '0') } catch {} }
  }

  return (
    <div style={style} id={id}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 22, ...headStyle }}>
        <button type="button" onClick={toggle} aria-expanded={open} className="colvy-sect-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, margin: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', minWidth: 0 }}>
          <span style={{ margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>{title}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--slate)', opacity: 0.7, flexShrink: 0, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: `transform .32s ${EASE}` }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: `opacity .24s ${EASE}` }}>{right}</div>}
      </div>
      <div className="colvy-sect-body" onTransitionEnd={e => { if (e.target === e.currentTarget && open) setClip(false) }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: open ? '1fr' : '0fr', transition: `grid-template-rows .36s ${EASE}` }}>
        <div style={{ overflow: clip ? 'hidden' : 'visible', minHeight: 0, minWidth: 0, opacity: open ? 1 : 0, transform: open ? 'none' : 'translateY(-4px)', transition: `opacity .28s ${EASE}, transform .36s ${EASE}` }}>
          {children}
        </div>
      </div>
      <style>{`
        .colvy-sect-head:focus-visible { outline: 2px solid var(--coral); outline-offset: 3px; border-radius: 4px; }
        @media (prefers-reduced-motion: reduce) { .colvy-sect-body, .colvy-sect-body > div, .colvy-sect-head svg { transition: none !important; } }
      `}</style>
    </div>
  )
}
