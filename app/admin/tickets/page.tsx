'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { readLocal, writeLocal } from '@/lib/local-cache'
import { SkeletonList } from '@/components/Skeleton'
import EmptyScroll from '@/components/EmptyScroll'
import PageHeader from '@/components/PageHeader'
import { MessageIcon, ClockIcon, CheckIcon, ArchiveIcon, AlarmClockIcon, DownloadIcon, PlusIcon, SearchIcon, MoreHorizontalIcon, SlidersIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/components/Icons'
import { computeSla, activeClock, clockLabel, CLOCK_COLORS, resolveSla, DEFAULT_SLA, type SlaSettings } from '@/lib/ticket-sla'

const STATUS_COLORS: Record<string, { bg: string; c: string }> = {
  open: { bg: '#dbeafe', c: '#2563eb' },
  in_progress: { bg: '#fef3c7', c: '#d97706' },
  resolved: { bg: '#dcfce7', c: '#059669' },
  closed: { bg: '#f3f4f6', c: '#6b7280' },
}
const PRIORITY_COLORS: Record<string, string> = { low: '#6b7280', normal: '#2563eb', high: '#d97706', urgent: '#dc2626' }
const PAGE_SIZE = 10

const STAT_META: { key: string; label: string; Icon: (p: { size?: number }) => React.ReactElement; bg: string; c: string }[] = [
  { key: 'open', label: 'Open', Icon: MessageIcon, bg: '#eff6ff', c: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', Icon: ClockIcon, bg: '#fffbeb', c: '#d97706' },
  { key: 'resolved', label: 'Resolved', Icon: CheckIcon, bg: '#f0fdf4', c: '#059669' },
  { key: 'closed', label: 'Closed', Icon: ArchiveIcon, bg: '#f8fafc', c: '#64748b' },
]

// The last list this device rendered (lib/local-cache, scoped to user + workspace).
type TicketsCache = { tickets: any[]; sla: any; team: { userId: string; name: string }[] }
const CACHE_KEY = 'tickets'
// Long ticket bodies are only needed for search, and the fresh list replaces the
// cached one moments later — keep the cache small enough to fit in storage.
const toCache = (d: any): TicketsCache => ({
  tickets: (d.tickets || []).map((t: any) => (typeof t.description === 'string' && t.description.length > 400 ? { ...t, description: t.description.slice(0, 400) } : t)),
  sla: d.sla || null,
  team: Array.isArray(d.team) ? d.team : [],
})

const initials = (name: string) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

// "5:38 pm" for today, "17 Oct" this year, "17 Oct 2025" before that.
function shortWhen(v: string): string {
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

// The long search placeholder needs about 390px; narrower boxes (phones,
// tablets, a narrow window) get the short one so it's never cut off.
const LONG_PLACEHOLDER = 'Search tickets by ID, subject, customer, or message…'
function useFitsLongPlaceholder(ref: React.RefObject<HTMLInputElement | null>) {
  const [fits, setFits] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setFits(el.clientWidth >= 400))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return fits
}

// Phones (<=767px): Deadlines and Export fold into a "More" menu beside New
// ticket, the stat tiles become one sideways-scrolling row of chips that filter
// the list, and the extra filters sit behind a Filters button.
// Whenever the list is narrower than the table needs (about 1000px with the
// Due column: phones, tablets, small laptops) each ticket is a card instead of
// a table row, two across when there's room. Desktop keeps the full-width table with one compact row of
// stat cards.
const TICKETS_CSS = `
  .tk-page { padding: 24px; }
  .tk-actions { display: flex; gap: 8px; align-items: center; }
  .tk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: #fff; color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .tk-btn:hover { background: var(--canvas); }
  .tk-btn-primary { border: none; background: var(--coral); color: #fff; }
  .tk-btn-primary:hover { background: var(--coral); filter: brightness(1.04); }
  .tk-more { position: relative; display: none; }
  .tk-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 230px; padding: 6px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 40px rgba(16,24,40,.14); }
  .tk-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: none; background: none; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; }
  .tk-menu button:hover, .tk-menu button:focus-visible { background: var(--canvas); outline: none; }
  .tk-menu svg { color: var(--slate); flex-shrink: 0; }

  .tk-scrim { position: fixed; inset: 0; z-index: 29; background: transparent; }

  /* One row however many cards there are (4, or 5 with deadlines on). */
  .tk-stats { container: tk-stats / inline-size; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
  .tk-stat { --tk-c: var(--coral); --tk-bg: var(--peach); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: #fff; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, background .15s; -webkit-tap-highlight-color: transparent; }
  .tk-stat:hover { border-color: #d5d8de; }
  .tk-stat[aria-pressed="true"] { border-color: var(--tk-c); box-shadow: inset 0 0 0 1px var(--tk-c); }
  .tk-stat-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--tk-bg); color: var(--tk-c); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .tk-stat-txt { min-width: 0; }
  .tk-stat-n { display: block; font-size: 22px; font-weight: 800; line-height: 1; }
  .tk-stat-l { display: block; margin-top: 4px; font-size: 12.5px; font-weight: 600; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tk-stat[data-alert] { background: #fffafa; }
  .tk-stat[data-alert] .tk-stat-n { color: #dc2626; }
  .tk-stat-all { display: none; }
  /* Narrow row (tablets): drop the icon tiles so the labels aren't cut short. */
  @container tk-stats (max-width: 799px) {
    .tk-stat { padding: 10px 12px; }
    .tk-stat-ic { display: none; }
  }

  .tk-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .tk-search { flex: 1; min-width: 240px; position: relative; }
  .tk-search > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--slate); pointer-events: none; }
  .tk-search input { width: 100%; height: 40px; padding: 0 14px 0 36px; border-radius: 10px; border: 1px solid var(--border); font: inherit; font-size: 14px; outline: none; box-sizing: border-box; background: #fff; color: var(--ink); -webkit-appearance: none; appearance: none; }
  .tk-search input:focus { border-color: var(--coral); }
  .tk-selects { display: contents; }
  .tk-filter-btn { display: none; }
  .tk-badge-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--coral); color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }

  .tk-list { container: tk-list / inline-size; }
  .tk-box { border: 1px solid var(--border); border-radius: 16px; background: #fff; overflow: hidden; }
  .tk-cards { display: none; }
  .tk-pager-btn { min-width: 32px; height: 32px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--border); background: #fff; color: var(--ink); font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .tk-pager-btn:disabled { opacity: .4; cursor: default; }
  .tk-pager-btn[aria-current="page"] { border-color: var(--coral); background: var(--peach); color: var(--coral); }

  /* Cards instead of the table whenever it wouldn't fit without scrolling sideways. */
  @container tk-list (max-width: 999px) {
    .tk-box { border: none; background: none; border-radius: 0; overflow: visible; }
    .tk-table { display: none; }
    .tk-cards { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tk-card { position: relative; display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; background: #fff; border: 1px solid var(--border); border-radius: 14px; min-width: 0; overflow: hidden; -webkit-tap-highlight-color: transparent; transition: background .1s; }
    .tk-card:hover { border-color: #d5d8de; }
    .tk-card:active { background: var(--canvas); }
    .tk-card[data-overdue] { border-color: #fecaca; box-shadow: inset 3px 0 0 #dc2626; }
    .tk-card:has(.tk-card-open:focus-visible) { outline: 2px solid var(--coral); outline-offset: 2px; }
    .tk-card-top { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--slate); }
    .tk-card-id { font-weight: 800; color: var(--coral); white-space: nowrap; }
    .tk-card-ch { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tk-card-top .tk-pill { margin-left: auto; }
    .tk-card-open { position: static; width: 100%; padding: 0; border: none; background: none; font: inherit; font-size: 15px; font-weight: 700; line-height: 1.35; color: var(--ink); text-align: left; cursor: pointer; outline: none; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
    .tk-card-open::after { content: ''; position: absolute; inset: 0; border-radius: 14px; }
    .tk-card-cust { margin: 0; min-width: 0; font-size: 13px; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tk-card-cust b { color: var(--ink); font-weight: 600; }
    .tk-card-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; min-width: 0; }
    .tk-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 3px; min-width: 0; font-size: 12px; color: var(--slate); }
    .tk-card-asg { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--ink); font-weight: 600; }
    .tk-card-asg > span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tk-card-asg[data-none] { color: var(--slate); font-weight: 500; }
    .tk-card-when { white-space: nowrap; flex-shrink: 0; }
    .tk-pager { padding: 12px 0 0 !important; border-top: none !important; justify-content: center !important; }
  }
  /* Tablets: two cards across. */
  @container tk-list (min-width: 600px) and (max-width: 999px) {
    ul.tk-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }

  @media (max-width: 767px) {
    .tk-page { padding: 16px; }
    .tk-page > .ph-root { margin: -16px -16px 12px !important; }
    .tk-page > .ph-root .ph-row > div > p { display: none; }
    .tk-desk { display: none !important; }
    .tk-more { display: block; }
    .tk-btn { height: 40px; }
    .tk-btn-more { width: 40px; padding: 0; }
    .tk-btn-primary { padding: 0 13px; }

    .tk-stats { display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px 12px; padding: 1px 16px; scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
    .tk-stats::-webkit-scrollbar { display: none; }
    .tk-stat { flex: 0 0 auto; gap: 0; height: 36px; padding: 0 13px; border-radius: 999px; }
    .tk-stat-all { display: flex; }
    .tk-stat-ic { display: none; }
    .tk-stat-txt { display: flex; align-items: baseline; gap: 5px; flex-direction: row-reverse; }
    .tk-stat-n { font-size: 14px; }
    .tk-stat-l { margin: 0; font-size: 13px; color: var(--ink); }
    .tk-stat[data-alert] { background: #fff; border-color: #fecaca; }
    .tk-stat[data-alert] .tk-stat-l { color: #dc2626; }
    .tk-stat[aria-pressed="true"] { background: var(--tk-bg); border-color: var(--tk-c); box-shadow: none; }
    .tk-stat[aria-pressed="true"] .tk-stat-l, .tk-stat[aria-pressed="true"] .tk-stat-n { color: var(--tk-c); }

    .tk-filters { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-bottom: 12px; }
    .tk-search { min-width: 0; }
    .tk-search input { height: 42px; font-size: 16px; }
    .tk-filter-btn { display: inline-flex; height: 42px; }
    .tk-filter-btn[aria-expanded="true"] { border-color: var(--coral); color: var(--coral); background: var(--peach); }
    .tk-selects { display: none; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .tk-filters[data-open] .tk-selects { display: grid; }
    .tk-selects > select { width: 100%; min-width: 0; height: 42px; font-size: 16px !important; }
    .tk-selects > .tk-sel-status { display: none; }
    /* Three visible selects: the last (assignee) takes the full row. */
    .tk-selects > select:last-child:nth-child(4) { grid-column: 1 / -1; }

    .tk-modal-panel input, .tk-modal-panel select, .tk-modal-panel textarea { font-size: 16px !important; }
    .tk-sla-num { width: 58px !important; }
  }
  /* Small phones: "New" instead of "New ticket", so "Support Tickets" stays on one line. */
  @media (max-width: 380px) {
    .tk-new-word { display: none; }
  }
`

function StatusPill({ status }: { status: string }) {
  const sc = STATUS_COLORS[status] || STATUS_COLORS.open
  return <span className="tk-pill" style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.c, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{String(status || 'open').replace('_', ' ')}</span>
}

function PriorityLabel({ priority }: { priority: string }) {
  const c = PRIORITY_COLORS[priority] || '#6b7280'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: c, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{priority}
    </span>
  )
}

// The deadline that matters right now, e.g. "Reply overdue 2h" (red, with an alarm icon).
function DeadlineBadge({ sla }: { sla: any }) {
  const a = activeClock(sla)
  if (a.clock.state === 'off') return null
  const col = CLOCK_COLORS[a.clock.state]
  return (
    <span title={a.clock.dueAt ? `Due ${a.clock.dueAt.toLocaleString()}` : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 20, background: col.bg, color: col.c, whiteSpace: 'nowrap' }}>
      {a.clock.state === 'overdue' && <AlarmClockIcon size={12} />}{clockLabel(a.clock, a.what)}
    </span>
  )
}

export default function TicketsList() {
  const router = useRouter()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [sla, setSla] = useState<SlaSettings>(DEFAULT_SLA)
  const [team, setTeam] = useState<{ userId: string; name: string }[]>([])
  const [meId, setMeId] = useState('')
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'soon'>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [showSla, setShowSla] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const longPlaceholder = useFitsLongPlaceholder(searchRef)
  const [tick, setTick] = useState(0)
  // Re-render every minute so "due in…" countdowns stay current.
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(iv) }, [])

  // The phone "More" menu closes on Escape or a tap outside it. Taps on the page
  // land on a clear scrim (below), so dismissing it never also opens a ticket.
  useEffect(() => {
    if (!moreOpen) return
    const away = (e: Event) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [moreOpen])

  // The workspace whose list is on screen — a slower response for another one
  // (e.g. the cached workspace, if it turns out to have changed) is ignored.
  const activeCid = useRef('')
  const userIdRef = useRef('')

  const load = async (cid: string) => {
    const res = await authFetch(`/api/tickets?companyId=${cid}`)
    const data = await res.json()
    if (activeCid.current !== cid) return
    setTickets(data.tickets || [])
    if (data.sla) setSla(resolveSla(data.sla))
    if (Array.isArray(data.team)) setTeam(data.team)
    // Keep the list on this device so the next visit paints it at once.
    if (res.ok && Array.isArray(data.tickets)) writeLocal<TicketsCache>(CACHE_KEY, userIdRef.current, cid, toCache(data))
  }

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/signin'); return }
      const uid = session.user.id
      setMeId(uid); userIdRef.current = uid
      // Paint the last list seen on this device straight away and refresh it in
      // the background, while the workspace lookup runs.
      const cached = readLocal<TicketsCache>(CACHE_KEY, uid)
      let refreshing: Promise<void> | null = null
      if (cached?.companyId && Array.isArray(cached.data?.tickets)) {
        activeCid.current = cached.companyId
        setCompanyId(cached.companyId)
        setTickets(cached.data.tickets)
        if (cached.data.sla) setSla(resolveSla(cached.data.sla))
        if (Array.isArray(cached.data.team)) setTeam(cached.data.team)
        setLoading(false)
        refreshing = load(cached.companyId).catch(() => {})
      }
      // Owned workspace first, else the one they're a member of — both asked at once.
      const [{ data: co }, { data: tm }] = await Promise.all([
        (supabase as any).from('companies').select('id').eq('owner_id', uid).maybeSingle(),
        (supabase as any).from('team_members').select('company_id').eq('user_id', uid).maybeSingle(),
      ])
      const cid: string | undefined = co?.id || tm?.company_id
      if (cid && refreshing && cid === activeCid.current) await refreshing
      else if (cid) {
        // First visit on this device, or a different workspace — start clean.
        activeCid.current = cid
        if (refreshing) { setLoading(true); setTickets([]); setSla(DEFAULT_SLA); setTeam([]) }
        setCompanyId(cid); await load(cid)
      } else if (refreshing) {
        activeCid.current = ''
        setCompanyId(''); setTickets([]); setSla(DEFAULT_SLA); setTeam([])
      }
      setLoading(false)
      // Clear the sidebar "new tickets" badge — we've now seen them.
      try { localStorage.setItem('colvy-tickets-seen-at', new Date().toISOString()); window.dispatchEvent(new Event('tickets-seen')) } catch {}
    })()
  }, [])

  // Lower-cased search text per ticket, built once per list rather than on
  // every keystroke (and not again on the minute tick).
  const searchText = useMemo(() => tickets.map(t =>
    [t.ticket_number, t.subject, t.customer_name, t.customer_email, t.description].map((v: any) => String(v || '').toLowerCase()).join('\u0001')
  ), [tickets])
  // Each ticket's deadline clocks, recomputed every minute.
  const withSla = useMemo(() => {
    const now = new Date()
    return tickets.map((t, i) => ({ ...t, _sla: computeSla(t, sla, now), _q: searchText[i] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, searchText, sla, tick])
  const teamNames = useMemo(() => {
    const m = new Map<string, string>()
    team.forEach(t => { if (!m.has(t.userId)) m.set(t.userId, t.name) })
    return m
  }, [team])
  const teamName = (uid: string | null) => (uid && teamNames.get(uid)) || ''

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0, overdue: 0 }
    withSla.forEach(t => { if (c[t.status] != null) c[t.status]++; if (t._sla.worst === 'overdue') c.overdue++ })
    return c
  }, [withSla])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return withSla.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (dueFilter !== 'all' && t._sla.worst !== dueFilter) return false
      if (assigneeFilter === 'me' && t.assigned_to !== meId) return false
      if (assigneeFilter === 'unassigned' && t.assigned_to) return false
      if (!['all', 'me', 'unassigned'].includes(assigneeFilter) && t.assigned_to !== assigneeFilter) return false
      if (priorityFilter !== 'all' && (t.priority || 'normal') !== priorityFilter) return false
      if (!q) return true
      return t._q.includes(q)
    })
  }, [withSla, search, statusFilter, priorityFilter, dueFilter, assigneeFilter, meId])

  useEffect(() => { setPage(1) }, [search, statusFilter, priorityFilter, dueFilter, assigneeFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // Filters tucked behind the phone's Filters button (status and Overdue have their chips).
  const extraFilters = (priorityFilter !== 'all' ? 1 : 0) + (sla.enabled && dueFilter === 'soon' ? 1 : 0) + (assigneeFilter !== 'all' ? 1 : 0)

  const exportCsv = () => {
    const rows = [['Ticket', 'Subject', 'Customer', 'Email', 'Channel', 'Priority', 'Status', 'Assignee', 'Deadline', 'Created']]
    filtered.forEach(t => { const a = activeClock(t._sla); rows.push([t.ticket_number, t.subject, t.customer_name, t.customer_email, t.channel, t.priority || 'normal', t.status, teamName(t.assigned_to), clockLabel(a.clock, a.what), new Date(t.created_at).toISOString()]) })
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const selStyle: React.CSSProperties = { height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }
  const assigneeLabel = (t: any) => teamName(t.assigned_to) || (t.assigned_to ? 'Teammate' : 'Unassigned')
  const allOn = statusFilter === 'all' && dueFilter === 'all'

  return (
    <div className="tk-page">
      <style>{TICKETS_CSS}</style>
      <PageHeader
        title="Support Tickets"
        subtitle="Tickets raised from conversations, email, and help centre."
        bleed={24}
        action={
          // One wrapper, so PageHeader keeps the actions beside the title on
          // phones (it moves two or more separate actions to their own row).
          <div className="tk-actions">
            <button type="button" className="tk-btn tk-desk" onClick={() => setShowSla(true)} title="Deadlines & assignment"><ClockIcon size={15} /> Deadlines</button>
            <button type="button" className="tk-btn tk-desk" onClick={exportCsv} title="Export the filtered list as CSV"><DownloadIcon size={15} /> Export</button>
            <div className="tk-more" ref={moreRef}>
              <button type="button" className="tk-btn tk-btn-more" aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}><MoreHorizontalIcon size={18} /></button>
              {moreOpen && <div className="tk-scrim" data-overlay-ignore="" aria-hidden="true" onClick={() => setMoreOpen(false)} />}
              {moreOpen && (
                <div className="tk-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setShowSla(true) }}><ClockIcon size={16} /> Deadlines & assignment</button>
                  <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); exportCsv() }}><DownloadIcon size={16} /> Export CSV</button>
                </div>
              )}
            </div>
            <button type="button" className="tk-btn tk-btn-primary" aria-label="New ticket" onClick={() => setShowNew(true)}><PlusIcon size={15} /><span>New<span className="tk-new-word"> ticket</span></span></button>
          </div>
        }
      />

      {/* Stat cards (desktop) / filter chips (phones) */}
      <div className="tk-stats" role="group" aria-label="Filter by status">
        <button type="button" className="tk-stat tk-stat-all" aria-pressed={allOn} onClick={() => { setStatusFilter('all'); setDueFilter('all') }}>
          <span className="tk-stat-txt"><span className="tk-stat-n">{tickets.length}</span><span className="tk-stat-l">All</span></span>
        </button>
        {STAT_META.map(s => {
          const on = statusFilter === s.key
          return (
            <button key={s.key} type="button" className="tk-stat" data-key={s.key} aria-pressed={on} onClick={() => setStatusFilter(on ? 'all' : s.key)}
              style={{ '--tk-c': s.c, '--tk-bg': s.bg } as React.CSSProperties}>
              <span className="tk-stat-ic" aria-hidden="true"><s.Icon size={18} /></span>
              <span className="tk-stat-txt"><span className="tk-stat-n">{counts[s.key] || 0}</span><span className="tk-stat-l">{s.label}</span></span>
            </button>
          )
        })}
        {sla.enabled && (
          <button type="button" className="tk-stat" data-key="overdue" aria-pressed={dueFilter === 'overdue'} data-alert={counts.overdue ? '' : undefined}
            onClick={() => setDueFilter(dueFilter === 'overdue' ? 'all' : 'overdue')}
            style={{ '--tk-c': '#dc2626', '--tk-bg': '#fef2f2' } as React.CSSProperties}>
            <span className="tk-stat-ic" aria-hidden="true"><AlarmClockIcon size={18} /></span>
            <span className="tk-stat-txt"><span className="tk-stat-n">{counts.overdue || 0}</span><span className="tk-stat-l">Overdue</span></span>
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="tk-filters" data-open={filtersOpen ? '' : undefined}>
        <div className="tk-search">
          <SearchIcon size={16} />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} type="search" aria-label="Search tickets"
            placeholder={longPlaceholder ? LONG_PLACEHOLDER : 'Search tickets'} />
        </div>
        <button type="button" className="tk-btn tk-filter-btn" aria-expanded={filtersOpen} aria-controls="tk-selects" onClick={() => setFiltersOpen(o => !o)}>
          <SlidersIcon size={15} /> Filters{extraFilters > 0 && <span className="tk-badge-n">{extraFilters}</span>}
        </button>
        <div className="tk-selects" id="tk-selects">
          <select className="tk-sel-status" aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select aria-label="Priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={selStyle}>
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {sla.enabled && (
            <select aria-label="Deadline" value={dueFilter} onChange={e => setDueFilter(e.target.value as any)} style={selStyle}>
              <option value="all">All deadlines</option>
              <option value="overdue">Overdue</option>
              <option value="soon">Due soon</option>
            </select>
          )}
          <select aria-label="Assignee" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={selStyle}>
            <option value="all">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {team.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? <SkeletonList rows={6} /> : filtered.length === 0 ? (
        // Nothing to list: a few ticket cards drifting past, like the empty inbox.
        <div style={{ padding: '56px 0' }}>
          {tickets.length === 0
            ? <EmptyScroll kinds={['ticket']} title="No tickets yet" line="Tickets you open, or that customers send in, show up here." />
            : <EmptyScroll kinds={['ticket']} title="No tickets match" line="Try clearing a filter or the search." />}
        </div>
      ) : (
        <div className="tk-list">
          <div className="tk-box">
          <div className="tk-table" style={{ overflowX: 'auto' }}>
            {/* The ticket number and channel sit under the subject, so every
                column fits in 1000px; narrower lists get cards instead. */}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--canvas)' }}>
                  {['Ticket', 'Customer', 'Priority', 'Status', ...(sla.enabled ? ['Due'] : []), 'Assignee', 'Updated'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(t => {
                  const pr = t.priority || 'normal'
                  return (
                    <tr key={t.id} onClick={() => router.push(`/admin/tickets/${t.id}`)}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--canvas)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      {/* Takes the spare width; long subjects wrap to two lines, then end in an ellipsis. */}
                      <td style={{ padding: '12px 14px', width: '100%' }}>
                        <div title={t.subject} style={{ minWidth: 140, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--ink)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'break-word' }}>{t.subject}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 12, whiteSpace: 'nowrap', minWidth: 0 }}>
                          <span style={{ fontWeight: 700, color: 'var(--coral)' }}>{t.ticket_number}</span>
                          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0 }} />
                          <span style={{ color: 'var(--slate)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.channel}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials(t.customer_name)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{t.customer_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{t.customer_email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}><PriorityLabel priority={pr} /></td>
                      <td style={{ padding: '12px 14px' }}><StatusPill status={t.status} /></td>
                      {sla.enabled && (
                        <td style={{ padding: '12px 14px' }}>
                          {activeClock(t._sla).clock.state === 'off' ? <span style={{ color: '#cbd5e1' }}>—</span> : <DeadlineBadge sla={t._sla} />}
                        </td>
                      )}
                      <td style={{ padding: '12px 14px', fontSize: 13, color: t.assigned_to ? 'var(--ink)' : 'var(--slate)', whiteSpace: 'nowrap' }}>{assigneeLabel(t)}</td>
                      <td title={new Date(t.updated_at || t.created_at).toLocaleString()} style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{shortWhen(t.updated_at || t.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: one card per ticket instead of the table. */}
          <ul className="tk-cards" aria-label="Tickets">
            {pageRows.map(t => {
              const overdue = t._sla.worst === 'overdue'
              return (
                <li key={t.id} className="tk-card" data-overdue={overdue ? '' : undefined}>
                  <div className="tk-card-top">
                    <span className="tk-card-id">{t.ticket_number}</span>
                    <span className="tk-card-ch">{t.channel}</span>
                    <StatusPill status={t.status} />
                  </div>
                  {/* The subject is the card's button; its ::after covers the
                      whole card, so a tap anywhere opens the ticket. */}
                  <button type="button" className="tk-card-open" onClick={() => router.push(`/admin/tickets/${t.id}`)}>{t.subject}</button>
                  <p className="tk-card-cust"><b>{t.customer_name}</b>{t.customer_email && t.customer_email !== t.customer_name ? ` · ${t.customer_email}` : ''}</p>
                  <div className="tk-card-badges">
                    <PriorityLabel priority={t.priority || 'normal'} />
                    {sla.enabled && <DeadlineBadge sla={t._sla} />}
                  </div>
                  <div className="tk-card-foot">
                    <span className="tk-card-asg" data-none={t.assigned_to ? undefined : ''}>
                      {t.assigned_to && <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{initials(assigneeLabel(t))}</span>}
                      <span>{assigneeLabel(t)}</span>
                    </span>
                    <span className="tk-card-when">Updated {shortWhen(t.updated_at || t.created_at)}</span>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="tk-pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--slate)' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} tickets
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="tk-pager-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeftIcon size={15} /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map(p => (
                  <button type="button" key={p} className="tk-pager-btn" aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button type="button" className="tk-pager-btn" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRightIcon size={15} /></button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {showSla && <SlaSettingsModal companyId={companyId} sla={sla} onClose={() => setShowSla(false)} onSaved={s2 => { setSla(s2); setShowSla(false) }} />}
      {showNew && <NewTicketModal companyId={companyId} onClose={() => setShowNew(false)} onCreated={async () => { setShowNew(false); if (companyId) await load(companyId) }} />}
    </div>
  )
}

// Escape closes a modal (unless it's busy saving).
function useEscape(onEscape: () => void) {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
}

function ModalClose({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Close"
      style={{ width: 34, height: 34, marginRight: -6, borderRadius: 9, border: 'none', background: 'none', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <CloseIcon size={18} />
    </button>
  )
}

function NewTicketModal({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEscape(() => { if (!busy) onClose() })

  const submit = async () => {
    if (!subject.trim()) { setErr('A subject is required.'); return }
    setBusy(true); setErr('')
    try {
      const desc = `${description.trim() || '(no message)'}${name || email ? `\n\n— From: ${name || 'Customer'} <${email}>` : ''}`
      const res = await authFetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, subject: subject.trim(), description: desc, priority }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not create ticket')
      onCreated()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', minWidth: 0 }

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* The panel scrolls inside itself and its buttons stay pinned at the
          bottom, so Create is reachable even with the phone keyboard up. */}
      <div role="dialog" aria-modal="true" aria-labelledby="tk-new-title" className="tk-modal-panel" onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: '20px 22px 0', width: '100%', maxWidth: 480, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <h2 id="tk-new-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>New ticket</h2>
          <ModalClose onClick={onClose} disabled={busy} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" aria-label="Customer name" autoComplete="off" style={{ ...inp, flex: '1 1 170px', width: 'auto' }} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Customer email" aria-label="Customer email" autoComplete="off" style={{ ...inp, flex: '1 1 170px', width: 'auto' }} />
          </div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject *" aria-label="Subject" style={inp} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the issue…" aria-label="Description" style={{ ...inp, resize: 'vertical' }} />
          <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priority" style={inp}>
            <option value="low">Low priority</option>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent priority</option>
          </select>
          {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{err}</p>}
        </div>
        <div className="modal-sticky-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--ink)' }}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creating…' : 'Create ticket'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Deadlines & assignment settings ─────────────────────────────────────────
function SlaSettingsModal({ companyId, sla, onClose, onSaved }: { companyId: string; sla: SlaSettings; onClose: () => void; onSaved: (s: SlaSettings) => void }) {
  const [form, setForm] = useState<SlaSettings>(JSON.parse(JSON.stringify(sla)))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEscape(() => { if (!saving) onClose() })
  const PRI: { key: 'urgent' | 'high' | 'normal' | 'low'; label: string; color: string }[] = [
    { key: 'urgent', label: 'Urgent', color: '#dc2626' }, { key: 'high', label: 'High', color: '#d97706' },
    { key: 'normal', label: 'Normal', color: '#2563eb' }, { key: 'low', label: 'Low', color: '#6b7280' },
  ]
  const setHours = (which: 'first_response_hours' | 'resolution_hours', p: string, v: string) =>
    setForm(f => ({ ...f, [which]: { ...f[which], [p]: Number(v) } }))
  const save = async () => {
    setSaving(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/tickets/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ companyId, settings: form }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      onSaved(resolveSla(d.settings))
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }
  const num: React.CSSProperties = { width: 70, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div onClick={() => !saving && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="tk-sla-title" className="tk-modal-panel" onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box', background: '#fff', borderRadius: 16, padding: '20px 22px 0', boxShadow: '0 24px 70px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <p id="tk-sla-title" style={{ margin: 0, fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>Deadlines & assignment</p>
          <ModalClose onClick={onClose} disabled={saving} />
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>How quickly each ticket should get a first reply and be resolved, counted in hours from when it was raised. Overdue tickets are flagged and the team gets one alert.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
          <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Track deadlines
        </label>
        <div style={{ opacity: form.enabled ? 1 : 0.45, pointerEvents: form.enabled ? 'auto' : 'none' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <thead><tr>
              {['Priority', 'First reply within', 'Resolve within'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', padding: '6px 4px' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {PRI.map(p => (
                <tr key={p.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px', fontSize: 13.5, fontWeight: 700, color: p.color, whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.color, marginRight: 7, verticalAlign: 'middle' }} />{p.label}
                  </td>
                  <td style={{ padding: '8px 4px', fontSize: 13, color: 'var(--slate)', whiteSpace: 'nowrap' }}><input className="tk-sla-num" type="number" min={1} inputMode="numeric" aria-label={`${p.label}: first reply within (hours)`} value={form.first_response_hours[p.key]} onChange={e => setHours('first_response_hours', p.key, e.target.value)} style={num} /> h</td>
                  <td style={{ padding: '8px 4px', fontSize: 13, color: 'var(--slate)', whiteSpace: 'nowrap' }}><input className="tk-sla-num" type="number" min={1} inputMode="numeric" aria-label={`${p.label}: resolve within (hours)`} value={form.resolution_hours[p.key]} onChange={e => setHours('resolution_hours', p.key, e.target.value)} style={num} /> h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.auto_assign} onChange={e => setForm(f => ({ ...f, auto_assign: e.target.checked }))} style={{ marginTop: 3 }} />
          <span>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Auto-assign new tickets</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>Each new ticket goes to the teammate with the fewest open tickets.</span>
          </span>
        </label>
        {err && <p role="alert" style={{ fontSize: 12.5, color: '#dc2626', margin: '12px 0 0' }}>{err}</p>}
        <div className="modal-sticky-foot" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setForm(JSON.parse(JSON.stringify(DEFAULT_SLA)))} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Reset defaults</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
