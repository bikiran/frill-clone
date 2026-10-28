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

// White cards on a soft ring, pill buttons, soft grey fields. Buttons in these
// screens use the app's .cv-btn pills; btn / btnGhost are the same look inline.
export const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04)' }
export const btn: React.CSSProperties = { height: 38, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--coral, #ff7a6b)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 }
export const btnGhost: React.CSSProperties = { ...btn, background: '#f4f4f5', color: 'var(--ink, #111)' }
// backgroundColor (not background) so a select keeps its chevron.
export const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 40, padding: '9px 14px', borderRadius: 12, border: '1.5px solid transparent', fontSize: 14, fontFamily: 'inherit', outline: 'none', backgroundColor: '#f4f4f5', color: 'var(--ink, #111)', transition: 'background-color .15s, border-color .15s, box-shadow .15s' }
export const label: React.CSSProperties = { display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink, #111)', marginBottom: 6 }
export const hint: React.CSSProperties = { fontSize: 12.5, color: '#8e8e93', marginTop: 6, lineHeight: 1.45 }

export function Toggle({ on, onChange, disabled, label: name }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={name} onClick={() => !disabled && onChange(!on)} className="bk-switch"
      style={{ width: 42, height: 26, padding: 0, borderRadius: 999, border: 'none', background: on ? '#34c759' : '#e4e4e7', position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: 'background .18s' }}>
      <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(16px)' : 'none', transition: 'transform .18s cubic-bezier(.22,1,.36,1)', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
}

export function Modal({ title, onClose, children, width = 560, footer }: { title: string; onClose: () => void; children: React.ReactNode; width?: number; footer?: React.ReactNode }) {
  return (
    <div className="bkm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,20,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 12px', overflowY: 'auto' }}>
      <style>{`
        .bkm-overlay{animation:bkmFade .2s ease both}
        .bkm-panel{animation:bkmIn .38s cubic-bezier(.22,1,.36,1) both}
        @keyframes bkmFade{from{opacity:0}to{opacity:1}}
        @keyframes bkmIn{from{opacity:0;transform:translate3d(0,14px,0) scale(.97)}to{opacity:1;transform:none}}
        .bkm-x{width:34px;height:34px;flex-shrink:0;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s}
        .bkm-x::before{display:none}
        .bkm-x:hover{background-color:#ececef;color:#18181b}
        @media(max-width:600px){.bkm-overlay{padding:0!important;align-items:flex-end!important}.bkm-panel{border-radius:24px 24px 0 0!important;max-height:92dvh!important;animation-name:bkmUp}}
        @keyframes bkmUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
        @media (prefers-reduced-motion: reduce){.bkm-overlay,.bkm-panel{animation:none}}
      `}</style>
      <div className="bkm-panel" role="dialog" aria-modal="true" aria-label={title} style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: width, boxShadow: '0 24px 64px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 22px 10px' }}>
          <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em', color: 'var(--ink, #111)', flex: 1, minWidth: 0 }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="bkm-x">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: '8px 22px 20px', overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '14px 22px calc(16px + env(safe-area-inset-bottom))', flexWrap: 'wrap', borderTop: '1px solid #f0f0f2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  )
}
