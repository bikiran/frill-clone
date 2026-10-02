'use client'

import Link from 'next/link'
import { INTEGRATIONS } from '@/lib/integrations-catalog'

// Shared pieces for the integration pages, so they all look like Colvy:
// white rounded cards, the workspace accent for actions, SVG icons only.

const PATHS: Record<string, React.ReactNode> = {
  back: <polyline points="15 18 9 12 15 6" />,
  check: <polyline points="20 6 9 17 4 12" />,
  sync: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  store: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M10 20v-5h4v5" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  unlink: <><path d="M18.84 12.25l1.72-1.71a4.95 4.95 0 0 0-7-7l-1.72 1.71" /><path d="M5.17 11.75l-1.71 1.71a4.95 4.95 0 0 0 7 7l1.71-1.71" /><line x1="8" y1="2" x2="8" y2="5" /><line x1="2" y1="8" x2="5" y2="8" /><line x1="16" y1="19" x2="16" y2="22" /><line x1="19" y1="16" x2="22" y2="16" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  chevron: <polyline points="9 18 15 12 9 6" />,
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>,
  webhook: <><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" /><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" /><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" /></>,
}

export function Icon({ name, size = 16, style }: { name: keyof typeof PATHS | string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, ...style }}>
      {PATHS[name] || PATHS.info}
    </svg>
  )
}

/** A filled star (ratings) — SVG rather than a text glyph. */
export function Star({ on = true, size = 13 }: { on?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={on ? '#f5a623' : '#e5e5e5'} />
    </svg>
  )
}

/** Page container: fills the space next to the integrations list (no empty side gutters). */
export function IntegrationPage({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
}

export function IntegrationHeader({ id, title, desc, connected, children }: { id: string; title?: string; desc?: string; connected?: boolean; children?: React.ReactNode }) {
  const intg = INTEGRATIONS.find(i => i.id === id)
  return (
    <>
      <Link href="/admin/integrations" className="inline-flex items-center gap-1.5 text-sm mb-5 hover:opacity-70 transition-opacity" style={{ color: 'var(--slate)' }}>
        <Icon name="back" size={15} /> All integrations
      </Link>
      <div className="flex items-start sm:items-center gap-4 mb-6 flex-wrap sm:flex-nowrap">
        <img src={intg?.logo || '/logos/webhook.svg'} alt="" width={56} height={56} className="shrink-0" style={{ width: 56, height: 56 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)', margin: 0 }}>{title || intg?.name}</h1>
            {connected && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>
                <Icon name="check" size={12} /> Connected
              </span>
            )}
          </div>
          <p className="mt-1" style={{ color: 'var(--slate)', margin: '4px 0 0' }}>{desc || intg?.desc}</p>
        </div>
        {children}
      </div>
    </>
  )
}

export function Card({ title, sub, icon, children, right, className = '' }: { title?: React.ReactNode; sub?: React.ReactNode; icon?: string; children?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border p-5 md:p-6 ${className}`} style={{ borderColor: 'var(--border)' }}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            {icon && <span className="mt-0.5" style={{ color: 'var(--coral)' }}><Icon name={icon} size={18} /></span>}
            <div className="min-w-0">
              {title && <h2 className="font-bold text-[15px]" style={{ color: 'var(--ink)', margin: 0 }}>{title}</h2>}
              {sub && <p className="text-sm mt-1" style={{ color: 'var(--slate)', margin: '4px 0 0' }}>{sub}</p>}
            </div>
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Notice({ tone, children }: { tone: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const t = tone === 'success' ? { bg: '#ecfdf3', fg: '#067647', bd: '#abefc6', icon: 'check' }
    : tone === 'error' ? { bg: '#fef3f2', fg: '#b42318', bd: '#fecdca', icon: 'alert' }
    : { bg: 'var(--canvas, #f8f8fa)', fg: 'var(--slate)', bd: 'var(--border)', icon: 'info' }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex items-start gap-2.5 p-3 rounded-xl text-sm mb-4" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      <span className="mt-0.5"><Icon name={t.icon} size={15} /></span>
      <div className="min-w-0" style={{ wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

const BASE = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-default'
const LOOK: Record<'primary' | 'secondary' | 'danger', React.CSSProperties> = {
  primary: { background: 'var(--coral)', color: '#fff', border: '1px solid var(--coral)' },
  secondary: { background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)' },
  danger: { background: '#fff', color: '#b42318', border: '1px solid #fecdca' },
}
/** Button props: `{...btn('primary')}`, or `{...btn('secondary', 'sm')}` for a compact one. */
export const btn = (kind: 'primary' | 'secondary' | 'danger', size: 'md' | 'sm' = 'md', extra = '') => ({
  className: `${BASE} ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'} ${extra}`.trim(),
  style: LOOK[kind],
})

export const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none'
export const inputStyle: React.CSSProperties = { borderColor: 'var(--border)', fontSize: 16, background: '#fff', color: 'var(--ink)' }
