'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import AssigneePicker from '@/components/AssigneePicker'
import MentionInput, { resolveMentions } from '@/components/MentionInput'
import { enrichNames } from '@/lib/team-names'

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const fmtDay = (d: Date | null) => d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''
const fmtRel = (d: string | null | undefined) => {
  const p = parseTs(d); if (!p) return ''
  const days = Math.round((startOfDay(p).getTime() - startOfDay(new Date()).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${-days} days ago`
  if (days < 7) return `In ${days} days`
  return fmtDay(p)
}

type Bucket = 'today' | 'overdue' | 'upcoming' | 'completed' | 'all'
type ViewMode = 'list' | 'board' | 'timeline'

const PRIORITY = {
  high: { label: 'High', color: '#dc2626', bg: '#fef2f2' },
  normal: { label: 'Normal', color: '#6b7280', bg: '#f9fafb' },
  low: { label: 'Low', color: '#2563eb', bg: '#eff6ff' },
} as const

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const

export default function TasksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [team, setTeam] = useState<any[]>([])

  const [bucket, setBucket] = useState<Bucket>('today')
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sortBy, setSortBy] = useState<'due' | 'priority' | 'created'>('due')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  // Decide layout from the ACTUAL available width, not the viewport — the admin
  // sidebar eats ~220px, so a viewport media query misjudges when the 3-pane
  // layout fits and could pop the mobile sheet on a desktop.
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 1100)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUserId(session.user.id)
          setMe(session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Me')
        }
        let cid: string | null = null
        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid && session?.user) {
          const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (own?.id) cid = own.id
          else {
            const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
            if (mem?.length) cid = mem[0].company_id
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)

        const members: any[] = []
        const { data: co } = await (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle()
        if (co?.owner_id) members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner' })
        const { data: tm } = await (supabase as any).from('team_members').select('*')
        for (const m of (tm || [])) {
          if (cid && m.company_id && m.company_id !== cid) continue
          const uid = m.user_id || m.id
          if (members.some(x => x.user_id === uid)) continue
          members.push({ id: m.id, user_id: uid, name: m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member'), email: m.email })
        }
        // Replace email-username fallbacks with real profile names.
        await enrichNames(members)
        setTeam(members)
        await loadTasks(cid)
      } finally { setLoading(false) }
    })()
  }, [])

  const loadTasks = useCallback(async (cid: string) => {
    let data: any[] | null = null
    const full = await (supabase as any).from('conversation_tasks')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(1000)
    if (full.error) {
      const base = await (supabase as any).from('conversation_tasks')
        .select('id, conversation_id, company_id, text, done, assigned_to, assigned_to_id, due_date, created_at')
        .eq('company_id', cid).order('created_at', { ascending: false }).limit(1000)
      data = base.data
    } else data = full.data
    setTasks(data || [])
    const convIds = Array.from(new Set((data || []).map((t: any) => t.conversation_id).filter(Boolean)))
    if (convIds.length) {
      const m: Record<string, any> = {}
      for (let i = 0; i < convIds.length; i += 100) {
        const { data: cs } = await (supabase as any).from('conversations')
          .select('id, subject, contact_name, channel').in('id', convIds.slice(i, i + 100))
        for (const c of (cs || [])) m[c.id] = c
      }
      setConvs(m)
    }
  }, [])

  const statusOf = (t: any): string => t.status || (t.done ? 'done' : 'todo')
  const isDone = (t: any) => statusOf(t) === 'done'

  const assignedToMe = useCallback((t: any) => {
    if (t.assigned_to_id && t.assigned_to_id === userId) return true
    if (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === userId)) return true
    if (Array.isArray(t.mentions) && t.mentions.some((a: any) => a.id === userId)) return true
    return false
  }, [userId])

  const counts = useMemo(() => {
    const today = startOfDay(new Date()).getTime()
    const c = { today: 0, overdue: 0, upcoming: 0, completed: 0, all: tasks.length }
    for (const t of tasks) {
      if (isDone(t)) { c.completed++; continue }
      const due = parseTs(t.due_date)
      if (!due) { c.upcoming++; continue }
      const d = startOfDay(due).getTime()
      if (d < today) c.overdue++
      else if (d === today) c.today++
      else c.upcoming++
    }
    return c
  }, [tasks])

  const visible = useMemo(() => {
    const today = startOfDay(new Date()).getTime()
    const q = search.trim().toLowerCase()
    let list = tasks.filter(t => {
      if (bucket !== 'all') {
        if (bucket === 'completed') { if (!isDone(t)) return false }
        else {
          if (isDone(t)) return false
          const due = parseTs(t.due_date)
          const d = due ? startOfDay(due).getTime() : null
          if (bucket === 'today' && d !== today) return false
          if (bucket === 'overdue' && !(d != null && d < today)) return false
          if (bucket === 'upcoming' && !(d == null || d > today)) return false
        }
      }
      if (assigneeFilter === 'me' && !assignedToMe(t)) return false
      else if (assigneeFilter && assigneeFilter !== 'me') {
        const ok = t.assigned_to_id === assigneeFilter || (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === assigneeFilter))
        if (!ok) return false
      }
      if (priorityFilter && (t.priority || 'normal') !== priorityFilter) return false
      if (q) {
        const hay = [t.title, t.text, t.assigned_to, t.order_number, t.order_customer].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'priority') { const rank = (p: string) => ({ high: 0, normal: 1, low: 2 } as any)[p || 'normal']; return rank(a.priority) - rank(b.priority) }
      if (sortBy === 'created') return (parseTs(b.created_at)?.getTime() || 0) - (parseTs(a.created_at)?.getTime() || 0)
      const da = parseTs(a.due_date)?.getTime() ?? Infinity
      const db_ = parseTs(b.due_date)?.getTime() ?? Infinity
      return da - db_
    })
    return list
  }, [tasks, bucket, search, assigneeFilter, priorityFilter, sortBy, assignedToMe])

  const selected = useMemo(() => tasks.find(t => t.id === selectedId) || null, [tasks, selectedId])

  const patchTask = async (id: string, fields: any) => {
    setTasks(cur => cur.map(t => t.id === id ? { ...t, ...fields } : t))
    try { await (supabase as any).from('conversation_tasks').update(fields).eq('id', id) }
    catch { if (companyId) loadTasks(companyId) }
  }
  const setStatus = (t: any, status: string) =>
    patchTask(t.id, { status, done: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null })

  if (loading) return <div style={{ padding: 20 }}><SkeletonList rows={7} /></div>

  const BUCKETS: { key: Bucket; label: string; n: number }[] = [
    { key: 'today', label: 'Today', n: counts.today },
    { key: 'overdue', label: 'Overdue', n: counts.overdue },
    { key: 'upcoming', label: 'Upcoming', n: counts.upcoming },
    { key: 'completed', label: 'Completed', n: counts.completed },
    { key: 'all', label: 'All', n: counts.all },
  ]

  return (
    <div className="tasks-root">
      <style>{`
        .tasks-root { height: calc(100vh - 56px); display: flex; flex-direction: column; }
        .tasks-top { padding: 16px 20px 10px; border-bottom: 1px solid var(--border); }
        .tasks-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .tasks-buckets { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
        .tasks-buckets::-webkit-scrollbar { display: none; }
        .bucket-chip { flex-shrink: 0; padding: 7px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; border: 1px solid var(--border); background: #fff; color: var(--slate); display: inline-flex; align-items: center; gap: 6px; }
        .bucket-chip.on { border-color: var(--coral); background: var(--peach); color: var(--coral); }
        .bucket-n { font-size: 11px; font-weight: 800; padding: 0 6px; border-radius: 10px; background: rgba(0,0,0,0.06); }
        .bucket-chip.on .bucket-n { background: rgba(255,122,107,0.2); }
        .tasks-controls { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
        .tasks-body { flex: 1; display: flex; min-height: 0; }
        .tasks-filters { width: 210px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 16px; overflow-y: auto; }
        .tasks-main { flex: 1; overflow-y: auto; min-width: 0; }
        .tasks-detail { width: 360px; flex-shrink: 0; border-left: 1px solid var(--border); overflow-y: auto; }
        .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
        .seg button { padding: 7px 12px; border: none; background: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; color: var(--slate); }
        .seg button.on { background: var(--peach); color: var(--coral); }
        .ctl { padding: 8px 11px; border-radius: 9px; border: 1px solid var(--border); font-size: 12.5px; background: #fff; color: var(--ink); }
        .task-card { border: 1px solid var(--border); border-radius: 11px; background: #fff; padding: 13px; margin-bottom: 8px; cursor: pointer; }
        .task-card:hover { border-color: var(--coral); }
        .task-card.sel { border-color: var(--coral); box-shadow: 0 0 0 2px var(--peach); }
        .board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 16px; height: 100%; box-sizing: border-box; }
        .board-col { background: var(--canvas); border-radius: 12px; padding: 10px; overflow-y: auto; }
        .filters-mobile { display: none; }
        @media (max-width: 1100px) {
          .tasks-root { height: auto; min-height: calc(100dvh - 56px); }
          .tasks-filters { display: none; }
          .tasks-detail { display: none; }
          .filters-mobile { display: flex; gap: 8px; flex-wrap: wrap; }
          .tasks-body { flex-direction: column; }
          .board { grid-template-columns: 1fr; height: auto; }
          .tasks-main { padding-bottom: 20px; }
        }
      `}</style>

      <div className="tasks-top">
        <div className="tasks-title-row">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Tasks</h1>
          <button onClick={() => { setShowNew(true); setSelectedId(null) }}
            style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ New task</button>
        </div>
        <div className="tasks-buckets">
          {BUCKETS.map(b => (
            <button key={b.key} className={'bucket-chip' + (bucket === b.key ? ' on' : '')} onClick={() => setBucket(b.key)}>
              {b.label}{b.n > 0 && <span className="bucket-n">{b.n}</span>}
            </button>
          ))}
        </div>
        <div className="tasks-controls">
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ width: '100%', padding: '8px 11px 8px 31px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div className="seg">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
          </div>
          <button className="ctl" onClick={() => router.push('/admin/calendar')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Calendar
          </button>
          <div className="filters-mobile">
            <select className="ctl" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
              <option value="">Anyone</option><option value="me">Assigned to me</option>
              {team.map(m => <option key={m.id} value={m.user_id}>{m.name}</option>)}
            </select>
            <select className="ctl" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="">Any priority</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
            </select>
            <select className="ctl" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="due">Sort: Due date</option><option value="priority">Sort: Priority</option><option value="created">Sort: Newest</option>
            </select>
          </div>
        </div>
      </div>

      <div className="tasks-body">
        <div className="tasks-filters">
          <FilterRail team={team} assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
            priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} sortBy={sortBy} setSortBy={setSortBy} />
        </div>
        <div className="tasks-main">
          {view === 'board' ? (
            <div className="board">
              {COLUMNS.map(col => (
                <div key={col.key} className="board-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 10px', fontSize: 12.5, fontWeight: 800, color: 'var(--slate)' }}>
                    {col.label}
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '0 6px', borderRadius: 10, background: 'rgba(0,0,0,0.06)' }}>{visible.filter(t => statusOf(t) === col.key).length}</span>
                  </div>
                  {visible.filter(t => statusOf(t) === col.key).map(t => (
                    <TaskCard key={t.id} t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id}
                      onClick={() => { setSelectedId(t.id); setShowNew(false) }} statusOf={statusOf} showStatusButtons onStatus={(s: string) => setStatus(t, s)} />
                  ))}
                  {visible.filter(t => statusOf(t) === col.key).length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 16 }}>Nothing here</p>}
                </div>
              ))}
            </div>
          ) : view === 'timeline' ? (
            <Timeline tasks={visible} convs={convs} statusOf={statusOf} onSelect={(id: string) => { setSelectedId(id); setShowNew(false) }} selectedId={selectedId} />
          ) : (
            <div style={{ padding: 16 }}>
              {visible.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)', fontSize: 13.5 }}>No tasks in “{BUCKETS.find(b => b.key === bucket)?.label}”.</div>}
              {visible.map(t => (
                <TaskCard key={t.id} t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id}
                  onClick={() => { setSelectedId(t.id); setShowNew(false) }} statusOf={statusOf} onToggle={() => setStatus(t, isDone(t) ? 'todo' : 'done')} />
              ))}
            </div>
          )}
        </div>
        <div className="tasks-detail">
          {showNew ? (
            <TaskEditor companyId={companyId!} team={team} me={me} userId={userId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); if (companyId) loadTasks(companyId) }} />
          ) : selected ? (
            <TaskDetail key={selected.id} task={selected} conv={convs[selected.conversation_id]} team={team} companyId={companyId!} me={me} userId={userId}
              onPatch={(f: any) => patchTask(selected.id, f)} onDeleted={() => { setSelectedId(null); if (companyId) loadTasks(companyId) }} router={router} />
          ) : (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>Select a task to see details, or create a new one.</div>
          )}
        </div>
      </div>

      {isNarrow && (showNew || selected) && (
        <MobileSheet onClose={() => { setShowNew(false); setSelectedId(null) }}>
          {showNew ? (
            <TaskEditor companyId={companyId!} team={team} me={me} userId={userId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); if (companyId) loadTasks(companyId) }} />
          ) : selected ? (
            <TaskDetail key={selected.id} task={selected} conv={convs[selected.conversation_id]} team={team} companyId={companyId!} me={me} userId={userId}
              onPatch={(f: any) => patchTask(selected.id, f)} onDeleted={() => { setSelectedId(null); if (companyId) loadTasks(companyId) }} router={router} />
          ) : null}
        </MobileSheet>
      )}
    </div>
  )
}

function FilterRail({ team, assigneeFilter, setAssigneeFilter, priorityFilter, setPriorityFilter, sortBy, setSortBy }: any) {
  const H = { fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 8px' }
  const opt = (active: boolean): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8, border: 'none', background: active ? 'var(--peach)' : 'transparent', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: 2 })
  return (
    <>
      <p style={H}>Assignee</p>
      <button style={opt(assigneeFilter === '')} onClick={() => setAssigneeFilter('')}>Anyone</button>
      <button style={opt(assigneeFilter === 'me')} onClick={() => setAssigneeFilter('me')}>Assigned to me</button>
      {team.map((m: any) => <button key={m.id} style={opt(assigneeFilter === m.user_id)} onClick={() => setAssigneeFilter(m.user_id)}>{m.name}</button>)}
      <p style={{ ...H, marginTop: 18 }}>Priority</p>
      {['', 'high', 'normal', 'low'].map(p => <button key={p} style={opt(priorityFilter === p)} onClick={() => setPriorityFilter(p)}>{p ? PRIORITY[p as keyof typeof PRIORITY].label : 'Any priority'}</button>)}
      <p style={{ ...H, marginTop: 18 }}>Sort by</p>
      {[['due', 'Due date'], ['priority', 'Priority'], ['created', 'Newest']].map(([k, l]) => <button key={k} style={opt(sortBy === k)} onClick={() => setSortBy(k)}>{l}</button>)}
    </>
  )
}

function TaskCard({ t, conv, selected, onClick, onToggle, onStatus, showStatusButtons, statusOf }: any) {
  const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
  const due = parseTs(t.due_date)
  const overdue = due && startOfDay(due).getTime() < startOfDay(new Date()).getTime() && statusOf(t) !== 'done'
  const assignees = (Array.isArray(t.assignees) && t.assignees.length) ? t.assignees : (t.assigned_to ? [{ name: t.assigned_to }] : [])
  return (
    <div className={'task-card' + (selected ? ' sel' : '')} onClick={onClick}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        {onToggle && <input type="checkbox" checked={statusOf(t) === 'done'} onClick={e => e.stopPropagation()} onChange={onToggle} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, textDecoration: statusOf(t) === 'done' ? 'line-through' : 'none', opacity: statusOf(t) === 'done' ? 0.55 : 1 }}>{t.title || t.text}</p>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5, color: pr.color, background: pr.bg }}>{pr.label}</span>
            {due && <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#dc2626' : 'var(--slate)' }}>{fmtRel(t.due_date)}</span>}
            {assignees.map((a: any, i: number) => <span key={i} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>{a.name}</span>)}
            {t.order_number && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#eef2ff', color: '#4338ca' }}>#{t.order_number}</span>}
          </div>
        </div>
      </div>
      {showStatusButtons && (
        <div style={{ display: 'flex', gap: 5, marginTop: 9 }} onClick={e => e.stopPropagation()}>
          {COLUMNS.map(c => (
            <button key={c.key} onClick={() => onStatus(c.key)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (statusOf(t) === c.key ? 'var(--coral)' : 'var(--border)'), background: statusOf(t) === c.key ? 'var(--peach)' : '#fff', color: statusOf(t) === c.key ? 'var(--coral)' : 'var(--slate)' }}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Timeline({ tasks, convs, statusOf, onSelect, selectedId }: any) {
  const groups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const t of tasks) {
      const due = parseTs(t.due_date)
      const key = due ? startOfDay(due).toISOString() : 'none'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(t)
    }
    return Array.from(m.entries()).sort((a, b) => { if (a[0] === 'none') return 1; if (b[0] === 'none') return -1; return new Date(a[0]).getTime() - new Date(b[0]).getTime() })
  }, [tasks])
  if (tasks.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>No tasks to show on the timeline.</div>
  return (
    <div style={{ padding: 16 }}>
      {groups.map(([key, list]) => {
        const d = key === 'none' ? null : new Date(key)
        return (
          <div key={key} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{d ? fmtRel(key) : 'No due date'}</span>
              {d && <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ paddingLeft: 6, borderLeft: '2px solid var(--border)' }}>
              {list.map((t: any) => <div key={t.id} style={{ marginLeft: 10 }}><TaskCard t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id} onClick={() => onSelect(t.id)} statusOf={statusOf} /></div>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MobileSheet({ children, onClose }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ink)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Task</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  )
}

function TaskDetail({ task, conv, team, companyId, me, userId, onPatch, onDeleted, router }: any) {
  const [comments, setComments] = useState<any[]>([])
  const [comment, setComment] = useState('')
  const [showOrderSearch, setShowOrderSearch] = useState(false)
  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('task_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true })
      setComments(data || [])
    })()
  }, [task.id])
  const assignees = (Array.isArray(task.assignees) && task.assignees.length) ? task.assignees : (task.assigned_to_id ? [{ id: task.assigned_to_id, name: task.assigned_to }] : [])
  const addComment = async () => {
    if (!comment.trim()) return
    const mentioned = resolveMentions(comment, team as any)
    const row = { task_id: task.id, company_id: companyId, author_id: userId, author_name: me, body: comment.trim(), mentions: mentioned.map((m: any) => ({ id: m.id, name: m.name })) }
    const { data } = await (supabase as any).from('task_comments').insert(row).select().maybeSingle()
    if (data) setComments(c => [...c, data])
    for (const m of mentioned as any[]) {
      const tm = team.find((t: any) => t.id === m.id || t.name === m.name)
      if (tm?.user_id && tm.user_id !== userId) { try { await (supabase as any).from('notifications').insert({ company_id: companyId, user_id: tm.user_id, type: 'task_comment', title: `${me} mentioned you on a task`, body: comment.trim().slice(0, 160), link: '/admin/tasks', is_read: false }) } catch {} }
    }
    setComment('')
  }
  const L: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '16px 0 7px' }
  const curStatus = task.status || (task.done ? 'done' : 'todo')
  return (
    <div style={{ padding: 18 }}>
      <textarea value={task.title || task.text || ''} onChange={e => onPatch({ title: e.target.value })} rows={2}
        style={{ width: '100%', border: 'none', fontSize: 16.5, fontWeight: 700, color: 'var(--ink)', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.35 }} />
      {task.text && task.title && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>{task.text}</p>}
      <p style={L}>Status</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {COLUMNS.map(c => { const on = curStatus === c.key; return (
          <button key={c.key} onClick={() => onPatch({ status: c.key, done: c.key === 'done', completed_at: c.key === 'done' ? new Date().toISOString() : null })}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>{c.label}</button>
        )})}
      </div>
      <p style={L}>Priority</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['high', 'normal', 'low'] as const).map(p => { const on = (task.priority || 'normal') === p; return (
          <button key={p} onClick={() => onPatch({ priority: p })} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? PRIORITY[p].color : 'var(--border)'), background: on ? PRIORITY[p].bg : '#fff', color: on ? PRIORITY[p].color : 'var(--slate)' }}>{PRIORITY[p].label}</button>
        )})}
      </div>
      <p style={L}>Due date</p>
      <input type="date" value={task.due_date ? String(task.due_date).slice(0, 10) : ''} onChange={e => onPatch({ due_date: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null })}
        style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
      <p style={L}>Assignees</p>
      <AssigneePicker members={team} value={assignees.map((a: any) => ({ id: a.id, name: a.name }))} onChange={(next) => onPatch({ assignees: next, assigned_to_id: next[0]?.id || null, assigned_to: next[0]?.name || null })} />
      <p style={L}>Linked order</p>
      {task.order_number ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#f8f9ff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>#{task.order_number}</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{task.order_customer}{task.order_total ? ` · $${Number(task.order_total).toFixed(2)}` : ''}</div>
          </div>
          <button onClick={() => onPatch({ order_id: null, order_number: null, order_customer: null, order_total: null })} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => setShowOrderSearch(true)} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--canvas)', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Link to order</button>
      )}
      {conv && (
        <>
          <p style={L}>Conversation</p>
          <button onClick={() => router.push(`/admin/inbox?conversation=${task.conversation_id}`)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{conv.contact_name || conv.subject || 'Open conversation'} →</button>
        </>
      )}
      <p style={L}>Comments</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        {comments.length === 0 && <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>No comments yet.</p>}
        {comments.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 9 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{(c.author_name || '?').charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{c.author_name} <span style={{ fontWeight: 400, color: '#9ca3af' }}>· {fmtRel(c.created_at)}</span></div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <MentionInput value={comment} onChange={(v) => setComment(v)} team={team as any} placeholder="Add a comment… @ to mention" onSubmit={addComment} style={{ fontSize: 13 }} />
      <button onClick={addComment} disabled={!comment.trim()} style={{ marginTop: 7, padding: '8px 16px', borderRadius: 8, border: 'none', background: comment.trim() ? 'var(--coral)' : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'default' }}>Comment</button>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button onClick={() => { if (confirm('Delete this task?')) { (supabase as any).from('conversation_tasks').delete().eq('id', task.id).then(onDeleted) } }} style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Delete task</button>
      </div>
      {showOrderSearch && <OrderSearchModal companyId={companyId} onClose={() => setShowOrderSearch(false)} onPick={(o: any) => { onPatch({ order_id: o.order_id, order_number: o.order_number, order_customer: o.customer, order_total: o.total }); setShowOrderSearch(false) }} />}
    </div>
  )
}

function OrderSearchModal({ companyId, onClose, onPick }: any) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try { const res = await fetch(`/api/orders/search?companyId=${companyId}&q=${encodeURIComponent(q.trim())}`); const d = await res.json(); setResults(d.orders || []) }
      catch { setResults([]) } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, companyId])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Link to order</h3>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Order #, customer name, phone, email or item…" style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <p style={{ padding: 16, fontSize: 13, color: 'var(--slate)' }}>Searching…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && <p style={{ padding: 16, fontSize: 13, color: 'var(--slate)' }}>No orders match “{q}”.</p>}
          {results.map(o => (
            <button key={o.order_id} onClick={() => onPick(o)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>#{o.order_number}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>${o.total.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{o.customer}{o.status ? ` · ${o.status}` : ''}</div>
              {o.items?.length > 0 && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.items.join(', ')}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskEditor({ companyId, team, me, userId, onClose, onSaved }: any) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [due, setDue] = useState('')
  const [assignees, setAssignees] = useState<any[]>([])
  const [order, setOrder] = useState<any>(null)
  const [showOrderSearch, setShowOrderSearch] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    const mentioned = resolveMentions(title, team as any)
    const row: any = {
      company_id: companyId, text: title.trim(), title: title.trim(), status: 'todo', done: false, priority,
      due_date: due ? new Date(`${due}T09:00:00`).toISOString() : null,
      assignees, assigned_to_id: assignees[0]?.id || null, assigned_to: assignees[0]?.name || null,
      created_by: me, created_by_id: userId, mentions: mentioned.map((m: any) => ({ id: m.id, name: m.name })),
      order_id: order?.order_id || null, order_number: order?.order_number || null, order_customer: order?.customer || null, order_total: order?.total || null,
    }
    try {
      await (supabase as any).from('conversation_tasks').insert(row)
      const notify = new Map<string, string>()
      for (const a of assignees) { const tm = team.find((t: any) => t.user_id === a.id || t.id === a.id); if (tm?.user_id) notify.set(tm.user_id, tm.name) }
      for (const m of mentioned as any[]) { const tm = team.find((t: any) => t.id === m.id); if (tm?.user_id) notify.set(tm.user_id, tm.name) }
      notify.delete(userId)
      for (const [uid] of notify) { try { await (supabase as any).from('notifications').insert({ company_id: companyId, user_id: uid, type: 'task_assigned', title: `${me} assigned you a task`, body: title.trim().slice(0, 160), link: '/admin/tasks', is_read: false }) } catch {} }
      onSaved()
    } catch (e: any) { alert('Could not create task: ' + e.message); setSaving(false) }
  }
  const L: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '16px 0 7px' }
  return (
    <div style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>New task</h3>
      <MentionInput value={title} onChange={(v) => setTitle(v)} team={team as any} multiline rows={2} placeholder="What needs doing? @ to mention" style={{ fontSize: 14 }} />
      <p style={L}>Priority</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['high', 'normal', 'low'] as const).map(p => (
          <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (priority === p ? PRIORITY[p].color : 'var(--border)'), background: priority === p ? PRIORITY[p].bg : '#fff', color: priority === p ? PRIORITY[p].color : 'var(--slate)' }}>{PRIORITY[p].label}</button>
        ))}
      </div>
      <p style={L}>Due date</p>
      <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
      <p style={L}>Assignees</p>
      <AssigneePicker members={team} value={assignees} onChange={setAssignees} />
      <p style={L}>Linked order</p>
      {order ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#f8f9ff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>#{order.order_number}</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{order.customer} · ${order.total.toFixed(2)}</div>
          </div>
          <button onClick={() => setOrder(null)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => setShowOrderSearch(true)} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--canvas)', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Link to order</button>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} disabled={!title.trim() || saving} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() && !saving ? 1 : 0.6 }}>{saving ? 'Creating…' : 'Create task'}</button>
      </div>
      {showOrderSearch && <OrderSearchModal companyId={companyId} onClose={() => setShowOrderSearch(false)} onPick={(o: any) => { setOrder(o); setShowOrderSearch(false) }} />}
    </div>
  )
}
