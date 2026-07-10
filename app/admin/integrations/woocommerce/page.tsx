'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const WooLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 10, flexShrink: 0 }}>
    <rect width="256" height="256" rx="48" fill="#7f54b3" />
    <path fill="#fff" d="M37 86c3.5-8 11-13 20-13 13 0 20 9 22 25 3 22 5 39 7 55 6-12 12-25 17-38 6-14 10-27 12-36 2-8 7-13 15-13 10 0 17 6 18 16 1 6 3 18 6 33 2 14 5 26 7 37 3-17 7-35 12-55 4-16 8-26 12-31 4-4 9-6 15-6 6 1 11 3 14 8 3 4 4 9 3 15 0 4-2 10-4 18-6 22-12 44-17 66-3 13-6 22-9 28-4 7-9 10-16 10-6 0-11-3-14-8-2-4-4-10-6-19-3-16-6-32-9-49-8 18-15 33-21 45-7 15-12 24-16 27-4 4-9 5-14 4-6-1-10-5-12-11-2-5-4-14-6-27-3-22-6-44-8-66-1-6 0-11 2-15z"/>
  </svg>
)

export default function WooCommerceIntegration() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [supabase, setSupabase] = useState<any>(null)
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)

  // Integration status
  const [integration, setIntegration] = useState<any>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        // Lazy load Supabase client
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        )
        setSupabase(sb)

        let companyId: string | null = null
        let companySlug = slug

        // Strategy 1: slug from the ?slug= query param
        if (companySlug) {
          const { data: company } = await sb
            .from('companies')
            .select('id')
            .eq('slug', companySlug)
            .maybeSingle()

          if (company) {
            companyId = company.id
          }
        }

        // Strategy 2: slug from the hostname (e.g. funnynepal.colvy.com)
        if (!companyId && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const hostSlug = h.replace('.colvy.com', '')
            const { data: coByHost } = await sb
              .from('companies')
              .select('id')
              .eq('slug', hostSlug)
              .maybeSingle()
            if (coByHost) companyId = coByHost.id
          }
        }

        // Strategy 3: the signed-in user's own company (owner_id)
        if (!companyId) {
          const { data: { session } } = await sb.auth.getSession()

          if (session?.user) {
            const { data: ownCo } = await sb
              .from('companies')
              .select('id')
              .eq('owner_id', session.user.id)
              .maybeSingle()
            if (ownCo?.id) {
              companyId = ownCo.id
            } else {
              // Strategy 4: team membership — array query with .length check,
              // never .single() (throws when the user has no membership rows)
              const { data: memberships } = await sb
                .from('team_members')
                .select('company_id')
                .eq('user_id', session.user.id)
                .limit(1)

              if (memberships && memberships.length > 0 && memberships[0].company_id) {
                companyId = memberships[0].company_id
              }
            }
          }
        }

        if (!companyId) {
          setError('Company not found. Please sign in and try again.')
          setLoading(false)
          return
        }

        setCompanyId(companyId)
        setError('')  // Clear any previous errors
        await fetchIntegration(companyId)
        // If a background sync is already running, resume showing progress
        try {
          const sres = await fetch(`/api/woocommerce/sync-status?companyId=${companyId}`)
          const { job } = await sres.json()
          if (job && job.status === 'running') { setSyncing(true); setSuccess(job.message || 'Syncing…'); pollSyncStatusFor(companyId) }
        } catch {}
        // Done loading — this was missing, leaving the page stuck on
        // "Loading WooCommerce integration..." forever on the success path
        setLoading(false)
      } catch (err: any) {
        console.error('Init error:', err)
        setError(err.message || 'Failed to load page')
        setLoading(false)
      }
    }

    init()
  }, [slug])

  const fetchIntegration = async (cid: string) => {
    try {
      const res = await fetch(`/api/woocommerce/setup?companyId=${cid}`)
      const result = await res.json()
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

      const res = await fetch('/api/woocommerce/setup', {
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

      setSuccess(editing ? 'WooCommerce configuration updated!' : 'WooCommerce integration configured successfully!')
      setEditing(false)
      
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

  const handleSync = async (incremental = false) => {
    setSyncing(true)
    setError('')
    setSuccess('')
    try {
      // Kick off the background sync job (runs server-side; keeps going even if
      // you close this tab or your laptop).
      const res = await fetch('/api/woocommerce/sync-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, incremental }),
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
        const res = await fetch(`/api/woocommerce/sync-status?companyId=${cid}`)
        const { job } = await res.json()
        if (!job) { setSyncing(false); return }
        if (job.status === 'running') {
          setSuccess(job.message || 'Syncing…')
          setTimeout(tick, 3000)
        } else if (job.status === 'completed') {
          setSuccess(`✓ ${job.message || 'Sync complete'}`)
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

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect WooCommerce?')) return

    try {
      const res = await fetch('/api/woocommerce/setup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      })

      if (res.ok) {
        setSuccess('Disconnected from WooCommerce')
        setIntegration(null)
      } else {
        setError('Failed to disconnect')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: 12, color: '#666' }}>
        <WooLogo size={32} />
        Loading WooCommerce integration...
      </div>
    )
  }

  if (!companyId && error) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '8px' }}>
          <WooLogo size={36} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            WooCommerce Integration
          </h1>
        </div>
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '13px'
        }}>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '8px' }}>
        <WooLogo size={44} />
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
            WooCommerce Integration
          </h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: 2 }}>
            Connect your WooCommerce store to sync customer data, orders, and purchase history.
          </p>
        </div>
      </div>
      <div style={{ marginBottom: '24px' }} />

      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#fee2e2',
          color: '#991b1b',
          marginBottom: '16px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#dcfce7',
          color: '#166534',
          marginBottom: '16px',
          fontSize: '13px'
        }}>
          ✓ {success}
        </div>
      )}

      {(!integration || editing) ? (
        <form onSubmit={handleConfigure} style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '24px',
          background: '#fff'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
            {editing ? 'Update WooCommerce Configuration' : 'Configure WooCommerce'}
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--ink)' }}>
              Store URL
            </label>
            <input
              type="url"
              value={storeUrl}
              onChange={e => setStoreUrl(e.target.value)}
              placeholder="https://mystore.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Your WooCommerce store URL (without trailing slash)
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--ink)' }}>
              Consumer Key {editing ? '(optional)' : ''}
            </label>
            <input
              type={showSecrets ? 'text' : 'password'}
              value={consumerKey}
              onChange={e => setConsumerKey(e.target.value)}
              placeholder="ck_..."
              required={!editing}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontFamily: 'monospace'
              }}
            />
            {editing && (
              <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Leave blank to keep existing value
              </p>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--ink)' }}>
              Consumer Secret {editing ? '(optional)' : ''}
            </label>
            <input
              type={showSecrets ? 'text' : 'password'}
              value={consumerSecret}
              onChange={e => setConsumerSecret(e.target.value)}
              placeholder="cs_..."
              required={!editing}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontFamily: 'monospace'
              }}
            />
            {editing && (
              <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Leave blank to keep existing value
              </p>
            )}
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            marginBottom: '24px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={e => setShowSecrets(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show API keys
          </label>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={configuring}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--coral)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: configuring ? 'default' : 'pointer',
                opacity: configuring ? 0.6 : 1
              }}
            >
              {configuring ? 'Configuring...' : editing ? 'Update Configuration' : 'Connect WooCommerce'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setStoreUrl(integration.store_url || '')
                  setConsumerKey('')
                  setConsumerSecret('')
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: '#fff',
                  color: 'var(--slate)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <p style={{ fontSize: '12px', color: '#999', marginTop: '16px', lineHeight: 1.5 }}>
            💡 Get your API keys from WooCommerce: Settings → Advanced → REST API
          </p>
        </form>
      ) : (
        <div style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '24px',
          background: 'var(--peach)'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
            ✓ Connected to WooCommerce
          </h2>

          <div style={{
            padding: '16px',
            background: '#fff',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Store URL</p>
            <p style={{ margin: '0', fontSize: '13px', fontWeight: 500, color: 'var(--ink)' }}>
              {integration.store_url}
            </p>

            {integration.last_synced_at && (
              <>
                <p style={{ margin: '12px 0 8px 0', fontSize: '12px', color: '#666' }}>Last Synced</p>
                <p style={{ margin: '0', fontSize: '13px', color: 'var(--ink)' }}>
                  {new Date(integration.last_synced_at).toLocaleString()}
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--coral)',
                background: '#fff',
                color: 'var(--coral)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: syncing ? 'default' : 'pointer',
                opacity: syncing ? 0.6 : 1
              }}
            >
              {syncing ? 'Syncing...' : '🔄 Full Sync'}
            </button>

            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              title="Only fetch customers and orders changed since your last sync — much faster."
              style={{
                flex: 1, minWidth: '120px', padding: '10px 16px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--coral)', color: '#fff',
                fontSize: '13px', fontWeight: 600, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1,
              }}
            >
              ⚡ Quick Update
            </button>

            <button
              onClick={() => {
                setEditing(true)
                setConsumerKey('')
                setConsumerSecret('')
              }}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                background: '#fff',
                color: '#666',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ✎ Edit Configuration
            </button>

            <button
              onClick={handleDisconnect}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#fff',
                color: '#dc2626',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
