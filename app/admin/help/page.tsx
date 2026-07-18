'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IconEdit, IconLink, IconView, IconDelete } from '@/components/SvgIcons'


const SEED_ARTICLES = [
  { title: 'Getting started with Colvy', content: `# Getting started with Colvy\n\nWelcome to Colvy! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\n\nAfter signing up, your feedback board is automatically created. Customize it from the Admin panel.\n\n## Step 2: Invite your team\n\nGo to **Admin → Team Members** to invite colleagues.\n\n## Step 3: Collect feedback\n\nShare your board URL with customers and start collecting ideas.`, category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28 },
  { title: 'How to create and manage ideas', content: `# How to create and manage ideas\n\nIdeas are the core of Colvy. Here's how to manage them effectively.\n\n## Creating ideas\n\nClick **"Share an Idea"** on your board to submit new ideas. Customers can also submit directly.\n\n## Voting\n\nUsers can upvote ideas they care about. The most voted rise to the top.\n\n## Status management\n\nUpdate idea status: Under Review → Planned → In Progress → Shipped.`, category: 'Features', status: 'published', featured: true, views: 98, likes: 19 },
  { title: 'Setting up your public roadmap', content: `# Setting up your public roadmap\n\nThe roadmap gives customers visibility into your product direction.\n\n## Enabling roadmap\n\nGo to **Admin → Settings → Site Navigation** and enable Roadmap.\n\n## Adding ideas\n\nFrom the Ideas board, mark ideas as "Show on Roadmap".\n\n## Kanban columns\n\nDrag ideas between: Under Consideration → Planned → In Development → Shipped.`, category: 'Features', status: 'published', featured: false, views: 76, likes: 12 },
  { title: 'Publishing announcements', content: `# Publishing announcements\n\nKeep customers updated with Announcements (your changelog).\n\n## Creating an announcement\n\nGo to **Admin → Announcements → New Announcement**.\n\n## Tags\n\nUse tags like Feature, Bug Fix, Update to categorize announcements.\n\n## Boost\n\nEnable Boost to display as a banner or modal in your widget.\n\n## Notify subscribers\n\nToggle "Notify subscribers" to email users when you publish.`, category: 'Features', status: 'published', featured: false, views: 54, likes: 9 },
  { title: 'Embedding the Colvy widget', content: `# Embedding the Colvy widget\n\nAdd Colvy to your app with a simple JavaScript snippet.\n\n## Installation\n\nPaste this code before the closing \`</body>\` tag:\n\n\`\`\`html\n<script src="https://yourapp.colvy.com/embed.js"></script>\n\`\`\`\n\n## Configuration\n\nCustomize the widget color, position, and features.\n\n## SSO\n\nPass user data to Colvy so users are automatically logged in.`, category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41 },
  { title: 'Connecting Slack', content: `# Connecting Slack\n\nGet notified in Slack when new ideas are submitted.\n\n## Setup\n\n1. Go to **Admin → Settings → Integrations**\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post\n\n## Notifications\n\nFrill posts to your chosen channel on new ideas, comments, and status changes.`, category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11 },
  { title: 'Understanding your subscription', content: `# Understanding your subscription\n\nFrill offers flexible plans for every team size.\n\n## Free plan\n\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan ($99/month)\n\nUnlimited team members, white labeling, API access, advanced analytics.\n\n## Enterprise\n\nSSO, custom integrations, priority support, SLA.\n\n## Changing plans\n\nGo to **Settings → Billing** to upgrade or downgrade at any time.`, category: 'Billing', status: 'published', featured: false, views: 45, likes: 7 },
  { title: "Why can't users vote?", content: `# Why can't users vote?\n\nIf users are unable to vote on ideas, here are the most common causes.\n\n## Guest voting disabled\n\nGo to **Admin → Settings → Guest Access** and ensure "Allow guest voting" is enabled.\n\n## User not logged in\n\nIf you've disabled guest voting, users must sign in to vote.\n\n## Already voted\n\nUsers can only vote once per idea. They can un-vote by clicking again.`, category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14 },
  { title: 'REST API overview', content: `# REST API overview\n\nColvy provides a REST API for programmatic access to your data.\n\n## Authentication\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\n## Endpoints\n\n- \`GET /api/v1/ideas\` — List all ideas\n- \`POST /api/v1/ideas\` — Create an idea\n- \`GET /api/v1/announcements\` — List announcements\n\n## Rate limiting\n\n1,000 requests per hour per API key.`, category: 'API', status: 'published', featured: false, views: 123, likes: 22 },
]

export default function HelpAdminPage() {
  // Get company_id from hostname slug (most reliable approach)
  const getMyCompanyId = async () => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      fetchArticles()
    })
  }, [router])

  const fetchArticles = async () => {
    try {
      const companyId = await getMyCompanyId()
      let q = (supabase as any).from('help_articles').select('*').order('created_at', { ascending: false })
      if (companyId) q = q.eq('company_id', companyId)
      const { data } = await q
      const list = data || []
      setArticles(list)
      if (list.length > 0) setSelected((prev: any) => prev ? list.find((a: any) => a.id === prev.id) || list[0] : list[0])
    } catch { setArticles([]) }
    setLoading(false)
  }

  const seedArticles = async () => {
    setSeeding(true)
    try {
      await (supabase as any).from('help_articles').insert(
        SEED_ARTICLES.map(a => ({ ...a, media: [] }))
      )
      await fetchArticles()
    } catch (err: any) {
      alert('Seed failed: ' + err.message)
    }
    setSeeding(false)
  }

  const deleteArticle = async (id: string) => {
    if (!confirm('Delete this article?')) return
    await (supabase as any).from('help_articles').delete().eq('id', id)
    setArticles(prev => prev.filter((a: any) => a.id !== id))
    if (selected?.id === id) setSelected(null)
    setOpenMenuId(null)
  }

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/help/${id}`)
    alert('Link copied!')
    setOpenMenuId(null)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const CATEGORY_COLORS: Record<string, any> = {
    'Getting Started': { bg: '#dbeafe', color: '#2563eb' },
    'Features':        { bg: 'var(--peach)', color: 'var(--coral)' },
    'Billing':         { bg: '#dcfce7', color: '#16a34a' },
    'Integrations':    { bg: '#faf5ff', color: '#7c3aed' },
    'Troubleshooting': { bg: '#fff7ed', color: '#ea580c' },
    'API':             { bg: '#f0fdf4', color: '#15803d' },
    'Other':           { bg: '#f9fafb', color: '#6b7280' },
  }

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    // A fixed height (not min-height) is important: the sidebar list and the
    // article pane below both use overflow-y-auto, and an inner scroll container
    // only works if its parent has a real height to scroll within. With
    // min-height the article pane stretched instead and its content got cut off
    // at the bottom with no way to scroll further.
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin" className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>← Admin</Link>
          <Link href="/admin/help/new" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer" title="New Article">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
            {articles.length} Articles
          </p>
          {articles.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>No articles yet</p>
              <button onClick={seedArticles} disabled={seeding}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {seeding ? 'Seeding...' : '✨ Add Sample Articles'}
              </button>
            </div>
          ) : (
            articles.map(a => (
              <button key={a.id} onClick={() => setSelected(a)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-gray-50 cursor-pointer mb-0.5"
                style={{ background: selected?.id === a.id ? 'var(--peach)' : 'transparent', color: 'var(--ink)', fontWeight: selected?.id === a.id ? 600 : 400, borderLeft: selected?.id === a.id ? '2px solid var(--coral)' : '2px solid transparent' }}>
                <p className="truncate">{a.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={CATEGORY_COLORS[a.category] || CATEGORY_COLORS['Other']}>{a.category}</span>
                  <span className="text-xs" style={{ color: a.status === 'published' ? '#16a34a' : 'var(--slate)' }}>
                    {a.status === 'published' ? '● Live' : '○ Draft'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
        {articles.length > 0 && articles.length < 9 && (
          <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={seedArticles} disabled={seeding}
              className="w-full px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
              {seeding ? 'Adding...' : '+ Add Sample Articles'}
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="px-4 md:px-8 py-6 pb-24">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Help Centre</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                {articles.length} articles · {articles.filter(a => a.status === 'published').length} published
              </p>
            </div>
            <div className="flex gap-2">
              {articles.length === 0 && (
                <button onClick={seedArticles} disabled={seeding}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {seeding ? '⏳ Adding...' : '✨ Add Sample Articles'}
                </button>
              )}
              <Link href="/admin/help/new"
                className="px-4 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer"
                style={{ background: 'var(--coral)' }}>
                + New Article
              </Link>
            </div>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-5xl mb-4">📚</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Your Help Centre</h2>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Create articles to help your users succeed</p>
              <div className="flex gap-3">
                <button onClick={seedArticles} disabled={seeding}
                  className="px-6 py-2.5 rounded-xl font-semibold border text-sm cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {seeding ? 'Adding...' : '✨ Add 9 Sample Articles'}
                </button>
                <Link href="/admin/help/new" className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm" style={{ background: 'var(--coral)' }}>
                  Write New Article
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Content */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold" style={CATEGORY_COLORS[selected.category] || CATEGORY_COLORS['Other']}>
                    {selected.category}
                  </span>
                  {selected.featured && <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#fef9c3', color: '#ca8a04' }}>⭐ Featured</span>}
                  <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: selected.status === 'published' ? '#dcfce7' : '#f3f4f6', color: selected.status === 'published' ? '#16a34a' : '#6b7280' }}>
                    {selected.status === 'published' ? '● Published' : '○ Draft'}
                  </span>
                </div>

                <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{selected.title}</h2>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{formatDate(selected.created_at)} · {selected.views || 0} views · {selected.likes || 0} helpful</p>

                <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
                  <div className="prose max-w-none text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)', fontSize: '15px', lineHeight: 1.8 }}>
                    {selected.content?.replace(/#{1,6} /g, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').slice(0, 600)}
                    {selected.content?.length > 600 && '...'}
                  </div>
                </div>

                {/* Media gallery preview */}
                {selected.media?.length > 0 && (
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Media ({selected.media.length})</p>
                    <div className="flex gap-2 flex-wrap">
                      {selected.media.map((m: any, i: number) => (
                        <div key={i} className="w-20 h-16 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                          {m.type === 'youtube' ? (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: '#fef2f2' }}>
                              <span>▶️</span>
                            </div>
                          ) : m.type === 'video' ? (
                            <video src={m.src} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={m.src} className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Stats</p>
                  <div className="space-y-3">
                    {[
                      { label: 'Views', value: selected.views || 0 },
                      { label: 'Helpful votes', value: selected.likes || 0 },
                      { label: 'Status', value: selected.status === 'published' ? '● Live' : '○ Draft' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: 'var(--slate)' }}>{s.label}</span>
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Actions</p>
                  <div className="space-y-2">
                    <Link href={`/admin/help/new?edit=${selected.id}`}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <IconEdit /> Edit Article
                    </Link>
                    <button onClick={() => copyLink(selected.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <IconLink /> Copy Link
                    </button>
                    <Link href={`/help/${selected.id}`} target="_blank"
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <IconView /> View Live
                    </Link>
                    <button onClick={() => deleteArticle(selected.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-red-50 cursor-pointer"
                      style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                      <IconDelete /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
