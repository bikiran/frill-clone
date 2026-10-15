'use client'

import { ReactNode } from 'react'
import { card, CHIP } from '@/components/ScrollStory'

// Building blocks for scroll-story cards: small, real-looking pieces of the
// Colvy app (a message, a booking, a payment, a report) filled with demo data.
// The /for/* workflow pages and the platform page compose their stories from
// these so every card looks like it came from the same product.

export { card, CHIP }

const muted = '#6b7280'
const body = '#374151'

// A tiny SVG icon set for the cards (no emoji, so they render the same everywhere).
const ICONS: Record<string, ReactNode> = {
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  truck: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  form: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  store: <><path d="M3 9l1-5h16l1 5" /><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13v8h14v-8" /></>,
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
}
export function Ico({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
}

const IconTile = ({ icon, tint }: { icon: string; tint: string }) => (
  <span style={{ width: 38, height: 38, borderRadius: 11, background: tint + '1a', color: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico name={icon} /></span>
)

const Pill = ({ text, tone = '#15803d' }: { text: string; tone?: string }) => (
  <span style={{ fontSize: 10.5, fontWeight: 800, color: tone, background: tone + '17', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{text}</span>
)

/** An action card: icon, a bold line, a quiet line and an optional footer row. */
export function ActionCard({ icon, tint, title, sub, left, right, rightTone = '#16a34a', width = 280 }: {
  icon: string; tint: string; title: string; sub?: string; left?: string; right?: string; rightTone?: string; width?: number
}) {
  return (
    <div style={{ ...card, width, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', gap: 11, alignItems: 'center' }}>
        <IconTile icon={icon} tint={tint} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 900 }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: muted, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      {(left || right) && (
        <div style={{ padding: '9px 16px', borderTop: '1px solid #f0f0f3', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: muted }}>{left}</span>{right && <span style={{ color: rightTone }}>{right}</span>}
        </div>
      )}
    </div>
  )
}

/** A status card: title with a coloured badge, a detail line and a highlighted strip. */
export function StatusCard({ title, badge, badgeTone = '#15803d', sub, strip, stripTone = '#6d28d9', width = 280 }: {
  title: string; badge?: string; badgeTone?: string; sub?: string; strip?: string; stripTone?: string; width?: number
}) {
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 900 }}>{title}</span>
        {badge && <Pill text={badge} tone={badgeTone} />}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: muted, margin: '6px 0 0' }}>{sub}</div>}
      {strip && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: stripTone + '12', fontSize: 12, fontWeight: 800, color: stripTone }}>{strip}</div>}
    </div>
  )
}

/** A short conversation: header, a few bubbles and outcome chips. */
export function ChatCard({ title, sub, channel, lines, chips = [], width = 330 }: {
  title: string; sub?: string; channel?: string
  lines: { from: 'them' | 'us' | 'ai'; text: string }[]
  chips?: { text: string; tone?: string }[]; width?: number
}) {
  const tone = channel ? (CHIP[channel] || '#64748b') : '#64748b'
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: tone, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>{title.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: muted }}>{sub}</div>}
        </div>
        {channel && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: tone, background: tone + '14', padding: '2px 6px', borderRadius: 4 }}>{channel}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '11px 0 2px' }}>
        {lines.map((l, i) => (
          <span key={i} style={{
            alignSelf: l.from === 'them' ? 'flex-start' : 'flex-end', maxWidth: '86%', fontSize: 12, lineHeight: 1.4, padding: '7px 11px',
            borderRadius: l.from === 'them' ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
            background: l.from === 'them' ? '#f1f5f9' : l.from === 'ai' ? 'linear-gradient(135deg,#eef2ff,#f5f3ff)' : '#fff1ec',
            color: l.from === 'them' ? '#1f2937' : l.from === 'ai' ? '#312e81' : '#9a3412',
          }}>{l.from === 'ai' && <b style={{ fontSize: 9.5, letterSpacing: '0.04em', display: 'block', marginBottom: 1, opacity: 0.75 }}>AI DRAFT</b>}{l.text}</span>
        ))}
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {chips.map(c => <Pill key={c.text} text={c.text} tone={c.tone || '#15803d'} />)}
        </div>
      )}
    </div>
  )
}

/** An SMS/notification card: a label, the message and a result row. */
export function NoteCard({ label, labelTone = CHIP.SMS, text, left, right, rightTone = '#16a34a', width = 290 }: {
  label: string; labelTone?: string; text: string; left?: string; right?: string; rightTone?: string; width?: number
}) {
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: labelTone, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: body }}>{text}</div>
      {(left || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: muted }}>{left}</span>{right && <span style={{ color: rightTone }}>{right}</span>}
        </div>
      )}
    </div>
  )
}

/** A Google review with the reply that went out. */
export function ReviewCard({ text, reply, who = 'Google', when = '2h ago', width = 290 }: { text: string; reply?: string; who?: string; when?: string; width?: number }) {
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, letterSpacing: 1, color: '#f59e0b' }}>★★★★★</span>
        <span style={{ fontSize: 11, color: muted }}>{who} · {when}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, margin: '7px 0 10px', color: body }}>“{text}”</div>
      {reply && <div style={{ fontSize: 11.5, padding: '8px 10px', borderRadius: 10, background: '#fff7ed', color: '#9a3412' }}><b>Reply sent</b> · “{reply}”</div>}
    </div>
  )
}

/** Open times for a day, with one picked. */
export function SlotsCard({ title, day, slots, picked, footer, width = 290 }: { title: string; day: string; slots: string[]; picked?: string; footer?: string; width?: number }) {
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <IconTile icon="cal" tint="#0d9488" />
        <div><div style={{ fontSize: 13.5, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 11.5, color: muted }}>{day}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {slots.map(s => (
          <span key={s} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 800, padding: '7px 0', borderRadius: 8, border: `1.5px solid ${s === picked ? '#0d9488' : '#e5e7eb'}`, background: s === picked ? '#0d9488' : '#fff', color: s === picked ? '#fff' : '#334155' }}>{s}</span>
        ))}
      </div>
      {footer && <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: '#0f766e' }}>{footer}</div>}
    </div>
  )
}

/** A small report: a headline figure, bars and a few rows. Demo numbers. */
export function ReportCard({ title, figure, caption, bars = [], rows = [], tone = '#7c3aed', width = 300 }: {
  title: string; figure: string; caption?: string; bars?: number[]; rows?: [string, string][]; tone?: string; width?: number
}) {
  const max = Math.max(1, ...bars)
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>{figure}</div>
          {caption && <div style={{ fontSize: 11, color: muted }}>{caption}</div>}
        </div>
        {bars.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
            {bars.map((b, i) => <span key={i} style={{ width: 7, height: `${Math.max(8, (b / max) * 100)}%`, borderRadius: 3, background: i === bars.length - 1 ? tone : tone + '40' }} />)}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f3' }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '6px 0', borderBottom: '1px solid #f6f6f8' }}>
              <span style={{ color: body }}>{k}</span><b>{v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** A short list (inbox, stores, tasks) with coloured dots and tags. */
export function ListCard({ title, badge, rows, width = 330 }: {
  title: string; badge?: string
  rows: { name: string; sub: string; tag?: string; tone?: string; hot?: boolean }[]; width?: number
}) {
  return (
    <div style={{ ...card, width, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f0f0f3' }}>
        <img src="/icon-192.png" alt="" width={22} height={22} style={{ borderRadius: 6 }} />
        <span style={{ fontSize: 14, fontWeight: 800 }}>{title}</span>
        {badge && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#2563eb' }}>{badge}</span>}
      </div>
      {rows.map((r, i) => (
        <div key={r.name + i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 16px', borderTop: i ? '1px solid #f4f4f6' : 'none', background: r.hot ? '#fff6f3' : '#fff' }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: r.tone || '#64748b', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{r.name}</span>
              {r.tag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: r.tone || '#64748b', background: (r.tone || '#64748b') + '14', padding: '1px 5px', borderRadius: 4 }}>{r.tag}</span>}
            </div>
            <div style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{r.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** A step-by-step trail (how a customer got here), newest at the bottom. */
export function TrailCard({ title, steps, width = 320 }: { title: string; steps: { icon: string; text: string; when?: string; tone?: string }[]; width?: number }) {
  return (
    <div style={{ ...card, width, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted, marginBottom: 8 }}>{title}</div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i === steps.length - 1 ? 0 : 10 }}>
          {i < steps.length - 1 && <span style={{ position: 'absolute', left: 13, top: 28, bottom: 0, width: 2, background: '#eef0f4' }} />}
          <span style={{ width: 28, height: 28, borderRadius: 9, background: (s.tone || '#64748b') + '1a', color: s.tone || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico name={s.icon} size={15} /></span>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 5 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{s.text}</div>
          </div>
          {s.when && <span style={{ fontSize: 10.5, color: '#9ca3af', paddingTop: 6 }}>{s.when}</span>}
        </div>
      ))}
    </div>
  )
}
