'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmt = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

const TYPE_LABEL: Record<string, string> = {
  product: 'Product', image: 'Image', help: 'Help article', form: 'Form',
  checkout: 'Checkout', external: 'Website', booking: 'Booking', payment: 'Payment',
}

export default function LinksGeneratorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [links, setLinks] = useState<any[]>([])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; target: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = null
        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        await loadLinks(cid)
      } finally { setLoading(false) }
    })()
  }, [])

  const loadLinks = async (cid: string) => {
    const { data } = await (supabase as any).from('short_links')
      .select('*').eq('company_id', cid)
      .order('created_at', { ascending: false }).limit(200)
    setLinks(data || [])
  }

  const create = async () => {
    if (!url.trim() || !companyId) return
    setBusy(true); setError(''); setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, kind: 'redirect', url: url.trim(),
          label: label.trim() || undefined,
          customCode: customCode.trim() || undefined,
          sentBy: session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not create the link')
      setResult({ url: d.url, target: d.target || url.trim() })
      setUrl(''); setLabel(''); setCustomCode('')
      await loadLinks(companyId)
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(''), 1800)
    } catch { /* clipboard blocked — the text is selectable anyway */ }
  }

  const visible = links.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return [l.target_url, l.label, l.code].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  const shortUrlFor = (l: any) => {
    if (typeof window === 'undefined') return `/l/${l.code}`
    const path = (l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'
    return `${window.location.origin}/${path}/${l.code}`
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 18 }
  const input: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }
  const label_: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 6 }

  if (loading) return <SkeletonList rows={5} />

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Create Short URL</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 0' }}>
          Create a short link that redirects to your original URL for easier sharing — and records
          every click so you can see what people opened.
        </p>
      </div>

      {/* Creator */}
      <div style={{ ...card, marginBottom: 18 }}>
        <label style={label_}>Paste URL</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            placeholder="https://roxyaquarium.com.au/product/..."
            style={{ ...input, flex: 1, minWidth: 240 }} />
          <button onClick={create} disabled={busy || !url.trim()}
            style={{ padding: '11px 22px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy || !url.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {busy ? 'Shortening…' : 'Shorten'}
          </button>
        </div>

        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          style={{ marginTop: 10, border: 'none', background: 'none', padding: 0, color: 'var(--slate)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          {showAdvanced ? '− Fewer options' : '+ Add a label or custom code'}
        </button>

        {showAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div>
              <label style={label_}>Label (for your reference)</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="Weekend sale" style={input} />
            </div>
            <div>
              <label style={label_}>Custom code (optional)</label>
              <input value={customCode} onChange={e => setCustomCode(e.target.value)}
                placeholder="weekend-sale" style={input} />
            </div>
          </div>
        )}

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
        )}

        {result && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 11, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Your short link
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ flex: 1, minWidth: 200, fontSize: 15, fontWeight: 700, color: '#166534', wordBreak: 'break-all' }}>
                {result.url}
              </code>
              <button onClick={() => copy(result.url, 'new')}
                style={{ padding: '8px 16px', borderRadius: 9, background: '#15803d', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied === 'new' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#166534', wordBreak: 'break-all' }}>
              → {result.target}
            </p>
          </div>
        )}
      </div>

      {/* Existing links */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Your links</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links…"
            style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
          <button onClick={() => router.push('/admin/link-reports')}
            style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--slate)', whiteSpace: 'nowrap' }}>
            Full reports
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
        {visible.length === 0 && (
          <p style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5, margin: 0 }}>
            {links.length === 0 ? 'No links yet — shorten one above.' : 'No links match that search.'}
          </p>
        )}
        {visible.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--coral)' }}>/{(l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'}/{l.code}</code>
                {l.link_type && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--canvas)', color: 'var(--slate)' }}>
                    {TYPE_LABEL[l.link_type] || l.link_type}
                  </span>
                )}
              </div>
              {l.label && l.label !== 'Link' && (
                <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>{l.label}</div>
              )}
              <div style={{ fontSize: 11.5, color: '#9ca3af', wordBreak: 'break-all', marginTop: 2 }}>{l.target_url}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: l.clicks ? '#059669' : '#d1d5db' }}>{l.clicks || 0}</div>
              <div style={{ fontSize: 10.5, color: 'var(--slate)' }}>clicks</div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)', minWidth: 90 }}>{fmt(l.created_at)}</div>
            <button onClick={() => copy(shortUrlFor(l), l.id)}
              style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: copied === l.id ? '#15803d' : 'var(--slate)' }}>
              {copied === l.id ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
