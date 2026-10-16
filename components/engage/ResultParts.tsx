'use client'

// Small result pieces shared by poll and survey results, drawn with the form
// Results classes (fr-card, fr-kpi, fr-bar-row, fr-cols) so all three match.

import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/form-results/icons'
import type { TallyRow } from '@/lib/engage-core'
import { parseDbTime } from '@/lib/db-time'

export function Kpi({ icon, value, label, sub, color = 'var(--coral)', title }: { icon: IconName; value: ReactNode; label: string; sub?: string; color?: string; title?: string }) {
  return (
    <div className="fr-card fr-kpi" title={title}>
      <Icon name={icon} size={16} stroke={color} />
      <div className="fr-kpi-v">{value}</div>
      <div className="fr-kpi-l">{label}</div>
      {sub && <div className="fr-kpi-s">{sub}</div>}
    </div>
  )
}

export function Bars({ rows, color = 'var(--coral)', leaders = [], big, showPoints }: { rows: TallyRow[]; color?: string; leaders?: string[]; big?: boolean; showPoints?: boolean }) {
  const lead = new Set(leaders)
  return (
    <div className={big ? 'eg-bar-big' : undefined}>
      {rows.map(r => (
        <div key={r.label} className="fr-bar-row">
          <div className="fr-bar-top">
            <span className="fr-bar-label">
              {r.image && <img className="fr-thumb" src={r.image} alt="" />}
              <span style={{ minWidth: 0 }}>
                {r.label}
                {r.description && <small style={{ display: 'block', color: 'var(--slate)', fontSize: 12 }}>{r.description}</small>}
              </span>
              {lead.has(r.label) && <span className="eg-lead">Leading</span>}
            </span>
            <span className="fr-bar-num">
              {showPoints ? `${(r.points || 0).toLocaleString('en-AU')} pts${r.avgRank ? ` · avg #${r.avgRank}` : ''}` : `${r.count.toLocaleString('en-AU')} · ${r.pct}%`}
            </span>
          </div>
          <div className="fr-track" role="img" aria-label={`${r.label}: ${r.pct}%`}>
            <div className="fr-fill" style={{ width: `${Math.min(100, Math.max(0, r.pct))}%`, background: lead.has(r.label) ? color : `color-mix(in srgb, ${color} 55%, #cbd5e1)` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Vertical columns (a score distribution, or answers per day). */
export function Columns({ items, colorOf, height = 110 }: { items: { x: string; n: number; title?: string }[]; colorOf?: (i: number) => string; height?: number }) {
  const max = Math.max(1, ...items.map(i => i.n))
  return (
    <div className="fr-cols" style={{ height }}>
      {items.map((it, i) => (
        <div key={`${it.x}-${i}`} className="fr-col" title={it.title || `${it.x}: ${it.n}`}>
          <span className="fr-col-n">{it.n || ''}</span>
          <div className="fr-col-bar" style={{ height: `${Math.max(2, (it.n / max) * (height - 34))}px`, background: colorOf ? colorOf(i) : 'var(--coral)', opacity: it.n ? 1 : 0.25 }} />
          <span className="fr-col-x">{it.x}</span>
        </div>
      ))}
    </div>
  )
}

/** Answers per day for the last `days` days (local time), oldest first. created_at is UTC without an offset (lib/db-time.ts). */
export function perDay(times: string[], days = 14, now = Date.now()): { x: string; n: number; title: string }[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() - (days - 1 - i))
    return { d, n: 0 }
  })
  for (const t of times) {
    const ms = parseDbTime(t)
    if (!Number.isFinite(ms)) continue
    const day = new Date(ms); day.setHours(0, 0, 0, 0)
    const idx = out.findIndex(o => o.d.getTime() === day.getTime())
    if (idx >= 0) out[idx].n++
  }
  return out.map((o, i) => ({
    x: String(o.d.getDate()),
    n: o.n,
    title: `${o.d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}: ${o.n}`,
  }))
}

export function Card({ title, sub, right, children, className }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`fr-card fr-qcard${className ? ` ${className}` : ''}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <h3 className="fr-qtitle">{title}</h3>
          {sub && <div className="fr-meta" style={{ margin: '6px 0 14px' }}>{sub}</div>}
        </div>
        {right}
      </div>
      {!sub && <div style={{ height: 12 }} />}
      {children}
    </section>
  )
}
