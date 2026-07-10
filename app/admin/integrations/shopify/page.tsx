'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ShopifyIntegrationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addingStore, setAddingStore] = useState(false)
  const [storeDomain, setStoreDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/signin'); return }
      let cid: string | null = null
      if (slug) {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        cid = co?.id || null
      }
      if (!cid) {
        const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        cid = ownCo?.id || null
      }
      setCompanyId(cid)
      if (cid) await loadStores(cid)
      setLoading(false)
    }
    init()
  }, [slug])

  const loadStores = async (cid: string) => {
    try {
      const res = await fetch(`/api/shopify/setup?companyId=${cid}`)
      const data = await res.json()
      setStores(data.stores || [])
    } catch {}
  }

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setConnecting(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/shopify/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, storeDomain, accessToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not connect')
      setSuccess('Shopify store connected!')
      setStoreDomain(''); setAccessToken(''); setAddingStore(false)
      await loadStores(companyId)
    } catch (e: any) { setError(e.message) } finally { setConnecting(false) }
  }

  const syncStore = async (integrationId: string) => {
    if (!companyId) return
    setSyncing(integrationId); setError(''); setSuccess('')
    try {
      // Loop until the sync reports done (cursor-based, budgeted per call)
      let done = false, guard = 0
      while (!done && guard < 40) {
        const res = await fetch('/api/shopify/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, integrationId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Sync failed')
        done = data.done
        guard++
        if (!done) setSuccess(`Synced ${data.synced} customers so far…`)
      }
      setSuccess('Sync complete!')
      await loadStores(companyId)
    } catch (e: any) { setError(e.message) } finally { setSyncing(null) }
  }

  const removeStore = async (integrationId: string) => {
    if (!companyId) return
    if (!confirm('Remove this Shopify store? Synced customers stay, but it stops syncing.')) return
    try {
      await fetch('/api/shopify/setup', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, integrationId }),
      })
      await loadStores(companyId)
    } catch (e: any) { setError(e.message) }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <button onClick={() => router.push(`/admin/integrations${slug ? `?slug=${slug}` : ''}`)}
        style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← Back to integrations</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#95BF47', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🛒</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Shopify</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>Sync your Shopify customers into Colvy</p>
        </div>
        {stores.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '4px 12px', borderRadius: 20 }}>● {stores.length} store{stores.length > 1 ? 's' : ''}</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#059669' }}>{success}</div>}

      {(stores.length === 0 || addingStore) ? (
        <form onSubmit={connect} style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 24, background: '#fff' }}>
          {addingStore && <button type="button" onClick={() => setAddingStore(false)} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}>← Back to my stores</button>}
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--ink)' }}>{addingStore ? 'Add another store' : 'Connect your Shopify store'}</h2>

          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--ink)' }}>How to get your access token:</strong>
            <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>In Shopify admin, go to <strong>Settings → Apps and sales channels → Develop apps</strong>.</li>
              <li>Click <strong>Create an app</strong>, name it "Colvy".</li>
              <li>Under <strong>Configuration → Admin API</strong>, grant <strong>read_customers</strong> (and <strong>read_orders</strong> if you want order totals).</li>
              <li>Click <strong>Install app</strong>, then copy the <strong>Admin API access token</strong> (starts with <code>shpat_</code>).</li>
            </ol>
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Store domain</label>
          <input value={storeDomain} onChange={e => setStoreDomain(e.target.value)} placeholder="your-store.myshopify.com" required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }} />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Admin API access token</label>
          <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="shpat_…" required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 18 }} />

          <button type="submit" disabled={connecting}
            style={{ padding: '11px 20px', borderRadius: 10, background: '#95BF47', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: connecting ? 0.7 : 1 }}>
            {connecting ? 'Connecting…' : 'Connect store'}
          </button>
        </form>
      ) : (
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 24, background: 'var(--canvas)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>✓ Connected {stores.length > 1 ? `— ${stores.length} stores` : ''}</h2>
            <button onClick={() => { setAddingStore(true); setStoreDomain(''); setAccessToken('') }}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #95BF47', background: '#fff', color: '#5c8a1b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add another store</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stores.map((s: any) => (
              <div key={s.id} style={{ padding: '14px 16px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>🛒 {s.store_name || s.store_domain}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{s.store_domain}</p>
                    {s.last_synced_at && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#999' }}>Last synced {new Date(s.last_synced_at).toLocaleString()}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => syncStore(s.id)} disabled={syncing === s.id}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #95BF47', background: '#eefbe0', color: '#5c8a1b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {syncing === s.id ? 'Syncing…' : 'Sync'}
                    </button>
                    <button onClick={() => removeStore(s.id)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
