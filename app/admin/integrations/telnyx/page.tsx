'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function TelnyxIntegration() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [integration, setIntegration] = useState<any>(null)
  const [editing, setEditing] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [messagingProfileId, setMessagingProfileId] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [outboundVoiceProfileId, setOutboundVoiceProfileId] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }
      let cid: string | null = null
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (co) cid = co.id
      }
      if (!cid) {
        const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        if (ownCo) cid = ownCo.id
      }
      setCompanyId(cid)
      if (cid) await loadIntegration(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadIntegration = async (cid: string) => {
    try {
      const res = await fetch(`/api/telnyx/setup?companyId=${cid}`)
      const data = await res.json()
      if (data.integration) {
        setIntegration(data.integration)
        setApiKey(data.integration.api_key || '')
        setPhoneNumber(data.integration.phone_number || '')
        setMessagingProfileId(data.integration.messaging_profile_id || '')
        setConnectionId(data.integration.connection_id || '')
        setOutboundVoiceProfileId(data.integration.outbound_voice_profile_id || '')
      } else {
        setEditing(true)
      }
    } catch {}
  }

  const save = async () => {
    if (!companyId) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/telnyx/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, apiKey, phoneNumber, messagingProfileId, connectionId, outboundVoiceProfileId,
          isUpdate: !!integration,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSuccess('Telnyx connected successfully!')
      setEditing(false)
      await loadIntegration(companyId)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname.includes('localhost') ? window.location.host : 'colvy.com'}/api/telnyx/webhook`
    : ''

  const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }
  const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--slate)', margin: '4px 0 0' }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#00c08b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20 }}>T</div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Telnyx — Voice & SMS</h1>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '2px 0 0' }}>Browser calling and SMS continuation of live chat.</p>
        </div>
        {integration?.is_active && !editing && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '4px 12px', borderRadius: 20 }}>● Connected</span>
        )}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#059669' }}>{success}</div>}

      {!editing && integration ? (
        <div style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="API Key" value={integration.api_key} />
            <Field label="Phone Number" value={integration.phone_number} />
            <Field label="Messaging Profile" value={integration.messaging_profile_id || '—'} />
            <Field label="Voice Connection" value={integration.connection_id || '—'} />
          </div>
          <button onClick={() => setEditing(true)}
            style={{ marginTop: 18, padding: '10px 18px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
            Edit configuration
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={label}>Telnyx API Key (V2)</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="KEYxxxxxxxxxxxxxxxxxxxxxxxx" style={inp} />
            <p style={hint}>Telnyx Portal → API Keys → Create API Key. Stored encrypted, server-side only.</p>
          </div>
          <div>
            <label style={label}>Your Telnyx Phone Number</label>
            <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+61XXXXXXXXX" style={inp} />
            <p style={hint}>In E.164 format. Buy an Australian local or mobile number in the Telnyx Portal → Numbers.</p>
          </div>
          <div>
            <label style={label}>Messaging Profile ID <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(for SMS)</span></label>
            <input value={messagingProfileId} onChange={e => setMessagingProfileId(e.target.value)} placeholder="Optional — Messaging → Messaging Profiles" style={inp} />
          </div>
          <div>
            <label style={label}>Voice Connection ID <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(for browser calling)</span></label>
            <input value={connectionId} onChange={e => setConnectionId(e.target.value)} placeholder="Credential Connection ID — Voice → Connections" style={inp} />
            <p style={hint}>Create a <strong>Credential Connection</strong> in Telnyx for WebRTC browser calls, and assign your number's outbound voice profile to it.</p>
          </div>
          <div>
            <label style={label}>Outbound Voice Profile ID <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(optional)</span></label>
            <input value={outboundVoiceProfileId} onChange={e => setOutboundVoiceProfileId(e.target.value)} placeholder="Voice → Outbound Voice Profiles" style={inp} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '12px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Verifying…' : 'Save & connect'}
            </button>
            {integration && (
              <button onClick={() => setEditing(false)} style={{ padding: '12px 24px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--slate)' }}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* Webhook setup */}
      <div style={{ marginTop: 28, padding: 18, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Webhook URL</h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--slate)' }}>
          Paste this into your Telnyx <strong>Messaging Profile</strong> (inbound SMS) and <strong>Voice Connection</strong> (call events):
        </p>
        <code style={{ display: 'block', padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink)', wordBreak: 'break-all' }}>{webhookUrl}</code>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', wordBreak: 'break-all' }}>{value}</p>
    </div>
  )
}
