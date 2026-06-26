'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

export default function BoardHelpPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [company, setCompany] = useState<any>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    getCompanyBySlug(slug).then(async co => {
      if (!co) { setLoading(false); return }
      setCompany(co)
      const { data } = await (supabase as any)
        .from('help_articles')
        .select('*')
        .eq('company_id', co.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      setArticles(data || [])
      setLoading(false)
    })
  }, [slug])

  const accent = company?.accent_color || 'var(--coral)'
  const categories = ['All', ...Array.from(new Set(articles.map((a: any) => a.category).filter(Boolean)))]
  const filtered = articles
    .filter(a => catFilter === 'All' || a.category === catFilter)
    .filter(a => !search || a.title?.toLowerCase().includes(search.toLowerCase()))
  const featured = articles.filter(a => a.featured).slice(0, 3)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company?.logo_url ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accent }}>{company?.name?.[0]?.toUpperCase()}</div>}
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{company?.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `/board/${slug}` },
              { label: 'Roadmap', href: `/board/${slug}/roadmap` },
              { label: 'Updates', href: `/board/${slug}/announcements` },
              { label: 'Help', href: `/board/${slug}/help`, active: true },
            ].map(n => (
              <Link key={n.label} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm transition-all"
                style={{ color: n.active ? accent : 'var(--slate)', background: n.active ? accent + '15' : 'transparent', fontWeight: n.active ? 600 : 400 }}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="py-12 px-6 text-center border-b" style={{ background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)` }}>
        <div className="text-4xl mb-3">📚</div>
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--ink)' }}>Help Centre</h1>
        <p className="mb-6" style={{ color: 'var(--slate)' }}>Find answers, guides, and resources</p>
        <div className="max-w-xl mx-auto relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border focus:outline-none text-sm"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
        </div>
        <div className="flex items-center justify-center gap-2 mt-3 text-xs" style={{ color: 'var(--slate)' }}>
          <span>{articles.length} articles</span>
          <span>·</span>
          <span>{categories.length - 1} categories</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Featured */}
        {featured.length > 0 && !search && catFilter === 'All' && (
          <div className="mb-10">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>⭐ Featured Articles</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {featured.map(a => (
                <Link key={a.id} href={`/board/${slug}/help/${a.id}`}
                  className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all cursor-pointer block"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block" style={{ background: accent + '15', color: accent }}>{a.category}</span>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--ink)' }}>{a.title}</h3>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className="px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all"
              style={{ background: catFilter === cat ? accent : 'white', color: catFilter === cat ? 'white' : 'var(--slate)', borderColor: catFilter === cat ? accent : 'var(--border)' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Articles list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p style={{ color: 'var(--slate)' }}>No articles found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => (
              <Link key={a.id} href={`/board/${slug}/help/${a.id}`}
                className="bg-white rounded-2xl border p-5 flex items-center justify-between hover:shadow-sm transition-all cursor-pointer block"
                style={{ borderColor: 'var(--border)' }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: accent + '15', color: accent }}>{a.category}</span>
                    {a.featured && <span className="text-xs">⭐</span>}
                  </div>
                  <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>{a.title}</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
