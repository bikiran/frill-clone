'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { WhyLink } from '@/components/WhyAgent'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { SkeletonList } from '@/components/Skeleton'
import AssigneePicker from '@/components/AssigneePicker'
import AttachmentUploader from '@/components/AttachmentUploader'
import TaskEditor from '@/components/TaskEditor'
import RichTextEditor from '@/components/RichTextEditor'
import MentionInput, { resolveMentions } from '@/components/MentionInput'
import { enrichNames } from '@/lib/team-names'
import { loadStaffRows } from '@/lib/team-list'
import { useDraft } from '@/lib/drafts'
import PageGreeting from '@/components/PageGreeting'
import { peekCompanyUser, resolveCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { readLocal, writeLocal } from '@/lib/local-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import { foldRepeats } from '@/lib/task-fold'
import { beginWrite, endWrite, overlayPending, inOrder, type PendingWrites, type WriteChains } from '@/lib/task-pending'
import { checklistActivity } from '@/lib/task-checklist'
import ChecklistItemText from '@/components/ChecklistItemText'
import EmptyScroll from '@/components/EmptyScroll'

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
// Clock-style relative time for comments: "just now", "a minute ago", "3 hours
// ago", "yesterday", then a date. Pair with a title of the exact timestamp.
const fmtAgo = (d: string | null | undefined): string => {
  const p = parseTs(d); if (!p) return ''
  const s = Math.floor((Date.now() - p.getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 90) return 'a minute ago'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minutes ago`
  if (m < 90) return 'an hour ago'
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hours ago`
  const days = Math.floor(h / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const fmtExact = (d: string | null | undefined): string => {
  const p = parseTs(d); if (!p) return ''
  return p.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

type Bucket = 'today' | 'overdue' | 'upcoming' | 'completed' | 'all' | 'day' | 'week' | 'month' | 'date'

// Start/end (ms) of the day / week (Sun–Sat) / month containing `ref`.
function periodRange(ref: Date, period: 'day' | 'week' | 'month'): { start: number; end: number } {
  const d = new Date(ref); d.setHours(0, 0, 0, 0)
  if (period === 'day') { const e = new Date(d); e.setDate(e.getDate() + 1); return { start: d.getTime(), end: e.getTime() } }
  if (period === 'week') { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); const e = new Date(s); e.setDate(e.getDate() + 7); return { start: s.getTime(), end: e.getTime() } }
  const s = new Date(d.getFullYear(), d.getMonth(), 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return { start: s.getTime(), end: e.getTime() }
}
type ViewMode = 'list' | 'board' | 'timeline' | 'calendar'

const isDoneT = (t: any) => (t.status ? t.status === 'done' : !!t.done)
// Order tasks within a day / list: completed always last, then the manual
// drag order (sort_order), then due date, then creation. Used everywhere so a
// dragged order and "done to the bottom" hold in every view.
function orderCmp(a: any, b: any): number {
  const dr = (isDoneT(a) ? 1 : 0) - (isDoneT(b) ? 1 : 0)
  if (dr) return dr
  const sa = a.sort_order == null ? Infinity : a.sort_order
  const sb = b.sort_order == null ? Infinity : b.sort_order
  if (sa !== sb) return sa - sb
  const ta = parseTs(a.due_date)?.getTime() ?? Infinity
  const tb = parseTs(b.due_date)?.getTime() ?? Infinity
  if (ta !== tb) return ta - tb
  return (parseTs(a.created_at)?.getTime() ?? 0) - (parseTs(b.created_at)?.getTime() ?? 0)
}

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
const COLOUR_NAMES = ['Red', 'Orange', 'Amber', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Slate']
const tint = (hex: string, a: number) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex
}


const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const

// What the page opens on: the saved default view and names, the user's default
// outlet, and the team-member defaults (assigned to me / home outlet).
// assignee: the user's saved default assignee filter ('*' = anyone, 'me', or a
// team member's user id); without one, team members start on "assigned to me".
type StartPrefs = { view: ViewMode | null; names: Record<string, string>; outlet: string | null; mine: boolean; homeOutlet: string | null; assignee?: string | null }
const EMPTY_PREFS: StartPrefs = { view: null, names: {}, outlet: null, mine: false, homeOutlet: null, assignee: null }
const startOutlet = (p?: StartPrefs | null) => (p ? p.outlet || p.homeOutlet || null : null)
const ANYONE = '*'
const startAssignee = (p?: StartPrefs | null): string[] =>
  !p ? [] : p.assignee ? (p.assignee === ANYONE ? [] : [p.assignee]) : (p.mine ? ['me'] : [])

export default function TasksPage() {
  const router = useRouter()
  // Seed identity + the last task list from cache so a revisit paints instantly
  // instead of blanking to a skeleton while the company re-resolves and refetches.
  const seed = peekCompanyUser()
  const seededTasks = seed?.companyId ? readCache<any[]>(`tasks:${seed.companyId}`) : undefined
  const seedPrefs = seed?.companyId ? readCache<StartPrefs>(`tasks:prefs:${seed.companyId}`) : undefined
  const [loading, setLoading] = useState(!seededTasks)
  // The page only shows once the saved view and filters are known, so it opens
  // straight on the final screen instead of List → Timeline → filtered.
  const [prefsReady, setPrefsReady] = useState(!!seedPrefs)
  const prefsRef = useRef<StartPrefs | null>(seedPrefs ?? null)
  const [companyId, setCompanyId] = useState<string | null>(seed?.companyId ?? null)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState('')
  const [tasks, setTasks] = useState<any[]>(seededTasks ?? [])
  // Latest tasks for saves fired from a timer or an older render's closure.
  const tasksRef = useRef<any[]>(tasks)
  tasksRef.current = tasks
  // Edits still saving, re-applied over every refetch (see lib/task-pending).
  const pendingRef = useRef<PendingWrites>(new Map())
  const writeChainsRef = useRef<WriteChains>(new Map())
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [team, setTeam] = useState<any[]>([])
  const userIdRef = useRef<string | null>(null)

  const [bucket, setBucket] = useState<Bucket>('today')
  const [bucketDate, setBucketDate] = useState('')   // for the "Date" bucket
  // Repeating tasks: fold missed and later copies (see lib/task-fold) unless the
  // user asks to see every copy.
  const [showAllRepeats, setShowAllRepeats] = useState(false)
  // How far ahead Upcoming / back Completed reaches; "Show more" adds a month.
  const [upcomingDays, setUpcomingDays] = useState(30)
  const [completedDays, setCompletedDays] = useState(30)
  useEffect(() => { setUpcomingDays(30); setCompletedDays(30) }, [bucket])
  const [view, setView] = useState<ViewMode>(seedPrefs?.view || 'list')
  // Per-user view preferences: a saved default view (applied wherever they sign
  // in, incl. mobile) and custom names — set via right-clicking a view tab.
  const VIEW_LABELS: Record<ViewMode, string> = { list: 'List', board: 'Board', timeline: 'Timeline', calendar: 'Calendar' }
  const [viewNames, setViewNames] = useState<Record<string, string>>(seedPrefs?.names || {})
  const [defaultView, setDefaultView] = useState<ViewMode | null>(seedPrefs?.view ?? null)
  const [viewMenu, setViewMenu] = useState<{ view: ViewMode; x: number; y: number } | null>(null)
  const [defaultOutlet, setDefaultOutlet] = useState<string | null>(seedPrefs?.outlet ?? null)
  const [outletMenu, setOutletMenu] = useState<{ x: number; y: number; value: string } | null>(null)
  const [defaultAssignee, setDefaultAssignee] = useState<string | null>(seedPrefs?.assignee ?? null)
  const [assigneeMenu, setAssigneeMenu] = useState<{ x: number; y: number; value: string } | null>(null)
  const labelOf = (v: ViewMode) => viewNames[v] || VIEW_LABELS[v]
  const dfltDot: React.CSSProperties = { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)', marginLeft: -1, verticalAlign: 'middle', flexShrink: 0 }
  const viewMenuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

  const setDefaultOutletPref = (id: string | null) => {
    setDefaultOutlet(id)
    savePrefs({ outlet: id })
    if (id) setOutletFilter([id]); else setOutletFilter([])
    if (companyId && userId) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, companyId, key: 'default_outlet', value: { id } }) }).catch(() => {})
    setOutletMenu(null)
  }

  // The assignee filter the user starts on (right-click a person, "Assigned to
  // me" or "Anyone"). Saved to their account like the default outlet.
  const setDefaultAssigneePref = (v: string | null) => {
    setDefaultAssignee(v)
    savePrefs({ assignee: v })
    setAssigneeFilter(startAssignee({ ...EMPTY_PREFS, ...(prefsRef.current || {}), assignee: v }))
    if (companyId && userId) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, companyId, key: 'default_assignee', value: { value: v } }) }).catch(() => {})
    setAssigneeMenu(null)
  }

  const persistViewPrefs = (names: Record<string, string>, dflt: ViewMode | null) => {
    const payload = { names, defaultView: dflt }
    savePrefs({ names, view: dflt })
    if (companyId && userId) {
      authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, companyId, key: 'tasks_view', value: payload }) }).catch(() => {})
    }
  }
  const openViewMenu = (e: React.MouseEvent, v: ViewMode) => {
    e.preventDefault()
    const x = Math.min(e.clientX, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 210)
    setViewMenu({ view: v, x, y: e.clientY })
  }
  const renameView = (v: ViewMode) => {
    const name = prompt('Rename view', labelOf(v))
    setViewMenu(null)
    if (name == null) return
    const trimmed = name.trim()
    const next = { ...viewNames }
    if (!trimmed || trimmed === VIEW_LABELS[v]) delete next[v]; else next[v] = trimmed
    setViewNames(next); persistViewPrefs(next, defaultView)
  }
  const makeDefaultView = (v: ViewMode) => { setDefaultView(v); persistViewPrefs(viewNames, v); setViewMenu(null) }
  const clearDefaultView = () => { setDefaultView(null); persistViewPrefs(viewNames, null); setViewMenu(null) }
  useEffect(() => {
    if (!viewMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMenu])

  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>(startAssignee(seedPrefs))  // [] = anyone; else match any
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])  // [] = any priority
  const [colorFilter, setColorFilter] = useState<string[]>([])        // [] = any colour ('' = no colour)
  const [outletFilter, setOutletFilter] = useState<string[]>(startOutlet(seedPrefs) ? [startOutlet(seedPrefs)!] : [])  // [] = all outlets; else match any
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

  // Apply saved start-up prefs in one go. With `prev` (what's already on screen)
  // only the parts whose saved default actually changed are touched, so a
  // background refresh never yanks the view or filters around.
  const applyPrefs = (p: StartPrefs, prev: StartPrefs | null) => {
    setViewNames(p.names || {}); setDefaultView(p.view || null); setDefaultOutlet(p.outlet || null); setDefaultAssignee(p.assignee || null)
    if (!prev || prev.view !== p.view) setView(p.view || 'list')
    if (!prev || startOutlet(prev) !== startOutlet(p)) { const o = startOutlet(p); setOutletFilter(o ? [o] : []) }
    if (!prev || startAssignee(prev).join() !== startAssignee(p).join()) setAssigneeFilter(startAssignee(p))
    prefsRef.current = p
  }
  const savePrefs = (patch: Partial<StartPrefs>) => {
    const cid = companyId; if (!cid) return
    const next: StartPrefs = { ...EMPTY_PREFS, ...(prefsRef.current || {}), ...patch }
    prefsRef.current = next
    writeCache(`tasks:prefs:${cid}`, next)
    writeLocal('tasks-prefs', userIdRef.current, cid, next)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUserId(session.user.id)
          setMe(session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Me')
        }
        userIdRef.current = session?.user?.id || null
        // Paint the last task list seen on this device (survives a reload) and
        // start refreshing it straight away, before the workspace lookup.
        let started: string | null = companyId && seededTasks ? companyId : null
        if (started) loadTasks(started)
        else {
          const cached = readLocal<any[]>('tasks', session?.user?.id)
          if (cached) {
            started = cached.companyId
            setCompanyId(started); setTasks(cached.data || []); setLoading(false)
            const cc = readLocal<Record<string, any>>('tasks-convs', session?.user?.id)
            if (cc && cc.companyId === started) setConvs(cc.data || {})
            const cp = readLocal<StartPrefs>('tasks-prefs', session?.user?.id)
            if (cp && cp.companyId === started) { applyPrefs(cp.data, null); setPrefsReady(true) }
            loadTasks(started)
          }
        }
        let cid: string | null = (await resolveCompanyUser()).companyId
        if (!cid && session?.user) {
          const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
          if (mem?.length) cid = mem[0].company_id
        }
        if (!cid) { setLoading(false); setPrefsReady(true); return }
        if (cid !== started) {
          // First visit on this device, or a different workspace — start clean.
          prefsRef.current = null; setPrefsReady(false); setLoading(true)
          setCompanyId(cid); setTasks([])
          loadTasks(cid)
        }

        const members: any[] = []
        const uid = session?.user?.id
        // Saved view/outlet prefs, the owner and the staff all load together
        // (staff only: board visitors can't be assigned, and on a busy board
        // they'd crowd staff out of one read).
        const [savedPrefs, { data: co }, tm] = await Promise.all([
          uid ? authFetch(`/api/user-prefs?userId=${uid}&companyId=${cid}`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
          (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle(),
          loadStaffRows(supabase, cid).catch(() => []),
        ])
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
        // everything (no defaults). A saved default outlet wins over the home one.
        const myMembership = (tm || []).find((m: any) => (m.user_id || m.id) === uid && (!m.company_id || m.company_id === cid))
        const isMember = !!(uid && co?.owner_id !== uid && myMembership)
        let tv: any = savedPrefs?.prefs?.tasks_view
        if (!savedPrefs) { try { tv = JSON.parse(localStorage.getItem(`tasks:viewPrefs:${cid}:${uid}`) || 'null') } catch {} }
        const dv = savedPrefs?.prefs?.default_outlet
        const da = savedPrefs?.prefs?.default_assignee
        const fresh: StartPrefs = savedPrefs || !prefsRef.current
          ? { view: tv?.defaultView || null, names: (tv?.names && typeof tv.names === 'object') ? tv.names : {}, outlet: (dv && typeof dv === 'object' && dv.id) || null, mine: isMember, homeOutlet: isMember ? (myMembership.default_location_id || null) : null, assignee: (da && typeof da === 'object' && typeof da.value === 'string' && da.value) || null }
          : { ...prefsRef.current, mine: isMember, homeOutlet: isMember ? (myMembership.default_location_id || null) : null }
        applyPrefs(fresh, prefsRef.current)
        setPrefsReady(true)
        writeCache(`tasks:prefs:${cid}`, fresh)
        writeLocal('tasks-prefs', uid, cid, fresh)

        // Outlets load in the background too — not needed for the first paint.
        ;(async () => {
          try {
            const { data: locs } = await (supabase as any).from('company_locations')
              .select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })
            setOutlets(locs || [])
          } catch {}
        })()
      } catch { setLoading(false); setPrefsReady(true) }
    })()
  }, [])

  // Deep links from the Calendar page:
  //   ?date=YYYY-MM-DD  → jump the list to that day (so "Open in Tasks" on a
  //                       Monday task lands on Monday, not today)
  //   ?task=<id>        → open that task's detail
  //   ?new=1&title=&date= → open the New task drawer, prefilled
  //   ?bucket=overdue|today|upcoming → open on that tab (dashboard tiles)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const date = p.get('date')
    const task = p.get('task')
    const isNew = p.get('new')
    const tab = p.get('bucket')
    if (tab && ['overdue', 'today', 'upcoming'].includes(tab)) setBucket(tab as Bucket)
    if (date) { setBucket('date' as Bucket); setBucketDate(date) }
    if (task) setSelectedId(task)
    if (isNew) {
      setShowNew(true)
      setNewTaskSeed({ title: p.get('title') || '', due: date || '' })
    }
    // Tidy the URL so a refresh doesn't reopen the drawer / re-jump.
    if (date || task || isNew || tab) {
      try { window.history.replaceState({}, '', '/admin/tasks') } catch {}
    }
  }, [])

  const loadTasks = useCallback(async (cid: string) => {
    const startedAt = Date.now()
    // Fetch ALL tasks in pages — a single .limit(1000) truncated busy boards
    // (recurring series pre-generate up to 60 dated rows each), so the oldest
    // occurrences silently dropped off the board. Page until a short page or a
    // safety cap.
    // The first page also returns the total, so the rest are fetched in parallel
    // rather than one after another.
    const fetchAllTasks = async (cols: string) => {
      const PAGE = 1000, MAX = 8000
      const page = (offset: number, count?: boolean) => (supabase as any).from('conversation_tasks')
        .select(cols, count ? { count: 'exact' } : undefined).eq('company_id', cid).order('created_at', { ascending: false }).range(offset, offset + PAGE - 1)
      const first = await page(0, true)
      if (first.error) return { data: [], error: first.error }
      let all: any[] = first.data || []
      const total = Math.min(first.count ?? all.length, MAX)
      if (all.length === PAGE && total > PAGE) {
        const offsets: number[] = []
        for (let o = PAGE; o < total; o += PAGE) offsets.push(o)
        const rest = await Promise.all(offsets.map(o => page(o)))
        for (const r of rest) { if (r.error) return { data: all, error: null }; all = all.concat(r.data || []) }
      }
      return { data: all, error: null }
    }
    // The calendar items load alongside the tasks instead of after them.
    const calFrom = new Date(); calFrom.setMonth(calFrom.getMonth() - 6)
    const calTo = new Date(); calTo.setMonth(calTo.getMonth() + 12)
    const calendarReq = authFetch(`/api/calendar?${new URLSearchParams({ companyId: cid, from: calFrom.toISOString(), to: calTo.toISOString() })}`)
      .then(r => r.json()).catch(() => null)
    let data: any[] | null = null
    const full = await fetchAllTasks('*')
    if (full.error) {
      const base = await fetchAllTasks('id, conversation_id, company_id, text, done, assigned_to, assigned_to_id, due_date, created_at')
      data = base.data
    } else data = full.data
    let rows: any[] = overlayPending(data || [], pendingRef.current, startedAt)

    // Paint the real tasks immediately, before the (slower) calendar merge and
    // conversation enrichment — so the list shows up straight away. On a refetch,
    // KEEP the already-merged calendar tasks visible so they don't blink out
    // (which looked like recurring tasks "disappearing" until a full reload).
    setTasks(prev => { const cal = (prev || []).filter((t: any) => t._source === 'calendar'); return cal.length ? [...rows, ...cal] : rows })
    setLoading(false)

    // Everything scheduled on the Calendar — deliveries, appointments,
    // bookings, pickups and calendar-native tasks — is real work too, but it
    // lives in calendar_events, so the Tasks page never saw it. Pull it all in
    // and shape it like tasks, tagged with its event type. Each keeps a marker
    // so edits route back to the calendar rather than trying to write a
    // conversation_tasks row that doesn't exist.
    try {
      const d = await calendarReq
      if (!d) throw new Error('calendar unavailable')
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
        checklist: Array.isArray(e.checklist) ? e.checklist : [],
        description: e.description ?? '',
        cover_image: e.cover_image ?? null,
        sort_order: e.sort_order ?? null,
        linked_notes: Array.isArray(e.linked_notes) ? e.linked_notes : [],
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

    rows = overlayPending(rows, pendingRef.current, startedAt)
    setTasks(rows)
    writeCache(`tasks:${cid}`, rows)
    writeLocal('tasks', userIdRef.current, cid, rows)

    const convIds = Array.from(new Set(rows.map((t: any) => t.conversation_id).filter(Boolean)))
    if (convIds.length) {
      const m: Record<string, any> = {}
      const contactIds = new Set<string>()
      const chunks = (arr: string[]) => { const out: string[][] = []; for (let i = 0; i < arr.length; i += 100) out.push(arr.slice(i, i + 100)); return out }
      // conversations has no contact_name column — the customer's name lives on
      // contacts (via contact_id), so pull the id here and resolve names below.
      const convRes = await Promise.all(chunks(convIds as string[]).map(ids => (supabase as any).from('conversations')
        .select('id, subject, contact_id, channel').in('id', ids)))
      for (const { data: cs } of convRes) for (const c of (cs || [])) { m[c.id] = c; if (c.contact_id) contactIds.add(c.contact_id) }
      const names: Record<string, string> = {}
      const ctRes = await Promise.all(chunks(Array.from(contactIds)).map(ids => (supabase as any).from('contacts')
        .select('id, name').in('id', ids)))
      for (const { data: cts } of ctRes) for (const ct of (cts || [])) names[ct.id] = ct.name
      for (const id in m) { const cid = m[id].contact_id; if (cid && names[cid]) m[id].contact_name = names[cid] }
      setConvs(m)
      writeLocal('tasks-convs', userIdRef.current, cid, m)
    }
  }, [])

  // Live updates — refetch when tasks change in Supabase (this device or another,
  // a teammate, or the recurring generator), and when the tab regains focus, so
  // the board stays current without a manual reload. Debounced to coalesce bursts.
  useEffect(() => {
    if (!companyId) return
    let t: any
    const bump = () => { clearTimeout(t); t = setTimeout(() => loadTasks(companyId), 400) }
    let ch: any
    try {
      ch = (supabase as any).channel(`tasks-live-${companyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_tasks', filter: `company_id=eq.${companyId}` }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `company_id=eq.${companyId}` }, bump)
        .subscribe()
    } catch { /* realtime not enabled — the focus refetch below still keeps it fresh */ }
    const onVis = () => { if (document.visibilityState === 'visible') bump() }
    window.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      clearTimeout(t)
      try { (supabase as any).removeChannel(ch) } catch {}
      window.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [companyId, loadTasks])

  const statusOf = (t: any): string => t.status || (t.done ? 'done' : 'todo')
  const isDone = (t: any) => statusOf(t) === 'done'

  const assignedToMe = useCallback((t: any) => {
    if (t.assigned_to_id && t.assigned_to_id === userId) return true
    if (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === userId)) return true
    if (Array.isArray(t.mentions) && t.mentions.some((a: any) => a.id === userId)) return true
    // A task you created is your work too — so a task you add (e.g. from the
    // inbox, often left unassigned) still surfaces under the default
    // "Assigned to me" view instead of vanishing until you switch to "All".
    if (t.created_by_id && t.created_by_id === userId) return true
    return false
  }, [userId])

  const dayOf = (t: any): number | null => { const p = parseTs(t.due_date); return p ? startOfDay(p).getTime() : null }
  const fold = useMemo(() => foldRepeats(tasks, { today: startOfDay(new Date()).getTime(), dayOf, isClosed: isDone }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks])
  // Folded away for this bucket? Older missed copies everywhere; copies after
  // the next one in Upcoming / All (the Day, Week, Month and Date views still
  // list every copy, since those are about a span of days).
  const folded = useCallback((t: any, b: Bucket) => {
    if (showAllRepeats) return false
    if (fold.missedHidden.has(t.id)) return true
    return (b === 'upcoming' || b === 'all') && fold.laterHidden.has(t.id)
  }, [fold, showAllRepeats])

  // Every filter except the bucket — shared by the counts and the list, so a
  // chip's number always matches what its list holds.
  const passesFilters = useCallback((t: any, q: string, dateRange: { start: number; end: number } | null) => {
    if (assigneeFilter.length) {
      const ok = assigneeFilter.some(a => a === 'me' ? assignedToMe(t) : (t.assigned_to_id === a || (Array.isArray(t.assignees) && t.assignees.some((x: any) => x.id === a))))
      if (!ok) return false
    }
    if (priorityFilter.length && !priorityFilter.includes(t.priority || 'normal')) return false
    if (colorFilter.length && !colorFilter.includes(t.color || '')) return false
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
  }, [assigneeFilter, priorityFilter, colorFilter, outletFilter, dateFilter, assignedToMe])

  // The "Due in" filter's window around its reference date.
  const dateRange = useMemo(() => {
    if (!dateFilter) return null
    const ref = new Date(dateFilter + 'T00:00:00')
    if (isNaN(ref.getTime())) return null
    if (datePeriod === 'day') {
      const s = new Date(ref); const e = new Date(ref); e.setDate(e.getDate() + 1)
      return { start: s.getTime(), end: e.getTime() }
    }
    if (datePeriod === 'week') {
      const s = new Date(ref); s.setDate(s.getDate() - s.getDay())   // Sunday
      const e = new Date(s); e.setDate(e.getDate() + 7)
      return { start: s.getTime(), end: e.getTime() }
    }
    return { start: new Date(ref.getFullYear(), ref.getMonth(), 1).getTime(), end: new Date(ref.getFullYear(), ref.getMonth() + 1, 1).getTime() }
  }, [dateFilter, datePeriod])

  // Which bucket a task belongs to, plus the period buckets it falls in.
  const bucketOf = (t: any, today: number, wk: { start: number; end: number }, mo: { start: number; end: number }) => {
    if (isDone(t)) return { main: 'completed' as const, day: false, week: false, month: false }
    const due = parseTs(t.due_date)
    // An undated task counts as "Today" so freshly-added tasks surface there.
    if (!due) return { main: 'today' as const, day: false, week: false, month: false }
    const dTime = due.getTime()
    const d = startOfDay(due).getTime()
    return {
      main: d < today ? 'overdue' as const : d === today ? 'today' as const : 'upcoming' as const,
      day: d === today, week: dTime >= wk.start && dTime < wk.end, month: dTime >= mo.start && dTime < mo.end,
    }
  }

  const counts = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now).getTime()
    const wk = periodRange(now, 'week'); const mo = periodRange(now, 'month')
    const q = search.trim().toLowerCase()
    const c = { today: 0, overdue: 0, upcoming: 0, completed: 0, all: 0, day: 0, week: 0, month: 0, foldedMissed: 0 }
    for (const t of tasks) {
      if (!passesFilters(t, q, dateRange)) continue
      if (!showAllRepeats && fold.missedHidden.has(t.id)) { c.foldedMissed++; continue }
      const b = bucketOf(t, today, wk, mo)
      const later = !showAllRepeats && fold.laterHidden.has(t.id)
      if (!later) { c.all++; c[b.main]++ }
      if (b.day) c.day++
      if (b.week) c.week++
      if (b.month) c.month++
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, passesFilters, dateRange, search, fold, showAllRepeats])

  // When a task was finished (for the Completed list's order and headings).
  const doneAt = (t: any): number | null => (parseTs(t.completed_at) || parseTs(t.due_date))?.getTime() ?? null

  const listing = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now).getTime()
    const wk = periodRange(now, 'week'); const mo = periodRange(now, 'month')
    const q = search.trim().toLowerCase()
    const upTo = today + (upcomingDays + 1) * 86400000
    const backTo = today - completedDays * 86400000
    let more = 0, moreFrom: number | null = null
    let list = tasks.filter(t => {
      if (!passesFilters(t, q, dateRange)) return false
      if (folded(t, bucket)) return false
      if (bucket === 'all') return true
      const b = bucketOf(t, today, wk, mo)
      if (bucket === 'today' || bucket === 'overdue' || bucket === 'upcoming' || bucket === 'completed') { if (b.main !== bucket) return false }
      else if (bucket === 'day') { if (!b.day) return false }
      else if (bucket === 'week') { if (!b.week) return false }
      else if (bucket === 'month') { if (!b.month) return false }
      else if (bucket === 'date') {
        const dTime = parseTs(t.due_date)?.getTime()
        if (!bucketDate || dTime == null || isDone(t)) return false
        const r = periodRange(new Date(bucketDate + 'T00:00:00'), 'day')
        if (dTime < r.start || dTime >= r.end) return false
      }
      // Upcoming shows the next month and Completed the last month; the rest
      // is a "Show more" away, so a long-running board stays quick to read.
      if (bucket === 'upcoming') {
        const d = dayOf(t)
        if (d != null && d >= upTo) { more++; if (moreFrom == null || d < moreFrom) moreFrom = d; return false }
      }
      if (bucket === 'completed') {
        const d = doneAt(t)
        if (d != null && d < backTo) { more++; return false }
      }
      return true
    })
    list = [...list].sort((a, b) => {
      // Completed tasks always sink to the bottom, whatever the sort.
      const dr = (isDoneT(a) ? 1 : 0) - (isDoneT(b) ? 1 : 0)
      if (dr) return dr
      if (sortBy === 'priority') { const rank = (p: string) => ({ high: 0, normal: 1, low: 2 } as any)[p || 'normal']; return rank(a.priority) - rank(b.priority) }
      if (sortBy === 'created') return (parseTs(b.created_at)?.getTime() || 0) - (parseTs(a.created_at)?.getTime() || 0)
      // Due date: newest finished first in Completed; otherwise by day, then
      // the order set by dragging within a day, then the time.
      if (bucket === 'completed' || (isDoneT(a) && isDoneT(b))) return (doneAt(b) ?? 0) - (doneAt(a) ?? 0)
      const ka = dayOf(a) ?? Infinity, kb = dayOf(b) ?? Infinity
      if (ka !== kb) return ka - kb
      const sa = a.sort_order == null ? Infinity : a.sort_order
      const sb = b.sort_order == null ? Infinity : b.sort_order
      if (sa !== sb) return sa - sb
      const da = parseTs(a.due_date)?.getTime() ?? Infinity
      const db_ = parseTs(b.due_date)?.getTime() ?? Infinity
      return da - db_
    })
    return { list, more, moreFrom }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, bucket, bucketDate, search, passesFilters, dateRange, sortBy, folded, upcomingDays, completedDays])
  const visible = listing.list

  // Date headings for the list: by due day (by finish day in Completed).
  const groupOf = (t: any): { key: string; label: string; tone: 'overdue' | 'today' | 'plain' | 'done' } => {
    const today = startOfDay(new Date()).getTime()
    if (bucket !== 'completed' && isDone(t)) return { key: 'done', label: 'Completed', tone: 'done' }
    const ms = bucket === 'completed' ? doneAt(t) : dayOf(t)
    if (ms == null) return { key: 'none', label: 'No date', tone: 'plain' }
    const day = startOfDay(new Date(ms))
    const diff = Math.round((day.getTime() - today) / 86400000)
    const long = day.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', ...(day.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
    const label = diff === 0 ? `Today · ${long}` : diff === 1 ? `Tomorrow · ${long}` : diff === -1 ? `Yesterday · ${long}` : long
    return { key: String(day.getTime()), label, tone: bucket === 'completed' ? 'done' : diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'plain' }
  }

  // For the calendar view we want the whole month regardless of the Today/
  // Overdue/… bucket — only the assignee/priority/search filters apply, so a
  // task shows up on its due date no matter which bucket is active.
  const calendarTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (assigneeFilter.length) {
        const ok = assigneeFilter.some(a => a === 'me' ? assignedToMe(t) : (t.assigned_to_id === a || (Array.isArray(t.assignees) && t.assignees.some((x: any) => x.id === a))))
        if (!ok) return false
      }
      if (priorityFilter.length && !priorityFilter.includes(t.priority || 'normal')) return false
      if (colorFilter.length && !colorFilter.includes(t.color || '')) return false
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
  }, [tasks, search, assigneeFilter, priorityFilter, colorFilter, outletFilter, assignedToMe])

  const selected = useMemo(() => tasks.find(t => t.id === selectedId) || null, [tasks, selectedId])

  // Persist a field change (calendar-routing + resilient), WITHOUT touching
  // local state — callers that already updated state optimistically (e.g. the
  // batched drag reorder) use this to avoid a re-render per task.
  const writeTaskFields = (id: string, fields: any): Promise<boolean> => {
    beginWrite(pendingRef.current, id, fields)
    return inOrder(writeChainsRef.current, id, () => saveTaskFields(id, fields))
  }
  const saveTaskFields = async (id: string, fields: any) => {
    const target = tasksRef.current.find(t => t.id === id)
    let ok = false
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
          attachments: fields.attachments !== undefined ? fields.attachments : (target.attachments ?? raw.attachments ?? []),
          checklist: fields.checklist !== undefined ? fields.checklist : (target.checklist ?? raw.checklist ?? []),
          description: fields.description !== undefined ? fields.description : (target.description ?? raw.description ?? null),
          cover_image: fields.cover_image !== undefined ? fields.cover_image : (target.cover_image ?? raw.cover_image ?? null),
          sort_order: fields.sort_order !== undefined ? fields.sort_order : (target.sort_order ?? raw.sort_order ?? null),
          linked_notes: fields.linked_notes !== undefined ? fields.linked_notes : (target.linked_notes ?? raw.linked_notes ?? []),
        }
        const r = await authFetch('/api/calendar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        ok = r.ok
        if (!ok) {
          endWrite(pendingRef.current, id, false)
          alert('Could not save this change.')
          if (companyId) loadTasks(companyId)
        }
      } else {
        // Supabase returns { error } rather than throwing, so a failed write
        // used to pass silently — the change looked saved until the next
        // reload, when it vanished. Check it and say something.
        let payload = { ...fields }
        let { error } = await (supabase as any).from('conversation_tasks').update(payload).eq('id', id)
        // Tolerate a column the DB hasn't had migrated yet (e.g. sort_order
        // before COLVY_V228): drop it and retry so the rest still saves,
        // rather than nagging on every drag.
        for (let attempt = 0; error && attempt < 3; attempt++) {
          const m = /Could not find the '([^']+)'|column "?([a-z_]+)"? .* does not exist/i.exec(error.message || '')
          const bad = m?.[1] || m?.[2]
          if (!bad || !(bad in payload)) break
          delete (payload as any)[bad]
          if (!Object.keys(payload).length) { error = null as any; break }
          ;({ error } = await (supabase as any).from('conversation_tasks').update(payload).eq('id', id))
        }
        ok = !error
        if (error) {
          console.error('[task update] failed', error, fields)
          endWrite(pendingRef.current, id, false)
          alert(`Could not save: ${error.message}`)
          if (companyId) loadTasks(companyId)
        }
      }
    }
    catch (e: any) {
      console.error('[task update] threw', e)
      endWrite(pendingRef.current, id, false)
      if (companyId) loadTasks(companyId)
    }
    if (ok) endWrite(pendingRef.current, id, true)
    return ok
  }
  // Card history — record meaningful changes so each task card shows its own
  // activity trail. Best-effort: if the table isn't migrated yet it stays quiet.
  const logActivity = async (taskId: string, entries: { kind: string; detail: string }[]) => {
    if (!entries.length || !companyId) return
    try {
      await (supabase as any).from('task_activity').insert(entries.map(e => ({
        task_id: taskId, company_id: companyId, actor_id: userId || null, actor_name: me || 'Someone', kind: e.kind, detail: e.detail,
      })))
    } catch { /* table may not be migrated */ }
  }
  // A task that came from a conversation announces its completion back on that
  // conversation — a system event that shows as a pill in the chat stream and a
  // row in the Timeline tab, so the inbox reflects work finished on the Tasks page.
  const announceCompletion = async (task: any) => {
    if (!task?.conversation_id || !companyId) return
    const label = String(task.title || task.text || 'Task').trim().slice(0, 200)
    try {
      await (supabase as any).from('conversation_events').insert({
        conversation_id: task.conversation_id, company_id: companyId,
        event_type: 'task_completed', actor_name: me || 'Someone',
        detail: `Task completed: ${label}`,
      })
    } catch { /* table/columns may lag a migration — non-critical */ }
  }
  const ACT_LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }
  const cap = (s: string) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1)
  const fmtDueShort = (v: any) => { const d = parseTs(v); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' }
  // Build the activity entries for a change. Each `detail` is phrased to follow
  // the actor's name, so the card reads as a sentence — "Amit completed this
  // task", "Amit updated the description" (see the Activity render).
  const diffActivity = (prev: any, fields: any): { kind: string; detail: string }[] => {
    if (!prev) return []
    const out: { kind: string; detail: string }[] = []
    if (fields.status && fields.status !== statusOf(prev))
      out.push({ kind: 'status', detail: fields.status === 'done' ? 'completed this task' : (statusOf(prev) === 'done' ? `reopened this task (${ACT_LABEL[fields.status] || fields.status})` : `moved this to ${ACT_LABEL[fields.status] || fields.status}`) })
    if (fields.assignees !== undefined) {
      const before = (Array.isArray(prev.assignees) ? prev.assignees : []).map((a: any) => a.name).filter(Boolean).sort().join(',')
      const names = (fields.assignees || []).map((a: any) => a.name).filter(Boolean)
      if (names.slice().sort().join(',') !== before) out.push({ kind: 'assignee', detail: names.length ? `assigned this to ${names.join(', ')}` : 'cleared the assignees' })
    }
    if (fields.priority !== undefined && fields.priority !== prev.priority) out.push({ kind: 'priority', detail: fields.priority ? `set the priority to ${cap(fields.priority)}` : 'cleared the priority' })
    if (fields.due_date !== undefined && fields.due_date !== prev.due_date) out.push({ kind: 'due', detail: fields.due_date ? `set the due date to ${fmtDueShort(fields.due_date)}` : 'cleared the due date' })
    if (fields.title !== undefined && (fields.title || '') !== (prev.title || '')) out.push({ kind: 'edit', detail: `renamed this to “${(fields.title || '').slice(0, 60)}”` })
    if ((fields.text !== undefined && (fields.text || '') !== (prev.text || '')) || (fields.description !== undefined && (fields.description || '') !== (prev.description || ''))) out.push({ kind: 'edit', detail: 'updated the description' })
    if (fields.checklist !== undefined) { const c = checklistActivity(prev.checklist, fields.checklist); if (c) out.push({ kind: 'checklist', detail: c }) }
    if (fields.linked_notes !== undefined) { const b = (Array.isArray(prev.linked_notes) ? prev.linked_notes : []).length, a = (fields.linked_notes || []).length; if (a !== b) out.push({ kind: 'edit', detail: a > b ? 'linked a note' : 'unlinked a note' }) }
    if (fields.attachments !== undefined) { const b = (Array.isArray(prev.attachments) ? prev.attachments : []).length, a = (fields.attachments || []).length; if (a !== b) out.push({ kind: 'edit', detail: a > b ? 'added an attachment' : 'removed an attachment' }) }
    if (fields.order_id !== undefined && fields.order_id !== prev.order_id) out.push({ kind: 'edit', detail: fields.order_id ? 'linked an order' : 'removed the linked order' })
    if (fields.location_id !== undefined && fields.location_id !== prev.location_id) out.push({ kind: 'edit', detail: 'changed the location' })
    if (fields.cover_image !== undefined && fields.cover_image !== prev.cover_image) out.push({ kind: 'edit', detail: fields.cover_image ? 'changed the cover image' : 'removed the cover image' })
    if (fields.color !== undefined && fields.color !== prev.color) out.push({ kind: 'edit', detail: 'changed the colour' })
    return out
  }

  const patchTask = async (id: string, fields: any) => {
    const prev = tasksRef.current.find(t => t.id === id)
    setTasks(cur => cur.map(t => t.id === id ? { ...t, ...fields } : t))
    if (!await writeTaskFields(id, fields)) return
    logActivity(id, diffActivity(prev, fields))
    if (fields.status === 'done' && prev && statusOf(prev) !== 'done') announceCompletion(prev)
  }
  const setStatus = (t: any, status: string) =>
    patchTask(t.id, { status, done: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null })

  // Drag reorder from the Timeline: `orderedIds` is the target day's new order.
  // Each gets a fresh sort_order; the moved task also picks up the target date
  // (so cross-day drags reschedule). Persists per task via patchTask, which
  // routes native tasks and calendar-sourced rows to the right place.
  const reorderDay = (movedId: string, targetYmd: string, orderedIds: string[]) => {
    const newDue = targetYmd ? dueFromInput(targetYmd) : null
    // One optimistic state update for the whole day, so the list reflows once
    // and stays smooth instead of jumping per task.
    setTasks(cur => cur.map(t => {
      const idx = orderedIds.indexOf(t.id)
      if (idx < 0) return t
      const upd: any = { sort_order: idx * 1000 }
      if (t.id === movedId) upd.due_date = newDue
      return { ...t, ...upd }
    }))
    // Persist in the background (no extra re-renders).
    orderedIds.forEach((id, i) => {
      const fields: any = { sort_order: i * 1000 }
      if (id === movedId) fields.due_date = newDue
      writeTaskFields(id, fields)
    })
  }

  // Bulk actions operate on real conversation_tasks only — calendar-sourced rows
  // (id "cal:…") live elsewhere and are silently skipped.
  const realSelectedIds = () => Array.from(selectedIds).filter(id => !String(id).startsWith('cal:'))
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const bulkDelete = async () => {
    const ids = realSelectedIds()
    if (!ids.length) return
    if (!await confirmDialog(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return
    try { await (supabase as any).from('conversation_tasks').delete().in('id', ids) } catch (e: any) { alert('Could not delete: ' + e.message); return }
    if (selectedId && ids.includes(selectedId)) setSelectedId(null)
    exitSelect()
    if (companyId) loadTasks(companyId)
  }
  const bulkStatus = async (status: string) => {
    const ids = realSelectedIds()
    if (!ids.length) return
    try { await (supabase as any).from('conversation_tasks').update({ status, done: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null }).in('id', ids) } catch (e: any) { alert('Could not update: ' + e.message); return }
    ids.forEach(id => logActivity(id, [{ kind: 'status', detail: status === 'done' ? 'completed this task' : `moved this to ${ACT_LABEL[status] || status}` }]))
    if (status === 'done') ids.forEach(id => { const t = tasks.find(x => x.id === id); if (t && statusOf(t) !== 'done') announceCompletion(t) })
    exitSelect()
    if (companyId) loadTasks(companyId)
  }
  const bulkPriority = async (priority: string) => {
    const ids = realSelectedIds()
    if (!ids.length) return
    try { await (supabase as any).from('conversation_tasks').update({ priority }).in('id', ids) } catch (e: any) { alert('Could not update: ' + e.message); return }
    ids.forEach(id => logActivity(id, [{ kind: 'priority', detail: priority ? `set the priority to ${cap(priority)}` : 'cleared the priority' }]))
    exitSelect()
    if (companyId) loadTasks(companyId)
  }

  // Apply an edit to a whole recurring series. scope: 'this' | 'following' | 'all'.
  // Falls back to a single-row patch when the task isn't part of a series.
  const patchScoped = async (task: any, fields: any, scope?: string) => {
    if (!task.series_id || !scope || scope === 'this' || task._source === 'calendar') {
      return patchTask(task.id, fields)
    }
    const inScope = (t: any) => t.series_id === task.series_id &&
      !(scope === 'following' && parseTs(t.due_date) && parseTs(task.due_date) && (parseTs(t.due_date)! < parseTs(task.due_date)!))
    const before = tasksRef.current.find(t => t.id === task.id) || task
    const affected = tasksRef.current.filter(inScope).map(t => t.id)
    // Optimistic local update across the affected rows.
    setTasks(cur => cur.map(t => inScope(t) ? { ...t, ...fields } : t))
    affected.forEach(id => beginWrite(pendingRef.current, id, fields))
    // Queued behind any save still running for this task (see lib/task-pending).
    await inOrder(writeChainsRef.current, task.id, async () => {
      let ok = false
      try {
        let payload = { ...fields }
        const runScoped = () => {
          let q = (supabase as any).from('conversation_tasks').update(payload).eq('series_id', task.series_id)
          if (scope === 'following' && task.due_date) q = q.gte('due_date', task.due_date)
          return q
        }
        let { error } = await runScoped()
        // Strip a column the DB hasn't migrated yet (e.g. description before
        // COLVY_V230) and retry, so one missing field can't revert the whole
        // series edit.
        for (let attempt = 0; error && attempt < 3; attempt++) {
          const m = /Could not find the '([^']+)'|column "?([a-z_]+)"? .* does not exist/i.exec(error.message || '')
          const bad = m?.[1] || m?.[2]
          if (!bad || !(bad in payload)) break
          delete (payload as any)[bad]
          if (!Object.keys(payload).length) { error = null as any; break }
          ;({ error } = await runScoped())
        }
        ok = !error
        if (error) { console.error('[task scoped update] failed', error); affected.forEach(id => endWrite(pendingRef.current, id, false)); if (companyId) loadTasks(companyId) }
        else {
          affected.forEach(id => endWrite(pendingRef.current, id, true))
          // Record the change on every occurrence the edit touched, so a
          // series-wide completion (or reschedule, priority change, …) shows up in
          // each card's Activity — not just single-occurrence edits.
          const entries = diffActivity(before, fields)
          if (entries.length) {
            affected.forEach(id => logActivity(id, entries))
            if (fields.status === 'done') affected.forEach(id => { const t = tasks.find(x => x.id === id); if (t && statusOf(t) !== 'done') announceCompletion(t) })
          }
        }
      } catch (e) {
        console.error('[task scoped update] threw', e)
        if (!ok) affected.forEach(id => endWrite(pendingRef.current, id, false))
        if (companyId) loadTasks(companyId)
      }
    })
  }

  // Remove missed copies of repeating tasks (past copies nobody ticked off).
  // The series carries on; only the stale past copies go.
  const removeTaskIds = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await (supabase as any).from('conversation_tasks').delete().in('id', ids.slice(i, i + 200))
      if (error) throw error
    }
    const gone = new Set(ids)
    setTasks(prev => prev.filter(t => !gone.has(t.id)))
  }
  const clearMissed = async (t: any) => {
    const ids = fold.missedOf.get(t.id) || []
    if (!ids.length) return
    if (!await confirmDialog({ title: 'Clear missed copies?', message: `Remove ${ids.length} missed ${ids.length === 1 ? 'copy' : 'copies'} of “${t.title || t.text}”? It keeps repeating — only past copies nobody ticked off are removed.`, confirmLabel: 'Clear', tone: 'danger' })) return
    try { await removeTaskIds(ids) } catch (e: any) { alert('Could not clear: ' + (e?.message || e)) }
  }
  const clearAllMissed = async () => {
    const q = search.trim().toLowerCase()
    const ids = tasks.filter(t => fold.missedHidden.has(t.id) && passesFilters(t, q, dateRange)).map(t => t.id)
    if (!ids.length) return
    if (!await confirmDialog({ title: 'Clear all missed copies?', message: `Remove ${ids.length} missed ${ids.length === 1 ? 'copy' : 'copies'} of repeating tasks? Each task keeps repeating, and its latest copy stays — only older copies nobody ticked off are removed.`, confirmLabel: 'Clear all', tone: 'danger' })) return
    try { await removeTaskIds(ids) } catch (e: any) { alert('Could not clear: ' + (e?.message || e)) }
  }

  // Delete a task, or a scoped slice of its series.
  const deleteScoped = async (task: any, scope?: string) => {
    if (task._source === 'calendar') {
      await authFetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete', id: task._calendarId }) })
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

  if (loading || !prefsReady) return <div style={{ padding: 20 }}><SkeletonList rows={7} /></div>

  const BUCKETS: { key: Bucket; label: string; n: number }[] = [
    { key: 'today', label: 'Today', n: counts.today },
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
        .day-head { display: flex; align-items: center; gap: 8px; margin: 18px 2px 9px; font-size: 14px; font-weight: 700; color: var(--ink); }
        .day-head .n { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .day-head::after { content: ''; flex: 1; height: 1px; background: #ececef; }
        .day-head.overdue { color: #b91c1c; } .day-head.overdue .n { background: #fee2e2; }
        .day-head.today { color: var(--coral); } .day-head.today .n { background: var(--peach); }
        .day-head.done { color: #15803d; } .day-head.done .n { background: #dcfce7; }
        .repeat-note { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 12px; border-radius: 16px; background: #ecfeff; border: none; color: #0e7490; font-size: 12.5px; }
        .repeat-note button { border: none; background: #fff; color: #0e7490; font: inherit; font-size: 12.5px; font-weight: 600; height: 30px; padding: 0 12px; border-radius: 999px; cursor: pointer; }
        .repeat-note button.danger { color: #b91c1c; }
        .list-more { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; margin: 14px 0 6px; padding: 12px; border: none; background: #fafafa; border-radius: 16px; font-size: 12.5px; color: var(--slate); }
        .list-more button { border: none; background: #f4f4f5; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; height: 32px; padding: 0 14px; border-radius: 999px; cursor: pointer; }
        .list-more button:hover { background: #ececef; }
        .tasks-top { padding: 22px 24px 14px; border-bottom: 1px solid #ececef; }
        .tasks-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
        .tasks-title-row h1 { font-size: 30px !important; letter-spacing: -0.025em; line-height: 1.1; }
        .tasks-buckets { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
        .tasks-buckets::-webkit-scrollbar { display: none; }
        .bucket-chip { flex-shrink: 0; height: 32px; padding: 0 12px; border-radius: 999px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; border: none; background: #f4f4f5; color: #52525b; display: inline-flex; align-items: center; gap: 7px; transition: background .15s ease, color .15s ease; }
        .bucket-chip::before { display: none; }
        .bucket-chip:hover { background: #ececef; color: #18181b; }
        .bucket-chip.on { background: #18181b; color: #fff; }
        .bucket-n { min-width: 18px; height: 18px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #fff; color: #52525b; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .bucket-chip.on .bucket-n { background: rgba(255,255,255,0.18); color: #fff; }
        .tasks-search { width: 100%; height: 38px; padding: 0 14px 0 38px; border-radius: 999px; border: 1.5px solid transparent; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); box-sizing: border-box; outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .tasks-search::placeholder { color: #a1a1aa; }
        .tasks-search:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .tl-pill { height: 34px; min-width: 34px; padding: 0 12px; border-radius: 999px; border: none; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; transition: background .15s ease; }
        .tl-pill::before { display: none; }
        .tl-pill:hover { background: #ececef; }
        .tl-pill.icon { padding: 0; width: 34px; }
        .tasks-controls { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
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
                /* Segmented tabs: a soft grey track with the current one raised in white. */
        .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: #f4f4f5; }
        .seg button { height: 32px; padding: 0 14px; border: none; border-radius: 999px; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #52525b; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
        .seg button::before { display: none; }
        .seg button:hover { color: #18181b; }
        .seg button.on { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04); }
        .seg button:focus-visible, .ctl:focus-visible, .bucket-chip:focus-visible, .tl-pill:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
        .ctl { height: 38px; padding: 0 14px; border-radius: 999px; border: none; font: inherit; font-size: 13.5px; font-weight: 600; background: #f4f4f5; color: var(--ink); box-sizing: border-box; }
        .ctl::before { display: none; }
        button.ctl:hover { background: #ececef; }
        .ctl.on { background: #18181b; color: #fff; }
        .ctl.set { background: color-mix(in srgb, var(--coral) 12%, #fff); color: color-mix(in srgb, var(--coral) 85%, #000); }
        .tasks-filter-pop .ctl, .tasks-filter-pop .seg { width: 100%; }
        .task-card { border: none; border-radius: 16px; background: #fff; padding: 14px; margin-bottom: 8px; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); transition: box-shadow .15s ease, transform .1s ease; }
        .task-card:hover { box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 6px 18px rgba(16,24,40,.08); }
        .task-card input[type=checkbox] { accent-color: #18181b; }
        .tk-tag { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; line-height: 1; white-space: nowrap; background: #f4f4f5; color: #52525b; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .tk-tag.dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .cal-pill .cal-tick { opacity: 0; transition: opacity 0.12s ease; }
        .cal-pill:hover .cal-tick, .cal-tick.done { opacity: 1; }
        .cal-cell { cursor: pointer; }
        .task-card.sel { box-shadow: 0 0 0 2px var(--coral), 0 6px 18px rgba(16,24,40,.08); }
        /* Timeline per-day "add task" — subtle until you hover the column. */
        .tl-add { opacity: 0.45; transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
        .tl-col:hover .tl-add { opacity: 1; }
        .tl-add:hover { background: #fff; color: var(--coral); border-color: transparent; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
        .board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 16px; height: 100%; box-sizing: border-box; }
        .board-col { background: #f4f4f5; border-radius: 20px; padding: 10px; overflow-y: auto; }
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
          <button className="cv-btn cv-btn-primary" onClick={() => { setShowNew(true); setSelectedId(null) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New task
          </button>
        </div>
        {/* The Timeline is its own continuous day axis — the date buckets don't
            apply there, so hide them and let the timeline scroll through dates. */}
        {view !== 'timeline' && (
        <div className="tasks-buckets">
          {BUCKETS.map(b => (
            <button key={b.key} className={'bucket-chip' + (bucket === b.key ? ' on' : '')} onClick={() => setBucket(b.key)}>
              {b.label}{b.n > 0 && <span className="bucket-n">{b.n}</span>}
            </button>
          ))}
          {/* The "Date" bucket reveals an inline picker to jump to a specific day. */}
          {bucket === 'date' && (
            <input type="date" value={bucketDate} onChange={e => setBucketDate(e.target.value)} className="ctl set"
              style={{ flexShrink: 0, height: 32, padding: '0 12px' }} />
          )}
        </div>
        )}
        <div className="tasks-controls">
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="tasks-search" aria-label="Search tasks" />
          </div>
          {/* Right-click any view tab for: Open, Rename, Make/Remove default.
              A dot marks the view saved as your default. */}
          <div className="seg" title="Right-click a view for options">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} onContextMenu={e => openViewMenu(e, 'list')}>{labelOf('list')}{defaultView === 'list' && <span style={dfltDot} />}</button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')} onContextMenu={e => openViewMenu(e, 'board')}>{labelOf('board')}{defaultView === 'board' && <span style={dfltDot} />}</button>
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')} onContextMenu={e => openViewMenu(e, 'timeline')}>{labelOf('timeline')}{defaultView === 'timeline' && <span style={dfltDot} />}</button>
            {/* Calendar is an in-page view of the tasks (by due date). */}
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')} onContextMenu={e => openViewMenu(e, 'calendar')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {labelOf('calendar')}{defaultView === 'calendar' && <span style={dfltDot} />}
            </button>
          </div>

          {/* Right-click menu for a view tab */}
          {viewMenu && (
            <>
              <div onClick={() => setViewMenu(null)} onContextMenu={e => { e.preventDefault(); setViewMenu(null) }} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
              <div style={{ position: 'fixed', top: viewMenu.y, left: viewMenu.x, zIndex: 401, background: '#fff', borderRadius: 16, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', padding: 6, minWidth: 196 }}>
                <p style={{ margin: '4px 10px 6px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>{labelOf(viewMenu.view)} view</p>
                <button style={viewMenuItem} onClick={() => { setView(viewMenu.view); setViewMenu(null) }}>Open view</button>
                <button style={viewMenuItem} onClick={() => renameView(viewMenu.view)}>Rename view</button>
                {defaultView === viewMenu.view ? (
                  <button style={viewMenuItem} onClick={clearDefaultView}>Remove as default</button>
                ) : (
                  <button style={viewMenuItem} onClick={() => makeDefaultView(viewMenu.view)}>Make this view default</button>
                )}
              </div>
            </>
          )}
          {/* Right-click menu for an outlet — set/clear the user's default outlet. */}
          {outletMenu && (
            <>
              <div onClick={() => setOutletMenu(null)} onContextMenu={e => { e.preventDefault(); setOutletMenu(null) }} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
              <div style={{ position: 'fixed', top: outletMenu.y, left: outletMenu.x, zIndex: 401, background: '#fff', borderRadius: 16, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', padding: 6, minWidth: 200 }}>
                <p style={{ margin: '4px 10px 6px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{outlets.find((o: any) => o.id === outletMenu.value)?.label || outlets.find((o: any) => o.id === outletMenu.value)?.suburb || 'Outlet'}</p>
                {defaultOutlet === outletMenu.value
                  ? <button style={viewMenuItem} onClick={() => setDefaultOutletPref(null)}>Remove as default</button>
                  : <button style={viewMenuItem} onClick={() => setDefaultOutletPref(outletMenu.value)}>Make this my default outlet</button>}
              </div>
            </>
          )}
          {/* Right-click menu for an assignee — set/clear the user's default. */}
          {assigneeMenu && (
            <>
              <div onClick={() => setAssigneeMenu(null)} onContextMenu={e => { e.preventDefault(); setAssigneeMenu(null) }} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
              <div style={{ position: 'fixed', top: assigneeMenu.y, left: assigneeMenu.x, zIndex: 401, background: '#fff', borderRadius: 16, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', padding: 6, minWidth: 200 }}>
                <p style={{ margin: '4px 10px 6px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                  {assigneeMenu.value === ANYONE ? 'Anyone' : assigneeMenu.value === 'me' ? 'Assigned to me' : (team.find((m: any) => m.user_id === assigneeMenu.value)?.name || 'Team member')}
                </p>
                {defaultAssignee === assigneeMenu.value
                  ? <button style={viewMenuItem} onClick={() => setDefaultAssigneePref(null)}>Remove as default</button>
                  : <button style={viewMenuItem} onClick={() => setDefaultAssigneePref(assigneeMenu.value)}>Make this my default</button>}
              </div>
            </>
          )}
          {/* Bulk select — multi-select the list for delete / status / priority. */}
          {view === 'list' && (
            <button className={'ctl' + (selectMode ? ' on' : '')} onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
          {/* Filters live in a top dropdown now (moved off the left rail). */}
          {(() => {
            const activeN = (dateFilter ? 1 : 0) + [assigneeFilter, priorityFilter, colorFilter, outletFilter].filter(a => a.length).length
            return (
              <div style={{ position: 'relative' }}>
                <button className={'ctl' + (activeN > 0 ? ' set' : '')} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>
                  Filters{activeN > 0 ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999, background: 'var(--coral)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{activeN}</span> : null}
                </button>
                {showFilters && (
                  <>
                    <div onClick={() => setShowFilters(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div className="tasks-filter-pop" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 280, maxWidth: '86vw', background: '#fff', borderRadius: 18, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', zIndex: 50, padding: 16 }}>
                      <FilterField label="Outlets" hidden={outlets.length === 0}>
                        <MultiSelect allLabel="All outlets" value={outletFilter} onChange={setOutletFilter}
                          options={outlets.map(o => ({ value: o.id, label: o.label || o.suburb || 'Outlet' }))}
                          defaultValue={defaultOutlet}
                          onItemContext={(v, e) => { e.preventDefault(); setOutletMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: e.clientY, value: v }) }} />
                        {outlets.length > 0 && <p style={{ margin: '6px 2px 0', fontSize: 12, color: '#8e8e93', lineHeight: 1.4 }}>Right-click an outlet to set it as your default.</p>}
                      </FilterField>
                      <FilterField label="Assignee">
                        <MultiSelect allLabel="Anyone" value={assigneeFilter} onChange={setAssigneeFilter}
                          options={[{ value: 'me', label: 'Assigned to me' }, ...team.map((m: any) => ({ value: m.user_id, label: m.name }))]}
                          defaultValue={defaultAssignee} allValue={ANYONE}
                          onItemContext={(v, e) => { e.preventDefault(); setAssigneeMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: e.clientY, value: v }) }} />
                        <p style={{ margin: '6px 2px 0', fontSize: 12, color: '#8e8e93', lineHeight: 1.4 }}>Right-click a person, “Assigned to me” or “Anyone” to set it as your default.</p>
                      </FilterField>
                      <FilterField label="Due in">
                        <div className="seg" style={{ display: 'flex', width: '100%', marginBottom: 8, boxSizing: 'border-box' }}>
                          {(['day', 'week', 'month'] as const).map(p => (
                            <button key={p} className={datePeriod === p ? 'on' : ''} onClick={() => setDatePeriod(p)}
                              style={{ flex: 1, justifyContent: 'center', height: 30, textTransform: 'capitalize' }}>{p}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="date" className="ctl" style={{ ...selectStyle, flex: 1 }} value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
                          {dateFilter && <button className="ctl" onClick={() => setDateFilter('')} style={{ cursor: 'pointer' }}>Clear</button>}
                        </div>
                      </FilterField>
                      <FilterField label="Priority">
                        <MultiSelect allLabel="Any priority" value={priorityFilter} onChange={setPriorityFilter}
                          options={(['high', 'normal', 'low'] as const).map(p => ({ value: p, label: PRIORITY[p].label, color: PRIORITY[p].color }))} />
                      </FilterField>
                      <FilterField label="Colour">
                        <MultiSelect allLabel="Any colour" value={colorFilter} onChange={setColorFilter}
                          options={[{ value: '', label: 'No colour', color: '' }, ...TASK_COLORS.map((c, i) => ({ value: c, label: COLOUR_NAMES[i] || 'Colour', color: c }))]} />
                      </FilterField>
                      <FilterField label="Sort by">
                        <select className="ctl" style={selectStyle} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                          <option value="due">Due date</option><option value="priority">Priority</option><option value="created">Newest</option>
                        </select>
                      </FilterField>
                      {activeN > 0 && (
                        <button className="ctl" onClick={() => { setAssigneeFilter([]); setPriorityFilter([]); setColorFilter([]); setOutletFilter([]); setDateFilter('') }}
                          style={{ width: '100%', marginTop: 6, cursor: 'pointer', color: 'var(--coral)' }}>Clear all filters</button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px 12px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    {col.label}
                    <span style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, background: '#fff', color: '#52525b', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{visible.filter(t => statusOf(t) === col.key).length}</span>
                  </div>
                  {visible.filter(t => statusOf(t) === col.key).map(t => (
                    <TaskCard key={t.id} t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id}
                      onClick={() => { setSelectedId(t.id); setShowNew(false) }} statusOf={statusOf} showStatusButtons onStatus={(s: string) => setStatus(t, s)}
                      missed={showAllRepeats ? 0 : (fold.missedOf.get(t.id)?.length || 0)} onClearMissed={() => clearMissed(t)}
                      later={showAllRepeats || !['upcoming', 'all'].includes(bucket) ? 0 : (fold.laterOf.get(t.id) || 0)} />
                  ))}
                  {visible.filter(t => statusOf(t) === col.key).length === 0 && <p style={{ fontSize: 13, color: '#a1a1aa', textAlign: 'center', padding: 16 }}>Nothing here</p>}
                </div>
              ))}
            </div>
          ) : view === 'timeline' ? (
            <Timeline tasks={calendarTasks} convs={convs} statusOf={statusOf} outlets={outlets}
              onSelect={(id: string) => { setSelectedId(id); setShowNew(false) }} selectedId={selectedId}
              onToggle={(t: any) => setStatus(t, isDone(t) ? 'todo' : 'done')}
              onAdd={(d: Date) => { setNewTaskSeed({ due: localYmd(d) }); setShowNew(true); setSelectedId(null) }}
              onReorder={reorderDay} />
          ) : view === 'calendar' ? (
            <TaskCalendar tasks={calendarTasks} statusOf={statusOf} onSelect={(id: string) => { setSelectedId(id); setShowNew(false) }} onToggle={(t: any) => setStatus(t, isDone(t) ? 'todo' : 'done')} selectedId={selectedId} />
          ) : (
            <div style={{ padding: 16 }}>
              {/* Bulk selection toolbar */}
              {selectMode && (
                <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px 10px 16px', marginBottom: 12, borderRadius: 18, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 6px 18px rgba(16,24,40,.08)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={visible.length > 0 && visible.every(t => selectedIds.has(t.id))}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && !visible.every(t => selectedIds.has(t.id)) }}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(visible.map(t => t.id)) : new Set())}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#18181b' }} />
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
                    <button onClick={bulkDelete} style={{ ...bulkBtn, background: '#fef2f2', color: '#dc2626' }}>Delete</button>
                  </>)}
                </div>
              )}
              {/* Missed copies of repeating tasks are tucked into their latest card. */}
              {(counts.foldedMissed > 0 || showAllRepeats) && ['today', 'overdue', 'all'].includes(bucket) && (
                <div className="repeat-note">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  {showAllRepeats
                    ? <span style={{ flex: 1 }}>Showing every copy of repeating tasks.</span>
                    : <span style={{ flex: 1 }}><b>{counts.foldedMissed}</b> older missed {counts.foldedMissed === 1 ? 'copy' : 'copies'} of repeating tasks {counts.foldedMissed === 1 ? 'is' : 'are'} tucked into the latest card.</span>}
                  <button onClick={() => setShowAllRepeats(v => !v)}>{showAllRepeats ? 'Tuck them away' : 'Show them'}</button>
                  {!showAllRepeats && <button className="danger" onClick={clearAllMissed}>Clear all missed</button>}
                </div>
              )}
              {visible.length === 0 && (() => {
                // The same drifting cards as an empty inbox, worded for what's being looked at.
                const anyFilter = !!search.trim() || !!dateFilter || [assigneeFilter, priorityFilter, colorFilter, outletFilter].some(a => a.length)
                const label = BUCKETS.find(b => b.key === bucket)?.label
                const [title, line] = search.trim() ? ['No matches', `Nothing matches “${search.trim()}”. Try another word from the task.`]
                  : anyFilter ? ['No tasks match these filters', 'Try clearing a filter to see more.']
                  : bucket === 'overdue' ? ['Nothing overdue', 'Tasks past their due date show up here.']
                  : bucket === 'today' ? ['Nothing due today', 'Tasks due today show up here.']
                  : bucket === 'completed' ? ['Nothing finished yet', 'Tasks you tick off show up here.']
                  : [`No tasks in “${label}”${bucket === 'upcoming' && listing.more > 0 ? ` in the next ${upcomingDays} days` : ''}`, 'New tasks show up here.']
                return (
                  <div style={{ paddingTop: 32 }}>
                    <EmptyScroll kinds={['task']} title={title} line={line}
                      action={anyFilter
                        ? <button className="cv-btn" onClick={() => { setSearch(''); setAssigneeFilter([]); setPriorityFilter([]); setColorFilter([]); setOutletFilter([]); setDateFilter('') }}>Clear filters</button>
                        : <button className="cv-btn" onClick={() => { setShowNew(true); setSelectedId(null) }}>New task</button>} />
                  </div>
                )
              })()}
              {(() => {
                // Date headings between days (due-date order only — by priority or
                // newest, days are interleaved so headings would repeat).
                const withHeads = sortBy === 'due'
                const groups = withHeads ? visible.map(groupOf) : []
                const sizes = new Map<string, number>()
                groups.forEach(g => sizes.set(g.key, (sizes.get(g.key) || 0) + 1))
                let last = ''
                const out: React.ReactNode[] = []
                visible.forEach((t, i) => {
                  if (withHeads) {
                    const g = groups[i]
                    if (g.key !== last) {
                      last = g.key
                      out.push(<div key={'h:' + g.key} className={'day-head ' + g.tone}><span>{g.label}</span><span className="n">{sizes.get(g.key)}</span></div>)
                    }
                  }
                  out.push(
                    <TaskCard key={t.id} t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id}
                      selectMode={selectMode} checked={selectedIds.has(t.id)} onSelect={() => toggleSelect(t.id)}
                      onClick={() => { if (selectMode) { toggleSelect(t.id) } else { setSelectedId(t.id); setShowNew(false) } }}
                      statusOf={statusOf} onToggle={() => setStatus(t, isDone(t) ? 'todo' : 'done')}
                      missed={showAllRepeats ? 0 : (fold.missedOf.get(t.id)?.length || 0)} onClearMissed={() => clearMissed(t)}
                      later={showAllRepeats || !['upcoming', 'all'].includes(bucket) ? 0 : (fold.laterOf.get(t.id) || 0)} />
                  )
                })
                return out
              })()}
              {listing.more > 0 && (bucket === 'upcoming' || bucket === 'completed') && (
                <div className="list-more">
                  <span>
                    {bucket === 'upcoming'
                      ? <>{listing.more} more after the next {upcomingDays} days{listing.moreFrom ? <> · next on {new Date(listing.moreFrom).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</> : null}</>
                      : <>{listing.more} finished more than {completedDays} days ago</>}
                  </span>
                  <button onClick={() => bucket === 'upcoming' ? setUpcomingDays(d => d + 30) : setCompletedDays(d => d + 30)}>
                    {bucket === 'upcoming' ? 'Show the next 30 days' : 'Show 30 days earlier'}
                  </button>
                </div>
              )}
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
const bulkBtn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 999, border: 'none', background: '#f4f4f5', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
function FilterField({ label, hidden, children }: { label: string; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>{label}</p>
      {children}
    </div>
  )
}

// A consistent multi-select dropdown for the filters (outlets, assignee,
// priority, colour) — looks like a normal select but toggles several values.
function MultiSelect({ options, value, onChange, allLabel = 'All', onItemContext, defaultValue, allValue }: {
  options: { value: string; label: string; color?: string }[]
  value: string[]
  onChange: (v: string[]) => void
  allLabel?: string
  onItemContext?: (value: string, e: React.MouseEvent) => void
  defaultValue?: string | null
  /** When set, the "All" row can be right-clicked too (as this value) and shows DEFAULT. */
  allValue?: string
}) {
  const [open, setOpen] = useState(false)
  const label = value.length === 0 ? allLabel
    : value.length === 1 ? (options.find(o => o.value === value[0])?.label || '1 selected')
      : `${value.length} selected`
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', minHeight: 34, padding: '0 10px', marginBottom: 2, border: 'none', borderRadius: 10, background: '#fff', color: 'var(--ink)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="ctl" onClick={() => setOpen(o => !o)}
        style={{ ...selectStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, textAlign: 'left' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', fontWeight: 600 }}>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--slate)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: 4, borderRadius: 14, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.07)', maxHeight: 220, overflowY: 'auto' }}>
          <button type="button" onClick={() => onChange([])}
            onContextMenu={onItemContext && allValue ? (e => onItemContext(allValue, e)) : undefined}
            title={onItemContext && allValue ? 'Right-click to set as your default' : undefined}
            style={{ ...row, background: value.length === 0 ? '#efeff1' : '#fff', fontWeight: 600 }}>
            <span style={{ flex: 1 }}>{allLabel}</span>
            {allValue && defaultValue === allValue && <span title="Your default" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--coral)', background: '#fff', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>Default</span>}
          </button>
          {options.map(o => {
            const on = value.includes(o.value)
            return (
              <button key={o.value} type="button" onClick={() => toggle(o.value)}
                onContextMenu={onItemContext ? (e => onItemContext(o.value, e)) : undefined}
                title={onItemContext ? 'Right-click to set as your default' : undefined}
                style={{ ...row, background: on ? '#efeff1' : '#fff', fontWeight: on ? 600 : 400 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px solid ' + (on ? '#18181b' : '#d4d4d8'), background: on ? '#18181b' : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                  {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                {o.color !== undefined && <span style={{ width: 12, height: 12, borderRadius: '50%', background: o.color || '#fff', border: o.color ? 'none' : '1px solid var(--border)', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{o.label}</span>
                {defaultValue === o.value && <span title="Your default" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--coral)', background: 'var(--peach)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>Default</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterRail({ team, assigneeFilter, setAssigneeFilter, priorityFilter, setPriorityFilter, sortBy, setSortBy }: any) {
  const H = { fontSize: 12.5, fontWeight: 500, color: '#8e8e93', margin: '0 0 8px' }
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

function TaskCard({ t, conv, selected, onClick, onToggle, onStatus, showStatusButtons, statusOf, selectMode, checked, onSelect, outlets, missed = 0, onClearMissed, later = 0 }: any) {
  const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
  const due = parseTs(t.due_date)
  const overdue = due && startOfDay(due).getTime() < startOfDay(new Date()).getTime() && statusOf(t) !== 'done'
  const assignees = (Array.isArray(t.assignees) && t.assignees.length) ? t.assignees : (t.assigned_to ? [{ name: t.assigned_to }] : [])
  // Colour-coded tasks get a soft tinted background rather than a left bar.
  const bg = selectMode && checked ? 'var(--peach)' : (t.color ? tint(t.color, 0.10) : undefined)
  // Cover photo, full-bleed across the top of the card. Defaults to the first
  // image; an explicit choice (or "None" = '') overrides. Only ever a real
  // image attachment.
  const atts = Array.isArray(t.attachments) ? t.attachments : []
  const imgs = atts.filter((a: any) => a.kind === 'image' || (a.type || '').startsWith('image/'))
  const coverUrl = t.cover_image === '' ? ''
    : (t.cover_image && imgs.some((a: any) => a.url === t.cover_image)) ? t.cover_image
    : (t.cover_image == null ? (imgs[0]?.url || '') : '')
  return (
    <div className={'task-card lift' + ((selected || (selectMode && checked)) ? ' sel' : '')} onClick={onClick}
      style={{ ...(coverUrl ? { overflow: 'hidden' } : {}), ...((bg || t.color) ? { background: bg, borderColor: selectMode && checked ? 'var(--coral)' : (t.color ? tint(t.color, 0.45) : undefined) } : {}) }}>
      {coverUrl && (
        <div style={{ margin: '-13px -13px 11px', height: 132, overflow: 'hidden', background: '#f4f4f5' }}>
          <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        {selectMode
          ? <input type="checkbox" checked={!!checked} onClick={e => e.stopPropagation()} onChange={onSelect} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--coral)' }} />
          : onToggle && <input type="checkbox" checked={statusOf(t) === 'done'} onClick={e => e.stopPropagation()} onChange={onToggle} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, textDecoration: statusOf(t) === 'done' ? 'line-through' : 'none', opacity: statusOf(t) === 'done' ? 0.55 : 1 }}>{t.title || t.text}</p>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
            <span className="tk-tag dot" style={{ color: pr.color, background: `color-mix(in srgb, ${pr.color} 10%, #fff)` }}>{pr.label}</span>
            {due && <span style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#dc2626' : '#71717a' }}>{fmtRel(t.due_date)}</span>}
            {assignees.map((a: any, i: number) => (
              <span key={i} className="tk-tag" title={a.name} style={{ color: '#3f3f46' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                {a.name}
              </span>
            ))}
            {t.order_number && <span className="tk-tag" style={{ background: '#eef2ff', color: '#4338ca' }}>#{t.order_number}</span>}
            {Array.isArray(t.attachments) && t.attachments.length > 0 && (() => {
              const img = t.attachments.find((a: any) => a.kind === 'image' || (a.type || '').startsWith('image/'))
              return (
                <span className="tk-tag" title={`${t.attachments.length} attachment${t.attachments.length === 1 ? '' : 's'}`}>
                  {img ? <img src={img.url} alt="" style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover' }} /> : <span>📎</span>}
                  {t.attachments.length}
                </span>
              )
            })()}
            {Array.isArray(t.checklist) && t.checklist.length > 0 && (() => {
              const done = t.checklist.filter((i: any) => i.done).length
              const all = t.checklist.length
              return (
                <span className="tk-tag" title="Checklist" style={done === all ? { background: '#f0fdf4', color: '#15803d' } : undefined}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  {done}/{all}
                </span>
              )
            })()}
            {t.recurrence && (
              <span className="tk-tag" title="Repeating task" style={{ background: '#ecfeff', color: '#0e7490' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                {t.recurrence.freq}
              </span>
            )}
            {missed > 0 && (
              <span title={`${missed} earlier ${missed === 1 ? 'copy was' : 'copies were'} never ticked off`}
                className="tk-tag" style={{ background: '#fef2f2', color: '#b91c1c', paddingRight: 3 }}>
                Missed {missed}
                {onClearMissed && (
                  <button type="button" onClick={e => { e.stopPropagation(); onClearMissed() }} title="Remove the missed copies"
                    style={{ border: 'none', background: 'rgba(185,28,28,0.10)', color: '#b91c1c', fontSize: 11, fontWeight: 700, height: 16, padding: '0 6px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                )}
              </span>
            )}
            {later > 0 && (
              <span title="More copies of this repeating task are scheduled after this one"
                className="tk-tag">
                +{later} scheduled
              </span>
            )}
            {t._source === 'calendar' && (() => {
              const et = EVENT_TYPE_META[t.event_type || 'task'] || EVENT_TYPE_META.task
              return (
                <span className="tk-tag" title={`${et.label} scheduled on the calendar`} style={{ background: et.bg, color: et.color }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {et.label}
                </span>
              )
            })()}
            {Array.isArray(outlets) && outlets.length > 0 && (() => {
              const ids = (Array.isArray(t.location_ids) && t.location_ids.length) ? t.location_ids : (t.location_id ? [t.location_id] : [])
              const names = ids.map((id: string) => outlets.find((o: any) => o.id === id)).filter(Boolean).map((o: any) => o.label || o.suburb || 'Outlet')
              return names.map((n: string, i: number) => (
                <span key={i} className="tk-tag" title={n}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {n}
                </span>
              ))
            })()}
          </div>
        </div>
      </div>
      {showStatusButtons && (
        <div className="seg" style={{ display: 'flex', marginTop: 10 }} onClick={e => e.stopPropagation()}>
          {COLUMNS.map(c => (
            <button key={c.key} className={statusOf(t) === c.key ? 'on' : ''} onClick={() => onStatus(c.key)} style={{ flex: 1, justifyContent: 'center', height: 26, padding: 0, fontSize: 12 }}>{c.label}</button>
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
  // View scope: a day / 3 days / week / month window the user can switch and
  // page through. `cursor` is the anchor day of the current window.
  type Scope = 'today' | '3day' | 'week' | 'month'
  const [scope, setScope] = useState<Scope>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [dayPopup, setDayPopup] = useState<{ date: Date; tasks: any[] } | null>(null)
  const todayKey = dayKey(new Date())
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {}
    const noDate: any[] = []
    for (const t of tasks) {
      const due = parseTs(t.due_date)
      if (!due) { noDate.push(t); continue }
      ;(m[dayKey(due)] ||= []).push(t)
    }
    for (const k in m) m[k].sort(orderCmp)
    noDate.sort(orderCmp)
    return { m, noDate }
  }, [tasks])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // The individual days shown for the day/3-day/week scopes (month has its own grid).
  const scopeDays: Date[] =
    scope === 'today' ? [cursor]
    : scope === '3day' ? [0, 1, 2].map(i => addDays(cursor, i))
    : scope === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(addDays(cursor, -cursor.getDay()), i))
    : []

  const shift = (dir: number) => {
    if (scope === 'month') setCursor(new Date(year, month + dir, 1))
    else if (scope === 'week') setCursor(addDays(cursor, 7 * dir))
    else if (scope === '3day') setCursor(addDays(cursor, 3 * dir))
    else setCursor(addDays(cursor, dir))
  }
  const label = scope === 'month'
    ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : scope === 'today'
      ? cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${scopeDays[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${scopeDays[scopeDays.length - 1].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 999, border: 'none', background: '#f4f4f5', cursor: 'pointer', color: '#18181b', fontSize: 16, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }

  // One task pill, shared by every scope's cells.
  const renderPill = (t: any) => {
    const pr = PRIORITY[(t.priority || 'normal') as keyof typeof PRIORITY]
    const done = statusOf(t) === 'done'
    const sel = selectedId === t.id
    const cBg = t.color ? tint(t.color, 0.16) : pr.bg
    const cFg = t.color || pr.color
    const cDot = t.color || pr.color
    return (
      <div key={t.id} className="cal-pill" onClick={(e) => { e.stopPropagation(); onSelect(t.id) }} title={t.title || t.text}
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '2px 5px', borderRadius: 5, background: sel ? 'var(--coral)' : cBg, color: sel ? '#fff' : cFg, fontSize: 10.5, fontWeight: 700 }}>
        <button type="button" className={'cal-tick' + (done ? ' done' : '')} title={done ? 'Mark not done' : 'Mark done'}
          onClick={(e) => { e.stopPropagation(); onToggle?.(t) }}
          style={{ flexShrink: 0, width: 13, height: 13, borderRadius: '50%', border: '1.5px solid ' + (done ? '#22c55e' : (sel ? '#fff' : cDot)), background: done ? '#22c55e' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </button>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{t.title || t.text}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button aria-label="Previous" onClick={() => shift(-1)} style={navBtn}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', minWidth: 150, textAlign: 'center' }}>{label}</span>
        <button aria-label="Next" onClick={() => shift(1)} style={navBtn}>›</button>
        <button onClick={() => setCursor(startOfDay(new Date()))} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12 }}>Today</button>
        <span style={{ flex: 1 }} />
        {/* View scope switcher */}
        <div className="seg">
          {([['today', 'Today'], ['3day', '3 Day'], ['week', '1 Week'], ['month', '1 Month']] as const).map(([k, l]) => (
            <button key={k} className={scope === k ? 'on' : ''} onClick={() => { setScope(k); setCursor(startOfDay(new Date())) }}>{l}</button>
          ))}
        </div>
      </div>

      {scope === 'month' ? (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
        {WD.map(w => <div key={w} style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', textAlign: 'center' }}>{w}</div>)}
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
              {dayTasks.slice(0, 3).map((t: any) => renderPill(t))}
              {dayTasks.length > 3 && (
                <button onClick={(e) => { e.stopPropagation(); openDay() }} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--coral)', padding: '0 0 0 2px' }}>+{dayTasks.length - 3} more</button>
              )}
            </div>
          )
        })}
      </div>
      </>) : (
      // Day / 3-day / week: taller columns that list every task for the day.
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${scopeDays.length},1fr)`, gap: 6 }}>
        {scopeDays.map(dd => {
          const key = dayKey(dd)
          const dayTasks = byDay.m[key] || []
          const isToday = key === todayKey
          return (
            <div key={key} className="cal-cell" onClick={() => setDayPopup({ date: dd, tasks: dayTasks })}
              style={{ border: `1px solid ${isToday ? 'var(--coral)' : 'var(--border)'}`, borderRadius: 10, padding: 8, background: isToday ? 'var(--peach)' : '#fff', minHeight: 360, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? 'var(--coral)' : '#8e8e93' }}>{dd.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? 'var(--coral)' : 'var(--ink)' }}>{dd.getDate()}</div>
              </div>
              {dayTasks.map((t: any) => renderPill(t))}
              {dayTasks.length === 0 && <span style={{ fontSize: 11, color: '#c3c7cd' }}>—</span>}
            </div>
          )
        })}
      </div>
      )}

      {byDay.noDate.some((t: any) => statusOf(t) !== 'done') && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>No due date ({byDay.noDate.length})</p>
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

function Timeline({ tasks, convs, statusOf, onSelect, selectedId, outlets, onToggle, onAdd, onReorder }: any) {
  // A continuous day axis (Planyway-style): every day is a column, ordered
  // left→right into the future, empty days included. Scroll right (swipe left)
  // to reach upcoming dates; each column scrolls down through its own tasks.
  const scrollRef = useRef<HTMLDivElement>(null)
  // How many day-columns fill the visible width at once (still scrollable for
  // more). Columns are sized to the measured viewport ÷ this count.
  const [daysShown, setDaysShown] = useState(5)
  const [viewW, setViewW] = useState(0)
  // A column never gets narrower than a readable card. On a phone that means
  // about two days across whatever "Show" says, so the setting is hidden
  // there, the "No due date" column isn't pinned over the days, and today
  // opens at the left edge.
  const narrow = viewW > 0 && viewW < 640
  const MIN_COL = narrow ? 172 : 140
  const COL_W = viewW ? Math.max(MIN_COL, viewW / daysShown) : 256
  const lead = narrow ? 0 : COL_W   // how much of yesterday shows before today
  // Only the days around what's on screen are drawn — the axis can span a
  // year (366 columns), and drawing every card in every column made the
  // Timeline slow to open. Spacers keep the scroll width the same.
  const [scrollX, setScrollX] = useState<number | null>(null)
  const scrollRaf = useRef(0)
  const onScroll = () => {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; if (scrollRef.current) setScrollX(scrollRef.current.scrollLeft) })
  }
  useEffect(() => () => { if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current) }, [])
  // Drag & drop: reorder within a day or move a task to another day (which
  // changes its due date). dropTarget is the live insertion point (which column,
  // and the index within it) so we can show a precise drop line.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ key: string; index: number } | null>(null)
  // Only change dropTarget when it actually moves — returning the same object
  // ref lets React skip re-rendering all the columns on every dragover tick,
  // which is what keeps the drag smooth.
  const setDrop = (key: string, index: number) =>
    setDropTarget(prev => (prev && prev.key === key && prev.index === index) ? prev : { key, index })

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>()
    const noDate: any[] = []
    for (const t of tasks) {
      const due = parseTs(t.due_date)
      if (!due) { noDate.push(t); continue }
      const k = dayKey(due)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    for (const list of m.values()) list.sort(orderCmp)
    noDate.sort(orderCmp)
    return { m, noDate }
  }, [tasks])

  // Hide the pinned "No due date" column once every unscheduled task is done —
  // a column of nothing but ticked-off tasks is just noise.
  const showNoDate = byDay.noDate.some((t: any) => statusOf(t) !== 'done')

  // The span of days to render: at least [today−3, today+30], stretched to cover
  // every dated task, and capped so a far-off outlier can't create 1000 columns.
  const { days, todayIdx } = useMemo(() => {
    const today = startOfDay(new Date())
    let minMs = today.getTime() - 3 * 86400000
    let maxMs = today.getTime() + 30 * 86400000
    for (const t of tasks) {
      const due = parseTs(t.due_date); if (!due) continue
      const ms = startOfDay(due).getTime()
      if (ms < minMs) minMs = ms
      if (ms > maxMs) maxMs = ms
    }
    let total = Math.round((maxMs - minMs) / 86400000) + 1
    if (total > 366) total = 366
    const out: Date[] = []
    let idx = 0
    for (let i = 0; i < total; i++) {
      const d = new Date(minMs + i * 86400000)
      if (dayKey(d) === dayKey(today)) idx = i
      out.push(d)
    }
    return { days: out, todayIdx: idx }
  }, [tasks])

  // Track the visible width so columns can be sized to fit exactly `daysShown`.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') { if (el) setViewW(el.clientWidth); return }
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el); setViewW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Land on today when the timeline first shows, the data loads, or the density
  // changes.
  useEffect(() => {
    // Offset by the pinned "No due date" column (if present) so today isn't
    // hidden behind it.
    const left = Math.max(0, todayIdx * COL_W - lead + (showNoDate ? COL_W : 0))
    if (scrollRef.current) scrollRef.current.scrollLeft = left
    setScrollX(left)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIdx, COL_W, showNoDate, lead])

  const scrollBy = (cols: number) => { if (scrollRef.current) scrollRef.current.scrollBy({ left: cols * COL_W, behavior: 'smooth' }) }
  const goToday = () => { if (scrollRef.current) scrollRef.current.scrollTo({ left: Math.max(0, todayIdx * COL_W - lead + (showNoDate ? COL_W : 0)), behavior: 'smooth' }) }
  const goNoDate = () => { if (scrollRef.current) scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' }) }

  if (tasks.length === 0) return <div style={{ paddingTop: 48 }}><EmptyScroll kinds={['task']} title="Nothing on the timeline" line="Tasks with a due date show up here, day by day." /></div>

  const todayKey = dayKey(startOfDay(new Date()))
  // The window of day columns to draw: what's visible plus a week either side.
  const BUFFER = 7
  const firstVisible = Math.floor(Math.max(0, (scrollX ?? Math.max(0, todayIdx * COL_W - COL_W)) - (showNoDate ? COL_W : 0)) / COL_W)
  const winStart = Math.max(0, firstVisible - BUFFER)
  const winEnd = Math.min(days.length, firstVisible + daysShown + 1 + BUFFER)
  const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 999, border: 'none', background: '#f4f4f5', cursor: 'pointer', color: '#18181b', fontSize: 16, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }

  const targetYmd = (dateObj: Date | null) => dateObj ? localYmd(dateObj) : ''
  const doDrop = (dateObj: Date | null, list: any[], index: number) => {
    if (!dragId || !onReorder) { setDragId(null); setDropTarget(null); return }
    let ids = list.map((x: any) => x.id)
    const from = ids.indexOf(dragId)
    ids = ids.filter((id: string) => id !== dragId)
    let at = index
    if (from >= 0 && from < index) at -= 1        // account for the removed row
    at = Math.max(0, Math.min(at, ids.length))
    ids.splice(at, 0, dragId)
    onReorder(dragId, targetYmd(dateObj), ids)
    setDragId(null); setDropTarget(null)
  }
  const dropLine = <div style={{ height: 3, background: 'var(--coral)', borderRadius: 3, margin: '3px 2px' }} />

  const renderColumn = (key: string, header: string, sub: string, isToday: boolean, weekend: boolean, list: any[], dateObj: Date | null, sticky = false) => {
    const overCol = dropTarget?.key === key
    return (
    <div key={key} className="tl-col"
      onDragOver={(e) => { if (dragId) { e.preventDefault(); setDrop(key, list.length) } }}
      onDrop={(e) => { e.preventDefault(); doDrop(dateObj, list, overCol ? dropTarget!.index : list.length) }}
      style={{ width: COL_W, boxSizing: 'border-box', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border)', background: isToday ? 'var(--peach)' : (weekend ? 'var(--canvas)' : '#fff'), outline: overCol ? '2px dashed var(--coral)' : 'none', outlineOffset: -2, ...(sticky ? { background: 'var(--canvas)', ...(narrow ? {} : { position: 'sticky' as const, left: 0, zIndex: 3, boxShadow: '4px 0 10px rgba(0,0,0,0.06)' }) } : {}) }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '10px 12px', borderBottom: `2px solid ${isToday ? 'var(--coral)' : '#ececef'}`, background: 'inherit', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--coral)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{header}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--slate)', whiteSpace: 'nowrap', flexShrink: 0 }}>{sub}</span>}
        {list.length > 0 && <span style={{ marginLeft: 'auto', alignSelf: 'center', minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, background: isToday ? '#fff' : '#f4f4f5', color: '#52525b', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{list.length}</span>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {list.map((t: any, i: number) => (
          <Fragment key={t.id}>
            {overCol && dropTarget!.index === i && dropLine}
            <div draggable
              onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id) } catch {} }}
              onDragEnd={() => { setDragId(null); setDropTarget(null) }}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault(); e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                setDrop(key, i + (e.clientY > r.top + r.height / 2 ? 1 : 0))
              }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); doDrop(dateObj, list, overCol ? dropTarget!.index : i) }}
              style={{ opacity: dragId === t.id ? 0.4 : 1, cursor: 'grab' }}>
              <TaskCard t={t} conv={convs[t.conversation_id]} selected={selectedId === t.id} onClick={() => onSelect(t.id)} statusOf={statusOf} outlets={outlets} onToggle={onToggle ? () => onToggle(t) : undefined} />
            </div>
          </Fragment>
        ))}
        {overCol && dropTarget!.index >= list.length && dropLine}
        {dateObj && (
          // Add a task straight onto this day. Always present at the foot of the
          // column, and a hover "+" (see .tl-col:hover .tl-add) makes it obvious.
          <button className="tl-add" onClick={(e) => { e.stopPropagation(); onAdd?.(dateObj) }}
            style={{ width: '100%', marginTop: list.length ? 8 : 0, height: 36, borderRadius: 12, border: '1.5px dashed #e4e4e7', background: 'transparent', color: '#71717a', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add task
          </button>
        )}
      </div>
    </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 10px', flexWrap: 'wrap' }}>
        <button aria-label="Scroll back" className="tl-pill icon" onClick={() => scrollBy(-daysShown)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <button className="tl-pill" onClick={goToday}>Today</button>
        <button aria-label="Scroll forward" className="tl-pill icon" onClick={() => scrollBy(daysShown)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        {narrow && showNoDate && (
          <button className="tl-pill" onClick={goNoDate}>No due date · {byDay.noDate.filter((t: any) => statusOf(t) !== 'done').length}</button>
        )}
        <span style={{ fontSize: 13, color: '#8e8e93', marginLeft: 4 }}>{narrow ? 'Swipe for more days →' : 'Scroll right for upcoming days →'}</span>
        <span style={{ flex: 1 }} />
        {/* How many days fill the screen at once (a phone always shows about two). */}
        {!narrow && <>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93' }}>Show</span>
          <div className="seg">
            {[3, 5, 7].map(n => (
              <button key={n} className={daysShown === n ? 'on' : ''} onClick={() => setDaysShown(n)}>{n}</button>
            ))}
          </div>
          <input type="number" min={1} max={7} value={daysShown}
            onChange={e => setDaysShown(Math.max(1, Math.min(7, parseInt(e.target.value) || 1)))}
            className="ctl" style={{ width: 58, height: 34, padding: '0 10px' }} aria-label="Days shown" />
          <span style={{ fontSize: 13, color: '#8e8e93' }}>days</span>
        </>}
      </div>
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', minWidth: 'min-content' }}>
          {/* Unscheduled tasks (no due date) pinned to the left so they're always
              visible — otherwise they hid at the far right, past every future day. */}
          {showNoDate && renderColumn('nodate', 'No due date', '', false, false, byDay.noDate, null, true)}
          {winStart > 0 && <div aria-hidden="true" style={{ width: winStart * COL_W, flexShrink: 0 }} />}
          {days.slice(winStart, winEnd).map(d => {
            const k = dayKey(d)
            const list = byDay.m.get(k) || []
            const isToday = k === todayKey
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const showMonth = d.getDate() === 1 || k === dayKey(days[0])
            return renderColumn(
              k,
              `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`,
              showMonth ? d.toLocaleDateString(undefined, { month: 'short' }) : '',
              isToday, weekend, list, d,
            )
          })}
          {winEnd < days.length && <div aria-hidden="true" style={{ width: (days.length - winEnd) * COL_W, flexShrink: 0 }} />}
        </div>
      </div>
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
  const [showAllComments, setShowAllComments] = useState(false)
  const [activity, setActivity] = useState<any[]>([])
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [notePicker, setNotePicker] = useState(false)
  const notePickerRef = useRef<HTMLDivElement>(null)
  // Close the picker on any click outside it. A fixed backdrop is unreliable here
  // because the detail pane's slide transform scopes fixed positioning to the pane.
  useEffect(() => {
    if (!notePicker) return
    const onDown = (e: MouseEvent) => { if (notePickerRef.current && !notePickerRef.current.contains(e.target as Node)) setNotePicker(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notePicker])
  const [noteList, setNoteList] = useState<any[]>([])
  const [noteQuery, setNoteQuery] = useState('')
  const linkedNotes: { id: string; title: string }[] = Array.isArray(task.linked_notes) ? task.linked_notes : []
  const [checkText, setCheckText] = useState('')
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
  // Card history — most recent first. Silent if the table isn't migrated.
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('task_activity').select('*').eq('task_id', task.id).order('created_at', { ascending: false }).limit(200)
        setActivity(data || [])
      } catch { setActivity([]) }
    })()
  }, [task.id, task.status, task.priority, task.due_date, task.updated_at])
  // Load the company's notes when the "link a note" picker opens.
  useEffect(() => {
    if (!notePicker || !companyId) return
    ;(async () => {
      try { const r = await authFetch(`/api/notes?companyId=${companyId}&userId=${userId || ''}`); const d = await r.json(); setNoteList(d.notes || []) } catch { setNoteList([]) }
    })()
  }, [notePicker, companyId, userId])
  const linkNote = (n: any) => { if (linkedNotes.some(x => x.id === n.id)) return; patch({ linked_notes: [...linkedNotes, { id: n.id, title: n.title || 'Untitled' }] }); setNotePicker(false); setNoteQuery('') }
  const unlinkNote = (id: string) => patch({ linked_notes: linkedNotes.filter(x => x.id !== id) })
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
        await authFetch('/api/notify/members', {
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
  const L: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, color: '#8e8e93', margin: '16px 0 7px' }
  const curStatus = task.status || (task.done ? 'done' : 'todo')
  return (
    <div style={{ padding: 18 }}>
      {task._source === 'calendar' && (() => {
        const et = EVENT_TYPE_META[task.event_type || 'task'] || EVENT_TYPE_META.task
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: et.bg, color: et.color, marginBottom: 8 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {et.label}
          </span>
        )
      })()}
      <textarea value={task.title || task.text || ''} onChange={e => patch({ title: e.target.value })} rows={2}
        style={{ width: '100%', border: 'none', fontSize: 16.5, fontWeight: 700, color: 'var(--ink)', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.35 }} />
      {task.text && task.title && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>{task.text}</p>}

      {/* Edit scope for a repeating task — sits up top so it's clear which cards
          every change below (description, checklist, status…) will apply to. */}
      {isSeries && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#ecfeff', border: '1px solid #a5f3fc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0e7490', marginBottom: 7 }}>
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

      <p style={L}>Description</p>
      <RichTextEditor key={task.id} value={task.description || ''} onChange={(html) => patch({ description: html })} />

      <p style={L}>Photos &amp; videos</p>
      <AttachmentUploader companyId={companyId} value={task.attachments || []} onChange={(a) => patch({ attachments: a })} folder="task" compact />

      {/* Cover photo — pick one image to sit across the top of the card. */}
      {(() => {
        const imgs = (Array.isArray(task.attachments) ? task.attachments : []).filter((a: any) => a.kind === 'image' || (a.type || '').startsWith('image/'))
        if (!imgs.length) return null
        // Effective cover mirrors the card: first image by default unless a
        // choice or "None" ('') is set.
        const effective = task.cover_image === '' ? ''
          : (task.cover_image && imgs.some((a: any) => a.url === task.cover_image)) ? task.cover_image
          : (imgs[0]?.url || '')
        return (
          <>
            <p style={L}>Cover photo <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--slate)' }}>— first photo by default; pick another or none</span></p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => patch({ cover_image: '' })}
                style={{ width: 56, height: 56, borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: '1px solid ' + (task.cover_image === '' ? 'var(--coral)' : 'var(--border)'), background: task.cover_image === '' ? 'var(--peach)' : '#fff', color: task.cover_image === '' ? 'var(--coral)' : 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>None</button>
              {imgs.map((a: any, i: number) => {
                const on = a.url === effective
                return (
                  <button key={i} onClick={() => patch({ cover_image: a.url })} title="Use as cover"
                    style={{ position: 'relative', width: 56, height: 56, borderRadius: 9, overflow: 'hidden', cursor: 'pointer', padding: 0, border: on ? '2px solid var(--coral)' : '1px solid var(--border)', background: '#f4f4f5' }}>
                    <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {on && (
                      <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}

      {/* Checklist — a list of sub-steps with their own progress. */}
      {(() => {
        const items: any[] = Array.isArray(task.checklist) ? task.checklist : []
        const doneN = items.filter(i => i.done).length
        const setItems = (next: any[]) => patch({ checklist: next })
        // Match by id so a refresh that reorders the list can't hit the wrong
        // row; items saved before ids existed fall back to their position.
        const updateItem = (it: any, idx: number, fields: any) =>
          setItems(items.map((x, j) => (it.id ? x.id === it.id : j === idx) ? { ...x, ...fields } : x))
        const addItem = () => {
          const text = checkText.trim(); if (!text) return
          const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e6)}`
          setItems([...items, { id, text, done: false }]); setCheckText('')
        }
        return (
          <>
            <p style={L}>Checklist{items.length > 0 ? ` — ${doneN}/${items.length}` : ''}</p>
            {items.length > 0 && (
              <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${Math.round((doneN / items.length) * 100)}%`, background: '#22c55e', transition: 'width 0.2s' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {items.map((it, idx) => (
                <div key={it.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                  <input type="checkbox" checked={!!it.done}
                    onChange={() => updateItem(it, idx, { done: !it.done })}
                    style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--coral)' }} />
                  <ChecklistItemText value={it.text || ''} done={!!it.done} onCommit={text => updateItem(it, idx, { text })} />
                  <button onClick={() => setItems(items.filter((x, j) => it.id ? x.id !== it.id : j !== idx))} title="Remove"
                    style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={checkText} onChange={e => setCheckText(e.target.value)}
                onKeyDown={e => {
                  // Enter while an IME is composing (Chinese, Japanese, some
                  // mobile keyboards) confirms the word — it isn't an "add".
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault(); addItem()
                }}
                placeholder="Add a checklist item…"
                style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
              <button onClick={addItem} disabled={!checkText.trim()}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: checkText.trim() ? 'var(--coral)' : '#eef0f2', color: checkText.trim() ? '#fff' : '#9aa1ab', fontSize: 13, fontWeight: 700, cursor: checkText.trim() ? 'pointer' : 'default' }}>Add</button>
            </div>
          </>
        )
      })()}

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
              await authFetch('/api/notify/members', {
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
      <p style={L}>Comments{comments.length > 0 ? ` (${comments.length})` : ''}</p>
      {(() => {
        // Newest first, and collapse to a few until "See more" is clicked.
        const ordered = [...comments].reverse()
        const PREVIEW = 3
        const shown = showAllComments ? ordered : ordered.slice(0, PREVIEW)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            {ordered.length === 0 && <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>No comments yet.</p>}
            {shown.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 9 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{(c.author_name || '?').charAt(0).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{c.author_name} <span title={fmtExact(c.created_at)} style={{ fontWeight: 400, color: '#9ca3af' }}>· {fmtAgo(c.created_at)}</span></div>
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              </div>
            ))}
            {ordered.length > PREVIEW && (
              <button onClick={() => setShowAllComments(v => !v)}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                {showAllComments ? 'Show less' : `See ${ordered.length - PREVIEW} more`}
              </button>
            )}
          </div>
        )
      })()}
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

      {/* Linked notes — attach one or more Notes to this task. */}
      <p style={{ ...L, marginTop: 18 }}>Linked notes</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
        {linkedNotes.length === 0 && <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>No notes linked.</p>}
        {linkedNotes.map(n => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
            <button onClick={() => router.push(`/admin/notes?open=${n.id}`)} title="Open note"
              style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: 0 }}>{n.title || 'Untitled note'}</button>
            <button onClick={() => unlinkNote(n.id)} title="Unlink" style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative' }} ref={notePickerRef}>
        <button onClick={() => setNotePicker(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px dashed var(--border)', background: 'var(--canvas)', color: 'var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 12px', borderRadius: 9 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Link a note
        </button>
        {notePicker && (
          <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 41, width: 300, maxWidth: '90vw', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', padding: 8 }}>
            <input autoFocus value={noteQuery} onChange={e => setNoteQuery(e.target.value)} placeholder="Search notes…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', marginBottom: 6 }} />
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {(() => {
                const q = noteQuery.trim().toLowerCase()
                const items = noteList.filter(n => !linkedNotes.some(x => x.id === n.id) && (!q || (n.title || 'Untitled').toLowerCase().includes(q)))
                if (!items.length) return <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '8px 6px' }}>{noteList.length ? 'No matching notes.' : 'No notes yet.'}</p>
                return items.slice(0, 40).map(n => (
                  <button key={n.id} onClick={() => linkNote(n)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 9px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--canvas)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title || 'Untitled note'}</span>
                  </button>
                ))
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Card history — status moves, assignments, edits, and when it was created. */}
      <p style={{ ...L, marginTop: 18 }}>Activity</p>
      {(() => {
        const dot: Record<string, string> = { status: '#2563eb', assignee: '#7c3aed', priority: '#ea580c', due: '#0891b2', checklist: '#16a34a', edit: '#6b7280' }
        const created = task.created_at
        const PREVIEW = 5
        const shown = showAllActivity ? activity : activity.slice(0, PREVIEW)
        const showCreated = created && (showAllActivity || activity.length <= PREVIEW)
        if (!activity.length && !created) return <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 4px' }}>No activity yet.</p>
        return (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 6 }}>
            {shown.map((a, i) => (
              <div key={a.id || i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot[a.kind] || '#9ca3af', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 700 }}>{a.actor_name || 'Someone'}</strong> {a.detail}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#9ca3af' }} title={fmtExact(a.created_at)}>{fmtAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
            {showCreated && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 700 }}>{task.created_by || task.created_by_name || task.assigned_to || 'Someone'}</strong> created this task
                    {task.source === 'agent' && <> · <WhyLink companyId={companyId} entityType="task" entityId={task.id} /></>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#9ca3af' }} title={fmtExact(created)}>{fmtAgo(created)}</div>
                </div>
              </div>
            )}
            {activity.length > PREVIEW && (
              <button onClick={() => setShowAllActivity(v => !v)}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 0' }}>
                {showAllActivity ? 'Show less' : `See ${activity.length - PREVIEW} more`}
              </button>
            )}
          </div>
        )
      })()}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        {isSeries && onEndRepeatNew && (
          <button onClick={async () => {
            if (!await confirmDialog('End the repeat at this card (this and all following cards are removed) and start a new repeat from here?')) return
            await onEndRepeatNew()
          }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #0e7490', background: '#ecfeff', color: '#0e7490', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 12px', borderRadius: 9 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            End repeat here &amp; create new…
          </button>
        )}
        <button onClick={async () => {
          const label = isSeries ? (scope === 'all' ? 'all cards in this series' : scope === 'following' ? 'this and all following cards' : 'this card') : 'this task'
          if (!await confirmDialog(`Delete ${label}?`)) return
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
      try { const res = await authFetch(`/api/orders/search?companyId=${companyId}&q=${encodeURIComponent(q.trim())}`); const d = await res.json(); setResults(d.orders || []) }
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
