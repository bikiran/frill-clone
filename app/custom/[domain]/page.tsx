'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function CustomDomainPage() {
  const params = useParams()
  const encodedDomain = params?.domain as string
  const hostname = encodedDomain?.replace(/__/g, '.')
  const [company, setCompany] = useState<any>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isHelpDomain, setIsHelpDomain] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')

  useEffect(() => {
    if (!hostname) return
    const resolve = async () => {
      let co: any = null
      let isHelp = false

      // 1. Try help_domain
      const { data: byHelp } = await (supabase as any)
        .from('companies').select('*').eq('help_domain', hostname).maybeSingle()
      if (byHelp) { co = byHelp; isHelp = true }

      // 2. Try board_domain
      if (!co) {
        const { data: byBoard } = await (supabase as any)
          .from('companies').select('*').eq('board_domain', hostname).maybeSingle()
        if (byBoard) { co = byBoard; isHelp = false }
      }

      // 3. Fallback: extract slug from domain (help.prexty.com → prexty)
      if (!co) {
        const parts = hostname.split('.')
        if (parts.length >= 2) {
          const possibleSlug = parts[parts.length - 2]
          const { data: bySlug } = await (supabase as any)
            .from('companies').select('*').eq('slug', possibleSlug).maybeSingle()
          if (bySlug) { co = bySlug; isHelp = hostname.startsWith('help.') }
        }
      }

      if (!co) { setLoading(false); return }

      setCompany(co)
      setIsHelpDomain(isHelp)

      // Apply company branding
      if (co.accent_color && typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--coral', co.accent_color)
        document.documentElement.style.setProperty('--peach', co.accent_color + '15')
      }

      // Load company content
      if (isHelp) {
        const { data: arts, error: artErr } = await (supabase as any)
          .from('help_articles').select('*')
          .eq('company_id', co.id)
          .order('created_at', { ascending: false })
        if (artErr) console.warn('Article load error:', artErr.message)
        setArticles(arts || [])
      }

      setLoading(false)
    }
    resolve()
  }, [hostname])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!company) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Domain not configured</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>No board found for <strong>{hostname}</strong></p>
      <p className="text-xs" style={{ color: 'var(--slate)' }}>Go to Admin → Settings → White Labeling to configure your custom domain.</p>
    </div>
  )

  const accent = company.accent_color || 'var(--coral)'
  const boardUrl = `https://${company.slug}.colvy.com`
  const categories = ['All', ...Array.from(new Set(articles.map((a: any) => a.category).filter(Boolean)))] as string[]
  const featured = articles.filter(a => a.featured).slice(0, 3)
  const filtered = articles
    .filter(a => catFilter === 'All' || a.category === catFilter)
    .filter(a => !search || a.title?.toLowerCase().includes(search.toLowerCase()))

  // Board domain — show the board
  if (!isHelpDomain) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
        <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {company.logo_url ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
                : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accent }}>{company.name?.[0]?.toUpperCase()}</div>}
              <span className="font-bold" style={{ color: 'var(--ink)' }}>{company.name}</span>
            </div>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h1 className="text-3xl font-black mb-3" style={{ color: 'var(--ink)' }}>{company.name} Feedback</h1>
          <p className="mb-8" style={{ color: 'var(--slate)' }}>Share ideas and vote on what we should build next.</p>
          <a href={boardUrl} className="inline-block px-8 py-3.5 rounded-xl font-semibold text-white" style={{ background: accent }}>
            View Feedback Board →
          </a>
        </div>
      </div>
    )
  }

  // Help domain — show full help centre
  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company.logo_url ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accent }}>{company.name?.[0]?.toUpperCase()}</div>}
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{company.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <a href={boardUrl} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--slate)' }}>Ideas</a>
            <a href={`${boardUrl}/roadmap`} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--slate)' }}>Roadmap</a>
            <a href={`${boardUrl}/announcements`} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--slate)' }}>Updates</a>
            <a href="#" className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: accent, background: accent + '15' }}>Help</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="py-12 px-6 text-center border-b" style={{ background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)`, borderColor: 'var(--border)' }}>
        <div className="text-4xl mb-3">📚</div>
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--ink)' }}>{company.name} Help Centre</h1>
        <p className="mb-6" style={{ color: 'var(--slate)' }}>Find answers, guides, and resources</p>
        <div className="max-w-xl mx-auto relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border focus:outline-none bg-white text-sm"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>
          {articles.length} articles · {categories.length - 1} categories · {articles.reduce((s, a) => s + (a.views || 0), 0)} total views
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Featured */}
        {featured.length > 0 && !search && catFilter === 'All' && (
          <div className="mb-10">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>⭐ Featured Articles</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {featured.map(a => (
                <a key={a.id} href={`/article/${a.id}`}
                  className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all cursor-pointer block"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block" style={{ background: accent + '15', color: accent }}>{a.category}</span>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--ink)' }}>{a.title}</h3>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className="px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all"
              style={{ background: catFilter === cat ? accent : 'white', color: catFilter === cat ? 'white' : 'var(--slate)', borderColor: catFilter === cat ? accent : 'var(--border)' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Articles */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p style={{ color: 'var(--slate)' }}>No articles found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between hover:shadow-sm transition-all cursor-pointer"
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
              </div>
            ))}
          </div>
        )}

        {/* Support options */}
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {[
            { icon: '💬', title: 'Live Chat', desc: 'Chat with our support team in real time', action: 'Start Chat', href: '#' },
            { icon: '🎫', title: 'Submit a Ticket', desc: 'Open a support ticket and we\'ll get back to you', action: 'Open Ticket', href: `${boardUrl}/help/ticket` },
            { icon: '📧', title: 'Email Support', desc: 'Send us an email and we\'ll respond within 24h', action: 'Send Email', href: `mailto:support@${company.slug}.com` },
          ].map(s => (
            <div key={s.title} className="bg-white rounded-2xl border p-5 text-center" style={{ borderColor: 'var(--border)' }}>
              <div className="text-3xl mb-2">{s.icon}</div>
              <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{s.title}</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>{s.desc}</p>
              <a href={s.href} className="inline-block px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                {s.action}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center py-6 border-t" style={{ borderColor: 'var(--border)' }}>
        <a href="https://colvy.com" className="text-xs" style={{ color: 'var(--slate)' }}>Powered by <span style={{ color: accent }}>Colvy</span></a>
      </div>
    </div>
  )
}
