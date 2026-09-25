'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Shows — ONLY for a platform super-admin — the Colvy workspaces the contact in
// front of you owns or belongs to, with a one-click link into that workspace's
// detail in the Console. Lets you answer "this person is the admin of company
// XYZ — show me XYZ" without leaving the conversation. The lookup API 403s for
// everyone else, so this renders nothing for normal agents.

const PLAN_COLOR: Record<string, string> = { free: '#6b7280', trial: '#6366f1', feedback: '#7c5cff', omnichannel: '#2b59ff', everything: '#ff6a4d', enterprise: '#8b5cf6', suspended: '#ef4444' }

export default function SuperAdminContactWorkspaces({ email }: { email: string | null }) {
  const [workspaces, setWorkspaces] = useState<any[] | null>(null)
  const lastEmail = useRef<string | null>(null)

  useEffect(() => {
    const e = (email || '').trim()
    if (!e || e === lastEmail.current) { if (!e) setWorkspaces(null); return }
    lastEmail.current = e
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const t = data?.session?.access_token
        if (!t) { setWorkspaces(null); return }
        const res = await fetch(`/api/platform-admin/company-lookup?email=${encodeURIComponent(e)}`, {
          headers: { Authorization: `Bearer ${t}` },
        })
        if (!res.ok) { if (!cancelled) setWorkspaces(null); return } // 403 for non-super-admins
        const d = await res.json()
        if (!cancelled) setWorkspaces(d.workspaces || [])
      } catch { if (!cancelled) setWorkspaces(null) }
    })()
    return () => { cancelled = true }
  }, [email])

  if (!workspaces || workspaces.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span aria-hidden>🛡</span> Super Admin · Workspaces
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {workspaces.map((w: any) => (
          <a key={w.id} href={`https://admin.colvy.com/#companies/${w.id}`} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', textDecoration: 'none', color: 'var(--ink)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: PLAN_COLOR[String(w.plan)] || '#6b7280' }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name || w.slug}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)', textTransform: 'capitalize' }}>{w.role} · {w.plan || 'free'}</span>
            </span>
            <span style={{ color: 'var(--coral)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>View ↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}
