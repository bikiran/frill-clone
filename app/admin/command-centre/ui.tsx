'use client'

// Small shared pieces for the Command Centre: icons (SVG only), cards, chips,
// KPI tiles and the inline "Why?" explainer.

import { useEffect, useState } from 'react'

export const C = {
  green: '#16a34a', red: '#dc2626', amber: '#d97706', blue: '#2563eb', violet: '#7c3aed', cyan: '#0891b2',
}

export const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)', padding: 16, minWidth: 0 }
export const kicker: React.CSSProperties = { margin: 0, fontSize: 10.5, color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }
export const ctrl: React.CSSProperties = { padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', outline: 'none', maxWidth: '100%' }
export const tint = (col: string, pct = 14) => `color-mix(in srgb, ${col} ${pct}%, transparent)`

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const svg = (size: number, children: React.ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" {...P} aria-hidden="true" style={{ flexShrink: 0 }}>{children}</svg>
const PHONE = <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />

export const Icon = {
  phone: (s = 18) => svg(s, PHONE),
  phoneIn: (s = 18) => svg(s, <>{PHONE}<polyline points="16 2 16 8 22 8" /><line x1="23" y1="1" x2="16" y2="8" /></>),
  phoneOut: (s = 18) => svg(s, <>{PHONE}<polyline points="23 7 23 1 17 1" /><line x1="16" y1="8" x2="23" y2="1" /></>),
  phoneMissed: (s = 18) => svg(s, <>{PHONE}<line x1="23" y1="1" x2="17" y2="7" /><line x1="17" y1="1" x2="23" y2="7" /></>),
  check: (s = 18) => svg(s, <polyline points="20 6 9 17 4 12" />),
  x: (s = 18) => svg(s, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  vm: (s = 18) => svg(s, <><circle cx="6" cy="14" r="4" /><circle cx="18" cy="14" r="4" /><line x1="6" y1="18" x2="18" y2="18" /></>),
  user: (s = 18) => svg(s, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  users: (s = 18) => svg(s, <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  live: (s = 18) => svg(s, <><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" /></>),
  pct: (s = 18) => svg(s, <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>),
  clock: (s = 18) => svg(s, <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>),
  chat: (s = 18) => svg(s, <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  send: (s = 18) => svg(s, <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>),
  arrowIn: (s = 18) => svg(s, <><polyline points="20 12 4 12" /><polyline points="10 18 4 12 10 6" /></>),
  alert: (s = 16) => svg(s, <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  calendar: (s = 13) => svg(s, <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  chevron: (s = 11) => svg(s, <polyline points="6 9 12 15 18 9" />),
  chevronRight: (s = 14) => svg(s, <polyline points="9 18 15 12 9 6" />),
  search: (s = 15) => svg(s, <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
  pin: (s = 13) => svg(s, <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>),
  task: (s = 14) => svg(s, <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  list: (s = 14) => svg(s, <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>),
  external: (s = 13) => svg(s, <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>),
  refresh: (s = 13) => svg(s, <><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>),
  // A filled spark for anything the AI did.
  spark: (s = 13) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7" /></svg>,
}

export function Chip({ color, children, title, solid }: { color: string; children: React.ReactNode; title?: string; solid?: boolean }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: solid ? color : tint(color, 14), color: solid ? '#fff' : color }}>{children}</span>
  )
}

export function Kpi({ label, value, color, icon, sub, foot, onClick, active }: { label: string; value: React.ReactNode; color: string; icon: React.ReactNode; sub?: React.ReactNode; foot?: React.ReactNode; onClick?: () => void; active?: boolean }) {
  const Tag: any = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', font: 'inherit', cursor: onClick ? 'pointer' : 'default', borderColor: active ? color : 'var(--border)', boxShadow: active ? `0 0 0 1px ${color}` : 'none' }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(color), color }}>{icon}</span>
      <span style={{ minWidth: 0, display: 'block' }}>
        <span style={{ display: 'block', fontSize: 23, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
        <span style={{ ...kicker, display: 'block', marginTop: 5 }}>{label}</span>
        {sub && <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--slate)', fontWeight: 600, lineHeight: 1.35 }}>{sub}</span>}
        {foot && <span style={{ display: 'block', marginTop: 4 }}>{foot}</span>}
      </span>
    </Tag>
  )
}

/** "▲ 12% vs prev" in plain text and colour. Up is good unless `invert`. */
export function Trend({ cur, prev, invert = false, unit = '%' }: { cur: number; prev: number; invert?: boolean; unit?: '%' | 'pts' }) {
  if (prev === 0 && cur === 0) return null
  const pct = unit === 'pts' ? cur - prev : prev === 0 ? 100 : Math.round((cur - prev) / prev * 100)
  const up = pct > 0
  const good = invert ? !up : up
  const color = pct === 0 ? 'var(--slate)' : good ? C.green : C.red
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 700, fontSize: 11 }}>
      {pct !== 0 && <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d={up ? 'M5 1 9 8H1z' : 'M5 9 1 2h8z'} fill="currentColor" /></svg>}
      {pct === 0 ? 'no change' : `${Math.abs(pct)}${unit === 'pts' ? ' pts' : '%'}`}
      <span style={{ color: 'var(--slate)', fontWeight: 600 }}>vs prev</span>
    </span>
  )
}

/** "Why?" that opens a short plain explanation in place. */
export function WhyInline({ why, label = 'Why?', align = 'left' }: { why: React.ReactNode; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o) }} aria-expanded={open}
        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--coral)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        {label}
      </button>
      {open && (
        <>
          <span onClick={e => { e.stopPropagation(); setOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <span role="dialog" onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: '100%', [align]: 0, marginTop: 6, zIndex: 61, width: 'min(300px, 80vw)', display: 'block', padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card, #fff)', boxShadow: '0 14px 36px rgba(0,0,0,0.16)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink)', fontWeight: 500, textAlign: 'left', whiteSpace: 'normal' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--coral)', fontWeight: 800, fontSize: 11 }}>{Icon.spark(12)} Why this shows</span>
            {why}
          </span>
        </>
      )}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, maxWidth: '100%', overflowX: 'auto' }}>
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: size === 'sm' ? '5px 10px' : '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: value === k ? 'var(--card, #fff)' : 'transparent', color: value === k ? 'var(--ink)' : 'var(--slate)', boxShadow: value === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Colour for each call outcome (chips, the activity feed, the drawer). */
export const OUTCOME_COLOR: Record<string, string> = { answered: C.green, connected: C.green, missed: C.red, voicemail: C.amber, live: C.blue, no_answer: '#6b6b70' }

/**
 * A grey placeholder where a number or line will be, so the board's layout is
 * there straight away. `data-skel` marks it (the speed check waits for none).
 * The shimmer needs the page's `ccshimmer` keyframes and stops for people who
 * prefer less motion.
 */
export function Skel({ w = '100%', h = 12, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <span data-skel="" aria-hidden="true" className="cc-skel" style={{ display: 'inline-block', width: w, height: h, borderRadius: r, verticalAlign: 'middle', maxWidth: '100%', ...style }} />
}

/** A few placeholder rows: an icon block and two lines, as most lists on the board look. */
export function SkelRows({ n = 3, icon = true, pad = '10px 0' }: { n?: number; icon?: boolean; pad?: string }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: pad }}>
          {icon && <Skel w={30} h={30} r={9} style={{ flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skel w={`${70 - (i % 3) * 12}%`} h={11} />
            <Skel w={`${45 - (i % 2) * 10}%`} h={9} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', display: 'inline-block', animation: 'ccspin .8s linear infinite', flexShrink: 0 }} />
}

/** A ticking "m:ss" since `since`, on its own 1-second timer (so the board doesn't re-render every second). */
export function LiveTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [])
  const secs = Math.max(0, Math.floor((now - (Date.parse(since) || now)) / 1000))
  const m = Math.floor(secs / 60), s = secs % 60
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m}:{String(s).padStart(2, '0')}</span>
}

/** The business's local time, ticking once a second on its own. */
export function Clock({ tz, hour12 }: { tz: string; hour12: boolean }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()); const iv = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(iv) }, [])
  if (!now) return <span>&nbsp;</span>
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString('en-AU', { timeZone: tz, hour12 })}</span>
}

export const btn = (tone: 'primary' | 'ghost' | 'soft' = 'ghost'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
  ...(tone === 'primary' ? { border: '1px solid var(--coral)', background: 'var(--coral)', color: '#fff' }
    : tone === 'soft' ? { border: '1px solid transparent', background: tint('#ff7a6b', 12), color: 'var(--coral)' }
      : { border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)' }),
})

export const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }

/** Width-based switch for small screens (no horizontal page scroll on phones). */
export function useNarrow(px = 760): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${px}px)`)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [px])
  return narrow
}
