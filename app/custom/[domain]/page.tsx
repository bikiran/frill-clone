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
    // This route is the internal renderer for custom domains — reached via a
    // proxy rewrite from the real domain, where the pretty URL is preserved.
    // If someone lands on the raw /custom/<host> path on a Colvy host (e.g. a
    // pasted link), send them to the actual domain so they never see it.
    if (typeof window !== 'undefined') {
      const current = window.location.hostname
      const onColvyHost = current === 'colvy.com' || current === 'www.colvy.com' || current.endsWith('.colvy.com')
      if (onColvyHost && current !== hostname && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) {
        const after = window.location.pathname.replace(/^\/custom\/[^/]+/, '') || '/'
        window.location.replace(`https://${hostname}${after}${window.location.search}`)
        return
      }
    }
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
  const helpEmail = company?.support_email || company?.business_email || company?.contact_email || company?.email || ''
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

  // On the real custom domain (and colvy subdomains) the shared AppChrome header
  // already renders the company's brand, so a second header here would stack. We
  // only render our own header on the raw internal `/custom/<domain>` path, where
  // AppChrome treats the route as full-page and shows no chrome of its own.
  const standalone = typeof window !== 'undefined' && window.location.pathname.startsWith('/custom/')
  const NavHeader = !standalone ? null : (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

  // Help domain → full help centre
  const totalViews = articles.reduce((s, a) => s + (a.views || 0), 0)
  const realCats = cats.filter(c => c !== 'All')
  const catCount = (c: string) => articles.filter(a => a.category === c).length
  const popular = realCats.slice(0, 4)
  const coverBg = company.help_cover_url
    ? `linear-gradient(180deg, rgba(15,23,42,0.28) 0%, rgba(15,23,42,0.45) 100%), url(${company.help_cover_url}) center/cover no-repeat`
    : `linear-gradient(135deg, ${accent}22 0%, ${accent}0c 55%, #ffffff 100%)`
  const onCover = !!company.help_cover_url
  const ink = onCover ? '#fff' : 'var(--ink, #1a1a1a)'
  const sub = onCover ? 'rgba(255,255,255,0.9)' : 'var(--slate, #6b6b70)'
  const excerpt = (a: any) => (a.content || '').replace(/#{1,6} /g, '').replace(/```[\s\S]*?```/g, '').replace(/[*_>#`]/g, '').slice(0, 110)

  return (
    <div style={{ background: 'var(--canvas, #f7f8fa)', minHeight: '100vh' }}>
      {NavHeader}

      {/* Hero (cover photo, or branded gradient fallback) */}
      <div style={{ background: coverBg, padding: '56px 24px 96px', textAlign: 'center' }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center', color: onCover ? '#fff' : accent }}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <h1 style={{ fontSize: 'clamp(30px,4.5vw,46px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px', color: ink, textShadow: onCover ? '0 1px 12px rgba(0,0,0,0.25)' : 'none' }}>{company.name} Help Centre</h1>
        <p style={{ color: sub, margin: '0 auto 28px', fontSize: 18, maxWidth: 560, textShadow: onCover ? '0 1px 8px rgba(0,0,0,0.25)' : 'none' }}>Find answers, guides, and resources to keep your aquarium thriving</p>
        <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…"
            style={{ width: '100%', padding: '17px 60px 17px 52px', borderRadius: 999, border: 'none', fontSize: 16, outline: 'none', boxSizing: 'border-box', background: '#fff', boxShadow: '0 12px 34px rgba(15,23,42,0.16)' }} />
          <button aria-label="Search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: '50%', border: 'none', background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        {popular.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: onCover ? 'rgba(255,255,255,0.85)' : 'var(--slate,#6b6b70)' }}>Popular searches:</span>
            {popular.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: onCover ? '1px solid rgba(255,255,255,0.5)' : '1px solid var(--border,#e5e7eb)', background: onCover ? 'rgba(255,255,255,0.15)' : '#fff', color: onCover ? '#fff' : 'var(--slate,#6b6b70)' }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        {/* Stats card overlapping the hero */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#fff', borderRadius: 20, boxShadow: '0 10px 34px rgba(15,23,42,0.08)', border: '1px solid var(--border,#eef0f3)', marginTop: -56, position: 'relative', zIndex: 2, overflow: 'hidden' }}>
          {[
            { n: articles.length, l: 'Articles', icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/> },
            { n: realCats.length, l: 'Categories', icon: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/> },
            { n: totalViews, l: 'Total views', icon: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></> },
          ].map((s, i) => (
            <div key={s.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '22px 16px', borderLeft: i ? '1px solid var(--border,#eef0f3)' : 'none' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: accent + '15', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
              </span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink,#1a1a1a)', lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 13, color: 'var(--slate,#6b6b70)', marginTop: 3 }}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* Category pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 36 }}>
          {cats.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              style={{ padding: '9px 18px', borderRadius: 999, border: `1px solid ${catFilter === cat ? accent : 'var(--border, #e5e7eb)'}`, background: catFilter === cat ? accent : '#fff', color: catFilter === cat ? '#fff' : 'var(--slate, #6b6b70)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <CategorySVG cat={cat} size={14} />
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
              <div style={{ marginBottom: 44 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, color: 'var(--ink,#1a1a1a)', margin: 0 }}>
                    <span style={{ color: '#f5b301' }}>★</span> Featured Articles
                  </h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 18 }}>
                  {featured.map(a => {
                    const img = a.image_url || a.cover_url || a.image
                    return (
                    <a key={a.id} href={`/help/${a.id}`}
                      style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--border, #eef0f3)', padding: 18, textDecoration: 'none', display: 'block', transition: 'box-shadow 0.2s, transform 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 30px rgba(15,23,42,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: accent + '15', color: accent, fontWeight: 700 }}>{a.category}</span>
                          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '11px 0 7px', color: 'var(--ink, #1a1a1a)', lineHeight: 1.3 }}>{a.title}</h3>
                          <p style={{ fontSize: 13, color: 'var(--slate, #6b6b70)', lineHeight: 1.5, margin: 0 }}>{excerpt(a)}…</p>
                        </div>
                        <div style={{ width: 84, height: 84, borderRadius: 12, flexShrink: 0, background: img ? `url(${img}) center/cover no-repeat` : `linear-gradient(135deg, ${accent}22, ${accent}0c)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
                          {!img && <CategorySVG cat={a.category || 'All'} size={26} />}
                        </div>
                      </div>
                      <p style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#9ca3af', marginTop: 14, marginBottom: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>{a.views || 0} views</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/></svg>{a.likes || 0} helpful</span>
                      </p>
                    </a>
                  )})}
                </div>
              </div>
            )}

            {/* Browse by Topic */}
            {realCats.length > 0 && !search && catFilter === 'All' && (
              <div style={{ marginBottom: 44 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink,#1a1a1a)', margin: '0 0 16px' }}>Browse by Topic</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 16 }}>
                  {realCats.map(c => (
                    <button key={c} onClick={() => setCatFilter(c)}
                      style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--border,#eef0f3)', borderRadius: 16, padding: '18px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, transition: 'box-shadow 0.2s, transform 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 26px rgba(15,23,42,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                      <span style={{ width: 44, height: 44, borderRadius: 12, background: accent + '15', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CategorySVG cat={c} size={22} /></span>
                      <span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--ink,#1a1a1a)' }}>{c}</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate,#6b6b70)', marginTop: 2 }}>{catCount(c)} article{catCount(c) === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All articles list */}
            {(search || catFilter !== 'All') && <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink,#1a1a1a)', margin: '0 0 14px' }}>{catFilter !== 'All' ? catFilter : `Results for “${search}”`}</h2>}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border, #f0f0f0)', overflow: 'hidden' }}>
              {filtered.map((a, i) => (
                <a key={a.id} href={`/help/${a.id}`}
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
            { svgIcon: 'chat', title: 'Live Chat', desc: 'Chat with our team in real time', action: 'Start Chat', onClick: () => window.dispatchEvent(new CustomEvent('colvy-open-chat')) },
            { svgIcon: 'ticket', title: 'Submit a Ticket', desc: 'We\'ll get back to you soon', action: 'Open Ticket', href: `/help/ticket` },
            ...(helpEmail ? [{ svgIcon: 'email', title: 'Email Support', desc: 'Response within 24h', action: 'Send Email', href: `mailto:${helpEmail}` }] : [{ svgIcon: 'email', title: 'Email Support', desc: 'We\'ll get back to you soon', action: 'Contact us', href: `/help/ticket` }]),
          ].map((s: any) => (
            <div key={s.title} style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border, #f0f0f0)', padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8, display: 'flex', justifyContent: 'center', color: accent }}>{s.svgIcon === 'chat' ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> : s.svgIcon === 'ticket' ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--ink, #1a1a1a)' }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--slate, #6b6b70)', marginBottom: 14 }}>{s.desc}</p>
              {s.onClick
                ? <button onClick={s.onClick} style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 10, border: '1px solid var(--border, #f0f0f0)', fontSize: 13, fontWeight: 600, color: 'var(--ink, #1a1a1a)', background: '#fff', cursor: 'pointer' }}>{s.action}</button>
                : <a href={s.href} style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 10, border: '1px solid var(--border, #f0f0f0)', fontSize: 13, fontWeight: 600, color: 'var(--ink, #1a1a1a)', textDecoration: 'none' }}>{s.action}</a>}
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
