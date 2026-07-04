'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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
        if (!slug) {
          setError('Company not found. Missing slug in URL.')
          setLoading(false)
          return
        }

        // Lazy load Supabase client
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        )
        setSupabase(sb)

        const { data: company, error: companyError } = await sb
          .from('companies')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()

        if (companyError) {
          console.error('Company lookup error:', companyError)
          setError(`Failed to load company: ${companyError.message}`)
          setLoading(false)
          return
        }

        if (!company) {
          setError(`Company not found with slug: ${slug}`)
          setLoading(false)
          return
        }

        setCompanyId(company.id)
        await fetchIntegration(company.id)
      } catch (err: any) {
        console.error('Init error:', err)
        setError(err.message || 'Failed to load page')
      } finally {
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

  const handleSync = async () => {
    setSyncing(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/woocommerce/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Sync failed')
        return
      }

      setSuccess(`Synced ${data.syncedCount} customers from WooCommerce`)
      await fetchIntegration(companyId)
    } catch (err: any) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
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
    return <div style={{ padding: '24px', color: '#666' }}>Loading...</div>
  }

  if (!companyId) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
          WooCommerce Integration
        </h1>
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '13px'
        }}>
          {error || 'Company not found. Make sure you have the correct URL with company slug.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
        WooCommerce Integration
      </h1>
      <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>
        Connect your WooCommerce store to sync customer data, orders, and purchase history.
      </p>

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
              onClick={handleSync}
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
              {syncing ? 'Syncing...' : '🔄 Sync Now'}
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
