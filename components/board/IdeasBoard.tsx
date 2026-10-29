'use client'

import { useState, useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import IdeaCard from '@/components/IdeaCard'
import IdeaModal from '@/components/IdeaModal'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import Link from 'next/link'
import { toggleEngagement, fetchEngagedIdeaIds } from '@/lib/engagement'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { useTerminology } from '@/lib/terminologyContext'
import EmptyScroll from '@/components/EmptyScroll'
import { resolveCompanyUser } from '@/lib/client-cache'
import { SelectPopover } from '@/components/ui/SelectMenu'

async function getCompanyId(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname
  if (h === 'colvy.com' || h === 'www.colvy.com' || h.includes('localhost') || h.includes('vercel.app')) return null
  if (h.endsWith('.colvy.com')) {
    const slug = h.replace('.colvy.com', '')
    // maybeSingle never throws on no-rows (unlike .single which caused this to
    // return null and leak every company's data onto the board)
    const { data } = await (supabase as any).from('companies').select('id,name,accent_color,logo_url').eq('slug', slug).maybeSingle()
    if (data?.accent_color) {
      document.documentElement.style.setProperty('--coral', data.accent_color)
      document.documentElement.style.setProperty('--peach', data.accent_color + '15')
    }
    return data?.id || null
  }
  return null
}

// True when we're on a company subdomain (so we must ALWAYS scope to that
// company — even if the lookup momentarily fails, never show all-company data)
function isOnCompanySubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
}

const ADMIN_FILTERS = [
  { key: 'archived', label: 'Archived', icon: 'archive' },
  { key: 'no_status', label: 'No Status', icon: 'circle' },
  { key: 'no_topic', label: 'No Topic', icon: 'hash' },
  { key: 'bugs', label: 'Bugs', icon: 'bug' },
  { key: 'private', label: 'Private', icon: 'lock' },
  { key: 'unprioritized', label: 'Unprioritized', icon: 'flag' },
]

const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
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

/** The ideas board. `embedded` shows it inside the admin (/admin/ideas): the
 *  workspace comes from your session instead of the address, and the public
 *  board's homepage redirect is skipped. */
export default function IdeasBoard({ embedded = false }: { embedded?: boolean }) {
  const { getTerm } = useTerminology()
  const plural = getTerm('idea_plural')
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  // admin.colvy.com is the platform super-admin panel — route straight to it.
  useEffect(() => {
    if (typeof window === 'undefined' || embedded) return
    const h = window.location.hostname
    if (h === 'admin.colvy.com' && !window.location.pathname.startsWith('/platform-admin')) {
      window.location.replace('/platform-admin')
      return
    }
    // Respect the company's configured default homepage. If it's not "ideas",
    // send the visitor to that page instead of the ideas board — BUT only for a
    // bare visit to the homepage. If the URL asks for ideas explicitly
    // (?view=ideas) or points at a specific idea (?idea=… or #idea-…), stay here
    // so the ideas board is always reachable even when Help is the homepage.
    const params = new URLSearchParams(window.location.search)
    const wantsIdeas = params.get('view') === 'ideas' || params.has('idea') || window.location.hash.startsWith('#idea')
    if (wantsIdeas) return
    const map: Record<string, string> = { roadmap: '/roadmap', announcements: '/announcements', help: '/help' }
    const goHome = (home?: string) => { if (home && map[home]) { window.location.replace(map[home]); return true } return false }
    try {
      const isSub = h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
      const slug = isSub ? h.replace('.colvy.com', '') : 'colvy'
      const s = JSON.parse(localStorage.getItem(`site_settings_${slug}`) || '{}')
      if (s.defaultHomepage) { if (goHome(s.defaultHomepage)) return }
      else {
        // Not cached yet — fetch settings once to honour the default homepage.
        ;(async () => {
          try {
            let cid: string | null = null
            if (isSub) { const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle(); cid = co?.id || null }
            let q = (supabase as any).from('site_settings').select('value').eq('key', 'general')
            q = cid ? q.eq('company_id', cid) : q.is('company_id', null)
            const { data: rows } = await q.order('updated_at', { ascending: false }).limit(1)
            goHome(rows?.[0]?.value?.defaultHomepage)
          } catch {}
        })()
      }
    } catch {}
  }, [])

  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  // "Submit an idea" from elsewhere (the profile page) links to ?new=1: open
  // the new-idea form straight away, then tidy the address bar.
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (u.searchParams.get('new') !== '1') return
      setShowModal(true)
      u.searchParams.delete('new')
      window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash)
    } catch {}
  }, [])
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [adminFilter, setAdminFilter] = useState<string | null>(null)
  const [topics, setTopics] = useState<{ id: string; emoji: string; count: number }[]>([])
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set())
  const [guestVotes, setGuestVotes] = useState<Set<string>>(new Set())
  const boardViewed = useRef(false)  // fire board_viewed once per mount
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

  // Inside the admin the workspace is the one you're signed in to; on the
  // public board it comes from the address.
  const companyIdNow = async () => embedded ? (await resolveCompanyUser()).companyId : getCompanyId()

  const fetchCustomStatuses = async () => {
    try {
      const companyId = await companyIdNow()
      let q = supabase.from('statuses').select('*').order('order_index', { ascending: true }) as any
      if (companyId) q = q.eq('company_id', companyId)
      const { data } = await q
      if (data) setCustomStatuses(data)
    } catch {}
  }
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortBtnRef = useRef<HTMLButtonElement | null>(null)
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
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user)
      if (data.session?.user.id) {
        fetchUserVotes(data.session.user.id)
        // Determine if this user is an admin of THIS company (owner, elevated team member, or super admin)
        try {
          const { isCompanyAdminUser } = await import('@/lib/board')
          setIsCompanyAdmin(await isCompanyAdminUser(data.session.user))
        } catch {}
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
      // Authenticated user — maybeSingle() never throws when the user hasn't voted yet
      const { data: existingVote } = await (supabase as any)
        .from('votes').select('*').eq('idea_id', ideaId).eq('user_id', sess.session.user.id).maybeSingle()

      const idea = ideas.find(i => i.id === ideaId)
      if (existingVote) {
        await supabase.from('votes').delete().eq('id', existingVote.id)
        // Keep the ideas.votes counter in sync — this is what summary cards & detail view display
        await supabase.from('ideas').update({ votes: Math.max((idea?.votes || 0) - 1, 0) }).eq('id', ideaId)
      } else {
        const um = sess.session.user.user_metadata || {}
        await supabase.from('votes').insert({
          idea_id: ideaId,
          user_id: sess.session.user.id,
          user_name: um.display_name || sess.session.user.email?.split('@')[0] || null,
          user_avatar: um.avatar_url || null,
        })
        await supabase.from('ideas').update({ votes: (idea?.votes || 0) + 1 }).eq('id', ideaId)
        notifyIntegrations('idea.voted', { id: ideaId })
        // Notify the idea owner about the new vote (not for self-votes)
        try {
          if (idea?.user_id && idea.user_id !== sess.session.user.id) {
            const { createNotification } = await import('@/lib/notifications')
            const actorName = um.display_name || sess.session.user.email?.split('@')[0] || 'Someone'
            await createNotification(idea.user_id, 'vote', ideaId, `${actorName} voted on "${idea.title}"`, actorName, sess.session.user.email)
          }
        } catch {}
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
    // Defense in depth: only company admins may change idea status
    if (!isCompanyAdmin) return
    try {
      const idea = ideas.find(i => i.id === ideaId)
      const oldStatus = idea?.status || 'new'
      
      await supabase
        .from('ideas')
        .update({ status: newStatus })
        .eq('id', ideaId)
      notifyIntegrations('idea.status_changed', { id: ideaId })
      
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
    const companyId = await companyIdNow()

    // Enforce board privacy - if company is private, require login
    if (companyId) {
      const { data: coData } = await (supabase as any).from('companies').select('id,name,is_private,slug').eq('id', companyId).maybeSingle()
      if (coData?.is_private) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.href)
          return
        }
      }
    }

    let q = supabase.from('ideas').select('*') as any
    if (companyId) {
      q = q.eq('company_id', companyId)
    } else if (embedded || isOnCompanySubdomain()) {
      setIdeas([]); setLoading(false); return
    }
    const { data } = await q
    if (data && data.length === 0 && companyId) {
      // Seed sample ideas on first load — scoped to this company
      const samples = [
        { title: '[Start here] Welcome to YourApp', description: 'This is your feedback board! Upvote ideas you like, add comments, and submit your own feature requests.', created_by_name: 'YourApp Team', votes: 7, status: 'new', topics: ['welcome'], show_on_roadmap: true, company_id: companyId },
        { title: '[Example Idea] Pabbly Connect Integration', description: 'Adding Pabbly would make it much easier to connect a whole host of apps without any technical knowledge. Similar to Zapier and Integromat.', created_by_name: 'YourApp Team', votes: 0, status: 'planned', topics: ['improvement', 'integrations'], show_on_roadmap: true, company_id: companyId },
        { title: '[Example Idea] More colour options', description: 'Would love to see more colour palette options for customizing the look and feel.', created_by_name: 'YourApp Team', votes: 3, status: 'planned', topics: ['improvement', 'styling'], show_on_roadmap: true, company_id: companyId },
        { title: '[Read Me] We\'ve created a few example ideas for you', description: 'These example ideas show you what your feedback board can look like. Feel free to delete them when you\'re ready!', created_by_name: 'YourApp Team', votes: 0, status: 'new', topics: ['welcome'], show_on_roadmap: true, company_id: companyId },
        { title: '[Read Me] Change your Topics', description: 'Did you know that you can set your own Topics right here? Topics are a great way to categorise ideas so your customers can see where an idea belongs in your business.', created_by_name: 'YourApp Team', votes: 0, status: 'new', topics: ['welcome'], show_on_roadmap: true, company_id: companyId },
      ]
      for (const sample of samples) {
        await supabase.from('ideas').insert(sample)
      }
      const { data: newData } = await supabase.from('ideas').select('*').eq('company_id', companyId)
      if (newData) setIdeas(newData)
    } else if (data) {
      setIdeas(data)
    }
    if (companyId && !boardViewed.current) {
      boardViewed.current = true
      try { track('board_viewed', { idea_count: data?.length || 0 }) } catch {}
    }
    setLoading(false)
  }

  const fetchTopics = async () => {
    const DEFAULT_TOPICS = [
      { id: 'welcome', label: 'Welcome', emoji: '👋' },
      { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
      { id: 'integrations', label: 'Integrations', emoji: '🔗' },
      { id: 'styling', label: 'Styling', emoji: '🎨' },
      { id: 'misc', label: 'Misc', emoji: '✨' },
      { id: 'bug', label: 'Bug Report', emoji: '🐛' },
    ]
    
    const companyId = await companyIdNow()
    // No company resolved (still loading, or an unknown subdomain) — show the
    // default topics at zero. NEVER count ideas without a company_id filter:
    // that used to tally topics across EVERY tenant's ideas, so a brand-new
    // empty board displayed other companies' aggregate counts (a cross-tenant
    // leak) instead of its own 0s.
    if (!companyId) {
      setTopics(DEFAULT_TOPICS.map(t => ({ id: t.id, emoji: t.emoji, count: 0 })))
      return
    }
    const { data } = await supabase.from('ideas').select('topics').eq('company_id', companyId)

    const topicMap: Record<string, number> = {}
    
    // Aggregate topics from ideas
    if (data) {
      data.forEach((idea: any) => {
        if (idea.topics) {
          idea.topics.forEach((t: string) => {
            topicMap[t] = (topicMap[t] || 0) + 1
          })
        }
      })
    }
    
    // Include default topics even if no ideas have them yet
    DEFAULT_TOPICS.forEach(topic => {
      if (!topicMap[topic.id]) {
        topicMap[topic.id] = 0 // Show default topics with 0 count if not in use
      }
    })
    
    const topicsList = Object.entries(topicMap).map(([id, count]) => ({
      id,
      emoji: DEFAULT_TOPICS.find(t => t.id === id)?.emoji || '#',
      count,
    }))
    setTopics(topicsList.sort((a, b) => b.count - a.count))
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
    const isAdmin = isCompanyAdmin
    const isOwner = user?.id === i.user_id
    const matchesPrivacy = !i.is_private || isAdmin || isOwner
    
    return matchesSearch && matchesTopic && matchesStatus && matchesAdmin && matchesPrivacy
  }).sort((a, b) => {
    // Pinned ideas always rise to the top, regardless of the chosen sort
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1
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
    { key: 'latest', label: `Latest ${cap(plural)}` },
    { key: 'oldest', label: `Oldest ${cap(plural)}` },
    { key: 'most_votes', label: 'Most votes' },
    { key: 'least_votes', label: 'Least votes' },
    { key: 'highest_priority', label: 'Highest priority' },
    { key: 'lowest_priority', label: 'Lowest priority' },
  ] as const

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Trending'

  // The statuses in the sidebar: the four defaults, then the workspace's own.
  const statusList = (() => {
    const defaults = [
      { key: 'new', label: 'Under consideration', color: '#f97316' },
      { key: 'planned', label: 'Planned', color: '#3b82f6' },
      { key: 'in_progress', label: 'In Development', color: '#ea580c' },
      { key: 'shipped', label: 'Shipped', color: '#10b981' },
    ]
    const defaultKeys = new Set(defaults.map(d => d.key))
    const extras = customStatuses.filter(s => !defaultKeys.has(s.key)).map(s => ({ key: s.key, label: s.label, color: s.color || '#a1a1aa' }))
    return [...defaults, ...extras]
  })()
  // Counts follow what this visitor may see (private ideas are admins' and their authors').
  const visible = ideas.filter(i => !i.is_private || isCompanyAdmin || user?.id === i.user_id)
  const statusCount = (key: string) => visible.filter(i => i.status === key).length
  const topicLabel = (id: string) => {
    const d = DEFAULT_TOPICS.find(dt => dt.id === id)
    return d ? `${d.emoji} ${d.label}` : `# ${id}`
  }
  const roadmapHref = embedded ? '/admin/roadmap' : '/roadmap'
  const activeChips = [
    statusFilter && { k: 'status', label: statusList.find(s => s.key === statusFilter)?.label || statusFilter, clear: () => setStatusFilter(null) },
    topicFilter && { k: 'topic', label: topicLabel(topicFilter), clear: () => setTopicFilter(null) },
    adminFilter && { k: 'admin', label: ADMIN_FILTERS.find(f => f.key === adminFilter)?.label || adminFilter, clear: () => setAdminFilter(null) },
  ].filter(Boolean) as { k: string; label: string; clear: () => void }[]
  const clearAll = () => { setSearch(''); setTopicFilter(null); setStatusFilter(null); setAdminFilter(null) }

  const gear = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>

  return (
    <div className={`ib${embedded ? ' emb' : ''}`}>
      <style>{IB_CSS}</style>
      <header className="ib-head">
        <div style={{ minWidth: 0 }}>
          <h1>{getTerm('ideas_title')}</h1>
          <p>{filtered.length} {filtered.length === 1 ? getTerm('idea_singular') : plural}{activeChips.length || search.trim() ? ' match' : ' in total'}</p>
        </div>
        <div className="ib-head-acts">
          {embedded && (
            <a href="/?view=ideas" target="_blank" rel="noopener" className="ib-ghost" title="Open the public board in a new tab">
              Public board
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>
            </a>
          )}
          <button type="button" className="ib-new" onClick={() => setShowModal(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {getTerm('submit_idea')}
          </button>
        </div>
      </header>

      <div className="ib-cols">
        {/* Sidebar: statuses, topics and (admins) the housekeeping filters. */}
        <aside className="ib-side" aria-label="Filter">
          <section className="ib-sec">
            <div className="ib-sec-h">
              <span>{getTerm('statuses_heading')}</span>
              {isCompanyAdmin && <Link href="/admin/statuses" className="ib-icon" title="Manage statuses" aria-label="Manage statuses">{gear}</Link>}
              <Link href={roadmapHref} className="ib-more">Roadmap</Link>
            </div>
            {statusList.map(st => (
              <button key={st.key} type="button" className={`ib-row${statusFilter === st.key ? ' on' : ''}`} aria-pressed={statusFilter === st.key}
                onClick={() => setStatusFilter(statusFilter === st.key ? null : st.key)}>
                <span className="ib-dot" style={{ background: st.color }} aria-hidden />
                <span className="t">{st.label}</span>
                <span className="n">{statusCount(st.key)}</span>
              </button>
            ))}
          </section>

          <section className="ib-sec">
            <div className="ib-sec-h">
              <span>{getTerm('topics_heading')}</span>
              {isCompanyAdmin && <Link href="/admin/topics" className="ib-icon" title="Manage topics" aria-label="Manage topics">{gear}</Link>}
            </div>
            {topics.length > 0 ? topics.map(t => (
              <button key={t.id} type="button" className={`ib-row${topicFilter === t.id ? ' on' : ''}`} aria-pressed={topicFilter === t.id}
                onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}>
                <span className="t">{topicLabel(t.id)}</span>
                <span className="n">{t.count}</span>
              </button>
            )) : <p className="ib-none">No topics yet</p>}
          </section>

          {isCompanyAdmin && (
            <section className="ib-sec">
              <div className="ib-sec-h"><span>Admin</span></div>
              {ADMIN_FILTERS.map(f => (
                <button key={f.key} type="button" className={`ib-row${adminFilter === f.key ? ' on' : ''}`} aria-pressed={adminFilter === f.key}
                  onClick={() => setAdminFilter(adminFilter === f.key ? null : f.key)}>
                  <span className="ib-ic" aria-hidden><FilterIcon type={f.icon} /></span>
                  <span className="t">{f.label}</span>
                </button>
              ))}
            </section>
          )}
        </aside>

        <main className="ib-main">
          <div className="ib-tools">
            <label className="ib-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} aria-label={`Search ${plural}`}
                placeholder={search === '' ? (placeholderText || `Search ${plural}`) : `Search ${plural}`} />
              {search && <button type="button" className="ib-x" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
            </label>
            <button type="button" ref={sortBtnRef} className="ib-pill" onClick={() => setShowSortDropdown(v => !v)} aria-haspopup="listbox" aria-expanded={showSortDropdown}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h13M3 12h9M3 18h5M17 8V20M14 17l3 3 3-3" /></svg>
              {currentSortLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <SelectPopover open={showSortDropdown} onClose={() => setShowSortDropdown(false)} anchorRef={sortBtnRef} label="Sort by"
              value={sortBy} options={SORT_OPTIONS.map(o => ({ value: o.key, label: o.label }))} onPick={v => setSortBy(v as typeof sortBy)} width={220} />
          </div>

          {/* Phones: the sidebar's filters as a row of chips. */}
          <div className="ib-chips" aria-label="Filter">
            {statusList.map(st => (
              <button key={st.key} type="button" className={statusFilter === st.key ? 'on' : ''} onClick={() => setStatusFilter(statusFilter === st.key ? null : st.key)}>
                <span className="ib-dot" style={{ background: st.color }} aria-hidden />{st.label}
              </button>
            ))}
            {topics.filter(t => t.count > 0).map(t => (
              <button key={t.id} type="button" className={topicFilter === t.id ? 'on' : ''} onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}>{topicLabel(t.id)}</button>
            ))}
            {isCompanyAdmin && ADMIN_FILTERS.map(f => (
              <button key={f.key} type="button" className={adminFilter === f.key ? 'on' : ''} onClick={() => setAdminFilter(adminFilter === f.key ? null : f.key)}>{f.label}</button>
            ))}
          </div>

          {activeChips.length > 0 && (
            <div className="ib-active">
              {activeChips.map(c => (
                <button key={c.k} type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>{c.label}<span aria-hidden>×</span></button>
              ))}
              {activeChips.length > 1 && <button type="button" className="clear" onClick={clearAll}>Clear all</button>}
            </div>
          )}

          {loading ? (
            <div className="ib-skel" aria-label="Loading">{[0, 1, 2, 3].map(i => <span key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="ib-empty">
              {(search.trim() || topicFilter || statusFilter || adminFilter)
                ? <EmptyScroll kinds={['idea', 'chat']} title="No matches"
                    line={search.trim() ? `Nothing matches “${search.trim()}”. Try another word, or clear the filters.` : `No ${plural.toLowerCase()} match these filters.`}
                    action={<button type="button" className="cv-btn" onClick={clearAll}>Clear search and filters</button>} />
                : <EmptyScroll kinds={['idea', 'chat']} title={`No ${plural.toLowerCase()} yet`} line="Be the first to add one."
                    action={<button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowModal(true)}>Share an idea</button>} />}
            </div>
          ) : (
            <div className="ib-list">
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
                  onStatusChange={isCompanyAdmin ? handleStatusChange : undefined}
                  onClick={() => {
                    handleViewIncrement(idea.id)
                    setSelectedIdea(idea)
                    setShowDetailModal(true)
                  }}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showModal && (
        <IdeaModal
          resolveCompany={companyIdNow}
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

      {/* Guest vote: name + email, no password. */}
      {showGuestModal && (
        <div className="ib-scrim" onClick={() => setShowGuestModal(false)}>
          <div className="ib-dialog" role="dialog" aria-modal="true" aria-labelledby="ib-vote-h" onClick={e => e.stopPropagation()}>
            <h2 id="ib-vote-h">Cast your vote</h2>
            <p>Enter your name and email to vote. No password needed.</p>
            <label className="ib-lbl" htmlFor="ib-gn">Your name</label>
            <input id="ib-gn" className="ib-field" type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Jane Smith" autoFocus />
            <label className="ib-lbl" htmlFor="ib-ge">Email address</label>
            <input id="ib-ge" className="ib-field" type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="jane@example.com"
              onKeyDown={e => e.key === 'Enter' && handleGuestVoteSubmit()} />
            <p className="ib-fine">Your email stops duplicate votes and may be used to send updates on this idea.</p>
            <div className="ib-dialog-foot">
              <button type="button" className="ib-btn ghost" onClick={() => setShowGuestModal(false)}>Cancel</button>
              <button type="button" className="ib-btn go" onClick={handleGuestVoteSubmit} disabled={!guestName.trim() || !guestEmail.trim()}>Vote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const IB_CSS = `
.ib{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;--soft:#8e8e93;max-width:1240px;margin:0 auto;padding:28px 16px 120px;color:var(--ink)}
.ib.emb{max-width:1480px}
[data-theme="dark"] .ib{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa;--soft:#8b8b90}
@media (min-width:900px){.ib{padding:32px 32px 120px}}
.admin-main:has(.ib){overflow-x:clip!important;overflow-y:visible!important;min-width:0}
.ib button::before,.ib a::before{display:none!important}
.ib-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.ib-head h1{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:clamp(28px,3.4vw,36px);font-weight:700;letter-spacing:-.04em;line-height:1.05;color:var(--ink)}
.ib-head p{margin:7px 0 0;font-size:14.5px;color:var(--mut)}
.ib-head-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ib-new{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 18px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .12s}
.ib-new:hover{filter:brightness(.95)}.ib-new:active{transform:scale(.98)}
.ib-ghost{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 16px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.08);color:var(--ink);font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.ib-ghost:hover{background:var(--f)}
.ib-cols{display:grid;grid-template-columns:260px minmax(0,1fr);gap:18px;align-items:start}
.ib-side{position:sticky;top:76px;max-height:calc(100vh - 96px);overflow-y:auto;scrollbar-width:thin;padding:10px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.ib-sec+.ib-sec{margin-top:8px;padding-top:8px;box-shadow:0 -1px 0 var(--f2)}
.ib-sec-h{display:flex;align-items:center;gap:4px;padding:6px 8px 4px}
.ib-sec-h>span{flex:1;font-size:12.5px;font-weight:650;color:var(--soft)}
.ib-icon{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--soft);text-decoration:none}
.ib-icon:hover{background:var(--f);color:var(--ink)}
.ib-more{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--ink);text-decoration:none;background:var(--f)}
.ib-more:hover{background:var(--f2)}
.ib-row{display:flex;align-items:center;gap:10px;width:100%;min-height:38px;padding:7px 10px;margin:1px 0;border:none;border-radius:12px;background:none;font:inherit;font-size:14px;color:var(--ink);text-align:left;cursor:pointer;transition:background .15s}
.ib-row:hover{background:color-mix(in srgb,var(--f) 70%,transparent)}
.ib-row.on{background:var(--f);font-weight:650}
.ib-row .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ib-row .n{min-width:22px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;color:var(--mut);font-variant-numeric:tabular-nums}
.ib-row.on .n{background:var(--card,#fff)}
.ib-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.ib-ic{display:inline-flex;color:var(--soft)}
.ib-row.on .ib-ic{color:var(--ink)}
.ib-none{margin:4px 10px 8px;font-size:13px;color:var(--soft)}
.ib-main{min-width:0}
.ib-tools{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.ib-search{flex:1;min-width:0;display:flex;align-items:center;gap:9px;height:44px;padding:0 8px 0 15px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);color:var(--soft);transition:box-shadow .15s}
.ib-search:focus-within{box-shadow:0 0 0 1px rgba(0,0,0,.12),0 0 0 4px color-mix(in srgb,var(--coral) 14%,transparent)}
.ib .ib-search input{flex:1;min-width:0;height:100%;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:15px;color:var(--ink)!important}
.ib-x{width:28px;height:28px;border:none;border-radius:50%;background:var(--f);color:var(--mut);font-size:16px;line-height:1;cursor:pointer}
.ib-pill{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 16px;border:none;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.ib-pill:hover,.ib-pill[aria-expanded="true"]{background:var(--f)}
.ib-chips{display:none}
.ib-active{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.ib-active button{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 8px 0 12px;border:none;border-radius:999px;background:var(--ink);color:var(--card,#fff);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.ib-active button span{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);font-size:13px;line-height:1}
.ib-active button.clear{padding:0 12px;background:var(--f);color:var(--ink)}
.ib-list{display:flex;flex-direction:column;gap:10px}
.ib-empty{padding:20px 0}
.ib-skel{display:flex;flex-direction:column;gap:10px}
.ib-skel span{display:block;height:112px;border-radius:20px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:ibSk 1.2s ease infinite}
@keyframes ibSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (max-width:899px){
  .ib-cols{grid-template-columns:minmax(0,1fr)}
  .ib-side{display:none}
  .ib-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 12px;padding:0 16px}
  .ib-chips::-webkit-scrollbar{display:none}
  .ib-chips button{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
  .ib-chips button.on{background:var(--ink);color:var(--card,#fff)}
  .ib-pill{padding:0 14px}
  .ib-head-acts{width:100%}
  .ib-new{flex:1;justify-content:center}
}
.ib-scrim{position:fixed;inset:0;z-index:3000;background:rgba(15,15,20,.42);display:flex;align-items:center;justify-content:center;padding:16px}
.ib-dialog{width:min(400px,100%);padding:22px;border-radius:24px;background:var(--card,#fff);box-shadow:0 30px 80px -20px rgba(0,0,0,.35)}
.ib-dialog h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.ib-dialog>p{margin:5px 0 4px;font-size:13.5px;color:var(--mut)}
.ib-lbl{display:block;margin:14px 0 7px;font-size:13px;font-weight:650;color:var(--ink)}
.ib .ib-field{width:100%;height:46px;padding:0 15px;border-radius:14px;border:1.5px solid transparent!important;background:var(--f)!important;box-shadow:none!important;outline:none;font:inherit;font-size:15px;color:var(--ink)!important;box-sizing:border-box}
.ib .ib-field:focus{background:var(--card,#fff)!important;border-color:var(--f2)!important}
.ib-fine{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--soft)}
.ib-dialog-foot{display:flex;gap:8px;margin-top:18px}
.ib-btn{flex:1;height:46px;border:none;border-radius:999px;font:inherit;font-size:14.5px;font-weight:650;cursor:pointer}
.ib-btn.ghost{background:var(--f);color:var(--ink)}
.ib-btn.go{background:var(--coral);color:#fff}
.ib-btn:disabled{opacity:.5;cursor:default}
.ib :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
`
