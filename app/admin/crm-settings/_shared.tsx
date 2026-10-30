'use client'

import { useState, useEffect } from 'react'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import { AK_CSS } from '@/components/ui/AdminKit'

export function useCompanyUser() {
  // Seed synchronously from the shared identity cache. On any navigation after
  // the first, the answer is already known, so there's no loading flash and the
  // page's data fetch can fire on the very first render.
  const seed = peekCompanyUser()
  const [companyId, setCompanyId] = useState<string | null>(seed?.companyId ?? null)
  const [user, setUser] = useState<any>(seed?.user ?? null)
  const [loading, setLoading] = useState(!seed)

  useEffect(() => {
    let active = true
    resolveCompanyUser().then(({ companyId, user }) => {
      if (!active) return
      setCompanyId(companyId)
      setUser(user)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  return { companyId, user, loading }
}

// Shared styles
export const S = {
  h1: { fontFamily: "var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fontSize: 'clamp(28px,3.4vw,36px)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px', letterSpacing: '-0.04em', lineHeight: 1.05 } as React.CSSProperties,
  sub: { fontSize: 15, color: '#71717a', margin: '0 0 24px', lineHeight: 1.5 } as React.CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 22, background: '#fff', marginBottom: 18 } as React.CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' } as React.CSSProperties,
  label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 8 } as React.CSSProperties,
  // Soft grey fields, like Sellio's (the Settings area adds the focus ring).
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid transparent', background: '#f4f4f5', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' } as React.CSSProperties,
  hint: { fontSize: 12, color: 'var(--slate)', margin: '4px 0 0' } as React.CSSProperties,
  // Pills, like the app's .cv-btn (app/globals.css).
  btn: { padding: '11px 22px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(16,24,40,.12)' } as React.CSSProperties,
  btnGhost: { padding: '10px 22px', borderRadius: 999, background: '#fff', color: '#18181b', border: '1.5px solid #e4e4e7', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 1px rgba(16,24,40,.03)' } as React.CSSProperties,
}

// A toggle switch component
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{ width: 42, height: 24, borderRadius: 12, background: checked ? 'var(--coral)' : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

// A labelled toggle row
export function ToggleRow({ title, desc, checked, onChange }: { title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
        {desc && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.4 }}>{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

// ── The Sellio page shell for these settings pages ─────────────────────────
// The same header and pieces as AdminKit's <AdminPage> (display-type title,
// white rounded panels, ak-* fields and pills), sized for the Settings area,
// which already pads its content. `back` is an in-page step back (a sub-view).
export function SettingsPage({ title, sub, actions, back, children }: {
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  back?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div className="ak ak-md stp">
      <style>{AK_CSS + STP_CSS}</style>
      <header className="ak-head">
        <div style={{ minWidth: 0 }}>
          {back && (
            <button type="button" className="ak-back" onClick={back.onClick}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
              {back.label}
            </button>
          )}
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="ak-head-acts">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

/** A rounded, coloured icon tile (the Sellio feature-card mark). */
export function IconTile({ color, size = 40, children }: { color: string; size?: number; children: React.ReactNode }) {
  return <span className="stp-ic" style={{ '--c': color, width: size, height: size } as React.CSSProperties} aria-hidden>{children}</span>
}

/** "You have unsaved changes" bar that floats at the bottom of the page. */
export function SaveBar({ show, saving, onSave, onDiscard, label = 'Save changes' }: { show: boolean; saving?: boolean; onSave: () => void; onDiscard?: () => void; label?: string }) {
  return (
    <div className={`stp-save${show ? ' on' : ''}`} role="region" aria-label="Unsaved changes" aria-hidden={!show}>
      <span>You have unsaved changes</span>
      {onDiscard && <button type="button" className="ak-btn ghost sm" onClick={onDiscard} tabIndex={show ? 0 : -1}>Discard</button>}
      <button type="button" className="ak-btn go sm" onClick={onSave} disabled={saving} tabIndex={show ? 0 : -1}>{saving ? 'Saving…' : label}</button>
    </div>
  )
}

const STP_CSS = `
.ak.stp{padding:0!important;margin:0 auto}
.ak.stp button.ak-back{border:none;background:none;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.stp-ic{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:13px;color:#fff;background:linear-gradient(140deg,color-mix(in srgb,var(--c) 78%,#fff),var(--c));box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 14px -8px var(--c)}
.stp-ic svg{width:46%;height:46%}
.stp-save{position:fixed;left:50%;bottom:22px;z-index:60;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 18px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 40px -12px rgba(16,24,40,.3);font-size:13.5px;font-weight:600;color:var(--ink);transform:translate(-50%,140%);opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .2s}
.stp-save.on{transform:translate(-50%,0);opacity:1;pointer-events:auto}
.stp-save span{margin-right:6px;white-space:nowrap}
@media (max-width:560px){.stp-save{left:12px;right:12px;transform:translateY(140%)}.stp-save.on{transform:none}.stp-save span{flex:1;font-size:12.5px;white-space:normal}}
`
