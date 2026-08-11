'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

const DEFAULT_BASE = 'https://prexty.com'

const PrextyLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 10, flexShrink: 0 }}>
    <rect width="256" height="256" rx="48" fill="#4f46e5" />
    <path fill="#fff" d="M84 60h54c31 0 52 20 52 49s-21 49-53 49h-27v38h-26V60zm26 76h24c16 0 26-11 26-27s-10-27-26-27h-24v54z" />
  </svg>
)

export default function PrextyIntegration() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

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

  // Resolve the company the same way the WooCommerce page does: ?slug=, then
  // hostname, then the signed-in user's own/member company.
  useEffect(() => {
    const init = async () => {
      try {
        const sb = supabase as any
        let cid: string | null = null

        if (slug) {
          const { data } = await sb.from('companies').select('id').eq('slug', slug).maybeSingle()
          if (data) cid = data.id
        }
        if (!cid && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const { data } = await sb.from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
            if (data) cid = data.id
          }
        }
        if (!cid) {
          const { data: { session } } = await sb.auth.getSession()
          if (session?.user) {
            const { data: ownCo } = await sb.from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (ownCo?.id) cid = ownCo.id
            else {
              const { data: memberships } = await sb.from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (memberships && memberships.length > 0) cid = memberships[0].company_id
            }
          }
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

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
      setSuccess('Prexty connected — the API key is valid.')
    } catch (e: any) {
      setError(e.message || 'Failed to connect')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    if (!companyId || !confirm('Disconnect Prexty from this company?')) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/prexty/setup?companyId=${companyId}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to disconnect')
      setIntegration(null); setApiKey(''); setBaseUrl(DEFAULT_BASE)
      setSuccess('Prexty disconnected.')
    } catch (e: any) {
      setError(e.message || 'Failed to disconnect')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="px-6 py-8" style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div className="px-6 py-8 max-w-2xl">
      <button onClick={() => router.push(`/admin/integrations?slug=${slug}`)} className="flex items-center gap-2 text-sm mb-6 cursor-pointer hover:opacity-70" style={{ color: 'var(--slate)' }}>
        ← All Integrations
      </button>

      <div className="flex items-center gap-4 mb-6">
        <PrextyLogo size={56} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Prexty POS</h1>
          <p style={{ color: 'var(--slate)' }}>Connect your Prexty store to pull customers and order history into the chat.</p>
        </div>
        {integration?.is_active && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>Connected</span>
        )}
      </div>

      <div className="bg-white rounded-2xl border p-6 mb-4" style={{ borderColor: 'var(--border)' }}>
        <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>External API key</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
          Generate a key in Prexty under <strong>External API</strong>, then paste it here. It's sent in the <code>X-Prexty</code> header on every request and grants access to this business's data.
        </p>

        {integration && (
          <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>
            Connected to <strong style={{ color: 'var(--ink)' }}>{integration.store_name || integration.base_url}</strong>. Paste a new key below to replace it, or disconnect.
          </div>
        )}

        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>API Key</label>
        <div className="flex gap-2 mb-3">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={integration ? '•••••••• (unchanged)' : 'Paste your Prexty API key'}
            className="flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
          />
          <button type="button" onClick={() => setShowKey(v => !v)}
            className="px-3 rounded-xl border text-sm cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-xs cursor-pointer hover:underline mb-2" style={{ color: 'var(--slate)' }}>
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>
        {showAdvanced && (
          <div className="mb-2">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>API base URL</label>
            <input
              type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_BASE}
              className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Only change this if your Prexty instance is on a different host. Defaults to {DEFAULT_BASE}.</p>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{error}</div>}
      {success && <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>{success}</div>}

      <div className="flex gap-3">
        <button onClick={save} disabled={saving}
          className="flex-1 py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50 transition-all"
          style={{ background: 'var(--coral)' }}>
          {saving ? 'Testing…' : integration ? 'Test & Save' : 'Connect Prexty'}
        </button>
        {integration && (
          <button onClick={disconnect} disabled={saving}
            className="px-5 py-3 rounded-xl font-semibold cursor-pointer disabled:opacity-50 border"
            style={{ borderColor: '#fecaca', color: '#dc2626', background: '#fff' }}>
            Disconnect
          </button>
        )}
      </div>

      <div className="mt-6 p-4 rounded-xl text-sm" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>
        <strong style={{ color: 'var(--ink)' }}>What's next:</strong> once connected, this verifies against Prexty's live <code>customers</code> API. Pulling order history into the customer's chat (matched by email/phone, with each order's outlet shown) turns on as soon as Prexty's <code>orders</code> endpoint is available.
      </div>
    </div>
  )
}
