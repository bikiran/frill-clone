'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useIntegrations } from '@/components/integrations/IntegrationsShell'
import { IntegrationPage, IntegrationHeader, Card, Notice, Icon, btn, inputCls, inputStyle } from '@/components/integrations/ui'

export default function WooCommerceIntegration() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [registeringHooks, setRegisteringHooks] = useState(false)

  // Ask WooCommerce to push order events to Colvy. Without these webhooks, a new
  // order never reaches Colvy and no chat is created — this is the fix for
  // "successful orders are not initiating a chat".
  const registerWebhooks = async () => {
    if (!companyId) return
    setRegisteringHooks(true)
    try {
      const res = await authFetch('/api/woocommerce/register-webhooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      const lines: string[] = []
      for (const s of data.summary || []) {
        if (s.error) { lines.push(`${s.store}: ${s.error}`); continue }
        for (const r of s.results || []) {
          lines.push(`${r.topic}: ${r.action}${r.error ? ' — ' + r.error : ''}`)
        }
      }
      setSuccess('Order → chat: ' + (lines.join(' · ') || 'done'))
    } catch (e: any) {
      setError('Could not register webhooks: ' + e.message)
    } finally {
      setRegisteringHooks(false)
    }
  }
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)

  // Integration status
  const [integration, setIntegration] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [addingStore, setAddingStore] = useState(false)
  const [editing, setEditing] = useState(false)

  const { companyId: shellCompanyId, ready: shellReady, setActive } = useIntegrations()
  useEffect(() => {
    if (!shellReady) return
    const init = async () => {
      const cid = shellCompanyId
      if (!cid) { setError('Company not found. Please sign in and try again.'); setLoading(false); return }
      try {
        setCompanyId(cid)
        setError('')
        await fetchIntegration(cid)
        // If a background sync is already running, resume showing progress
        try {
          const sres = await authFetch(`/api/woocommerce/sync-status?companyId=${cid}`)
          const { job } = await sres.json()
          if (job && job.status === 'running') { setSyncing(true); setSuccess(job.message || 'Syncing…'); pollSyncStatusFor(cid) }
        } catch {}
      } catch (err: any) {
        setError(err.message || 'Failed to load page')
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellReady, shellCompanyId])

  const fetchIntegration = async (cid: string) => {
    try {
      const res = await authFetch(`/api/woocommerce/setup?companyId=${cid}`)
      const result = await res.json()
      setStores(result.stores || [])
      setActive('woocommerce', (result.stores || []).some((x: any) => x.is_active !== false))
      if (result.data) {
        setIntegration(result.data)
        // Pre-populate form fields for editing
        setStoreUrl(result.data.store_url || '')
        // Note: We don't pre-populate secrets for security
      } else {
        setIntegration(null)
        setStoreUrl('')
      }
    } catch (err) {
      console.error('Failed to fetch integration:', err)
      setIntegration(null)
      setStoreUrl('')
    }
  }

  const handleConfigure = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfiguring(true)
    setError('')
    setSuccess('')

    try {
      // Validate company ID
      if (!companyId || companyId.trim() === '') {
        setError('Company not found')
        setConfiguring(false)
        return
      }

      // Validate Store URL is always required
      if (!storeUrl || storeUrl.trim() === '') {
        setError('Store URL is required')
        setConfiguring(false)
        return
      }

      // For new integrations, both keys are required
      // For updates (editing), at least one key should be provided
      const isUpdate = editing && integration
      if (!isUpdate && (!consumerKey || !consumerSecret)) {
        setError('Consumer Key and Secret are required for new integrations')
        setConfiguring(false)
        return
      }

      const res = await authFetch('/api/woocommerce/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: companyId.trim(),
          storeUrl: storeUrl.trim(),
          consumerKey: consumerKey && consumerKey.trim() ? consumerKey.trim() : undefined,
          consumerSecret: consumerSecret && consumerSecret.trim() ? consumerSecret.trim() : undefined,
          isUpdate
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Configuration failed')
        return
      }

      setSuccess(editing ? 'WooCommerce configuration updated!' : 'Store connected successfully!')
      setEditing(false)
      setAddingStore(false)
      setStoreUrl('')
      
      // Wait for integration to be fetched
      await fetchIntegration(companyId)
      
      // Clear form only after fetching new integration data
      setTimeout(() => {
        setConsumerKey('')
        setConsumerSecret('')
      }, 500)
    } catch (err: any) {
      setError(err.message || 'Configuration failed')
    } finally {
      setConfiguring(false)
    }
  }

  const handleSync = async (incremental = false, integrationId?: string, scope?: 'products') => {
    setSyncing(true)
    setError('')
    setSuccess('')
    try {
      // Kick off the background sync job (runs server-side; keeps going even if
      // you close this tab or your laptop).
      const res = await authFetch('/api/woocommerce/sync-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, incremental, integrationId, scope }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start sync')
      setSuccess('Sync started — this runs in the background. You can safely leave this page.')
      pollSyncStatus()
    } catch (err: any) {
      setError(err.message || 'Sync failed')
      setSyncing(false)
    }
  }

  const pollSyncStatus = () => pollSyncStatusFor(companyId)
  const pollSyncStatusFor = (cid: string) => {
    const tick = async () => {
      try {
        const res = await authFetch(`/api/woocommerce/sync-status?companyId=${cid}`)
        const { job } = await res.json()
        if (!job) { setSyncing(false); return }
        if (job.status === 'running') {
          setSuccess(job.message || 'Syncing…')
          setTimeout(tick, 3000)
        } else if (job.status === 'completed') {
          setSuccess(job.message || 'Sync complete')
          setSyncing(false)
          await fetchIntegration(cid)
        } else if (job.status === 'failed') {
          setError(job.error || 'Sync failed')
          setSuccess('')
          setSyncing(false)
        }
      } catch {
        setTimeout(tick, 5000) // network blip — keep polling
      }
    }
    tick()
  }

  const disconnectStore = async (integrationId: string) => {
    if (!await confirmDialog('Remove this store? Its synced customers stay, but it will stop syncing.')) return
    try {
      await authFetch('/api/woocommerce/setup', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, integrationId }),
      })
      if (companyId) await fetchIntegration(companyId)
    } catch (err: any) {
      setError(err.message || 'Failed to remove store')
    }
  }

  const handleDisconnect = async () => {
    if (!await confirmDialog('Are you sure you want to disconnect WooCommerce?')) return

    try {
      const res = await authFetch('/api/woocommerce/setup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      })

      if (res.ok) {
        setSuccess('Disconnected from WooCommerce')
        setIntegration(null); setStores([]); setActive('woocommerce', false)
      } else {
        setError('Failed to disconnect')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    }
  }

  const storeName = (st: any) => st.store_name || (() => { try { return new URL(st.store_url).hostname.replace(/^www\./, '') } catch { return st.store_url } })()
  const showForm = stores.length === 0 || editing || addingStore

  if (loading) {
    return (
      <IntegrationPage>
        <IntegrationHeader id="woocommerce" title="WooCommerce" />
        <div className="bg-white rounded-2xl border p-6 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>Loading your stores…</div>
      </IntegrationPage>
    )
  }

  return (
    <IntegrationPage>
      <IntegrationHeader id="woocommerce" title="WooCommerce" connected={stores.length > 0}
        desc="Sync your store's customers, orders and products into Colvy, and open a chat for every new order." />

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      {showForm ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
          <form onSubmit={handleConfigure}>
            <Card icon="key" title={editing ? 'Update store connection' : addingStore ? 'Add another store' : 'Connect your store'}
              sub={editing ? 'Leave a key blank to keep the one you saved.' : 'Paste your store address and REST API keys.'}
              right={(addingStore || editing) ? (
                <button type="button" onClick={() => { setAddingStore(false); setEditing(false); setStoreUrl(''); setConsumerKey(''); setConsumerSecret('') }} {...btn('secondary', 'sm')}>Cancel</button>
              ) : undefined}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Store URL</label>
                  <input type="url" value={storeUrl} onChange={e => setStoreUrl(e.target.value)} placeholder="https://mystore.com" required className={inputCls} style={inputStyle} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Consumer key{editing ? ' (optional)' : ''}</label>
                    <input type={showSecrets ? 'text' : 'password'} value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="ck_…" required={!editing} className={inputCls} style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Consumer secret{editing ? ' (optional)' : ''}</label>
                    <input type={showSecrets ? 'text' : 'password'} value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder="cs_…" required={!editing} className={inputCls} style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
                  </div>
                </div>
                <button type="button" onClick={() => setShowSecrets(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: 'var(--slate)', background: 'none', border: 'none', padding: 0 }}>
                  <Icon name={showSecrets ? 'eyeOff' : 'eye'} size={14} /> {showSecrets ? 'Hide keys' : 'Show keys'}
                </button>
                <button type="submit" disabled={configuring} {...btn('primary', 'md', 'w-full')}>
                  {configuring ? 'Checking the store…' : editing ? 'Save changes' : 'Connect WooCommerce'}
                </button>
              </div>
            </Card>
          </form>
          <Card icon="info" title="Where to find your API keys">
            <ol className="space-y-3 text-sm" style={{ color: 'var(--slate)', margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {[
                <>In WordPress, open <strong style={{ color: 'var(--ink)' }}>WooCommerce → Settings → Advanced → REST API</strong>.</>,
                <>Click <strong style={{ color: 'var(--ink)' }}>Add key</strong>, name it “Colvy”, and set permissions to <strong style={{ color: 'var(--ink)' }}>Read/Write</strong>.</>,
                <>Copy the <strong style={{ color: 'var(--ink)' }}>consumer key</strong> and <strong style={{ color: 'var(--ink)' }}>consumer secret</strong> into this form.</>,
                <>After connecting, turn on <strong style={{ color: 'var(--ink)' }}>Order → chat</strong> so new orders open a conversation.</>,
              ].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
          <Card icon="store" title={stores.length > 1 ? `Your stores (${stores.length})` : 'Your store'}
            right={<button type="button" onClick={() => { setAddingStore(true); setStoreUrl(''); setEditing(false) }} {...btn('secondary', 'sm')}><Icon name="plus" size={14} /> Add store</button>}>
            <div className="space-y-2.5">
              {stores.map((st: any) => (
                <div key={st.id} className="flex items-center gap-3 p-3 rounded-xl border flex-wrap sm:flex-nowrap" style={{ borderColor: 'var(--border)' }}>
                  <img src="/logos/woocommerce.svg" alt="" width={36} height={36} style={{ width: 36, height: 36 }} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)', margin: 0 }}>{storeName(st)}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--slate)', margin: '2px 0 0' }}>{st.store_url}</p>
                    {st.last_synced_at && <p className="text-xs" style={{ color: 'var(--slate)', margin: '2px 0 0' }}>Last synced {new Date(st.last_synced_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleSync(false, st.id)} disabled={syncing} {...btn('secondary', 'sm')}><Icon name="sync" size={13} /> Sync</button>
                    <button onClick={() => disconnectStore(st.id)} {...btn('danger', 'sm')} aria-label={`Remove ${storeName(st)}`} title="Remove store"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setEditing(true); setConsumerKey(''); setConsumerSecret('') }} {...btn('secondary')}><Icon name="edit" size={14} /> Edit connection</button>
              <button onClick={handleDisconnect} {...btn('danger')}><Icon name="unlink" size={14} /> Disconnect</button>
            </div>
          </Card>

          <Card icon="sync" title="Sync & automation" sub="Syncs run in the background, so you can leave this page.">
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {[
                { icon: 'bolt', title: 'Quick update', desc: 'Customers and orders changed since the last sync. Fast.', label: 'Run', run: () => handleSync(true), busy: syncing, primary: true },
                { icon: 'sync', title: 'Full sync', desc: 'Re-imports every customer and order. Use after a big change in the store.', label: 'Run', run: () => handleSync(false), busy: syncing },
                { icon: 'bag', title: 'Sync products', desc: 'Copies the catalogue so the product picker and Colvy AI can find new products.', label: 'Run', run: () => handleSync(false, undefined, 'products'), busy: syncing },
                { icon: 'chat', title: 'Order → chat', desc: 'WooCommerce tells Colvy about each new order, so a chat opens with a thank-you.', label: registeringHooks ? 'Connecting…' : 'Enable', run: registerWebhooks, busy: registeringHooks },
              ].map(a => (
                <div key={a.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}><Icon name={a.icon} size={17} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)', margin: 0 }}>{a.title}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)', margin: '2px 0 0', lineHeight: 1.45 }}>{a.desc}</p>
                  </div>
                  <button onClick={a.run} disabled={a.busy} {...btn(a.primary ? 'primary' : 'secondary', 'sm', 'shrink-0')}>
                    {a.busy && a.label === 'Run' ? 'Syncing…' : a.label}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </IntegrationPage>
  )
}
