'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'

type Call = {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: string
  duration_seconds: number | null
  recording_url: string | null
  transcription: string | null
  ai_summary: string | null
  sentiment: string | null
  is_voicemail: boolean | null
  caller_name?: string | null
  agent_name: string | null
  answered_by?: string | null
  contact_id: string | null
  contact_name?: string | null
  transfer_state?: string | null
  transferred_at?: string | null
  transcript_en?: string | null
  created_at: string
}

// ── Clean, compact call recording player (replaces the native audio slider) ──
function CallPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const fmt = (s: number) => { if (!isFinite(s)) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}` }
  const toggle = () => { const a = ref.current; if (!a) return; if (playing) { a.pause(); setPlaying(false) } else { a.play().then(() => setPlaying(true)).catch(() => {}) } }
  const seek = (e: React.MouseEvent) => {
    const a = ref.current, t = trackRef.current; if (!a || !t || !dur) return
    const r = t.getBoundingClientRect()
    a.currentTime = Math.min(dur, Math.max(0, ((e.clientX - r.left) / r.width) * dur))
  }
  const pct = dur ? (cur / dur) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--canvas)', borderRadius: 12, padding: '10px 14px' }}>
      <audio ref={ref} src={url} preload="metadata"
        onLoadedMetadata={e => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCur(0) }} />
      <button onClick={toggle} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--coral)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {playing
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="6 4 20 12 6 20 6 4"/></svg>}
      </button>
      <div ref={trackRef} onClick={seek} style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', cursor: 'pointer', position: 'relative', minWidth: 60 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--coral)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#fff', border: '2px solid var(--coral)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--slate)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(cur)} / {fmt(dur)}</span>
    </div>
  )
}

export default function CallsPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededCalls = seededCid ? readCache<Call[]>(`calls:${seededCid}`) : undefined
  const [calls, setCalls] = useState<Call[]>(seededCalls ?? [])
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [loading, setLoading] = useState(!seededCalls)
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed' | 'voicemail'>('all')
  const [search, setSearch] = useState('')
  // Advanced filters (all default to '' = any). Applied on top of the direction tab.
  const emptyAdv = { outcome: '', agent: '', date: '', from: '', to: '', duration: '', number: '', contact: '', recording: '', transcription: '', summary: '', sentiment: '', transferred: '' }
  const [adv, setAdv] = useState<Record<string, string>>(emptyAdv)
  const [advOpen, setAdvOpen] = useState(false)
  const activeAdvCount = Object.values(adv).filter(Boolean).length
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [contact, setContact] = useState<any>(null)
  const [convId, setConvId] = useState<string | null>(null)
  // Saved contacts keyed by phone last-9-digit tail, so a call whose row never
  // captured a contact (arrived before the contact was saved, or the ingestion
  // scan missed it) still shows the person's name here. Formatting differs
  // (+61466270100 vs 0466270100) so we always compare on the 9-digit tail.
  const [contactsByTail, setContactsByTail] = useState<Record<string, { id: string; name: string }>>({})
  const [openTranscript, setOpenTranscript] = useState<Set<string>>(new Set())
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set())
  const [width, setWidth] = useState(1400)
  useEffect(() => {
    const check = () => setWidth(window.innerWidth)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const isMobile = width < 768
  const isNarrow = width < 1140   // hide the contact rail on tablets

  useEffect(() => {
    const init = async () => {
      let cid: string | null = seededCid
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)
    }
    init()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('calls')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(500)
    setCalls(data || [])
    writeCache(`calls:${cid}`, data || [])
  }

  useEffect(() => {
    if (!companyId) return
    const channel = (supabase as any)
      .channel(`calls-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          setCalls(prev => {
            if (payload.eventType === 'INSERT') return prev.find(c => c.id === payload.new.id) ? prev : [payload.new, ...prev]
            if (payload.eventType === 'UPDATE') return prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
            if (payload.eventType === 'DELETE') return prev.filter(c => c.id !== payload.old.id)
            return prev
          })
        })
      .subscribe()
    return () => { (supabase as any).removeChannel(channel) }
  }, [companyId])

  // Build the phone-tail → contact map once per company (small id/name/phone
  // rows), so the call log can resolve names the calls table never stored.
  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const { data } = await (supabase as any).from('contacts')
        .select('id, name, phone').eq('company_id', companyId).not('phone', 'is', null).limit(10000)
      if (!active) return
      const map: Record<string, { id: string; name: string }> = {}
      for (const c of (data || [])) {
        const tail = String(c.phone || '').replace(/\D/g, '').slice(-9)
        if (tail && c.name && !map[tail]) map[tail] = { id: c.id, name: c.name }
      }
      setContactsByTail(map)
    })()
    return () => { active = false }
  }, [companyId])

  const tailOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
  const fmtDuration = (s: number | null) => { if (!s) return '0:00'; const m = Math.floor(s / 60), sec = s % 60; return `${m}:${sec.toString().padStart(2, '0')}` }
  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const d = Math.floor(diff / 86_400_000), h = Math.floor(diff / 3_600_000), m = Math.floor(diff / 60_000)
    if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return 'just now'
  }
  const isMissed = (c: Call) => c.direction === 'inbound' && ['no-answer', 'missed', 'failed'].includes(c.status) && !c.is_voicemail
  const isVoicemail = (c: Call) => !!c.is_voicemail || c.status === 'voicemail'
  const otherParty = (c: Call) => (c.direction === 'inbound' ? c.from_number : c.to_number) || 'Unknown'
  const isDiagnostic = (t: string | null) => !!t && /^\[/.test(t)
  const callLabel = (c: Call) => {
    if (isVoicemail(c)) return `Voicemail ${fmtDuration(c.duration_seconds)}`
    if (isMissed(c)) return 'Missed'
    if (c.recording_url) return `Answered ${fmtDuration(c.duration_seconds)}`
    if (c.duration_seconds) return fmtDuration(c.duration_seconds)
    return 'No recording'
  }

  const counts = {
    all: calls.length,
    inbound: calls.filter(c => c.direction === 'inbound').length,
    outbound: calls.filter(c => c.direction === 'outbound').length,
    missed: calls.filter(isMissed).length,
    voicemail: calls.filter(isVoicemail).length,
  }

  // ── Advanced-filter helpers ─────────────────────────────────────────────────
  const agentOf = (c: Call) => (c.agent_name || c.answered_by || '').trim()
  const businessNumberOf = (c: Call) => (c.direction === 'inbound' ? c.to_number : c.from_number) || ''
  const outcomeOf = (c: Call): string => {
    if (isVoicemail(c)) return 'voicemail'
    if (c.status === 'busy') return 'busy'
    if (c.status === 'failed') return 'failed'
    if (['answered', 'completed'].includes(c.status) || (c.duration_seconds || 0) > 0) return 'answered'
    return c.direction === 'inbound' ? 'missed' : 'no_answer'
  }
  const durationBucket = (c: Call): string => {
    const d = c.duration_seconds || 0
    return d < 30 ? 'lt30' : d < 120 ? '30_120' : d < 300 ? '120_300' : 'gt300'
  }
  const agentOptions = useMemo(() => Array.from(new Set(calls.map(agentOf).filter(Boolean))).sort(), [calls])
  const numberOptions = useMemo(() => Array.from(new Set(calls.map(businessNumberOf).filter(Boolean))).sort(), [calls])

  const passesAdv = (c: Call): boolean => {
    if (adv.outcome && outcomeOf(c) !== adv.outcome) return false
    if (adv.agent) { const a = agentOf(c); if (adv.agent === '__unassigned' ? !!a : a !== adv.agent) return false }
    if (adv.number && businessNumberOf(c) !== adv.number) return false
    if (adv.duration && durationBucket(c) !== adv.duration) return false
    if (adv.contact) { const known = !!c.contact_id; if (adv.contact === 'known' ? !known : known) return false }
    if (adv.recording) { const has = !!c.recording_url; if (adv.recording === 'yes' ? !has : has) return false }
    if (adv.transcription) { const has = !!(c.transcription || c.transcript_en); if (adv.transcription === 'yes' ? !has : has) return false }
    if (adv.summary) { const has = !!c.ai_summary; if (adv.summary === 'yes' ? !has : has) return false }
    if (adv.sentiment && (c.sentiment || '') !== adv.sentiment) return false
    if (adv.transferred) { const t = !!c.transferred_at || (!!c.transfer_state && c.transfer_state !== 'none'); if (adv.transferred === 'yes' ? !t : t) return false }
    if (adv.date || adv.from || adv.to) {
      const t = +new Date(c.created_at)
      const now = Date.now()
      const sod = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
      if (adv.date === 'today' && t < sod) return false
      if (adv.date === 'yesterday' && (t < sod - 86400000 || t >= sod)) return false
      if (adv.date === '7d' && t < now - 7 * 86400000) return false
      if (adv.date === '30d' && t < now - 30 * 86400000) return false
      if (adv.from && t < +new Date(adv.from)) return false
      if (adv.to && t > +new Date(adv.to) + 86400000) return false
    }
    return true
  }

  const groups = useMemo(() => {
    const passesTab = (c: Call) =>
      filter === 'all' ? true :
      filter === 'inbound' ? c.direction === 'inbound' :
      filter === 'outbound' ? c.direction === 'outbound' :
      filter === 'missed' ? isMissed(c) : isVoicemail(c)
    const q = search.trim().toLowerCase()
    const map = new Map<string, Call[]>()
    for (const c of calls) {
      if (!passesTab(c)) continue
      if (!passesAdv(c)) continue
      const key = otherParty(c)
      const resolvedName = contactsByTail[tailOf(key)]?.name || ''
      if (q && !key.toLowerCase().includes(q) && !(c.caller_name || '').toLowerCase().includes(q) && !resolvedName.toLowerCase().includes(q)) continue
      const arr = map.get(key) || []; arr.push(c); map.set(key, arr)
    }
    const out = Array.from(map.entries()).map(([key, cs]) => {
      const sorted = [...cs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      // Prefer the name frozen on the call row; fall back to a saved contact
      // resolved by phone tail so calls that never captured one still get named.
      const resolved = contactsByTail[tailOf(key)]
      return {
        key,
        name: sorted.find(c => c.caller_name)?.caller_name || resolved?.name || key,
        calls: sorted, latest: sorted[0],
        contactId: sorted.find(c => c.contact_id)?.contact_id || resolved?.id || null,
      }
    })
    out.sort((a, b) => +new Date(b.latest.created_at) - +new Date(a.latest.created_at))
    return out
  }, [calls, filter, search, contactsByTail, adv]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isMobile) return
    if (groups.length && (!selectedKey || !groups.find(g => g.key === selectedKey))) setSelectedKey(groups[0].key)
  }, [groups, selectedKey, isMobile])

  const selected = groups.find(g => g.key === selectedKey) || null

  // Load the linked contact + its latest conversation (for the inbox link).
  useEffect(() => {
    const cid = selected?.contactId
    setContact(null); setConvId(null)
    if (!cid || !companyId) return
    let active = true
    ;(supabase as any).from('contacts').select('*').eq('id', cid).maybeSingle().then(({ data }: any) => { if (active) setContact(data) })
    ;(supabase as any).from('conversations').select('id').eq('company_id', companyId).eq('contact_id', cid)
      .order('last_message_at', { ascending: false }).limit(1)
      .then(({ data }: any) => { if (active) setConvId(data?.[0]?.id || null) })
    return () => { active = false }
  }, [selectedKey, companyId]) // eslint-disable-line

  const summarize = async (c: Call) => {
    setSummarizing(s => new Set(s).add(c.id))
    try {
      const res = await fetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: c.id }) })
      const d = await res.json()
      if (d.summary) setCalls(cs => cs.map(x => x.id === c.id ? { ...x, ai_summary: d.summary } : x))
    } catch {} finally { setSummarizing(s => { const n = new Set(s); n.delete(c.id); return n }) }
  }
  const toggleTranscript = (id: string) => setOpenTranscript(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const Avatar = ({ name, size = 38 }: { name: string; size?: number }) => (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.4, flexShrink: 0 }}>
      {(/[a-z]/i.test(name) ? name.replace(/[^a-z]/gi, '')[0] : '#')?.toUpperCase() || '#'}
    </span>
  )
  const DirIcon = ({ c }: { c: Call }) => (
    <span style={{ color: isMissed(c) ? '#dc2626' : c.direction === 'inbound' ? '#16a34a' : '#2563eb', fontSize: 14 }}>{c.direction === 'inbound' ? '↙' : '↗'}</span>
  )
  const sentimentChip = (s: string | null) => {
    if (!s) return null
    const tone = s === 'positive' ? { bg: '#dcfce7', fg: '#16a34a' } : s === 'negative' ? { bg: '#fee2e2', fg: '#dc2626' } : { bg: '#f3f4f6', fg: '#6b7280' }
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: tone.bg, color: tone.fg, textTransform: 'capitalize' }}>{s}</span>
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading calls…</div>

  const showList = !isMobile || !selected
  const showDetail = !isMobile || !!selected
  const showContact = !isMobile && !isNarrow && !!selected

  return (
    <div style={{ padding: '20px 24px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`.calls-tabs::-webkit-scrollbar{display:none}`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 14px' }}>Call Logs</h1>
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* ── List ── */}
        {showList && (
        <div style={{ width: isMobile ? '100%' : 330, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
            <div className="calls-tabs" style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {([['all', 'All'], ['inbound', 'Incoming'], ['outbound', 'Outgoing'], ['missed', 'Missed'], ['voicemail', 'Voicemail']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid ' + (filter === k ? 'var(--coral)' : 'var(--border)'), background: filter === k ? 'var(--peach)' : '#fff', color: filter === k ? 'var(--coral)' : 'var(--slate)' }}>
                  {l} <span style={{ opacity: 0.7 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            {/* Advanced filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <button onClick={() => setAdvOpen(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (activeAdvCount ? 'var(--coral)' : 'var(--border)'), background: activeAdvCount ? 'var(--peach)' : '#fff', color: activeAdvCount ? 'var(--coral)' : 'var(--slate)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                Filters{activeAdvCount ? ` · ${activeAdvCount}` : ''}
              </button>
              {activeAdvCount > 0 && (
                <button onClick={() => setAdv(emptyAdv)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
              )}
            </div>
            {advOpen && (() => {
              const AF: { key: string; label: string; opts: [string, string][] }[] = [
                { key: 'outcome', label: 'Outcome', opts: [['', 'Any'], ['answered', 'Answered'], ['missed', 'Missed'], ['voicemail', 'Voicemail'], ['failed', 'Failed'], ['busy', 'Busy'], ['no_answer', 'No answer']] },
                { key: 'agent', label: 'Taken by', opts: [['', 'Anyone'], ['__unassigned', 'Unassigned'], ...agentOptions.map(a => [a, a] as [string, string])] },
                { key: 'date', label: 'Date', opts: [['', 'Any time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['custom', 'Custom…']] },
                { key: 'duration', label: 'Duration', opts: [['', 'Any'], ['lt30', 'Under 30s'], ['30_120', '30s–2m'], ['120_300', '2–5m'], ['gt300', '5m+']] },
                { key: 'number', label: 'Business number', opts: [['', 'Any'], ...numberOptions.map(n => [n, n] as [string, string])] },
                { key: 'contact', label: 'Contact', opts: [['', 'Any'], ['known', 'Known contact'], ['unknown', 'Unknown number']] },
                { key: 'sentiment', label: 'Sentiment', opts: [['', 'Any'], ['positive', 'Positive'], ['neutral', 'Neutral'], ['negative', 'Negative']] },
                { key: 'recording', label: 'Recording', opts: [['', 'Any'], ['yes', 'Has recording'], ['no', 'No recording']] },
                { key: 'transcription', label: 'Transcription', opts: [['', 'Any'], ['yes', 'Has transcription'], ['no', 'None']] },
                { key: 'summary', label: 'AI summary', opts: [['', 'Any'], ['yes', 'Has summary'], ['no', 'None']] },
                { key: 'transferred', label: 'Transferred', opts: [['', 'Any'], ['yes', 'Transferred'], ['no', 'Not transferred']] },
              ]
              const sel: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: '#fff', color: 'var(--ink)', outline: 'none' }
              const lab: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 3 }
              return (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas, #f8fafc)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  {AF.map(f => (
                    <div key={f.key}>
                      <label style={lab}>{f.label}</label>
                      <select value={adv[f.key]} onChange={e => setAdv(a => ({ ...a, [f.key]: e.target.value }))} style={sel}>
                        {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                  {adv.date === 'custom' && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 9 }}>
                      <div style={{ flex: 1 }}><label style={lab}>From</label><input type="date" value={adv.from} onChange={e => setAdv(a => ({ ...a, from: e.target.value }))} style={sel} /></div>
                      <div style={{ flex: 1 }}><label style={lab}>To</label><input type="date" value={adv.to} onChange={e => setAdv(a => ({ ...a, to: e.target.value }))} style={sel} /></div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {groups.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--slate)', fontSize: 13, textAlign: 'center' }}>No calls to show.</p>
            ) : groups.map(g => (
              <button key={g.key} onClick={() => setSelectedKey(g.key)}
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 11, alignItems: 'center', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: selectedKey === g.key ? 'var(--peach)' : 'transparent', cursor: 'pointer' }}>
                <Avatar name={g.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--slate)', flexShrink: 0 }}>{new Date(g.latest.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <DirIcon c={g.latest} />
                    <span style={{ fontSize: 12, color: isMissed(g.latest) ? '#dc2626' : isVoicemail(g.latest) ? '#b45309' : 'var(--slate)' }}>{callLabel(g.latest)}</span>
                    {g.calls.length > 1 && <span style={{ fontSize: 11, color: 'var(--slate)' }}>· {g.calls.length} calls</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* ── Timeline ── */}
        {showDetail && (
        <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ margin: 'auto', color: 'var(--slate)', fontSize: 13 }}>Select a call to see its history.</div>
          ) : (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                {isMobile && <button onClick={() => setSelectedKey(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--slate)' }}>←</button>}
                <Avatar name={selected.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{selected.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{selected.key !== selected.name ? selected.key + ' · ' : ''}Last activity {relTime(selected.latest.created_at)}</p>
                </div>
                <span style={{ fontSize: 12, color: 'var(--slate)' }}>{selected.calls.length} call{selected.calls.length === 1 ? '' : 's'}</span>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, padding: '18px 20px', background: 'var(--canvas)' }}>
                {selected.calls.map(c => {
                  const realTranscript = c.transcription && !isDiagnostic(c.transcription)
                  return (
                  <div key={c.id} style={{ marginBottom: 16 }}>
                    <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--slate)', margin: '0 0 10px' }}>
                      <DirIcon c={c} /> {c.direction === 'inbound' ? 'Inbound' : 'Outbound'} call {c.direction === 'inbound' ? 'from' : 'to'} {selected.key} · {new Date(c.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                      {c.ai_summary ? (
                        <div style={{ background: '#f5f8ff', borderRadius: 10, padding: '12px 14px', marginBottom: c.recording_url || realTranscript ? 12 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2563eb' }}>✨ Call Summary</span>
                            {sentimentChip(c.sentiment)}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>{c.ai_summary}</p>
                        </div>
                      ) : realTranscript ? (
                        <button onClick={() => summarize(c)} disabled={summarizing.has(c.id)} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                          ✨ {summarizing.has(c.id) ? 'Summarizing…' : 'Generate AI summary'}
                        </button>
                      ) : null}

                      {isDiagnostic(c.transcription) && (
                        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#b45309', fontFamily: 'ui-monospace, monospace', background: '#fffbeb', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>{c.transcription}</p>
                      )}

                      {c.recording_url ? (
                        <>
                          <CallPlayer url={c.recording_url} />
                          <div style={{ marginTop: 8 }}>
                            <a href={c.recording_url} download style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>⬇ Download recording</a>
                          </div>
                        </>
                      ) : !isDiagnostic(c.transcription) && !c.ai_summary ? (
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No call recording · {callLabel(c)}</p>
                      ) : null}

                      {realTranscript && (
                        <div style={{ marginTop: 10 }}>
                          <button onClick={() => toggleTranscript(c.id)} style={{ background: 'none', border: 'none', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                            {openTranscript.has(c.id) ? 'Hide transcription' : 'View transcription'}
                          </button>
                          {openTranscript.has(c.id) && (
                            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--canvas)', borderRadius: 8, padding: '10px 12px' }}>{c.transcription}</p>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--slate)', flexWrap: 'wrap' }}>
                        <span>Duration: {fmtDuration(c.duration_seconds)}</span>
                        <span>Status: {isVoicemail(c) ? 'Voicemail' : isMissed(c) ? 'Missed' : c.status}</span>
                        {c.agent_name && <span>Agent: {c.agent_name}</span>}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </>
          )}
        </div>
        )}

        {/* ── Contact rail ── */}
        {showContact && selected && (
        <div style={{ width: 280, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto', padding: '22px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 18 }}>
            <Avatar name={contact?.name || selected.name} size={64} />
            <p style={{ margin: '12px 0 2px', fontWeight: 800, fontSize: 17 }}>{contact?.name || selected.name}</p>
            {contact?.id && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{(({ supplier: 'Supplier', wholesaler: 'Wholesaler', business: 'Business contact' } as Record<string, string>)[String(contact.relationship_type || '').toLowerCase()]) || 'Customer'}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <a href={`tel:${contact?.phone || selected.key}`} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z"/></svg>
              </a>
              {contact?.email && <a href={`mailto:${contact.email}`} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
              </a>}
            </div>
          </div>

          {/* Open the full conversation (with all its context) in the inbox. */}
          {convId && (
            <a href={`/admin/inbox?conversation=${convId}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 12, background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Open in inbox
            </a>
          )}

          {/* Just the essentials — only fields that actually have a value. */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Contact</p>
            {([
              ['Mobile', contact?.phone || selected.key],
              ['Email', contact?.email],
              ['Company', contact?.company],
              ['Address', contact?.address],
            ] as const).filter(([, val]) => !!val).map(([label, val]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--slate)' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>{val}</p>
              </div>
            ))}
            {!contact?.id && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>Not linked to a saved contact.</p>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
