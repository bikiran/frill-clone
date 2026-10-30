'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useTerminology } from '@/lib/terminologyContext'
import { HELP_LIST_COLUMNS, helpExcerpt, helpSubtitleOf, toCatMap, helpCatName, helpCatColor } from '@/lib/help-shared'
import HelpCatMark from '@/components/help/HelpCatMark'
import type { HelpIndexData } from '@/lib/help-public'
import EmptyScroll from '@/components/EmptyScroll'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const DEMO_ARTICLES = [
  { id: 'demo-1', title: 'Getting started with Colvy', content: 'Welcome to Colvy! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\nAfter signing up, your feedback board is automatically created. You can customize it from the Admin panel.\n\n## Step 2: Invite your team\nGo to Admin → Team Members to invite colleagues.\n\n## Step 3: Collect feedback\nShare your board URL with customers and start collecting ideas.', category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28 },
  { id: 'demo-2', title: 'How to create and manage ideas', content: 'Ideas are the core of Colvy. Here\'s how to manage them effectively.\n\n## Creating ideas\nClick "Share an Idea" on your board to submit new ideas. Customers can also submit ideas directly.\n\n## Voting\nUsers can upvote ideas they care about. The most voted ideas rise to the top.\n\n## Status management\nUpdate idea status from Admin to keep users informed: Under Review → Planned → In Progress → Shipped.', category: 'Features', status: 'published', featured: true, views: 98, likes: 19 },
  { id: 'demo-3', title: 'Setting up your public roadmap', content: 'The roadmap gives customers visibility into your product direction.\n\n## Enabling roadmap\nGo to Admin → Settings → Site Navigation and enable Roadmap.\n\n## Adding ideas to roadmap\nFrom the Ideas board, mark ideas as "Show on Roadmap" to display them.\n\n## Kanban columns\nDrag ideas between columns: Under Consideration, Planned, In Development, Shipped.', category: 'Features', status: 'published', featured: false, views: 76, likes: 12 },
  { id: 'demo-4', title: 'Publishing announcements', content: 'Keep customers updated with Announcements (your changelog).\n\n## Creating an announcement\nGo to Admin → Announcements → New Announcement.\n\n## Tags\nUse tags like Feature, Bug Fix, Update to categorize announcements.\n\n## Boost\nEnable Boost to display the announcement as a banner or modal in your widget.\n\n## Notify subscribers\nToggle "Notify subscribers" to email users when you publish.', category: 'Features', status: 'published', featured: false, views: 54, likes: 9 },
  { id: 'demo-5', title: 'Embedding the Colvy widget', content: 'Add Colvy to your app with a simple JavaScript snippet.\n\n## Installation\nPaste this code before the closing </body> tag:\n\n```\n<script src="https://yourapp.colvy.com/embed.js"></script>\n```\n\n## Configuration\nCustomize the widget color, position, and which features to show.\n\n## SSO\nPass user data to Colvy so users are automatically logged in when they open the widget.', category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41 },
  { id: 'demo-6', title: 'Connecting Slack', content: 'Get notified in Slack when new ideas are submitted.\n\n## Setup\n1. Go to Admin → Settings → Integrations\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post (new ideas, comments, status changes)\n\n## Notifications\nFrill will post a message to your chosen channel whenever a trigger event occurs.', category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11 },
  { id: 'demo-7', title: 'Understanding your subscription', content: 'Colvy offers flexible plans for every team size.\n\n## Free plan\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan ($99/month)\nUnlimited team members, white labeling, API access, advanced analytics.\n\n## Enterprise\nSSO, custom integrations, priority support, SLA.\n\n## Changing plans\nGo to Settings → Billing to upgrade or downgrade at any time.', category: 'Billing', status: 'published', featured: false, views: 45, likes: 7 },
  { id: 'demo-8', title: 'Why can\'t users vote?', content: 'If users are unable to vote on ideas, here are the most common causes.\n\n## Guest voting disabled\nGo to Admin → Settings → Guest Access and ensure "Allow guest voting" is enabled.\n\n## User not logged in\nIf you\'ve disabled guest voting, users must sign in to vote.\n\n## Already voted\nUsers can only vote once per idea. They can un-vote by clicking the vote button again.\n\n## Contact support\nIf none of these apply, please contact us via the support form below.', category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14 },
  { id: 'demo-9', title: 'REST API overview', content: 'Colvy provides a REST API for programmatic access to your data.\n\n## Authentication\nAll API requests require an API key in the Authorization header:\n```\nAuthorization: Bearer YOUR_API_KEY\n```\n\n## Endpoints\n- GET /api/v1/ideas — List all ideas\n- POST /api/v1/ideas — Create an idea\n- GET /api/v1/announcements — List announcements\n\n## Rate limiting\nAPI requests are limited to 1000 per hour per key.', category: 'API', status: 'published', featured: false, views: 123, likes: 22 },
]

// `initial` comes from the server (lib/help-public): this help centre's
// published articles (titles + excerpts, no bodies), categories and branding,
// from a short-lived shared cache — so the page renders with its content
// instead of a spinner. It's undefined when the help centre is locked or the
// server couldn't load it; the page then loads everything here as before.
export default function HelpCentrePage({ initial }: { initial?: HelpIndexData } = {}) {
  const { getTerm } = useTerminology()
  const [articles, setArticles] = useState<any[]>(() => {
    if (!initial) return []
    if (initial.articles.length) return initial.articles
    return initial.companyId || initial.onSubdomain ? [] : DEMO_ARTICLES
  })
  // The company's own support address — a hardcoded support@colvy.com told
  // every customer to email Colvy instead of the business they're buying from.
  const [helpEmail, setHelpEmail] = useState('')
  // Articles store the category SLUG; resolve it to the readable name and the
  // icon configured in Settings → Help Categories.
  const [catMap, setCatMap] = useState<Record<string, { name: string; icon: string }>>(initial?.catMap ?? {})
  const [loading, setLoading] = useState(!initial)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [accessLocked, setAccessLocked] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [cid, setCid] = useState<string | null>(initial?.companyId ?? null)
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '')
  const [helpCover, setHelpCover] = useState(initial?.helpCover ?? '')
  const [subtitle, setSubtitle] = useState<string | null>(initial?.helpSubtitle ?? null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    if (initial) {
      loadContactEmail()
      showDraftsToAdmins(initial.companyId, initial.onSubdomain)
    } else {
      fetchArticles()
    }
    // ?theme=dark → dark mode (used by the admin preview and shareable links)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('theme') === 'dark') setDarkMode(true)
    }
    // Access control: locked help centers require sign-in
    ;(async () => {
      const companyId = initial ? initial.companyId : await getCompanyId()
      setCid(companyId)
      if (!companyId) return
      const { data: rows } = await (supabase as any).from('site_settings').select('value')
        .eq('key', 'general').eq('company_id', companyId)
        .order('updated_at', { ascending: false }).limit(1)
      setSubtitle(typeof rows?.[0]?.value?.helpSubtitle === 'string' ? rows[0].value.helpSubtitle : null)
      if (rows?.[0]?.value?.helpAccess === 'locked') {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) setAccessLocked(true)
      }
    })()
  }, [])

  // Article bodies are only needed to search inside them, so they're loaded the
  // first time someone uses the search box rather than with the page.
  const bodiesLoaded = useRef(!initial)
  const loadBodies = () => {
    if (bodiesLoaded.current || !initial) return
    if (!initial.companyId && initial.onSubdomain) return
    bodiesLoaded.current = true
    ;(async () => {
      try {
        let q = (supabase as any).from('help_articles').select('id, content').eq('status', 'published')
        if (initial.companyId) q = q.eq('company_id', initial.companyId)
        const { data, error } = await q
        if (error || !data) { bodiesLoaded.current = false; return }
        const bodies = new Map<string, string>(data.map((r: any) => [r.id, r.content]))
        setArticles(prev => prev.map(a => a.content === undefined && bodies.has(a.id) ? { ...a, content: bodies.get(a.id) } : a))
      } catch { bodiesLoaded.current = false }
    })()
  }
  useEffect(() => { if (search.trim()) loadBodies() }, [search])

  // Track searches (debounced) for help center analytics
  const searchTrackTimer = useRef<any>(null)
  useEffect(() => {
    if (!search.trim() || !cid) return
    if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current)
    searchTrackTimer.current = setTimeout(async () => {
      try {
        await (supabase as any).from('help_searches').insert({
          company_id: cid,
          query: search.trim(),
          results_count: searchResults.length,
          source: 'help_center',
        })
      } catch {}
    }, 1200)
    return () => { if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current) }
  }, [search, cid])

  // Live search
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setShowSearchDropdown(false); return }
    const q = search.toLowerCase()
    const results = articles.filter(a =>
      a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q)
    ).slice(0, 6)
    setSearchResults(results)
    setShowSearchDropdown(results.length > 0)
  }, [search, articles])

  const isOnCompanySubdomain = () => {
    if (typeof window === 'undefined') return false
    const h = window.location.hostname
    return h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
  }

  const loadContactEmail = async () => {
    if (!isOnCompanySubdomain()) return
    const slug = window.location.hostname.replace('.colvy.com', '')
    try {
      const r = await fetch(`/api/help/contact?slug=${encodeURIComponent(slug)}`)
      const d = await r.json()
      if (d.email) setHelpEmail(d.email)
    } catch { /* keep the default */ }
  }

  // One company lookup per page (it used to run twice, each time waiting on the
  // contact-address request before returning).
  const companyLookup = useRef<Promise<string | null> | null>(null)
  const getCompanyId = () => {
    if (!companyLookup.current) companyLookup.current = (async () => {
      if (!isOnCompanySubdomain()) return null
      const slug = window.location.hostname.replace('.colvy.com', '')
      loadContactEmail()
      const { data } = await (supabase as any).from('companies').select('id, name, help_cover_url, accent_color').eq('slug', slug).maybeSingle()
      if (data?.name) setCompanyName(data.name)
      if (data?.help_cover_url) setHelpCover(data.help_cover_url)
      return data?.id || null
    })()
    return companyLookup.current
  }

  // Only company admins may see drafts/private articles; the public sees published only
  const isAdminViewer = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return false
    const { isCompanyAdminUser } = await import('@/lib/board')
    return isCompanyAdminUser(session.user)
  }

  // The server only renders published articles; a signed-in admin also gets
  // their drafts, loaded here after the page is already on screen.
  const showDraftsToAdmins = async (companyId: string | null, onSubdomain: boolean) => {
    try {
      if (!companyId && onSubdomain) return
      if (!(await isAdminViewer())) return
      let q = (supabase as any).from('help_articles').select(`${HELP_LIST_COLUMNS}, content`)
      if (companyId) q = q.eq('company_id', companyId)
      const { data } = await q.order('created_at', { ascending: false })
      if (data?.length) { bodiesLoaded.current = true; setArticles(data) }
    } catch {}
  }

  const fetchArticles = async () => {
    try {
      const companyId = await getCompanyId()
      if (!companyId && isOnCompanySubdomain()) {
        setArticles([]); setLoading(false); return
      }
      // Categories, articles (no inline media) and the admin check together.
      let catQ = (supabase as any).from('help_categories').select('slug, name, icon')
      if (companyId) catQ = catQ.eq('company_id', companyId)
      let q = (supabase as any).from('help_articles').select(`${HELP_LIST_COLUMNS}, content`)
      if (companyId) q = q.eq('company_id', companyId)
      const [catRes, { data }, admin] = await Promise.all([
        Promise.resolve(catQ).catch(() => ({ data: null })),
        q.order('created_at', { ascending: false }),
        isAdminViewer(),
      ])
      if (catRes?.data) setCatMap(toCatMap(catRes.data))
      const visible = (data || []).filter((a: any) => admin || a.status === 'published')
      setArticles(visible.length ? visible : (companyId ? [] : DEMO_ARTICLES))
    } catch { setArticles(DEMO_ARTICLES) }
    setLoading(false)
  }

  const isAdmin = isCompanyAdmin
  const allCategories = Array.from(new Set(articles.map(a => a.category).filter(Boolean)))

  const filtered = articles.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !search || a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q)
    const matchCat = !categoryFilter || a.category === categoryFilter
    return matchSearch && matchCat
  })

  const featured = filtered.filter(a => a.featured)
  const byCat = allCategories.map(cat => ({
    cat, items: filtered.filter(a => a.category === cat && !a.featured)
  })).filter(g => g.items.length > 0)
  const totalViews = articles.reduce((s, a) => s + (a.views || 0), 0)
  const popularCats = allCategories.slice(0, 4)
  const catCount = (c: string) => articles.filter(a => a.category === c).length
  const heroTitle = companyName ? `${companyName} Help Centre` : 'Help Centre'
  const onCover = !!helpCover
  // Server rows carry a ready-made excerpt; demo/admin rows still have the body.
  const excerpt = (a: any) => a.excerpt ?? helpExcerpt(a.content)

  return (
    <div className="min-h-screen" style={{ background: darkMode ? '#111214' : 'var(--canvas)', filter: darkMode ? 'invert(0.92) hue-rotate(180deg)' : 'none' }}>
      <style>{HC_CSS}</style>
      {/* Locked help center: require sign-in */}
      {accessLocked && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 380, textAlign: 'center', background: '#fff', borderRadius: 18, border: '1px solid var(--border)', padding: '40px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px 0' }}>This help center is private</h2>
            <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 22px 0' }}>Sign in to browse articles and documentation.</p>
            <a href={`/signin?redirect=${encodeURIComponent('/help')}`}
              style={{ display: 'inline-block', padding: '11px 32px', borderRadius: 12, background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </a>
          </div>
        </div>
      )}
      {/* Hero (cover photo, or branded gradient fallback) */}
      <div className="px-6 text-center" style={{ padding: '56px 24px 96px', background: onCover
        ? `linear-gradient(180deg, rgba(15,23,42,0.28), rgba(15,23,42,0.45)), url(${helpCover}) center/cover no-repeat`
        : `linear-gradient(135deg, var(--peach) 0%, #ffffff 100%)` }}>
        <div className="mb-3 flex justify-center" style={{ color: onCover ? '#fff' : "var(--coral)" }}><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div>
        <h1 className="font-black mb-3" style={{ fontSize: 'clamp(30px,4.5vw,46px)', letterSpacing: '-0.02em', color: onCover ? '#fff' : 'var(--ink)', textShadow: onCover ? '0 1px 12px rgba(0,0,0,0.25)' : 'none' }}>{heroTitle}</h1>
        <p className="mb-8 text-lg" style={{ color: onCover ? 'rgba(255,255,255,0.9)' : 'var(--slate)', textShadow: onCover ? '0 1px 8px rgba(0,0,0,0.25)' : 'none' }}>{helpSubtitleOf(subtitle)}</p>

        {/* Live search */}
        <div className="max-w-2xl mx-auto relative" ref={searchRef}>
          <svg className="absolute left-5 top-1/2 -translate-y-1/2 z-10" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#9ca3af' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => { loadBodies(); if (search) setShowSearchDropdown(searchResults.length > 0) }}
            placeholder={getTerm('help_search')}
            className="w-full focus:outline-none bg-white"
            style={{ padding: '17px 60px 17px 52px', borderRadius: 999, border: 'none', fontSize: '16px', boxShadow: '0 12px 34px rgba(15,23,42,0.16)' }}
          />
          <span aria-hidden className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--coral)', color: '#fff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          {search && (
            <button onClick={() => { setSearch(''); setShowSearchDropdown(false) }}
              className="absolute right-14 top-1/2 -translate-y-1/2 cursor-pointer text-lg"
              style={{ color: 'var(--slate)' }}>×</button>
          )}
          {/* Live search dropdown */}
          {showSearchDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowSearchDropdown(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {searchResults.map((a, i) => (
                  <Link key={a.id} href={`/help/${a.id}`} onClick={() => { setSearch(''); setShowSearchDropdown(false) }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-all cursor-pointer text-left"
                    style={{ borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <HelpCatMark cat={a.category} catMap={catMap} size={30} />
                    <div>
                      <p className="text-sm font-semibold text-left" style={{ color: 'var(--ink)' }}>{a.title}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{helpCatName(a.category, catMap)}</p>
                    </div>
                  </Link>
                ))}
                {searchResults.length === 0 && (
                  <div className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>No articles found for "{search}"</div>
                )}
              </div>
            </>
          )}
        </div>
        {popularCats.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center items-center mt-4">
            <span className="text-sm font-semibold" style={{ color: onCover ? 'rgba(255,255,255,0.85)' : 'var(--slate)' }}>Popular topics:</span>
            {popularCats.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className="rounded-full font-semibold cursor-pointer"
                style={{ padding: '4px 12px', fontSize: 12.5, border: onCover ? '1px solid rgba(255,255,255,0.5)' : '1px solid var(--border)', background: onCover ? 'rgba(255,255,255,0.15)' : '#fff', color: onCover ? '#fff' : 'var(--slate)' }}>
                {helpCatName(c, catMap)}
              </button>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="mt-5">
            <Link href="/admin/help" className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: 'var(--coral)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Manage Articles
            </Link>
          </div>
        )}
      </div>

      {/* Stats card overlapping the hero */}
      <div className="mx-auto px-6" style={{ maxWidth: 1240 }}>
        <div className="grid grid-cols-3 bg-white overflow-hidden" style={{ borderRadius: 20, boxShadow: '0 10px 34px rgba(15,23,42,0.08)', border: '1px solid var(--border)', marginTop: -56, position: 'relative', zIndex: 2 }}>
          <style>{`@media (max-width: 640px) { .hc-stat { flex-direction: column; gap: 8px !important; padding: 16px 6px !important; text-align: center } .hc-stat-ic { width: 36px !important; height: 36px !important; border-radius: 10px !important } .hc-stat-ic svg { width: 18px; height: 18px } .hc-stat-txt { text-align: center !important } .hc-stat-n { font-size: 20px !important } .hc-stat-l { font-size: 12px !important; white-space: nowrap } }`}</style>
          {[
            { n: articles.length, l: 'Articles', c: '#ff6a4d', icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/> },
            { n: allCategories.length, l: 'Categories', c: '#8b5cf6', icon: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/> },
            { n: totalViews, l: 'Total views', c: '#0ea5e9', icon: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></> },
          ].map((s, i) => (
            <div key={s.l} className="hc-stat flex items-center justify-center gap-3.5" style={{ padding: '22px 16px', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
              <span className="hc-stat-ic flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 13, background: `color-mix(in srgb, ${s.c} 13%, #fff)`, color: s.c }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
              </span>
              <div className="hc-stat-txt text-left">
                <div className="hc-stat-n" style={{ fontFamily: "var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>{s.n.toLocaleString('en-AU')}</div>
                <div className="hc-stat-l" style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3 }}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto px-6" style={{ maxWidth: 1240, paddingTop: 32, paddingBottom: 40 }}>
        {/* Category filter chips: a colour dot, the name and how many articles */}
        <div className="hc-chips mb-9" role="tablist" aria-label="Filter by topic">
          <button type="button" role="tab" aria-selected={!categoryFilter} onClick={() => setCategoryFilter(null)} className={`hc-chip${!categoryFilter ? ' on' : ''}`}>
            All <b>{articles.length}</b>
          </button>
          {allCategories.map(cat => (
            <button key={cat} type="button" role="tab" aria-selected={categoryFilter === cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`hc-chip${categoryFilter === cat ? ' on' : ''}`} style={{ '--c': helpCatColor(cat) } as React.CSSProperties}>
              <i />{helpCatName(cat, catMap)} <b>{catCount(cat)}</b>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12">
            <EmptyScroll kinds={['article']} title={search.trim() ? 'No articles found' : 'No articles here yet'}
              line={search.trim() ? `Nothing matches “${search.trim()}”. Try a different word, or browse by category.` : 'Check back soon, or get in touch and we’ll help.'}
              action={search.trim() ? <button type="button" className="cv-btn" onClick={() => setSearch('')}>Clear search</button> : undefined} />
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured.length > 0 && !search && (
              <div className="mb-11">
                <h2 className="flex items-center gap-2 mb-4 hc-h2"><span style={{ color: '#f5b301' }}>★</span> {getTerm('help_featured')}</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px, 100%), 1fr))' }}>
                  {featured.map(a => {
                    const img = a.image_url || a.cover_url || a.image
                    return (
                    <Link key={a.id} href={`/help/${a.id}`} className="hc-card group" style={{ '--c': helpCatColor(a.category) } as React.CSSProperties}>
                      <div className="flex gap-3.5">
                        <div className="flex-1 min-w-0">
                          <span className="hc-tag">{helpCatName(a.category, catMap)}</span>
                          <h3 className="font-bold group-hover:opacity-70 transition-all" style={{ fontSize: 15.5, margin: '11px 0 7px', color: 'var(--ink)', lineHeight: 1.3 }}>{a.title}</h3>
                          <p style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.5, margin: 0 }}>{excerpt(a)}…</p>
                        </div>
                        {img
                          ? <div className="shrink-0" style={{ width: 84, height: 84, borderRadius: 16, background: `url(${img}) center/cover no-repeat` }} />
                          : <div className="hc-card-art shrink-0"><HelpCatMark cat={a.category} catMap={catMap} size={44} /></div>}
                      </div>
                      <p className="flex items-center gap-4" style={{ fontSize: 12, color: 'var(--slate)', marginTop: 14 }}>
                        <span className="inline-flex items-center gap-1"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>{a.views || 0} views</span>
                        <span className="inline-flex items-center gap-1"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/></svg>{a.likes || 0} helpful</span>
                      </p>
                    </Link>
                  )})}
                </div>
              </div>
            )}

            {/* Browse by Topic */}
            {allCategories.length > 0 && !search && !categoryFilter && (
              <div className="mb-11">
                <h2 className="mb-4 hc-h2">{getTerm('help_browse')}</h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,260px),1fr))' }}>
                  {allCategories.map(c => (
                    <button key={c} type="button" onClick={() => setCategoryFilter(c)} className="hc-topic" style={{ '--c': helpCatColor(c) } as React.CSSProperties}>
                      <HelpCatMark cat={c} catMap={catMap} size={44} />
                      <span className="hc-topic-t">
                        <b>{helpCatName(c, catMap)}</b>
                        <small>{catCount(c)} article{catCount(c) === 1 ? '' : 's'}</small>
                      </span>
                      <span className="hc-go" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* By category */}
            {byCat.map(({ cat, items }) => (
              <div key={cat} className="mb-10">
                <h2 className="flex items-center gap-2.5 mb-4 hc-h2" style={{ fontSize: 18 }}>
                  <HelpCatMark cat={cat} catMap={catMap} size={30} /> {helpCatName(cat, catMap)}
                </h2>
                <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  {items.map((a, i) => (
                    <Link key={a.id} href={`/help/${a.id}`}
                      className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-all cursor-pointer group"
                      style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium group-hover:underline truncate" style={{ color: 'var(--ink)' }}>{a.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Contact / Ticketing */}
        <h2 className="hc-h2 mt-12 mb-4">Still need a hand?</h2>
        <div className="mb-6 grid md:grid-cols-3 gap-3">
          {[
            { c: '#ff6a4d', title: 'Live chat', line: 'Chat with our team in real time.', d: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, action: <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('colvy-open-chat'))} className="hc-btn go cv-shine"><span>Start a chat</span></button> },
            { c: '#8b5cf6', title: 'Submit a ticket', line: 'Tell us what’s up and we’ll get back to you.', d: <><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></>, action: <Link href="/help/ticket" className="hc-btn">Open a ticket</Link> },
            { c: '#0ea5e9', title: 'Email us', line: helpEmail || 'We usually reply within a day.', d: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></>, action: <a href={helpEmail ? `mailto:${helpEmail}` : '/help/ticket'} className="hc-btn">Send an email</a> },
          ].map(x => (
            <div key={x.title} className="hc-contact" style={{ '--c': x.c } as React.CSSProperties}>
              <span className="hc-contact-ic" aria-hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{x.d}</svg></span>
              <b>{x.title}</b>
              <p style={{ overflowWrap: 'anywhere' }}>{x.line}</p>
              {x.action}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// The Sellio pieces of the help centre home: topic chips, cards with a mark in
// each category's colour, and the contact cards.
const HC_CSS = `
.hc-h2{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.hc-chips{display:flex;flex-wrap:wrap;gap:8px}
.hc-chip{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:none;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07);font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s,transform .12s}
.hc-chip:hover{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 6px 16px -10px rgba(16,24,40,.3)}
.hc-chip:active{transform:scale(.98)}
.hc-chip i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.hc-chip b{font-weight:600;color:#a1a1aa;font-variant-numeric:tabular-nums}
.hc-chip.on{background:var(--ink);color:#fff;box-shadow:none}
.hc-chip.on b{color:rgba(255,255,255,.65)}
.hc-chip::before{display:none!important}
.hc-card{position:relative;display:block;padding:20px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);overflow:hidden;isolation:isolate;transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}
.hc-card::after{content:'';position:absolute;z-index:-1;right:-50px;top:-50px;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--c) 14%,transparent),transparent 70%)}
.hc-card:hover{transform:translateY(-3px);box-shadow:0 0 0 1px rgba(0,0,0,.07),0 20px 40px -22px rgba(16,24,40,.3)}
.hc-tag{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,#fff);color:color-mix(in srgb,var(--c) 80%,#000);font-size:12px;font-weight:650}
.hc-card-art{width:84px;height:84px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 9%,#fff)}
.hc-topic{position:relative;display:flex;align-items:center;gap:14px;padding:16px;border:none;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);font:inherit;text-align:left;cursor:pointer;transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}
.hc-topic::before{display:none!important}
.hc-topic:hover{transform:translateY(-2px);box-shadow:0 0 0 1px rgba(0,0,0,.07),0 16px 32px -20px rgba(16,24,40,.3)}
.hc-topic-t{flex:1;min-width:0}
.hc-topic-t b{display:block;font-size:15px;font-weight:650;color:var(--ink);line-height:1.3}
.hc-topic-t small{display:block;margin-top:2px;font-size:12.5px;color:var(--slate)}
.hc-go{width:30px;height:30px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5;color:var(--ink);transition:background .2s,color .2s,transform .25s}
.hc-topic:hover .hc-go{background:var(--c);color:#fff;transform:translateX(2px)}
.hc-contact{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:20px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.hc-contact-ic{width:42px;height:42px;margin-bottom:6px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 13%,#fff);color:var(--c)}
.hc-contact b{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.hc-contact p{margin:0 0 10px;font-size:13.5px;line-height:1.5;color:var(--slate)}
.hc-btn{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border:none;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.1);color:var(--ink);font:inherit;font-size:14px;font-weight:650;text-decoration:none;cursor:pointer;transition:background .15s}
.hc-btn:hover{background:#f4f4f5}
.hc-btn.go{background:var(--coral);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 10px 22px -12px var(--coral)}
.hc-btn.go:hover{background:var(--coral);filter:brightness(1.05)}
.hc-btn::before{display:none!important}
`
