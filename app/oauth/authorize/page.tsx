'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// "Allow <app> to use Colvy?" — the OAuth consent screen that Claude,
// ChatGPT, Cursor and other MCP apps send people to. Signed in with the
// person's normal Colvy session; the server re-checks everything.

type Info = { client: { name: string; uri: string | null }; redirectHost: string; user: { email: string }; workspaces: { id: string; name: string; slug: string | null; role: string }[] }

const CORAL = '#ff6b57'

function Mark() {
  return <img src="/logo.png" alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 11 }} />
}

export default function OAuthAuthorize() {
  const q = useMemo(() => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)), [])
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [access, setAccess] = useState<'read' | 'write'>('write')
  const [busy, setBusy] = useState<'' | 'approve' | 'deny'>('')

  const params = {
    client_id: q.get('client_id') || '', redirect_uri: q.get('redirect_uri') || '', state: q.get('state') || '',
    code_challenge: q.get('code_challenge') || '', code_challenge_method: q.get('code_challenge_method') || '',
    scope: q.get('scope') || '', resource: q.get('resource') || '', response_type: q.get('response_type') || 'code',
  }

  const call = async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/mcp/oauth/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body),
    })
    return { status: r.status, data: await r.json().catch(() => ({})) }
  }

  useEffect(() => {
    (async () => {
      if (!params.client_id || !params.redirect_uri) { setError('This link is missing details. Start the connection again from the app.'); return }
      if (params.response_type !== 'code') { setError('This app asked for an unsupported sign-in type.'); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = `/signin?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
        return
      }
      const { status, data } = await call({ action: 'info', client_id: params.client_id, redirect_uri: params.redirect_uri })
      if (status !== 200) { setError(data.error || 'Something went wrong.'); return }
      setInfo(data)
      // Pick the business for the subdomain we're on, else the first one.
      const host = window.location.hostname
      const sub = host.endsWith('.colvy.com') ? host.split('.')[0] : ''
      const pick = data.workspaces.find((w: any) => w.slug && w.slug === sub) || data.workspaces[0]
      if (pick) setCompanyId(pick.id)
      const asked = params.scope.split(/[\s,]+/)
      if (params.scope && !asked.includes('write')) setAccess('read')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ws = info?.workspaces.find(w => w.id === companyId)
  const canAct = !!ws && ['owner', 'admin', 'editor'].includes(ws.role)
  useEffect(() => { if (ws && !canAct) setAccess('read') }, [ws, canAct])

  const decide = async (action: 'approve' | 'deny') => {
    setBusy(action); setError('')
    const { status, data } = await call({ action, ...params, scope: access, companyId })
    if (status === 200 && data.redirect) { window.location.href = data.redirect; return }
    setError(data.error || 'Something went wrong.'); setBusy('')
  }

  const signOut = async () => { await supabase.auth.signOut(); window.location.reload() }

  return (
    <main style={{ minHeight: '100vh', background: '#f6f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: 'inherit' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 20, border: '1px solid #ececf0', boxShadow: '0 20px 50px -30px rgba(15,23,42,.35)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Mark />
          <span style={{ fontWeight: 800, fontSize: 18, color: '#0d0d0d' }}>Colvy</span>
        </div>

        {error && !info ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: '#0d0d0d' }}>Can’t connect</h1>
            <p style={{ margin: 0, fontSize: 14.5, color: '#52525b', lineHeight: 1.55 }}>{error}</p>
          </>
        ) : !info ? (
          <p style={{ margin: 0, fontSize: 14.5, color: '#71717a' }}>Checking…</p>
        ) : (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 800, margin: '0 0 6px', color: '#0d0d0d', lineHeight: 1.3 }}>
              Allow {info.client.name} to use Colvy?
            </h1>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: '#52525b', lineHeight: 1.55 }}>
              {info.client.name} will be able to work in your business as you, {info.user.email}. You can disconnect it any time in Colvy under Integrations → Colvy MCP.
            </p>

            {info.workspaces.length === 0 ? (
              <p style={{ fontSize: 14, color: '#b42318' }}>Your account isn’t part of any Colvy business.</p>
            ) : (
              <>
                <label htmlFor="ws" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 6 }}>Business</label>
                <select id="ws" value={companyId} onChange={e => setCompanyId(e.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: '1px solid #e4e4e7', fontSize: 16, background: '#fff', marginBottom: 16, color: '#0d0d0d' }}>
                  {info.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>

                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', margin: '0 0 6px' }}>Access</p>
                <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
                  {([
                    ['read', 'Read only', 'Look up customers, conversations, orders, bookings, reports and stock.'],
                    ['write', 'Read and act', 'Also create tasks and reminders, update orders, and reply to customers. Messages, refunds and payment links are always shown to you first.'],
                  ] as const).map(([v, t, d]) => {
                    const disabled = v === 'write' && !canAct
                    return (
                      <label key={v} style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, border: `1.5px solid ${access === v ? CORAL : '#e4e4e7'}`, background: access === v ? '#fff7f5' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
                        <input type="radio" name="access" value={v} checked={access === v} disabled={disabled} onChange={() => setAccess(v)} style={{ marginTop: 3, accentColor: CORAL }} />
                        <span>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0d0d0d' }}>{t}</span>
                          <span style={{ display: 'block', fontSize: 12.5, color: '#71717a', lineHeight: 1.45, marginTop: 2 }}>{disabled ? 'Your role in this business can’t make changes.' : d}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {error && <p role="alert" style={{ fontSize: 13.5, color: '#b42318', margin: '0 0 12px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => decide('deny')} disabled={!!busy}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #e4e4e7', background: '#fff', color: '#0d0d0d', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                {busy === 'deny' ? '…' : 'Cancel'}
              </button>
              <button type="button" onClick={() => decide('approve')} disabled={!!busy || !companyId}
                style={{ flex: 1.4, padding: '12px 14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, #ff7a6b, ${CORAL})`, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', opacity: !companyId ? 0.6 : 1 }}>
                {busy === 'approve' ? 'Connecting…' : 'Allow'}
              </button>
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: '#a1a1aa', lineHeight: 1.5 }}>
              You’ll go back to <strong style={{ color: '#71717a' }}>{info.redirectHost}</strong>. Not {info.user.email}? <button type="button" onClick={signOut} style={{ background: 'none', border: 'none', padding: 0, color: '#71717a', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>Sign out</button>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
