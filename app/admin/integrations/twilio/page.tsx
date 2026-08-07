'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Bring-Your-Own Twilio account, side by side with Telnyx. Twilio's advantage is
// real MMS — customers can send and receive actual photos. Owners enter their
// own Twilio credentials and choose, per channel, which provider is live.
export default function TwilioIntegration() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [smsProvider, setSmsProvider] = useState<'telnyx' | 'twilio'>('telnyx')
  const [voiceProvider, setVoiceProvider] = useState<'telnyx' | 'twilio'>('telnyx')
  const [showVoice, setShowVoice] = useState(false)

  const [form, setForm] = useState({
    account_sid: '', auth_token: '', phone_number: '', messaging_service_sid: '',
    api_key_sid: '', api_key_secret: '', twiml_app_sid: '',
  })
  const [configured, setConfigured] = useState(false)

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
      if (cid) await load(cid)
      setLoading(false)
    }
    init()
  }, [])

  const load = async (cid: string) => {
    try {
      const res = await fetch(`/api/twilio/setup?companyId=${cid}`)
      const d = await res.json()
      setSmsProvider(d.smsProvider === 'twilio' ? 'twilio' : 'telnyx')
      setVoiceProvider(d.voiceProvider === 'twilio' ? 'twilio' : 'telnyx')
      if (d.integration) {
        setConfigured(true)
        setForm({
          account_sid: d.integration.account_sid || '',
          auth_token: d.integration.auth_token || '',
          phone_number: d.integration.phone_number || '',
          messaging_service_sid: d.integration.messaging_service_sid || '',
          api_key_sid: d.integration.api_key_sid || '',
          api_key_secret: d.integration.api_key_secret || '',
          twiml_app_sid: d.integration.twiml_app_sid || '',
        })
        if (d.integration.api_key_sid || d.integration.twiml_app_sid) setShowVoice(true)
      }
    } catch {}
  }

  const saveCreds = async () => {
    if (!companyId) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/twilio/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, isUpdate: configured,
          accountSid: form.account_sid, authToken: form.auth_token,
          phoneNumber: form.phone_number, messagingServiceSid: form.messaging_service_sid,
          apiKeySid: form.api_key_sid, apiKeySecret: form.api_key_secret, twimlAppSid: form.twiml_app_sid,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      setSuccess('Twilio credentials saved and verified.')
      setConfigured(true)
      await load(companyId)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const setProvider = async (channel: 'sms' | 'voice', value: 'telnyx' | 'twilio') => {
    if (!companyId) return
    if (channel === 'sms') setSmsProvider(value); else setVoiceProvider(value)
    setError(''); setSuccess('')
    try {
      const res = await fetch('/api/twilio/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, [channel === 'sms' ? 'smsProvider' : 'voiceProvider']: value }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not switch provider')
      setSuccess(`${channel === 'sms' ? 'SMS' : 'Calls'} now sent via ${value === 'twilio' ? 'Twilio' : 'Telnyx'}.`)
    } catch (e: any) {
      // revert optimistic toggle
      if (channel === 'sms') setSmsProvider(value === 'twilio' ? 'telnyx' : 'twilio')
      else setVoiceProvider(value === 'twilio' ? 'telnyx' : 'twilio')
      setError(e.message)
    }
  }

  const field = (label: string, key: keyof typeof form, placeholder: string, hint?: string, secret?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>{label}</label>
      <input
        type={secret ? 'password' : 'text'} value={(form as any)[key]} placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, fontFamily: 'ui-monospace, monospace', background: '#fff' }}
      />
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{hint}</p>}
    </div>
  )

  const Toggle = ({ channel, value }: { channel: 'sms' | 'voice'; value: 'telnyx' | 'twilio' }) => (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {(['telnyx', 'twilio'] as const).map(p => (
        <button key={p} onClick={() => setProvider(channel, p)}
          style={{ padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: value === p ? 'var(--coral)' : '#fff', color: value === p ? '#fff' : 'var(--slate)' }}>
          {p === 'telnyx' ? 'Telnyx' : 'Twilio'}
        </button>
      ))}
    </div>
  )

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  const webhookBase = typeof window !== 'undefined' ? window.location.origin : 'https://colvy.com'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F22F46', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20 }}>T</div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Twilio</h1>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '2px 0 0' }}>A second SMS/MMS &amp; calling provider, side by side with Telnyx. Twilio carries real picture messages (MMS).</p>
        </div>
        {configured && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '4px 12px', borderRadius: 20 }}>● Connected</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#059669' }}>{success}</div>}

      {/* Provider selection */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 18, background: '#fff' }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Active provider</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>SMS &amp; MMS</div>
            <div style={{ fontSize: 12, color: 'var(--slate)' }}>Who sends and receives text/picture messages.</div>
          </div>
          <Toggle channel="sms" value={smsProvider} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Calls</div>
            <div style={{ fontSize: 12, color: 'var(--slate)' }}>Who handles inbound/outbound calling.</div>
          </div>
          <Toggle channel="voice" value={voiceProvider} />
        </div>
        {(smsProvider === 'twilio' || voiceProvider === 'twilio') && !configured && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 11px' }}>
            Enter your Twilio credentials below before switching a channel to Twilio, or messages/calls will fall back to Telnyx.
          </p>
        )}
      </div>

      {/* Credentials */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 18, background: '#fff' }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Account credentials</p>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--slate)' }}>From your Twilio Console dashboard. We store them encrypted and never expose them to the browser.</p>
        {field('Account SID', 'account_sid', 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')}
        {field('Auth Token', 'auth_token', '••••••••', 'Kept secret; leave the masked value to keep the current token.', true)}
        {field('Phone number', 'phone_number', '+61…', 'The Twilio number customers text/call, in E.164 format.')}
        {field('Messaging Service SID (optional)', 'messaging_service_sid', 'MGxxxxxxxx…', 'Use a Messaging Service sender pool instead of a single number.')}

        <button onClick={() => setShowVoice(v => !v)} style={{ marginTop: 6, fontSize: 12.5, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {showVoice ? '▾' : '▸'} Voice (browser calling) credentials
        </button>
        {showVoice && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)' }}>Needed only for calling. Create an API Key (Console → Account → API keys) and a TwiML App whose Voice URL points at <code>{webhookBase}/api/twilio/voice/outbound</code>.</p>
            {field('API Key SID', 'api_key_sid', 'SKxxxxxxxx…')}
            {field('API Key Secret', 'api_key_secret', '••••••••', 'Shown once by Twilio when you create the key.', true)}
            {field('TwiML App SID', 'twiml_app_sid', 'APxxxxxxxx…')}
          </div>
        )}

        <button onClick={saveCreds} disabled={saving}
          style={{ marginTop: 8, padding: '11px 22px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save & verify'}
        </button>
      </div>

      {/* Webhook setup help */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--ink)' }}>In the Twilio Console, point your number's webhooks here:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>Messaging → “A message comes in”: <code>{webhookBase}/api/twilio/webhook</code> (POST)</li>
          <li>Voice → “A call comes in”: <code>{webhookBase}/api/twilio/voice/inbound</code> (POST)</li>
        </ul>
      </div>
    </div>
  )
}
