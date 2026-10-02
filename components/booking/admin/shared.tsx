'use client'

import { supabase } from '@/lib/supabase'

// Shared bits for the admin Bookings screens.

export async function api(path: string, init?: RequestInit & { json?: any }) {
  const { data } = await supabase.auth.getSession()
  const t = data?.session?.access_token
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d
}

export const money = (c: number, cur = 'aud') => {
  const n = (c || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n}` }
}
export const dur = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`

export const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border, #ececec)', borderRadius: 14, padding: 18 }
export const btn: React.CSSProperties = { height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: 'var(--coral, #ff7a6b)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }
export const btnGhost: React.CSSProperties = { ...btn, background: '#fff', color: 'var(--ink, #111)', border: '1px solid var(--border, #e5e7eb)', fontWeight: 600 }
export const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: '#fff', color: 'var(--ink, #111)' }
export const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--slate, #4b5563)', marginBottom: 5 }
export const hint: React.CSSProperties = { fontSize: 12, color: 'var(--slate, #6b7280)', marginTop: 4, lineHeight: 1.45 }

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!on)} aria-pressed={on}
      style={{ width: 38, height: 22, borderRadius: 999, border: 'none', background: on ? 'var(--coral, #ff7a6b)' : '#d1d5db', position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  )
}

export function Modal({ title, onClose, children, width = 560, footer }: { title: string; onClose: () => void; children: React.ReactNode; width?: number; footer?: React.ReactNode }) {
  return (
    <div className="bkm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)', WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', overflowY: 'auto' }}>
      <style>{`
        .bkm-overlay{animation:bkmFade .2s ease both}
        .bkm-panel{animation:bkmIn .38s cubic-bezier(.22,1,.36,1) both}
        @keyframes bkmFade{from{opacity:0}to{opacity:1}}
        @keyframes bkmIn{from{opacity:0;transform:translate3d(0,14px,0) scale(.97)}to{opacity:1;transform:none}}
        @media(max-width:600px){.bkm-overlay{padding:0!important;align-items:flex-end!important}.bkm-panel{border-radius:18px 18px 0 0!important;max-height:92dvh!important;animation-name:bkmUp}}
        @keyframes bkmUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
        @media (prefers-reduced-motion: reduce){.bkm-overlay,.bkm-panel{animation:none}}
      `}</style>
      <div className="bkm-panel" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: width, boxShadow: '0 24px 60px -20px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border, #f1f1f1)' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink, #111)', flex: 1 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', flexWrap: 'wrap', borderTop: '1px solid var(--border, #f1f1f1)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  )
}
