'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'

function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('colvy_guest_id')
  if (!id) { id = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('colvy_guest_id', id) }
  return id
}

const SORT_OPTIONS = ['Trending', 'Latest', 'Most Votes']

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
  const [statuses, setStatuses] = useState<any[]>([])
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('Trending')
  const [showModal, setShowModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [guestVotes, setGuestVotes] = useState<Set<string>>(new Set())

  useEffect(() => { if (slug) loadBoard() }, [slug])

  const loadBoard = async () => {
    setLoading(true)
    try {
      const co = await getCompanyBySlug(slug)
      if (!co) { setNotFound(true); setLoading(false); return }
      setCompany(co)

      if (co.accent_color) {
        document.documentElement.style.setProperty('--coral', co.accent_color)
        document.documentElement.style.setProperty('--peach', co.accent_color + '15')
      }

      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user || null
      setUser(u)
      if (u) setIsOwner(u.id === co.owner_id)

      // Fetch ideas
      const { data: ideaData } = await (supabase as any)
        .from('ideas').select('*').eq('company_id', co.id).order('votes', { ascending: false })
      setIdeas(ideaData || [])

      // Fetch votes
      if (u) {
        const { data: votes } = await (supabase as any).from('votes').select('idea_id').eq('user_id', u.id)
        setUserVotes(new Set((votes || []).map((v: any) => v.idea_id)))
      } else {
        const gid = getOrCreateGuestId()
        const { data: gvotes } = await (supabase as any).from('votes').select('idea_id').eq('guest_id', gid)
        setGuestVotes(new Set((gvotes || []).map((v: any) => v.idea_id)))
      }

      // Fetch topics
      const { data: topicData } = await (supabase as any).from('topics').select('*').eq('company_id', co.id)
      setTopics(topicData || [])

      // Fetch statuses
      const { data: statusData } = await (supabase as any)
        .from('statuses').select('*').eq('company_id', co.id).order('order_index', { ascending: true })
      setStatuses(statusData || [])

      // Auto-seed if empty
      if (!ideaData?.length) {
        try {
          await fetch('/api/seed-company', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: co.id, companyName: co.name })
          })
          // Reload ideas after seed
          const { data: newIdeas } = await (supabase as any)
            .from('ideas').select('*').eq('company_id', co.id).order('votes', { ascending: false })
          setIdeas(newIdeas || [])
          const { data: newStatuses } = await (supabase as any)
            .from('statuses').select('*').eq('company_id', co.id).order('order_index', { ascending: true })
          setStatuses(newStatuses || [])
          const { data: newTopics } = await (supabase as any).from('topics').select('*').eq('company_id', co.id)
          setTopics(newTopics || [])
        } catch {}
      }

    } catch (e) { console.error(e); setNotFound(true) }
    setLoading(false)
  }

  const handleVote = async (ideaId: string) => {
    const gid = getOrCreateGuestId()
    const voted = user ? userVotes.has(ideaId) : guestVotes.has(ideaId)
    const delta = voted ? -1 : 1
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: (i.votes || 0) + delta } : i))
    if (user) {
      const next = new Set(userVotes); voted ? next.delete(ideaId) : next.add(ideaId); setUserVotes(next)
      if (voted) await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('user_id', user.id)
      else await (supabase as any).from('votes').insert({ idea_id: ideaId, user_id: user.id, company_id: company?.id })
    } else {
      const next = new Set(guestVotes); voted ? next.delete(ideaId) : next.add(ideaId); setGuestVotes(next)
      if (voted) await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('guest_id', gid)
      else await (supabase as any).from('votes').insert({ idea_id: ideaId, guest_id: gid, company_id: company?.id })
    }
    await (supabase as any).from('ideas').update({ votes: (ideas.find(i => i.id === ideaId)?.votes || 0) + delta }).eq('id', ideaId)
  }

  // Status key matching - handles both 'new' and 'Under consideration' formats
  const matchesStatus = (ideaStatus: string, statusKey: string) => {
    const s = (ideaStatus || '').toLowerCase().replace(/\s+/g, '_')
    const k = (statusKey || '').toLowerCase().replace(/\s+/g, '_')
    return s === k || s === k.replace(/_/g, '') || ideaStatus === statusKey
  }

  // Topic counts
  const topicCounts = topics.map(t => ({
    ...t,
    count: ideas.filter(i => i.topic_id === t.id).length
  })).filter(t => t.count > 0)

  // Status counts — use 'key' field (new, planned, in_progress, shipped)
  const statusCounts = statuses.map(s => ({
    ...s,
    displayName: s.label || s.name || s.key,
    count: ideas.filter(i => matchesStatus(i.status, s.key || s.name || s.label)).length
  }))

  // Filter + sort
  const filtered = ideas
    .filter(i => {
      if (topicFilter && i.topic_id !== topicFilter) return false
      if (statusFilter) {
        const st = statuses.find(s => (s.label || s.name || s.key) === statusFilter)
        if (st && !matchesStatus(i.status, st.key || st.name || st.label)) return false
      }
      if (search && !i.title?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'Latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'Most Votes') return (b.votes || 0) - (a.votes || 0)
      const ageA = Math.max(1, (Date.now() - new Date(a.created_at).getTime()) / 3600000)
      const ageB = Math.max(1, (Date.now() - new Date(b.created_at).getTime()) / 3600000)
      return ((b.votes || 0) / ageB) - ((a.votes || 0) / ageA)
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
      <a href="https://colvy.com/signup" className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--coral)' }}>
        Create your board →
      </a>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">

          {/* LEFT SIDEBAR */}
          <aside className="hidden lg:flex flex-col w-48 shrink-0">
            {statusCounts.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Statuses</p>
                  <Link href="/roadmap" className="text-xs hover:underline" style={{ color: 'var(--coral)' }}>View all</Link>
                </div>
                {statusCounts.map(s => (
                  <button key={s.key || s.id}
                    onClick={() => setStatusFilter(statusFilter === s.displayName ? null : s.displayName)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left cursor-pointer mb-0.5 transition-all"
                    style={{ background: statusFilter === s.displayName ? (s.color + '20') : 'transparent', color: statusFilter === s.displayName ? s.color : 'var(--slate)' }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color || 'var(--coral)' }} />
                    {s.displayName}
                  </button>
                ))}
              </div>
            )}

            {topicCounts.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {topicCounts.map(t => (
                    <button key={t.id}
                      onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all"
                      style={{
                        background: topicFilter === t.id ? 'var(--coral)' : 'var(--canvas)',
                        color: topicFilter === t.id ? 'white' : 'var(--slate)',
                        border: `1px solid ${topicFilter === t.id ? 'var(--coral)' : 'var(--border)'}`,
                      }}>
                      {t.emoji && <span>{t.emoji}</span>}
                      {t.name}<span className="opacity-60 ml-0.5">{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* MAIN CONTENT */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-5">
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--slate)' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90 shrink-0"
                style={{ background: 'var(--coral)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Submit Idea
              </button>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="pl-3 pr-8 py-2.5 rounded-xl border text-sm focus:outline-none cursor-pointer shrink-0 bg-white"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm" style={{ color: 'var(--slate)' }}>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{filtered.length}</span> idea{filtered.length !== 1 ? 's' : ''} total
              </p>
              {(topicFilter || statusFilter || search) && (
                <button onClick={() => { setTopicFilter(null); setStatusFilter(null); setSearch('') }}
                  className="text-xs cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>
                  Clear filters
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">💡</div>
                <p className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                  {search ? 'No ideas match your search' : 'No ideas yet'}
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
                  {search ? 'Try different keywords' : 'Be the first to share an idea!'}
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
                    onVote={handleVote}
                    onClick={() => { setSelectedIdea(idea); setShowDetailModal(true) }}
                    onStatusChange={isOwner ? async (id: string, status: string) => {
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
          onClose={() => { setShowDetailModal(false); setSelectedIdea(null); loadBoard() }}
        />
      )}
    </div>
  )
}
