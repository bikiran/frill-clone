'use client'

import { useState, useEffect, useRef } from 'react'
import ImageViewer from './ImageViewer'
import { supabase } from '@/lib/supabase'
import { getRandomName } from '@/lib/randomNames'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from './ConfirmModal'
import { AssignIcon, PinIcon, MergeIcon, ArchiveIcon, TrashIcon, EditIcon, ShareIcon, CloseIcon, EyeIcon, LockIcon } from './Icons'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Under consideration', color: '#3b82f6', bg: '#dbeafe' },
  planned: { label: 'Planned', color: '#7c3aed', bg: '#ede9fe' },
  in_progress: { label: 'In Development', color: '#ea580c', bg: '#ffedd5' },
  shipped: { label: 'Shipped', color: '#059669', bg: '#d1fae5' },
  no_status: { label: 'No Status', color: '#9ca3af', bg: '#f3f4f6' },
}

const PRIORITY_PRESETS: Record<string, { label: string; color: string; bg: string; vote: number; reward: number; effort: number }> = {
  quick_wins: { label: 'Quick Wins', color: '#ec4899', bg: '#fce7f3', vote: 100, reward: 100, effort: 1 },
  high: { label: 'High', color: '#dc2626', bg: '#fee2e2', vote: 80, reward: 80, effort: 2 },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7', vote: 50, reward: 50, effort: 3 },
  low: { label: 'Low', color: '#3b82f6', bg: '#dbeafe', vote: 20, reward: 20, effort: 4 },
}

const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
]

type SubPanel = null | 'status' | 'priority' | 'visibility'

export default function IdeaDetailModal({ idea, onClose, showActivity = true }: { idea: any; onClose: () => void; showActivity?: boolean }) {
  const { addToast } = useToast()
  
  const [status, setStatus] = useState(idea.status || 'new')
  const [priority, setPriority] = useState(idea.priority || '')
  const [isPrivate, setIsPrivate] = useState(idea.is_private || false)
  const [showOnRoadmap, setShowOnRoadmap] = useState(idea.show_on_roadmap !== false)
  const [coverImageUrl, setCoverImageUrl] = useState(idea.cover_image_url || '')
  const [ideaImageViewerSrc, setIdeaImageViewerSrc] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [showBodyStatusMenu, setShowBodyStatusMenu] = useState(false)
  
  // Priority sliders
  const [voteScore, setVoteScore] = useState(100)
  const [reward, setReward] = useState(100)
  const [effort, setEffort] = useState(1)
  
  // Editing
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(idea.title)
  const [editDescription, setEditDescription] = useState(idea.description || '')
  const [editTopics, setEditTopics] = useState<string[]>(idea.topics || [])
  
  // Comments
  const [voters, setVoters] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [isPrivateNote, setIsPrivateNote] = useState(false)
  const [loadingComment, setLoadingComment] = useState(false)
  const [commentImageUrl, setCommentImageUrl] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({})
  const commentFileRef = useRef<HTMLInputElement>(null)
  
  const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥']
  
  const [activityLog, setActivityLog] = useState<any[]>([])
  
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [userRole, setUserRole] = useState<'viewer' | 'editor' | 'admin' | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDeleteIdea, setConfirmDeleteIdea] = useState(false)
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null)
  const [subPanel, setSubPanel] = useState<SubPanel>(null)
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [dbStatuses, setDbStatuses] = useState<any[]>([])
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [showPollModal, setShowPollModal] = useState(false)
  const [showSurveyModal, setShowSurveyModal] = useState(false)
  const [availablePolls, setAvailablePolls] = useState<any[]>([])
  const [availableSurveys, setAvailableSurveys] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      setUser(u)
      if (u) {
        import('@/lib/board').then(({ isCompanyAdminUser }) => {
          isCompanyAdminUser(u).then(setIsCompanyAdmin)
        })
        // Fetch user's role from team_members
        const { data: member } = await (supabase as any)
          .from('team_members')
          .select('role')
          .eq('user_id', u.id)
          .maybeSingle()
        if (member?.role) {
          setUserRole(member.role as 'viewer' | 'editor' | 'admin')
        }
      }
    })
    fetchVoters()
    fetchComments()
    fetchActivity()
    // Company name — used as the fallback initial on voter avatars
    if (idea.company_id) {
      ;(supabase as any).from('companies').select('name').eq('id', idea.company_id).maybeSingle()
        .then(({ data }: any) => { if (data?.name) setCompanyName(data.name) })
    }
    // Fetch custom statuses
    supabase.from('statuses').select('*').order('order_index', { ascending: true }).then(({ data }) => {
      if (data) setDbStatuses(data)
    })
    // Fetch available polls and surveys — scoped to THIS idea's company only.
    // An unscoped fetch leaked every company's polls/surveys into the panel.
    ;(async () => {
      let cid: string | null = idea.company_id || null
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com' && !h.includes('localhost')) {
          const slug = h.replace('.colvy.com', '')
          const { data } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
          if (data?.id) cid = data.id
        }
      }
      if (cid) {
        const { data: pollData } = await (supabase as any).from('polls').select('*').eq('company_id', cid)
        setAvailablePolls(pollData || [])
        const { data: surveyData } = await (supabase as any).from('surveys').select('*').eq('company_id', cid)
        setAvailableSurveys(surveyData || [])
      } else {
        setAvailablePolls([])
        setAvailableSurveys([])
      }
    })()

    const commentsChannel = supabase
      .channel(`comments-${idea.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `idea_id=eq.${idea.id}` }, () => fetchComments())
      .subscribe()

    const votesChannel = supabase
      .channel(`detail-votes-${idea.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `idea_id=eq.${idea.id}` }, () => fetchVoters())
      .subscribe()

    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        if (subPanel) setSubPanel(null)
        else if (editing) setEditing(false)
        else onClose() 
      }
    }
    window.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'

    return () => {
      supabase.removeChannel(commentsChannel)
      supabase.removeChannel(votesChannel)
      window.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [idea.id, onClose, subPanel, editing])

  const fetchVoters = async () => {
    const { data } = await supabase.from('votes').select('*').eq('idea_id', idea.id)
    setVoters(data || [])
  }

  const fetchComments = async () => {
    const { data } = await supabase.from('comments').select('*').eq('idea_id', idea.id).order('created_at', { ascending: true })
    setComments(data || [])
    
    // Fetch reactions for all comments
    if (data && data.length > 0) {
      const { data: reactionsData } = await supabase.from('reactions').select('*').in('comment_id', data.map(c => c.id))
      if (reactionsData) {
        const reactionMap: Record<string, Record<string, number>> = {}
        reactionsData.forEach(r => {
          if (!reactionMap[r.comment_id]) reactionMap[r.comment_id] = {}
          reactionMap[r.comment_id][r.emoji] = (reactionMap[r.comment_id][r.emoji] || 0) + 1
        })
        setReactions(reactionMap)
      }
    }
  }

  const fetchActivity = async () => {
    const { data } = await supabase
      .from('activity')
      .select('*')
      .eq('idea_id', idea.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setActivityLog(data || [])
  }

  const addComment = async () => {
    if ((!newComment.trim() && !commentImageUrl) || !user) return
    setLoadingComment(true)
    const content = commentImageUrl ? `${newComment.trim()}\n<img src="${commentImageUrl}" />` : newComment.trim()
    const displayName = user.user_metadata?.display_name || (user as any).user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous'
    const { error } = await supabase.from('comments').insert({
      idea_id: idea.id,
      user_id: user.id,
      user_name: displayName,
      content,
      is_private: isPrivateNote,
      parent_id: replyingTo || null,
    })
    if (error) {
      alert('Failed to post comment: ' + error.message)
    } else {
      // Notify: idea owner about the comment; parent comment author about the reply.
      // Never for private notes, never notify yourself.
      try {
        if (!isPrivateNote) {
          const actorName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Someone'
          const preview = newComment.trim().slice(0, 120)
          if (replyingTo) {
            const parent = comments.find(c => c.id === replyingTo)
            if (parent?.user_id && parent.user_id !== user.id) {
              const { createNotification } = await import('@/lib/notifications')
              await createNotification(parent.user_id, 'reply', idea.id, `${actorName} replied on "${idea.title}": ${preview}`, actorName, user.email)
            }
          }
          if (idea.user_id && idea.user_id !== user.id) {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(idea.user_id, 'comment', idea.id, `${actorName} commented on "${idea.title}": ${preview}`, actorName, user.email)
          }
        }
      } catch {}
      setNewComment('')
      setIsPrivateNote(false)
      setCommentImageUrl(null)
      setReplyingTo(null)
      fetchComments()
    }
    setLoadingComment(false)
  }

  const addReaction = async (commentId: string, emoji: string) => {
    if (!user) return
    try {
      const { data: existing } = await supabase
        .from('reactions')
        .select('*')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .single()
      
      if (existing) {
        await supabase.from('reactions').delete().eq('id', existing.id)
      } else {
        await supabase.from('reactions').insert({
          comment_id: commentId,
          user_id: user.id,
          emoji,
        })
      }
      fetchComments()
    } catch (error) {
      console.error('Failed to toggle reaction:', error)
    }
  }

  const copyCommentLink = (commentId: string) => {
    const url = `${window.location.origin}/?comment=${commentId}`
    navigator.clipboard.writeText(url)
    alert('Comment link copied to clipboard!')
  }

  const uploadCommentImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fileName = `comment-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      setCommentImageUrl(publicUrl)
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
  }

  const deleteComment = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId)
    fetchComments()
    setConfirmDeleteComment(null)
  }

  const deleteIdea = async () => {
    await supabase.from('ideas').delete().eq('id', idea.id)
    setConfirmDeleteIdea(false)
    onClose()
  }

  const saveEdit = async () => {
    if (!editTitle.trim()) {
      alert('Title cannot be empty')
      return
    }
    await supabase.from('ideas').update({
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      topics: editTopics,
    }).eq('id', idea.id)
    idea.title = editTitle.trim()
    idea.description = editDescription.trim()
    idea.topics = editTopics
    setEditing(false)
    addToast('Idea updated successfully!', 'success')
  }

  const shareIdea = async () => {
    const url = `${window.location.origin}?idea=${idea.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert(`Share: ${url}`)
    }
  }

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [following, setFollowing] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [voteCount, setVoteCount] = useState(idea.votes || 0)
  const [voteAnimating, setVoteAnimating] = useState(false)
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [showMergeDropdown, setShowMergeDropdown] = useState(false)
  const [mergeSearchQuery, setMergeSearchQuery] = useState('')
  const [allIdeas, setAllIdeas] = useState<any[]>([])

  // Check if user already voted
  useEffect(() => {
    if (user) {
      const voted = voters.some(v => v.user_id === user.id)
      setHasVoted(voted)
    } else {
      // For guest users, check localStorage
      const guestVotes = localStorage.getItem('guest_votes')
      if (guestVotes) {
        try {
          const voted = JSON.parse(guestVotes).includes(idea.id)
          setHasVoted(voted)
        } catch {}
      }
    }
    // voteCount tracks the ideas.votes counter (the single source of truth, which
    // also includes guest votes that have no row in the votes table). Using
    // voters.length here would drop guest votes and disagree with the summary card.
  }, [voters, user, idea.id])

  // Keep voteCount in sync when the idea prop refreshes
  useEffect(() => {
    setVoteCount(idea.votes || 0)
  }, [idea.id, idea.votes])

  const toggleVote = async () => {
    if (!user) {
      alert('Please sign in to vote')
      return
    }
    setVoteAnimating(true)
    setTimeout(() => setVoteAnimating(false), 500)

    if (hasVoted) {
      await supabase.from('votes').delete().eq('idea_id', idea.id).eq('user_id', user.id)
      setHasVoted(false)
      setVoteCount((prev: number) => Math.max(0, prev - 1))
      // Keep the ideas.votes counter (shown on summary cards) in sync
      const { data: cur } = await (supabase as any).from('ideas').select('votes').eq('id', idea.id).maybeSingle()
      await supabase.from('ideas').update({ votes: Math.max(0, (cur?.votes || 0) - 1) }).eq('id', idea.id)
    } else {
      const um = user.user_metadata || {}
      await supabase.from('votes').insert({
        idea_id: idea.id,
        user_id: user.id,
        user_name: um.display_name || user.email?.split('@')[0] || null,
        user_avatar: um.avatar_url || null,
      })
      setHasVoted(true)
      setVoteCount((prev: number) => prev + 1)
      const { data: cur } = await (supabase as any).from('ideas').select('votes').eq('id', idea.id).maybeSingle()
      await supabase.from('ideas').update({ votes: (cur?.votes || 0) + 1 }).eq('id', idea.id)
      // Notify the idea owner about the new vote (not for self-votes)
      try {
        if (idea.user_id && idea.user_id !== user.id) {
          const { createNotification } = await import('@/lib/notifications')
          const actorName = um.display_name || user.email?.split('@')[0] || 'Someone'
          await createNotification(idea.user_id, 'vote', idea.id, `${actorName} voted on "${idea.title}"`, actorName, user.email)
        }
      } catch {}
    }
    fetchVoters()
  }

  const fetchAllIdeas = async () => {
    let q = (supabase as any).from('ideas').select('id, title, votes').neq('id', idea.id)
    if (idea.company_id) q = q.eq('company_id', idea.company_id)
    const { data } = await q.order('created_at', { ascending: false }).limit(20)
    setAllIdeas(data || [])
  }

  // Real merge: moves this idea's comments/votes/subscriptions into the target,
  // combines vote counters (deduping users who voted on both), records the merge,
  // and archives this idea. Previously this was only an alert() — nothing happened.
  const performMerge = async (target: any) => {
    if (!confirm(`Merge "${idea.title}" into "${target.title}"?\n\nComments and votes will move to "${target.title}" and this idea will be archived.`)) return
    try {
      // 1. Move comments
      await supabase.from('comments').update({ idea_id: target.id }).eq('idea_id', idea.id)

      // 2. Move votes, deduping users who voted on both ideas
      const { data: targetVotes } = await (supabase as any).from('votes').select('user_id').eq('idea_id', target.id)
      const targetVoterIds = new Set((targetVotes || []).map((v: any) => v.user_id))
      const { data: sourceVotes } = await (supabase as any).from('votes').select('id, user_id').eq('idea_id', idea.id)
      let duplicates = 0
      for (const v of sourceVotes || []) {
        if (targetVoterIds.has(v.user_id)) {
          await supabase.from('votes').delete().eq('id', v.id)
          duplicates++
        } else {
          await supabase.from('votes').update({ idea_id: target.id }).eq('id', v.id)
        }
      }

      // 3. Combine counters (source counter includes guest votes)
      const { data: freshTarget } = await (supabase as any).from('ideas').select('votes').eq('id', target.id).maybeSingle()
      const combined = Math.max(0, (freshTarget?.votes || 0) + (idea.votes || 0) - duplicates)
      await supabase.from('ideas').update({ votes: combined }).eq('id', target.id)

      // 4. Move subscriptions if the table exists (ignore errors when it doesn't)
      try { await (supabase as any).from('idea_subscriptions').update({ idea_id: target.id }).eq('idea_id', idea.id) } catch {}

      // 5. Archive the source and note where it went
      await supabase.from('ideas').update({
        is_archived: true,
        description: `${idea.description || ''}\n\n[Merged into: ${target.title}]`.trim(),
      }).eq('id', idea.id)

      // 6. Log the merge on the target's activity
      if (user) {
        await supabase.from('activity').insert({
          idea_id: target.id,
          user_id: user.id,
          action: 'merged',
          old_value: idea.title,
          new_value: target.title,
        })
      }

      setShowMergeDropdown(false)
      alert(`Merged "${idea.title}" into "${target.title}".`)
      onClose()
    } catch (e: any) {
      alert('Merge failed: ' + (e.message || 'unknown error'))
    }
  }

  const updateIdea = async (updates: any) => {
    setSaveStatus('saving')
    const { error } = await supabase.from('ideas').update(updates).eq('id', idea.id)
    if (error) {
      console.error('Update error:', error)
      setSaveStatus('error')
      alert('Failed to save: ' + error.message + '\n\nMake sure DATABASE_SETUP.sql has been run.')
    } else {
      // Log activity for status changes
      if (updates.status && updates.status !== idea.status && user) {
        await supabase.from('activity').insert({
          idea_id: idea.id,
          user_id: user.id,
          action: 'status_changed',
          old_value: idea.status || 'new',
          new_value: updates.status,
        })
        // Notify the idea owner that the status changed (not when changing your own)
        try {
          if (idea.user_id && idea.user_id !== user.id) {
            const actorName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Someone'
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(idea.user_id, 'status_change', idea.id, `"${idea.title}" status changed to ${String(updates.status).replace('_', ' ')}`, actorName, user.email)
          }
        } catch {}
      }
      
      // Apply optimistic update to local idea object so re-opening shows the new values
      Object.assign(idea, updates)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }

  const uploadCoverImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const fileName = `cover-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file)
      if (error) {
        alert('Upload failed: ' + error.message)
      } else {
        const { data: urlData } = supabase.storage.from('idea-images').getPublicUrl(data.path)
        setCoverImageUrl(urlData.publicUrl)
        await updateIdea({ cover_image_url: urlData.publicUrl })
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setUploadingCover(false)
  }

  const isAdmin = isCompanyAdmin
  const isOwner = user?.id === idea.user_id
  const canEdit = isAdmin || isOwner
  const canEditStatus = isAdmin || userRole === 'editor'  // Only admin or editor can change idea status
  const currentStatus = STATUS_CONFIG[status] || STATUS_CONFIG.new
  const currentPriority = priority ? PRIORITY_PRESETS[priority] : null

  // Compute priority pill text from current sliders if a priority is selected
  const priorityPillText = currentPriority 
    ? `${currentPriority.label} (${Math.round((voteScore + reward) / (effort * 2))})` 
    : 'No priority'

  // Filter comments: non-admins don't see private notes
  const visibleComments = (() => {
    const filtered = comments.filter(c => !c.is_private || isAdmin || c.user_id === user?.id)
    // Group replies under their parent comments
    const topLevel = filtered.filter(c => !c.parent_id)
    const result: typeof filtered = []
    topLevel.forEach(parent => {
      result.push(parent)
      const replies = filtered.filter(c => c.parent_id === parent.id)
      result.push(...replies)
    })
    // Add orphaned replies (parent deleted)
    const inResult = new Set(result.map(c => c.id))
    filtered.filter(c => c.parent_id && !inResult.has(c.id)).forEach(c => result.push(c))
    return result
  })()

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 animate-backdrop backdrop-blur-sm" 
        style={{ background: 'rgba(0,0,0,0.4)' }} 
        onClick={onClose} 
      />

      {/* Slide-out panel from right */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[90%] lg:w-[80%] xl:w-[75%] bg-white shadow-2xl drawer-open flex overflow-hidden">
        {/* Left admin sidebar */}
        {isAdmin && (
          <aside className="hidden md:flex flex-col w-72 lg:w-80 shrink-0 bg-gray-50 border-r relative overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {/* MAIN ADMIN VIEW */}
            <div 
              className="absolute inset-0 flex flex-col transition-transform duration-300"
              style={{ transform: subPanel ? 'translateX(-100%)' : 'translateX(0)' }}>
              
              <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Admin</h2>
                <div className="relative">
                  <button onClick={() => setShowAdminMenu(!showAdminMenu)} className="w-7 h-7 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-smooth">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--slate)" stroke="none"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                  </button>
                  {showAdminMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowAdminMenu(false)} />
                      <div className="absolute top-full right-0 mt-2 w-44 bg-white rounded-lg shadow-2xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                        <button onClick={shareIdea} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                          {copied ? 'Copied!' : 'Copy link'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Status / Priority / Visibility rows */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <button
                  onClick={() => setSubPanel('status')}
                  disabled={!canEditStatus}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-white transition-smooth disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title={!canEditStatus ? 'Only admins and editors can change status' : ''}>
                  <span className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: currentStatus.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: currentStatus.color }} />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Status</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: currentStatus.bg, color: currentStatus.color }}>
                      {currentStatus.label}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--slate)' }}>›</span>
                  </span>
                </button>

                <button
                  onClick={() => setSubPanel('priority')}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-white transition-smooth">
                  <span className="flex items-center gap-3">
                    <span className="w-5 h-5 grid grid-cols-2 gap-0.5">
                      <span className="bg-gray-400 rounded-sm" />
                      <span className="bg-gray-400 rounded-sm" />
                      <span className="bg-gray-400 rounded-sm" />
                      <span className="bg-gray-400 rounded-sm" />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Priority</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {currentPriority && (
                      <span className="text-xs px-2 py-1 rounded font-medium flex items-center gap-1" style={{ background: currentPriority.bg, color: currentPriority.color }}>
                        {priorityPillText}
                      </span>
                    )}
                    <span className="text-sm" style={{ color: 'var(--slate)' }}>›</span>
                  </span>
                </button>

                <button
                  onClick={() => setSubPanel('visibility')}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-white transition-smooth">
                  <span className="flex items-center gap-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Visibility</span>
                  </span>
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>›</span>
                </button>
              </div>

              {/* Bottom actions */}
              <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Actions</p>
                <div className="space-y-1">
                  {/* Assign */}
                  <div className="relative">
                    <button 
                      onClick={() => { setShowAssignDropdown(!showAssignDropdown); setShowMergeDropdown(false) }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-white transition-smooth cursor-pointer text-left" 
                      style={{ borderColor: 'var(--border)' }}>
                      <AssignIcon size={16} color="var(--slate)" />
                      <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>Assign</span>
                    </button>
                    {showAssignDropdown && (
                      <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-lg shadow-2xl border z-40 animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                        <div className="p-2 text-xs font-semibold" style={{ color: 'var(--slate)' }}>Assign to team member</div>
                        {['Admin', 'Team Member 1', 'Team Member 2'].map(name => (
                          <button key={name} onClick={() => { alert(`Assigned to ${name}`); setShowAssignDropdown(false) }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer" style={{ color: 'var(--ink)' }}>
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: 'var(--coral)' }}>{name[0]}</span>
                              {name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Pin */}
                  <button 
                    onClick={() => { const newPinned = !idea.is_pinned; updateIdea({ is_pinned: newPinned }) }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-white transition-smooth cursor-pointer" 
                    style={{ 
                      borderColor: idea.is_pinned ? 'var(--coral)' : 'var(--border)', 
                      background: idea.is_pinned ? 'var(--peach)' : 'transparent' 
                    }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={idea.is_pinned ? 'var(--coral)' : 'none'} stroke={idea.is_pinned ? 'var(--coral)' : 'var(--slate)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                    </svg>
                    <span className="text-xs font-medium" style={{ color: idea.is_pinned ? 'var(--coral)' : 'var(--ink)' }}>
                      {idea.is_pinned ? 'Pinned' : 'Pin'}
                    </span>
                  </button>
                  
                  {/* Merge */}
                  <div className="relative">
                    <button 
                      onClick={() => { setShowMergeDropdown(!showMergeDropdown); setShowAssignDropdown(false); if (!showMergeDropdown) fetchAllIdeas() }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-white transition-smooth cursor-pointer text-left" 
                      style={{ borderColor: 'var(--border)' }}>
                      <MergeIcon size={16} color="var(--slate)" />
                      <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>Merge</span>
                    </button>
                    {showMergeDropdown && (
                      <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-lg shadow-2xl border z-40 animate-fade-in-up max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                        <div className="p-2 sticky top-0 bg-white border-b" style={{ borderColor: 'var(--border)' }}>
                          <input
                            type="text"
                            value={mergeSearchQuery}
                            onChange={e => setMergeSearchQuery(e.target.value)}
                            placeholder="Search ideas..."
                            className="w-full px-3 py-1.5 rounded-md border text-xs focus:outline-none"
                            style={{ borderColor: 'var(--border)', fontSize: '14px' }}
                          />
                        </div>
                        {allIdeas.filter(i => i.title.toLowerCase().includes(mergeSearchQuery.toLowerCase())).map(i => (
                          <button key={i.id} onClick={() => performMerge(i)} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-smooth cursor-pointer border-b" style={{ color: 'var(--ink)', borderColor: 'var(--border)' }}>
                            <p className="font-medium line-clamp-1">{i.title}</p>
                            <p className="mt-0.5" style={{ color: 'var(--slate)' }}>{i.votes || 0} votes</p>
                          </button>
                        ))}
                        {allIdeas.length === 0 && <p className="p-3 text-xs" style={{ color: 'var(--slate)' }}>No other ideas found</p>}
                      </div>
                    )}
                  </div>
                  
                  {/* Archive */}
                  <button 
                    onClick={() => { 
                      const newArchived = !idea.is_archived
                      updateIdea({ is_archived: newArchived })
                      idea.is_archived = newArchived
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-white transition-smooth cursor-pointer" 
                    style={{ 
                      borderColor: idea.is_archived ? 'var(--coral)' : 'var(--border)', 
                      background: idea.is_archived ? 'var(--peach)' : 'transparent' 
                    }}>
                    <ArchiveIcon size={16} color={idea.is_archived ? 'var(--coral)' : 'var(--slate)'} />
                    <span className="text-xs font-medium" style={{ color: idea.is_archived ? 'var(--coral)' : 'var(--ink)' }}>
                      {idea.is_archived ? 'Archived' : 'Archive'}
                    </span>
                  </button>
                  
                  {/* Delete */}
                  {isAdmin && (
                    <button 
                      onClick={() => setConfirmDeleteIdea(true)} 
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-red-50 transition-smooth cursor-pointer" 
                      style={{ borderColor: '#fca5a5' }}>
                      <TrashIcon size={16} color="#dc2626" />
                      <span className="text-xs font-medium" style={{ color: '#dc2626' }}>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SUB-PANEL: STATUS */}
            <div 
              className="absolute inset-0 bg-gray-50 transition-transform duration-300 overflow-y-auto"
              style={{ transform: subPanel === 'status' ? 'translateX(0)' : 'translateX(100%)' }}>
              <div className="p-5">
                <button onClick={() => setSubPanel(null)} className="flex items-center gap-2 mb-6 text-sm transition-smooth hover:opacity-70" style={{ color: 'var(--ink)' }}>
                  <span className="text-lg" style={{ color: 'var(--slate)' }}>←</span>
                  <h2 className="text-xl font-bold">Settings</h2>
                </button>
                
                <h3 className="text-base font-bold mb-4" style={{ color: 'var(--ink)' }}>Status</h3>
                
                {!canEditStatus ? (
                  <div className="p-4 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626', fontSize: 13, textAlign: 'center' }}>
                    Only admins and editors can change idea status.
                  </div>
                ) : (
                <div className="space-y-1 mb-6">
                  {(() => {
                    const defaultKeys = new Set(Object.keys(STATUS_CONFIG))
                    const extras = dbStatuses.filter(s => !defaultKeys.has(s.key)).map(s => [s.key, { label: s.label, color: s.color, bg: s.bg || '#f3f4f6' }] as [string, { label: string; color: string; bg: string }])
                    const allEntries = [...Object.entries(STATUS_CONFIG), ...extras]
                    return allEntries.map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => { setStatus(key); updateIdea({ status: key }) }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white transition-smooth text-left">
                      <span 
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-smooth"
                        style={{ 
                          borderColor: status === key ? cfg.color : '#d1d5db',
                          background: status === key ? cfg.color : 'transparent',
                        }}>
                        {status === key && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm" style={{ color: status === key ? 'var(--ink)' : 'var(--slate)' }}>
                        {cfg.label}
                      </span>
                    </button>
                  ))
                  })()}
                </div>
                )}

                <a href="/admin/statuses" className="text-sm font-medium" style={{ color: '#3b82f6' }}>
                  Manage statuses
                </a>
              </div>
            </div>

            {/* SUB-PANEL: PRIORITY */}
            <div 
              className="absolute inset-0 bg-gray-50 transition-transform duration-300 overflow-y-auto"
              style={{ transform: subPanel === 'priority' ? 'translateX(0)' : 'translateX(100%)' }}>
              <div className="p-5">
                <button onClick={() => setSubPanel(null)} className="flex items-center gap-2 mb-6 text-sm transition-smooth hover:opacity-70" style={{ color: 'var(--ink)' }}>
                  <span className="text-lg" style={{ color: 'var(--slate)' }}>←</span>
                  <h2 className="text-xl font-bold">Settings</h2>
                </button>
                
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Priority</h3>
                  {currentPriority && (
                    <span className="text-xs px-2.5 py-1 rounded border font-medium flex items-center gap-1" 
                      style={{ background: currentPriority.bg, color: currentPriority.color, borderColor: currentPriority.color }}>
                      {priorityPillText}
                    </span>
                  )}
                </div>

                {/* Priority preset selector */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {Object.entries(PRIORITY_PRESETS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => { 
                        setPriority(key)
                        setVoteScore(cfg.vote)
                        setReward(cfg.reward)
                        setEffort(cfg.effort)
                        updateIdea({ priority: key }) 
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium transition-smooth border"
                      style={{
                        background: priority === key ? cfg.bg : 'white',
                        color: priority === key ? cfg.color : 'var(--slate)',
                        borderColor: priority === key ? cfg.color : 'var(--border)',
                      }}>
                      {cfg.label}
                    </button>
                  ))}
                </div>

                {/* Vote Score */}
                <div className="mb-5">
                  <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
                    Vote Score
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center text-xs" style={{ borderColor: 'var(--slate)', color: 'var(--slate)' }}>i</span>
                  </label>
                  <input
                    type="text"
                    value={`${voteScore}%`}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--slate)' }}
                  />
                </div>

                {/* Reward slider */}
                <div className="mb-5">
                  <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--ink)' }}>Reward</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="25"
                    value={reward}
                    onChange={(e) => setReward(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--slate)' }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Effort */}
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--ink)' }}>Effort</label>
                  <select 
                    value={effort}
                    onChange={(e) => setEffort(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <a href="/admin" className="text-sm font-medium" style={{ color: '#3b82f6' }}>
                  Manage priority settings
                </a>
              </div>
            </div>

            {/* SUB-PANEL: VISIBILITY */}
            <div 
              className="absolute inset-0 bg-gray-50 transition-transform duration-300 overflow-y-auto"
              style={{ transform: subPanel === 'visibility' ? 'translateX(0)' : 'translateX(100%)' }}>
              <div className="p-5">
                <button onClick={() => setSubPanel(null)} className="flex items-center gap-2 mb-6 text-sm transition-smooth hover:opacity-70" style={{ color: 'var(--ink)' }}>
                  <span className="text-lg" style={{ color: 'var(--slate)' }}>←</span>
                  <h2 className="text-xl font-bold">Settings</h2>
                </button>

                <h3 className="text-base font-bold mb-4" style={{ color: 'var(--ink)' }}>Visibility</h3>

                {/* Make private */}
                <div className="mb-6">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Make private</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Limit Idea access to your team.</p>
                    </div>
                    <button
                      onClick={() => { setIsPrivate(!isPrivate); updateIdea({ is_private: !isPrivate }) }}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth whitespace-nowrap shrink-0"
                      style={{ 
                        background: isPrivate ? 'var(--peach)' : 'white',
                        borderColor: isPrivate ? 'var(--coral)' : 'var(--border)',
                        color: isPrivate ? 'var(--coral)' : 'var(--ink)',
                      }}>
                      Make {isPrivate ? 'public' : 'private'}
                    </button>
                  </div>
                </div>

                {/* Show on roadmap */}
                <div className="mb-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Show Idea on Roadmap</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Show/hide Idea on your Roadmap.</p>
                    </div>
                    <button
                      onClick={() => { setShowOnRoadmap(!showOnRoadmap); updateIdea({ show_on_roadmap: !showOnRoadmap }) }}
                      className="relative w-11 h-6 rounded-full transition-smooth shrink-0"
                      style={{ background: showOnRoadmap ? '#3b82f6' : '#d1d5db' }}>
                      <div 
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                        style={{ transform: showOnRoadmap ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>
                </div>

                {/* Cover image */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Cover image</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Add a cover image (600×200)</p>
                    </div>
                    <button
                      onClick={() => coverFileRef.current?.click()}
                      disabled={uploadingCover}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth shrink-0 disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      {uploadingCover ? 'Uploading...' : 'Upload'}
                    </button>
                    <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={uploadCoverImage} />
                  </div>
                  {coverImageUrl && (
                    <div className="mt-3 relative">
                      <img src={coverImageUrl} alt="Cover" className="w-full h-24 object-cover rounded-lg" />
                      <button
                        onClick={() => { setCoverImageUrl(''); updateIdea({ cover_image_url: null }) }}
                        className="absolute top-1 right-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded press-effect">
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 bg-white z-10 px-6 py-4 flex justify-end gap-1.5 items-center border-b" style={{ borderColor: 'var(--border)' }}>
            {saveStatus !== 'idle' && (
              <span className="text-xs px-2 py-1 rounded transition-smooth animate-fade-in-up mr-auto" style={{
                background: saveStatus === 'saving' ? '#fef3c7' : saveStatus === 'saved' ? '#d1fae5' : '#fee2e2',
                color: saveStatus === 'saving' ? '#92400e' : saveStatus === 'saved' ? '#065f46' : '#991b1b',
              }}>
                {saveStatus === 'saving' && 'Saving...'}
                {saveStatus === 'saved' && '✓ Saved'}
                {saveStatus === 'error' && 'Failed to save'}
              </span>
            )}

            {/* Pin button */}
            {canEdit && (
              <button
                onClick={() => { const newPinned = !idea.is_pinned; updateIdea({ is_pinned: newPinned }) }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-smooth hover:bg-gray-100 cursor-pointer group relative"
                title={idea.is_pinned ? 'Unpin' : 'Pin'}
                style={{ background: idea.is_pinned ? 'var(--peach)' : 'transparent' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={idea.is_pinned ? 'var(--coral)' : 'none'} stroke={idea.is_pinned ? 'var(--coral)' : 'var(--slate)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                </svg>
              </button>
            )}

            {/* Edit button */}
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-smooth hover:bg-gray-100 cursor-pointer"
                title="Edit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}

            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-smooth hover:bg-gray-100 cursor-pointer"
                title="More options">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--slate)" stroke="none">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => { shareIdea(); setShowMoreMenu(false) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-smooth cursor-pointer text-left" style={{ color: 'var(--ink)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                    <button onClick={() => { setFollowing(!following); setShowMoreMenu(false) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-smooth cursor-pointer text-left" style={{ color: following ? 'var(--coral)' : 'var(--ink)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                      {following ? 'Following' : 'Follow'}
                    </button>
                    <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => { setConfirmDeleteIdea(true); setShowMoreMenu(false) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-red-50 transition-smooth cursor-pointer text-left" style={{ color: '#dc2626' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      Delete Idea
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Close */}
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-smooth cursor-pointer" style={{ color: 'var(--slate)' }}>
              <CloseIcon size={18} />
            </button>
          </div>

          {coverImageUrl && (
            <div className="px-6 md:px-10 mb-6">
              <div 
                className="relative group cursor-zoom-in"
                onClick={() => setLightboxUrl(coverImageUrl)}>
                <img 
                  src={coverImageUrl} 
                  alt="Cover" 
                  className="w-full h-48 object-cover rounded-xl transition-opacity group-hover:opacity-90"
                />
                {/* Expand icon — always visible, pulses on hover */}
                <div className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
                  style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto px-6 md:px-10 pb-10">
            {/* Title row with vote */}
            <div className="flex items-start gap-4 mb-6">
              <button
                onClick={toggleVote}
                className={`w-14 h-16 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 transition-all duration-300 cursor-pointer group relative ${voteAnimating ? 'vote-animate' : ''}`}
                style={{ 
                  borderColor: hasVoted ? 'var(--coral)' : 'var(--border)',
                  background: hasVoted ? 'var(--peach)' : 'white',
                }}
                title={hasVoted ? 'Remove vote' : 'Vote for this idea'}>
                <svg 
                  width="14" height="14" viewBox="0 0 24 24" fill={hasVoted ? 'var(--coral)' : 'none'} 
                  stroke={hasVoted ? 'var(--coral)' : 'var(--slate)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className="transition-transform group-hover:-translate-y-0.5">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                <span className="text-lg font-bold mt-0.5" style={{ color: hasVoted ? 'var(--coral)' : 'var(--ink)' }}>{voteCount}</span>
                {hasVoted && <div className="vote-ripple" />}
                <span className="action-tooltip" style={{ bottom: 'calc(100% + 6px)' }}>
                  {hasVoted ? 'Remove vote' : 'Upvote this idea'}
                </span>
              </button>
              {editing ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="flex-1 text-2xl md:text-3xl font-bold border-b-2 outline-none bg-transparent pb-1"
                  style={{ color: 'var(--ink)', borderColor: 'var(--coral)' }}
                  autoFocus
                />
              ) : (
                <h1 className="text-2xl md:text-3xl font-bold flex-1" style={{ color: 'var(--ink)' }}>
                  {idea.title}
                </h1>
              )}
            </div>

            {/* Description */}
            <div className="ml-16 mb-6">
              {editing ? (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                  placeholder="Add a description..."
                  className="w-full text-base leading-relaxed border rounded-lg outline-none bg-transparent p-3 resize-none"
                  style={{ color: 'var(--ink)', borderColor: 'var(--border)' }}
                />
              ) : (
                idea.description && (
                  <p className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                    {idea.description}
                  </p>
                )
              )}

              {/* Idea images — image_url (board submissions) + attachments (widget submissions).
                  Small thumbnails; click any to open the full viewer with annotate. */}
              {(() => {
                const imgs: string[] = []
                if (idea.image_url) imgs.push(idea.image_url)
                let att: any = idea.attachments
                if (typeof att === 'string') { try { att = JSON.parse(att) } catch { att = null } }
                if (Array.isArray(att)) att.forEach((a: any) => { const u = typeof a === 'string' ? a : a?.url; if (u && !imgs.includes(u)) imgs.push(u) })
                if (imgs.length === 0) return null
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                    {imgs.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Attachment ${i + 1}`}
                        title="Click to view full size & annotate"
                        onClick={() => setIdeaImageViewerSrc(src)}
                        style={{ height: 96, width: 'auto', maxWidth: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in', display: 'block' }}
                      />
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Topics Selector (Edit Mode) */}
            {editing && (
              <div className="ml-16 mb-6">
                <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                  Choose up to 3 Topics for this Idea
                </label>
                <div className="space-y-2">
                  {DEFAULT_TOPICS.map(topic => (
                    <label key={topic.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                      <input 
                        type="checkbox"
                        checked={editTopics.includes(topic.id)}
                        onChange={(e) => {
                          if (e.target.checked && editTopics.length < 3) {
                            setEditTopics([...editTopics, topic.id])
                          } else if (!e.target.checked) {
                            setEditTopics(editTopics.filter(t => t !== topic.id))
                          }
                        }}
                        disabled={!editTopics.includes(topic.id) && editTopics.length >= 3}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <span>{topic.emoji}</span>
                      <span className="text-sm" style={{ color: 'var(--ink)' }}>{topic.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Topics Display (View Mode) */}
            {!editing && idea.topics && idea.topics.length > 0 && (
              <div className="ml-16 mb-6 flex flex-wrap gap-2">
                {idea.topics.map(topicId => {
                  const topic = DEFAULT_TOPICS.find(t => t.id === topicId)
                  return topic ? (
                    <div key={topicId} className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                      <span>{topic.emoji}</span>
                      <span>{topic.label}</span>
                    </div>
                  ) : null
                })}
              </div>
            )}

            {/* Edit save/cancel */}
            {editing && (
              <div className="ml-16 mb-6 flex gap-2">
                <button onClick={saveEdit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white press-effect transition-smooth" style={{ background: 'var(--coral)' }}>
                  Save
                </button>
                <button onClick={() => { setEditing(false); setEditTitle(idea.title); setEditDescription(idea.description || '') }} className="px-4 py-2 rounded-lg text-sm font-medium border press-effect transition-smooth" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Meta row */}
            <div className="ml-16 flex items-center gap-3 mb-6 text-sm flex-wrap" style={{ color: 'var(--slate)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{idea.created_by_name || 'Anonymous'}</span>
              <span>•</span>
              <span>{new Date(idea.created_at).toLocaleDateString()}</span>
              {voters.length > 0 && (
                <>
                  <div className="flex -space-x-2" title={voters.map((v: any) => v.user_name || 'Voter').join(', ')}>
                    {voters.slice(0, 3).map((v: any, i) => (
                      v.user_avatar ? (
                        <img key={i} src={v.user_avatar} alt={v.user_name || 'Voter'}
                          style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div key={i}
                          title={v.user_name || companyName || 'Voter'}
                          style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, background: 'var(--coral)' }}>
                          {(v.user_name || companyName || 'V').charAt(0).toUpperCase()}
                        </div>
                      )
                    ))}
                  </div>
                  {voters.length > 3 && <span>+{voters.length - 3}</span>}
                </>
              )}
            </div>

            {/* Tags */}
            {(idea.topics?.length > 0 || true) && (
              <div className="ml-16 flex flex-wrap gap-2 mb-8 items-center">
                {(idea.topics || []).map((t: string) => (
                  <span key={t} className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    #{t}
                  </span>
                ))}
                {/* Status pill — clickable dropdown for admins/editors, read-only for everyone else */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    onClick={() => { if (canEditStatus) setShowBodyStatusMenu(v => !v) }}
                    className="text-xs px-2 py-1 rounded font-medium inline-flex items-center gap-1"
                    style={{ background: currentStatus.bg, color: currentStatus.color, border: 'none', cursor: canEditStatus ? 'pointer' : 'default' }}
                    title={canEditStatus ? 'Change status' : ''}>
                    {currentStatus.label}
                    {canEditStatus && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                    )}
                  </button>
                  {showBodyStatusMenu && canEditStatus && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 200, background: 'white', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', border: '1px solid var(--border)', zIndex: 60, overflow: 'hidden' }}>
                      {(() => {
                        const defaultKeys = new Set(Object.keys(STATUS_CONFIG))
                        const extras = dbStatuses.filter(s => !defaultKeys.has(s.key)).map(s => [s.key, { label: s.label, color: s.color, bg: s.bg || '#f3f4f6' }] as [string, { label: string; color: string; bg: string }])
                        const allEntries = [...Object.entries(STATUS_CONFIG), ...extras]
                        return allEntries.map(([key, cfg]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => { setStatus(key); updateIdea({ status: key }); setShowBodyStatusMenu(false) }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-smooth flex items-center gap-2"
                            style={{ color: status === key ? cfg.color : 'var(--slate)', fontWeight: status === key ? 700 : 500, background: status === key ? cfg.bg : 'white', border: 'none', cursor: 'pointer' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                            {cfg.label}
                          </button>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add comment box */}
            {user ? (
              <div className="ml-0 md:ml-16 mb-8 rounded-2xl border relative" style={{ borderColor: replyingTo ? 'var(--coral)' : 'var(--border)' }}>
                {replyingTo && (
                  <div className="flex items-center justify-between px-5 py-2 border-b" style={{ background: 'var(--peach)', borderColor: 'var(--border)' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--coral)' }}>
                      ↳ Replying to comment
                    </span>
                    <button 
                      onClick={() => setReplyingTo(null)}
                      className="text-xs font-medium cursor-pointer hover:opacity-70"
                      style={{ color: 'var(--coral)' }}>
                      Cancel
                    </button>
                  </div>
                )}
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={replyingTo ? "Write your reply..." : isPrivateNote ? "Add a private note (admin-only)..." : "Add a comment..."}
                  rows={3}
                  className="w-full px-5 py-4 rounded-t-2xl border-none focus:outline-none resize-none text-sm"
                  style={{ 
                    color: 'var(--ink)', 
                    fontSize: '16px',
                    background: isPrivateNote ? '#fef3c7' : 'white',
                  }}
                />
                <div className="flex items-center justify-between p-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  {commentImageUrl && (
                    <div className="absolute bottom-16 left-5 right-5 bg-white rounded-lg border p-2 shadow-lg flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                      <img src={commentImageUrl} alt="Attached" className="h-12 rounded object-cover" />
                      <span className="flex-1 text-xs truncate" style={{ color: 'var(--slate)' }}>Image attached</span>
                      <button onClick={() => setCommentImageUrl(null)} className="text-red-500 text-xs hover:underline cursor-pointer">Remove</button>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <button
                        onClick={() => setIsPrivateNote(!isPrivateNote)}
                        className="flex items-center gap-2 transition-smooth cursor-pointer"
                        title="Toggle private note (admin-only visibility)">
                        <span 
                          className="relative inline-block rounded-full transition-smooth"
                          style={{ 
                            width: '36px',
                            height: '20px',
                            background: isPrivateNote ? 'var(--coral)' : '#d1d5db',
                          }}>
                          <span 
                            className="absolute bg-white rounded-full shadow-sm transition-transform"
                            style={{ 
                              width: '16px',
                              height: '16px',
                              top: '2px',
                              left: '2px',
                              transform: isPrivateNote ? 'translateX(16px)' : 'translateX(0)',
                            }}
                          />
                        </span>
                        <span className="text-xs flex items-center gap-1" style={{ color: isPrivateNote ? 'var(--coral)' : 'var(--slate)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          Private note
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => commentFileRef.current?.click()} className="p-1.5 rounded hover:bg-gray-100 transition-smooth cursor-pointer" title="Attach image">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    </button>
                    <input ref={commentFileRef} type="file" accept="image/*" className="hidden" onChange={uploadCommentImage} />
                    <button
                      onClick={addComment}
                      disabled={loadingComment || !newComment.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-smooth press-effect disabled:opacity-50"
                      style={{ background: 'var(--coral)' }}>
                      {loadingComment ? 'Posting...' : replyingTo ? 'Reply' : 'Add comment'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ml-0 md:ml-16 mb-8 p-4 rounded-lg text-sm text-center" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>
                Sign in to comment
              </div>
            )}

            {/* Poll & Survey section — full-width strip between comments and activity.
                (The old -mb-6 negative margin pulled the Activity heading up INTO this row.) */}
            {isAdmin && (
              <div className="mt-6 mb-6 -mx-6 px-6 py-3 border-t border-b flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                <div className="flex items-center gap-2">
                  {idea.poll_id ? (
                    <button onClick={() => updateIdea({ poll_id: null })} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-smooth cursor-pointer" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1" /><path d="M12 8v8M8 12h8" /></svg>
                      {availablePolls.find(p => p.id === idea.poll_id)?.question.slice(0, 20) || 'Poll'} ✕
                    </button>
                  ) : (
                    <button onClick={() => setShowPollModal(true)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-white transition-smooth cursor-pointer" style={{ color: 'var(--slate)' }}>
                      + Poll
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {idea.survey_id ? (
                    <button onClick={() => updateIdea({ survey_id: null })} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-smooth cursor-pointer" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                      {availableSurveys.find(s => s.id === idea.survey_id)?.title.slice(0, 20) || 'Survey'} ✕
                    </button>
                  ) : (
                    <button onClick={() => setShowSurveyModal(true)} className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-white transition-smooth cursor-pointer" style={{ color: 'var(--slate)' }}>
                      + Survey
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="ml-0 md:ml-16" style={{ display: showActivity ? undefined : 'none' }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ink)' }}>Activity</h3>
              
              {/* Pin activity */}
              {idea.is_pinned && (
                <div className="flex items-center gap-3 p-3 mb-3 rounded-lg" style={{ background: 'var(--peach)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--coral)" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>
                      <span className="font-bold">Admin</span> pinned this idea
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
                      {idea.updated_at ? new Date(idea.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                    </p>
                  </div>
                </div>
              )}

              {/* Status change activity */}
              {activityLog.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-3 mb-3 rounded-lg" style={{ background: 'var(--canvas)', borderLeft: '3px solid var(--coral)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--coral)' }}>
                      Status changed to <strong>{log.new_value}</strong>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
                      {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {visibleComments.length === 0 && !idea.is_pinned && activityLog.length === 0 ? (
                <div className="text-center py-12 rounded-lg" style={{ background: 'var(--canvas)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <p className="text-sm" style={{ color: 'var(--slate)' }}>Be the first to comment on this Idea</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleComments.map(comment => (
                    <div key={comment.id} className="p-4 rounded-lg border" style={{ 
                      background: comment.is_private ? '#fef3c7' : 'var(--canvas)',
                      borderColor: comment.is_private ? '#fbbf24' : 'var(--border)',
                      marginLeft: comment.parent_id ? '16px' : '0',
                    }}>
                      {comment.parent_id && (
                        <div className="text-xs mb-2 px-2 py-1 rounded" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                          ↳ Reply
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--coral)' }}>
                          U
                        </div>
                        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{comment.user_name || comment.created_by_name || (comment.is_private ? 'Team' : 'Anonymous')}</span>
                        <span className="text-xs" style={{ color: 'var(--slate)' }}>•</span>
                        <span className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(comment.created_at).toLocaleDateString()}</span>
                        {comment.is_private && (
                          <span className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1" style={{ background: '#fde68a', color: '#92400e' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            Private
                          </span>
                        )}
                      </div>
                      {comment.content.includes('<img') ? (
                        <div 
                          className="text-sm prose max-w-none mb-2" 
                          style={{ color: 'var(--ink)' }} 
                          dangerouslySetInnerHTML={{ __html: comment.content }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement
                            if (target.tagName === 'IMG') {
                              setLightboxUrl((target as HTMLImageElement).src)
                            }
                          }}
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: 'var(--ink)' }}>{comment.content}</p>
                      )}
                      
                      {/* Existing reaction counts */}
                      {reactions[comment.id] && Object.keys(reactions[comment.id]).length > 0 && (
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          {Object.entries(reactions[comment.id]).map(([emoji, count]) => (
                            <button
                              key={emoji}
                              onClick={() => addReaction(comment.id, emoji)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:scale-105 cursor-pointer"
                              style={{
                                background: 'var(--peach)',
                                color: 'var(--coral)',
                                border: '1px solid rgba(255, 122, 107, 0.2)',
                              }}>
                              <span className="text-sm">{emoji}</span>
                              <span>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Action buttons with Apple-style quick emoji */}
                      <div className="flex gap-3 text-xs items-center">
                        <button
                          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                          className="font-medium transition-smooth cursor-pointer"
                          style={{ color: replyingTo === comment.id ? 'var(--coral)' : 'var(--slate)' }}>
                          {replyingTo === comment.id ? 'Cancel' : 'Reply'}
                        </button>
                        <button
                          onClick={() => copyCommentLink(comment.id)}
                          className="font-medium transition-smooth cursor-pointer"
                          style={{ color: 'var(--slate)' }}>
                          Copy link
                        </button>
                        <div className="flex items-center gap-0.5 ml-auto rounded-full px-1 py-0.5" style={{ background: 'var(--canvas)' }}>
                          {EMOJI_REACTIONS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); addReaction(comment.id, emoji) }}
                              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white hover:shadow-sm transition-all hover:scale-125 cursor-pointer"
                              title={`React with ${emoji}`}>
                              <span className="text-sm">{emoji}</span>
                            </button>
                          ))}
                        </div>
                        {(user?.id === comment.user_id || isAdmin) && (
                          <button
                            onClick={() => setConfirmDeleteComment(comment.id)}
                            className="font-medium text-red-400 hover:text-red-600 transition-smooth cursor-pointer">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDeleteIdea && (
        <ConfirmModal
          title="Delete Idea"
          message={`Are you sure you want to delete "${idea.title}"? This will also delete all votes and comments. This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={deleteIdea}
          onCancel={() => setConfirmDeleteIdea(false)}
        />
      )}

      {confirmDeleteComment && (
        <ConfirmModal
          title="Delete Comment"
          message="Are you sure you want to delete this comment?"
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteComment(confirmDeleteComment)}
          onCancel={() => setConfirmDeleteComment(null)}
        />
      )}

      {/* Poll selection modal */}
      {showPollModal && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowPollModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Select a poll</h2>
            </div>
            <div className="p-6 space-y-2">
              {availablePolls.length === 0 ? (
                <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>No polls available. Create one in the admin panel.</p>
              ) : (
                availablePolls.map(poll => (
                  <button
                    key={poll.id}
                    onClick={() => { updateIdea({ poll_id: poll.id }); setShowPollModal(false) }}
                    className="w-full p-3 rounded-lg border text-left hover:bg-gray-50 transition-smooth cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}>
                    <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{poll.question}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{poll.options?.length || 0} options</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Survey selection modal */}
      {showSurveyModal && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSurveyModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Select a survey</h2>
            </div>
            <div className="p-6 space-y-2">
              {availableSurveys.length === 0 ? (
                <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>No surveys available. Create one in the admin panel.</p>
              ) : (
                availableSurveys.map(survey => (
                  <button
                    key={survey.id}
                    onClick={() => { updateIdea({ survey_id: survey.id }); setShowSurveyModal(false) }}
                    className="w-full p-3 rounded-lg border text-left hover:bg-gray-50 transition-smooth cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}>
                    <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{survey.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{survey.type}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Fullscreen Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
          onClick={() => setLightboxUrl(null)}>

          {/* Close button — fixed top-right of screen */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null) }}
            className="fixed top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Download button — fixed bottom-right */}
          <a
            href={lightboxUrl}
            download
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-5 right-5 z-10 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white cursor-pointer transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>

          {/* Image */}
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-2xl select-none"
            style={{ boxShadow: '0 0 80px rgba(255,122,107,0.25), 0 40px 80px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Full view + annotate for idea images */}
      {ideaImageViewerSrc && (
        <ImageViewer imageSrc={ideaImageViewerSrc} onClose={() => setIdeaImageViewerSrc(null)} />
      )}
    </>
  )
}
