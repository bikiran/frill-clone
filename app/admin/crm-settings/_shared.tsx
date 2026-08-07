'use client'

import { useState, useEffect } from 'react'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'

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
  h1: { fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' } as React.CSSProperties,
  sub: { fontSize: 14, color: 'var(--slate)', margin: '0 0 24px', lineHeight: 1.5 } as React.CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 22, background: '#fff', marginBottom: 18 } as React.CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' } as React.CSSProperties,
  label: { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 } as React.CSSProperties,
  input: { width: '100%', padding: '10px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' } as React.CSSProperties,
  hint: { fontSize: 12, color: 'var(--slate)', margin: '4px 0 0' } as React.CSSProperties,
  btn: { padding: '11px 22px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { padding: '11px 22px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
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
