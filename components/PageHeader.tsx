'use client'

import React from 'react'

// One consistent header for admin pages. Every page reads the same way:
//   • a title + optional subtitle on the left,
//   • one primary action on the right,
//   • an optional secondary toolbar (search, filters, chips) underneath.
//
// The toolbar scrolls HORIZONTALLY on phones instead of wrapping into a tall,
// ragged stack of buttons — the main thing that made the old page headers look
// messy on mobile — and wraps normally on desktop where there's room.
export default function PageHeader({
  title,
  accent,
  subtitle,
  action,
  children,
  sticky = true,
  bleed = 0,
  bleedTop,
  icon,
}: {
  title: string
  // One word set in the serif italic after the title, e.g. Workspace <em>analytics</em>.
  accent?: string
  // Optional icon shown in a soft tile beside the title.
  icon?: React.ReactNode
  subtitle?: string
  action?: React.ReactNode
  children?: React.ReactNode
  sticky?: boolean
  // When the page wraps its content in padding, pass that padding here so the
  // header can pull itself out to the screen edges (a full-bleed top bar) with
  // negative margins — no need to restructure the page's containers. `bleed` is
  // the horizontal padding; `bleedTop` the vertical padding when it differs.
  bleed?: number
  bleedTop?: number
}) {
  return (
    <div
      className="ph-root"
      style={{
        background: 'var(--card, #fff)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 16px',
        ...(bleed ? { margin: `-${bleedTop ?? bleed}px -${bleed}px 16px` } : {}),
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 12 } : {}),
      }}
    >
      <div className="ph-row" style={{ display: 'flex', alignItems: icon ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        {icon && <div className="ph-icon" style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--peach, #fff1ee)', color: 'var(--coral, #ff7a6b)' }}>{icon}</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.15 }}>{title}{accent && <> <em className="cv-accent">{accent}</em></>}</h1>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>{subtitle}</p>}
        </div>
        {action && <div className="ph-actions" style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>{action}</div>}
      </div>

      {children && (
        <div className="ph-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {children}
        </div>
      )}

      <style>{`
        .ph-toolbar { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .ph-toolbar::-webkit-scrollbar { display: none; }
        @media (max-width: 560px) {
          .ph-icon { display: none !important; }
          /* Two or more actions: put them on their own full-width row under
             the title, so the title isn't squeezed to a word per line. */
          .ph-row:has(> .ph-actions > :nth-child(2)) { flex-wrap: wrap; }
          .ph-actions:has(> :nth-child(2)) { flex: 1 1 100%; flex-wrap: wrap; }
          .ph-actions:has(> :nth-child(2)) > * { flex: 1 1 auto; justify-content: center; text-align: center; white-space: nowrap; }
        }
        .ph-toolbar > * { flex-shrink: 0; }
        @media (min-width: 768px) {
          .ph-toolbar { flex-wrap: wrap; overflow: visible; }
        }
      `}</style>
    </div>
  )
}
