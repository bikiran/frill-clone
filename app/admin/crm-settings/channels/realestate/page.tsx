'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useCompanyUser, S, Toggle } from '../../_shared'

export default function RealEstateChannelPage() {
  const router = useRouter()
  const { companyId, loading } = useCompanyUser()
  const [clientId, setClientId] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [secretPlaceholder, setSecretPlaceholder] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const authFetch = async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(init?.headers || {}) } })
  }

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      try {
        const res = await authFetch(`/api/realestate/setup?companyId=${companyId}`)
        const d = await res.json()
        if (d.config) {
          setClientId(d.config.client_id || '')
          setAgencyId(d.config.agency_id || '')
          setHasSecret(!!d.config.has_secret)
          setSecretPlaceholder(d.config.api_secret_masked || '')
          setIsActive(!!d.config.is_active)
          setWebhookUrl(d.config.webhook_url || null)
        }
      } catch {}
    })()
  }, [companyId])

  const save = async (nextActive?: boolean) => {
    if (!companyId) return
    setBusy(true); setMsg('')
    try {
      const res = await authFetch('/api/realestate/setup', {
        method: 'POST',
        body: JSON.stringify({
          companyId, clientId, agencyId,
          ...(apiSecret ? { apiSecret } : {}),
          ...(typeof nextActive === 'boolean' ? { isActive: nextActive } : {}),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Save failed')
      if (typeof nextActive === 'boolean') setIsActive(nextActive)
      if (apiSecret) { setHasSecret(true); setSecretPlaceholder(`••••${apiSecret.slice(-4)}`); setApiSecret('') }
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  const copy = () => { if (webhookUrl) { navigator.clipboard?.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => router.push('/admin/crm-settings/channels')} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 13, marginBottom: 16 }}>← Channels</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E4002B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>RE</div>
        <h1 style={{ ...S.h1, margin: 0 }}>realestate.com.au</h1>
      </div>
      <p style={S.sub}>Buyer enquiries submitted on your realestate.com.au listings land straight in your inbox as conversations.</p>

      {/* Status / enable */}
      <div style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{isActive ? 'Channel enabled' : 'Channel disabled'}</p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>When on, incoming enquiries are added to your inbox.</p>
        </div>
        <Toggle checked={isActive} onChange={v => save(v)} />
      </div>

      {/* Step 1 — webhook URL to paste into the REA Portal */}
      <div style={S.card}>
        <h2 style={S.h2}>1. Connect in the REA Portal</h2>
        <p style={{ ...S.hint, margin: '0 0 12px' }}>
          In your <a href="https://partner.realestate.com.au/" target="_blank" rel="noreferrer" style={{ color: 'var(--coral)' }}>realestate.com.au partner portal</a>, set the enquiry / lead webhook (delivery) URL to the address below. Enquiries POSTed here are matched to your account by the token in the URL — keep it private.
        </p>
        <label style={S.label}>Your inbound webhook URL</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={webhookUrl || 'Loading…'} style={{ ...S.input, fontFamily: 'monospace', fontSize: 12.5 }} onFocus={e => e.currentTarget.select()} />
          <button onClick={copy} style={{ ...S.btnGhost, whiteSpace: 'nowrap' }}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      {/* Step 2 — credentials */}
      <div style={S.card}>
        <h2 style={S.h2}>2. Your REA API credentials</h2>
        <p style={{ ...S.hint, margin: '0 0 14px' }}>From the REA Portal once you&rsquo;re approved as an uploader. Stored securely and used for listing/enquiry API calls back to REA.</p>

        <label style={S.label}>Client ID</label>
        <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="REA Portal Client ID" style={{ ...S.input, marginBottom: 14 }} />

        <label style={S.label}>API Secret Key</label>
        <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
          placeholder={hasSecret ? `${secretPlaceholder} (leave blank to keep)` : 'REA Portal API Secret Key'} style={{ ...S.input, marginBottom: 14 }} />

        <label style={S.label}>Agency / Office ID <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(optional)</span></label>
        <input value={agencyId} onChange={e => setAgencyId(e.target.value)} placeholder="e.g. XABCD" style={{ ...S.input, marginBottom: 16 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => save()} disabled={busy} style={{ ...S.btn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
          {msg && <span style={{ fontSize: 13, color: msg === 'Saved' ? '#059669' : '#dc2626' }}>{msg}</span>}
        </div>
      </div>

      <p style={{ ...S.hint, lineHeight: 1.6 }}>
        Enquiries appear in the inbox under the <strong>RealEstate</strong> channel, tagged with the listing address. Note: realestate.com.au requires approving Colvy as an integration partner in your portal before enquiries will flow.
      </p>
    </div>
  )
}
