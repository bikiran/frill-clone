'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'

// ── Command Centre ───────────────────────────────────────────────────────────
// A live call-centre dashboard over the `calls` table: a real-time Live Board,
// a filterable Call Logs table, and a period-over-period Insights view. Calls
// carry no location column, so location is resolved best-effort via the
// caller's contact (contact_id → contacts.location_id).

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
type Agent = { id: string; name: string | null; avatar: string | null }

const isVoicemail = (c: Call) => !!c.is_voicemail || c.status === 'voicemail'
const isLive = (c: Call) => ['ringing', 'initiated', 'in_progress'].includes(c.status) && !c.ended_at
const isAnswered = (c: Call) => !isVoicemail(c) && (['answered', 'completed'].includes(c.status) || (c.duration_seconds || 0) > 0)
const isMissed = (c: Call) => !isVoicemail(c) && !isAnswered(c) && !isLive(c)

const fmtDur = (s: number) => {
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

export default function CommandCentrePage() {
  const [tab, setTab] = useState<'live' | 'logs' | 'insights'>('live')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [contactLoc, setContactLoc] = useState<Record<string, string>>({})
  const [available, setAvailable] = useState<Agent[]>([])
  const [onCallCount, setOnCallCount] = useState(0)
  const [locFilter, setLocFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState('')

  // Call Logs filters
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'answered' | 'missed' | 'voicemail'>('all')

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

  const loadPresence = async (cid: string) => {
    const cutoff = new Date(Date.now() - 120000).toISOString()
    const { data: pres } = await (supabase as any).from('agent_presence')
      .select('user_id, available, last_seen_at').eq('company_id', cid).gte('last_seen_at', cutoff)
    const avail = (pres || []).filter((p: any) => p.available !== false)
    setOnCallCount((pres || []).filter((p: any) => p.available === false).length)
    let names: Record<string, { name: string | null; avatar_url: string | null }> = {}
    const uids = Array.from(new Set(avail.map((p: any) => p.user_id).filter(Boolean)))
    if (uids.length) {
      try {
        const r = await fetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: uids }) })
        const d = await r.json(); names = d.names || {}
      } catch {}
    }
    setAvailable(avail.map((a: any) => ({ id: a.user_id, name: names[a.user_id]?.name || null, avatar: names[a.user_id]?.avatar_url || null })))
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

    await loadPresence(cid)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // Live clock + periodic refresh of calls/presence so the board stays live.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-AU', { hour12: false }))
    tick()
    const c = setInterval(tick, 1000)
    return () => clearInterval(c)
  }, [])
  useEffect(() => {
    if (!companyId) return
    const iv = setInterval(() => { loadPresence(companyId); }, 20000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const callLoc = (c: Call) => (c.contact_id ? contactLoc[c.contact_id] : null) || null
  const locScoped = useMemo(() => (
    locFilter === 'all' ? calls
      : locFilter === 'none' ? calls.filter(c => !callLoc(c))
        : calls.filter(c => callLoc(c) === locFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [calls, contactLoc, locFilter])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const today = locScoped.filter(c => new Date(c.created_at) >= startToday)
    const answered = today.filter(isAnswered)
    const agg = (arr: Call[]) => {
      const a = arr.filter(isAnswered).length, m = arr.filter(isMissed).length, v = arr.filter(isVoicemail).length
      return { total: arr.length, answered: a, missed: m, voicemail: v, missRate: arr.length ? Math.round(m / arr.length * 100) : 0 }
    }
    const answeredDur = answered.reduce((s, c) => s + (c.duration_seconds || 0), 0)
    return {
      today: agg(today),
      avgDur: answered.length ? Math.round(answeredDur / answered.length) : 0,
      liveNow: locScoped.filter(isLive).length,
    }
  }, [locScoped])

  const feed = useMemo(() => locScoped.slice(0, 12).map(c => ({
    id: c.id,
    who: callName(c),
    verb: isVoicemail(c) ? 'left a voicemail' : isAnswered(c) ? 'answered' : isLive(c) ? 'on a call' : 'missed',
    when: c.created_at,
    kind: isVoicemail(c) ? 'vm' : isAnswered(c) ? 'ok' : isLive(c) ? 'live' : 'miss',
  })), [locScoped])

  // ── Insights: this 7 days vs the previous 7 days ──────────────────────────
  const insights = useMemo(() => {
    const now = Date.now()
    const cur = locScoped.filter(c => new Date(c.created_at).getTime() >= now - 7 * 864e5)
    const prev = locScoped.filter(c => {
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
    // Heatmap: day-of-week (Mon..Sun) × hour, count + miss.
    const grid: { n: number; miss: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, miss: 0 })))
    for (const call of cur) {
      const d = new Date(call.created_at)
      const day = (d.getDay() + 6) % 7 // Mon=0
      const cell = grid[day][d.getHours()]
      cell.n++; if (isMissed(call)) cell.miss++
    }
    const maxCell = Math.max(1, ...grid.flat().map(x => x.n))
    // Per location
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
    return { c, p, pct, grid, maxCell, locRows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locScoped, locations, contactLoc])

  // ── Call Logs: apply filters ──────────────────────────────────────────────
  const logRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return locScoped.filter(c => {
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
  }, [locScoped, search, dirFilter, outcomeFilter])
  const logAgg = useMemo(() => {
    const a = logRows.filter(isAnswered).length, m = logRows.filter(isMissed).length, v = logRows.filter(isVoicemail).length
    const dur = logRows.filter(isAnswered).reduce((s, c) => s + (c.duration_seconds || 0), 0)
    return { total: logRows.length, answered: a, missed: m, voicemail: v, missRate: logRows.length ? Math.round(m / logRows.length * 100) : 0, avgDur: a ? Math.round(dur / a) : 0 }
  }, [logRows])

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)', padding: 16 }
  const kicker: React.CSSProperties = { margin: 0, fontSize: 10.5, color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }

  const kpi = (label: string, value: string | number, color: string, icon: React.ReactNode) => (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
        <p style={{ ...kicker, marginTop: 4 }}>{label}</p>
      </div>
    </div>
  )
  const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const ic = {
    phone: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><polyline points="20 6 9 17 4 12"/></svg>,
    x: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    vm: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><line x1="6" y1="18" x2="18" y2="18"/></svg>,
    user: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    live: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49"/></svg>,
    pct: <svg width="18" height="18" viewBox="0 0 24 24" {...I}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'ccspin 0.8s linear infinite' }} /><style>{`@keyframes ccspin{to{transform:rotate(360deg)}}`}</style>Loading command centre…</div>

  const tabBtn = (key: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(key)}
      style={{ padding: '8px 4px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--coral)' : 'transparent'}`, color: tab === key ? 'var(--ink)' : 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
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
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{clock}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
      <style>{`@keyframes ccpulse{0%,100%{opacity:1}50%{opacity:0.35}}@keyframes ccspin{to{transform:rotate(360deg)}}`}</style>

      {/* Tabs + location filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 18 }}>
          {tabBtn('live', 'Live Board')}
          {tabBtn('logs', 'Call Logs')}
          {tabBtn('insights', 'Insights')}
        </div>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', marginBottom: 8 }}>
          <option value="all">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="none">No location</option>
        </select>
      </div>

      {/* ── LIVE BOARD ──────────────────────────────────────────────────────── */}
      {tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {kpi('Calls today', stats.today.total, '#3b82f6', ic.phone)}
            {kpi('Answered', stats.today.answered, '#16a34a', ic.check)}
            {kpi('Missed', stats.today.missed, '#dc2626', ic.x)}
            {kpi('Voicemails', stats.today.voicemail, '#d97706', ic.vm)}
            {kpi('Available', available.length, '#16a34a', ic.user)}
            {kpi('On call', onCallCount || stats.liveNow, '#3b82f6', ic.live)}
            {kpi('Miss rate', `${stats.today.missRate}%`, stats.today.missRate > 15 ? '#dc2626' : '#16a34a', ic.pct)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 18, alignItems: 'start' }} className="cc-live-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              {/* Available agents */}
              <div style={card}>
                <p style={{ ...kicker, marginBottom: 12 }}>Available · {available.length}</p>
                {available.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No agents online right now.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    {available.map(a => {
                      const nm = a.name || 'Agent'
                      const initials = nm.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                      return (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, border: '1px solid var(--border)', borderLeft: '3px solid #22c55e' }}>
                          {a.avatar
                            ? <img src={a.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</span>}
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Available</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Today's performance */}
              <div style={card}>
                <p style={{ ...kicker, marginBottom: 12 }}>Today&rsquo;s performance</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                  {([['Total calls', String(stats.today.total), 'var(--ink)'], ['Answered', String(stats.today.answered), '#16a34a'], ['Avg duration', fmtDur(stats.avgDur), 'var(--ink)'], ['Voicemails', String(stats.today.voicemail), '#d97706']] as [string, string, string][]).map(([l, v, col]) => (
                    <div key={l} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 11, background: 'var(--canvas)' }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: col }}>{v}</p>
                      <p style={{ ...kicker, marginTop: 4 }}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity feed */}
            <div style={card}>
              <p style={{ ...kicker, marginBottom: 12 }}>Activity feed</p>
              {feed.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No recent calls.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {feed.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: f.kind === 'ok' ? '#dcfce7' : f.kind === 'miss' ? '#fee2e2' : f.kind === 'vm' ? '#fef3c7' : '#dbeafe', color: f.kind === 'ok' ? '#16a34a' : f.kind === 'miss' ? '#dc2626' : f.kind === 'vm' ? '#d97706' : '#2563eb' }}>
                        {f.kind === 'vm' ? ic.vm : f.kind === 'miss' ? ic.x : ic.phone}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>
                          <strong>{f.who}</strong> — {f.verb}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{timeAgo(f.when)}</p>
                      </div>
                    </div>
                  ))}
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
            {kpi('Avg duration', fmtDur(logAgg.avgDur), '#7c3aed', ic.live)}
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
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: 'var(--slate)' }}>{new Date(c.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '11px 14px', minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)' }}>{callName(c)}</p>
                          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{prettyNum(c.direction === 'inbound' ? c.from_number : c.to_number)}</p>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: c.direction === 'inbound' ? '#dcfce7' : '#dbeafe', color: c.direction === 'inbound' ? '#15803d' : '#1e40af' }}>
                            {c.direction === 'inbound' ? '↓ In' : '↑ Out'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDur(c.duration_seconds || 0)}</td>
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

          {/* Conversion funnel */}
          <div style={card}>
            <p style={{ ...kicker, marginBottom: 14 }}>Conversion funnel</p>
            {([['Calls', insights.c.total, '#3b82f6'], ['Answered', insights.c.answered, '#16a34a']] as [string, number, string][]).map(([l, v, col]) => {
              const pctW = insights.c.total ? Math.round(v / insights.c.total * 100) : 0
              return (
                <div key={l} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: 'var(--slate)', fontWeight: 600 }}>{l}</span>
                    <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{v} · {pctW}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 6, background: 'var(--canvas)', overflow: 'hidden' }}>
                    <div style={{ width: `${pctW}%`, height: '100%', background: col, borderRadius: 6, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>

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
                        <td style={{ padding: '10px 14px', color: 'var(--slate)' }}>{fmtDur(r.avgDur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@media (max-width: 820px){ .cc-live-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
