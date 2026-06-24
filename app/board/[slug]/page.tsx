'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'

export default function BoardPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [company, setCompany] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [topics, setTopics] = useState<any[]>([])
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'votes' | 'recent'>('votes')

  useEffect(() => {
    if (!slug) return
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    loadBoard()
  }, [slug])

  const loadBoard = async () => {
    try {
      const co = await getCompanyBySlug(slug)
      if (!co) { setNotFound(true); setLoading(false); return }
      setCompany(co)
      await Promise.all([fetchIdeas(co.id), fetchTopics(co.id)])
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }

  const fetchIdeas = async (companyId: string) => {
    const { data } = await (supabase as any)
      .from('ideas')
      .select('*')
      .eq('company_id', companyId)
      .order('votes', { ascending: false })
    setIdeas(data || [])
  }

  const fetchTopics = async (companyId: string) => {
    const { data } = await (supabase as any)
      .from('topics')
      .select('id, name, emoji')
      .eq('company_id', companyId)
    setTopics(data || [])
  }

  const handleVote = async (ideaId: string) => {
    if (!user) { alert('Please sign in to vote'); return }
    const voted = userVotes.has(ideaId)
    const next = new Set(userVotes)
    voted ? next.delete(ideaId) : next.add(ideaId)
    setUserVotes(next)
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: (i.votes || 0) + (voted ? -1 : 1) } : i))
    if (voted) {
      await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('user_id', user.id)
    } else {
      await (supabase as any).from('votes').insert({ idea_id: ideaId, user_id: user.id })
    }
  }

  const filtered = ideas
    .filter(i => !topicFilter || i.topic_id === topicFilter)
    .filter(i => !search || i.title?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'votes' ? (b.votes || 0) - (a.votes || 0) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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

  const accentColor = company.accent_color || 'var(--coral)'

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Board Header */}
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
            ) : (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: accentColor }}>
                {company.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-bold text-base" style={{ color: 'var(--ink)' }}>{company.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/board/${slug}/roadmap`} className="px-3 py-1.5 text-sm hover:opacity-70" style={{ color: 'var(--slate)' }}>Roadmap</Link>
            <Link href={`/board/${slug}/announcements`} className="px-3 py-1.5 text-sm hover:opacity-70" style={{ color: 'var(--slate)' }}>Updates</Link>
            {user ? (
              <Link href="/admin" className="px-3 py-1.5 text-sm font-semibold rounded-lg" style={{ background: 'var(--peach)', color: accentColor }}>
                Admin
              </Link>
            ) : (
              <Link href="/signin" className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: accentColor }}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Board Hero */}
      <div className="py-10 px-6 text-center" style={{ background: `linear-gradient(135deg, ${accentColor}15 0%, var(--canvas) 100%)` }}>
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--ink)' }}>{company.name} Feedback</h1>
        {company.description && <p style={{ color: 'var(--slate)' }}>{company.description}</p>}
        <button onClick={() => setShowModal(true)}
          className="mt-6 px-8 py-3 rounded-xl font-semibold text-white cursor-pointer hover:opacity-90 transition-all"
          style={{ background: accentColor }}>
          + Share an Idea
        </button>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex gap-4 md:gap-6">
          {/* Sidebar topics */}
          {topics.length > 0 && (
            <aside className="hidden md:block w-44 shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Topics</p>
              <button onClick={() => setTopicFilter(null)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 cursor-pointer"
                style={{ background: !topicFilter ? 'var(--peach)' : 'transparent', color: !topicFilter ? accentColor : 'var(--slate)', fontWeight: !topicFilter ? 600 : 400 }}>
                All
              </button>
              {topics.map(t => (
                <button key={t.id} onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 cursor-pointer"
                  style={{ background: topicFilter === t.id ? 'var(--peach)' : 'transparent', color: topicFilter === t.id ? accentColor : 'var(--slate)', fontWeight: topicFilter === t.id ? 600 : 400 }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </aside>
          )}

          {/* Ideas list */}
          <div className="flex-1 min-w-0">
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search ideas..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                <option value="votes">Top</option>
                <option value="recent">Recent</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">💡</div>
                <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>No ideas yet</p>
                <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Be the first to share an idea!</p>
                <button onClick={() => setShowModal(true)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
                  style={{ background: accentColor }}>
                  + Share Idea
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    hasVoted={userVotes.has(idea.id)}
                    liked={userLikes.has(idea.id)}
                    onVote={handleVote}
                    onClick={() => { setSelectedIdea(idea); setShowDetailModal(true) }}
                    onStatusChange={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
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
          onUpdated={() => loadBoard()}
          isAdmin={false}
        />
      )}
    </div>
  )
}
