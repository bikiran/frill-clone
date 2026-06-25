'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

// ─── Guest account helpers ───────────────────────────────────────────────────
function getOrCreateGuestId(): string {
  let id = localStorage.getItem('colvy_guest_id')
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('colvy_guest_id', id)
  }
  return id
}

function getGuestName(): string {
  return localStorage.getItem('colvy_guest_name') || 'Anonymous'
}

// ─── Idea Card component ──────────────────────────────────────────────────────
function IdeaRow({ idea, voted, onVote, onClick }: any) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border p-4 flex items-start gap-4 hover:shadow-sm transition-all cursor-pointer"
      style={{ borderColor: 'var(--border)' }}>
      <button onClick={e => { e.stopPropagation(); onVote(idea.id) }}
        className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all cursor-pointer shrink-0"
        style={{ borderColor: voted ? 'var(--coral)' : 'var(--border)', background: voted ? 'var(--peach)' : 'white' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={voted ? 'var(--coral)' : 'none'} stroke={voted ? 'var(--coral)' : 'var(--slate)'} strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
        <span className="text-sm font-bold" style={{ color: voted ? 'var(--coral)' : 'var(--ink)' }}>{idea.votes || 0}</span>
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>{idea.title}</p>
        {idea.description && <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--slate)' }}>{idea.description}</p>}
        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--slate)' }}>
          {idea.status && <span className="px-2 py-0.5 rounded-full capitalize" style={{ background: 'var(--canvas)' }}>{idea.status.replace('_', ' ')}</span>}
          <span>{idea.comments_count || 0} comments</span>
        </div>
      </div>
    </div>
  )
}

// ─── Submit Idea Modal ────────────────────────────────────────────────────────
function IdeaSubmitModal({ company, user, guestId, onClose, onSubmitted }: any) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      await (supabase as any).from('ideas').insert({
        title: title.trim(),
        description: description.trim(),
        company_id: company.id,
        created_by: user?.id || guestId,
        created_by_name: user?.user_metadata?.display_name || getGuestName(),
        votes: 0,
        status: 'under_review',
      })
      onSubmitted()
    } catch (err: any) { alert(err.message) }
    setLoading(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl border shadow-2xl p-6" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Share an Idea</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Help {company.name} build better products</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief, descriptive title" required autoFocus
              className="w-full px-4 py-2.5 rounded-xl border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Details <span style={{ color: 'var(--slate)' }}>(optional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the problem you're trying to solve..."
              rows={4} className="w-full px-4 py-2.5 rounded-xl border focus:outline-none resize-none"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border font-medium text-sm cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
            <button type="submit" disabled={loading || !title.trim()}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}>{loading ? 'Submitting...' : 'Submit Idea'}</button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── User Menu (top-right) ────────────────────────────────────────────────────
function UserMenu({ user, guestId, company, onSignOut }: any) {
  const [open, setOpen] = useState(false)
  const isGuest = !user || user.is_anonymous
  const name = user?.user_metadata?.display_name || getGuestName()
  const initial = name[0]?.toUpperCase() || 'A'

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer hover:bg-gray-50 transition-all"
        style={{ borderColor: 'var(--border)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: isGuest ? '#9ca3af' : 'var(--coral)' }}>
          {initial}
        </div>
        <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--ink)' }}>
          {isGuest ? 'Anonymous' : name}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {/* User info */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: isGuest ? '#9ca3af' : 'var(--coral)' }}>{initial}</div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{name}</p>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>
                    {isGuest ? 'Guest account' : user?.email || 'Board member'}
                  </p>
                </div>
              </div>
            </div>

            {isGuest ? (
              <>
                <div className="p-2">
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--slate)' }}>
                    You're voting as a guest. Create an account to track your votes.
                  </p>
                  <a href={`/signup?board=${company?.slug}`}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold cursor-pointer w-full hover:bg-gray-50"
                    style={{ color: 'var(--coral)' }}>
                    ✨ Create account
                  </a>
                  <a href={`/signin?board=${company?.slug}`}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer w-full hover:bg-gray-50"
                    style={{ color: 'var(--ink)' }}>
                    Sign in
                  </a>
                </div>
              </>
            ) : (
              <div className="p-2">
                <button className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer w-full hover:bg-gray-50 text-left"
                  style={{ color: 'var(--ink)' }}>
                  👤 My profile
                </button>
                <button className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer w-full hover:bg-gray-50 text-left"
                  style={{ color: 'var(--ink)' }}>
                  🔔 Notifications
                </button>
                <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                <button onClick={onSignOut}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer w-full hover:bg-gray-50 text-left"
                  style={{ color: '#ef4444' }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Board Page ──────────────────────────────────────────────────────────
export default function BoardPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [company, setCompany] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [guestId, setGuestId] = useState('')
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'votes' | 'recent'>('votes')
  const [showSubmit, setShowSubmit] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)

  useEffect(() => {
    if (!slug) return
    const gid = getOrCreateGuestId()
    setGuestId(gid)

    supabase.auth.getSession().then(({ data }: any) => {
      setUser(data?.session?.user || null)
    })

    loadBoard(gid)
  }, [slug])

  const loadBoard = async (gid: string) => {
    try {
      const co = await getCompanyBySlug(slug)
      if (!co) { setNotFound(true); setLoading(false); return }
      setCompany(co)

      // Check if current user is owner
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user
      if (u) {
        setUser(u)
        setIsOwner(u.id === co.owner_id)
        // Load user votes
        const { data: votes } = await (supabase as any).from('votes').select('idea_id').eq('user_id', u.id)
        setVotedIds(new Set((votes || []).map((v: any) => v.idea_id)))
      } else {
        // Load guest votes
        const { data: gvotes } = await (supabase as any).from('votes').select('idea_id').eq('guest_id', gid)
        setVotedIds(new Set((gvotes || []).map((v: any) => v.idea_id)))
      }

      // Load ideas
      const { data: ideasData } = await (supabase as any)
        .from('ideas')
        .select('*')
        .eq('company_id', co.id)
        .order('votes', { ascending: false })
      setIdeas(ideasData || [])
    } catch { setNotFound(true) }
    setLoading(false)
  }

  const handleVote = async (ideaId: string) => {
    const alreadyVoted = votedIds.has(ideaId)
    // Optimistic update
    const next = new Set(votedIds)
    alreadyVoted ? next.delete(ideaId) : next.add(ideaId)
    setVotedIds(next)
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: (i.votes || 0) + (alreadyVoted ? -1 : 1) } : i))

    try {
      if (user) {
        if (alreadyVoted) {
          await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('user_id', user.id)
        } else {
          await (supabase as any).from('votes').insert({ idea_id: ideaId, user_id: user.id, company_id: company.id })
        }
        await (supabase as any).from('ideas').update({ votes: ideas.find(i => i.id === ideaId)?.votes + (alreadyVoted ? -1 : 1) }).eq('id', ideaId)
      } else {
        // Guest vote
        if (alreadyVoted) {
          await (supabase as any).from('votes').delete().eq('idea_id', ideaId).eq('guest_id', guestId)
        } else {
          await (supabase as any).from('votes').insert({ idea_id: ideaId, guest_id: guestId, company_id: company.id })
        }
        await (supabase as any).from('ideas').update({ votes: ideas.find(i => i.id === ideaId)?.votes + (alreadyVoted ? -1 : 1) }).eq('id', ideaId)
      }
    } catch (err) {
      // Revert
      setVotedIds(votedIds)
      setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: (i.votes || 0) + (alreadyVoted ? 1 : -1) } : i))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsOwner(false)
    window.location.reload()
  }

  const filtered = ideas
    .filter(i => !search || i.title?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'votes' ? (b.votes || 0) - (a.votes || 0) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const accentColor = company?.accent_color || 'var(--coral)'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6" style={{ background: 'var(--canvas)' }}>
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Board not found</h1>
      <p className="mb-6" style={{ color: 'var(--slate)' }}>No board exists at <strong>{slug}.colvy.com</strong></p>
      <a href="https://colvy.com/signup" className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: accentColor }}>
        Create your board →
      </a>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Board Header */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo + name */}
          <div className="flex items-center gap-2.5 shrink-0">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ background: accentColor }}>
                {company.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-bold text-base" style={{ color: 'var(--ink)' }}>{company.name}</span>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `/board/${slug}` },
              { label: 'Roadmap', href: `/board/${slug}/roadmap` },
              { label: 'Updates', href: `/board/${slug}/announcements` },
            ].map(n => (
              <a key={n.label} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all"
                style={{ color: 'var(--slate)' }}>
                {n.label}
              </a>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Admin link — only for board owner */}
            {isOwner && (
              <a href="/admin"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                ⚙️ Admin
              </a>
            )}
            <UserMenu user={user} guestId={guestId} company={company} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="py-10 px-4 text-center border-b" style={{ borderColor: 'var(--border)', background: `linear-gradient(135deg, ${accentColor}10 0%, transparent 100%)` }}>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--ink)' }}>
          {company.name} Feedback
        </h1>
        {company.description && <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>{company.description}</p>}
        <button onClick={() => setShowSubmit(true)}
          className="px-6 py-2.5 rounded-xl font-semibold text-white cursor-pointer hover:opacity-90 transition-all"
          style={{ background: accentColor }}>
          + Share an Idea
        </button>
      </div>

      {/* Ideas */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search + sort */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            <option value="votes">Top</option>
            <option value="recent">Recent</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💡</div>
            <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>No ideas yet</p>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Be the first to share one!</p>
            <button onClick={() => setShowSubmit(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
              style={{ background: accentColor }}>
              + Share Idea
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(idea => (
              <IdeaRow key={idea.id} idea={idea} voted={votedIds.has(idea.id)}
                onVote={handleVote}
                onClick={() => setSelectedIdea(idea)} />
            ))}
          </div>
        )}
      </div>

      {/* Idea Detail */}
      {selectedIdea && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelectedIdea(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl border shadow-2xl p-6" style={{ borderColor: 'var(--border)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold pr-4" style={{ color: 'var(--ink)' }}>{selectedIdea.title}</h2>
              <button onClick={() => setSelectedIdea(null)} className="text-xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
            </div>
            {selectedIdea.description && <p className="text-sm mb-4" style={{ color: 'var(--ink)' }}>{selectedIdea.description}</p>}
            <div className="flex items-center gap-3">
              <button onClick={() => { handleVote(selectedIdea.id); setSelectedIdea(null) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm cursor-pointer transition-all"
                style={{ borderColor: votedIds.has(selectedIdea.id) ? 'var(--coral)' : 'var(--border)', background: votedIds.has(selectedIdea.id) ? 'var(--peach)' : 'white', color: votedIds.has(selectedIdea.id) ? 'var(--coral)' : 'var(--ink)' }}>
                ▲ {votedIds.has(selectedIdea.id) ? 'Voted' : 'Vote'} ({selectedIdea.votes || 0})
              </button>
            </div>
          </div>
        </>
      )}

      {/* Submit Idea Modal */}
      {showSubmit && (
        <IdeaSubmitModal
          company={company} user={user} guestId={guestId}
          onClose={() => setShowSubmit(false)}
          onSubmitted={() => { setShowSubmit(false); loadBoard(guestId) }}
        />
      )}

      {/* Powered by Colvy */}
      <div className="text-center py-6 border-t mt-8" style={{ borderColor: 'var(--border)' }}>
        <a href="https://colvy.com" className="text-xs" style={{ color: 'var(--slate)' }}>
          Powered by <span style={{ color: accentColor }}>Colvy</span>
        </a>
      </div>
    </div>
  )
}
