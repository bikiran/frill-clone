'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const CATEGORY_ICONS: Record<string, string> = {
  'Getting Started': '🚀',
  'Features': '✨',
  'Billing': '💳',
  'Integrations': '🔗',
  'Troubleshooting': '🔧',
  'API': '⚡',
  'Other': '📁',
}

const DEMO_ARTICLES = [
  { id: 'demo-1', title: 'Getting started with Frill', content: 'Welcome to Frill! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\nAfter signing up, your feedback board is automatically created. You can customize it from the Admin panel.\n\n## Step 2: Invite your team\nGo to Admin → Team Members to invite colleagues.\n\n## Step 3: Collect feedback\nShare your board URL with customers and start collecting ideas.', category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28 },
  { id: 'demo-2', title: 'How to create and manage ideas', content: 'Ideas are the core of Frill. Here\'s how to manage them effectively.\n\n## Creating ideas\nClick "Share an Idea" on your board to submit new ideas. Customers can also submit ideas directly.\n\n## Voting\nUsers can upvote ideas they care about. The most voted ideas rise to the top.\n\n## Status management\nUpdate idea status from Admin to keep users informed: Under Review → Planned → In Progress → Shipped.', category: 'Features', status: 'published', featured: true, views: 98, likes: 19 },
  { id: 'demo-3', title: 'Setting up your public roadmap', content: 'The roadmap gives customers visibility into your product direction.\n\n## Enabling roadmap\nGo to Admin → Settings → Site Navigation and enable Roadmap.\n\n## Adding ideas to roadmap\nFrom the Ideas board, mark ideas as "Show on Roadmap" to display them.\n\n## Kanban columns\nDrag ideas between columns: Under Consideration, Planned, In Development, Shipped.', category: 'Features', status: 'published', featured: false, views: 76, likes: 12 },
  { id: 'demo-4', title: 'Publishing announcements', content: 'Keep customers updated with Announcements (your changelog).\n\n## Creating an announcement\nGo to Admin → Announcements → New Announcement.\n\n## Tags\nUse tags like Feature, Bug Fix, Update to categorize announcements.\n\n## Boost\nEnable Boost to display the announcement as a banner or modal in your widget.\n\n## Notify subscribers\nToggle "Notify subscribers" to email users when you publish.', category: 'Features', status: 'published', featured: false, views: 54, likes: 9 },
  { id: 'demo-5', title: 'Embedding the Frill widget', content: 'Add Frill to your app with a simple JavaScript snippet.\n\n## Installation\nPaste this code before the closing </body> tag:\n\n```\n<script src="https://yourapp.frill.co/embed.js"></script>\n```\n\n## Configuration\nCustomize the widget color, position, and which features to show.\n\n## SSO\nPass user data to Frill so users are automatically logged in when they open the widget.', category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41 },
  { id: 'demo-6', title: 'Connecting Slack', content: 'Get notified in Slack when new ideas are submitted.\n\n## Setup\n1. Go to Admin → Settings → Integrations\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post (new ideas, comments, status changes)\n\n## Notifications\nFrill will post a message to your chosen channel whenever a trigger event occurs.', category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11 },
  { id: 'demo-7', title: 'Understanding your subscription', content: 'Frill offers flexible plans for every team size.\n\n## Free plan\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan ($99/month)\nUnlimited team members, white labeling, API access, advanced analytics.\n\n## Enterprise\nSSO, custom integrations, priority support, SLA.\n\n## Changing plans\nGo to Settings → Billing to upgrade or downgrade at any time.', category: 'Billing', status: 'published', featured: false, views: 45, likes: 7 },
  { id: 'demo-8', title: 'Why can\'t users vote?', content: 'If users are unable to vote on ideas, here are the most common causes.\n\n## Guest voting disabled\nGo to Admin → Settings → Guest Access and ensure "Allow guest voting" is enabled.\n\n## User not logged in\nIf you\'ve disabled guest voting, users must sign in to vote.\n\n## Already voted\nUsers can only vote once per idea. They can un-vote by clicking the vote button again.\n\n## Contact support\nIf none of these apply, please contact us via the support form below.', category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14 },
  { id: 'demo-9', title: 'REST API overview', content: 'Frill provides a REST API for programmatic access to your data.\n\n## Authentication\nAll API requests require an API key in the Authorization header:\n```\nAuthorization: Bearer YOUR_API_KEY\n```\n\n## Endpoints\n- GET /api/v1/ideas — List all ideas\n- POST /api/v1/ideas — Create an idea\n- GET /api/v1/announcements — List announcements\n\n## Rate limiting\nAPI requests are limited to 1000 per hour per key.', category: 'API', status: 'published', featured: false, views: 123, likes: 22 },
]

export default function HelpCentrePage() {
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    fetchArticles()
  }, [])

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

  const fetchArticles = async () => {
    try {
      const { data } = await (supabase as any).from('help_articles').select('*').eq('status', 'published').order('created_at', { ascending: false })
      setArticles(data?.length ? data : DEMO_ARTICLES)
    } catch { setArticles(DEMO_ARTICLES) }
    setLoading(false)
  }

  const isAdmin = user?.email === ADMIN_EMAIL
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Hero */}
      <div className="py-16 px-6 text-center" style={{ background: 'var(--peach)' }}>
        <div className="text-4xl mb-3">📚</div>
        <h1 className="text-4xl font-black mb-3" style={{ color: 'var(--ink)' }}>Help Centre</h1>
        <p className="mb-8 text-lg" style={{ color: 'var(--slate)' }}>Find answers, guides, and resources</p>

        {/* Live search */}
        <div className="max-w-xl mx-auto relative" ref={searchRef}>
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 z-10" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => search && setShowSearchDropdown(searchResults.length > 0)}
            placeholder="Search articles..."
            className="w-full pl-12 pr-4 py-3.5 rounded-xl border focus:outline-none bg-white text-base shadow-sm"
            style={{ borderColor: showSearchDropdown ? 'var(--coral)' : 'var(--border)', fontSize: '16px' }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setShowSearchDropdown(false) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-lg"
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
                    <span className="text-lg mt-0.5">{CATEGORY_ICONS[a.category] || '📄'}</span>
                    <div>
                      <p className="text-sm font-semibold text-left" style={{ color: 'var(--ink)' }}>{a.title}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{a.category}</p>
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
        {isAdmin && (
          <div className="mt-5">
            <Link href="/admin/help" className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-block" style={{ background: 'var(--coral)' }}>
              ⚙️ Manage Articles
            </Link>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="border-b py-4 bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-8 text-sm" style={{ color: 'var(--slate)' }}>
          <span>{articles.length} articles</span>
          <span>{allCategories.length} categories</span>
          <span>{articles.reduce((sum, a) => sum + (a.views || 0), 0)} total views</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Category filter pills */}
        <div className="flex gap-2 flex-wrap mb-8">
          <button onClick={() => setCategoryFilter(null)}
            className="px-4 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all"
            style={{ background: !categoryFilter ? 'var(--coral)' : 'white', color: !categoryFilter ? 'white' : 'var(--slate)', borderColor: !categoryFilter ? 'var(--coral)' : 'var(--border)' }}>
            All
          </button>
          {allCategories.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className="px-4 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all flex items-center gap-1.5"
              style={{ background: categoryFilter === cat ? 'var(--coral)' : 'white', color: categoryFilter === cat ? 'white' : 'var(--slate)', borderColor: categoryFilter === cat ? 'var(--coral)' : 'var(--border)' }}>
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>No articles found</p>
            <p className="mt-1" style={{ color: 'var(--slate)' }}>Try a different search or browse by category</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured.length > 0 && !search && (
              <div className="mb-10">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>⭐ Featured Articles</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {featured.map(a => (
                    <Link key={a.id} href={`/help/${a.id}`}
                      className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all cursor-pointer group"
                      style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{CATEGORY_ICONS[a.category] || '📄'}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{a.category}</span>
                      </div>
                      <h3 className="font-bold mb-2 group-hover:opacity-70 transition-all" style={{ color: 'var(--ink)' }}>{a.title}</h3>
                      <p className="text-sm line-clamp-2" style={{ color: 'var(--slate)' }}>
                        {a.content?.replace(/#{1,6} /g, '').replace(/```[\s\S]*?```/g, '').slice(0, 100)}...
                      </p>
                      <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>{a.views || 0} views · {a.likes || 0} helpful</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* By category */}
            {byCat.map(({ cat, items }) => (
              <div key={cat} className="mb-10">
                <h2 className="flex items-center gap-2 text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>
                  <span>{CATEGORY_ICONS[cat]}</span> {cat}
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
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="text-3xl mb-3">💬</div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--ink)' }}>Live Chat</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Chat with our support team in real time</p>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer w-full" style={{ background: 'var(--coral)' }}>
              Start Chat
            </button>
          </div>
          <div className="bg-white rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="text-3xl mb-3">🎫</div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--ink)' }}>Submit a Ticket</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Open a support ticket and we'll get back to you</p>
            <Link href="/help/ticket" className="px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer w-full block" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Open Ticket
            </Link>
          </div>
          <div className="bg-white rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="text-3xl mb-3">📧</div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--ink)' }}>Email Support</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Send us an email and we'll respond within 24h</p>
            <a href="mailto:support@frill.co" className="px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer w-full block" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Send Email
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
