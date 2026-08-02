'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import AssigneePicker from '@/components/AssigneePicker'
import AttachmentUploader from '@/components/AttachmentUploader'
import TaskEditor from '@/components/TaskEditor'
import MentionInput, { resolveMentions } from '@/components/MentionInput'
import { enrichNames } from '@/lib/team-names'
import { useDraft } from '@/lib/drafts'
import PageGreeting from '@/components/PageGreeting'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'

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
// Local YYYY-MM-DD. Slicing an ISO string gives the UTC date, which in
// Melbourne (UTC+10/+11) is the day before — that's why picking a date showed a
// different one. Build it from local parts instead.
const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// A date the user picked ("2026-07-22") should mean 9am on that day where they
// are, not 9am UTC.
const dueFromInput = (ymd: string): string | null => {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 9, 0, 0).toISOString()
}
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

type Bucket = 'today' | 'threedays' | 'overdue' | 'upcoming' | 'completed' | 'all' | 'day' | 'week' | 'month' | 'date'

// Start/end (ms) of the day / week (Sun–Sat) / month containing `ref`.
function periodRange(ref: Date, period: 'day' | 'week' | 'month'): { start: number; end: number } {
  const d = new Date(ref); d.setHours(0, 0, 0, 0)
  if (period === 'day') { const e = new Date(d); e.setDate(e.getDate() + 1); return { start: d.getTime(), end: e.getTime() } }
  if (period === 'week') { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); const e = new Date(s); e.setDate(e.getDate() + 7); return { start: s.getTime(), end: e.getTime() } }
  const s = new Date(d.getFullYear(), d.getMonth(), 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return { start: s.getTime(), end: e.getTime() }
}

// Does a task belong in the given bucket? Shared by every view (List, Board,
// Timeline, Calendar) so the date filters mean the same thing everywhere.
function inBucket(t: any, bucket: Bucket, bucketDate: string): boolean {
  const done = t.status ? t.status === 'done' : !!t.done
  if (bucket === 'all') return true
  if (bucket === 'completed') return done
  if (done) return false
  const today = startOfDay(new Date()).getTime()
  const due = parseTs(t.due_date)
  const d = due ? startOfDay(due).getTime() : null
  const dTime = due ? due.getTime() : null
  const nowRef = new Date()
  switch (bucket) {
    // Today includes undated tasks so freshly-added ones surface somewhere.
    case 'today': return d === today || d == null
    case 'overdue': return d != null && d < today
    case 'upcoming': return d != null && d > today
    case 'day': return d === today
    case 'threedays': return dTime != null && dTime >= today && dTime < today + 3 * 86400000
    case 'week': { const r = periodRange(nowRef, 'week'); return dTime != null && dTime >= r.start && dTime < r.end }
    case 'month': { const r = periodRange(nowRef, 'month'); return dTime != null && dTime >= r.start && dTime < r.end }
    case 'date': {
      if (!bucketDate || dTime == null) return false
      const r = periodRange(new Date(bucketDate + 'T00:00:00'), 'day')
      return dTime >= r.start && dTime < r.end
    }
    default: return true
  }
}
type ViewMode = 'list' | 'board' | 'timeline' | 'calendar'

const PRIORITY = {
  high: { label: 'High', color: '#dc2626', bg: '#fef2f2' },
  normal: { label: 'Normal', color: '#6b7280', bg: '#f9fafb' },
  low: { label: 'Low', color: '#2563eb', bg: '#eff6ff' },
} as const

// Calendar event types — deliveries, appointments, bookings and pickups
// scheduled on the Calendar also surface here, tagged with their type. Colours
// match the Calendar tab so the two pages read the same.
const EVENT_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  delivery:    { label: 'Delivery',    color: '#c2410c', bg: '#fff4f1' },
  appointment: { label: 'Appointment', color: '#4338ca', bg: '#eef2ff' },
  booking:     { label: 'Booking',     color: '#15803d', bg: '#ecfdf5' },
  task:        { label: 'Task',        color: '#7c3aed', bg: '#f5f3ff' },
  pickup:      { label: 'Pickup',      color: '#a16207', bg: '#fefce8' },
}

// Preset colours for colour-coding a task. Stored as the hex string on the task.
const TASK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const tint = (hex: string, a: number) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex
}


const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const

export default function TasksPage() {
  const router = useRouter()
  // Seed identity + the last task list from cache so a revisit paints instantly
  // instead of blanking to a skeleton while the company re-resolves and refetches.
  const seed = peekCompanyUser()
  const seededTasks = seed?.companyId ? readCache<any[]>(`tasks:${seed.companyId}`) : undefined
  const [loading, setLoading] = useState(!seededTasks)
  const [companyId, setCompanyId] = useState<string | null>(seed?.companyId ?? null)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState('')
  const [tasks, setTasks] = useState<any[]>(seededTasks ?? [])
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [team, setTeam] = useState<any[]>([])

  const [bucket, setBucket] = useState<Bucket>('today')
  const [bucketDate, setBucketDate] = useState('')   // for the "Date" bucket
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [outletFilter, setOutletFilter] = useState<string[]>([])  // [] = all outlets; else match any
  const [dateFilter, setDateFilter] = useState('')         // '' = any; else a reference YYYY-MM-DD
  const [datePeriod, setDatePeriod] = useState<'day' | 'week' | 'month'>('day')
  const [sortBy, setSortBy] = useState<'due' | 'priority' | 'created'>('due')
  const [outlets, setOutlets] = useState<any[]>([])
  const [showFilters, setShowFilters] = useState(false)    // top filter dropdown
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  // Bulk selection (list view): pick several tasks, then delete or change their
  // status/priority in one go.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [newTaskSeed, setNewTaskSeed] = useState<any>(null) // prefill for "end repeat & create new"
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
        // Paint the team with raw names immediately; resolve real profile names
        // in the background so they never block the task list from showing.
        setTeam(members)
        enrichNames(members).then(() => setTeam(members.slice())).catch(() => {})

        // Team members land on their own work: default to "assigned to me" and,
        // if they have a home outlet set, pre-filter to it. The owner sees
        // everything (no defaults).
        const uid = session?.user?.id
        const myMembership = (tm || []).find((m: any) => (m.user_id || m.id) === uid && (!m.company_id || m.company_id === cid))
        if (uid && co?.owner_id !== uid && myMembership) {
          setAssigneeFilter('me')
          if (myMembership.default_location_id) setOutletFilter([myMembership.default_location_id])
        }

        // Outlets load in the background too — not needed for the first paint.
        ;(async () => {
          try {
            const { data: locs } = await (supabase as any).from('company_locations')
              .select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })
            setOutlets(locs || [])
          } catch {}
        })()
        await loadTasks(cid)
      } finally { setLoading(false) }
    })()
  }, [])

  // Deep links from the Calendar page:
  //   ?date=YYYY-MM-DD  → jump the list to that day (so "Open in Tasks" on a
  //                       Monday task lands on Monday, not today)
  //   ?task=<id>        → open that task's detail
  //   ?new=1&title=&date= → open the New task drawer, prefilled
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const date = p.get('date')
    const task = p.get('task')
    const isNew = p.get('new')
    if (date) { setBucket('date' as Bucket); setBucketDate(date) }
    if (task) setSelectedId(task)
    if (isNew) {
      setShowNew(true)
      setNewTaskSeed({ title: p.get('title') || '', due: date || '' })
    }
    // Tidy the URL so a refresh doesn't reopen the drawer / re-jump.
    if (date || task || isNew) {
      try { window.history.replaceState({}, '', '/admin/tasks') } catch {}
    }
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
    let rows: any[] = data || []

    // Paint the real tasks immediately, before the (slower) calendar merge and
    // conversation enrichment — so the list shows up straight away.
    setTasks(rows)
    setLoading(false)

    // Everything scheduled on the Calendar — deliveries, appointments,
    // bookings, pickups and calendar-native tasks — is real work too, but it
    // lives in calendar_events, so the Tasks page never saw it. Pull it all in
    // and shape it like tasks, tagged with its event type. Each keeps a marker
    // so edits route back to the calendar rather than trying to write a
    // conversation_tasks row that doesn't exist.
    try {
      const from = new Date(); from.setMonth(from.getMonth() - 6)
      const to = new Date(); to.setMonth(to.getMonth() + 12)
      const params = new URLSearchParams({
        companyId: cid,
        from: from.toISOString(), to: to.toISOString(),
      })
      const res = await fetch(`/api/calendar?${params}`)
      const d = await res.json()
      const calTasks = (d.events || []).map((e: any) => ({
        id: `cal:${e.id}`,
        _calendarId: e.id,
        _source: 'calendar',
        _calRaw: e,            // full event, so edits/status changes don't drop fields
        event_type: e.event_type || 'task',
        company_id: e.company_id,
        conversation_id: e.conversation_id,
        title: e.title,
        text: e.notes || e.title,
        due_date: e.starts_at,
        is_all_day: e.is_all_day,
        location_id: e.location_id || null,
        location_ids: Array.isArray(e.location_ids) ? e.location_ids : (e.location_id ? [e.location_id] : []),
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
        // Calendar statuses don't map 1:1 onto a task board, so translate them.
        status: e.status === 'completed' ? 'done'
          : e.status === 'in_progress' ? 'in_progress'
          : e.status === 'cancelled' ? 'done' : 'todo',
        done: e.status === 'completed' || e.status === 'cancelled',
        priority: e.priority || 'normal',
        assignees: Array.isArray(e.assignees) ? e.assignees : [],
        assigned_to: e.assigned_to_name || null,
        assigned_to_id: e.assigned_to_id || null,
        order_number: e.order_id || null,
        created_at: e.created_at,
      }))
      rows = [...rows, ...calTasks]
    } catch { /* calendar unavailable — show the plain tasks */ }

    // Backfill series_id for repeats created before the series link existed, so
    // their occurrences can be edited/deleted as one series (the This/Following/
    // All scope selector only shows for tasks that carry a series_id). Occurrences
    // of one repeat share creator + title + recurrence rule. Runs once — after
    // this, the rows carry a series_id and there's nothing left to link.
    try {
      const unlinked = rows.filter((t: any) => t.recurrence && !t.series_id && t._source !== 'calendar' && !String(t.id).startsWith('cal:'))
      if (unlinked.length > 1) {
        const groups = new Map<string, any[]>()
        for (const t of unlinked) {
          const key = `${t.created_by_id || ''}|${t.title || t.text || ''}|${JSON.stringify(t.recurrence)}`
          const arr = groups.get(key) || []; arr.push(t); groups.set(key, arr)
        }
        const idToSeries: Record<string, string> = {}
        for (const arr of groups.values()) {
          if (arr.length < 2) continue   // a lone occurrence isn't a series
          const sid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
          const ids = arr.map((t: any) => t.id)
          try { await (supabase as any).from('conversation_tasks').update({ series_id: sid }).in('id', ids) } catch {}
          for (const id of ids) idToSeries[id] = sid
        }
        if (Object.keys(idToSeries).length) rows = rows.map((t: any) => idToSeries[t.id] ? { ...t, series_id: idToSeries[t.id] } : t)
      }
    } catch { /* backfill is best-effort */ }

    setTasks(rows)
    writeCache(`tasks:${cid}`, rows)

    const convIds = Array.from(new Set(rows.map((t: any) => t.conversation_id).filter(Boolean)))
    if (convIds.length) {
      const m: Record<string, any> = {}
      const contactIds = new Set<string>()
      for (let i = 0; i < convIds.length; i += 100) {
        // conversations has no contact_name column — the customer's name lives on
        // contacts (via contact_id), so pull the id here and resolve names below.
        const { data: cs } = await (supabase as any).from('conversations')
          .select('id, subject, contact_id, channel').in('id', convIds.slice(i, i + 100))
        for (const c of (cs || [])) { m[c.id] = c; if (c.contact_id) contactIds.add(c.contact_id) }
      }
      const ids = Array.from(contactIds)
      const names: Record<string, string> = {}
      for (let i = 0; i < ids.length; i += 100) {
        const { data: cts } = await (supabase as any).from('contacts')
          .select('id, name').in('id', ids.slice(i, i + 100))
        for (const ct of (cts || [])) names[ct.id] = ct.name
      }
      for (const id in m) { const cid = m[id].contact_id; if (cid && names[cid]) m[id].contact_name = names[cid] }
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
    const now = new Date()
    const today = startOfDay(now).getTime()
    const wk = periodRange(now, 'week'); const mo = periodRange(now, 'month')
    const threeEnd = today + 3 * 86400000
    const c = { today: 0, threedays: 0, overdue: 0, upcoming: 0, completed: 0, all: tasks.length, day: 0, week: 0, month: 0 }
    for (const t of tasks) {
      if (isDone(t)) { c.completed++; continue }
      const due = parseTs(t.due_date)
      // An undated task counts as "Today" so freshly-added tasks surface there.
      if (!due) { c.today++; continue }
      const dTime = due.getTime()
      const d = startOfDay(due).getTime()
      if (d < today) c.overdue++
      else if (d === today) c.today++
      else c.upcoming++
      if (d === today) c.day++
      if (dTime >= today && dTime < threeEnd) c.threedays++
      if (dTime >= wk.start && dTime < wk.end) c.week++
      if (dTime >= mo.start && dTime < mo.end) c.month++
    }
    return c
  }, [tasks])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Day / week / month window around the chosen reference date.
    let dateRange: { start: number; end: number } | null = null
    if (dateFilter) {
      const ref = new Date(dateFilter + 'T00:00:00')
      if (!isNaN(ref.getTime())) {
        if (datePeriod === 'day') {
          const s = new Date(ref); const e = new Date(ref); e.setDate(e.getDate() + 1)
          dateRange = { start: s.getTime(), end: e.getTime() }
        } else if (datePeriod === 'week') {
          const s = new Date(ref); s.setDate(s.getDate() - s.getDay())   // Sunday
          const e = new Date(s); e.setDate(e.getDate() + 7)
          dateRange = { start: s.getTime(), end: e.getTime() }
        } else {
          const s = new Date(ref.getFullYear(), ref.getMonth(), 1)
          const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
          dateRange = { start: s.getTime(), end: e.getTime() }
        }
      }
    }
    let list = tasks.filter(t => {
      if (!inBucket(t, bucket, bucketDate)) return false
      if (assigneeFilter === 'me' && !assignedToMe(t)) return false
      else if (assigneeFilter && assigneeFilter !== 'me') {
        const ok = t.assigned_to_id === assigneeFilter || (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === assigneeFilter))
        if (!ok) return false
      }
      if (priorityFilter && (t.priority || 'normal') !== priorityFilter) return false
      if (outletFilter.length) {
        const outs = (Array.isArray(t.location_ids) && t.location_ids.length) ? t.location_ids : (t.location_id ? [t.location_id] : [])
        if (!outs.some((o: string) => outletFilter.includes(o))) return false
      }
      if (dateFilter && dateRange) {
        const d = parseTs(t.due_date)
        if (!d) return false
        const time = d.getTime()
        if (time < dateRange.start || time >= dateRange.end) return false
      }
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
  }, [tasks, bucket, bucketDate, search, assigneeFilter, priorityFilter, outletFilter, dateFilter, datePeriod, sortBy, assignedToMe])

  // The calendar view honours the same bucket as the other views, so a "3 days"
  // or "Week" filter narrows the pills too — plus the assignee/priority/outlet/
  // search filters.
  const calendarTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (!inBucket(t, bucket, bucketDate)) return false
      if (assigneeFilter === 'me' && !assignedToMe(t)) return false
      else if (assigneeFilter && assigneeFilter !== 'me') {
        const ok = t.assigned_to_id === assigneeFilter || (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === assigneeFilter))
        if (!ok) return false
      }
      if (priorityFilter && (t.priority || 'normal') !== priorityFilter) return false
      if (outletFilter.length) {
        const outs = (Array.isArray(t.location_ids) && t.location_ids.length) ? t.location_ids : (t.location_id ? [t.location_id] : [])
        if (!outs.some((o: string) => outletFilter.includes(o))) return false
      }
      if (q) {
        const hay = [t.title, t.text, t.assigned_to, t.order_number, t.order_customer].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tasks, bucket, bucketDate, search, assigneeFilter, priorityFilter, outletFilter, assignedToMe])

  const selected = useMemo(() => tasks.find(t => t.id === selectedId) || null, [tasks, selectedId])

  const patchTask = async (id: string, fields: any) => {
    setTasks(cur => cur.map(t => t.id === id ? { ...t, ...fields } : t))
    const target = tasks.find(t => t.id === id)
    try {
      if (target?._source === 'calendar') {
        // Lives in calendar_events — translate the task fields back and save it
        // through the calendar API (which also guards the uuid columns). The
        // API replaces the whole row, so we seed the payload from the original
        // event and overlay only what changed — otherwise marking a delivery
        // done here would wipe its address, time window, outlets, attachments
        // and customer link.
        const statusMap: Record<string, string> = { todo: 'scheduled', in_progress: 'in_progress', done: 'completed' }
        const raw = target._calRaw || {}
        const payload: any = {
          companyId, action: 'save', id: target._calendarId,
          event_type: target.event_type || raw.event_type || 'task',
          title: fields.title ?? target.title ?? raw.title,
          notes: fields.text ?? target.text ?? raw.notes ?? null,
          starts_at: fields.due_date ?? target.due_date ?? raw.starts_at,
          ends_at: raw.ends_at ?? null,
          is_all_day: raw.is_all_day ?? true,
          time_window: raw.time_window ?? null,
          location_id: (fields.location_id !== undefined ? fields.location_id : raw.location_id) ?? null,
          location_ids: fields.location_ids !== undefined
            ? fields.location_ids
            : (raw.location_ids ?? (raw.location_id ? [raw.location_id] : [])),
          contact_id: raw.contact_id ?? null,
          conversation_id: raw.conversation_id ?? null,
          order_id: raw.order_id ?? null,
          address: raw.address ?? null,
          status: fields.status ? (statusMap[fields.status] || 'scheduled') : (raw.status || 'scheduled'),
          assigned_to_id: fields.assignees !== undefined ? (fields.assigned_to_id ?? null) : (raw.assigned_to_id ?? null),
          assigned_to_name: fields.assignees !== undefined ? (fields.assigned_to ?? null) : (raw.assigned_to_name ?? null),
          assignees: fields.assignees !== undefined ? fields.assignees : (raw.assignees ?? []),
          reminder_channels: raw.reminder_channels ?? null,
          notify_customer: !!raw.notify_customer,
          customer_contact_id: raw.customer_contact_id ?? null,
          attachments: fields.attachments !== undefined ? fields.attachments : (raw.attachments ?? []),
        }
        await fetch('/api/calendar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Supabase returns { error } rather than throwing, so a failed write
        // used to pass silently — the change looked saved until the next
        // reload, when it vanished. Check it and say something.
        const { error } = await (supabase as any).from('conversation_tasks').update(fields).eq('id', id)
        if (error) {
          console.error('[task update] failed', error, fields)
          const missing = /column .* does not exist|schema cache/i.test(error.message)
          alert(missing
            ? `Could not save: your database is missing a column this needs (${error.message}). Run the COLVY_V203_TASK_BOARD.sql migration.`
            : `Could not save: ${error.message}`)
          if (companyId) loadTasks(companyId)
        }
      }
    }
    catch (e: any) {
      console.error('[task update] threw', e)
      if (companyId) loadTasks(companyId)
    }
  }
  const setStatus = (t: any, status: string) =>
    patchTask(t.id, { status, done: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null })

  // Bulk actions operate on real conversation_tasks only — calendar-sourced rows
  // (id "cal:…") live elsewhere and are silently skipped.
  const realSelectedIds = () => Array.from(selectedIds).filter(id => !String(id).startsWith('cal:'))
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const bulkDelete = async () => {
    const ids = realSelectedIds()
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return
    try { await (supabase as any).from('conversation_tasks').delete().in('id', ids) } catch (e: any) { alert('Could not delete: ' + e.message); return }
    if (selectedId && ids.includes(selectedId)) setSelectedId(null)
    exitSelect()
    if (companyId) loadTasks(companyId)
  }
  const bulkStatus = async (status: string) => {
    const ids = realSelectedIds()
    if (!ids.length) return
    try { await (supabase as any).from('conversation_tasks').update({ status, done: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null }).in('id', ids) } catch (e: any) { alert('Could not update: ' + e.message); return }
    exitSelect()
    if (companyId) loadTasks(companyId)
  }
  const bulkPriority = async (priority: string) => {
    const ids = realSelectedIds()
    if (!ids.length) return
    try { await (supabase as any).from('conversation_tasks').update({ priority }).in('id', ids) } catch (e: any) { alert('Could not update: ' + e.message); return }
    exitSelect()
    if (companyId) loadTasks(companyId)
  }

  // Apply an edit to a whole recurring series. scope: 'this' | 'following' | 'all'.
  // Falls back to a single-row patch when the task isn't part of a series.
  const patchScoped = async (task: any, fields: any, scope?: string) => {
    if (!task.series_id || !scope || scope === 'this' || task._source === 'calendar') {
      return patchTask(task.id, fields)
    }
    // Optimistic local update across the affected rows.
    setTasks(cur => cur.map(t => {
      if (t.series_id !== task.series_id) return t
      if (scope === 'following' && parseTs(t.due_date) && parseTs(task.due_date) && (parseTs(t.due_date)! < parseTs(task.due_date)!)) return t
      return { ...t, ...fields }
    }))
    try {
      let q = (supabase as any).from('conversation_tasks').update(fields).eq('series_id', task.series_id)
      if (scope === 'following' && task.due_date) q = q.gte('due_date', task.due_date)
      const { error } = await q
      if (error) { console.error('[task scoped update] failed', error); if (companyId) loadTasks(companyId) }
    } catch (e) { console.error('[task scoped update] threw', e); if (companyId) loadTasks(companyId) }
  }

  // Delete a task, or a scoped slice of its series.
  const deleteScoped = async (task: any, scope?: string) => {
    if (task._source === 'calendar') {
      await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete', id: task._calendarId }) })
      return
    }
    if (!task.series_id || !scope || scope === 'this') {
      await (supabase as any).from('conversation_tasks').delete().eq('id', task.id)
      return
    }
    let q = (supabase as any).from('conversation_tasks').delete().eq('series_id', task.series_id)
    if (scope === 'following' && task.due_date) q = q.gte('due_date', task.due_date)
    await q
  }

  // End a repeat at a card and open the create form pre-filled, so the user can
  // pick a NEW repeat rule for the rest of the run (change daily→weekly, etc.).
  const endRepeatAndCreate = async (task: any) => {
    await deleteScoped(task, 'following')   // drop this occurrence + all later ones
    setNewTaskSeed({
      title: task.title || task.text || '',
      priority: task.priority || 'normal',
      color: task.color || '',
      locationId: task.location_id || '',
      assignees: Array.isArray(task.assignees) ? task.assignees : [],
      due: task.due_date ? localYmd(parseTs(task.due_date) || new Date(task.due_date)) : '',
    })
    setSelectedId(null)
    setShowNew(true)
    if (companyId) loadTasks(companyId)
  }

  if (loading) return <div style={{ padding: 20 }}><SkeletonList rows={7} /></div>

  const BUCKETS: { key: Bucket; label: string; n: number }[] = [
    { key: 'today', label: 'Today', n: counts.today },
    { key: 'threedays', label: '3 days', n: counts.threedays },
    { key: 'overdue', label: 'Overdue', n: counts.overdue },
    { key: 'upcoming', label: 'Upcoming', n: counts.upcoming },
    { key: 'completed', label: 'Completed', n: counts.completed },
    { key: 'all', label: 'All', n: counts.all },
    { key: 'day', label: 'Day', n: counts.day },
    { key: 'week', label: 'Week', n: counts.week },
    { key: 'month', label: 'Month', n: counts.month },
    { key: 'date', label: 'Date', n: 0 },
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
        /* Detail is a slide-out panel from the right (~half screen). */
        .tasks-detail {
          position: fixed; top: 56px; right: 0; height: calc(100vh - 56px);
          width: 48vw; max-width: 640px; min-width: 380px;
          background: #fff; border-left: 1px solid var(--border);
          box-shadow: -14px 0 44px rgba(0,0,0,0.14);
          overflow-y: auto; z-index: 60;
          transform: translateX(100%);
          transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .tasks-detail.open { transform: translateX(0); }
        .tasks-detail-overlay { position: fixed; inset: 56px 0 0 0; background: rgba(0,0,0,0.22); z-index: 55; opacity: 0; pointer-events: none; transition: opacity 0.32s ease; }
        .tasks-detail-overlay.open { opacity: 1; pointer-events: auto; }
        .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
        .seg button { padding: 7px 12px; border: none; background: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; color: var(--slate); }
        .seg button.on { background: var(--peach); color: var(--coral); }
        .ctl { padding: 8px 11px; border-radius: 9px; border: 1px solid var(--border); font-size: 12.5px; background: #fff; color: var(--ink); }
        .task-card { border: 1px solid var(--border); border-radius: 11px; background: #fff; padding: 13px; margin-bottom: 8px; cursor: pointer; }
        .task-card:hover { border-color: var(--coral); }
        .cal-pill .cal-tick { opacity: 0; transition: opacity 0.12s ease; }
        .cal-pill:hover .cal-tick, .cal-tick.done { opacity: 1; }
        .cal-cell { cursor: pointer; }
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
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Tasks</h1>
            <PageGreeting
              name={me}
              detail={
                counts.overdue > 0
                  ? `${counts.overdue} overdue`
                  : counts.today > 0
                    ? `${counts.today} due today`
                    : 'nothing due today'
              }
              style={{ marginTop: 3 }}
            />
          </div>
          <button className="press" onClick={() => { setShowNew(true); setSelectedId(null) }}
            style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ New task</button>
        </div>
        <div className="tasks-buckets">
          {BUCKETS.map(b => (
            <button key={b.key} className={'bucket-chip' + (bucket === b.key ? ' on' : '')} onClick={() => setBucket(b.key)}>
              {b.label}{b.n > 0 && <span className="bucket-n">{b.n}</span>}
            </button>
          ))}
          {/* The "Date" bucket reveals an inline picker to jump to a specific day. */}
          {bucket === 'date' && (
            <input type="date" value={bucketDate} onChange={e => setBucketDate(e.target.value)}
              style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 20, border: '1px solid var(--coral)', fontSize: 12.5, fontWeight: 700, color: 'var(--coral)', background: 'var(--peach)' }} />
          )}
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
          {/* Calendar is now an in-page view of the tasks (by due date) rather
              than a jump to the separate Calendar page. */}
          <button className="ctl" onClick={() => setView(view === 'calendar' ? 'list' : 'calendar')}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, border: '1px solid ' + (view === 'calendar' ? 'var(--coral)' : 'var(--border)'), background: view === 'calendar' ? 'var(--peach)' : '#fff', color: view === 'calendar' ? 'var(--coral)' : 'var(--ink)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Calendar
          </button>
          {/* Bulk select — multi-select the list for delete / status / priority. */}
          {view === 'list' && (
            <button className="ctl" onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, border: '1px solid ' + (selectMode ? 'var(--coral)' : 'var(--border)'), background: selectMode ? 'var(--peach)' : '#fff', color: selectMode ? 'var(--coral)' : 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
          {/* Filters live in a top dropdown now (moved off the left rail). */}
          {(() => {
            const activeN = [assigneeFilter, priorityFilter, dateFilter].filter(Boolean).length + (outletFilter.length ? 1 : 0)
            return (
              <div style={{ position: 'relative' }}>
                <button className="ctl" onClick={() => setShowFilters(v => !v)}
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, border: '1px solid ' + (activeN > 0 ? 'var(--coral)' : 'var(--border)'), background: activeN > 0 ? 'var(--peach)' : '#fff', color: activeN > 0 ? 'var(--coral)' : 'var(--ink)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filters{activeN > 0 ? <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--coral)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{activeN}</span> : null}
                </button>
                {showFilters && (
                  <>
                    <div onClick={() => setShowFilters(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 264, maxWidth: '86vw', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 44px rgba(0,0,0,0.14)', zIndex: 50, padding: 14 }}>
                      <FilterField label={outletFilter.length ? `Outlets (${outletFilter.length})` : 'Outlets'} hidden={outlets.length === 0}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button onClick={() => setOutletFilter([])}
                            style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid ' + (outletFilter.length === 0 ? 'var(--coral)' : 'var(--border)'), background: outletFilter.length === 0 ? 'var(--peach)' : '#fff', color: outletFilter.length === 0 ? 'var(--coral)' : 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            {outletFilter.length === 0 ? '✓ ' : ''}All
                          </button>
                          {outlets.map(o => {
                            const on = outletFilter.includes(o.id)
                            return (
                              <button key={o.id}
                                onClick={() => setOutletFilter(prev => on ? prev.filter(x => x !== o.id) : [...prev, o.id])}
                                style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                {on ? '✓ ' : ''}{o.label || o.suburb || 'Outlet'}
                              </button>
                            )
                          })}
                        </div>
                      </FilterField>
                      <FilterField label="Assignee">
                        <select className="ctl" style={selectStyle} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                          <option value="">Anyone</option><option value="me">Assigned to me</option>
                          {team.map(m => <option key={m.id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      </FilterField>
                      <FilterField label="Due in">
                        <div className="seg" style={{ display: 'flex', width: '100%', marginBottom: 6 }}>
                          {(['day', 'week', 'month'] as const).map(p => (
                            <button key={p} className={datePeriod === p ? 'on' : ''} onClick={() => setDatePeriod(p)}
                              style={{ flex: 1, padding: '6px 0', border: 'none', background: datePeriod === p ? 'var(--peach)' : '#fff', color: datePeriod === p ? 'var(--coral)' : 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="date" className="ctl" style={{ ...selectStyle, flex: 1 }} value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
                          {dateFilter && <button className="ctl" onClick={() => setDateFilter('')} style={{ cursor: 'pointer' }}>Clear</button>}
                        </div>
                      </FilterField>
                      <FilterField label="Priority">
                        <select className="ctl" style={selectStyle} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                          <option value="">Any priority</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
                        </select>
                      </FilterField>
                      <FilterField label="Sort by">
                        <select className="ctl" style={selectStyle} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                          <option value="due">Due date</option><option value="priority">Priority</option><option value="created">Newest</option>
                        </select>
                      </FilterField>
                      {activeN > 0 && (
                        <button onClick={() => { setAssigneeFilter(''); setPriorityFilter(''); setOutletFilter([]); setDateFilter('') }}
                          style={{ width: '100%', marginTop: 6, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Clear all filters</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      <div className="tasks-body">
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
          ) : view === 'calendar' ? (
            <TaskCalendar tasks={calendarTasks} statusOf={statusOf} onSelect={(id: string) => { setSelectedId(id); setShowNew(false) }} onToggle={(t: any) => setStatus(t, isDone(t) ? 'todo' : 'done')} selectedId={selectedId} />
          ) : (
            <div style={{ padding: 16 }}>
              {/* Bulk selection toolbar */}
              {selectMode && (
                <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 12, borderRadius: 12, background: 'var(--peach)', border: '1px solid var(--coral)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--coral)', cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={visible.length > 0 && visible.every(t => selectedIds.has(t.id))}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && !visible.every(t => selectedIds.has(t.id)) }}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(visible.map(t => t.id)) : new Set())}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                  </label>
                  <span style={{ flex: 1 }} />
                  {selectedIds.size > 0 && (<>
                    <button onClick={() => bulkStatus('done')} style={bulkBtn}>Mark done</button>
                    <button onClick={() => bulkStatus('todo')} style={bulkBtn}>Mark to-do</button>
                    <select onChange={e => { if (e.target.value) bulkPriority(e.target.value); e.target.value = '' }} defaultValue="" style={{ ...bulkBtn, cursor: 'pointer' }}>
                      <option value="" disabled>Priority…</option>
                      <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
                    </select>
                    <button onClick={bulkDelete} style={{ ...bulkBtn, borderColor: '#dc2626', color: '#dc2626' }}>Delete</button>
                  </>)}
                </div>
              )}
              {visible.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)', fontSize: 13.5 }}>No tasks in “{BUCKETS.find(b => b.key === bucket)?.label}”.</div>}
              {visible.map(t => (
                <TaskCard key={t.id} t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id}
                  selectMode={selectMode} checked={selectedIds.has(t.id)} onSelect={() => toggleSelect(t.id)}
                  onClick={() => { if (selectMode) { toggleSelect(t.id) } else { setSelectedId(t.id); setShowNew(false) } }}
                  statusOf={statusOf} onToggle={() => setStatus(t, isDone(t) ? 'todo' : 'done')} />
              ))}
            </div>
          )}
        </div>
        {/* Backdrop for the slide-out (desktop). */}
        <div className={'tasks-detail-overlay' + ((selected || showNew) && !isNarrow ? ' open' : '')}
          onClick={() => { setSelectedId(null); setShowNew(false); setNewTaskSeed(null) }} />
        <div className={'tasks-detail' + ((selected || showNew) && !isNarrow ? ' open' : '')}>
          {(selected || showNew) && (
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{showNew ? (newTaskSeed ? 'Continue repeat' : 'New task') : 'Task details'}</span>
              <button onClick={() => { setSelectedId(null); setShowNew(false); setNewTaskSeed(null) }} title="Close"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4, borderRadius: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
          {showNew ? (
            <TaskEditor companyId={companyId!} team={team} outlets={outlets} me={me} userId={userId} initial={newTaskSeed} onClose={() => { setShowNew(false); setNewTaskSeed(null) }} onSaved={() => { setShowNew(false); setNewTaskSeed(null); if (companyId) loadTasks(companyId) }} />
          ) : selected ? (
            <TaskDetail key={selected.id} task={selected} conv={convs[selected.conversation_id]} team={team} outlets={outlets} companyId={companyId!} me={me} userId={userId}
              onPatch={(f: any, scope?: string) => patchScoped(selected, f, scope)} onDeleteScoped={(scope?: string) => deleteScoped(selected, scope)} onEndRepeatNew={() => endRepeatAndCreate(selected)} onDeleted={() => { setSelectedId(null); if (companyId) loadTasks(companyId) }} router={router} />
          ) : null}
        </div>
      </div>

      {isNarrow && (showNew || selected) && (
        <MobileSheet onClose={() => { setShowNew(false); setSelectedId(null) }}>
          {showNew ? (
            <TaskEditor companyId={companyId!} team={team} outlets={outlets} me={me} userId={userId} initial={newTaskSeed} onClose={() => { setShowNew(false); setNewTaskSeed(null) }} onSaved={() => { setShowNew(false); setNewTaskSeed(null); if (companyId) loadTasks(companyId) }} />
          ) : selected ? (
            <TaskDetail key={selected.id} task={selected} conv={convs[selected.conversation_id]} team={team} outlets={outlets} companyId={companyId!} me={me} userId={userId}
              onPatch={(f: any, scope?: string) => patchScoped(selected, f, scope)} onDeleteScoped={(scope?: string) => deleteScoped(selected, scope)} onEndRepeatNew={() => endRepeatAndCreate(selected)} onDeleted={() => { setSelectedId(null); if (companyId) loadTasks(companyId) }} router={router} />
          ) : null}
        </MobileSheet>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', cursor: 'pointer' }
const bulkBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
function FilterField({ label, hidden, children }: { label: string; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 5px', fontSize: 10.5, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      {children}
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

function TaskCard({ t, conv, selected, onClick, onToggle, onStatus, showStatusButtons, statusOf, selectMode, checked, onSelect }: any) {
  const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
  const due = parseTs(t.due_date)
  const overdue = due && startOfDay(due).getTime() < startOfDay(new Date()).getTime() && statusOf(t) !== 'done'
  const assignees = (Array.isArray(t.assignees) && t.assignees.length) ? t.assignees : (t.assigned_to ? [{ name: t.assigned_to }] : [])
  // Colour-coded tasks get a soft tinted background rather than a left bar.
  const bg = selectMode && checked ? 'var(--peach)' : (t.color ? tint(t.color, 0.10) : undefined)
  return (
    <div className={'task-card lift' + ((selected || (selectMode && checked)) ? ' sel' : '')} onClick={onClick}
      style={(bg || t.color) ? { background: bg, borderColor: selectMode && checked ? 'var(--coral)' : (t.color ? tint(t.color, 0.45) : undefined) } : undefined}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        {selectMode
          ? <input type="checkbox" checked={!!checked} onClick={e => e.stopPropagation()} onChange={onSelect} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--coral)' }} />
          : onToggle && <input type="checkbox" checked={statusOf(t) === 'done'} onClick={e => e.stopPropagation()} onChange={onToggle} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, textDecoration: statusOf(t) === 'done' ? 'line-through' : 'none', opacity: statusOf(t) === 'done' ? 0.55 : 1 }}>{t.title || t.text}</p>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5, color: pr.color, background: pr.bg }}>{pr.label}</span>
            {due && <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#dc2626' : 'var(--slate)' }}>{fmtRel(t.due_date)}</span>}
            {assignees.map((a: any, i: number) => <span key={i} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>{a.name}</span>)}
            {t.order_number && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#eef2ff', color: '#4338ca' }}>#{t.order_number}</span>}
            {Array.isArray(t.attachments) && t.attachments.length > 0 && (() => {
              const img = t.attachments.find((a: any) => a.kind === 'image' || (a.type || '').startsWith('image/'))
              return (
                <span title={`${t.attachments.length} attachment${t.attachments.length === 1 ? '' : 's'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: '#f4f4f5', color: 'var(--slate)' }}>
                  {img ? <img src={img.url} alt="" style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover' }} /> : <span>📎</span>}
                  {t.attachments.length}
                </span>
              )
            })()}
            {t.recurrence && (
              <span title="Repeating task" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: '#ecfeff', color: '#0e7490' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                {t.recurrence.freq}
              </span>
            )}
            {t._source === 'calendar' && (() => {
              const et = EVENT_TYPE_META[t.event_type || 'task'] || EVENT_TYPE_META.task
              return (
                <span title={`${et.label} scheduled on the calendar`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: et.bg, color: et.color }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {et.label}
                </span>
              )
            })()}
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

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// An in-page month calendar of the tasks, plotted on their due dates. Clicking a
// task opens it in the detail pane, same as the other views.
function TaskCalendar({ tasks, statusOf, onSelect, onToggle, selectedId }: any) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [dayPopup, setDayPopup] = useState<{ date: Date; tasks: any[] } | null>(null)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = dayKey(new Date())

  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {}
    const noDate: any[] = []
    for (const t of tasks) {
      const due = parseTs(t.due_date)
      if (!due) { noDate.push(t); continue }
      ;(m[dayKey(due)] ||= []).push(t)
    }
    return { m, noDate }
  }, [tasks])

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))} style={navBtn}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
        <button aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))} style={navBtn}>›</button>
        <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d) }} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12 }}>Today</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
        {WD.map(w => <div key={w} style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--slate)', textAlign: 'center', textTransform: 'uppercase' }}>{w}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: 'minmax(90px, auto)', gap: 6 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />
          const key = dayKey(new Date(year, month, d))
          const dayTasks = byDay.m[key] || []
          const isToday = key === todayKey
          const openDay = () => setDayPopup({ date: new Date(year, month, d), tasks: dayTasks })
          return (
            // Clicking anywhere in the cell (not a task pill) opens the day popup.
            <div key={i} className="cal-cell" onClick={openDay}
              style={{ border: `1px solid ${isToday ? 'var(--coral)' : 'var(--border)'}`, borderRadius: 10, padding: 6, background: isToday ? 'var(--peach)' : '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--coral)' : 'var(--slate)' }}>{d}</span>
              {dayTasks.slice(0, 3).map((t: any) => {
                const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
                const done = statusOf(t) === 'done'
                const sel = selectedId === t.id
                // Colour-coded tasks use their own colour for the chip; others
                // fall back to the priority colour.
                const cBg = t.color ? tint(t.color, 0.16) : pr.bg
                const cFg = t.color || pr.color
                const cDot = t.color || pr.color
                return (
                  <div key={t.id} className="cal-pill" onClick={(e) => { e.stopPropagation(); onSelect(t.id) }} title={t.title || t.text}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '2px 5px', borderRadius: 5, background: sel ? 'var(--coral)' : cBg, color: sel ? '#fff' : cFg, fontSize: 10.5, fontWeight: 700 }}>
                    {/* Hover tick to complete without opening the task. */}
                    <button type="button" className={'cal-tick' + (done ? ' done' : '')} title={done ? 'Mark not done' : 'Mark done'}
                      onClick={(e) => { e.stopPropagation(); onToggle?.(t) }}
                      style={{ flexShrink: 0, width: 13, height: 13, borderRadius: '50%', border: '1.5px solid ' + (done ? '#22c55e' : (sel ? '#fff' : cDot)), background: done ? '#22c55e' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{t.title || t.text}</span>
                  </div>
                )
              })}
              {dayTasks.length > 3 && (
                <button onClick={(e) => { e.stopPropagation(); openDay() }} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--coral)', padding: '0 0 0 2px' }}>+{dayTasks.length - 3} more</button>
              )}
            </div>
          )
        })}
      </div>

      {byDay.noDate.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', margin: '0 0 8px' }}>No due date ({byDay.noDate.length})</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {byDay.noDate.map((t: any) => {
              const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
              const sel = selectedId === t.id
              return (
                <button key={t.id} onClick={() => onSelect(t.id)} title={t.title || t.text}
                  style={{ maxWidth: 220, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${sel ? 'var(--coral)' : 'var(--border)'}`, background: sel ? 'var(--peach)' : '#fff', color: sel ? 'var(--coral)' : 'var(--ink)', borderRadius: 20, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: pr.color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || t.text}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Day popup — the full list of tasks for a clicked date. */}
      {dayPopup && (
        <div onClick={() => setDayPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{dayPopup.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>{dayPopup.tasks.length} task{dayPopup.tasks.length === 1 ? '' : 's'}</p>
              </div>
              <button onClick={() => setDayPopup(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {dayPopup.tasks.length === 0 && <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--slate)' }}>No tasks on this day.</p>}
              {dayPopup.tasks.map((t: any) => {
                const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
                const done = statusOf(t) === 'done'
                return (
                  <button key={t.id} onClick={() => { onSelect(t.id); setDayPopup(null) }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderLeft: `4px solid ${t.color || pr.color}`, borderRadius: 10, background: '#fff', padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }}>{t.title || t.text}</p>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, color: pr.color, background: pr.bg }}>{pr.label}</span>
                        {t.assigned_to && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>{t.assigned_to}</span>}
                        {t.recurrence && <span style={{ fontSize: 10, fontWeight: 700, color: '#0e7490' }}>↻ {t.recurrence.freq}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
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

function TaskDetail({ task, conv, team, outlets = [], companyId, me, userId, onPatch, onDeleteScoped, onEndRepeatNew, onDeleted, router }: any) {
  const [comments, setComments] = useState<any[]>([])
  const [comment, setComment] = useState('')
  const [showOrderSearch, setShowOrderSearch] = useState(false)
  // Edit scope for a recurring series. Only shown when the task is part of one.
  const isSeries = !!task.series_id
  const [scope, setScope] = useState<'this' | 'following' | 'all'>('this')
  useEffect(() => { setScope('this') }, [task.id])
  // Every field edit routes through here so it honours the chosen scope.
  const patch = (fields: any) => onPatch(fields, isSeries ? scope : 'this')
  useEffect(() => {
    // task_comments references conversation_tasks, so a calendar-sourced task
    // has no comment thread to load.
    if (task._source === 'calendar') { setComments([]); return }
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
    const { data, error } = await (supabase as any).from('task_comments').insert(row).select().maybeSingle()
    if (error) {
      console.error('[task comment] failed', error)
      alert(/does not exist|schema cache/i.test(error.message)
        ? 'Could not save the comment — the task_comments table is missing. Run the COLVY_V203_TASK_BOARD.sql migration.'
        : `Could not save the comment: ${error.message}`)
      return
    }
    if (data) setComments(c => [...c, data])
    // Reach the mentioned people properly — bell, email and SMS.
    const mentionIds = Array.from(new Set(
      (mentioned as any[])
        .map(m => team.find((t: any) => t.id === m.id || t.user_id === m.id || t.name === m.name)?.user_id)
        .filter((uid: any) => uid && uid !== userId)
    ))
    if (mentionIds.length) {
      try {
        await fetch('/api/notify/members', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, userIds: mentionIds, type: 'task_comment',
            title: `${me} mentioned you on a task`,
            body: comment.trim().slice(0, 200), link: '/admin/tasks',
          }),
        })
      } catch { /* the comment is saved either way */ }
    }
    setComment('')
  }
  const L: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '16px 0 7px' }
  const curStatus = task.status || (task.done ? 'done' : 'todo')
  return (
    <div style={{ padding: 18 }}>
      {task._source === 'calendar' && (() => {
        const et = EVENT_TYPE_META[task.event_type || 'task'] || EVENT_TYPE_META.task
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 6, background: et.bg, color: et.color, marginBottom: 8 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {et.label}
          </span>
        )
      })()}
      <textarea value={task.title || task.text || ''} onChange={e => patch({ title: e.target.value })} rows={2}
        style={{ width: '100%', border: 'none', fontSize: 16.5, fontWeight: 700, color: 'var(--ink)', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.35 }} />
      {task.text && task.title && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>{task.text}</p>}

      <p style={L}>Photos &amp; videos</p>
      <AttachmentUploader companyId={companyId} value={task.attachments || []} onChange={(a) => patch({ attachments: a })} folder="task" compact />


      {/* Edit scope for a repeating task — every change (and the delete) below
          applies to the chosen slice of the series. */}
      {isSeries && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#ecfeff', border: '1px solid #a5f3fc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            Repeating task — apply changes to
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {([['this', 'This card'], ['following', 'This & following'], ['all', 'All cards']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} style={{ flex: 1, padding: '7px 4px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (scope === k ? '#0e7490' : 'var(--border)'), background: scope === k ? '#0e7490' : '#fff', color: scope === k ? '#fff' : 'var(--slate)' }}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <p style={L}>Status</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {COLUMNS.map(c => { const on = curStatus === c.key; return (
          <button key={c.key} onClick={() => patch({ status: c.key, done: c.key === 'done', completed_at: c.key === 'done' ? new Date().toISOString() : null })}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>{c.label}</button>
        )})}
      </div>
      <p style={L}>Priority</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['high', 'normal', 'low'] as const).map(p => { const on = (task.priority || 'normal') === p; return (
          <button key={p} onClick={() => patch({ priority: p })} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? PRIORITY[p].color : 'var(--border)'), background: on ? PRIORITY[p].bg : '#fff', color: on ? PRIORITY[p].color : 'var(--slate)' }}>{PRIORITY[p].label}</button>
        )})}
      </div>
      <p style={L}>Due date</p>
      <input type="date" value={task.due_date ? localYmd(parseTs(task.due_date) || new Date(task.due_date)) : ''} onChange={e => patch({ due_date: dueFromInput(e.target.value) })}
        style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />

      <p style={L}>Colour</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button onClick={() => patch({ color: null })} title="No colour"
          style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {!task.color && <span style={{ width: 12, height: 2, background: 'var(--slate)', transform: 'rotate(-45deg)', position: 'absolute' }} />}
        </button>
        {TASK_COLORS.map(c => (
          <button key={c} onClick={() => patch({ color: c })} title={c}
            style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: c, border: task.color === c ? '2px solid var(--ink)' : '2px solid transparent', boxShadow: task.color === c ? `0 0 0 2px ${tint(c, 0.4)}` : 'none' }} />
        ))}
      </div>

      {outlets.length > 0 && (() => {
        const selIds: string[] = (Array.isArray(task.location_ids) && task.location_ids.length) ? task.location_ids : (task.location_id ? [task.location_id] : [])
        return (
          <>
            <p style={L}>Outlets</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {outlets.map((o: any) => {
                const on = selIds.includes(o.id)
                return (
                  <button key={o.id} type="button"
                    onClick={() => { const next = on ? selIds.filter(x => x !== o.id) : [...selIds, o.id]; patch({ location_ids: next, location_id: next[0] || null }) }}
                    style={{ padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>
                    {on ? '✓ ' : ''}{o.label || o.suburb || 'Outlet'}
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}

      <p style={L}>Assignees</p>
      <AssigneePicker members={team} value={assignees.map((a: any) => ({ id: a.id, name: a.name }))}
        onChange={async (next) => {
          const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
          const before = new Set(assignees.map((a: any) => a.id))
          patch({ assignees: next, assigned_to_id: isUuid(next[0]?.id) ? next[0].id : null, assigned_to: next[0]?.name || null })

          // Assigning someone to an existing task should tell them, the same as
          // assigning at creation did — previously this changed silently.
          const added = next
            .map(a => a.id)
            .filter(id => isUuid(id) && !before.has(id) && id !== userId)
          if (added.length) {
            try {
              await fetch('/api/notify/members', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  companyId, userIds: added, type: 'task_assigned',
                  title: `${me} assigned you a task`,
                  body: (task.title || task.text || '').slice(0, 200), link: '/admin/tasks',
                }),
              })
            } catch { /* the assignment is saved either way */ }
          }
        }} />
      <p style={L}>Linked order</p>
      {task.order_number ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#f8f9ff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>#{task.order_number}</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{task.order_customer}{task.order_total ? ` · $${Number(task.order_total).toFixed(2)}` : ''}</div>
          </div>
          <button onClick={() => patch({ order_id: null, order_number: null, order_customer: null, order_total: null })} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remove</button>
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
      {task._source === 'calendar' ? (
        <div style={{ marginTop: 18, padding: '10px 12px', borderRadius: 10, background: 'var(--canvas)', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>
          This {(EVENT_TYPE_META[task.event_type || 'task'] || EVENT_TYPE_META.task).label.toLowerCase()} is scheduled on the calendar. Comments are available on tasks created here in the Tasks page.
        </div>
      ) : (
      <>
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
      {/* Coax-style composer: rounded input with the submit tucked into the
          corner, matching the Inbox notes/tasks composer. */}
      <div style={{ position: 'relative' }}>
        <MentionInput value={comment} onChange={(v) => setComment(v)} team={team as any} placeholder="Add a comment… @ to mention" onSubmit={addComment} style={{ fontSize: 13, padding: '11px 46px 11px 13px', borderRadius: 12, lineHeight: 1.5 }} />
        <button type="button" onClick={addComment} title="Comment" disabled={!comment.trim()}
          style={{ position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: '50%', border: 'none', background: comment.trim() ? 'var(--coral)' : '#eef0f2', color: comment.trim() ? '#fff' : '#9aa1ab', cursor: comment.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all 0.14s', boxShadow: comment.trim() ? '0 1px 4px rgba(255,122,107,0.4)' : 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
        </button>
      </div>
      </>
      )}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        {isSeries && onEndRepeatNew && (
          <button onClick={async () => {
            if (!confirm('End the repeat at this card (this and all following cards are removed) and start a new repeat from here?')) return
            await onEndRepeatNew()
          }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #0e7490', background: '#ecfeff', color: '#0e7490', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 12px', borderRadius: 9 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            End repeat here &amp; create new…
          </button>
        )}
        <button onClick={async () => {
          const label = isSeries ? (scope === 'all' ? 'all cards in this series' : scope === 'following' ? 'this and all following cards' : 'this card') : 'this task'
          if (!confirm(`Delete ${label}?`)) return
          await onDeleteScoped(isSeries ? scope : 'this')
          onDeleted()
        }} style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {isSeries ? (scope === 'all' ? 'Delete all in series' : scope === 'following' ? 'Delete this & following' : 'Delete this card') : 'Delete task'}
        </button>
      </div>
      {showOrderSearch && <OrderSearchModal companyId={companyId} onClose={() => setShowOrderSearch(false)} onPick={(o: any) => { patch({ order_id: o.order_id, order_number: o.order_number, order_customer: o.customer, order_total: o.total }); setShowOrderSearch(false) }} />}
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
