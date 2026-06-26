'use client'

// Board page for a specific company subdomain
// Reuses the same design as colvy.com but filtered by company_id
// This page is served when visiting prexty.colvy.com, arik.colvy.com, etc.

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'
import { toggleEngagement, fetchEngagedIdeaIds } from '@/lib/engagement'

function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('colvy_guest_id')
  if (!id) { id = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('colvy_guest_id', id) }
  return id
}

export default function BoardPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [company, setCompany] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [topics, setTopics] = useState<any[]>([])
  const [customStatuses, setCustomStatuses] = useState<any[]>([])
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'trending' | 'latest' | 'most_votes'>('trending')
  const [showModal, setShowModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [guestVotes, setGuestVotes] = useState<Set<string>>(new Set())
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set())
  const [userSubscriptions, setUserSubscriptions] = useState<Set<string>>(new Set())
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    if (!slug) return
    loadBoard()
  }, [slug])

  const loadBoard = async () => {
    try {
      const co = await getCompanyBySlug(slug)
      if (!co) { setNotFound(true); setLoading(false); return }
      setCompany(co)

      // Apply company accent color
      if (co.accent_color && typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--coral', co.accent_color)
        document.documentElement.style.setProperty('--peach', co.accent_color + '15')
      }

      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user || null
      setUser(u)
      if (u) setIsOwner(u.id === co.owner_id)

      await Promise.all([
        fetchIdeas(co.id, u),
        fetchTopics(co.id),
        fetchStatuses(co.id),
      ])
    } catch { setNotFound(true) }
    setLoading(false)
  }

  const fetchIdeas = async (companyId: string, u: any) => {
    const { data } = await (supabase as any).from('ideas').select('*').eq('company_id', companyId).order('votes', { ascending: false })
    setIdeas(data || [])

    if (u) {
      const { data: votes } = await (supabase as any).from('votes').select('idea_id').eq('user_id', u.id)
      setUserVotes(new Set((votes || []).map((v: any) => v.idea_id)))
      const likedIds = await fetchEngagedIdeaIds('idea_likes')
      const subIds = await fetchEngagedIdeaIds('idea_subscriptions')
      setUserLikes(likedIds)
      setUserSubscriptions(subIds)
    } else {
      const gid = getOrCreateGuestId()
      const { data: gvotes } = await (supabase as any).from('votes').select('idea_id').eq('guest_id', gid)
      setGuestVotes(new Set((gvotes || []).map((v: any) => v.idea_id)))
    }
  }

  const fetchTopics = async (companyId: string) => {
    const { data } = await (supabase as any).from('topics').select('*').eq('company_id', companyId)
    setTopics(data || [])
  }

  const fetchStatuses = async (companyId: string) => {
    const { data } = await (supabase as any).from('statuses').select('*').eq('company_id', companyId).order('order_index', { ascending: true })
    setCustomStatuses(data || [])
  }

  const handleVote = async (ideaId: string) => {
    const gid = getOrCreateGuestId()
    const voted = user ? userVotes.has(ideaId) : guestVotes.has(ideaId)
    const delta = voted ? -1 : 1
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: (i.votes || 0) + delta } : i))

    if (user) {
      const next = new Set(userVotes); voted ? next.delete(ideaId) : next.add(ideaId); setUserVotes(next)
      if (voted) await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('user_id', user.id)
      else await (supabase as any).from('votes').insert({ idea_id: ideaId, user_id: user.id, company_id: company.id })
    } else {
      const next = new Set(guestVotes); voted ? next.delete(ideaId) : next.add(ideaId); setGuestVotes(next)
      if (voted) await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('guest_id', gid)
      else await (supabase as any).from('votes').insert({ idea_id: ideaId, guest_id: gid, company_id: company.id })
    }
    await (supabase as any).from('ideas').update({ votes: ideas.find(i => i.id === ideaId)?.votes + delta }).eq('id', ideaId)
  }

  const handleLike = async (ideaId: string) => {
    if (!user) return
    const liked = userLikes.has(ideaId)
    const next = new Set(userLikes); liked ? next.delete(ideaId) : next.add(ideaId); setUserLikes(next)
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, likes: (i.likes || 0) + (liked ? -1 : 1) } : i))
    await toggleEngagement('idea_likes', ideaId, liked)
  }

  const handleSubscribe = async (ideaId: string) => {
    if (!user) return
    const subbed = userSubscriptions.has(ideaId)
    const next = new Set(userSubscriptions); subbed ? next.delete(ideaId) : next.add(ideaId); setUserSubscriptions(next)
    await toggleEngagement('idea_subscriptions', ideaId, subbed)
  }

  // Topic counts
  const topicCounts = topics.map(t => ({
    ...t,
    count: ideas.filter(i => i.topic_id === t.id).length
  })).filter(t => t.count > 0)

  // Status counts from custom statuses
  const statusCounts = customStatuses.map(s => ({
    ...s,
    count: ideas.filter(i => i.status === s.name.toLowerCase().replace(/\s+/g, '_') || i.status === s.name).length
  }))

  // Filter and sort
  const filtered = ideas
    .filter(i => !topicFilter || i.topic_id === topicFilter)
    .filter(i => !statusFilter || i.status === statusFilter)
    .filter(i => !search || i.title?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'most_votes') return (b.votes || 0) - (a.votes || 0)
      // trending = votes / age
      const ageA = (Date.now() - new Date(a.created_at).getTime()) / 3600000
      const ageB = (Date.now() - new Date(b.created_at).getTime()) / 3600000
      return ((b.votes || 0) / Math.max(ageB, 1)) - ((a.votes || 0) / Math.max(ageA, 1))
    })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6" style={{ background: 'var(--canvas)' }}>
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Board not found</h1>
      <p className="mb-6" style={{ color: 'var(--slate)' }}>No board exists at <strong>{slug}.colvy.com</strong></p>
      <Link href="https://colvy.com/signup" className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--coral)' }}>
        Create your board →
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Reuse the same layout as colvy.com — header is handled by app/layout.tsx */}
      {/* But we need a company-specific nav on subdomains */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur-md" style={{ borderColor: 'var(--border)' }}>
        <nav className="h-14 px-6 flex items-center justify-between max-w-5xl mx-auto">
          <Link href={`/board/${slug}`} className="flex items-center gap-2 font-bold text-lg">
            {company.logo_url
              ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" onError={(e: any) => e.target.style.display='none'} />
              : null}
            <span style={{ color: 'var(--coral)' }}>{company.name}</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `/board/${slug}`, active: true },
              { label: 'Roadmap', href: `/board/${slug}/roadmap` },
              { label: 'Updates', href: `/board/${slug}/announcements` },
              { label: 'Help', href: `/board/${slug}/help` },
            ].map(n => (
              <Link key={n.label} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-smooth"
                style={{ color: n.active ? 'var(--coral)' : 'var(--slate)', background: n.active ? 'var(--peach)' : 'transparent' }}>
                {n.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {isOwner && (
              <Link href="/admin"
                className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                Admin
              </Link>
            )}
            {user ? (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer"
                  style={{ background: 'var(--coral)' }}>
                  {(user.user_metadata?.display_name || user.email || '?')[0].toUpperCase()}
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{user.email}</p>
                      </div>
                      <div className="py-1.5">
                        <Link href="/account" onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer"
                          style={{ color: 'var(--ink)' }}>
                          👤 My Account
                        </Link>
                        <button onClick={async () => { await supabase.auth.signOut(); setUser(null); setShowUserMenu(false) }}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer w-full text-left"
                          style={{ color: '#ef4444' }}>
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/signin"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'var(--coral)' }}>
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Main content — same layout as colvy.com */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Left sidebar — statuses + topics */}
          <aside className="hidden lg:flex flex-col w-52 shrink-0">
            {/* Statuses */}
            {statusCounts.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Statuses</p>
                  <Link href={`/board/${slug}/roadmap`} className="text-xs hover:underline" style={{ color: 'var(--coral)' }}>View all</Link>
                </div>
                <div className="space-y-0.5">
                  {statusCounts.map(s => (
                    <button key={s.id} onClick={() => setStatusFilter(statusFilter === s.name ? null : s.name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left cursor-pointer transition-smooth"
                      style={{ background: statusFilter === s.name ? s.color + '20' : 'transparent', color: statusFilter === s.name ? s.color : 'var(--slate)' }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color || 'var(--coral)' }} />
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Topics */}
            {topicCounts.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {topicCounts.map(t => (
                    <button key={t.id} onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-smooth"
                      style={{
                        background: topicFilter === t.id ? 'var(--coral)' : 'var(--canvas)',
                        color: topicFilter === t.id ? 'white' : 'var(--slate)',
                        border: `1px solid ${topicFilter === t.id ? 'var(--coral)' : 'var(--border)'}`,
                      }}>
                      {t.emoji} {t.name}<span className="ml-1 opacity-60">{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Ideas list */}
          <div className="flex-1 min-w-0">
            {/* Search + controls */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search ideas..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px', background: 'white' }} />
              </div>
              <button onClick={() => setShowModal(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90 transition-smooth shrink-0"
                style={{ background: 'var(--coral)' }}>
                + Submit Idea
              </button>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none cursor-pointer shrink-0"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'white' }}>
                <option value="trending">Trending</option>
                <option value="latest">Latest</option>
                <option value="most_votes">Most Votes</option>
              </select>
            </div>

            {/* Ideas */}
            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">💡</div>
                <p className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                  {search ? 'No ideas match your search' : 'No ideas yet'}
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
                  {search ? 'Try a different search term' : 'Be the first to share an idea!'}
                </p>
                {!search && (
                  <button onClick={() => setShowModal(true)}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
                    style={{ background: 'var(--coral)' }}>
                    + Submit Idea
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    hasVoted={user ? userVotes.has(idea.id) : guestVotes.has(idea.id)}
                    liked={userLikes.has(idea.id)}
                    subscribed={userSubscriptions.has(idea.id)}
                    onVote={handleVote}
                    onLike={handleLike}
                    onSubscribe={handleSubscribe}
                    onClick={() => { setSelectedIdea(idea); setShowDetailModal(true) }}
                    onStatusChange={isOwner ? async (id, status) => {
                      await (supabase as any).from('ideas').update({ status }).eq('id', id)
                      setIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i))
                    } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Powered by — only if not hidden */}
      <div className="text-center py-6 border-t mt-8" style={{ borderColor: 'var(--border)' }}>
        <a href="https://colvy.com" className="text-xs" style={{ color: 'var(--slate)' }}>
          Powered by <span style={{ color: 'var(--coral)' }}>Colvy</span>
        </a>
      </div>

      {showModal && (
        <IdeaModal
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); loadBoard() }}
          companyId={company?.id}
        />
      )}
      {showDetailModal && selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => { setShowDetailModal(false); setSelectedIdea(null) }}
          onUpdated={loadBoard}
          isAdmin={isOwner}
        />
      )}
    </div>
  )
}
