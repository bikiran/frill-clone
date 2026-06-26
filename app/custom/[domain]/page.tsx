'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CategorySVG({ cat, size = 15 }: { cat: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (cat === 'Getting Started') return <svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
  if (cat === 'Features') return <svg {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
  if (cat === 'Billing') return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  if (cat === 'Integrations') return <svg {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  if (cat === 'Troubleshooting') return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  if (cat === 'API') return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  if (cat === 'All') return <svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}

export default function CustomDomainPage() {
  const params = useParams()
  const hostname = (params?.domain as string)?.replace(/__/g, '.')
  const [company, setCompany] = useState<any>(null)
  const [isHelp, setIsHelp] = useState(false)
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')

  useEffect(() => {
    if (!hostname) return
    ;(async () => {
      let co: any = null
      let help = false

      const { data: h } = await (supabase as any).from('companies').select('*').eq('help_domain', hostname).maybeSingle()
      if (h) { co = h; help = true }

      if (!co) {
        const { data: b } = await (supabase as any).from('companies').select('*').eq('board_domain', hostname).maybeSingle()
        if (b) { co = b; help = false }
      }

      if (!co) {
        const parts = hostname.split('.')
        const slug = parts.length >= 2 ? parts[parts.length - 2] : ''
        if (slug) {
          const { data: s } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
          if (s) { co = s; help = hostname.startsWith('help.') }
        }
      }

      if (!co) { setLoading(false); return }

      if (co.accent_color) {
        document.documentElement.style.setProperty('--coral', co.accent_color)
        document.documentElement.style.setProperty('--peach', co.accent_color + '15')
      }

      setCompany(co)
      setIsHelp(help)

      if (help) {
        const { data: arts } = await (supabase as any)
          .from('help_articles').select('*')
          .eq('company_id', co.id)
          .order('created_at', { ascending: false })
        setArticles(arts || [])
      }
      setLoading(false)
    })()
  }, [hostname])

  const accent = company?.accent_color || '#ff7a6b'
  const boardUrl = company ? `https://${company.slug}.colvy.com` : '#'
  // For nav links: stay on the custom domain if we're on one
  const currentBase = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : boardUrl

  // Derived state
  const cats = ['All', ...Array.from(new Set(articles.map(a => a.category).filter(Boolean)))]
  const featured = articles.filter(a => a.featured).slice(0, 3)
  const filtered = articles
    .filter(a => catFilter === 'All' || a.category === catFilter)
    .filter(a => !search || a.title?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 32, height: 32, border: `2px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!company) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, background: '#fafafa' }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", opacity: 0.3 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--slate, #6b6b70)" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#0d0d0d' }}>Domain not configured</h1>
      <p style={{ color: '#6b7280', marginBottom: 8 }}>No board found for <strong>{hostname}</strong></p>
      <p style={{ fontSize: 13, color: '#9ca3af' }}>Go to Admin → Settings → White Labeling to set up your custom domain.</p>
    </div>
  )

  // Shared nav header component
  const navLinks = [
    { label: 'Ideas', href: `${currentBase}/` },
    { label: 'Roadmap', href: `${currentBase}/roadmap` },
    { label: 'Updates', href: `${currentBase}/announcements` },
    { label: 'Help', href: `${currentBase}/help`, active: isHelp },
  ]

  const NavHeader = (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {company.logo_url
            ? <img src={company.logo_url} alt={company.name} style={{ height: 28 }} />
            : <div style={{ width: 32, height: 32, borderRadius: 10, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>{company.name?.[0]?.toUpperCase()}</div>}
          <span style={{ fontWeight: 700, fontSize: 16, color: '#0d0d0d' }}>{company.name}</span>
        </div>
        <nav style={{ display: 'flex', gap: 4 }}>
          {navLinks.map(n => (
            <a key={n.label} href={n.href} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 14, fontWeight: n.active ? 600 : 400, color: n.active ? accent : '#6b7280', background: n.active ? accent + '15' : 'transparent', textDecoration: 'none' }}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )

  // Board domain → simple redirect page
  if (!isHelp) return (
    <div style={{ background: '#fafafa', minHeight: '100vh' }}>
      {NavHeader}
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 12, color: '#0d0d0d' }}>{company.name} Feedback</h1>
        <p style={{ color: '#6b7280', marginBottom: 32 }}>Share ideas and vote on what we should build next.</p>
        <a href={boardUrl} style={{ display: 'inline-block', padding: '14px 36px', borderRadius: 14, background: accent, color: '#fff', fontWeight: 700, textDecoration: 'none' }}>View Board →</a>
      </div>
    </div>
  )

  // Help domain → full help centre (same design as colvy.com/help)
  return (
    <div style={{ background: 'var(--canvas, #fafafa)', minHeight: '100vh' }}>
      {NavHeader}

      {/* Hero — matches colvy.com/help exactly */}
      <div style={{ padding: '64px 24px', textAlign: 'center', background: 'var(--peach, #fff4f1)' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--coral, #ff7a6b)' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, color: 'var(--ink, #1a1a1a)' }}>{company.name} Help Centre</h1>
        <p style={{ color: 'var(--slate, #6b6b70)', marginBottom: 32, fontSize: 18 }}>Find answers, guides, and resources</p>
        <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate, #6b6b70)' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..."
            style={{ width: '100%', padding: '14px 16px 14px 48px', borderRadius: 14, border: '1px solid var(--border, #f0f0f0)', fontSize: 16, outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--slate, #6b6b70)' }}>×</button>}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ borderBottom: '1px solid var(--border, #f0f0f0)', padding: '12px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', gap: 24, fontSize: 13, color: 'var(--slate, #6b6b70)' }}>
          <span>{articles.length} articles</span>
          <span>{cats.length - 1} categories</span>
          <span>{articles.reduce((s, a) => s + (a.views || 0), 0)} total views</span>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>

        {/* Category pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {cats.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              style={{ padding: '7px 16px', borderRadius: 999, border: `1px solid ${catFilter === cat ? accent : 'var(--border, #f0f0f0)'}`, background: catFilter === cat ? accent : '#fff', color: catFilter === cat ? '#fff' : 'var(--slate, #6b6b70)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CategorySVG cat={cat} size={13} />
              {cat}
            </button>
          ))}
        </div>

        {articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", opacity: 0.3 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--slate, #6b6b70)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div>
            <p style={{ color: 'var(--slate, #6b6b70)' }}>No help articles yet. Check back soon!</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", opacity: 0.3 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--slate, #6b6b70)" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
            <p style={{ color: 'var(--slate, #6b6b70)' }}>No articles match your search</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured.length > 0 && !search && catFilter === 'All' && (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate, #6b6b70)', marginBottom: 16 }}>⭐ Featured Articles</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
                  {featured.map(a => (
                    <a key={a.id} href={`${boardUrl}/help/${a.id}`}
                      style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border, #f0f0f0)', padding: 20, textDecoration: 'none', display: 'block', transition: 'box-shadow 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: accent + '15', color: accent, fontWeight: 600 }}>{a.category}</span>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '10px 0 6px', color: 'var(--ink, #1a1a1a)' }}>{a.title}</h3>
                      <p style={{ fontSize: 13, color: 'var(--slate, #6b6b70)', lineHeight: 1.5 }}>
                        {a.content?.replace(/#{1,6} /g, '').slice(0, 80)}...
                      </p>
                      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* All articles list */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border, #f0f0f0)', overflow: 'hidden' }}>
              {filtered.map((a, i) => (
                <a key={a.id} href={`${boardUrl}/help/${a.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border, #f0f0f0)' : 'none', textDecoration: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: accent + '15', color: accent, fontWeight: 600 }}>{a.category}</span>
                      {a.featured && <span style={{ fontSize: 12 }}>⭐</span>}
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink, #1a1a1a)', marginBottom: 2 }}>{a.title}</p>
                    <p style={{ fontSize: 12, color: '#9ca3af' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Support options */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginTop: 48 }}>
          {[
            { svgIcon: 'chat', title: 'Live Chat', desc: 'Chat with our team in real time', action: 'Start Chat', href: '#' },
            { svgIcon: 'ticket', title: 'Submit a Ticket', desc: 'We\'ll get back to you soon', action: 'Open Ticket', href: `${boardUrl}/help/ticket` },
            { svgIcon: 'email', title: 'Email Support', desc: 'Response within 24h', action: 'Send Email', href: `mailto:support@${company.slug}.com` },
          ].map(s => (
            <div key={s.title} style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border, #f0f0f0)', padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.svgIcon === 'chat' ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> : s.svgIcon === 'ticket' ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--ink, #1a1a1a)' }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--slate, #6b6b70)', marginBottom: 14 }}>{s.desc}</p>
              <a href={s.href} style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 10, border: '1px solid var(--border, #f0f0f0)', fontSize: 13, fontWeight: 600, color: 'var(--ink, #1a1a1a)', textDecoration: 'none' }}>{s.action}</a>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid var(--border, #f0f0f0)', fontSize: 12, color: '#9ca3af' }}>
        Powered by <a href="https://colvy.com" style={{ color: accent }}>Colvy</a>
      </div>
    </div>
  )
}
