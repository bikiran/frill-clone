'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readStored, writeStored, readCache, writeCache } from '@/lib/client-cache'
import { loadStaffRows } from '@/lib/team-list'
import {
  normaliseCall, outcomeOf, outcomeLabel, aiOutcomeOf, isAiCall, AI_OUTCOME_LABEL, AI_AGENT_NAME, aggregate, byHour, heatmap, leaderboard,
  boardWindow, boardSpan, spanOf, inWindow, callerDisplay, callAgentMatches, matchesSearch, buildAlerts, otherNumber, normName, formatPhone,
  fmtDur, fmtTalk, timeAgo, hourLabel, startOfDayTz, zonedParts, RANGES, isRangeKey, DEFAULT_TZ, prevToFor, outcomeOf as rankOutcome,
  type CcCall, type RangeKey, type AgentOption, type RecoveryItem, type CallStats,
} from '@/lib/command-centre'
import { Icon, Chip, Kpi, Trend, WhyInline, Segmented, Spinner, LiveTimer, Clock, C, card, kicker, ctrl, tint, btn, iconBtn, useNarrow, OUTCOME_COLOR, Skel, SkelRows } from './ui'

// Only needed after a click (a call, Text back) or on the Insights tab, so
// they load on their own and stay out of the board's first download.
const CallDrawer = dynamic(() => import('./CallDrawer'), { ssr: false })
const TextBack = dynamic(() => import('./TextBack'), { ssr: false })
const AiSummarySkel = () => <div aria-busy="true" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}><Skel w={180} h={14} /><Skel w="70%" h={11} /><Skel w="55%" h={11} /></div>
const AiSummary = dynamic(() => import('./AiSummary'), { ssr: false, loading: AiSummarySkel })

// ── Command Centre ───────────────────────────────────────────────────────────
// A live call-centre dashboard: Live Board, Call Logs and Insights for calls,
// plus an SMS view. Calls come from /api/command-centre/calls (one row per call,
// with the caller's name and store worked out on the server); the board stays
// live through a realtime subscription on `calls`, with a light poll as a
// safety net. Every count follows lib/command-centre, in the business's
// timezone. Missed callers nobody has returned, the AI receptionist's work and
// an AI summary of the period sit alongside.
//
// Loading: the page and its placeholders show straight away. The first
// request (/board) brings the calls and the board's settings together, the
// period worked out on the server in the business's own timezone, while the
// missed callers and opening hours (/overview, which may wait on Google) and
// the team load alongside and fill in their own panels.

type Overview = {
  timezone: string
  openNow: boolean | null
  hoursToday: string | null
  locations: { id: string; name: string }[]
  recovery: { missed: number; recovered: number; textedBack: number; items: RecoveryItem[] }
  missedCallText: { enabled: boolean; when: 'always' | 'after_hours' }
  phoneAgent: { enabled: boolean; mode: string | null }
  aiPaused: boolean
}
type BoardContext = Pick<Overview, 'timezone' | 'locations' | 'missedCallText' | 'phoneAgent' | 'aiPaused'>
// What the board's first request brings: the calls for the period it read
// (`from`/`to`) and, from /board, the board's settings.
type BoardAnswer = { calls: CcCall[]; truncated: false | { total: number | null }; context: BoardContext | null; from: number; to: number | null }
type Agent = { id: string; name: string; avatar: string | null; role: string | null; status: 'available' | 'oncall' | 'offline' }
type Sms = { id: string; conversation_id: string | null; sender_type: string | null; sender_name: string | null; content: string | null; created_at: string }
type Tab = 'live' | 'logs' | 'insights'
type OutcomeFilter = 'all' | 'answered' | 'missed' | 'voicemail' | 'unanswered' | 'ai'
type ViewPrefs = { tab: Tab; locFilter: string; agentFilter: string; hour12: boolean; commsMode?: 'calls' | 'sms'; boardRange?: string }

const VIEW_KEY = 'cc_view_default'
const FALLBACK_OVERVIEW: Overview = {
  timezone: DEFAULT_TZ, openNow: null, hoursToday: null, locations: [], recovery: { missed: 0, recovered: 0, textedBack: 0, items: [] },
  missedCallText: { enabled: false, when: 'always' }, phoneAgent: { enabled: false, mode: null }, aiPaused: false,
}
const PAGE = 100
// Kept in this browser (wiped on sign-out) so the next visit starts in the
// right timezone and paints the missed callers and team names at once.
const ovKey = (cid: string) => `cc:overview:${cid}`
const namesKey = (cid: string) => `cc:names:${cid}`
// The calls for a period, for coming back to the page without a reload.
const callsKey = (cid: string, from: number, to: number | null) => `cc:calls:${cid}:${from}:${to ?? 'open'}`
const CACHE_CALLS_MAX = 3000
// The missed callers and opening hours are the slowest read: at most one at a
// time, and not more often than this unless asked (a text was just sent).
const OVERVIEW_GAP_MS = 30_000
// loading → nothing yet; stored → last visit's list while this visit's loads;
// live → this visit's; stale → last visit's, this visit's didn't come; failed → none.
type RecoveryState = 'loading' | 'stored' | 'live' | 'stale' | 'failed'
const smsInbound = (m: Sms) => ['visitor', 'customer', 'contact'].includes(String(m.sender_type || '').toLowerCase())
const initialsOf = (n: string) => n.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
const MODE_TEXT: Record<string, string> = { test: 'your test numbers only', after_hours: 'outside opening hours', no_answer: 'when nobody picks up', always: 'every call' }
const agentLabel = (n: string | null) => (n === AI_AGENT_NAME ? 'AI receptionist' : n)

export default function CommandCentrePage() {
  const narrow = useNarrow(760)
  const [tab, setTab] = useState<Tab>('live')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [me, setMe] = useState<{ id: string; name: string | null } | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const tz = ov?.timezone || DEFAULT_TZ
  const [calls, setCalls] = useState<CcCall[]>([])
  const [callsLoading, setCallsLoading] = useState(true)
  const [callsError, setCallsError] = useState('')
  const [truncated, setTruncated] = useState<false | { total: number | null }>(false)
  const [roster, setRoster] = useState<Agent[]>([])
  const [locFilter, setLocFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [commsMode, setCommsMode] = useState<'calls' | 'sms'>('calls')
  const [range, setRange] = useState<RangeKey>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [rangeMenu, setRangeMenu] = useState(false)
  const [sms, setSms] = useState<Sms[]>([])
  const [smsLoaded, setSmsLoaded] = useState(false)
  // booted: the first calls are in. Until then the board shows placeholders.
  const [booted, setBooted] = useState(false)
  // The business's timezone is known: kept from the last visit, or the board
  // or the overview said. The AI summary waits for it, so it never summarises
  // a period worked out in the wrong timezone (and never asks the AI twice).
  const [tzSure, setTzSure] = useState(false)
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('loading')
  const [rosterLoaded, setRosterLoaded] = useState(false)
  // Who's available, as soon as presence is in (the list itself waits for names).
  const [teamCounts, setTeamCounts] = useState<{ available: number; total: number; oncall: number } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const [hour12, setHour12] = useState(false)
  const [showClockMenu, setShowClockMenu] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const clockMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Call Logs filters
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')
  const [topic, setTopic] = useState<{ name: string; callIds: string[] } | null>(null)
  const [shown, setShown] = useState(PAGE)

  // Drawer and text-back
  const [drawer, setDrawer] = useState<CcCall | null>(null)
  const [textBack, setTextBack] = useState<{ call: CcCall; who: string } | null>(null)
  const [toast, setToast] = useState('')
  const recoveryRef = useRef<HTMLDivElement | null>(null)

  // ── Saved view and links ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY)
      if (raw) {
        const v = JSON.parse(raw) as ViewPrefs
        if (v.tab) setTab(v.tab)
        if (v.locFilter) setLocFilter(v.locFilter)
        if (v.agentFilter) setAgentFilter(v.agentFilter)
        if (typeof v.hour12 === 'boolean') setHour12(v.hour12)
        if (v.commsMode) setCommsMode(v.commsMode)
        if (v.boardRange && isRangeKey(v.boardRange) && v.boardRange !== 'custom') setRange(v.boardRange)
      }
    } catch {}
    // A link can open a filtered view (the home dashboard's call-back list
    // opens ?tab=logs&range=7d&dir=inbound). It wins over the saved default.
    try {
      const q = new URLSearchParams(window.location.search)
      const t = q.get('tab'), r = q.get('range'), d = q.get('dir'), o = q.get('outcome')
      if (t === 'live' || t === 'logs' || t === 'insights') setTab(t)
      if (r && r !== 'custom' && isRangeKey(r)) setRange(r)
      if (d === 'inbound' || d === 'outbound') setDirFilter(d)
      if (o === 'answered' || o === 'missed' || o === 'voicemail' || o === 'unanswered' || o === 'ai') setOutcomeFilter(o)
      if (t || r || d || o) setCommsMode('calls')
    } catch {}
  }, [])

  const saveDefaultView = () => {
    try {
      const v: ViewPrefs = { tab, locFilter, agentFilter, hour12, commsMode, boardRange: range === 'custom' ? 'today' : range }
      localStorage.setItem(VIEW_KEY, JSON.stringify(v))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1600)
    } catch {}
  }

  // ── Who and where ────────────────────────────────────────────────────────
  // The admin already knows the company (no wait); the last overview kept in
  // this browser gives the timezone, stores and missed callers at once.
  useEffect(() => {
    let live = true
    const start = (cid: string | null) => {
      if (cid) {
        const kept = readStored<Overview>(ovKey(cid))
        if (kept?.timezone && Array.isArray(kept.recovery?.items)) {
          setOv(prev => prev || { ...FALLBACK_OVERVIEW, ...kept, openNow: null, hoursToday: null })
          setRecoveryState(st => (st === 'loading' ? 'stored' : st))
          setTzSure(true)
        }
      }
      setCompanyId(cid)
      if (!cid) { setBooted(true); setCallsLoading(false); setRecoveryState('live'); setRosterLoaded(true); setTeamCounts({ available: 0, total: 0, oncall: 0 }) }
    }
    const known = peekCompanyUser()?.companyId || null
    if (known) start(known)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!live) return
      if (session?.user) setMe({ id: session.user.id, name: (session.user.user_metadata as any)?.display_name || (session.user.user_metadata as any)?.full_name || null })
      if (known) return
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co?.id) cid = co.id
        }
      }
      if (!cid && session?.user) {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        cid = co?.id || null
      }
      if (live) start(cid)
    })()
    return () => { live = false }
  }, [])

  // Without it the board still works: the default timezone, no stores, no
  // missed-call list (an older server or a blip), and it's tried again later.
  // One at a time, and at most every 30 seconds unless `force` (a later ask
  // inside the gap runs when the gap ends; a forced ask during a load runs
  // again straight after it).
  const ovBusy = useRef(false)
  const ovAgain = useRef(false)
  const ovLastAt = useRef(0)
  const ovLater = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadOverview = useCallback(async (cid: string, force = false): Promise<void> => {
    if (ovBusy.current) { if (force) ovAgain.current = true; return }
    const wait = ovLastAt.current + OVERVIEW_GAP_MS - Date.now()
    if (!force && wait > 0) {
      if (!ovLater.current) ovLater.current = setTimeout(() => { ovLater.current = null; loadOverview(cid) }, wait)
      return
    }
    ovBusy.current = true
    ovLastAt.current = Date.now()
    try {
      const r = await authFetch(`/api/command-centre/overview?companyId=${encodeURIComponent(cid)}`)
      if (r.ok) {
        const d = await r.json() as Overview
        setOv(d)
        setRecoveryState('live')
        setTzSure(true)
        // Kept without "open now" and today's hours, which are only true today.
        writeStored(ovKey(cid), { ...d, openNow: null, hoursToday: null })
        return
      }
    } catch {} finally {
      ovBusy.current = false
      if (ovAgain.current) { ovAgain.current = false; setTimeout(() => loadOverview(cid, true), 0) }
    }
    setOv(prev => prev || FALLBACK_OVERVIEW)
    setRecoveryState(st => (st === 'loading' ? 'failed' : st === 'stored' ? 'stale' : st))
  }, [])
  useEffect(() => () => { if (ovLater.current) clearTimeout(ovLater.current) }, [])

  // ── Team presence (names once; presence every 30s) ───────────────────────
  // Names kept from the last visit show the list straight away; this visit's
  // names replace them when they arrive.
  const namesRef = useRef<Record<string, { name: string | null; avatar_url: string | null; email?: string | null }>>({})
  const namesFresh = useRef<Set<string>>(new Set())
  const namesSeeded = useRef(false)
  const teamBaseRef = useRef<Map<string, { name: string | null; role: string | null }>>(new Map())
  const loadTeam = useCallback(async (cid: string, full: boolean) => {
    if (!namesSeeded.current) {
      namesSeeded.current = true
      const kept = readStored<Record<string, { name: string | null; avatar_url: string | null }>>(namesKey(cid))
      if (kept && typeof kept === 'object') for (const [u, n] of Object.entries(kept)) if (!(u in namesRef.current)) namesRef.current[u] = n
    }
    const [membersRes, coRes, presRes] = await Promise.all([
      full ? loadStaffRows(supabase, cid, 'user_id, email, name, role').then(data => ({ data }), () => ({ data: null })) : Promise.resolve({ data: null as any }),
      full ? (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle() : Promise.resolve({ data: null }),
      (supabase as any).from('agent_presence').select('user_id, available, last_seen_at').eq('company_id', cid).gte('last_seen_at', new Date(Date.now() - 120000).toISOString()),
    ])
    const presMap: Record<string, boolean> = {}
    for (const p of presRes.data || []) if (p.user_id) presMap[p.user_id] = p.available !== false
    const byId = teamBaseRef.current
    if (full) {
      for (const m of membersRes.data || []) if (m.user_id) byId.set(m.user_id, { name: m.name || (m.email ? String(m.email).split('@')[0] : null), role: m.role || null })
      const ownerId = coRes.data?.owner_id
      if (ownerId && !byId.has(ownerId)) byId.set(ownerId, { name: coRes.data?.name || null, role: 'owner' })
    }
    const unknown = Object.keys(presMap).filter(u => !byId.has(u))
    for (const u of unknown) byId.set(u, { name: null, role: null })
    const build = (): Agent[] => Array.from(byId.entries()).map(([uid, base]) => {
      const n = namesRef.current[uid]
      const nm = n?.name || base.name || (n?.email ? String(n.email).split('@')[0] : 'Team member')
      const status: Agent['status'] = !(uid in presMap) ? 'offline' : (presMap[uid] ? 'available' : 'oncall')
      return { id: uid, name: nm, avatar: n?.avatar_url || null, role: base.role, status }
    }).sort((a, b) => ({ available: 0, oncall: 1, offline: 2 }[a.status] - { available: 0, oncall: 1, offline: 2 }[b.status]) || a.name.localeCompare(b.name))
    const ids = Array.from(byId.keys())
    setTeamCounts({ total: ids.length, available: ids.filter(u => presMap[u] === true).length, oncall: ids.filter(u => presMap[u] === false).length })
    const need = ids.filter(u => !namesFresh.current.has(u))
    if (need.length) {
      // Everyone already has a name from last time: show the list now.
      if (need.every(u => u in namesRef.current)) { setRoster(build()); setRosterLoaded(true) }
      try {
        const r = await authFetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: need }) })
        const d = await r.json()
        for (const u of need) { namesRef.current[u] = d.names?.[u] || { name: null, avatar_url: null }; namesFresh.current.add(u) }
        writeStored(namesKey(cid), Object.fromEntries(Object.entries(namesRef.current).map(([u, n]) => [u, { name: n?.name || null, avatar_url: n?.avatar_url || null }])))
      } catch {}
    }
    setRoster(build())
    setRosterLoaded(true)
  }, [])

  // ── The period ───────────────────────────────────────────────────────────
  // Recomputed when the range, timezone or local day changes (not every tick).
  const dayKey = useMemo(() => { const p = zonedParts(nowTick, tz); return `${p.y}-${p.m}-${p.d}` }, [nowTick, tz])
  const win = useMemo(() => boardWindow(range, Date.now(), tz, { from: customFrom, to: customTo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, tz, customFrom, customTo, dayKey])
  const { from: fetchFrom, to: fetchTo } = spanOf(win)
  // Today's calls too when the period is in the past, so live calls and the
  // activity feed are always current.
  const todayFrom = useMemo(() => { const t0 = startOfDayTz(Date.now(), tz); return fetchTo != null && fetchTo <= t0 ? t0 : null },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tz, fetchTo, dayKey])
  const fetchSpan = useRef<{ from: number; to: number | null }>({ from: 0, to: null })
  // Asks for the period again (the server's day and this browser's disagree).
  const [reload, setReload] = useState(0)

  const fetchCalls = useCallback(async (cid: string, from: number, to: number | null) => {
    const q = new URLSearchParams({ companyId: cid, from: String(from), to: to == null ? 'open' : String(to) })
    const r = await authFetch(`/api/command-centre/calls?${q}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Couldn’t load calls')
    return { calls: (d.calls || []) as CcCall[], truncated: d.truncated ? { total: typeof d.total === 'number' ? d.total : null } : false as const }
  }, [])

  // The first load: the same calls plus the board's settings, in one request.
  // The server works the period out from its name in the business's own
  // timezone and says which one it read. An older server without /board: the
  // calls on their own, as before.
  const fetchBoard = useCallback(async (cid: string, from: number, to: number | null, period: { range: RangeKey; customFrom: string; customTo: string }): Promise<BoardAnswer> => {
    const q = new URLSearchParams({ companyId: cid, from: String(from), to: to == null ? 'open' : String(to), range: period.range })
    if (period.range === 'custom') { q.set('cfrom', period.customFrom); q.set('cto', period.customTo) }
    const r = await authFetch(`/api/command-centre/board?${q}`)
    if (r.status === 404) return { ...(await fetchCalls(cid, from, to)), context: null, from, to }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Couldn’t load calls')
    const context: BoardContext | null = d.timezone
      ? { timezone: d.timezone, locations: d.locations || [], missedCallText: d.missedCallText || FALLBACK_OVERVIEW.missedCallText, phoneAgent: d.phoneAgent || FALLBACK_OVERVIEW.phoneAgent, aiPaused: !!d.aiPaused }
      : null
    return {
      calls: (d.calls || []) as CcCall[], truncated: d.truncated ? { total: typeof d.total === 'number' ? d.total : null } : false as const, context,
      from: typeof d.from === 'number' ? d.from : from, to: typeof d.to === 'number' || d.to === null ? d.to : to,
    }
  }, [fetchCalls])

  // Load the period (and today's calls when the period is in the past). The
  // first load on a visit goes through /board. Its answer is kept until it's
  // used: when the timezone it brings moves the period (the page guessed the
  // timezone), or the timezone came from the overview while it was still out,
  // the next run takes it instead of asking again, since /board read the
  // period in the business's own timezone.
  const boardDone = useRef(false)
  const bootAnswer = useRef<{ cid: string; p: Promise<BoardAnswer> } | null>(null)
  useEffect(() => {
    if (!companyId) return
    let live = true
    setCallsLoading(true); setCallsError('')
    const needToday = todayFrom != null
    const key = callsKey(companyId, fetchFrom, fetchTo)
    // Back on the page without a reload: the last copy at once, then fresh.
    const hit = !needToday ? readCache<{ calls: CcCall[]; truncated: false | { total: number | null } }>(key) : undefined
    if (hit) { setCalls(hit.calls); setTruncated(hit.truncated); setBooted(true) }
    const isThis = (a: { from: number; to: number | null }) => a.from === fetchFrom && a.to === fetchTo
    const plain = () => fetchCalls(companyId, fetchFrom, fetchTo).then(a => ({ ...a, context: null, from: fetchFrom, to: fetchTo }))
    const period = { range, customFrom, customTo }
    let main: Promise<BoardAnswer>
    const kept = bootAnswer.current?.cid === companyId ? bootAnswer.current.p : null
    if (kept) main = kept.then(a => (isThis(a) ? a : plain().then(x => ({ ...x, context: a.context }))), plain)
    else if (!boardDone.current) {
      boardDone.current = true
      main = fetchBoard(companyId, fetchFrom, fetchTo, period)
      bootAnswer.current = { cid: companyId, p: main }
      main.catch(() => {})
    } else main = plain()
    let retry = false
    Promise.all([
      main,
      needToday ? fetchCalls(companyId, todayFrom!, null) : Promise.resolve({ calls: [] as CcCall[], truncated: false as const }),
    ]).then(([a, b]) => {
      if (!live) return
      if (a.context) {
        const ctx = a.context
        setOv(prev => ({ ...(prev || FALLBACK_OVERVIEW), ...ctx }))
        setTzSure(true)
        // The period this page asks for once it has that timezone. If it
        // moves, the run that follows takes the board's answer (kept above).
        const now = Date.now()
        const next = boardSpan(period.range, now, ctx.timezone, { from: period.customFrom, to: period.customTo })
        const t0 = startOfDayTz(now, ctx.timezone)
        const nextToday = next.to != null && next.to <= t0 ? t0 : null
        if (!isThis(next) || nextToday !== todayFrom) { retry = true; return }
      }
      bootAnswer.current = null
      // The server read another period (its clock and this browser's
      // disagree about the day): ask for this one.
      if (!isThis(a)) { retry = true; setReload(n => n + 1); return }
      const seen = new Set(a.calls.map(c => c.id))
      const merged = [...b.calls.filter(c => !seen.has(c.id)), ...a.calls].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
      setCalls(merged)
      setTruncated(a.truncated)
      fetchSpan.current = { from: fetchFrom, to: fetchTo }
      if (!needToday && merged.length <= CACHE_CALLS_MAX) writeCache(key, { calls: merged, truncated: a.truncated })
    }).catch(e => { if (live) { bootAnswer.current = null; setCallsError(e?.message || 'Couldn’t load calls') } })
      .finally(() => { if (live && !retry) { setCallsLoading(false); setBooted(true); setTzSure(true) } })
    return () => { live = false }
  }, [companyId, fetchFrom, fetchTo, todayFrom, reload, fetchCalls, fetchBoard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh the last stretch from the server (names, stores and merged
  // duplicates for new calls; status changes a realtime event may have missed).
  const refreshRecent = useCallback(async (cid: string, sinceMs: number) => {
    try {
      const { calls: fresh } = await fetchCalls(cid, sinceMs, null)
      setCalls(prev => {
        const keep = prev.filter(c => Date.parse(c.created_at) < sinceMs)
        return [...fresh, ...keep].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
      })
    } catch {}
  }, [fetchCalls])

  // Boot: the missed callers and opening hours, and the team, alongside the
  // board's first request (neither holds it up).
  useEffect(() => {
    if (!companyId) return
    loadOverview(companyId, true)
    loadTeam(companyId, true).catch(() => setRosterLoaded(true))
  }, [companyId, loadOverview, loadTeam])

  // Once the board is up, fetch the call drawer and Text back in the
  // background so the first click opens them without a wait.
  useEffect(() => {
    if (!booted) return
    const w = window as any
    const warm = () => { import('./CallDrawer').catch(() => {}); import('./TextBack').catch(() => {}) }
    const id = w.requestIdleCallback ? w.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 1500)
    return () => { if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id) }
  }, [booted])
  // Opening on Insights: fetch the AI summary's code while the timezone is
  // confirmed, so it can ask the moment it is.
  useEffect(() => { if (tab === 'insights') import('./AiSummary').catch(() => {}) }, [tab])

  // ── Keeping it live ──────────────────────────────────────────────────────
  // Realtime on `calls` patches rows as they change; a debounced refresh then
  // fills in names and stores for new calls, and the missed-call list follows.
  // Every timer and the channel are cleaned up on unmount.
  useEffect(() => {
    if (!companyId) return
    let recentT: ReturnType<typeof setTimeout> | null = null
    let ovT: ReturnType<typeof setTimeout> | null = null
    const soon = (kind: 'recent' | 'ov') => {
      if (kind === 'recent') { if (recentT) clearTimeout(recentT); recentT = setTimeout(() => refreshRecent(companyId, Date.now() - 20 * 60_000), 2500) }
      else { if (ovT) clearTimeout(ovT); ovT = setTimeout(() => loadOverview(companyId), 8000) }
    }
    const channel = (supabase as any)
      .channel(`cc-calls-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        if (payload.eventType === 'DELETE') { setCalls(prev => prev.filter(c => c.id !== payload.old?.id)); return }
        const row = payload.new
        if (!row?.id) return
        setCalls(prev => {
          const i = prev.findIndex(c => c.id === row.id)
          if (i >= 0) { const next = prev.slice(); next[i] = normaliseCall(row, prev[i]); return next }
          const fresh = normaliseCall(row)
          // A second row for a call already on the board (a provider retry):
          // keep one, the more complete, as the server does.
          const j = fresh.pkey ? prev.findIndex(c => c.pkey === fresh.pkey) : -1
          if (j >= 0) {
            const RANK = { answered: 3, voicemail: 2, missed: 1, live: 0 } as const
            if (RANK[rankOutcome(fresh)] <= RANK[rankOutcome(prev[j])]) return prev
            const next = prev.slice(); next[j] = fresh; return next
          }
          return [fresh, ...prev]
        })
        if (payload.eventType === 'INSERT') soon('recent')
        if (row.ended_at || ['missed', 'voicemail', 'completed'].includes(String(row.status || '')) || String(row.direction) === 'outbound') soon('ov')
      })
      .subscribe()
    return () => {
      if (recentT) clearTimeout(recentT)
      if (ovT) clearTimeout(ovT)
      ;(supabase as any).removeChannel(channel)
    }
  }, [companyId, refreshRecent, loadOverview])

  // Safety net: presence every 30s, the last two hours of calls every 60s, the
  // overview every 2 minutes, only while the tab is visible. Back on the tab:
  // all at once.
  useEffect(() => {
    if (!companyId) return
    let n = 0
    const tick = () => {
      setNowTick(Date.now())
      if (!visible()) return
      n++
      loadTeam(companyId, false).catch(() => {})
      if (n % 2 === 0) refreshRecent(companyId, Math.max(fetchSpan.current.from, Date.now() - 2 * 3600_000))
      if (n % 4 === 0) loadOverview(companyId)
    }
    const iv = setInterval(tick, 30_000)
    const onVis = () => { if (visible()) { setNowTick(Date.now()); loadTeam(companyId, false).catch(() => {}); refreshRecent(companyId, Math.max(fetchSpan.current.from, Date.now() - 2 * 3600_000)); loadOverview(companyId) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [companyId, loadTeam, refreshRecent, loadOverview])

  // ── SMS (only while the SMS view is open) ────────────────────────────────
  // The counts and the by-hour chart only need who sent each text and when,
  // so the period's texts come without their words; the words come only for
  // the latest few the activity list shows.
  const [smsRecent, setSmsRecent] = useState<Sms[]>([])
  useEffect(() => {
    if (!companyId || commsMode !== 'sms') return
    let live = true
    setSmsLoaded(false)
    const load = async () => {
      if (!visible()) return
      const inPeriod = (q: any, from: number) => { q = q.eq('company_id', companyId).eq('delivery_channel', 'sms').gte('created_at', new Date(from).toISOString()); return fetchTo != null ? q.lt('created_at', new Date(fetchTo).toISOString()) : q }
      const [all, recent] = await Promise.all([
        inPeriod((supabase as any).from('messages').select('id, conversation_id, sender_type, created_at, is_internal'), fetchFrom).order('created_at', { ascending: false }).limit(5000),
        inPeriod((supabase as any).from('messages').select('id, conversation_id, sender_type, sender_name, content, created_at, is_internal'), win.from).order('created_at', { ascending: false }).limit(60),
      ])
      if (!live) return
      setSms(((all.data || []) as any[]).filter(m => !m.is_internal).map(m => ({ ...m, sender_name: null, content: null })))
      setSmsRecent(((recent.data || []) as any[]).filter(m => !m.is_internal))
      setSmsLoaded(true)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { live = false; clearInterval(iv) }
  }, [companyId, commsMode, fetchFrom, fetchTo, win.from])

  // ── Filters ──────────────────────────────────────────────────────────────
  const agentOptions = useMemo<AgentOption[]>(() => {
    const out: AgentOption[] = []
    const names = new Set<string>()
    for (const a of roster) { out.push({ key: `u:${a.id}`, id: a.id, name: a.name }); names.add(normName(a.name)) }
    for (const c of calls) {
      if (!c.agent_name || c.agent_name === AI_AGENT_NAME || normName(c.agent_name) === 'agent') continue
      const k = normName(c.agent_name)
      if (!names.has(k)) { names.add(k); out.push({ key: `n:${k}`, id: null, name: c.agent_name }) }
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [roster, calls])
  const selectedAgent = useMemo<AgentOption | 'ai' | null>(() => {
    if (agentFilter === 'all') return null
    if (agentFilter === 'ai') return 'ai'
    // Older saved views kept the name.
    return agentOptions.find(o => o.key === agentFilter) || agentOptions.find(o => normName(o.name) === normName(agentFilter)) || { key: agentFilter, id: null, name: agentFilter.replace(/^[un]:/, '') }
  }, [agentFilter, agentOptions])

  const locName = useCallback((id: string | null) => (id ? ov?.locations.find(l => l.id === id)?.name || null : null), [ov])

  const scoped = useMemo(() => {
    let arr = calls
    if (locFilter === 'none') arr = arr.filter(c => !c.location_id)
    else if (locFilter !== 'all') arr = arr.filter(c => c.location_id === locFilter)
    if (selectedAgent === 'ai') arr = arr.filter(c => isAiCall(c))
    else if (selectedAgent) arr = arr.filter(c => callAgentMatches(c, selectedAgent))
    return arr
  }, [calls, locFilter, selectedAgent])

  // Open periods compare with the same wall-clock point before (safe across daylight saving).
  const prevTo = Number.isFinite(win.to) || !win.prevTo ? win.prevTo : prevToFor(range === 'custom' ? 'today' : range, nowTick, tz, win.from)
  const cur = useMemo(() => scoped.filter(c => inWindow(c, win.from, win.to)), [scoped, win])
  const prev = useMemo(() => (prevTo > win.prevFrom ? scoped.filter(c => inWindow(c, win.prevFrom, prevTo)) : []), [scoped, win, prevTo])
  const stats = useMemo(() => aggregate(cur, nowTick), [cur, nowTick])
  const pstats = useMemo(() => aggregate(prev, nowTick), [prev, nowTick])
  const hasPrev = range !== 'all'
  const liveCalls = useMemo(() => scoped.filter(c => outcomeOf(c, nowTick) === 'live'), [scoped, nowTick])
  const available = roster.filter(a => a.status === 'available')
  const onCallAgents = roster.filter(a => a.status === 'oncall')
  const rangeLabel = range === 'custom' && customFrom && customTo ? `${customFrom} to ${customTo}` : (RANGES.find(([k]) => k === range)?.[1] || 'Today')
  const isToday = range === 'today'

  const recovery = useMemo(() => (recoveryState === 'stored' || recoveryState === 'live' || recoveryState === 'stale' ? ov?.recovery.items || [] : []), [recoveryState, ov])
  const loading = !booted
  // Nothing to warn about until the calls are in (and "nobody available" only once the team is).
  const alerts = useMemo(() => (loading ? [] : buildAlerts({ stats, recovery, live: liveCalls, available: teamCounts ? teamCounts.available : 1, now: nowTick, tz, isToday })), [loading, stats, recovery, liveCalls, teamCounts, nowTick, tz, isToday])
  // A number on a tile, or its placeholder while the calls load.
  const kv = (v: React.ReactNode) => (loading ? <Skel w={52} h={22} /> : v)
  const ks = (v: React.ReactNode) => (loading ? null : v)

  const logRows = useMemo(() => {
    const ids = topic ? new Set(topic.callIds) : null
    return cur.filter(c => {
      if (ids && !ids.has(c.id)) return false
      if (dirFilter !== 'all' && c.direction !== dirFilter) return false
      if (search.trim() && !matchesSearch(c, search, locName(c.location_id))) return false
      return true
    })
  }, [cur, topic, dirFilter, search, locName])
  const logStats = useMemo(() => aggregate(logRows, nowTick), [logRows, nowTick])
  const tableRows = useMemo(() => logRows.filter(c => {
    if (outcomeFilter === 'all') return true
    if (outcomeFilter === 'ai') return isAiCall(c)
    const k = outcomeLabel(c, nowTick).key
    if (outcomeFilter === 'answered') return k === 'answered' || k === 'connected'
    if (outcomeFilter === 'unanswered') return k === 'missed' || k === 'voicemail'
    return k === outcomeFilter
  }), [logRows, outcomeFilter, nowTick])
  useEffect(() => { setShown(PAGE) }, [tab, range, search, dirFilter, outcomeFilter, topic, locFilter, agentFilter])

  const feed = useMemo(() => scoped.slice(0, 14), [scoped])
  const outcomeOptions: [OutcomeFilter, React.ReactNode][] = [
    ['all', 'All'], ['answered', 'Answered'], ['missed', 'Missed'], ['voicemail', 'Voicemail'],
    ...(outcomeFilter === 'unanswered' ? [['unanswered', 'Not answered'] as [OutcomeFilter, React.ReactNode]] : []),
    ['ai', <>{Icon.spark(11)} AI</>],
  ]
  const leaders = useMemo(() => leaderboard(cur, nowTick), [cur, nowTick])
  const aiCalls = useMemo(() => cur.filter(c => c.direction === 'inbound' && isAiCall(c)), [cur])

  // ── Actions ──────────────────────────────────────────────────────────────
  const callBack = (c: { number: string | null; name?: string | null; contactId?: string | null; conversationId?: string | null }) => {
    if (!c.number) return
    try { window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: c.number, name: c.name || undefined, contactId: c.contactId || undefined, conversationId: c.conversationId || undefined, autoStart: true } })) } catch {}
  }
  const callBackCall = (c: CcCall) => callBack({ number: otherNumber(c), name: callerDisplay(c).known ? callerDisplay(c).title : null, contactId: c.contact_id, conversationId: c.conversation_id })
  const openTextBack = (c: CcCall) => setTextBack({ call: c, who: callerDisplay(c).known ? callerDisplay(c).title.split(' ')[0] : formatPhone(otherNumber(c)) })
  const recoveryCall = (r: RecoveryItem): CcCall => calls.find(c => c.id === r.callId) || normaliseCall({ id: r.callId, direction: 'inbound', status: r.voicemail ? 'voicemail' : 'missed', is_voicemail: r.voicemail, from_number: r.number, created_at: r.at, ended_at: r.at, name: r.name, contact_id: r.contactId, conversation_id: r.conversationId })
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600) }
  const goLogs = (o: OutcomeFilter, dir: 'all' | 'inbound' | 'outbound' = 'all') => { setCommsMode('calls'); setTab('logs'); setOutcomeFilter(o); setDirFilter(dir) }
  const me12 = (v: string) => new Date(v).toLocaleTimeString('en-AU', { timeZone: tz, hour12, hour: '2-digit', minute: '2-digit' })
  const dateTime = (v: string) => new Date(v).toLocaleString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12 })
  const myName = me ? (roster.find(a => a.id === me.id)?.name || me.name) : null

  // ── Pieces ───────────────────────────────────────────────────────────────
  const statusDot = (s: Agent['status']) => s === 'available' ? '#22c55e' : s === 'oncall' ? '#3b82f6' : '#cbd5e1'
  const statusLabel = (s: Agent['status']) => s === 'available' ? 'Available' : s === 'oncall' ? 'On call' : 'Offline'
  const missColor = (r: number) => (r >= 20 ? C.red : r >= 10 ? C.amber : C.green)

  const callerCell = (c: CcCall) => {
    const d = callerDisplay(c, locName(c.location_id))
    return (
      <span style={{ display: 'block', minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subtitle}</span>
      </span>
    )
  }
  const outcomeChip = (c: CcCall) => {
    const o = outcomeLabel(c, nowTick)
    const ao = aiOutcomeOf(c, nowTick)
    return (
      <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
        <Chip color={OUTCOME_COLOR[o.key] || C.blue}>{o.label}</Chip>
        {ao && ao !== 'ai_missed' && ao !== 'ai_voicemail' && <Chip color={C.violet} title={AI_OUTCOME_LABEL[ao]}>{Icon.spark(10)} {ao === 'ai_message' ? 'Message' : 'AI'}</Chip>}
      </span>
    )
  }
  const agentCell = (c: CcCall) => {
    const o = outcomeLabel(c, nowTick).key
    if (isAiCall(c) && c.direction === 'inbound' && (o === 'answered')) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.violet, fontWeight: 600 }}>{Icon.spark(11)} AI receptionist</span>
    if (c.direction === 'inbound' && (o === 'missed' || o === 'voicemail')) return <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>Not answered</span>
    if (o === 'live' && !c.agent_name) return <span style={{ color: 'var(--slate)' }}>Ringing</span>
    return <span>{agentLabel(c.agent_name) || '—'}</span>
  }
  const rowActions = (c: CcCall) => {
    const n = otherNumber(c)
    if (!n || /[a-z]/i.test(n)) return null
    return (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <button type="button" title={c.direction === 'outbound' ? 'Call again' : 'Call back'} aria-label="Call back" onClick={() => callBackCall(c)} style={iconBtn}>{Icon.phone(14)}</button>
        <button type="button" title="Text back" aria-label="Text back" onClick={() => openTextBack(c)} style={iconBtn}>{Icon.chat(14)}</button>
      </span>
    )
  }

  const tabBtn = (key: Tab, label: string) => (
    <button type="button" onClick={() => setTab(key)}
      style={{ padding: '8px 2px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--coral)' : 'transparent'}`, color: tab === key ? 'var(--ink)' : 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )

  const hourly = (arr: number[], color: string, label: string) => {
    const max = Math.max(1, ...arr)
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
          {arr.map((n, h) => (
            <div key={h} title={`${hourLabel(h, hour12)}: ${n} ${label}${n === 1 ? '' : 's'}`}
              style={{ flex: 1, height: `${Math.max(3, n / max * 100)}%`, borderRadius: 3, background: n === 0 ? 'var(--canvas)' : tint(color, 70) }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9.5, color: 'var(--slate)' }}>
          {[0, 6, 12, 18, 23].map(h => <span key={h}>{hourLabel(h, hour12)}</span>)}
        </div>
      </div>
    )
  }

  const donut = (s: CallStats) => {
    const total = s.answered + s.missed + s.voicemail || 1
    const a = s.answered / total * 100, m = s.missed / total * 100, v = s.voicemail / total * 100
    const bg = s.inboundDone ? `conic-gradient(${C.green} 0 ${a}%, ${C.red} ${a}% ${a + m}%, ${C.amber} ${a + m}% ${a + m + v}%, var(--canvas) ${a + m + v}% 100%)` : 'var(--canvas)'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', background: bg, flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'var(--card,#fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{s.inboundDone}</span>
            <span style={{ ...kicker, marginTop: 2 }}>Incoming</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
          {([['Answered', s.answered, C.green], ['Missed', s.missed, C.red], ['Voicemail', s.voicemail, C.amber]] as [string, number, string][]).map(([l, v2, col]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--slate)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: col }} />
              <strong style={{ color: 'var(--ink)' }}>{v2}</strong> {l}
              <span>· {Math.round(v2 / total * 100)}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const tableHead = (cols: string[]) => (
    <thead>
      <tr style={{ background: 'var(--canvas)', textAlign: 'left' }}>
        {cols.map(h => <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{h}</th>)}
      </tr>
    </thead>
  )
  const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }

  // ── Panels ───────────────────────────────────────────────────────────────
  const recoveryPanel = (
    <div ref={recoveryRef} style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px', flexWrap: 'wrap' }}>
        <p style={{ ...kicker, flex: 1, minWidth: 160 }}>Missed call recovery {recovery.length > 0 && <span style={{ color: C.red }}>· {recovery.length} to return</span>}</p>
        {recoveryState === 'stored' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--slate)', fontWeight: 600 }}><Spinner size={11} /> Updating</span>}
        {recoveryState === 'stale' && <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 600 }}>From your last visit; couldn’t refresh just now</span>}
        {recoveryState === 'live' && ov && ov.recovery.missed > 0 && <span style={{ fontSize: 11.5, color: 'var(--slate)', fontWeight: 600 }}>{ov.recovery.recovered} of {ov.recovery.missed} returned this week ({Math.round(ov.recovery.recovered / ov.recovery.missed * 100)}%)</span>}
        <WhyInline align="right" why={<>Callers from the last 7 days whose call was missed or went to voicemail, and that nobody has rung back, been answered on a later call, or replied to in their conversation since. Automatic missed-call texts don’t count as a reply. Hidden numbers and your own team’s numbers aren’t listed.{ov?.missedCallText.enabled ? ` Your automatic missed-call text is on (${ov.missedCallText.when === 'after_hours' ? 'outside opening hours' : 'for every missed call'}).` : ' Your automatic missed-call text is off (Settings, Calls & SMS).'}</>} />
      </div>
      {recoveryState === 'loading' ? (
        <div style={{ padding: '0 16px 8px', borderTop: '1px solid var(--border)' }}><SkelRows n={3} /></div>
      ) : recoveryState === 'failed' ? (
        <div style={{ padding: '18px 16px 22px', color: 'var(--slate)', fontSize: 13 }}>Couldn’t load the missed callers just now. Colvy will try again shortly.</div>
      ) : recovery.length === 0 ? (
        <div style={{ padding: '18px 16px 22px', display: 'flex', gap: 10, alignItems: 'center', color: 'var(--slate)', fontSize: 13 }}>
          <span style={{ color: C.green }}>{Icon.check(18)}</span> Everyone who called this week has been called or texted back.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {recovery.slice(0, 8).map(r => {
            const c = recoveryCall(r)
            const d = callerDisplay(c, locName(c.location_id))
            return (
              <div key={r.callId} role="button" tabIndex={0} onClick={() => setDrawer(c)} onKeyDown={e => { if (e.key === 'Enter') setDrawer(c) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer', flexWrap: narrow ? 'wrap' : 'nowrap' }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(r.voicemail ? C.amber : C.red), color: r.voicemail ? C.amber : C.red }}>{r.voicemail ? Icon.vm(15) : Icon.phoneMissed(15)}</span>
                <span style={{ flex: 1, minWidth: 140 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>
                    {d.known ? d.subtitle : 'Unknown caller'} · {timeAgo(r.at, nowTick)}
                    {r.attempts > 1 && <Chip color={C.red}>Called {r.attempts} times</Chip>}
                    {r.voicemail && <Chip color={C.amber}>Voicemail</Chip>}
                    {r.duringOpenHours === true && <Chip color="#6b6b70">While open</Chip>}
                    {r.textedBack && <Chip color={C.blue}>Auto-texted</Chip>}
                  </span>
                </span>
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: narrow ? 40 : 0 }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => callBack({ number: r.number, name: r.name, contactId: r.contactId, conversationId: r.conversationId })} style={{ ...btn('primary'), padding: '6px 10px' }}>{Icon.phone(13)} Call back</button>
                  {r.textable && <button type="button" onClick={() => openTextBack(c)} style={{ ...btn('soft'), padding: '6px 10px' }} title="AI drafts a text from their voicemail or call; you check it and send">{Icon.spark(12)} Text</button>}
                </span>
              </div>
            )
          })}
          {recovery.length > 8 && (
            <button type="button" onClick={() => goLogs('unanswered', 'inbound')} style={{ border: 'none', borderTop: '1px solid var(--border)', background: 'var(--canvas)', padding: '9px 16px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
              {recovery.length - 8} more to return
            </button>
          )}
        </div>
      )}
    </div>
  )

  const aiPanel = (() => {
    const s = stats.ai
    if (loading) {
      return (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: C.violet }}>{Icon.spark(14)}</span>
            <p style={{ ...kicker, flex: 1 }}>AI receptionist</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 6 }}>
            {Array.from({ length: 4 }, (_, i) => <Skel key={i} h={44} r={10} />)}
          </div>
          <SkelRows n={2} icon={false} pad="6px 0" />
        </div>
      )
    }
    const show = ov?.phoneAgent.enabled || s.calls > 0
    return (
      <div style={{ ...card, borderColor: show ? tint(C.violet, 26) : 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: C.violet }}>{Icon.spark(14)}</span>
          <p style={{ ...kicker, flex: 1 }}>AI receptionist</p>
          {show && <WhyInline align="right" why={<>Incoming calls the AI receptionist answered in this period{ov?.phoneAgent.enabled ? `. It answers ${MODE_TEXT[ov.phoneAgent.mode || ''] || 'as set in Settings'}` : ''}. Handled: it dealt with the call itself. Message: it took a message and made a call-back task. Hung up: the caller left without saying anything, so it also counts as a missed call. Booking links are texted for the caller to book themselves; it never books on its own.</>} />}
        </div>
        {!show ? (
          <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            Let the AI receptionist pick up when nobody can: it answers questions, takes messages as call-back tasks and texts booking links.
            <div style={{ marginTop: 10 }}><a href="/admin/crm-settings/channels/calls" style={btn('soft')}>{Icon.spark(12)} Set it up</a></div>
          </div>
        ) : (
          <>
            {ov?.aiPaused && <p style={{ margin: '0 0 10px', padding: '7px 10px', borderRadius: 9, background: tint(C.amber, 12), color: '#b45309', fontSize: 12, fontWeight: 600 }}>AI agents are paused, so the AI receptionist isn’t answering.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 12 }}>
              {([['Handled', s.handled, C.green, 'ai'], ['Messages', s.messages, C.violet, 'ai'], ['Booking links', s.bookingLinks, C.blue, 'ai'], ['To voicemail', s.voicemail, C.amber, 'ai'], ['Hung up', s.missed, C.red, 'ai']] as [string, number, string, OutcomeFilter][]).map(([l, v, col]) => (
                <button key={l} type="button" onClick={() => { setAgentFilter('ai'); goLogs('all') }} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--canvas)', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 800, color: col, lineHeight: 1.1 }}>{v}</span>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 2 }}>{l}</span>
                </button>
              ))}
            </div>
            {aiCalls.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No calls for the AI receptionist {isToday ? 'today' : 'in this period'}.{ov?.phoneAgent.enabled ? ` It answers ${MODE_TEXT[ov.phoneAgent.mode || ''] || 'as set in Settings'}.` : ''}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {aiCalls.slice(0, 5).map(c => {
                  const ao = aiOutcomeOf(c, nowTick)
                  return (
                    <button key={c.id} type="button" onClick={() => setDrawer(c)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', cursor: 'pointer', textAlign: 'left', font: 'inherit', minWidth: 0 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{callerDisplay(c).title}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ai?.about || c.ai_summary || me12(c.created_at)}</span>
                      </span>
                      {ao && <Chip color={ao === 'ai_missed' ? C.red : ao === 'ai_voicemail' ? C.amber : C.violet}>{AI_OUTCOME_LABEL[ao]}</Chip>}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    )
  })()

  const leaderPanel = (limit: number) => (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <p style={{ ...kicker, flex: 1 }}>Team leaderboard · {rangeLabel.toLowerCase()}</p>
        <WhyInline align="right" why={<>Ranked by calls each person handled: incoming calls they answered plus outgoing calls that got through. Call-backs are outgoing calls to someone whose call was missed earlier in the period. Missed calls ring the whole team, so they aren’t put against anyone. The AI receptionist has its own panel.</>} />
      </div>
      {loading ? (
        <SkelRows n={Math.min(limit, 4)} icon={false} pad="7px 0" />
      ) : leaders.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No calls handled by the team in this period.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) 54px 54px 60px', gap: 6, fontSize: 10, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 4px' }}>
            <span /><span>Team member</span><span style={{ textAlign: 'right' }}>Ans</span><span style={{ textAlign: 'right' }}>Out</span><span style={{ textAlign: 'right' }}>Returned</span>
          </div>
          {leaders.slice(0, limit).map((r, i) => {
            const key = r.id ? `u:${r.id}` : `n:${normName(r.name)}`
            const on = agentFilter === key
            return (
              <button key={r.key} type="button" onClick={() => setAgentFilter(on ? 'all' : key)} title={on ? 'Show everyone' : `Show ${r.name}’s calls`}
                style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) 54px 54px 60px', gap: 6, alignItems: 'center', padding: '7px 4px', borderRadius: 8, border: 'none', background: on ? tint('#ff7a6b', 10) : 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--slate)' }}>{fmtTalk(r.talkSecs)} talk · avg {fmtDur(r.avgTalk)}</span>
                </span>
                <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.green }}>{r.answered}</span>
                <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.blue }}>{r.made}</span>
                <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: r.callBacks ? 'var(--coral)' : 'var(--slate)' }}>{r.callBacks}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="cc-page" aria-busy={loading} style={{ padding: narrow ? '14px 12px 28px' : '20px 24px 32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
      <style>{`@keyframes ccpulse{0%,100%{opacity:1}50%{opacity:0.35}}@keyframes ccspin{to{transform:rotate(360deg)}}
        @keyframes ccshimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
        .cc-skel{background:linear-gradient(90deg,var(--canvas) 25%,var(--border) 50%,var(--canvas) 75%);background-size:200% 100%;animation:ccshimmer 1.3s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){ .cc-skel{ animation: none; } }
        .cc-kpis{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}
        @media (min-width: 1700px){ .cc-kpis{ grid-template-columns: repeat(8,minmax(0,1fr)); } }
        @media (max-width: 900px){ .cc-kpis{ grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; } }
        .cc-row{cursor:pointer;transition:background .12s ease}.cc-row:hover{background:var(--canvas)}
        @media (max-width: 1180px){ .cc-live-grid{ grid-template-columns: 1fr 1fr !important; } .cc-live-grid > .cc-wide{ grid-column: 1 / -1; } }
        @media (max-width: 1080px){ .cc-two{ grid-template-columns: 1fr !important; } }
        @media (max-width: 760px){ .cc-live-grid{ grid-template-columns: 1fr !important; } .cc-perf-inner{ grid-template-columns: 1fr !important; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Command Centre</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>
            Live phone activity across your team
            {ov && ov.openNow !== null && <> · <span style={{ color: ov.openNow ? C.green : 'var(--slate)', fontWeight: 700 }}>{ov.openNow ? 'Open now' : 'Closed now'}</span></>}
            {ov?.hoursToday && !narrow && <span> · today {ov.hoursToday}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: tint(C.green, 16), color: '#15803d', fontSize: 11.5, fontWeight: 800 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'ccpulse 1.4s ease-in-out infinite' }} /> LIVE
          </span>
          <div style={{ position: 'relative', textAlign: 'right' }}
            onMouseEnter={() => { if (clockMenuTimer.current) clearTimeout(clockMenuTimer.current); setShowClockMenu(true) }}
            onMouseLeave={() => { clockMenuTimer.current = setTimeout(() => setShowClockMenu(false), 220) }}>
            <button type="button" onClick={() => setShowClockMenu(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'right', font: 'inherit' }} aria-label="Time format and default view">
              <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}><Clock tz={tz} hour12={hour12} /></span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)' }}>{new Date(nowTick).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </button>
            {showClockMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.16)', padding: 10, width: 210, textAlign: 'left' }}>
                <p style={{ ...kicker, marginBottom: 7 }}>Time format</p>
                <Segmented value={hour12 ? '12' : '24'} options={[['24', '24-hour'], ['12', '12-hour']]} onChange={v => setHour12(v === '12')} size="sm" />
                <button type="button" onClick={saveDefaultView}
                  style={{ width: '100%', marginTop: 10, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: savedFlash ? tint(C.green, 14) : 'var(--card,#fff)', color: savedFlash ? '#15803d' : 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {savedFlash ? <>{Icon.check(12)} Saved as default</> : 'Save as default view'}
                </button>
                <p style={{ margin: '7px 0 0', fontSize: 10.5, color: 'var(--slate)', lineHeight: 1.4 }}>Saves the current tab, filters and time format for next visit. Times are shown in {tz.replace(/_/g, ' ')} time.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--border)', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <Segmented<'calls' | 'sms'> value={commsMode} options={[['calls', 'Calls'], ['sms', 'SMS']]} onChange={setCommsMode} size="sm" />
          {commsMode === 'calls' && (
            <div style={{ display: 'flex', gap: 16 }}>
              {tabBtn('live', 'Live Board')}
              {tabBtn('logs', 'Call Logs')}
              {tabBtn('insights', 'Insights')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setRangeMenu(m => !m)} style={{ ...ctrl, display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Date range">
              {Icon.calendar()} {rangeLabel} {Icon.chevron()}
            </button>
            {rangeMenu && (
              <>
                <div onClick={() => setRangeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 31, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 16px 40px rgba(0,0,0,0.16)', padding: 5, width: 190 }}>
                  {RANGES.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => { if (k !== 'custom') { setRange(k); setRangeMenu(false) } else setRange('custom') }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: range === k ? 800 : 600, background: range === k ? 'var(--coral)' : 'transparent', color: range === k ? '#fff' : 'var(--ink)' }}>{label}</button>
                  ))}
                  {range === 'custom' && (
                    <div style={{ padding: '6px 8px 2px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} aria-label="From" style={{ padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: 'var(--card,#fff)', color: 'var(--ink)' }} />
                      <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} aria-label="To" style={{ padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: 'var(--card,#fff)', color: 'var(--ink)' }} />
                      <button type="button" onClick={() => setRangeMenu(false)} disabled={!customFrom || !customTo}
                        style={{ padding: '6px 0', borderRadius: 7, border: 'none', background: (customFrom && customTo) ? 'var(--coral)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (customFrom && customTo) ? 'pointer' : 'default' }}>Apply</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {commsMode === 'calls' && (
            <select value={selectedAgent && selectedAgent !== 'ai' ? selectedAgent.key : agentFilter} onChange={e => setAgentFilter(e.target.value)} style={ctrl} title="Filter by team member">
              <option value="all">All team members</option>
              <option value="ai">AI receptionist</option>
              {agentOptions.map(o => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          )}
          {commsMode === 'calls' && (
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={ctrl} title="Filter by location">
              <option value="all">All locations</option>
              {(ov?.locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value="none">No location</option>
            </select>
          )}
        </div>
      </div>

      {callsError && <p style={{ margin: '0 0 12px', padding: '9px 12px', borderRadius: 10, background: tint(C.red, 9), color: C.red, fontSize: 13, fontWeight: 600 }}>{callsError}</p>}
      {truncated && <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)' }}>This period has {truncated.total ? `${truncated.total.toLocaleString('en-AU')} calls` : 'more calls than the board can show at once'}, so the numbers here cover the most recent 20,000. Pick a shorter range for exact totals.</p>}
      {commsMode === 'calls' && selectedAgent && <p style={{ margin: '-6px 0 12px', fontSize: 12, color: 'var(--slate)' }}>Showing calls {selectedAgent === 'ai' ? 'the AI receptionist answered' : `${selectedAgent.name} answered or made`}. Missed calls ring everyone, so they only show for “All team members”. <button type="button" onClick={() => setAgentFilter('all')} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Show everyone</button></p>}

      {/* ── LIVE BOARD ──────────────────────────────────────────────────────── */}
      {commsMode === 'calls' && tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cc-kpis">
            <Kpi label={isToday ? 'Calls today' : 'Calls'} value={kv(stats.total)} color="#3b82f6" icon={Icon.phone()} sub={ks(`${stats.inbound} in · ${stats.outbound} out`)} foot={ks(hasPrev && <Trend cur={stats.total} prev={pstats.total} />)} />
            <Kpi label="Answered" value={kv(stats.answered)} color={C.green} icon={Icon.check()} sub={ks(`of ${stats.inboundDone} incoming${stats.ai.calls ? ` · ${stats.ai.calls - stats.ai.missed - stats.ai.voicemail} by AI` : ''}`)} foot={ks(hasPrev && <Trend cur={stats.answered} prev={pstats.answered} />)} onClick={() => goLogs('answered')} />
            <Kpi label="Missed" value={kv(stats.missed)} color={C.red} icon={Icon.phoneMissed()} sub="no message left" foot={ks(hasPrev && <Trend cur={stats.missed} prev={pstats.missed} invert />)} onClick={() => goLogs('missed')} />
            <Kpi label="Voicemails" value={kv(stats.voicemail)} color={C.amber} icon={Icon.vm()} foot={ks(hasPrev && <Trend cur={stats.voicemail} prev={pstats.voicemail} invert />)} onClick={() => goLogs('voicemail')} />
            <Kpi label="Miss rate" value={kv(`${stats.missRate}%`)} color={missColor(stats.missRate)} icon={Icon.pct()} sub="missed + voicemail, of incoming" foot={ks(hasPrev && <Trend cur={stats.missRate} prev={pstats.missRate} invert unit="pts" />)} onClick={() => goLogs('unanswered', 'inbound')} />
            <Kpi label="Avg talk time" value={kv(fmtDur(stats.avgTalk))} color={C.violet} icon={Icon.clock()} sub={ks(`${fmtTalk(stats.talkSecs)} in total`)} foot={ks(hasPrev && <Trend cur={stats.avgTalk} prev={pstats.avgTalk} />)} />
            <Kpi label="Available" value={teamCounts ? teamCounts.available : rosterLoaded ? available.length : <Skel w={52} h={22} />} color={C.green} icon={Icon.user()} sub={teamCounts ? (teamCounts.total ? `of ${teamCounts.total} team` : 'team') : rosterLoaded ? 'team' : null} />
            <Kpi label="Live now" value={kv(liveCalls.length)} color={C.blue} icon={Icon.live()} sub={ks(`${teamCounts ? teamCounts.oncall : onCallAgents.length} team on a call`)} />
          </div>

          {alerts.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
              {alerts.map(al => {
                const col = al.tone === 'red' ? C.red : C.amber
                return (
                  <div key={al.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 12, background: tint(col, 8), border: `1px solid ${tint(col, 30)}` }}>
                    <span style={{ color: col, marginTop: 1 }}>{Icon.alert()}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: al.tone === 'red' ? '#b91c1c' : '#b45309' }}>{al.title}</p>
                      <p style={{ margin: '2px 0 6px', fontSize: 12, color: 'var(--slate)' }}>{al.body}</p>
                      <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                        {al.action === 'recovery' && <button type="button" onClick={() => recoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>Show callers</button>}
                        {al.action === 'logs_unanswered' && <button type="button" onClick={() => goLogs('unanswered', 'inbound')} style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>See the calls</button>}
                        <WhyInline why={al.why} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="cc-live-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* Team presence */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={kicker}>Team presence</p>
                {rosterLoaded && <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>{available.length} available</span>}
              </div>
              {!rosterLoaded ? (
                <SkelRows n={4} pad="8px 0" />
              ) : roster.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No team members found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                  {roster.map(a => {
                    const key = `u:${a.id}`
                    const on = agentFilter === key
                    return (
                      <button key={a.id} type="button" onClick={() => setAgentFilter(on ? 'all' : key)} title={on ? 'Show everyone' : `Show ${a.name}’s calls`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 11, border: '1px solid var(--border)', borderLeft: `3px solid ${statusDot(a.status)}`, background: on ? tint('#ff7a6b', 8) : 'var(--card,#fff)', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                        <span style={{ position: 'relative', flexShrink: 0 }}>
                          {a.avatar
                            ? <img src={a.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                            : <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{initialsOf(a.name)}</span>}
                          <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: statusDot(a.status), border: '2px solid var(--card,#fff)' }} />
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>{statusLabel(a.status)}{a.role ? ` · ${a.role}` : ''}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Live calls */}
            <div className="cc-wide" style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 10px' }}>
                <p style={kicker}>Live calls {liveCalls.length > 0 && <span style={{ color: 'var(--coral)' }}>· {liveCalls.length} active</span>}</p>
              </div>
              {loading ? (
                <div style={{ padding: '0 16px 8px', borderTop: '1px solid var(--border)' }}><SkelRows n={2} /></div>
              ) : liveCalls.length === 0 ? (
                <div style={{ padding: '34px 20px 40px', textAlign: 'center', color: 'var(--slate)' }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>No calls in progress</p>
                  <p style={{ margin: '5px 0 0', fontSize: 12 }}>Active calls appear here as they ring.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {liveCalls.map(c => (
                    <div key={c.id} className="cc-row" onClick={() => setDrawer(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{callerCell(c)}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{agentLabel(c.agent_name) || (c.status.includes('voicemail') ? 'Voicemail' : 'Ringing')}</span>
                      <Chip color={c.direction === 'inbound' ? C.green : C.blue}>{c.direction === 'inbound' ? 'In' : 'Out'}</Chip>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'ccpulse 1.4s ease-in-out infinite' }} />
                        <LiveTimer since={c.answered_at || c.created_at} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div style={card}>
              <p style={{ ...kicker, marginBottom: 12 }}>Activity feed</p>
              {loading ? (
                <SkelRows n={5} pad="6px 0" />
              ) : feed.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No recent calls.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
                  {feed.map(c => {
                    const o = outcomeLabel(c, nowTick)
                    const col = OUTCOME_COLOR[o.key] || C.blue
                    const verb = c.direction === 'outbound'
                      ? (o.key === 'connected' ? `called by ${agentLabel(c.agent_name) || 'the team'}` : o.key === 'live' ? 'being called' : 'called, no answer')
                      : o.key === 'voicemail' ? 'left a voicemail' : o.key === 'answered' ? `answered by ${agentLabel(c.agent_name) || 'the team'}` : o.key === 'live' ? 'calling now' : 'missed'
                    return (
                      <button key={c.id} type="button" onClick={() => setDrawer(c)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: 8 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(col), color: col }}>
                          {o.key === 'voicemail' ? Icon.vm(14) : o.key === 'missed' ? Icon.phoneMissed(14) : c.direction === 'outbound' ? Icon.phoneOut(14) : Icon.phoneIn(14)}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}><strong>{callerDisplay(c).title}</strong> <span style={{ color: 'var(--slate)' }}>{verb}</span></span>
                          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--slate)', marginTop: 1 }}>{me12(c.created_at)} · {timeAgo(c.created_at, nowTick)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="cc-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            {recoveryPanel}
            {aiPanel}
          </div>

          <div className="cc-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <div style={card}>
              <p style={{ ...kicker, marginBottom: 14 }}>{isToday ? 'Performance today' : `Performance · ${rangeLabel.toLowerCase()}`}</p>
              <div className="cc-perf-inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...kicker, marginBottom: 8 }}>{range === 'today' || range === 'yesterday' ? 'Calls by hour' : 'Calls by hour of day'}</p>
                  {loading ? <Skel h={64} r={8} /> : hourly(byHour(cur, tz), '#ff7a6b', 'call')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...kicker, marginBottom: 8 }}>Incoming calls</p>
                  {loading ? <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Skel w={104} h={104} r={52} style={{ flexShrink: 0 }} /><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Skel w="70%" h={10} /><Skel w="60%" h={10} /><Skel w="65%" h={10} /></span></span> : donut(stats)}
                </div>
              </div>
            </div>
            {leaderPanel(5)}
          </div>
        </div>
      )}

      {/* ── CALL LOGS ───────────────────────────────────────────────────────── */}
      {commsMode === 'calls' && tab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="cc-kpis">
            <Kpi label="Total calls" value={kv(logStats.total)} color="#3b82f6" icon={Icon.phone()} sub={ks(`${logStats.inbound} in · ${logStats.outbound} out`)} onClick={() => setOutcomeFilter('all')} active={outcomeFilter === 'all'} />
            <Kpi label="Answered" value={kv(logStats.answered)} color={C.green} icon={Icon.check()} sub={ks(`of ${logStats.inboundDone} incoming`)} onClick={() => setOutcomeFilter(outcomeFilter === 'answered' ? 'all' : 'answered')} active={outcomeFilter === 'answered'} />
            <Kpi label="Missed" value={kv(logStats.missed)} color={C.red} icon={Icon.phoneMissed()} sub="no message left" onClick={() => setOutcomeFilter(outcomeFilter === 'missed' ? 'all' : 'missed')} active={outcomeFilter === 'missed'} />
            <Kpi label="Voicemails" value={kv(logStats.voicemail)} color={C.amber} icon={Icon.vm()} onClick={() => setOutcomeFilter(outcomeFilter === 'voicemail' ? 'all' : 'voicemail')} active={outcomeFilter === 'voicemail'} />
            <Kpi label="Miss rate" value={kv(`${logStats.missRate}%`)} color={missColor(logStats.missRate)} icon={Icon.pct()} sub="missed + voicemail, of incoming" onClick={() => setOutcomeFilter(outcomeFilter === 'unanswered' ? 'all' : 'unanswered')} active={outcomeFilter === 'unanswered'} />
            <Kpi label="Avg talk time" value={kv(fmtDur(logStats.avgTalk))} color={C.violet} icon={Icon.clock()} sub="answered calls, 0s left out" />
            <Kpi label="Outgoing" value={kv(logStats.outbound)} color={C.cyan} icon={Icon.phoneOut()} sub={ks(`${logStats.outboundConnected} got through`)} onClick={() => setDirFilter(dirFilter === 'outbound' ? 'all' : 'outbound')} active={dirFilter === 'outbound'} />
            <Kpi label="AI receptionist" value={kv(logStats.ai.calls)} color={C.violet} icon={Icon.spark(17)} sub={ks(`${logStats.ai.messages} message${logStats.ai.messages === 1 ? '' : 's'} · ${logStats.ai.bookingLinks} booking link${logStats.ai.bookingLinks === 1 ? '' : 's'}`)} onClick={() => setOutcomeFilter(outcomeFilter === 'ai' ? 'all' : 'ai')} active={outcomeFilter === 'ai'} />
          </div>
          {callsLoading && booted && <p style={{ margin: '-4px 0 0', fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 7 }}><Spinner size={12} /> Loading the full period…</p>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)' }}>
              {Icon.search()}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, number, team member, store or what it was about"
                style={{ flex: 1, minWidth: 0, padding: '9px 0', border: 'none', fontSize: 13, outline: 'none', background: 'transparent', color: 'var(--ink)' }} />
            </label>
            <Segmented<'all' | 'inbound' | 'outbound'> value={dirFilter} options={[['all', 'All'], ['inbound', 'Incoming'], ['outbound', 'Outgoing']]} onChange={setDirFilter} />
            <Segmented<OutcomeFilter> value={outcomeFilter} onChange={setOutcomeFilter} options={outcomeOptions} />
          </div>
          {topic && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)' }}>
              <Chip color={C.violet}>{Icon.spark(11)} {topic.name}</Chip>
              <span style={{ color: 'var(--slate)' }}>{topic.callIds.length} calls from the AI summary</span>
              <button type="button" onClick={() => setTopic(null)} style={{ border: 'none', background: 'none', color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Clear</button>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {narrow ? (
              <div>
                {loading && <div style={{ padding: '4px 14px' }}><SkelRows n={6} /></div>}
                {!loading && tableRows.length === 0 && <p style={{ padding: 24, margin: 0, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>{callsLoading ? 'Loading…' : 'No calls match.'}</p>}
                {tableRows.slice(0, shown).map(c => (
                  <div key={c.id} className="cc-row" onClick={() => setDrawer(c)} style={{ padding: '11px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ color: c.direction === 'inbound' ? C.green : C.blue }}>{c.direction === 'inbound' ? Icon.phoneIn(15) : Icon.phoneOut(15)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {callerCell(c)}
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)', marginTop: 3 }}>{dateTime(c.created_at)} · {c.duration_seconds ? fmtDur(c.duration_seconds) : '0s'} · {agentCell(c)}</span>
                    </span>
                    {outcomeChip(c)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
                  {tableHead(['Date/time', 'Caller', 'Direction', 'Duration', 'Outcome', 'Answered by', 'Location', ''])}
                  <tbody>
                    {loading && Array.from({ length: 8 }, (_, i) => (
                      <tr key={`sk${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                        {[90, 160, 44, 40, 70, 90, 70, 60].map((w, j) => <td key={j} style={td}><Skel w={w} h={11} /></td>)}
                      </tr>
                    ))}
                    {!loading && tableRows.length === 0 && <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: 'var(--slate)' }}>{callsLoading ? 'Loading…' : 'No calls match.'}</td></tr>}
                    {tableRows.slice(0, shown).map(c => (
                      <tr key={c.id} className="cc-row" onClick={() => setDrawer(c)} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--slate)' }}>{dateTime(c.created_at)}</td>
                        <td style={{ ...td, maxWidth: 260 }}>{callerCell(c)}</td>
                        <td style={td}><Chip color={c.direction === 'inbound' ? C.green : C.blue}>{c.direction === 'inbound' ? Icon.arrowIn(11) : Icon.send(10)} {c.direction === 'inbound' ? 'In' : 'Out'}</Chip></td>
                        <td style={{ ...td, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{c.duration_seconds ? fmtDur(c.duration_seconds) : <span style={{ color: 'var(--slate)' }}>0s</span>}</td>
                        <td style={td}>{outcomeChip(c)}</td>
                        <td style={{ ...td, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{agentCell(c)}</td>
                        <td style={{ ...td, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{locName(c.location_id) || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{rowActions(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {tableRows.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>Showing {Math.min(shown, tableRows.length)} of {tableRows.length} call{tableRows.length === 1 ? '' : 's'}</span>
              {tableRows.length > shown && <button type="button" onClick={() => setShown(s => s + PAGE)} style={btn('ghost')}>Show {Math.min(PAGE, tableRows.length - shown)} more</button>}
            </div>
          )}
        </div>
      )}

      {/* ── INSIGHTS ────────────────────────────────────────────────────────── */}
      {commsMode === 'calls' && tab === 'insights' && companyId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Asks once the business's timezone is known (so the period is the
              right one), then stays put while the calls load. */}
          {tzSure ? (
            <AiSummary companyId={companyId} from={win.from} to={Number.isFinite(win.to) ? win.to : null} rangeLabel={rangeLabel}
              activeTopic={topic?.name || null} onTopic={t => { setTopic(t); if (t) { setTab('logs'); setOutcomeFilter('all'); setDirFilter('all') } }} />
          ) : <AiSummarySkel />}
          {loading ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
                {Array.from({ length: 6 }, (_, i) => <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}><Skel w="60%" h={10} /><Skel w={70} h={24} /><Skel w="50%" h={10} /></div>)}
              </div>
              <div style={card}><Skel w={160} h={11} /><div style={{ marginTop: 12 }}><Skel h={180} r={8} /></div></div>
            </>
          ) : (() => {
            const grid = heatmap(cur, tz, nowTick)
            const maxCell = Math.max(1, ...grid.flat().map(x => x.n))
            const byLoc = new Map<string, CcCall[]>()
            for (const c of cur) { const k = c.location_id || '__none'; (byLoc.get(k) || byLoc.set(k, []).get(k)!).push(c) }
            const locRows = Array.from(byLoc.entries()).map(([id, arr]) => ({ name: id === '__none' ? 'No location' : (locName(id) || 'Store'), ...aggregate(arr, nowTick) })).sort((a, b) => b.total - a.total)
            const cmp: [string, string | number, number, number, string, boolean, '%' | 'pts'][] = [
              ['Total calls', stats.total, stats.total, pstats.total, '#3b82f6', false, '%'],
              ['Answered', stats.answered, stats.answered, pstats.answered, C.green, false, '%'],
              ['Missed', stats.missed, stats.missed, pstats.missed, C.red, true, '%'],
              ['Voicemails', stats.voicemail, stats.voicemail, pstats.voicemail, C.amber, true, '%'],
              ['Miss rate', `${stats.missRate}%`, stats.missRate, pstats.missRate, missColor(stats.missRate), true, 'pts'],
              ['Avg talk time', fmtDur(stats.avgTalk), stats.avgTalk, pstats.avgTalk, C.violet, false, '%'],
            ]
            return (
              <>

                {hasPrev && pstats.inboundDone > 0 && stats.missRate > pstats.missRate && (
                  <div style={{ ...card, background: tint(C.red, 7), borderColor: tint(C.red, 25), display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                    {Icon.alert()} Miss rate is up {stats.missRate - pstats.missRate} points on the period before ({pstats.missRate}% to {stats.missRate}%).
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
                  {cmp.map(([l, v, a, b, col, inv, unit]) => (
                    <div key={l} style={card}>
                      <p style={kicker}>{l}</p>
                      <p style={{ margin: '6px 0 4px', fontSize: 26, fontWeight: 800, color: col, letterSpacing: '-0.02em' }}>{v}</p>
                      {hasPrev ? <Trend cur={a} prev={b} invert={inv} unit={unit} /> : <span style={{ fontSize: 11, color: 'var(--slate)' }}>All time</span>}
                    </div>
                  ))}
                </div>

                <div className="cc-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 0' }}>
                      <p style={{ ...kicker, flex: 1 }}>By team member · {rangeLabel.toLowerCase()}</p>
                    </div>
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                        {tableHead(['Team member', 'Answered', 'Calls made', 'Got through', 'Call-backs', 'Talk time', 'Avg talk'])}
                        <tbody>
                          {leaders.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--slate)' }}>No calls handled by the team in this period.</td></tr>}
                          {leaders.map(r => (
                            <tr key={r.key} className="cc-row" style={{ borderTop: '1px solid var(--border)' }} onClick={() => { setAgentFilter(r.id ? `u:${r.id}` : `n:${normName(r.name)}`); setTab('logs') }}>
                              <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                              <td style={{ ...td, color: C.green, fontWeight: 600 }}>{r.answered}</td>
                              <td style={td}>{r.made}</td>
                              <td style={td}>{r.connected}</td>
                              <td style={{ ...td, color: r.callBacks ? 'var(--coral)' : 'var(--slate)', fontWeight: 600 }}>{r.callBacks}</td>
                              <td style={{ ...td, color: 'var(--slate)' }}>{fmtTalk(r.talkSecs)}</td>
                              <td style={{ ...td, color: 'var(--slate)' }}>{fmtDur(r.avgTalk)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {aiPanel}
                </div>

                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <p style={kicker}>Volume by day and hour</p>
                    <p style={{ margin: 0, fontSize: 10.5, color: 'var(--slate)' }}>darker = more calls · red corner = most incoming calls unanswered</p>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ minWidth: 560 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2, marginBottom: 2 }}>
                        <span />
                        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 8.5, color: 'var(--slate)', textAlign: 'center' }}>{hour12 ? hourLabel(h, true).replace(/(am|pm)$/, '') : h}</span>)}
                      </div>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, di) => (
                        <div key={day} style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{day}</span>
                          {grid[di].map((cell, hi) => {
                            const bg = cell.n === 0 ? 'var(--canvas)' : tint('#ff7a6b', Math.round(20 + cell.n / maxCell * 70))
                            const highMiss = cell.n >= 2 && cell.miss / cell.n > 0.4
                            return (
                              <div key={hi} title={`${day} ${hourLabel(hi, hour12)}: ${cell.n} call${cell.n === 1 ? '' : 's'}${cell.miss ? `, ${cell.miss} not answered` : ''}`}
                                style={{ position: 'relative', height: 22, borderRadius: 3, background: bg, border: '1px solid var(--border)' }}>
                                {highMiss && <span style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: `5px solid ${C.red}`, borderLeft: '5px solid transparent' }} />}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {locRows.length > 0 && (
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 0' }}>
                      <p style={{ ...kicker, flex: 1 }}>Locations</p>
                      <WhyInline align="right" why={<>A call belongs to the store whose number was rung (or that rang out). If that isn’t known, the store the conversation is assigned to, then the customer’s store.</>} />
                    </div>
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                        {tableHead(['Location', 'Calls', 'Answered', 'Missed', 'Voicemail', 'Miss rate', 'Avg talk'])}
                        <tbody>
                          {locRows.map(r => (
                            <tr key={r.name} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                              <td style={td}>{r.total}</td>
                              <td style={{ ...td, color: C.green, fontWeight: 600 }}>{r.answered}</td>
                              <td style={{ ...td, color: C.red, fontWeight: 600 }}>{r.missed}</td>
                              <td style={{ ...td, color: C.amber, fontWeight: 600 }}>{r.voicemail}</td>
                              <td style={{ ...td, color: missColor(r.missRate), fontWeight: 600 }}>{r.missRate}%</td>
                              <td style={{ ...td, color: 'var(--slate)' }}>{fmtDur(r.avgTalk)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── SMS BOARD ───────────────────────────────────────────────────────── */}
      {commsMode === 'sms' && (() => {
        const inW = (m: Sms, a: number, b: number) => { const t = Date.parse(m.created_at); return t >= a && t < b }
        const agg = (arr: Sms[]) => { const r = arr.filter(smsInbound).length; return { total: arr.length, received: r, sent: arr.length - r, chats: new Set(arr.map(m => m.conversation_id).filter(Boolean)).size } }
        const curS = sms.filter(m => inW(m, win.from, win.to))
        const recentS = smsRecent.filter(m => inW(m, win.from, win.to)).slice(0, 40)
        const sv = (v: React.ReactNode) => (smsLoaded ? v : <Skel w={52} h={22} />)
        const sf = (v: React.ReactNode) => (smsLoaded ? v : null)
        const t = agg(curS), y = agg(prevTo > win.prevFrom ? sms.filter(m => inW(m, win.prevFrom, prevTo)) : [])
        const total = t.total || 1
        const rPct = t.received / total * 100, sPct = t.sent / total * 100
        const smsDonutBg = t.total ? `conic-gradient(${C.green} 0 ${rPct}%, ${C.blue} ${rPct}% ${rPct + sPct}%, var(--canvas) ${rPct + sPct}% 100%)` : 'var(--canvas)'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 158px), 1fr))', gap: 12 }}>
              <Kpi label={isToday ? 'Messages today' : 'Messages'} value={sv(t.total)} color="#3b82f6" icon={Icon.chat()} foot={sf(hasPrev && <Trend cur={t.total} prev={y.total} />)} />
              <Kpi label="Received" value={sv(t.received)} color={C.green} icon={Icon.arrowIn()} foot={sf(hasPrev && <Trend cur={t.received} prev={y.received} />)} />
              <Kpi label="Sent" value={sv(t.sent)} color={C.blue} icon={Icon.send()} sub="includes automatic texts" foot={sf(hasPrev && <Trend cur={t.sent} prev={y.sent} />)} />
              <Kpi label="Conversations" value={sv(t.chats)} color={C.violet} icon={Icon.users()} foot={sf(hasPrev && <Trend cur={t.chats} prev={y.chats} />)} />
            </div>
            <div className="cc-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16, alignItems: 'start' }}>
              <div style={card}>
                <p style={{ ...kicker, marginBottom: 12 }}>{isToday ? 'SMS today' : `SMS · ${rangeLabel.toLowerCase()}`}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', background: smsDonutBg, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'var(--card,#fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{sv(t.total)}</span>
                      <span style={{ ...kicker, marginTop: 2 }}>Total</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
                    {([['Received', t.received, C.green], ['Sent', t.sent, C.blue]] as [string, number, string][]).map(([l, v, col]) => (
                      <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--slate)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: col }} /><strong style={{ color: 'var(--ink)' }}>{smsLoaded ? v : <Skel w={18} h={11} />}</strong> {l}
                      </span>
                    ))}
                  </div>
                </div>
                <p style={{ ...kicker, margin: '16px 0 8px' }}>Messages by hour</p>
                {smsLoaded ? hourly(byHour(curS, tz), '#3b82f6', 'message') : <Skel h={64} r={8} />}
              </div>
              <div style={card}>
                <p style={{ ...kicker, marginBottom: 12 }}>SMS activity</p>
                {!smsLoaded ? (
                  <SkelRows n={5} pad="6px 0" />
                ) : recentS.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No texts in this period.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto' }}>
                    {recentS.map(m => {
                      const inb = smsInbound(m)
                      return (
                        <a key={m.id} href={m.conversation_id ? `/admin/inbox?conversation=${m.conversation_id}` : undefined} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none' }}>
                          <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(inb ? C.green : C.blue), color: inb ? C.green : C.blue }}>{inb ? Icon.arrowIn(14) : Icon.send(13)}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <strong>{m.sender_name && !/^\+?\d[\d\s]+$/.test(m.sender_name) ? m.sender_name : inb ? 'Customer' : 'You'}</strong> <span style={{ color: 'var(--slate)' }}>{inb ? 'received' : 'sent'}: {String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 90)}</span>
                            </span>
                            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--slate)', marginTop: 2 }}>{me12(m.created_at)} · {timeAgo(m.created_at, nowTick)}</span>
                          </span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {drawer && companyId && (
        <CallDrawer companyId={companyId} call={drawer} tz={tz} hour12={hour12} locationName={locName(drawer.location_id)}
          onClose={() => setDrawer(null)} onCallBack={callBackCall} onTextBack={openTextBack} />
      )}
      {textBack && companyId && (
        <TextBack companyId={companyId} callId={textBack.call.id} who={textBack.who} senderName={myName}
          onClose={() => setTextBack(null)}
          onSent={() => { setTextBack(null); flash('Text sent'); loadOverview(companyId, true) }} />
      )}
      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, padding: '10px 16px', borderRadius: 12, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {Icon.check(14)} {toast}
        </div>
      )}
    </div>
  )
}
