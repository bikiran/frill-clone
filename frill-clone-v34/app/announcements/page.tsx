'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { BellIcon, HeartIcon } from '@/components/Icons'

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  new_feature: { bg: '#dbeafe', color: '#0284c7' },
  improvement: { bg: '#fef3c7', color: '#ca8a04' },
  bug_fix: { bg: '#fee2e2', color: '#dc2626' },
  announcement: { bg: '#fee2e2', color: '#dc2626' },
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAnn, setSelectedAnn] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [user, setUser] = useState<any>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [liked, setLiked] = useState(false)
  const [viewsIncremented, setViewsIncremented] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user)
    })
    fetchAnnouncements()

    const channel = supabase
      .channel('announcements-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchAnnouncements())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Track views when announcement is selected
  useEffect(() => {
    if (selectedAnn && !viewsIncremented.has(selectedAnn.id)) {
      const newSet = new Set(viewsIncremented)
      newSet.add(selectedAnn.id)
      setViewsIncremented(newSet)
      
      // Increment both views (per user) and impressions (total)
      supabase
        .from('announcements')
        .update({ 
          views: (selectedAnn.views || 0) + 1,
          impressions: (selectedAnn.impressions || 0) + 1 
        })
        .eq('id', selectedAnn.id)
        .then(() => {
          setSelectedAnn({ 
            ...selectedAnn, 
            views: (selectedAnn.views || 0) + 1,
            impressions: (selectedAnn.impressions || 0) + 1 
          })
        })
    }
  }, [selectedAnn?.id])

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error

      if (data && data.length === 0) {
        const samples = [
          { title: "Hello World! We're Using YourApp 🚀", description: "YourApp is a place where you can submit feature requests, view our Roadmap, and keep track of Announcements.\n\nWith Announcements, you can share what's new with your users and keep everyone in the loop.", tag: 'new_feature', views: 1, impressions: 1 },
          { title: "New Dashboard Released", description: "We've completely redesigned the dashboard with a focus on user experience. Check out the new analytics and reporting features that will help you track ideas better.", tag: 'improvement', views: 45, impressions: 312 },
          { title: "Critical Bug Fixed", description: "Fixed an issue where some users couldn't vote on ideas. All users are now able to vote and track their favorite feature requests.", tag: 'bug_fix', views: 28, impressions: 156 },
        ]
        for (const sample of samples) {
          await supabase.from('announcements').insert(sample)
        }
        const { data: newData } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
        setAnnouncements(newData || [])
        if (newData && newData.length > 0) setSelectedAnn(newData[0])
      } else {
        setAnnouncements(data || [])
        if (data && data.length > 0 && !selectedAnn) setSelectedAnn(data[0])
      }
    } catch (err) {
      console.error('Error fetching announcements:', err)
    }
    setLoading(false)
  }

  const filtered = announcements.filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()))
  const isAdmin = user?.email === 'bishalstha76@gmail.com'

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left sidebar - narrower, no gap */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-smooth"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
          />
        </div>

        {isAdmin && (
          <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <Link
              href="/admin/announcements/new"
              className="w-full block px-4 py-2.5 rounded-lg text-sm font-semibold text-white text-center transition-smooth press-effect futuristic-btn"
              style={{ background: 'linear-gradient(135deg, var(--coral) 0%, #ff8f7f 100%)' }}>
              ✨ Create Announcement
            </Link>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements found</p>
            </div>
          ) : (
            <div className="p-2 relative">
              {/* Timeline vertical line */}
              <div className="absolute left-5 top-4 bottom-4 w-px" style={{ background: 'var(--border)' }} />
              
              {(() => {
                // Group by month-year
                const groups: Record<string, any[]> = {}
                filtered.forEach(ann => {
                  const d = new Date(ann.created_at)
                  const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  if (!groups[key]) groups[key] = []
                  groups[key].push(ann)
                })
                
                return Object.entries(groups).map(([month, items]) => (
                  <div key={month} className="mb-3">
                    <div className="px-3 py-1 text-xs font-bold uppercase tracking-wider sticky top-0 bg-white z-10" style={{ color: 'var(--slate)' }}>
                      {month}
                    </div>
                    <div className="space-y-1">
                      {items.map(ann => (
                        <button
                          key={ann.id}
                          onClick={() => setSelectedAnn(ann)}
                          className="w-full text-left pl-10 pr-3 py-2.5 rounded-lg transition-smooth press-effect hover:bg-gray-50 relative"
                          style={{ background: selectedAnn?.id === ann.id ? 'var(--peach)' : 'transparent' }}>
                          {/* Timeline dot */}
                          <div className="absolute left-3.5 top-3.5 w-3 h-3 rounded-full border-2 border-white" 
                            style={{ 
                              background: selectedAnn?.id === ann.id ? 'var(--coral)' : 'var(--slate)',
                              boxShadow: selectedAnn?.id === ann.id ? '0 0 0 3px var(--peach)' : 'none',
                            }} />
                          <p className="font-semibold text-sm line-clamp-2 mb-0.5" style={{ color: 'var(--ink)' }}>{ann.title}</p>
                          <p className="text-xs" style={{ color: 'var(--slate)' }}>
                            {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </aside>

      {/* Right content - Scrollable timeline of ALL announcements */}
      <main className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="p-8 text-center">
            <p style={{ color: 'var(--slate)' }}>Loading…</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="max-w-3xl mx-auto px-6 md:px-12 py-8 md:py-12">
            {/* Render all announcements as a feed */}
            {filtered.map((ann, annIdx) => {
              const tagColor = TAG_COLORS[ann.tag] || { bg: '#f3f4f6', color: '#6b7280' }
              const isSelected = selectedAnn?.id === ann.id
              return (
                <article
                  key={ann.id}
                  id={`announcement-${ann.id}`}
                  ref={(el) => {
                    if (el && isSelected) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                  className="mb-12 pb-12 border-b last:border-b-0 last:mb-0 last:pb-0 scroll-mt-4"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>
                      {new Date(ann.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: tagColor.bg, color: tagColor.color }}>
                      {ann.tag === 'new_feature' ? '✨ New Feature' : ann.tag === 'improvement' ? '⬆️ Improvement' : ann.tag === 'bug_fix' ? '🐛 Bug Fix' : '📢 Announcement'}
                    </span>
                    {ann.is_pinned && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                        📌 Pinned
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: 'var(--ink)' }}>
                    {ann.title}
                  </h1>

                  <div className="flex items-center gap-2 mb-6 flex-wrap">
                    <button
                      onClick={() => setSubscribed(!subscribed)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-smooth cursor-pointer hover:bg-gray-50"
                      style={{ 
                        borderColor: subscribed ? 'var(--coral)' : 'var(--border)',
                        color: subscribed ? 'var(--coral)' : 'var(--ink)',
                      }}>
                      <BellIcon size={14} color={subscribed ? 'var(--coral)' : 'var(--slate)'} />
                      {subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                    <button
                      onClick={() => setLiked(!liked)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-smooth cursor-pointer hover:bg-gray-50"
                      style={{ 
                        borderColor: liked ? 'var(--coral)' : 'var(--border)',
                        color: liked ? 'var(--coral)' : 'var(--ink)',
                      }}>
                      <HeartIcon size={14} color={liked ? 'var(--coral)' : 'var(--slate)'} />
                      {liked ? 'Liked' : 'Like'}
                    </button>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/announcements?id=${ann.id}`
                        navigator.clipboard.writeText(url)
                        alert('Announcement link copied!')
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-smooth cursor-pointer hover:bg-gray-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      Copy link
                    </button>
                  </div>

                  <div className="flex gap-6 mb-6 pb-6 border-b text-sm" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--slate)' }}>Views</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--coral)' }}>{ann.views || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--slate)' }}>Impressions</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--coral)' }}>{ann.impressions || 0}</p>
                    </div>
                  </div>

                  <div className="prose max-w-none">
                    {ann.description && ann.description.includes('<') ? (
                      <div 
                        className="text-base leading-relaxed" 
                        style={{ color: 'var(--ink)' }}
                        dangerouslySetInnerHTML={{ __html: ann.description }}
                      />
                    ) : (
                      <p className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                        {ann.description}
                      </p>
                    )}
                  </div>

                  {/* Poll/Survey */}
                  {(ann.poll_id || ann.survey_id) && (
                    <div className="mt-6 p-4 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--slate)' }}>Attached Content</p>
                      <div className="flex flex-wrap gap-2">
                        {ann.poll_id && (
                          <a href={`/polls/${ann.poll_id}`} className="text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-smooth hover:shadow-sm" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/></svg>
                            Vote in poll
                          </a>
                        )}
                        {ann.survey_id && (
                          <a href={`/surveys/${ann.survey_id}`} className="text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-smooth hover:shadow-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            Take survey
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-5xl mb-4">📢</div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No announcements yet</h3>
              <p style={{ color: 'var(--slate)' }} className="mb-6">Check back soon for exciting updates!</p>
              {isAdmin && (
                <Link
                  href="/admin/announcements/new"
                  className="inline-block px-6 py-3 rounded-xl font-semibold text-white transition-smooth press-effect"
                  style={{ background: 'var(--coral)' }}>
                  Create First Announcement
                </Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
