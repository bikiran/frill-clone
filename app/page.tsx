'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'
import { toggleEngagement, fetchEngagedIdeaIds } from '@/lib/engagement'

async function getCompanyId(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname
  if (h === 'colvy.com' || h === 'www.colvy.com' || h.includes('localhost') || h.includes('vercel.app')) return null
  if (h.endsWith('.colvy.com')) {
    const slug = h.replace('.colvy.com', '')
    const { data } = await (supabase as any).from('companies').select('id,name,accent_color,logo_url').eq('slug', slug).single()
    if (data?.accent_color) {
      document.documentElement.style.setProperty('--coral', data.accent_color)
      document.documentElement.style.setProperty('--peach', data.accent_color + '15')
    }
    return data?.id || null
  }
  return null
}

const ADMIN_FILTERS = [
  { key: 'archived', label: 'Archived', icon: 'archive' },
  { key: 'no_status', label: 'No Status', icon: 'circle' },
  { key: 'no_topic', label: 'No Topic', icon: 'hash' },
  { key: 'bugs', label: 'Bugs', icon: 'bug' },
  { key: 'private', label: 'Private', icon: 'lock' },
  { key: 'unprioritized', label: 'Unprioritized', icon: 'flag' },
]

const FilterIcon = ({ type }: { type: string }) => {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'archive': return <svg {...p}><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>
    case 'circle': return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
    case 'hash': return <svg {...p}><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
    case 'bug': return <svg {...p}><rect x="8" y="6" width="8" height="14" rx="4" /><path d="M19 7l-3 2" /><path d="M5 7l3 2" /><path d="M19 19l-3-2" /><path d="M5 19l3-2" /><path d="M20 13h-4" /><path d="M4 13h4" /></svg>
    case 'lock': return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
    case 'flag': return <svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
    default: return null
  }
}

export default function HomePage() {
  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [adminFilter, setAdminFilter] = useState<string | null>(null)
  const [topics, setTopics] = useState<{ id: string; emoji: string; count: number }[]>([])
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [guestVotes, setGuestVotes] = useState<Set<string>>(new Set())
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set())
  const [userSubscriptions, setUserSubscriptions] = useState<Set<string>>(new Set())
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestVotingAllowed, setGuestVotingAllowed] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [customStatuses, setCustomStatuses] = useState<any[]>([])
  const [sortBy, setSortBy] = useState<'trending' | 'latest' | 'oldest' | 'most_votes' | 'least_votes' | 'highest_priority' | 'lowest_priority'>('trending')

  const fetchCustomStatuses = async () => {
    try {
      const companyId = await getCompanyId()
      let q = supabase.from('statuses').select('*').order('order_index', { ascending: true }) as any
      if (companyId) q = q.eq('company_id', companyId)
      const { data } = await q
      if (data) setCustomStatuses(data)
    } catch {}
  }
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [placeholderText, setPlaceholderText] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [currentSampleIdea, setCurrentSampleIdea] = useState(0)
  const [sampleIdeasForPlaceholder, setSampleIdeasForPlaceholder] = useState<string[]>([])

  // Fetch sample ideas for placeholder animation
  useEffect(() => {
    const fetchSampleIdeas = async () => {
      try {
        const { data } = await supabase.from('ideas').select('title').limit(5)
        if (data && data.length > 0) {
          const titles = data.map(i => `Search "${i.title.slice(0, 40)}"`)
          setSampleIdeasForPlaceholder(titles)
        }
      } catch {
        // Fallback to defaults
        setSampleIdeasForPlaceholder([
          'Search "Dark mode support"',
          'Try "API integration"',
          'Find "Mobile app"',
          'Look for "Performance"',
          'Browse "Design updates"',
        ])
      }
    }
    fetchSampleIdeas()
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user)
      if (data.session?.user.id) {
        fetchUserVotes(data.session.user.id)
      }
    })
    fetchIdeas()
    fetchTopics()
    fetchCustomStatuses()
    // Load guest votes from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('guest_votes')
      if (stored) {
        try { setGuestVotes(new Set(JSON.parse(stored))) } catch {}
      }
    }

    // ── REALTIME SUBSCRIPTIONS ──
    // Subscribe to changes on the ideas table
    const ideasChannel = supabase
      .channel('ideas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas' },
        (payload) => {
          console.log('Realtime ideas update:', payload.eventType)
          fetchIdeas()
          fetchTopics()
        }
      )
      .subscribe()

    // Subscribe to changes on the votes table  
    const votesChannel = supabase
      .channel('votes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes' },
        (payload) => {
          console.log('Realtime votes update:', payload.eventType)
          fetchIdeas()
        }
      )
      .subscribe()

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(ideasChannel)
      supabase.removeChannel(votesChannel)
    }
  }, [])

  // Typing animation for placeholder
  useEffect(() => {
    if (sampleIdeasForPlaceholder.length === 0) return
    
    const fullText = sampleIdeasForPlaceholder[currentSampleIdea]
    if (placeholderIndex >= fullText.length) {
      const timer = setTimeout(() => {
        setCurrentSampleIdea((i) => (i + 1) % sampleIdeasForPlaceholder.length)
        setPlaceholderIndex(0)
      }, 3000)
      return () => clearTimeout(timer)
    }

    const typingTimer = setTimeout(() => {
      setPlaceholderIndex(prev => prev + 1)
    }, 50)

    setPlaceholderText(fullText.slice(0, placeholderIndex))
    return () => clearTimeout(typingTimer)
  }, [placeholderIndex, currentSampleIdea, sampleIdeasForPlaceholder])

  const fetchUserVotes = async (userId: string) => {
    const { data } = await supabase.from('votes').select('idea_id').eq('user_id', userId)
    if (data) setUserVotes(new Set(data.map((v: any) => v.idea_id)))
  }

  const handleLike = async (ideaId: string) => {
    const userId = user?.id || null
    const guestId = !userId ? (localStorage.getItem('guest_id') || (() => { const id = Math.random().toString(36).slice(2); localStorage.setItem('guest_id', id); return id })()) : null
    try {
      const newLikes = new Set(userLikes)
      const isLiked = newLikes.has(ideaId)
      if (isLiked) {
        newLikes.delete(ideaId)
        if (userId) {
          await (supabase as any).from('idea_likes').delete().eq('idea_id', ideaId).eq('user_id', userId)
        } else {
          await (supabase as any).from('idea_likes').delete().eq('idea_id', ideaId).eq('guest_id', guestId)
        }
        // Decrement count on idea
        const idea = ideas.find(i => i.id === ideaId)
        if (idea) await (supabase as any).from('ideas').update({ likes: Math.max(0, (idea.likes || 0) - 1) }).eq('id', ideaId)
        setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, likes: Math.max(0, (i.likes || 0) - 1) } : i))
      } else {
        newLikes.add(ideaId)
        await (supabase as any).from('idea_likes').insert({ idea_id: ideaId, user_id: userId, guest_id: guestId })
        // Increment count on idea
        const idea = ideas.find(i => i.id === ideaId)
        if (idea) await (supabase as any).from('ideas').update({ likes: (idea.likes || 0) + 1 }).eq('id', ideaId)
        setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, likes: (i.likes || 0) + 1 } : i))
      }
      setUserLikes(newLikes)
    } catch (err) { console.log('Like error:', err) }
  }

  const handleSubscribe = async (ideaId: string) => {
    try {
      const newSubs = new Set(userSubscriptions)
      if (newSubs.has(ideaId)) {
        newSubs.delete(ideaId)
        await (supabase as any).from('announcement_subscribers').delete().eq('idea_id', ideaId).eq('user_id', user?.id || 'guest')
      } else {
        newSubs.add(ideaId)
        await (supabase as any).from('announcement_subscribers').insert({ idea_id: ideaId, user_id: user?.id || 'guest' })
      }
      setUserSubscriptions(newSubs)
    } catch (err) { console.log('Subscribe error:', err) }
  }

  const handleViewIncrement = async (ideaId: string) => {
    try {
      const idea = ideas.find(i => i.id === ideaId)
      if (idea) {
        await (supabase as any).from('ideas').update({ views: (idea.views || 0) + 1 }).eq('id', ideaId)
        setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, views: (i.views || 0) + 1 } : i))
      }
    } catch (err) { console.log('View error:', err) }
  }

  const handleVote = async (ideaId: string) => {
    const { data: sess } = await supabase.auth.getSession()
    
    if (sess.session?.user.id) {
      // Authenticated user
      const { data: existingVote } = await supabase
        .from('votes').select('*').eq('idea_id', ideaId).eq('user_id', sess.session.user.id).single()
      
      if (existingVote) {
        await supabase.from('votes').delete().eq('id', existingVote.id)
      } else {
        await supabase.from('votes').insert({ idea_id: ideaId, user_id: sess.session.user.id })
      }
      await fetchUserVotes(sess.session.user.id)
    } else {
      // Guest — if already voted toggle off, otherwise show modal
      if (guestVotes.has(ideaId)) {
        const idea = ideas.find(i => i.id === ideaId)
        const newGuestVotes = new Set(guestVotes)
        newGuestVotes.delete(ideaId)
        setGuestVotes(newGuestVotes)
        await supabase.from('ideas').update({ votes: Math.max((idea?.votes || 0) - 1, 0) }).eq('id', ideaId)
        localStorage.setItem('guest_votes', JSON.stringify(Array.from(newGuestVotes)))
      } else {
        // Show name/email modal
        if (!guestVotingAllowed) return
        setPendingVoteId(ideaId)
        setShowGuestModal(true)
        return
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 200))
    const { data: updatedIdea } = await supabase.from('ideas').select('votes').eq('id', ideaId).single()
    if (updatedIdea) {
      setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, votes: updatedIdea.votes } : i))
    }
  }

  const handleGuestVoteSubmit = async () => {
    if (!guestName.trim() || !guestEmail.trim() || !pendingVoteId) return
    const idea = ideas.find(i => i.id === pendingVoteId)
    if (!idea) return
    
    const newGuestVotes = new Set(guestVotes)
    newGuestVotes.add(pendingVoteId)
    setGuestVotes(newGuestVotes)
    localStorage.setItem('guest_votes', JSON.stringify(Array.from(newGuestVotes)))
    
    // Record the vote
    await supabase.from('ideas').update({ votes: (idea.votes || 0) + 1 }).eq('id', pendingVoteId)
    
    // Auto-create a guest entry in idea_reactions or comments as proof of vote
    // (so admin can see who voted)
    try {
      await supabase.from('guest_interactions').insert({
        idea_id: pendingVoteId,
        name: guestName.trim(),
        email: guestEmail.trim().toLowerCase(),
        action: 'vote',
      })
    } catch {}
    
    const { data: updatedIdea } = await supabase.from('ideas').select('votes').eq('id', pendingVoteId).single()
    if (updatedIdea) {
      setIdeas(prev => prev.map(i => i.id === pendingVoteId ? { ...i, votes: updatedIdea.votes } : i))
    }
    
    setShowGuestModal(false)
    setPendingVoteId(null)
    setGuestName('')
    setGuestEmail('')
  }

  const handleStatusChange = async (ideaId: string, newStatus: string) => {
    try {
      const idea = ideas.find(i => i.id === ideaId)
      const oldStatus = idea?.status || 'new'
      
      await supabase
        .from('ideas')
        .update({ status: newStatus })
        .eq('id', ideaId)
      
      // Log activity
      if (user) {
        await supabase.from('activity').insert({
          idea_id: ideaId,
          user_id: user.id,
          action: 'status_changed',
          old_value: oldStatus,
          new_value: newStatus,
        })
      }
      
      // Update local state
      setIdeas(ideas.map(i => i.id === ideaId ? { ...i, status: newStatus } : i))
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const fetchIdeas = async () => {
    const companyId = await getCompanyId()
    let q = supabase.from('ideas').select('*') as any
    if (companyId) q = q.eq('company_id', companyId)
    const { data } = await q
    if (data && data.length === 0) {
      // Seed sample ideas on first load
      const samples = [
        { title: '[Start here] Welcome to YourApp', description: 'This is your feedback board! Upvote ideas you like, add comments, and submit your own feature requests.', created_by_name: 'YourApp Team', votes: 7, status: 'new', topics: ['welcome'], show_on_roadmap: true },
        { title: '[Example Idea] Pabbly Connect Integration', description: 'Adding Pabbly would make it much easier to connect a whole host of apps without any technical knowledge. Similar to Zapier and Integromat.', created_by_name: 'YourApp Team', votes: 0, status: 'planned', topics: ['improvement', 'integrations'], show_on_roadmap: true },
        { title: '[Example Idea] More colour options', description: 'Would love to see more colour palette options for customizing the look and feel.', created_by_name: 'YourApp Team', votes: 3, status: 'planned', topics: ['improvement', 'styling'], show_on_roadmap: true },
        { title: '[Read Me] We\'ve created a few example ideas for you', description: 'These example ideas show you what your feedback board can look like. Feel free to delete them when you\'re ready!', created_by_name: 'YourApp Team', votes: 0, status: 'new', topics: ['welcome'], show_on_roadmap: true },
        { title: '[Read Me] Change your Topics', description: 'Did you know that you can set your own Topics right here? Topics are a great way to categorise ideas so your customers can see where an idea belongs in your business.', created_by_name: 'YourApp Team', votes: 0, status: 'new', topics: ['welcome'], show_on_roadmap: true },
      ]
      for (const sample of samples) {
        await supabase.from('ideas').insert(sample)
      }
      const { data: newData } = await supabase.from('ideas').select('*')
      if (newData) setIdeas(newData)
    } else if (data) {
      setIdeas(data)
    }
    setLoading(false)
  }

  const fetchTopics = async () => {
    const companyId = await getCompanyId()
    let q = supabase.from('ideas').select('topics') as any
    if (companyId) q = q.eq('company_id', companyId)
    const { data } = await q
    if (data) {
      const topicMap: Record<string, number> = {}
      data.forEach((idea: any) => {
        if (idea.topics) {
          idea.topics.forEach((t: string) => {
            topicMap[t] = (topicMap[t] || 0) + 1
          })
        }
      })
      const topicsList = Object.entries(topicMap).map(([id, count]) => ({
        id,
        emoji: '#',
        count,
      }))
      setTopics(topicsList.sort((a, b) => b.count - a.count))
    }
  }

  const priorityWeight: Record<string, number> = {
    quick_wins: 4, high: 3, medium: 2, low: 1, '': 0,
  }

  const filtered = ideas.filter(i => {
    const matchesSearch = !search || i.title.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase())
    const matchesTopic = !topicFilter || (i.topics && i.topics.includes(topicFilter))
    const matchesStatus = !statusFilter || i.status === statusFilter
    
    let matchesAdmin = true
    if (adminFilter === 'archived') matchesAdmin = i.is_archived
    else if (adminFilter === 'no_status') matchesAdmin = !i.status || i.status === 'new'
    else if (adminFilter === 'no_topic') matchesAdmin = !i.topics || i.topics.length === 0
    else if (adminFilter === 'bugs') matchesAdmin = i.topics && i.topics.includes('bug')
    else if (adminFilter === 'private') matchesAdmin = i.is_private
    else if (adminFilter === 'unprioritized') matchesAdmin = !i.priority
    
    // Hide private ideas from non-admin users
    const isAdmin = user?.email === 'bishalstha76@gmail.com'
    const isOwner = user?.id === i.user_id
    const matchesPrivacy = !i.is_private || isAdmin || isOwner
    
    return matchesSearch && matchesTopic && matchesStatus && matchesAdmin && matchesPrivacy
  }).sort((a, b) => {
    switch (sortBy) {
      case 'latest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'most_votes': return (b.votes || 0) - (a.votes || 0)
      case 'least_votes': return (a.votes || 0) - (b.votes || 0)
      case 'highest_priority': return (priorityWeight[b.priority || ''] || 0) - (priorityWeight[a.priority || ''] || 0)
      case 'lowest_priority': return (priorityWeight[a.priority || ''] || 0) - (priorityWeight[b.priority || ''] || 0)
      case 'trending':
      default:
        // Trending = votes weighted by recency
        const aDays = (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24)
        const bDays = (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24)
        const aScore = (a.votes || 0) / Math.pow(aDays + 1, 0.5)
        const bScore = (b.votes || 0) / Math.pow(bDays + 1, 0.5)
        return bScore - aScore
    }
  })

  const SORT_OPTIONS = [
    { key: 'trending', label: 'Trending' },
    { key: 'latest', label: 'Latest Ideas' },
    { key: 'oldest', label: 'Oldest Ideas' },
    { key: 'most_votes', label: 'Most votes' },
    { key: 'least_votes', label: 'Least votes' },
    { key: 'highest_priority', label: 'Highest priority' },
    { key: 'lowest_priority', label: 'Lowest priority' },
  ] as const

  const FILTER_OPTIONS = [
    { key: 'private', label: 'Private', icon: '●', color: '#6b7280' },
    { key: 'bugs', label: 'Bugs', icon: '●', color: '#dc2626' },
    { key: 'unprioritized', label: 'Unprioritized', icon: '●', color: '#9ca3af' },
    { key: 'new', label: 'Under consideration', icon: '●', color: '#f97316', divider: true, isStatus: true },
    { key: 'planned', label: 'Planned', icon: '●', color: '#3b82f6', isStatus: true },
    { key: 'in_progress', label: 'In Development', icon: '●', color: '#ea580c', isStatus: true },
    { key: 'shipped', label: 'Shipped', icon: '●', color: '#10b981', isStatus: true },
  ]

  const filteredFilterOptions = FILTER_OPTIONS.filter(f => 
    !filterSearch || f.label.toLowerCase().includes(filterSearch.toLowerCase())
  )

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Trending'

  return (
    <div className="flex flex-col md:flex-row gap-0 md:h-[calc(100vh-56px)]">
      {/* Sidebar - hidden on mobile, full sidebar on desktop */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 px-5 py-6 bg-white border-r overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
        {/* Status section header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--slate)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Statuses
            </h3>
            <div className="flex items-center gap-1">
              {user?.email === 'bishalstha76@gmail.com' && (
                <>
                  <Link href="/admin/statuses" className="text-xs px-2 py-1 rounded transition-smooth hover:bg-gray-100 flex items-center gap-1" style={{ color: 'var(--slate)' }} title="Manage statuses">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.09 15H3a2 2 0 0 1 0-4h.09" /></svg>
                  </Link>
                  <Link href="/admin/priorities" className="text-xs px-2 py-1 rounded transition-smooth hover:bg-gray-100 flex items-center gap-1" style={{ color: 'var(--slate)' }} title="Manage priorities">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4v6h6" /><path d="M21 14v6h-6" /></svg>
                  </Link>
                </>
              )}
              <Link href="/roadmap" className="text-xs px-2 py-1 rounded transition-smooth hover:bg-gray-100 arrow-right" style={{ color: 'var(--coral)' }}>
                View all
              </Link>
            </div>
          </div>
          <nav className="space-y-0.5">
            {(() => {
              const defaults = [
                { key: 'new', label: 'Under consideration', color: '#f97316' },
                { key: 'planned', label: 'Planned', color: '#3b82f6' },
                { key: 'in_progress', label: 'In Development', color: '#ea580c' },
                { key: 'shipped', label: 'Shipped', color: '#10b981' },
              ]
              const defaultKeys = new Set(defaults.map(d => d.key))
              const extras = customStatuses.filter(s => !defaultKeys.has(s.key)).map(s => ({ key: s.key, label: s.label, color: s.color }))
              return [...defaults, ...extras]
            })().map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-smooth hover:bg-gray-50 cursor-pointer relative group"
                style={{ 
                  background: statusFilter === s.key ? 'var(--peach)' : 'transparent',
                  color: statusFilter === s.key ? 'var(--coral)' : 'var(--ink)',
                }}>
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 text-left">{s.label}</span>
                {statusFilter === s.key && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setStatusFilter(null) }} 
                    className="p-0.5 rounded-full hover:bg-gray-200 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" 
                    style={{ color: 'var(--slate)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Topics section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--slate)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
              Topics
            </h3>
            {user?.email === 'bishalstha76@gmail.com' && (
              <Link href="/admin/topics" className="text-xs px-2 py-1 rounded transition-smooth hover:bg-gray-100 flex items-center gap-1" style={{ color: 'var(--slate)' }} title="Manage topics">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09" /></svg>
              </Link>
            )}
          </div>
          <nav className="space-y-0.5">
            {topics.map(t => (
              <button
                key={t.id}
                onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-smooth press-effect relative group"
                style={{
                  background: topicFilter === t.id ? 'var(--peach)' : 'transparent',
                  color: topicFilter === t.id ? 'var(--coral)' : 'var(--ink)',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
                <span className="flex-1 text-left capitalize">{t.id}</span>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>{t.count}</span>
                {topicFilter === t.id && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setTopicFilter(null) }} 
                    className="p-0.5 rounded-full hover:bg-gray-200 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" 
                    style={{ color: 'var(--slate)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Admin filters */}
        {user?.email === 'bishalstha76@gmail.com' && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-1.5" style={{ color: 'var(--slate)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Admin
            </h3>
            <nav className="space-y-0.5">
              {ADMIN_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setAdminFilter(adminFilter === f.key ? null : f.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-smooth press-effect hover:bg-gray-50 cursor-pointer"
                  style={{
                    background: adminFilter === f.key ? 'var(--peach)' : 'transparent',
                    color: adminFilter === f.key ? 'var(--coral)' : 'var(--ink)',
                  }}>
                  <FilterIcon type={f.icon} />
                  <span className="flex-1 text-left">{f.label}</span>
                  {adminFilter === f.key && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 md:px-8 py-6 md:py-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* Top Header */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
                Ideas
              </h1>
              <p className="text-sm md:text-base" style={{ color: 'var(--slate)' }}>
                {filtered.length} idea{filtered.length !== 1 ? 's' : ''} total
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 rounded-xl font-semibold text-white transition-smooth press-effect futuristic-btn shrink-0"
              style={{ background: 'var(--coral)' }}>
              + Submit Idea
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={search === '' ? placeholderText : 'Search ideas...'}
                className="w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none transition-smooth"
                style={{ borderColor: search ? 'var(--coral)' : 'var(--border)', fontSize: '16px' }}
              />
            </div>
          </div>

          {/* Filter & Sort row */}
          <div className="flex items-center justify-between mb-6 gap-3">
            {/* Sort dropdown - left */}
            <div className="relative">
              <button
                onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false) }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-smooth hover:bg-gray-50 text-sm cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                <span className="font-medium">{currentSortLabel}</span>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>▾</span>
              </button>
              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                  <div className="absolute top-full left-0 mt-2 w-56 rounded-lg shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ background: 'white', borderColor: 'var(--border)' }}>
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => { setSortBy(opt.key); setShowSortDropdown(false) }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-smooth flex items-center gap-2 cursor-pointer hover:bg-gray-50"
                        style={{ 
                          color: sortBy === opt.key ? 'var(--coral)' : 'var(--ink)',
                          background: sortBy === opt.key ? 'var(--peach)' : 'transparent',
                          fontWeight: sortBy === opt.key ? 600 : 400,
                        }}>
                        {sortBy === opt.key && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                        <span className={sortBy === opt.key ? '' : 'ml-[22px]'}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filter button - right */}
            <div className="relative">
              <button
                onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false) }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-smooth hover:bg-gray-50 text-sm cursor-pointer"
                style={{ borderColor: adminFilter ? 'var(--coral)' : 'var(--border)', color: adminFilter ? 'var(--coral)' : 'var(--ink)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span className="font-medium">Filter</span>
                {(topicFilter || statusFilter || adminFilter) && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--coral)', color: 'white' }}>1</span>}
              </button>
              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                    <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      <input
                        type="text"
                        autoFocus
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                        placeholder="Filter by status or topic"
                        className="w-full px-3 py-2 rounded-lg border-2 text-sm focus:outline-none"
                        style={{ borderColor: '#3b82f6', fontSize: '16px' }}
                      />
                    </div>
                    <div className="max-h-96 overflow-y-auto py-1">
                      {/* Top filters */}
                      {filteredFilterOptions.filter(f => !f.isStatus).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => { setAdminFilter(adminFilter === opt.key ? null : opt.key); setShowFilterDropdown(false) }}
                          className="w-full px-4 py-2.5 text-left text-sm transition-smooth flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                          style={{ 
                            background: adminFilter === opt.key ? 'var(--peach)' : 'transparent',
                            color: adminFilter === opt.key ? 'var(--coral)' : 'var(--ink)',
                          }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: opt.color || 'var(--slate)' }} />
                          <span>{opt.label}</span>
                          {adminFilter === opt.key && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><polyline points="20 6 9 17 4 12" /></svg>}
                        </button>
                      ))}
                      
                      {filteredFilterOptions.some(f => f.isStatus) && (
                        <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                      )}
                      
                      {/* Status filters */}
                      {filteredFilterOptions.filter(f => f.isStatus).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => { setStatusFilter(statusFilter === opt.key ? null : opt.key); setShowFilterDropdown(false) }}
                          className="w-full px-4 py-2.5 text-left text-sm transition-smooth flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                          style={{ 
                            background: statusFilter === opt.key ? 'var(--peach)' : 'transparent',
                            color: statusFilter === opt.key ? 'var(--coral)' : 'var(--ink)',
                          }}>
                          <span className="w-2 h-2 rounded-full border-2" style={{ 
                            borderColor: opt.key === 'new' ? '#f97316' : opt.key === 'planned' ? '#3b82f6' : opt.key === 'in_progress' ? '#ea580c' : '#10b981' 
                          }} />
                          <span>{opt.label}</span>
                          {statusFilter === opt.key && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </button>
                      ))}
                    </div>
                    {adminFilter && (
                      <div className="border-t p-2" style={{ borderColor: 'var(--border)' }}>
                        <button
                          onClick={() => { setAdminFilter(null); setShowFilterDropdown(false) }}
                          className="w-full px-3 py-2 text-sm font-medium rounded-lg hover:bg-gray-50 transition-smooth cursor-pointer"
                          style={{ color: 'var(--coral)' }}>
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block">
                <div className="skeleton w-12 h-12 rounded-full mb-4" />
                <div className="skeleton w-32 h-4" />
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                No ideas yet
              </h3>
              <p style={{ color: 'var(--slate)' }} className="mb-6">
                Be the first to share an idea!
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-3 rounded-xl font-semibold text-white transition-smooth press-effect"
                style={{ background: 'var(--coral)' }}>
                Share an Idea
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {filtered.map(idea => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  hasVoted={userVotes.has(idea.id) || guestVotes.has(idea.id)}
                  liked={userLikes.has(idea.id)}
                  subscribed={userSubscriptions.has(idea.id)}
                  onVote={handleVote}
                  onLike={handleLike}
                  onSubscribe={handleSubscribe}
                  onStatusChange={handleStatusChange}
                  onClick={() => {
                    handleViewIncrement(idea.id)
                    setSelectedIdea(idea)
                    setShowDetailModal(true)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showModal && (
        <IdeaModal
          onClose={() => setShowModal(false)}
          onSubmitted={() => {
            setShowModal(false)
            fetchIdeas()
            fetchTopics()
          }}
        />
      )}

      {showDetailModal && selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => {
            setShowDetailModal(false)
            fetchIdeas()
          }}
        />
      )}

      {/* Guest Vote Modal */}
      {showGuestModal && (
        <>
          <div className="fixed inset-0 z-50 animate-backdrop" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowGuestModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-3xl mb-3">🗳️</div>
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Cast your vote</h2>
              <p className="text-sm" style={{ color: 'var(--slate)' }}>Enter your name and email to vote. No password needed.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Your name</label>
                <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="Jane Smith" autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                  onKeyDown={e => e.key === 'Enter' && handleGuestVoteSubmit()} />
              </div>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                Your email is used to prevent duplicate votes and may be used to send updates on this idea.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowGuestModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={handleGuestVoteSubmit}
                disabled={!guestName.trim() || !guestEmail.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                Vote ▲
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
