'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useCompanyUser, S } from '../../_shared'

export default function RealEstateChannelPage() {
  const router = useRouter()
  const { companyId, loading } = useCompanyUser()
  const [platformReady, setPlatformReady] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [agencyId, setAgencyId] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [authorizedAt, setAuthorizedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const authFetch = async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(init?.headers || {}) } })
  }

  const load = async () => {
    if (!companyId) return
    try {
      const res = await authFetch(`/api/realestate/setup?companyId=${companyId}`)
      const d = await res.json()
      if (d.config) {
        setPlatformReady(d.platformReady !== false)
        setAuthorized(!!d.config.authorized)
        setAgencyId(d.config.agency_id || '')
        setOfficeId(d.config.office_id || '')
        setScopes(d.config.scopes || [])
        setAuthorizedAt(d.config.authorized_at || null)
      }
    } catch {}
  }
  useEffect(() => { load() }, [companyId])

  const connect = async () => {
    if (!companyId) return
    setBusy(true); setErr('')
    try {
      const res = await authFetch('/api/realestate/setup', {
        method: 'POST',
        body: JSON.stringify({ companyId, action: 'connect', agencyId, officeId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not connect')
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!companyId) return
    setBusy(true); setErr('')
    try {
      const res = await authFetch('/api/realestate/setup', {
        method: 'POST',
        body: JSON.stringify({ companyId, action: 'disconnect' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not disconnect')
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => router.push('/admin/crm-settings/channels')} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 13, marginBottom: 16 }}>← Channels</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E4002B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>RE</div>
        <h1 style={{ ...S.h1, margin: 0 }}>realestate.com.au</h1>
      </div>
      <p style={S.sub}>Buyer enquiries submitted on your realestate.com.au listings land straight in your inbox. Connect once and Colvy handles the rest — no API keys to manage.</p>

      {!platformReady && (
        <div style={{ ...S.card, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#92400e', lineHeight: 1.5 }}>
            realestate.com.au isn&rsquo;t enabled on this Colvy instance yet. Please contact support to turn it on.
          </p>
        </div>
      )}

      {/* Status + connect/disconnect */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: authorized ? 14 : 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: authorized ? '#059669' : 'var(--slate)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: authorized ? '#22c55e' : '#d1d5db' }} />
            {authorized ? 'Connected' : 'Not connected'}
          </span>
          {authorized && (
            <button onClick={disconnect} disabled={busy} style={{ ...S.btnGhost, color: '#dc2626', opacity: busy ? 0.6 : 1 }}>{busy ? 'Working…' : 'Disconnect'}</button>
          )}
        </div>

        {authorized ? (
          <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.7 }}>
            <div><strong style={{ color: 'var(--ink)' }}>Agency / office:</strong> {agencyId}{officeId ? ` · ${officeId}` : ''}</div>
            {scopes.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <strong style={{ color: 'var(--ink)' }}>Scopes:</strong>
                {scopes.map(s => <span key={s} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>{s}</span>)}
              </div>
            )}
            {authorizedAt && <div style={{ marginTop: 6, fontSize: 12 }}>Authorized {new Date(authorizedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
          </div>
        ) : (
          <>
            <label style={S.label}>Agency / office ID</label>
            <input value={agencyId} onChange={e => setAgencyId(e.target.value)} placeholder="e.g. XABCD" style={{ ...S.input, marginBottom: 12 }} disabled={!platformReady} />
            <label style={S.label}>Additional office ID <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(optional)</span></label>
            <input value={officeId} onChange={e => setOfficeId(e.target.value)} placeholder="Leave blank to use the agency ID" style={{ ...S.input, marginBottom: 16 }} disabled={!platformReady} />
            <button onClick={connect} disabled={busy || !platformReady || !agencyId.trim()} style={{ ...S.btn, opacity: (busy || !platformReady || !agencyId.trim()) ? 0.6 : 1 }}>
              {busy ? 'Connecting…' : 'Connect realestate.com.au'}
            </button>
          </>
        )}

        {err && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#dc2626' }}>{err}</p>}
      </div>

      <p style={{ ...S.hint, lineHeight: 1.6 }}>
        Connecting authorizes Colvy (an approved realestate.com.au partner) to receive your listing enquiries on your behalf — you never handle API keys. Enquiries appear in the inbox under the <strong>RealEstate</strong> channel, tagged with the listing.
      </p>
    </div>
  )
}
