'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { useRouter } from 'next/navigation'

// Create an additional workspace for an already-logged-in user.
// Unlike signup, we don't need email/password — just company name + URL.
export default function NewWorkspacePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [industry, setIndustry] = useState('saas')
  const [accentColor, setAccentColor] = useState('#ff7a6b')
  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    if (!companyName) { setSlug(''); setSlugStatus('idle'); return }
    const auto = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    if (auto.length >= 3) setSlug(auto)
  }, [companyName])

  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (!isValidSlug(slug)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const ok = await isSlugAvailable(slug)
      setSlugStatus(ok ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(t)
  }, [slug])

  const handleCreate = async () => {
    setError('')
    if (!companyName.trim()) { setError('Company name is required'); return }
    if (slugStatus !== 'available') { setError('Please choose a valid, available board URL'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, slug: slug.toLowerCase(), name: companyName.trim(), industry, accentColor }),
      })
      const result = await res.json()
      if (result.error && !result.error.includes('duplicate')) throw new Error(result.error)

      // Register subdomain in Vercel so slug.colvy.com works immediately
      try {
        await fetch('/api/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: `${slug.toLowerCase()}.colvy.com` }),
        })
      } catch {}

      // Redirect to the new workspace admin
      const hostname = window.location.hostname
      const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
      if (!isLocal) {
        window.location.href = `https://${slug.toLowerCase()}.colvy.com/admin`
      } else {
        router.push('/admin')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace')
      setLoading(false)
    }
  }

  const slugColor: any = { idle: 'var(--slate)', checking: '#f59e0b', available: '#10b981', taken: '#ef4444', invalid: '#ef4444' }
  const slugMsg: any = { idle: '', checking: 'Checking…', available: '✓ Available', taken: '✗ Already taken', invalid: '✗ Use lowercase letters, numbers, hyphens (3–30 chars)' }
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <button onClick={() => router.back()} style={{ fontSize: 13, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, padding: 0 }}>← Back</button>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Create a new workspace</h1>
      <p style={{ fontSize: 15, color: 'var(--slate)', margin: '0 0 32px' }}>Spin up another feedback board under your account. You'll be the owner.</p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626' }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Company / workspace name</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." style={inp} autoFocus />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Board URL</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="acme"
              style={{ ...inp, borderRadius: '12px 0 0 12px', borderRight: 'none' }} />
            <span style={{ padding: '12px 14px', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: '0 12px 12px 0', fontSize: 15, color: 'var(--slate)', whiteSpace: 'nowrap' }}>.colvy.com</span>
          </div>
          {slugMsg[slugStatus] && <p style={{ margin: '6px 0 0', fontSize: 12, color: slugColor[slugStatus], fontWeight: 600 }}>{slugMsg[slugStatus]}</p>}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Industry</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)} style={inp}>
            {['saas', 'ecommerce', 'healthcare', 'education', 'finance', 'other'].map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Brand color</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: 48, height: 42, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
            <span style={{ fontSize: 14, color: 'var(--slate)' }}>{accentColor}</span>
          </div>
        </div>

        <button onClick={handleCreate} disabled={loading || slugStatus !== 'available'}
          style={{ padding: '14px 0', borderRadius: 12, background: slugStatus === 'available' ? 'var(--coral)' : '#e5e7eb', color: slugStatus === 'available' ? '#fff' : '#9ca3af', border: 'none', fontSize: 15, fontWeight: 700, cursor: slugStatus === 'available' && !loading ? 'pointer' : 'default', marginTop: 8 }}>
          {loading ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </div>
  )
}
