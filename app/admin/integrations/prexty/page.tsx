'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useIntegrations } from '@/components/integrations/IntegrationsShell'
import { IntegrationPage, IntegrationHeader, Card, Notice, Icon, btn, inputCls, inputStyle } from '@/components/integrations/ui'

const DEFAULT_BASE = 'https://prexty.com'

export default function PrextyIntegration() {
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE)
  const [showKey, setShowKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [integration, setIntegration] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [testTarget, setTestTarget] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testOk, setTestOk] = useState(false)

  const webhookUrl = integration?.webhook_token && typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/prexty?t=${integration.webhook_token}`
    : ''

  const { companyId: shellCompanyId, ready: shellReady, setActive } = useIntegrations()
  useEffect(() => {
    if (!shellReady) return
    const init = async () => {
      try {
        const cid = shellCompanyId
        if (cid) {
          setCompanyId(cid)
          const res = await fetch(`/api/prexty/setup?companyId=${cid}`)
          const d = await res.json()
          if (d.data) {
            setIntegration(d.data)
            if (d.data.base_url) setBaseUrl(d.data.base_url)
          }
        }
      } catch {}
      setLoading(false)
    }
    init()
  }, [shellReady, shellCompanyId])

  const save = async () => {
    setError(''); setSuccess('')
    if (!companyId) { setError('Could not resolve your company.'); return }
    if (!integration && !apiKey.trim()) { setError('Enter your Prexty API key.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/prexty/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          apiKey: apiKey.trim() || undefined,
          baseUrl: (baseUrl || DEFAULT_BASE).trim(),
          isUpdate: !!integration,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to connect')
      setIntegration(d.data)
      setApiKey('')
      setActive('prexty', true)
      setSuccess('Prexty connected. The API key works.')
    } catch (e: any) {
      setError(e.message || 'Failed to connect')
    } finally {
      setSaving(false)
    }
  }

  const sendTestOrder = async () => {
    if (!webhookUrl) return
    setTestBusy(true); setTestMsg('')
    try {
      const target = testTarget.trim()
      const isEmail = target.includes('@')
      const stamp = Date.now()
      const payload = {
        event: 'order.created',
        id: stamp,
        order_number: `TEST-${String(stamp).slice(-5)}`,
        status: 'completed',
        total: 12.34,
        currency: 'AUD',
        outlet_name: 'Test Outlet',
        customer: {
          name: 'Prexty Test Customer',
          email: isEmail ? target : 'test+prexty@example.com',
          mobile: isEmail ? '' : target,
        },
        items: [{ name: 'Test item', qty: 1, price: 12.34 }],
        created_at: new Date().toISOString(),
      }
      const res = await fetch(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) throw new Error(d.reason || d.error || 'Test failed')
      setTestOk(true); setTestMsg(`Sent test order #${payload.order_number}. Open the inbox to see it arrive.`)
    } catch (e: any) {
      setTestOk(false); setTestMsg(e.message || 'Test failed')
    } finally { setTestBusy(false) }
  }

  const disconnect = async () => {
    if (!companyId || !await confirmDialog('Disconnect Prexty from this company?')) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/prexty/setup?companyId=${companyId}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to disconnect')
      setIntegration(null); setApiKey(''); setBaseUrl(DEFAULT_BASE); setActive('prexty', false)
      setSuccess('Prexty disconnected.')
    } catch (e: any) {
      setError(e.message || 'Failed to disconnect')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <IntegrationPage>
        <IntegrationHeader id="prexty" />
        <div className="bg-white rounded-2xl border p-6 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>Loading…</div>
      </IntegrationPage>
    )
  }

  return (
    <IntegrationPage>
      <IntegrationHeader id="prexty" connected={!!integration?.is_active}
        desc="Pull customers and order history from your Prexty point of sale into the chat." />

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5">
          <Card icon="key" title="External API key"
            sub={<>Create a key in Prexty under <strong style={{ color: 'var(--ink)' }}>External API</strong> and paste it here. Colvy sends it in the <code>X-Prexty</code> header, and it gives access to this business&rsquo;s data.</>}>
            {integration && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--canvas, #f8f8fa)', color: 'var(--slate)' }}>
                <span style={{ color: '#16a34a' }}><Icon name="check" size={15} /></span>
                <span>Connected to <strong style={{ color: 'var(--ink)' }}>{integration.store_name || integration.base_url}</strong>. Paste a new key to replace it.</span>
              </div>
            )}
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>API key</label>
            <div className="flex gap-2 mb-3">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={integration ? '•••••••• (unchanged)' : 'Paste your Prexty API key'} className={inputCls + ' flex-1'} style={inputStyle} />
              <button type="button" onClick={() => setShowKey(v => !v)} {...btn('secondary')} aria-label={showKey ? 'Hide key' : 'Show key'}>
                <Icon name={showKey ? 'eyeOff' : 'eye'} size={15} />
              </button>
            </div>
            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: 'var(--slate)', background: 'none', border: 'none', padding: 0 }}>
              <Icon name={showAdvanced ? 'chevronDown' : 'chevron'} size={13} /> Advanced
            </button>
            {showAdvanced && (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>API base URL</label>
                <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE} className={inputCls} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Only change this if your Prexty runs on a different address. Default: {DEFAULT_BASE}.</p>
              </div>
            )}
            <div className="flex gap-2 mt-5 pt-5 border-t flex-wrap" style={{ borderColor: 'var(--border)' }}>
              <button onClick={save} disabled={saving} {...btn('primary', 'md', 'flex-1')}>
                {saving ? 'Testing…' : integration ? 'Test & save' : 'Connect Prexty'}
              </button>
              {integration && (
                <button onClick={disconnect} disabled={saving} {...btn('danger')}><Icon name="unlink" size={14} /> Disconnect</button>
              )}
            </div>
          </Card>

          <Card icon="info" title="How it works">
            <ul className="space-y-2.5 text-sm" style={{ color: 'var(--slate)', margin: 0, padding: 0, listStyle: 'none' }}>
              {[
                'Colvy checks the key against Prexty’s live customers API.',
                'Each customer’s spend and order history show in their chat.',
                'Add the order webhook to Prexty and new orders land in the right conversation, matched by email or phone, with the outlet shown.',
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5"><span className="mt-0.5" style={{ color: 'var(--coral)' }}><Icon name="check" size={15} /></span><span>{t}</span></li>
              ))}
            </ul>
          </Card>
        </div>

        {integration && webhookUrl ? (
          <Card icon="webhook" title="Order webhook URL"
            sub={<>Give this to Prexty (or your developer). Prexty should <strong style={{ color: 'var(--ink)' }}>POST</strong> each <code>order.*</code> and <code>customer.*</code> event here, and Colvy matches them by email or phone, just like WooCommerce.</>}>
            <div className="flex gap-2">
              <input readOnly value={webhookUrl} onFocus={e => e.currentTarget.select()} className={inputCls + ' flex-1 font-mono'} style={{ ...inputStyle, fontSize: 12.5, background: 'var(--canvas, #f8f8fa)' }} />
              <button type="button" onClick={() => { navigator.clipboard?.writeText(webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} {...btn('secondary')}>
                <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="flex items-start gap-1.5 text-xs mt-2" style={{ color: 'var(--slate)' }}>
              <span className="mt-px"><Icon name="lock" size={12} /></span>
              <span>This address contains a secret token, so treat it like a password. Prexty can also send the <code>X-Prexty</code> key on each call instead.</span>
            </p>

            <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Send a test order</label>
              <p className="text-xs mb-2.5" style={{ color: 'var(--slate)' }}>Posts a sample order to the webhook so you can watch it arrive. Enter a real customer&rsquo;s email or phone to add it to their chat, or leave it blank for a test conversation.</p>
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <input value={testTarget} onChange={e => setTestTarget(e.target.value)} placeholder="Customer email or phone (optional)" className={inputCls + ' flex-1 min-w-0'} style={inputStyle} />
                <button type="button" onClick={sendTestOrder} disabled={testBusy} {...btn('primary', 'md', 'whitespace-nowrap')}>
                  <Icon name="send" size={14} /> {testBusy ? 'Sending…' : 'Send test order'}
                </button>
              </div>
              {testMsg && <p className="text-xs mt-2" style={{ color: testOk ? '#15803d' : '#b42318' }}>{testMsg}</p>}
            </div>
          </Card>
        ) : (
          <Card icon="webhook" title="Order webhook URL">
            <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Connect Prexty first. Then this shows the address to give Prexty so new orders land in the inbox automatically.</p>
          </Card>
        )}
      </div>
    </IntegrationPage>
  )
}
