'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'

function getGuestId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('colvy_guest_id')
  if (!id) { id = 'guest_' + Math.random().toString(36).slice(2); localStorage.setItem('colvy_guest_id', id) }
  return id
}

const PLACEHOLDERS = ['Search ideas...', 'Type to filter...', 'What are you looking for?', 'Search 💡 ideas...']

export default function BoardPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [company, setCompany]     = useState<any>(null)
  const [notFound, setNotFound]   = useState(false)
  const [ideas, setIdeas]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [user, setUser]           = useState<any>(null)
  const [isOwner, setIsOwner]     = useState(false)
  const [topics, setTopics]       = useState<any[]>([])
  const [statuses, setStatuses]   = useState<any[]>([])
  const [topicFilter, setTopicFilter]   = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [sortBy, setSortBy]       = useState<'trending'|'latest'|'top'>('trending')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [guestVotes, setGuestVotes] = useState<Set<string>>(new Set())
  const [phIdx, setPhIdx]         = useState(0)
  const sortRef = useRef<HTMLDivElement>(null)

  // Rotating placeholder
  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDERS.length), 3000)
    return () => clearInterval(t)
  }, [])

  // Close sort menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSortMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => { if (slug) loadBoard() }, [slug])

  const loadBoard = async () => {
    setLoading(true)
    try {
      const co = await getCompanyBySlug(slug)
      if (!co) { setNotFound(true); setLoading(false); return }
      setCompany(co)
      if (co.accent_color) {
        document.documentElement.style.setProperty('--coral', co.accent_color)
        document.documentElement.style.setProperty('--peach', co.accent_color + '18')
      }

      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user || null
      setUser(u); if (u) setIsOwner(u.id === co.owner_id)

      const [{ data: ideaData }, { data: topicData }, { data: statusData }] = await Promise.all([
        (supabase as any).from('ideas').select('*').eq('company_id', co.id).order('votes', { ascending: false }),
        (supabase as any).from('topics').select('*').eq('company_id', co.id),
        (supabase as any).from('statuses').select('*').eq('company_id', co.id).order('order_index', { ascending: true }),
      ])
      setIdeas(ideaData || [])
      setTopics(topicData || [])
      setStatuses(statusData || [])

      if (u) {
        const { data: votes } = await (supabase as any).from('votes').select('idea_id').eq('user_id', u.id)
        setUserVotes(new Set((votes || []).map((v: any) => v.idea_id)))
      } else {
        const { data: gv } = await (supabase as any).from('votes').select('idea_id').eq('guest_id', getGuestId())
        setGuestVotes(new Set((gv || []).map((v: any) => v.idea_id)))
      }

      // Auto-seed if empty
      if (!ideaData?.length) {
        const r = await fetch('/api/seed-company', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: co.id, companyName: co.name })
        })
        const d = await r.json()
        if (d.success && !d.skipped) {
          const [{ data: i2 }, { data: t2 }, { data: s2 }] = await Promise.all([
            (supabase as any).from('ideas').select('*').eq('company_id', co.id).order('votes', { ascending: false }),
            (supabase as any).from('topics').select('*').eq('company_id', co.id),
            (supabase as any).from('statuses').select('*').eq('company_id', co.id).order('order_index', { ascending: true }),
          ])
          setIdeas(i2 || []); setTopics(t2 || []); setStatuses(s2 || [])
        }
      }
    } catch (e) { console.error(e); setNotFound(true) }
    setLoading(false)
  }

  const handleVote = async (ideaId: string) => {
    const gid = getGuestId()
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

  // Status key matcher
  const matchStatus = (ideaStatus: string, key: string) => {
    const s = (ideaStatus || '').toLowerCase().trim()
    const k = (key || '').toLowerCase().trim()
    return s === k || s.replace(/[\s_]/g, '') === k.replace(/[\s_]/g, '')
  }

  const topicCounts = topics.map(t => ({ ...t, count: ideas.filter(i => i.topic_id === t.id).length }))
  const statusCounts = statuses.map(s => ({
    ...s, displayLabel: s.label || s.name || s.key,
    count: ideas.filter(i => matchStatus(i.status, s.key || s.label || s.name)).length
  }))

  const SORT_LABELS = { trending: 'Trending', latest: 'Latest', top: 'Most Votes' }

  const filtered = ideas
    .filter(i => {
      if (topicFilter && i.topic_id !== topicFilter) return false
      if (statusFilter) {
        const st = statuses.find(s => (s.label || s.name || s.key) === statusFilter)
        if (st && !matchStatus(i.status, st.key || st.label || st.name)) return false
      }
      if (search && !i.title?.toLowerCase().includes(search.toLowerCase()) &&
          !i.description?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'top') return (b.votes || 0) - (a.votes || 0)
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
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Board not found</h1>
      <p className="mb-6" style={{ color: 'var(--slate)' }}>No board exists at <strong>{slug}.colvy.com</strong></p>
      <a href="https://colvy.com/signup" className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--coral)' }}>
        Create your board →
      </a>
    </div>
  )

  const hasFilters = !!(topicFilter || statusFilter || search)

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

          {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
          <aside style={{ width: 176, flexShrink: 0, display: 'none' }} className="lg:block-sidebar">
            <style>{`.lg\\:block-sidebar{display:block!important}@media(max-width:1023px){.lg\\:block-sidebar{display:none!important}}`}</style>

            {/* Statuses */}
            {statusCounts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--slate)' }}>Statuses</span>
                  <Link href="/roadmap" style={{ fontSize: 11, color: 'var(--coral)', textDecoration: 'none', fontWeight: 500 }}>View all</Link>
                </div>
                {statusCounts.map(s => {
                  const active = statusFilter === s.displayLabel
                  return (
                    <button key={s.id || s.key}
                      onClick={() => setStatusFilter(active ? null : s.displayLabel)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: active ? (s.color + '18') : 'transparent',
                        color: active ? s.color : 'var(--slate)',
                        fontSize: 13, fontWeight: active ? 600 : 400,
                        textAlign: 'left', marginBottom: 2, transition: 'all 0.15s',
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color || 'var(--coral)', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayLabel}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Topics */}
            {topicCounts.filter(t => t.count > 0).length > 0 && (
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--slate)', display: 'block', marginBottom: 8 }}>Topics</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topicCounts.filter(t => t.count > 0).map(t => {
                    const active = topicFilter === t.id
                    return (
                      <button key={t.id}
                        onClick={() => setTopicFilter(active ? null : t.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                          cursor: 'pointer', border: `1px solid ${active ? 'var(--coral)' : 'var(--border)'}`,
                          background: active ? 'var(--coral)' : 'transparent',
                          color: active ? '#fff' : 'var(--slate)', transition: 'all 0.15s',
                        }}>
                        {t.name}<span style={{ opacity: 0.55, marginLeft: 4 }}>{t.count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </aside>

          {/* ── MAIN CONTENT ──────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Top bar: search + submit + sort */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>

              {/* Search */}
              <div style={{ flex: 1, position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--slate)' }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={PLACEHOLDERS[phIdx]}
                  style={{
                    width: '100%', padding: '9px 36px 9px 36px', borderRadius: 12,
                    border: `1px solid ${search ? 'var(--coral)' : 'var(--border)'}`,
                    outline: 'none', fontSize: 14, background: '#fff', color: 'var(--ink)',
                    boxShadow: search ? '0 0 0 3px var(--peach)' : 'none',
                    transition: 'all 0.2s', boxSizing: 'border-box',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--slate)' }}>
                    ×
                  </button>
                )}
              </div>

              {/* Submit */}
              <button onClick={() => setShowModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                  borderRadius: 12, background: 'var(--coral)', color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Submit Idea
              </button>

              {/* Sort dropdown */}
              <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setShowSortMenu(!showSortMenu)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px',
                    borderRadius: 12, border: '1px solid var(--border)', background: '#fff',
                    color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/>
                  </svg>
                  {SORT_LABELS[sortBy]}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {showSortMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setShowSortMenu(false)} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 148,
                    }}>
                      {(['trending', 'latest', 'top'] as const).map(k => (
                        <button key={k} onClick={() => { setSortBy(k); setShowSortMenu(false) }}
                          style={{
                            width: '100%', padding: '9px 14px', textAlign: 'left', border: 'none',
                            background: sortBy === k ? 'var(--peach)' : 'transparent',
                            color: sortBy === k ? 'var(--coral)' : 'var(--ink)',
                            fontWeight: sortBy === k ? 600 : 400, fontSize: 13, cursor: 'pointer',
                          }}>
                          {SORT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Count + clear filters */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>
                <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> idea{filtered.length !== 1 ? 's' : ''} total
              </p>
              {hasFilters && (
                <button onClick={() => { setTopicFilter(null); setStatusFilter(null); setSearch('') }}
                  style={{ fontSize: 12, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Clear filters
                </button>
              )}
            </div>

            {/* Ideas list */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <svg style={{ margin: '0 auto 16px', display: 'block', color: 'var(--slate)', opacity: 0.3 }}
                  width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2a7 7 0 0 1 7 7c0 2.76-1.58 5.16-3.9 6.37L15 17H9l-.1-1.63A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/>
                  <line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="17" x2="14.5" y2="17"/>
                </svg>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                  {search ? 'No ideas match your search' : 'No ideas yet'}
                </p>
                <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20 }}>
                  {search ? 'Try different keywords' : 'Be the first to share an idea!'}
                </p>
                {!search && (
                  <button onClick={() => setShowModal(true)}
                    style={{ padding: '10px 24px', borderRadius: 12, background: 'var(--coral)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    + Submit Idea
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    hasVoted={user ? userVotes.has(idea.id) : guestVotes.has(idea.id)}
                    onVote={handleVote}
                    onClick={() => { setSelectedIdea(idea); setShowDetail(true) }}
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
        <IdeaModal onClose={() => setShowModal(false)} onSubmitted={() => { setShowModal(false); loadBoard() }} companyId={company?.id} />
      )}
      {showDetail && selectedIdea && (
        <IdeaDetailModal idea={selectedIdea} onClose={() => { setShowDetail(false); setSelectedIdea(null); loadBoard() }} />
      )}
    </div>
  )
}
