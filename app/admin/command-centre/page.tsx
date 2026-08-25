'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'

// ── Command Centre ───────────────────────────────────────────────────────────
// A live call-centre dashboard over the `calls` table: a real-time Live Board,
// a filterable Call Logs table, and a period-over-period Insights view. Calls
// carry no location column, so location is resolved best-effort via the
// caller's contact (contact_id → contacts.location_id). Work can be scoped by
// location AND by team member (matched on the answering agent's name).

type Call = {
  id: string
  direction: string
  status: string
  is_voicemail: boolean | null
  duration_seconds: number | null
  from_number: string | null
  to_number: string | null
  caller_name: string | null
  contact_name: string | null
  agent_name: string | null
  contact_id: string | null
  created_at: string
  ended_at: string | null
  sentiment: string | null
  recording_url: string | null
}

type Loc = { id: string; name: string }
type Agent = { id: string; name: string; avatar: string | null; role: string | null; status: 'available' | 'oncall' | 'offline' }

const isVoicemail = (c: Call) => !!c.is_voicemail || c.status === 'voicemail'
const isLive = (c: Call) => ['ringing', 'initiated', 'in_progress'].includes(c.status) && !c.ended_at
const isAnswered = (c: Call) => !isVoicemail(c) && (['answered', 'completed'].includes(c.status) || (c.duration_seconds || 0) > 0)
const isMissed = (c: Call) => !isVoicemail(c) && !isAnswered(c) && !isLive(c)

const fmtDur = (s: number) => {
  s = Math.round(s || 0)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
const fmtDurLong = (s: number) => {
  s = Math.round(s || 0)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
const timeAgo = (v: string) => {
  const d = new Date(v).getTime(); if (isNaN(d)) return ''
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
const prettyNum = (n: string | null) => n || 'Unknown'
const callName = (c: Call) => c.contact_name || c.caller_name || (c.direction === 'inbound' ? c.from_number : c.to_number) || 'Unknown'
const initialsOf = (n: string) => n.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'

type ViewPrefs = { tab: 'live' | 'logs' | 'insights'; locFilter: string; agentFilter: string; hour12: boolean }
const VIEW_KEY = 'cc_view_default'

export default function CommandCentrePage() {
  const [tab, setTab] = useState<'live' | 'logs' | 'insights'>('live')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [contactLoc, setContactLoc] = useState<Record<string, string>>({})
  const [roster, setRoster] = useState<Agent[]>([])
  const [locFilter, setLocFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState('')

  // Time format + saved default view.
  const [hour12, setHour12] = useState(false)
  const [showClockMenu, setShowClockMenu] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const clockMenuTimer = useRef<any>(null)

  // Call Logs filters
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'answered' | 'missed' | 'voicemail'>('all')

  // Restore a saved default view once, before first paint of the board.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY)
      if (raw) {
        const v = JSON.parse(raw) as ViewPrefs
        if (v.tab) setTab(v.tab)
        if (v.locFilter) setLocFilter(v.locFilter)
        if (v.agentFilter) setAgentFilter(v.agentFilter)
        if (typeof v.hour12 === 'boolean') setHour12(v.hour12)
      }
    } catch {}
  }, [])

  const saveDefaultView = () => {
    try {
      const v: ViewPrefs = { tab, locFilter, agentFilter, hour12 }
      localStorage.setItem(VIEW_KEY, JSON.stringify(v))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1600)
    } catch {}
  }

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  // Full team roster + who's available / on a call right now.
  const loadTeam = async (cid: string) => {
    const { data: members } = await (supabase as any).from('team_members')
      .select('user_id, email, name, role').eq('company_id', cid)
    const list = (members || []).filter((m: any) => m.user_id)
    const cutoff = new Date(Date.now() - 120000).toISOString()
    const { data: pres } = await (supabase as any).from('agent_presence')
      .select('user_id, available, last_seen_at').eq('company_id', cid).gte('last_seen_at', cutoff)
    const presMap: Record<string, boolean> = {}
    for (const p of pres || []) presMap[p.user_id] = p.available !== false
    // Resolve display names + avatars server-side.
    let names: Record<string, { name: string | null; avatar_url: string | null }> = {}
    const uids = Array.from(new Set(list.map((m: any) => m.user_id)))
    if (uids.length) {
      try {
        const r = await fetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: uids }) })
        const d = await r.json(); names = d.names || {}
      } catch {}
    }
    const agents: Agent[] = list.map((m: any) => {
      const nm = names[m.user_id]?.name || m.name || (m.email ? String(m.email).split('@')[0] : 'Agent')
      const online = m.user_id in presMap
      const status: Agent['status'] = !online ? 'offline' : (presMap[m.user_id] ? 'available' : 'oncall')
      return { id: m.user_id, name: nm, avatar: names[m.user_id]?.avatar_url || null, role: m.role || null, status }
    }).sort((a: Agent, b: Agent) => {
      const rank = { available: 0, oncall: 1, offline: 2 }
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name)
    })
    setRoster(agents)
  }

  const loadAll = async () => {
    const cid = await getMyCompanyId()
    if (!cid) { setLoading(false); return }
    setCompanyId(cid)

    const { data: locs } = await (supabase as any).from('company_locations')
      .select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })
    setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.label || l.suburb || 'Outlet' })))

    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data: cs } = await (supabase as any).from('calls')
      .select('id, direction, status, is_voicemail, duration_seconds, from_number, to_number, caller_name, contact_name, agent_name, contact_id, created_at, ended_at, sentiment, recording_url')
      .eq('company_id', cid).gte('created_at', since).order('created_at', { ascending: false }).limit(2000)
    const rows: Call[] = cs || []
    setCalls(rows)

    const cids = Array.from(new Set(rows.map(c => c.contact_id).filter(Boolean))) as string[]
    if (cids.length) {
      const map: Record<string, string> = {}
      for (let i = 0; i < cids.length; i += 300) {
        const { data } = await (supabase as any).from('contacts').select('id, location_id').in('id', cids.slice(i, i + 300))
        for (const c of data || []) if (c.location_id) map[c.id] = c.location_id
      }
      setContactLoc(map)
    }

    await loadTeam(cid)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // Live clock (1s) + periodic refresh of team presence so the board stays live.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-AU', { hour12 }))
    tick()
    const c = setInterval(tick, 1000)
    return () => clearInterval(c)
  }, [hour12])
  useEffect(() => {
    if (!companyId) return
    const iv = setInterval(() => { loadTeam(companyId) }, 20000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const callLoc = (c: Call) => (c.contact_id ? contactLoc[c.contact_id] : null) || null

  // Team-member filter options: roster names ∪ agent names seen on calls.
  const agentOptions = useMemo(() => {
    const s = new Set<string>()
    roster.forEach(a => a.name && s.add(a.name))
    calls.forEach(c => { if (c.agent_name) s.add(c.agent_name) })
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [roster, calls])

  // Scope calls by location AND team member.
  const scoped = useMemo(() => {
    let arr = calls
    if (locFilter === 'none') arr = arr.filter(c => !callLoc(c))
    else if (locFilter !== 'all') arr = arr.filter(c => callLoc(c) === locFilter)
    if (agentFilter !== 'all') arr = arr.filter(c => (c.agent_name || '') === agentFilter)
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, contactLoc, locFilter, agentFilter])

  // ── Derived stats (today + yesterday for deltas) ─────────────────────────────
  const stats = useMemo(() => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const startYest = new Date(startToday); startYest.setDate(startYest.getDate() - 1)
    const today = scoped.filter(c => new Date(c.created_at) >= startToday)
    const yest = scoped.filter(c => { const t = new Date(c.created_at); return t >= startYest && t < startToday })
    const agg = (arr: Call[]) => {
      const a = arr.filter(isAnswered), m = arr.filter(isMissed).length, v = arr.filter(isVoicemail).length
      const dur = a.reduce((s, c) => s + (c.duration_seconds || 0), 0)
      return { total: arr.length, answered: a.length, missed: m, voicemail: v, missRate: arr.length ? Math.round(m / arr.length * 100) : 0, avgDur: a.length ? Math.round(dur / a.length) : 0 }
    }
    // Calls-over-time: 24 hourly buckets for today.
    const byHour = Array.from({ length: 24 }, () => 0)
    for (const c of today) byHour[new Date(c.created_at).getHours()]++
    return { today: agg(today), yest: agg(yest), liveNow: scoped.filter(isLive).length, byHour }
  }, [scoped])

  const liveCalls = useMemo(() => scoped.filter(isLive), [scoped])
  const available = useMemo(() => roster.filter(a => a.status === 'available'), [roster])
  const onCallAgents = useMemo(() => roster.filter(a => a.status === 'oncall'), [roster])

  const trend = (cur: number, prev: number, invert = false) => {
    if (prev === 0 && cur === 0) return null
    const pct = prev === 0 ? 100 : Math.round((cur - prev) / prev * 100)
    const up = pct > 0
    const good = invert ? !up : up
    const color = pct === 0 ? 'var(--slate)' : good ? '#16a34a' : '#dc2626'
    return (
      <span style={{ color, fontWeight: 700, fontSize: 11 }}>
        {pct === 0 ? '±' : up ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ color: 'var(--slate)', fontWeight: 600 }}>vs yest</span>
      </span>
    )
  }

  const feed = useMemo(() => scoped.slice(0, 14).map(c => ({
    id: c.id,
    who: callName(c),
    agent: c.agent_name,
    verb: isVoicemail(c) ? 'left a voicemail' : isAnswered(c) ? 'answered' : isLive(c) ? 'on a call' : 'missed',
    when: c.created_at,
    kind: isVoicemail(c) ? 'vm' : isAnswered(c) ? 'ok' : isLive(c) ? 'live' : 'miss',
  })), [scoped])

  // ── Alerts & issues ──────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { tone: 'red' | 'amber'; title: string; body: string }[] = []
    if (stats.today.missRate > 15 && stats.today.total >= 3) list.push({ tone: 'red', title: 'High miss rate', body: `Miss rate is ${stats.today.missRate}%, above the 15% target.` })
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const vmToday = scoped.filter(c => new Date(c.created_at) >= startToday && isVoicemail(c)).length
    if (vmToday > 0) list.push({ tone: 'amber', title: 'Voicemails waiting', body: `${vmToday} voicemail${vmToday === 1 ? '' : 's'} left today.` })
    const missToday = scoped.filter(c => new Date(c.created_at) >= startToday && isMissed(c)).length
    if (missToday > 0) list.push({ tone: 'amber', title: 'Missed calls to return', body: `${missToday} missed call${missToday === 1 ? '' : 's'} today may need a callback.` })
    return list
  }, [scoped, stats])

  // ── Insights: this 7 days vs the previous 7 days ──────────────────────────
  const insights = useMemo(() => {
    const now = Date.now()
    const cur = scoped.filter(c => new Date(c.created_at).getTime() >= now - 7 * 864e5)
    const prev = scoped.filter(c => {
      const t = new Date(c.created_at).getTime()
      return t >= now - 14 * 864e5 && t < now - 7 * 864e5
    })
    const agg = (arr: Call[]) => {
      const a = arr.filter(isAnswered).length, m = arr.filter(isMissed).length, v = arr.filter(isVoicemail).length
      const dur = arr.filter(isAnswered).reduce((s, c) => s + (c.duration_seconds || 0), 0)
      return { total: arr.length, answered: a, missed: m, voicemail: v, missRate: arr.length ? Math.round(m / arr.length * 100) : 0, avgDur: a ? Math.round(dur / a) : 0 }
    }
    const c = agg(cur), p = agg(prev)
    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round((a - b) / b * 100))
    const grid: { n: number; miss: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, miss: 0 })))
    for (const call of cur) {
      const d = new Date(call.created_at)
      const day = (d.getDay() + 6) % 7
      const cell = grid[day][d.getHours()]
      cell.n++; if (isMissed(call)) cell.miss++
    }
    const maxCell = Math.max(1, ...grid.flat().map(x => x.n))
    // Per team member (answered calls attributed to an agent).
    const byAgent = new Map<string, Call[]>()
    for (const call of cur) {
      if (!call.agent_name) continue
      if (!byAgent.has(call.agent_name)) byAgent.set(call.agent_name, [])
      byAgent.get(call.agent_name)!.push(call)
    }
    const agentRows = Array.from(byAgent.entries()).map(([name, arr]) => ({ name, ...agg(arr) })).sort((a, b) => b.total - a.total)
    const byLoc = new Map<string, Call[]>()
    for (const call of cur) {
      const lid = callLoc(call) || '__none'
      if (!byLoc.has(lid)) byLoc.set(lid, [])
      byLoc.get(lid)!.push(call)
    }
    const locRows = Array.from(byLoc.entries()).map(([lid, arr]) => ({
      name: lid === '__none' ? 'No location' : (locations.find(l => l.id === lid)?.name || 'Outlet'),
      ...agg(arr),
    })).sort((a, b) => b.total - a.total)
    return { c, p, pct, grid, maxCell, locRows, agentRows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, locations, contactLoc])

  // ── Call Logs: apply filters ──────────────────────────────────────────────
  const logRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter(c => {
      if (dirFilter !== 'all' && c.direction !== dirFilter) return false
      if (outcomeFilter === 'answered' && !isAnswered(c)) return false
      if (outcomeFilter === 'missed' && !isMissed(c)) return false
      if (outcomeFilter === 'voicemail' && !isVoicemail(c)) return false
      if (q) {
        const hay = `${callName(c)} ${c.from_number || ''} ${c.to_number || ''} ${c.agent_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [scoped, search, dirFilter, outcomeFilter])
  const logAgg = useMemo(() => {
    const a = logRows.filter(isAnswered).length, m = logRows.filter(isMissed).length, v = logRows.filter(isVoicemail).length
    const dur = logRows.filter(isAnswered).reduce((s, c) => s + (c.duration_seconds || 0), 0)
    return { total: logRows.length, answered: a, missed: m, voicemail: v, missRate: logRows.length ? Math.round(m / logRows.length * 100) : 0, avgDur: a ? Math.round(dur / a) : 0 }
  }, [logRows])

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)', padding: 16 }
  const kicker: React.CSSProperties = { margin: 0, fontSize: 10.5, color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const ctrl: React.CSSProperties = { padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', outline: 'none' }

  const kpi = (label: string, value: string | number, color: string, icon: React.ReactNode, footer?: React.ReactNode) => (
    <div style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 23, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
        <p style={{ ...kicker, marginTop: 4 }}>{label}</p>
        {footer && <div style={{ marginTop: 5 }}>{footer}</div>}
      </div>
    </div>
  )
  const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const ic = {
    phone: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><polyline points="20 6 9 17 4 12" /></svg>,
    x: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    vm: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="6" cy="14" r="4" /><circle cx="18" cy="14" r="4" /><line x1="6" y1="18" x2="18" y2="18" /></svg>,
    user: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    live: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" /></svg>,
    pct: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>,
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'ccspin 0.8s linear infinite' }} /><style>{`@keyframes ccspin{to{transform:rotate(360deg)}}`}</style>Loading command centre…</div>

  const tabBtn = (key: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(key)}
      style={{ padding: '8px 4px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--coral)' : 'transparent'}`, color: tab === key ? 'var(--ink)' : 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
      {label}
    </button>
  )

  const statusDot = (s: Agent['status']) => s === 'available' ? '#22c55e' : s === 'oncall' ? '#3b82f6' : '#cbd5e1'
  const statusLabel = (s: Agent['status']) => s === 'available' ? 'Available' : s === 'oncall' ? 'On call' : 'Offline'

  // Donut for answered / missed / voicemail split of today.
  const donut = () => {
    const t = stats.today
    const total = t.total || 1
    const aPct = t.answered / total * 100
    const mPct = t.missed / total * 100
    const vPct = t.voicemail / total * 100
    const bg = `conic-gradient(#16a34a 0 ${aPct}%, #dc2626 ${aPct}% ${aPct + mPct}%, #d97706 ${aPct + mPct}% ${aPct + mPct + vPct}%, var(--canvas) ${aPct + mPct + vPct}% 100%)`
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', background: bg, flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'var(--card,#fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{stats.today.total}</span>
            <span style={{ ...kicker, marginTop: 2 }}>Total</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
          {([['Answered', stats.today.answered, '#16a34a'], ['Missed', stats.today.missed, '#dc2626'], ['Voicemails', stats.today.voicemail, '#d97706']] as [string, number, string][]).map(([l, v, col]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--slate)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: col }} />
              <strong style={{ color: 'var(--ink)' }}>{v}</strong> {l}
              <span style={{ color: 'var(--slate)' }}>· {Math.round(v / total * 100)}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Tiny hourly bar chart of today's call volume.
  const sparkline = () => {
    const max = Math.max(1, ...stats.byHour)
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
          {stats.byHour.map((n, h) => (
            <div key={h} title={`${h}:00 — ${n} call${n === 1 ? '' : 's'}`}
              style={{ flex: 1, height: `${Math.max(3, n / max * 100)}%`, borderRadius: 3, background: n === 0 ? 'var(--canvas)' : 'color-mix(in srgb, var(--coral) 70%, transparent)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--slate)' }}>
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Command Centre</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>Live phone activity across your team</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontSize: 11.5, fontWeight: 800 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'ccpulse 1.4s ease-in-out infinite' }} /> LIVE
          </span>
          {/* Clock — hover reveals a pill to pick 12h/24h and save the default view. */}
          <div
            style={{ position: 'relative', textAlign: 'right' }}
            onMouseEnter={() => { clearTimeout(clockMenuTimer.current); setShowClockMenu(true) }}
            onMouseLeave={() => { clockMenuTimer.current = setTimeout(() => setShowClockMenu(false), 220) }}
          >
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', cursor: 'default' }}>{clock}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            {showClockMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.16)', padding: 10, width: 200, textAlign: 'left' }}>
                <p style={{ ...kicker, marginBottom: 7 }}>Time format</p>
                <div style={{ display: 'flex', background: 'var(--canvas)', borderRadius: 9, padding: 3, marginBottom: 10 }}>
                  {([[false, '24-hour'], [true, '12-hour']] as [boolean, string][]).map(([v, l]) => (
                    <button key={l} type="button" onClick={() => setHour12(v)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: hour12 === v ? '#fff' : 'transparent', color: hour12 === v ? 'var(--ink)' : 'var(--slate)', boxShadow: hour12 === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
                  ))}
                </div>
                <button type="button" onClick={saveDefaultView}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: savedFlash ? '#dcfce7' : 'var(--card,#fff)', color: savedFlash ? '#15803d' : 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {savedFlash ? '✓ Saved as default' : 'Save as default view'}
                </button>
                <p style={{ margin: '7px 0 0', fontSize: 10.5, color: 'var(--slate)', lineHeight: 1.4 }}>Saves the current tab, filters &amp; time format for next visit.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes ccpulse{0%,100%{opacity:1}50%{opacity:0.35}}@keyframes ccspin{to{transform:rotate(360deg)}}`}</style>

      {/* Tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 18 }}>
          {tabBtn('live', 'Live Board')}
          {tabBtn('logs', 'Call Logs')}
          {tabBtn('insights', 'Insights')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={ctrl} title="Filter by team member">
            <option value="all">All team members</option>
            {agentOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={ctrl} title="Filter by location">
            <option value="all">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="none">No location</option>
          </select>
        </div>
      </div>

      {/* ── LIVE BOARD ──────────────────────────────────────────────────────── */}
      {tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* KPI row with vs-yesterday deltas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {kpi('Calls today', stats.today.total, '#3b82f6', ic.phone, trend(stats.today.total, stats.yest.total))}
            {kpi('Answered', stats.today.answered, '#16a34a', ic.check, trend(stats.today.answered, stats.yest.answered))}
            {kpi('Missed', stats.today.missed, '#dc2626', ic.x, trend(stats.today.missed, stats.yest.missed, true))}
            {kpi('Voicemails', stats.today.voicemail, '#d97706', ic.vm, trend(stats.today.voicemail, stats.yest.voicemail, true))}
            {kpi('Available', available.length, '#16a34a', ic.user, <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>{roster.length ? `of ${roster.length} team` : 'team'}</span>)}
            {kpi('On call', stats.liveNow || onCallAgents.length, '#3b82f6', ic.live)}
            {kpi('Avg duration', fmtDurLong(stats.today.avgDur), '#7c3aed', ic.clock, trend(stats.today.avgDur, stats.yest.avgDur))}
            {kpi('Miss rate', `${stats.today.missRate}%`, stats.today.missRate > 15 ? '#dc2626' : '#16a34a', ic.pct, trend(stats.today.missRate, stats.yest.missRate, true))}
          </div>

          {/* Row: Team Presence | Live Calls | Activity Feed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 1.5fr) minmax(260px, 1fr)', gap: 18, alignItems: 'start' }} className="cc-live-grid">
            {/* Team presence */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={kicker}>Team presence</p>
                <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>{available.length} available</span>
              </div>
              {roster.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No team members found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                  {roster.map(a => (
                    <button key={a.id} type="button" onClick={() => setAgentFilter(agentFilter === a.name ? 'all' : a.name)}
                      title={agentFilter === a.name ? 'Clear filter' : `Filter to ${a.name}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 11, border: '1px solid var(--border)', borderLeft: `3px solid ${statusDot(a.status)}`, background: agentFilter === a.name ? 'color-mix(in srgb, var(--coral) 8%, transparent)' : 'var(--card,#fff)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ position: 'relative', flexShrink: 0 }}>
                        {a.avatar
                          ? <img src={a.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          : <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{initialsOf(a.name)}</span>}
                        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: statusDot(a.status), border: '2px solid var(--card,#fff)' }} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>{statusLabel(a.status)}{a.role ? ` · ${a.role}` : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live calls */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
                <p style={kicker}>Live calls {liveCalls.length > 0 && <span style={{ color: 'var(--coral)' }}>· {liveCalls.length} active</span>}</p>
              </div>
              {liveCalls.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--slate)' }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>No calls in progress</p>
                  <p style={{ margin: '5px 0 0', fontSize: 12 }}>Active calls appear here in real time.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
                    <thead>
                      <tr style={{ background: 'var(--canvas)', textAlign: 'left' }}>
                        {['Caller', 'Agent', 'Direction', 'Duration'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liveCalls.map(c => {
                        const secs = Math.max(0, Math.floor((Date.now() - new Date(c.created_at).getTime()) / 1000))
                        return (
                          <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)' }}>{callName(c)}</p>
                              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{prettyNum(c.direction === 'inbound' ? c.from_number : c.to_number)}</p>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{c.agent_name || '—'}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: c.direction === 'inbound' ? '#dcfce7' : '#dbeafe', color: c.direction === 'inbound' ? '#15803d' : '#1e40af' }}>{c.direction === 'inbound' ? '↓ In' : '↑ Out'}</span>
                            </td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'ccpulse 1.4s ease-in-out infinite' }} />{fmtDur(secs)}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div style={card}>
              <p style={{ ...kicker, marginBottom: 12 }}>Activity feed</p>
              {feed.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No recent calls.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 340, overflowY: 'auto' }}>
                  {feed.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: f.kind === 'ok' ? '#dcfce7' : f.kind === 'miss' ? '#fee2e2' : f.kind === 'vm' ? '#fef3c7' : '#dbeafe', color: f.kind === 'ok' ? '#16a34a' : f.kind === 'miss' ? '#dc2626' : f.kind === 'vm' ? '#d97706' : '#2563eb' }}>
                        {f.kind === 'vm' ? ic.vm : f.kind === 'miss' ? ic.x : ic.phone}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>
                          <strong>{f.who}</strong> — {f.verb}{f.agent && f.kind === 'ok' ? <span style={{ color: 'var(--slate)' }}> · {f.agent}</span> : null}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{new Date(f.when).toLocaleTimeString('en-AU', { hour12, hour: '2-digit', minute: '2-digit' })} · {timeAgo(f.when)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row: Performance Today | Alerts & agent leaderboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 18, alignItems: 'start' }} className="cc-perf-grid">
            <div style={card}>
              <p style={{ ...kicker, marginBottom: 14 }}>Performance today</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }} className="cc-perf-inner">
                <div>
                  <p style={{ ...kicker, marginBottom: 8 }}>Calls over time</p>
                  {sparkline()}
                </div>
                <div>
                  <p style={{ ...kicker, marginBottom: 8 }}>Answered vs missed</p>
                  {donut()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Alerts */}
              <div style={card}>
                <p style={{ ...kicker, marginBottom: 12 }}>Alerts &amp; issues {alerts.length > 0 && <span style={{ color: '#dc2626' }}>· {alerts.length}</span>}</p>
                {alerts.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>All clear — nothing needs attention. 🎉</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {alerts.map((al, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: al.tone === 'red' ? '#fef2f2' : '#fffbeb', border: `1px solid ${al.tone === 'red' ? '#fecaca' : '#fde68a'}` }}>
                        <span style={{ flexShrink: 0, color: al.tone === 'red' ? '#dc2626' : '#d97706', marginTop: 1 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" {...I}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: al.tone === 'red' ? '#b91c1c' : '#b45309' }}>{al.title}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>{al.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agent leaderboard (last 7 days) */}
              {insights.agentRows.length > 0 && (
                <div style={card}>
                  <p style={{ ...kicker, marginBottom: 12 }}>Top team members · 7 days</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {insights.agentRows.slice(0, 5).map((r, i) => (
                      <button key={r.name} type="button" onClick={() => setAgentFilter(agentFilter === r.name ? 'all' : r.name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: 'var(--slate)' }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>{r.answered}</span>
                        <span style={{ fontSize: 11, color: 'var(--slate)' }}>ans</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CALL LOGS ───────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            {kpi('Total calls', logAgg.total, '#3b82f6', ic.phone)}
            {kpi('Answered', logAgg.answered, '#16a34a', ic.check)}
            {kpi('Missed', logAgg.missed, '#dc2626', ic.x)}
            {kpi('Miss rate', `${logAgg.missRate}%`, logAgg.missRate > 15 ? '#dc2626' : '#16a34a', ic.pct)}
            {kpi('Avg duration', fmtDurLong(logAgg.avgDur), '#7c3aed', ic.clock)}
            {kpi('Voicemails', logAgg.voicemail, '#d97706', ic.vm)}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, number, or agent…"
              style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', background: 'var(--canvas)', borderRadius: 10, padding: 3 }}>
              {(['all', 'inbound', 'outbound'] as const).map(d => (
                <button key={d} type="button" onClick={() => setDirFilter(d)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize', background: dirFilter === d ? '#fff' : 'transparent', color: dirFilter === d ? 'var(--ink)' : 'var(--slate)', boxShadow: dirFilter === d ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  {d === 'all' ? 'All' : d === 'inbound' ? 'Incoming' : 'Outgoing'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', background: 'var(--canvas)', borderRadius: 10, padding: 3 }}>
              {(['all', 'answered', 'missed', 'voicemail'] as const).map(o => (
                <button key={o} type="button" onClick={() => setOutcomeFilter(o)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize', background: outcomeFilter === o ? '#fff' : 'transparent', color: outcomeFilter === o ? 'var(--ink)' : 'var(--slate)', boxShadow: outcomeFilter === o ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--canvas)', textAlign: 'left' }}>
                    {['Date/Time', 'Caller', 'Direction', 'Duration', 'Outcome', 'Agent'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--slate)' }}>No calls match.</td></tr>
                  )}
                  {logRows.slice(0, 200).map(c => {
                    const out = isVoicemail(c) ? { l: 'Voicemail', bg: '#fef3c7', fg: '#b45309' } : isAnswered(c) ? { l: 'Answered', bg: '#dcfce7', fg: '#15803d' } : isLive(c) ? { l: 'Live', bg: '#dbeafe', fg: '#1e40af' } : { l: 'Missed', bg: '#fee2e2', fg: '#dc2626' }
                    return (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: 'var(--slate)' }}>{new Date(c.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12 })}</td>
                        <td style={{ padding: '11px 14px', minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)' }}>{callName(c)}</p>
                          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{prettyNum(c.direction === 'inbound' ? c.from_number : c.to_number)}</p>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: c.direction === 'inbound' ? '#dcfce7' : '#dbeafe', color: c.direction === 'inbound' ? '#15803d' : '#1e40af' }}>
                            {c.direction === 'inbound' ? '↓ In' : '↑ Out'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDurLong(c.duration_seconds || 0)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: out.bg, color: out.fg }}>{out.l}</span>
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{c.agent_name || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {logRows.length > 200 && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>Showing the most recent 200 of {logRows.length} calls.</p>}
        </div>
      )}

      {/* ── INSIGHTS ────────────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {insights.pct(insights.c.missRate, insights.p.missRate) > 0 && insights.p.total > 0 && (
            <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
              ⚠️ Miss rate is up {insights.c.missRate - insights.p.missRate} points vs the previous 7 days ({insights.p.missRate}% → {insights.c.missRate}%).
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {([
              ['Total calls', insights.c.total, insights.pct(insights.c.total, insights.p.total), '#3b82f6'],
              ['Answered', insights.c.answered, insights.pct(insights.c.answered, insights.p.answered), '#16a34a'],
              ['Missed', insights.c.missed, insights.pct(insights.c.missed, insights.p.missed), '#dc2626'],
              ['Miss rate', `${insights.c.missRate}%`, insights.c.missRate - insights.p.missRate, '#d97706'],
              ['Voicemails', insights.c.voicemail, insights.pct(insights.c.voicemail, insights.p.voicemail), '#7c3aed'],
            ] as [string, string | number, number, string][]).map(([l, v, delta, col]) => (
              <div key={l} style={card}>
                <p style={kicker}>{l}</p>
                <p style={{ margin: '6px 0 2px', fontSize: 26, fontWeight: 800, color: col, letterSpacing: '-0.02em' }}>{v}</p>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : 'var(--slate)' }}>
                  {delta > 0 ? '+' : ''}{delta}{l === 'Miss rate' ? ' pts' : '%'} vs previous
                </p>
              </div>
            ))}
          </div>

          {/* Per team-member table */}
          {insights.agentRows.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <p style={{ ...kicker, padding: '16px 16px 0' }}>By team member · 7 days</p>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--canvas)', textAlign: 'left' }}>
                      {['Team member', 'Calls', 'Answered', 'Missed', 'Miss rate', 'Avg dur'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insights.agentRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => { setAgentFilter(r.name); setTab('logs') }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                        <td style={{ padding: '10px 14px' }}>{r.total}</td>
                        <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{r.answered}</td>
                        <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 600 }}>{r.missed}</td>
                        <td style={{ padding: '10px 14px', color: r.missRate > 15 ? '#d97706' : 'var(--slate)', fontWeight: 600 }}>{r.missRate}%</td>
                        <td style={{ padding: '10px 14px', color: 'var(--slate)' }}>{fmtDurLong(r.avgDur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Volume by day & hour */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <p style={kicker}>Volume by day &amp; hour</p>
              <p style={{ margin: 0, fontSize: 10.5, color: 'var(--slate)' }}>colour = call volume · red corner = high miss rate</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2, marginBottom: 2 }}>
                  <span />
                  {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 8.5, color: 'var(--slate)', textAlign: 'center' }}>{h}</span>)}
                </div>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, di) => (
                  <div key={day} style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{day}</span>
                    {insights.grid[di].map((cell, hi) => {
                      const intensity = cell.n / insights.maxCell
                      const bg = cell.n === 0 ? 'var(--canvas)' : `color-mix(in srgb, var(--coral) ${Math.round(20 + intensity * 70)}%, transparent)`
                      const highMiss = cell.n >= 2 && cell.miss / cell.n > 0.4
                      return (
                        <div key={hi} title={`${day} ${hi}:00 — ${cell.n} call${cell.n === 1 ? '' : 's'}${cell.miss ? `, ${cell.miss} missed` : ''}`}
                          style={{ position: 'relative', aspectRatio: '1', borderRadius: 3, background: bg, border: '1px solid var(--border)' }}>
                          {highMiss && <span style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: '5px solid #dc2626', borderLeft: '5px solid transparent' }} />}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Locations table */}
          {insights.locRows.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <p style={{ ...kicker, padding: '16px 16px 0' }}>Locations</p>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--canvas)', textAlign: 'left' }}>
                      {['Location', 'Calls', 'Answered', 'Missed', 'Miss rate', 'Avg dur'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insights.locRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                        <td style={{ padding: '10px 14px' }}>{r.total}</td>
                        <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{r.answered}</td>
                        <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 600 }}>{r.missed}</td>
                        <td style={{ padding: '10px 14px', color: r.missRate > 15 ? '#d97706' : 'var(--slate)', fontWeight: 600 }}>{r.missRate}%</td>
                        <td style={{ padding: '10px 14px', color: 'var(--slate)' }}>{fmtDurLong(r.avgDur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@media (max-width: 1080px){ .cc-live-grid{ grid-template-columns: 1fr !important; } .cc-perf-grid{ grid-template-columns: 1fr !important; } } @media (max-width: 640px){ .cc-perf-inner{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
