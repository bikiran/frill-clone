'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { BellIcon, HeartIcon } from '@/components/Icons'

const TAG_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  new_feature: { bg: '#dbeafe', color: '#0284c7', label: 'New Feature' },
  improvement: { bg: '#fef3c7', color: '#ca8a04', label: 'Improvement' },
  bug_fix: { bg: '#fee2e2', color: '#dc2626', label: 'Bug Fix' },
  announcement: { bg: '#f3e8ff', color: '#7c3aed', label: 'Announcement' },
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [localReactions, setLocalReactions] = useState<Record<string, Record<string, number>>>({})
  const articleRefs = useRef<Record<string, HTMLElement>>({})
  const sidebarRefs = useRef<Record<string, HTMLElement>>({})
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)
  const isProgrammaticScroll = useRef(false)

  useEffect(() => {
    supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) {
        import('@/lib/board').then(({ isCompanyAdminUser }) => {
          isCompanyAdminUser(u).then(setIsCompanyAdmin)
        })
      }
    })
    fetchAnnouncements()
  }, [])

  const isOnCompanySubdomain = () => {
    if (typeof window === 'undefined') return false
    const h = window.location.hostname
    return h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
  }
  const getCompanyId = async () => {
    if (typeof window === 'undefined') return null
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
      const slug = h.replace('.colvy.com', '')
      const { data } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
      return data?.id || null
    }
    return null
  }

  const fetchAnnouncements = async () => {
    try {
      const companyId = await getCompanyId()
      let q = (supabase as any).from('announcements').select('*')
      if (companyId) q = q.eq('company_id', companyId)
      else if (isOnCompanySubdomain()) { setLoading(false); return }
      const { data } = await q.order('created_at', { ascending: false })

      // Only company admins may see drafts; the public sees published only
      const { isCompanyAdminUser } = await import('@/lib/board')
      const { data: { session } } = await supabase.auth.getSession()
      const admin = session?.user ? await isCompanyAdminUser(session.user) : false
      const visible = (data || []).filter((a: any) => admin || a.status === 'published')

      setAnnouncements(visible)
      if (visible?.[0] && !selectedId) setSelectedId(visible[0].id)
    } catch (err) {
      console.error(err)
    }

    // Set page title with company name
    if (typeof document !== 'undefined') {
      const h = window.location.hostname
      const slug = h.endsWith('.colvy.com') ? h.replace('.colvy.com','') : null
      if (slug) {
        const coName = document.querySelector('meta[name="company-name"]')?.getAttribute('content') || slug
        // Tab title is set centrally by app/layout.tsx
      }
    }
    setLoading(false)
      // Set page title from company name
      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const slug = h.replace('.colvy.com', '')
          const cached = localStorage.getItem(`company_${slug}`)
          const co = cached ? JSON.parse(cached) : null
          const name = co?.name || slug.charAt(0).toUpperCase() + slug.slice(1)
          // Tab title is set centrally by app/layout.tsx
        }
      }
  }

  const handleSelect = async (ann: any) => {
    setSelectedId(ann.id)
    // Scroll to article
    isProgrammaticScroll.current = true
    setTimeout(() => {
      articleRefs.current[ann.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => { isProgrammaticScroll.current = false }, 700)
    }, 50)
    // Track view + impression
    await (supabase as any).from('announcements').update({
      impressions: (ann.impressions || 0) + 1,
      views: (ann.views || 0) + 1,
    }).eq('id', ann.id)
    // Update local state
    setAnnouncements((prev: any[]) => prev.map((a: any) => a.id === ann.id ? { ...a, views: (a.views || 0) + 1, impressions: (a.impressions || 0) + 1 } : a))
  }

  const toggleLike = async (id: string) => {
    const userId = user?.id || ('guest_' + (localStorage.getItem('guest_id') || Math.random().toString(36).slice(2)))
    if (!localStorage.getItem('guest_id') && !user?.id) localStorage.setItem('guest_id', userId.replace('guest_', ''))
    const isLiked = likedIds.has(id)
    setLikedIds(prev => {
      const next = new Set(prev)
      isLiked ? next.delete(id) : next.add(id)
      return next
    })
    try {
      if (isLiked) {
        await (supabase as any).from('announcement_likes').delete().eq('announcement_id', id).eq('user_id', userId)
      } else {
        await (supabase as any).from('announcement_likes').insert({ announcement_id: id, user_id: userId })
      }
    } catch (err) { console.log('Like persist error:', err) }
  }

  const toggleSubscribe = async (id: string) => {
    const userId = user?.id || ('guest_' + (localStorage.getItem('guest_id') || Math.random().toString(36).slice(2)))
    if (!localStorage.getItem('guest_id') && !user?.id) localStorage.setItem('guest_id', userId.replace('guest_', ''))
    const isSub = subscribedIds.has(id)
    setSubscribedIds(prev => {
      const next = new Set(prev)
      isSub ? next.delete(id) : next.add(id)
      return next
    })
    try {
      if (isSub) {
        await (supabase as any).from('announcement_subscribers').delete().eq('announcement_id', id).eq('user_id', userId)
      } else {
        await (supabase as any).from('announcement_subscribers').insert({ announcement_id: id, user_id: userId })
      }
    } catch (err) { console.log('Subscribe persist error:', err) }
  }

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/announcements?id=${id}`)
    alert('Link copied!')
  }

  const addReaction = async (ann: any, emoji: string) => {
    const current = (ann.reactions as Record<string, number>) || {}
    const updated = { ...current, [emoji]: (current[emoji] || 0) + 1 }
    // Optimistic local update
    setLocalReactions(prev => ({ ...prev, [ann.id]: updated }))
    await supabase.from('announcements').update({ reactions: updated }).eq('id', ann.id)
  }

  const filtered = announcements.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase())
  )

  // As the reader scrolls the articles, highlight the matching sidebar item and
  // gently scroll the sidebar to keep it aligned with the article in view.
  useEffect(() => {
    const ids = filtered.map(a => a.id)
    if (ids.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      if (isProgrammaticScroll.current) return
      // Pick the entry nearest the top that is intersecting.
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const top = visible[0]
      if (!top) return
      const id = (top.target as HTMLElement).dataset.annId
      if (!id) return
      setSelectedId(id)
      // Scroll the matching sidebar item into view within the sidebar only.
      const el = sidebarRefs.current[id]
      const container = sidebarScrollRef.current
      if (el && container) {
        const elRect = el.getBoundingClientRect()
        const cRect = container.getBoundingClientRect()
        const offsetWithin = (elRect.top - cRect.top) + container.scrollTop
        const target = offsetWithin - container.clientHeight / 2 + el.clientHeight / 2
        container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      }
    }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 })

    ids.forEach(id => { const el = articleRefs.current[id]; if (el) observer.observe(el) })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, loading])

  // Pinned items get their own section at the top (still newest-pinned-first among themselves).
  // Everything else stays strictly chronological so month groups never appear out of order.
  const pinnedItems = filtered.filter(a => a.is_pinned)
  const chronologicalItems = filtered.filter(a => !a.is_pinned)

  // Group sidebar items by month — built only from strictly date-sorted items,
  // so a pinned older post can never push an older month group above a newer one.
  const grouped: Record<string, any[]> = {}
  chronologicalItems.forEach(ann => {
    const key = new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ann)
  })

  // Main feed order: pinned first (as a distinct, clearly-labeled block), then strict newest-first.
  const feedItems = [...pinnedItems, ...chronologicalItems]

  const isAdmin = isCompanyAdmin

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden" style={{ background: 'var(--canvas)' }}>
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        {/* Search */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search updates…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none transition-smooth"
              style={{ borderColor: 'var(--border)', fontSize: '16px', background: 'var(--canvas)' }}
            />
          </div>
        </div>

        {isAdmin && (
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <Link
              href="/admin/announcements/new"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth press-effect"
              style={{ background: 'linear-gradient(135deg, var(--coral), #ff8f7f)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Announcement
            </Link>
          </div>
        )}

        {/* Timeline list */}
        <div className="flex-1 overflow-y-auto" ref={sidebarScrollRef}>
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
              {/* Vertical timeline line */}
              <div className="absolute left-[22px] top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />

              {pinnedItems.length > 0 && (
                <div>
                  <div className="pl-12 pr-4 py-1.5 sticky top-0 z-10 bg-white">
                    <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--coral)' }}>Pinned</p>
                  </div>
                  {pinnedItems.map(ann => {
                    const isActive = selectedId === ann.id
                    const tagCfg = TAG_COLORS[ann.tag] || TAG_COLORS.announcement
                    return (
                      <button
                        key={ann.id}
                        onClick={() => handleSelect(ann)}
                        ref={el => { if (el) sidebarRefs.current[ann.id] = el }}
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
                          <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--peach)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--coral)' }}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5c0 .83-.67 1.5-1.5 1.5S11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/></svg>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--coral)' }}>Pinned</p>
                          </div>
                          <p className="text-sm font-semibold line-clamp-2 leading-snug" style={{ color: isActive ? 'var(--coral)' : 'var(--ink)' }}>
                            {ann.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: tagCfg.bg, color: tagCfg.color }}>
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
              )}

              {Object.entries(grouped).map(([month, items]) => (
                <div key={month}>
                  {/* Month label */}
                  <div className="pl-12 pr-4 py-1.5 sticky top-0 z-10 bg-white">
                    <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--slate)' }}>{month}</p>
                  </div>

                  {items.map(ann => {
                    const isActive = selectedId === ann.id
                    const tagCfg = TAG_COLORS[ann.tag] || TAG_COLORS.announcement
                    return (
                      <button
                        key={ann.id}
                        onClick={() => handleSelect(ann)}
                        ref={el => { if (el) sidebarRefs.current[ann.id] = el }}
                        className="w-full text-left flex items-start gap-3 px-4 py-3 transition-smooth hover:bg-gray-50 relative"
                        style={{ background: isActive ? 'var(--peach)' : 'transparent' }}>
                        {/* Timeline dot */}
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

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {ann.is_pinned && (
                            <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--peach)' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--coral)' }}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5c0 .83-.67 1.5-1.5 1.5S11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/></svg>
                              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--coral)' }}>
                                Pinned
                              </p>
                            </div>
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
              <div className="mb-4 flex justify-center" style={{ color: "var(--slate)", opacity: 0.4 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg></div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>No announcements yet</h3>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Check back soon for updates!</p>
              {isAdmin && (
                <Link href="/admin/announcements/new"
                  className="inline-block px-6 py-3 rounded-xl font-semibold text-white"
                  style={{ background: 'var(--coral)' }}>
                  Create First Announcement
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 md:px-12 py-8 md:py-12">
            {feedItems.map((ann, idx) => {
              const tagCfg = TAG_COLORS[ann.tag] || TAG_COLORS.announcement
              const liked = likedIds.has(ann.id)
              const subscribed = subscribedIds.has(ann.id)
              return (
                <article
                  key={ann.id}
                  id={`ann-${ann.id}`}
                  ref={el => { if (el) articleRefs.current[ann.id] = el }}
                  data-ann-id={ann.id}
                  className="mb-12 pb-12 scroll-mt-6 transition-all"
                  style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '3rem', paddingBottom: '3rem' }}>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: tagCfg.bg, color: tagCfg.color }}>
                      {tagCfg.label}
                    </span>
                    {ann.is_pinned && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5c0 .83-.67 1.5-1.5 1.5S11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/></svg>
                        Pinned
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
                      style={{
                        borderColor: liked ? 'var(--coral)' : 'var(--border)',
                        color: liked ? 'var(--coral)' : 'var(--ink)',
                        background: liked ? 'var(--peach)' : 'white',
                      }}>
                      <HeartIcon size={13} color={liked ? 'var(--coral)' : 'var(--slate)'} />
                      {liked ? 'Liked' : 'Like'}
                    </button>

                    {/* Quick emoji reactions */}
                    <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl border"
                      style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      {['👍', '❤️', '😂', '🔥'].map(emoji => {
                        const count = (localReactions[ann.id] || ann.reactions || {})[emoji] || 0
                        return (
                          <button
                            key={emoji}
                            onClick={() => addReaction(ann, emoji)}
                            className="flex items-center gap-0.5 w-8 h-7 rounded-lg justify-center hover:bg-white hover:shadow-sm transition-all hover:scale-125 cursor-pointer text-sm"
                            title={`React with ${emoji}`}>
                            {emoji}
                            {count > 0 && (
                              <span className="text-[10px] font-bold leading-none" style={{ color: 'var(--coral)' }}>{count}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* 3-dot menu — copy link for all, edit/delete for admin */}
                    <div className="relative ml-auto">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === ann.id ? null : ann.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer transition-smooth hover:bg-gray-50"
                        style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>
                      {openMenuId === ann.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border z-40 overflow-hidden animate-fade-in-up"
                            style={{ borderColor: 'var(--border)' }}>
                            {isAdmin && (
                              <Link
                                href={`/admin/announcements/new?edit=${ann.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-smooth"
                                style={{ color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit
                              </Link>
                            )}
                            <button
                              onClick={() => { copyLink(ann.id); setOpenMenuId(null) }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-smooth text-left cursor-pointer"
                              style={{ color: 'var(--ink)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              Copy link
                            </button>
                            {isAdmin && (
                              <>
                                <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                                <button
                                  onClick={async () => {
                                    if (!confirm('Delete this announcement?')) return
                                    await (supabase as any).from('announcements').delete().eq('id', ann.id)
                                    setOpenMenuId(null)
                                    fetchAnnouncements()
                                  }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-50 transition-smooth text-left cursor-pointer"
                                style={{ color: '#dc2626' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Delete
                              </button>
                              </>
                            )}
                            </div>
                          </>
                        )}
                      </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 mb-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--slate)' }}>Views</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--coral)' }}>{ann.views || 0}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--slate)' }}>Impressions</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--coral)' }}>{ann.impressions || 0}</p>
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

                  {/* Quick reactions */}
                  {ann.reactions && Object.keys(ann.reactions).length > 0 && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {Object.entries(ann.reactions as Record<string, number>).map(([emoji, count]) =>
                        count > 0 ? (
                          <span key={emoji} className="flex items-center gap-1 text-sm px-3 py-1 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                            {emoji} <span className="font-semibold">{count}</span>
                          </span>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Attached Poll/Survey */}
                  {(ann.poll_id || ann.survey_id) && (
                    <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Attached</p>
                      <div className="flex gap-2 flex-wrap">
                        {ann.poll_id && (
                          <a href={`/polls/${ann.poll_id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-smooth hover:shadow-md"
                            style={{ background: '#dbeafe', color: '#0369a1' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/></svg>
                            Vote in Poll
                          </a>
                        )}
                        {ann.survey_id && (
                          <a href={`/surveys/${ann.survey_id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-smooth hover:shadow-md"
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
