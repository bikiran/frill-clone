'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import IdeaDetailModal from '@/components/IdeaDetailModal'
import IdeaModal from '@/components/IdeaModal'
import Link from 'next/link'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { useTerminology } from '@/lib/terminologyContext'
import { resolveCompanyUser } from '@/lib/client-cache'
import { SelectPopover } from '@/components/ui/SelectMenu'

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

/** The roadmap board. `embedded` shows it inside the admin (/admin/roadmap),
 *  where the workspace comes from your session instead of the address. */
export default function RoadmapBoard({ embedded = false }: { embedded?: boolean }) {
  const { getTerm } = useTerminology()
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

  const isOnCompanySubdomain = () => {
    if (typeof window === 'undefined') return false
    const h = window.location.hostname
    return h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
  }
  const getCompanyId = async () => {
    if (typeof window === 'undefined') return null
    if (embedded) return (await resolveCompanyUser()).companyId
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
      const slug = h.replace('.colvy.com', '')
      const { data } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
      return data?.id || null
    }
    return null
  }

  const fetchIdeas = async () => {
    const companyId = await getCompanyId()
    let q = (supabase as any).from('ideas').select('*')
    if (companyId) {
      q = q.eq('company_id', companyId)
    } else if (embedded || isOnCompanySubdomain()) {
      setIdeas([]); setLoading(false); return
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
      else if (embedded || isOnCompanySubdomain()) { setLoading(false); return }
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
    notifyIntegrations('idea.status_changed', { id: ideaId })
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
      notifyIntegrations('idea.status_changed', { id: draggedIdea.id })
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

  const sortBtnRef = useRef<HTMLButtonElement | null>(null)
  const topicBtnRef = useRef<HTMLButtonElement | null>(null)
  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Manual order'
  const topicName = (t: string) => { const d = DEFAULT_TOPICS.find(dt => dt.id === t); return d ? `${d.emoji} ${d.label}` : `# ${t}` }
  const topicOptions = [
    { value: '', label: `All ${getTerm('idea_plural')}` },
    { value: 'no-topic', label: 'No topic' },
    { value: 'private', label: 'Private' },
    ...allTopics.map(t => ({ value: t, label: topicName(t) })),
  ]
  const total = grouped.reduce((n, c) => n + c.ideas.length, 0)
  const Indicator = () => <div className="rmb-drop" aria-hidden />

  return (
    <div className={`rmb${embedded ? ' emb' : ''}`}>
      <style>{RMB_CSS}</style>
      <header className="rmb-head">
        <div style={{ minWidth: 0 }}>
          <h1>{getTerm('roadmap_title')}{!loading && <span className="rmb-total">{total}</span>}</h1>
          <p>{canDrag ? `Drag ${getTerm('idea_plural')} between columns to change their status.` : getTerm('roadmap_subtitle')}</p>
        </div>
        <div className="rmb-acts">
          <button type="button" ref={sortBtnRef} className="rmb-pill" onClick={() => { setShowSortDropdown(v => !v); setShowFilterDropdown(false) }} aria-haspopup="listbox" aria-expanded={showSortDropdown}>
            {currentSortLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <SelectPopover open={showSortDropdown} onClose={() => setShowSortDropdown(false)} anchorRef={sortBtnRef} label="Sort by"
            value={sortBy} options={SORT_OPTIONS.map(o => ({ value: o.key, label: o.label }))} onPick={setSortBy} width={220} />
          <button type="button" ref={topicBtnRef} className={`rmb-pill${filterTopic ? ' set' : ''}`} onClick={() => { setShowFilterDropdown(v => !v); setShowSortDropdown(false) }} aria-haspopup="listbox" aria-expanded={showFilterDropdown}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
            {filterTopic ? topicOptions.find(o => o.value === filterTopic)?.label || filterTopic : `All ${getTerm('idea_plural')}`}
          </button>
          <SelectPopover open={showFilterDropdown} onClose={() => setShowFilterDropdown(false)} anchorRef={topicBtnRef} label="Show"
            value={filterTopic || ''} options={topicOptions} onPick={v => setFilterTopic(v || null)} width={230} />
          {isAdmin && (
            <Link href="/admin/statuses" title="Manage statuses" aria-label="Manage statuses" className="rmb-round">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </Link>
          )}
          {embedded && (
            <a href="/roadmap" target="_blank" rel="noopener" className="rmb-pill" title="Open the public roadmap in a new tab">
              Public roadmap
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>
            </a>
          )}
          {user && (
            <button type="button" className="rmb-new" onClick={() => setShowCreateModal(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New {getTerm('idea_singular')}
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="rmb-board" aria-label="Loading">{[0, 1, 2, 3].map(i => <div key={i} className="rmb-col sk" />)}</div>
      ) : (
      <div className="rmb-board">
        {grouped.map(column => (
          <section key={column.key} aria-label={column.label}
            onDragOver={(e) => handleDragOver(e, column.key)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, column.key)}
            className={`rmb-col${dragOverColumn === column.key ? ' over' : ''}`}
            style={{ '--c': column.color } as React.CSSProperties}>
            <div className="rmb-col-h">
              <span className="rmb-dot" aria-hidden />
              <h2>{column.label}</h2>
              <span className="rmb-n">{column.ideas.length}</span>
              {user && (
                <button type="button" className="rmb-add" onClick={() => setShowCreateModal(true)} title={`New ${getTerm('idea_singular')}`} aria-label={`New ${getTerm('idea_singular')}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              )}
            </div>

            <div className="rmb-cards">
              {column.ideas.length === 0 ? (
                <div className="rmb-empty">
                  {dropIndicator?.columnKey === column.key && <Indicator />}
                  <p>No {getTerm('idea_plural')} yet</p>
                  {canDrag && <small>Drag one here</small>}
                </div>
              ) : column.ideas.map((idea, idx) => (
                <div key={idea.id}>
                  {dropIndicator?.columnKey === column.key && dropIndicator?.index === idx && <Indicator />}
                  <article
                    draggable={canDrag}
                    onDragStart={e => handleDragStart(e, idea)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => handleCardDragOver(e, column.key, idx)}
                    onClick={() => { setSelectedIdea(idea); setShowDetailModal(true) }}
                    onKeyDown={e => { if (e.key === 'Enter') { setSelectedIdea(idea); setShowDetailModal(true) } }}
                    tabIndex={0}
                    className={`rmb-card${canDrag ? ' drag' : ''}`}>
                    <div className="rmb-card-top">
                      <span className="rmb-votes" title={`${idea.votes || 0} votes`}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 4l9 12H3z" /></svg>
                        {idea.votes || 0}
                      </span>
                      <p className="rmb-title">{idea.title}</p>
                    </div>
                    {idea.description && <p className="rmb-desc">{idea.description}</p>}
                    {(idea.poll_id || idea.survey_id || idea.is_private) && (
                      <div className="rmb-tags">
                        {idea.is_private && <span className="grey">Private</span>}
                        {idea.poll_id && <span className="blue">Poll</span>}
                        {idea.survey_id && <span className="green">Survey</span>}
                      </div>
                    )}
                    <div className="rmb-card-foot">
                      <span className="rmb-by">{(idea.created_by_name || 'Anon').slice(0, 18)}</span>
                      {idea.topics && idea.topics.length > 0 && <span className="rmb-topic">{topicName(idea.topics[0])}</span>}
                    </div>
                  </article>
                  {dropIndicator?.columnKey === column.key && dropIndicator?.index === idx + 1 && idx === column.ideas.length - 1 && <Indicator />}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      )}

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

const RMB_CSS = `
.rmb{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;--soft:#8e8e93;padding:28px 16px 80px;color:var(--ink)}
.rmb.emb{max-width:1600px;margin:0 auto}
[data-theme="dark"] .rmb{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa;--soft:#8b8b90}
@media (min-width:900px){.rmb{padding:32px 32px 80px}}
.rmb button::before,.rmb a::before{display:none!important}
.rmb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.rmb-head h1{display:flex;align-items:center;gap:10px;margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:clamp(28px,3.4vw,36px);font-weight:700;letter-spacing:-.04em;line-height:1.05;color:var(--ink)}
.rmb-total{height:26px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;background:var(--f);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:650;letter-spacing:0;color:var(--mut)}
.rmb-head p{margin:7px 0 0;font-size:14.5px;color:var(--mut)}
.rmb-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rmb-pill{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:none;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.07);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer;white-space:nowrap}
.rmb-pill:hover,.rmb-pill[aria-expanded="true"]{background:var(--f)}
.rmb-pill.set{background:var(--ink);color:var(--card,#fff);box-shadow:none}
.rmb-round{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.07);color:var(--mut)}
.rmb-round:hover{background:var(--f);color:var(--ink)}
.rmb-new{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 17px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .12s}
.rmb-new:hover{filter:brightness(.95)}.rmb-new:active{transform:scale(.98)}
.rmb-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(min(272px, 100%), 1fr);gap:12px;align-items:start;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin}
.rmb-col{display:flex;flex-direction:column;min-width:0;padding:8px;border-radius:22px;background:var(--f);transition:box-shadow .15s,background .15s}
.rmb-col.over{box-shadow:0 0 0 2px var(--coral);background:color-mix(in srgb,var(--coral) 6%,var(--f))}
.rmb-col.sk{height:420px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:rmbSk 1.2s ease infinite}
.rmb-col-h{display:flex;align-items:center;gap:8px;padding:8px 8px 10px}
.rmb-dot{width:10px;height:10px;border-radius:50%;background:var(--c);flex-shrink:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 22%,transparent)}
.rmb-col-h h2{flex:1;min-width:0;margin:0;font-size:14.5px;font-weight:650;letter-spacing:-.01em;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rmb-n{min-width:24px;height:22px;padding:0 7px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);font-size:12px;font-weight:650;color:var(--mut);font-variant-numeric:tabular-nums}
.rmb-add{width:28px;height:28px;border:none;border-radius:50%;background:transparent;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.rmb-add:hover{background:var(--card,#fff);color:var(--ink)}
.rmb-cards{display:flex;flex-direction:column;gap:8px;min-height:60px}
.rmb-card{padding:12px 13px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 2px rgba(16,24,40,.05);cursor:pointer;transition:box-shadow .15s,transform .15s;outline:none}
.rmb-card.drag{cursor:grab}
.rmb-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.06),0 8px 22px -10px rgba(16,24,40,.25);transform:translateY(-1px)}
.rmb-card:focus-visible{box-shadow:0 0 0 2px var(--coral)}
.rmb-card-top{display:flex;align-items:flex-start;gap:9px}
.rmb-votes{flex-shrink:0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:34px;height:38px;padding:0 6px;border-radius:11px;background:var(--f);font-size:12.5px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.rmb-votes svg{color:var(--coral)}
.rmb-title{flex:1;min-width:0;margin:1px 0 0;font-size:14px;font-weight:600;line-height:1.35;color:var(--ink);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.rmb-desc{margin:8px 0 0;font-size:12.5px;line-height:1.5;color:var(--mut);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.rmb-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.rmb-tags span{height:20px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;font-size:11px;font-weight:650}
.rmb-tags .grey{background:var(--f);color:var(--mut)}.rmb-tags .blue{background:#e0f2fe;color:#0369a1}.rmb-tags .green{background:#dcfce7;color:#15803d}
.rmb-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:12px}
.rmb-by{color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rmb-topic{flex-shrink:0;height:22px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;background:var(--f);color:var(--ink);font-weight:600;font-size:11.5px;white-space:nowrap}
.rmb-empty{padding:22px 10px;border-radius:16px;border:1.5px dashed color-mix(in srgb,var(--mut) 28%,transparent);text-align:center}
.rmb-empty p{margin:0;font-size:13px;color:var(--mut)}
.rmb-empty small{display:block;margin-top:3px;font-size:12px;color:var(--soft)}
.rmb-drop{height:3px;margin:2px 4px 8px;border-radius:999px;background:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 18%,transparent)}
@keyframes rmbSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (max-width:899px){
  .rmb-board{grid-auto-columns:minmax(78%,1fr);scroll-snap-type:x mandatory;margin:0 -16px;padding:0 16px 8px}
  .rmb-col{scroll-snap-align:start}
  .rmb-acts{width:100%}
}
@media (prefers-reduced-motion:reduce){.rmb-col.sk{animation:none}.rmb-card{transition:none}}
`
