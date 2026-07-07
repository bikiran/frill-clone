'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import IdeaModal from '@/components/IdeaModal'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const DEFAULT_STATUSES = [
  { key: 'new', label: 'Under consideration', color: '#f97316', bg: '#ffedd5' },
  { key: 'planned', label: 'Planned', color: '#3b82f6', bg: '#dbeafe' },
  { key: 'in_progress', label: 'In Development', color: '#ea580c', bg: '#ffedd5' },
  { key: 'shipped', label: 'Shipped', color: '#10b981', bg: '#d1fae5' },
]

const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
]

export default function RoadmapPage() {
  const [ideas, setIdeas] = useState<any[]>([])
  const [customStatuses, setCustomStatuses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdea, setSelectedIdea] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [draggedIdea, setDraggedIdea] = useState<any>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ columnKey: string; index: number } | null>(null)
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
      if (u) {
        import('@/lib/board').then(({ isCompanyAdminUser }) => {
          isCompanyAdminUser(u).then(setIsCompanyAdmin)
        })
      }
    })
    fetchIdeas()
    fetchCustomStatuses()

    const channel = supabase
      .channel('roadmap-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => fetchIdeas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => fetchCustomStatuses())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const getCompanyId = async () => {
    if (typeof window === 'undefined') return null
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
      const slug = h.replace('.colvy.com', '')
      const { data } = await (supabase as any).from('companies').select('id').eq('slug', slug).single()
      return data?.id || null
    }
    return null
  }

  const fetchIdeas = async () => {
    const companyId = await getCompanyId()
    let q = (supabase as any).from('ideas').select('*')
    if (companyId) {
      q = q.eq('company_id', companyId)
    }
    const { data } = await q.order('votes', { ascending: false })
    if (data) setIdeas(data)

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

  const fetchCustomStatuses = async () => {
    try {
      const companyId = await getCompanyId()
      let q = (supabase as any).from('statuses').select('*').order('order_index', { ascending: true })
      if (companyId) q = q.eq('company_id', companyId)
      const { data, error } = await q
      if (!error && data && data.length > 0) setCustomStatuses(data)
    } catch {}
  }

  const allStatuses = (() => {
    const defaults = DEFAULT_STATUSES.map(s => ({ ...s }))
    if (customStatuses.length > 0) {
      // Add any custom statuses that aren't already in defaults
      const defaultKeys = new Set(defaults.map(d => d.key))
      const extras = customStatuses
        .filter(s => !defaultKeys.has(s.key))
        .map(s => ({ key: s.key, label: s.label, color: s.color, bg: s.bg || '#f3f4f6' }))
      return [...defaults, ...extras]
    }
    return defaults
  })()

  const updateIdeaStatus = async (ideaId: string, newStatus: string) => {
    if (!isCompanyAdmin) return
    await supabase.from('ideas').update({ status: newStatus }).eq('id', ideaId)
    fetchIdeas()
  }

  const isAdmin = isCompanyAdmin
  // Only company admins may move ideas between statuses
  const canDrag = isCompanyAdmin

  const handleDragStart = (e: React.DragEvent, idea: any) => {
    if (!canDrag) {
      e.preventDefault()
      return
    }
    setDraggedIdea(idea)
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => {
      (e.target as HTMLElement).classList.add('dragging-card')
    }, 0)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('dragging-card')
    setDraggedIdea(null)
    setDragOverColumn(null)
    setDropIndicator(null)
  }

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    if (!canDrag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnKey)
    // Only set dropIndicator to end-of-column if no card-level indicator is set
    // or if we're in a different column (empty column drop)
    setDropIndicator(prev => {
      if (prev && prev.columnKey === columnKey) return prev // keep card-level indicator
      const columnIdeas = sortIdeas(ideas.filter(i => i.status === columnKey))
      return { columnKey, index: columnIdeas.length } // drop at end
    })
  }

  const handleCardDragOver = (e: React.DragEvent, columnKey: string, cardIndex: number) => {
    if (!canDrag || !draggedIdea) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    // Determine if hovering top or bottom half of card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    // Use a 20% bias toward the top to fix the "drops to bottom" issue
    const threshold = rect.top + rect.height * 0.4
    const insertIndex = e.clientY < threshold ? cardIndex : cardIndex + 1
    
    setDropIndicator({ columnKey, index: insertIndex })
    setDragOverColumn(columnKey)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column entirely (not entering a child card)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverColumn(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, status: string) => {
    if (!canDrag) return
    e.preventDefault()
    if (!draggedIdea) return

    const columnIdeas = sortIdeas(ideas.filter(i => i.status === status))
    const isSameColumn = draggedIdea.status === status

    if (!isSameColumn) {
      // Moving to a different column — just update status
      await supabase.from('ideas').update({ status }).eq('id', draggedIdea.id)
    }

    // Reorder within column based on drop indicator
    if (dropIndicator && dropIndicator.columnKey === status) {
      // Build new order: insert dragged idea at dropIndicator.index
      const others = columnIdeas.filter(i => i.id !== draggedIdea.id)
      const insertAt = Math.min(dropIndicator.index, others.length)
      const reordered = [...others.slice(0, insertAt), draggedIdea, ...others.slice(insertAt)]
      
      // Persist order_index for all affected ideas
      await Promise.all(
        reordered.map((idea, idx) =>
          supabase.from('ideas').update({ order_index: idx * 100 }).eq('id', idea.id)
        )
      )
    }

    setDraggedIdea(null)
    setDragOverColumn(null)
    setDropIndicator(null)
    await fetchIdeas()
  }

  const [sortBy, setSortBy] = useState<string>('manual')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filterTopic, setFilterTopic] = useState<string | null>(null)

  const SORT_OPTIONS = [
    { key: 'manual', label: 'Manual order' },
    { key: 'trending', label: 'Trending' },
    { key: 'oldest', label: 'Oldest Ideas' },
    { key: 'latest', label: 'Latest Ideas' },
    { key: 'most_votes', label: 'Most votes' },
    { key: 'least_votes', label: 'Least votes' },
    { key: 'highest_priority', label: 'Highest priority' },
    { key: 'lowest_priority', label: 'Lowest priority' },
  ]

  const sortIdeas = (ideas: any[]) => {
    const priorityWeight: Record<string, number> = { quick_wins: 4, high: 3, medium: 2, low: 1, '': 0 }
    const sorted = [...ideas]
    switch (sortBy) {
      case 'latest': sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break
      case 'oldest': sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break
      case 'most_votes': sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0)); break
      case 'least_votes': sorted.sort((a, b) => (a.votes || 0) - (b.votes || 0)); break
      case 'highest_priority': sorted.sort((a, b) => (priorityWeight[b.priority || ''] || 0) - (priorityWeight[a.priority || ''] || 0)); break
      case 'lowest_priority': sorted.sort((a, b) => (priorityWeight[a.priority || ''] || 0) - (priorityWeight[b.priority || ''] || 0)); break
      case 'trending': sorted.sort((a, b) => {
        const ad = (Date.now() - new Date(a.created_at).getTime()) / 86400000
        const bd = (Date.now() - new Date(b.created_at).getTime()) / 86400000
        return ((b.votes || 0) / Math.pow(bd + 1, 0.5)) - ((a.votes || 0) / Math.pow(ad + 1, 0.5))
      }); break
    }
    return sorted
  }

  const grouped = allStatuses.map(s => {
    // Private ideas are only visible to company admins
    let columnIdeas = ideas.filter(i => i.status === s.key && (!i.is_private || isCompanyAdmin))
    if (filterTopic === 'no-topic') {
      columnIdeas = columnIdeas.filter(i => !i.topics || i.topics.length === 0)
    } else if (filterTopic === 'private') {
      columnIdeas = columnIdeas.filter(i => i.is_private)
    } else if (filterTopic) {
      columnIdeas = columnIdeas.filter(i => i.topics && i.topics.includes(filterTopic))
    }
    return { ...s, ideas: sortIdeas(columnIdeas) }
  })

  // Gather all topics for filter - include default topics even if not used yet
  const allTopics = Array.from(new Set([
    ...ideas.flatMap(i => i.topics || []),
    ...DEFAULT_TOPICS.map(t => t.id)
  ]))

  if (loading) {
    return <div className="p-8 text-center">Loading roadmap...</div>
  }

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Manual order'

  return (
    <div className="w-full px-4 md:px-8 py-6 md:py-8 h-[calc(100vh-56px)] flex flex-col">
      <div className="mb-6 flex items-start md:items-center justify-between flex-col md:flex-row gap-3 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Roadmap</h1>
          <p className="text-sm md:text-base" style={{ color: 'var(--slate)' }}>
            {canDrag ? 'Drag ideas between columns to update their status' : 'Sign in to manage roadmap'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-smooth hover:bg-gray-50 cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              <span className="font-medium">{currentSortLabel}</span>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>▾</span>
            </button>
            {showSortDropdown && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                <div className="absolute top-full right-0 mt-2 rounded-lg shadow-xl border z-40 overflow-hidden animate-fade-in-up" style={{ background: 'white', borderColor: 'var(--border)', maxWidth: 'calc(100vw - 24px)', width: 'auto', minWidth: '200px' }}>
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
                      {sortBy === opt.key ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : <span className="w-3.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-smooth hover:bg-gray-50 cursor-pointer"
              style={{ borderColor: filterTopic ? 'var(--coral)' : 'var(--border)', color: filterTopic ? 'var(--coral)' : 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              <span className="font-medium">{filterTopic ? `#${filterTopic}` : 'All Ideas'}</span>
            </button>
            {showFilterDropdown && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilterDropdown(false)} />
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => { setFilterTopic(null); setShowFilterDropdown(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer"
                    style={{ color: !filterTopic ? 'var(--coral)' : 'var(--ink)', fontWeight: !filterTopic ? 600 : 400 }}>
                    All Ideas {!filterTopic && '✓'}
                  </button>
                  <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                  <button
                    onClick={() => { setFilterTopic('no-topic'); setShowFilterDropdown(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer"
                    style={{ color: filterTopic === 'no-topic' ? 'var(--coral)' : 'var(--ink)', fontWeight: filterTopic === 'no-topic' ? 600 : 400 }}>
                    No Topic {filterTopic === 'no-topic' && '✓'}
                  </button>
                  <button
                    onClick={() => { setFilterTopic('private'); setShowFilterDropdown(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer"
                    style={{ color: filterTopic === 'private' ? 'var(--coral)' : 'var(--ink)', fontWeight: filterTopic === 'private' ? 600 : 400 }}>
                    Private {filterTopic === 'private' && '✓'}
                  </button>
                  {allTopics.length > 0 && <div className="border-t" style={{ borderColor: 'var(--border)' }} />}
                  {allTopics.map(t => (
                    <button
                      key={t}
                      onClick={() => { setFilterTopic(t); setShowFilterDropdown(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-smooth cursor-pointer capitalize"
                      style={{ color: filterTopic === t ? 'var(--coral)' : 'var(--ink)', fontWeight: filterTopic === t ? 600 : 400 }}>
                      {DEFAULT_TOPICS.find(dt => dt.id === t)?.emoji || '#'} {t} {filterTopic === t && '✓'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {isAdmin && (
            <Link
              href="/admin/statuses"
              className="px-3 py-2 rounded-lg font-medium border text-sm transition-smooth press-effect cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/><path d="M4.22 4.22l4.24 4.24m0 5.08l-4.24 4.24"/><path d="M1 12h6m6 0h6"/><path d="M19.78 4.22l-4.24 4.24m0 5.08l4.24 4.24"/></svg>
            </Link>
          )}
          {user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect futuristic-btn cursor-pointer"
              style={{ background: 'linear-gradient(135deg, var(--coral) 0%, #ff8f7f 100%)' }}>
              + New Idea
            </button>
          )}
        </div>
      </div>

      {/* TRELLO-STYLE HORIZONTAL SCROLL KANBAN */}
      <div className="kanban-scroll flex-1 -mx-4 px-4 md:-mx-8 md:px-8">
        {grouped.map(column => (
          <div
            key={column.key}
            onDragOver={(e) => handleDragOver(e, column.key)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, column.key)}
            className={`kanban-column bg-white rounded-2xl border p-4 relative transition-smooth ${dragOverColumn === column.key ? 'drop-zone-active' : ''}`}
            style={{ borderColor: 'var(--border)' }}>
            
            <div className="mb-3 pb-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: column.color }} />
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{column.label}</h2>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: column.bg, color: column.color }}>
                  {column.ideas.length}
                </span>
              </div>
              {user && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full py-1.5 text-xs rounded-lg border-2 border-dashed transition-smooth hover:bg-gray-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                  + New
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {column.ideas.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--slate)' }}>
                  <p className="text-xs">No ideas yet</p>
                  {canDrag && <p className="text-xs mt-1">Drag ideas here</p>}
                </div>
              ) : (
                column.ideas.map((idea, idx) => (
                  <div key={idea.id}>
                    {/* Drop indicator above this card - enhanced */}
                    {dropIndicator?.columnKey === column.key && dropIndicator?.index === idx && (
                      <div className="my-2 relative" style={{ height: '4px' }}>
                        <div className="absolute inset-0 rounded-full" style={{ 
                          background: 'linear-gradient(90deg, transparent, var(--coral) 20%, #ffb84d 50%, var(--coral) 80%, transparent)',
                          animation: 'indicatorGlow 0.8s ease-in-out infinite',
                        }} />
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
                          background: 'var(--coral)',
                          boxShadow: '0 0 12px var(--coral), 0 0 20px var(--coral)',
                        }} />
                        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
                          background: 'var(--coral)',
                          boxShadow: '0 0 12px var(--coral), 0 0 20px var(--coral)',
                        }} />
                      </div>
                    )}
                    <div
                      draggable={canDrag}
                      onDragStart={e => handleDragStart(e, idea)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => handleCardDragOver(e, column.key, idx)}
                      onClick={() => { setSelectedIdea(idea); setShowDetailModal(true) }}
                      className={`bg-white rounded-xl p-3 border transition-smooth hover:shadow-lg hover-lift ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                      style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                        ▲ {idea.votes || 0}
                      </span>
                      <p className="text-sm font-semibold line-clamp-2 flex-1" style={{ color: 'var(--ink)' }}>
                        {idea.title}
                      </p>
                    </div>
                    {idea.description && (
                      <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--slate)' }}>
                        {idea.description}
                      </p>
                    )}
                    {/* Poll/Survey badges */}
                    {(idea.poll_id || idea.survey_id) && (
                      <div className="flex gap-1 mb-2 flex-wrap">
                        {idea.poll_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1" /><path d="M12 8v8M8 12h8" /></svg>
                            Poll
                          </span>
                        )}
                        {idea.survey_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                            Survey
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span style={{ color: 'var(--slate)' }}>
                        {(idea.created_by_name || 'Anon').slice(0, 12)}
                      </span>
                      {idea.topics && idea.topics.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                          #{idea.topics[0]}
                        </span>
                      )}
                    </div>
                    </div>
                    {/* Drop indicator at the end of the list */}
                    {dropIndicator?.columnKey === column.key && dropIndicator?.index === idx + 1 && idx === column.ideas.length - 1 && (
                      <div className="my-2 relative" style={{ height: '4px' }}>
                        <div className="absolute inset-0 rounded-full" style={{ 
                          background: 'linear-gradient(90deg, transparent, var(--coral) 20%, #ffb84d 50%, var(--coral) 80%, transparent)',
                          animation: 'indicatorGlow 0.8s ease-in-out infinite',
                        }} />
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
                          background: 'var(--coral)',
                          boxShadow: '0 0 12px var(--coral), 0 0 20px var(--coral)',
                        }} />
                        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
                          background: 'var(--coral)',
                          boxShadow: '0 0 12px var(--coral), 0 0 20px var(--coral)',
                        }} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {showDetailModal && selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => { setShowDetailModal(false); fetchIdeas() }}
        />
      )}

      {showCreateModal && (
        <IdeaModal
          onClose={() => setShowCreateModal(false)}
          onSubmitted={() => { setShowCreateModal(false); fetchIdeas() }}
        />
      )}
    </div>
  )
}
