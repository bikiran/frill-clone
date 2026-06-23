'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { BellIcon, HeartIcon } from '@/components/Icons'

const TAG_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  Feature: { bg: '#dbeafe', color: '#0284c7', label: '✨ Feature' },
  'Bug Fix': { bg: '#fee2e2', color: '#dc2626', label: '🐛 Bug Fix' },
  Update: { bg: '#fef3c7', color: '#ca8a04', label: '📝 Update' },
  Improvement: { bg: '#dcfce7', color: '#16a34a', label: '⬆️ Improvement' },
  News: { bg: '#f3e8ff', color: '#7c3aed', label: '📢 News' },
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [user, setUser] = useState<any>(null)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [localReactions, setLocalReactions] = useState<Record<string, Record<string, number>>>({})
  const articleRefs = useRef<Record<string, HTMLElement>>({})
  const isAdmin = user?.email === 'bishalstha76@gmail.com'

  useEffect(() => {
    supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('status', 'published')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (data && data.length === 0) {
        const samples = [
          { title: "🚀 Welcome to Updates!", description: "This is where you'll find all our latest news, feature releases, and product improvements. We're committed to keeping you in the loop.", tag: 'News', views: 1, impressions: 1, is_pinned: true, status: 'published' },
          { title: "New Dashboard Released", description: "We've completely redesigned the dashboard with a focus on user experience and performance.", tag: 'Feature', views: 45, impressions: 312, is_pinned: false, status: 'published' },
          { title: "Critical Bug Fixed", description: "Fixed an issue where some users couldn't vote on ideas. All users are now able to participate.", tag: 'Bug Fix', views: 28, impressions: 156, is_pinned: false, status: 'published' },
        ]
        for (const s of samples) await supabase.from('announcements').insert(s)
        const { data: nd } = await supabase.from('announcements').select('*').eq('status', 'published').order('created_at', { ascending: false })
        setAnnouncements(nd || [])
        if (nd?.[0]) setSelectedId(nd[0].id)
      } else {
        setAnnouncements(data || [])
        if (data?.[0] && !selectedId) setSelectedId(data[0].id)
        // Load user's likes and subscriptions
        if (user) {
          await loadUserPreferences(data || [])
        }
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const loadUserPreferences = async (anns: any[]) => {
    if (!user) return
    try {
      const annIds = anns.map(a => a.id)
      const { data: likes } = await supabase
        .from('announcement_likes')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', annIds)
      
      const { data: subs } = await supabase
        .from('announcement_subscribers')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', annIds)

      setLikedIds(new Set(likes?.map(l => l.announcement_id) || []))
      setSubscribedIds(new Set(subs?.map(s => s.announcement_id) || []))
    } catch (err) {
      console.error('Error loading preferences:', err)
    }
  }

  const handleSelect = async (ann: any) => {
    setSelectedId(ann.id)
    setTimeout(() => {
      articleRefs.current[ann.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    // Track view
    await supabase.from('announcements').update({
      views: (ann.views || 0) + 1,
    }).eq('id', ann.id)
  }

  const toggleLike = async (id: string) => {
    if (!user) {
      alert('Please sign in to like')
      return
    }
    
    const isLiked = likedIds.has(id)
    try {
      if (isLiked) {
        await supabase.from('announcement_likes').delete().eq('announcement_id', id).eq('user_id', user.id)
        setLikedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        await supabase.from('announcement_likes').insert({ announcement_id: id, user_id: user.id })
        setLikedIds(prev => new Set(prev).add(id))
      }
    } catch (err) {
      console.error('Like error:', err)
    }
  }

  const toggleSubscribe = async (id: string) => {
    if (!user) {
      alert('Please sign in to subscribe')
      return
    }

    const isSubscribed = subscribedIds.has(id)
    try {
      if (isSubscribed) {
        await supabase.from('announcement_subscribers').delete().eq('announcement_id', id).eq('user_id', user.id)
        setSubscribedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        await supabase.from('announcement_subscribers').insert({ announcement_id: id, user_id: user.id })
        setSubscribedIds(prev => new Set(prev).add(id))
      }
    } catch (err) {
      console.error('Subscribe error:', err)
    }
  }

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/announcements?id=${id}`)
  }

  const addReaction = async (ann: any, emoji: string) => {
    const current = (ann.reactions as Record<string, number>) || {}
    const updated = { ...current, [emoji]: (current[emoji] || 0) + 1 }
    setLocalReactions(prev => ({ ...prev, [ann.id]: updated }))
    await supabase.from('announcements').update({ reactions: updated }).eq('id', ann.id)
  }

  const grouped = announcements.reduce((acc, ann) => {
    const month = new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!acc[month]) acc[month] = []
    acc[month].push(ann)
    return acc
  }, {} as Record<string, any[]>)

  const filtered = announcements.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="h-screen flex bg-white">
      {/* ─── SIDEBAR ─── */}
      <aside className="w-80 border-r flex flex-col overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search announcements..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-white focus:outline-none text-sm"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements yet</p>
            </div>
          ) : (
            <div className="relative py-2">
              <div className="absolute left-[22px] top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />
              {Object.entries(grouped).map(([month, items]) => (
                <div key={month}>
                  <div className="pl-12 pr-4 py-1.5 sticky top-0 z-10 bg-white">
                    <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--slate)' }}>{month}</p>
                  </div>
                  {items.map(ann => {
                    const isActive = selectedId === ann.id
                    const tagCfg = TAG_COLORS[ann.tag] || TAG_COLORS.Update
                    return (
                      <button
                        key={ann.id}
                        onClick={() => handleSelect(ann)}
                        className="w-full text-left flex items-start gap-3 px-4 py-3 transition-smooth hover:bg-gray-50 relative"
                        style={{ background: isActive ? 'var(--peach)' : 'transparent' }}>
                        <div className="relative shrink-0 mt-1 z-10">
                          <div
                            className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center transition-all"
                            style={{
                              background: isActive ? 'var(--coral)' : 'var(--border)',
                              boxShadow: isActive ? '0 0 0 3px var(--peach), 0 0 0 5px var(--coral)' : 'none',
                              transform: isActive ? 'scale(1.2)' : 'scale(1)',
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          {ann.is_pinned && (
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--coral)' }}>
                              📌 Pinned
                            </p>
                          )}
                          <p
                            className="text-sm font-semibold line-clamp-2 leading-snug"
                            style={{ color: isActive ? 'var(--coral)' : 'var(--ink)' }}>
                            {ann.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: tagCfg.bg, color: tagCfg.color }}>
                              {tagCfg.label}
                            </span>
                            <span className="text-[11px]" style={{ color: 'var(--slate)' }}>
                              {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ─── MAIN FEED ─── */}
      <main className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
            {[1, 2].map(i => <div key={i} className="space-y-3"><div className="skeleton h-8 w-2/3 rounded" /><div className="skeleton h-4 rounded" /><div className="skeleton h-4 w-4/5 rounded" /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-5xl mb-4">📢</div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>No announcements yet</h3>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Check back soon for updates!</p>
              {isAdmin && (
                <Link href="/admin/announcements/new"
                  className="inline-block px-6 py-3 rounded-xl font-semibold text-white transition-smooth hover:shadow-lg"
                  style={{ background: 'var(--coral)' }}>
                  Create First Announcement
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 md:px-12 py-8 md:py-12">
            {filtered.map(ann => {
              const tagCfg = TAG_COLORS[ann.tag] || TAG_COLORS.Update
              const liked = likedIds.has(ann.id)
              const subscribed = subscribedIds.has(ann.id)
              return (
                <article
                  key={ann.id}
                  id={`ann-${ann.id}`}
                  ref={el => { if (el) articleRefs.current[ann.id] = el }}
                  className="mb-16 pb-16 border-b last:border-b-0 last:mb-0 last:pb-0 scroll-mt-6 transition-all"
                  style={{ borderColor: 'var(--border)' }}>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold transition-smooth" style={{ background: tagCfg.bg, color: tagCfg.color }}>
                      {tagCfg.label}
                    </span>
                    {ann.is_pinned && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold transition-smooth" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                        📌 Pinned
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>
                      {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Title */}
                  <h1 className="text-2xl md:text-3xl font-bold mb-5 leading-tight" style={{ color: 'var(--ink)' }}>
                    {ann.title}
                  </h1>

                  {/* Action bar */}
                  <div className="flex items-center gap-2 mb-8 flex-wrap">
                    <button
                      onClick={() => toggleSubscribe(ann.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all cursor-pointer hover:shadow-sm active:scale-95"
                      style={{
                        borderColor: subscribed ? 'var(--coral)' : 'var(--border)',
                        color: subscribed ? 'var(--coral)' : 'var(--ink)',
                        background: subscribed ? 'var(--peach)' : 'white',
                      }}>
                      <BellIcon size={13} color={subscribed ? 'var(--coral)' : 'var(--slate)'} />
                      {subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                    <button
                      onClick={() => toggleLike(ann.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all cursor-pointer hover:shadow-sm active:scale-95"
                      style={{
                        borderColor: liked ? 'var(--coral)' : 'var(--border)',
                        color: liked ? 'var(--coral)' : 'var(--ink)',
                        background: liked ? 'var(--peach)' : 'white',
                      }}>
                      <HeartIcon size={13} color={liked ? 'var(--coral)' : 'var(--slate)'} />
                      {liked ? 'Liked' : 'Like'}
                    </button>

                    {/* Quick emoji reactions */}
                    <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl border transition-smooth"
                      style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      {['👍', '❤️', '😂', '🔥'].map(emoji => {
                        const count = (localReactions[ann.id] || ann.reactions || {})[emoji] || 0
                        return (
                          <button
                            key={emoji}
                            onClick={() => addReaction(ann, emoji)}
                            className="flex items-center gap-0.5 w-8 h-7 rounded-lg justify-center hover:bg-white hover:shadow-sm transition-all hover:scale-110 cursor-pointer text-sm active:scale-95"
                            title={`React with ${emoji}`}>
                            {emoji}
                            {count > 0 && (
                              <span className="text-[10px] font-bold leading-none" style={{ color: 'var(--coral)' }}>{count}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* 3-dot menu (admin actions) */}
                    {isAdmin && (
                      <div className="relative ml-auto">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === ann.id ? null : ann.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer transition-all hover:bg-gray-50 active:scale-95"
                          style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                          </svg>
                        </button>
                        {openMenuId === ann.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                              <Link
                                href={`/admin/announcements/new?edit=${ann.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-smooth"
                                style={{ color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit
                              </Link>
                              <button
                                onClick={() => { copyLink(ann.id); setOpenMenuId(null) }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-smooth text-left cursor-pointer"
                                style={{ color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Copy link
                              </button>
                              <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                              <button
                                onClick={async () => {
                                  if (!confirm('Delete this announcement?')) return
                                  await supabase.from('announcements').delete().eq('id', ann.id)
                                  setOpenMenuId(null)
                                  fetchAnnouncements()
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-50 transition-smooth text-left cursor-pointer"
                                style={{ color: '#dc2626' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 md:gap-12 mb-8 pb-6 border-b flex-wrap" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--slate)' }}>Views</p>
                      <p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>{ann.views || 0}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--slate)' }}>Likes</p>
                      <p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>
                        {announcements.find(a => a.id === ann.id) ? 'Tracked' : '0'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--slate)' }}>Subscribers</p>
                      <p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>
                        {announcements.find(a => a.id === ann.id) ? 'Tracked' : '0'}
                      </p>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="prose prose-base max-w-none mb-8"
                    style={{ color: 'var(--ink)', lineHeight: '1.8' }}>
                    {ann.description?.includes('<') ? (
                      <div dangerouslySetInnerHTML={{ __html: ann.description }} />
                    ) : (
                      <p className="whitespace-pre-wrap">{ann.description}</p>
                    )}
                  </div>

                  {/* Quick reactions display */}
                  {ann.reactions && Object.keys(ann.reactions).length > 0 && (
                    <div className="flex items-center gap-2 mb-6 flex-wrap">
                      {Object.entries(ann.reactions as Record<string, number>).map(([emoji, count]) =>
                        count > 0 ? (
                          <span key={emoji} className="flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-smooth" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                            {emoji} <span className="font-semibold">{count}</span>
                          </span>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Attached Poll/Survey */}
                  {(ann.poll_id || ann.survey_id) && (
                    <div className="p-4 rounded-xl border mb-6 transition-smooth" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Attached</p>
                      <div className="flex gap-2 flex-wrap">
                        {ann.poll_id && (
                          <a href={`/polls/${ann.poll_id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md active:scale-95"
                            style={{ background: '#dbeafe', color: '#0369a1' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/><path d="M15 10h2v7h-2z"/></svg>
                            Vote in Poll
                          </a>
                        )}
                        {ann.survey_id && (
                          <a href={`/surveys/${ann.survey_id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md active:scale-95"
                            style={{ background: '#dcfce7', color: '#16a34a' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            Take Survey
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
