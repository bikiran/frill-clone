'use client'
import { authFetch } from '@/lib/auth-fetch'
import VoicePlayer from '@/components/VoicePlayer'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { callRoutingFacts } from '@/lib/call-routing'

type Call = {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: string
  duration_seconds: number | null
  /** Length of the recording itself (not the call), when the provider sent it. */
  recording_duration?: number | null
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
  // Call routing (V399; also on routing_state.routing before it runs).
  ivr_choice?: string | null
  routing_path?: string | null
  forwarded_to?: string | null
  forwarded_seconds?: number | null
  voicemail_box?: string | null
  routing_state?: any
  created_at: string
}

// Call recordings use the shared inline player (same as the mobile app).
// Players read nothing until Play, so a caller with dozens of recordings
// doesn't open dozens of media players at once. The recording's own length
// shows when we have it; otherwise it appears once Play loads the file.
function CallPlayer({ url, durationSec }: { url: string; durationSec?: number | null }) {
  return <VoicePlayer src={url} name="Call recording" lazy durationSec={durationSec || undefined} />
}

export default function CallsPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededCalls = seededCid ? readCache<Call[]>(`calls:${seededCid}`) : undefined
  const [calls, setCalls] = useState<Call[]>(seededCalls ?? [])
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [loading, setLoading] = useState(!seededCalls)
  // A link can open a tab directly (the home dashboard links ?filter=inbound).
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed' | 'voicemail'>(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('filter')
      if (f === 'inbound' || f === 'outbound' || f === 'missed' || f === 'voicemail') return f
    } catch {}
    return 'all'
  })
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
    if (isVoicemail(c)) { const box = callRoutingFacts(c).box; return `Voicemail${box ? ` · ${box}` : ''} ${fmtDuration(c.duration_seconds)}` }
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
      const res = await authFetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: c.id }) })
      const d = await res.json()
      if (d.summary) setCalls(cs => cs.map(x => x.id === c.id ? { ...x, ai_summary: d.summary } : x))
    } catch {} finally { setSummarizing(s => { const n = new Set(s); n.delete(c.id); return n }) }
  }
  const toggleTranscript = (id: string) => setOpenTranscript(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // A coloured initial (a number gets "#"), the same colour every time for a name.
  const Avatar = ({ name, size = 38 }: { name: string; size?: number }) => {
    const letter = (/[a-z]/i.test(name) ? name.replace(/[^a-z]/gi, '')[0] : '#')?.toUpperCase() || '#'
    const hue = ['#6366f1', '#16a34a', '#f59e0b', '#ef4444', '#0ea5e9', '#d946ef', '#14b8a6', '#ff6a4d'][[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 8]
    return <span className="clg-av" style={{ width: size, height: size, fontSize: size * 0.4, background: letter === '#' ? '#a1a1aa' : hue }}>{letter}</span>
  }
  // Which way the call went, in its outcome's colour.
  const DirIcon = ({ c, size = 22 }: { c: Call; size?: number }) => {
    const tone = isMissed(c) ? '#dc2626' : isVoicemail(c) ? '#b45309' : c.direction === 'inbound' ? '#16a34a' : '#2563eb'
    return (
      <span className="clg-dir" style={{ width: size, height: size, color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }} aria-hidden>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {c.direction === 'inbound' ? <><line x1="17" y1="7" x2="7" y2="17" /><polyline points="15 17 7 17 7 9" /></> : <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="9 7 17 7 17 15" /></>}
        </svg>
      </span>
    )
  }
  const outcome = (c: Call): [string, string] => isVoicemail(c) ? ['Voicemail', 'amber'] : isMissed(c) ? ['Missed', 'red']
    : ['no-answer', 'missed', 'failed', 'busy', 'canceled', 'cancelled', 'no_answer'].includes(c.status) ? ['Not answered', 'grey'] : ['Answered', 'green']
  const sentimentChip = (s: string | null) => {
    if (!s) return null
    return <span className={`clg-pill ${s === 'positive' ? 'green' : s === 'negative' ? 'red' : 'grey'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
  }

  if (loading) return <div className="clg"><style>{CLG_CSS}</style><div className="clg-loading">Loading calls…</div></div>

  const showList = !isMobile || !selected
  const showDetail = !isMobile || !!selected
  const showContact = !isMobile && !isNarrow && !!selected

  return (
    <div className="clg">
      <style>{CLG_CSS}</style>
      <header className="clg-head">
        <h1>Call logs</h1>
        <p>Every call in and out, with recordings and summaries.</p>
      </header>
      <div className="clg-cols">
        {/* ── List ── */}
        {showList && (
        <div className="clg-list" style={{ width: isMobile ? '100%' : 340 }}>
          <div className="clg-list-top">
            <label className="clg-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls" aria-label="Search calls" />
            </label>
            <div className="clg-tabs" role="tablist" aria-label="Show">
              {([['all', 'All'], ['inbound', 'Incoming'], ['outbound', 'Outgoing'], ['missed', 'Missed'], ['voicemail', 'Voicemail']] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={filter === k ? 'on' : ''}>
                  {l}<span>{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="clg-filter-row">
              <button type="button" onClick={() => setAdvOpen(v => !v)} aria-expanded={advOpen} className={`clg-filter${activeAdvCount ? ' active' : ''}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
                Filters{activeAdvCount ? <b>{activeAdvCount}</b> : null}
              </button>
              {activeAdvCount > 0 && <button type="button" className="clg-clear" onClick={() => setAdv(emptyAdv)}>Clear</button>}
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
              return (
                <div className="clg-adv">
                  {AF.map(f => (
                    <label key={f.key} className="clg-adv-f">
                      <span>{f.label}</span>
                      <select value={adv[f.key]} onChange={e => setAdv(a => ({ ...a, [f.key]: e.target.value }))}>
                        {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  ))}
                  {adv.date === 'custom' && (
                    <div className="clg-adv-dates">
                      <label className="clg-adv-f"><span>From</span><input type="date" value={adv.from} onChange={e => setAdv(a => ({ ...a, from: e.target.value }))} /></label>
                      <label className="clg-adv-f"><span>To</span><input type="date" value={adv.to} onChange={e => setAdv(a => ({ ...a, to: e.target.value }))} /></label>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
          <div className="clg-rows">
            {groups.length === 0 ? (
              <p className="clg-none">No calls to show.</p>
            ) : groups.map(g => (
              <button key={g.key} type="button" onClick={() => setSelectedKey(g.key)} className={`clg-row${selectedKey === g.key ? ' on' : ''}`}>
                <Avatar name={g.name} />
                <span className="clg-row-t">
                  <span className="clg-row-top">
                    <b>{g.name}</b>
                    <small>{new Date(g.latest.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
                  </span>
                  <span className={`clg-row-sub ${outcome(g.latest)[1]}`}>
                    <DirIcon c={g.latest} size={16} />
                    {callLabel(g.latest)}
                    {g.calls.length > 1 && <em>· {g.calls.length} calls</em>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* ── Timeline ── */}
        {showDetail && (
        <div className="clg-detail">
          {!selected ? (
            <div className="clg-pick">Pick a call to see its history.</div>
          ) : (
            <>
              <div className="clg-detail-h">
                {isMobile && <button type="button" className="clg-back" onClick={() => setSelectedKey(null)} aria-label="Back to calls">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>}
                <Avatar name={selected.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="clg-name">{selected.name}</p>
                  <p className="clg-meta">{selected.key !== selected.name ? selected.key + ' · ' : ''}Last call {relTime(selected.latest.created_at)}</p>
                </div>
                <span className="clg-count">{selected.calls.length} call{selected.calls.length === 1 ? '' : 's'}</span>
              </div>

              <div className="clg-calls">
                {selected.calls.map(c => {
                  const realTranscript = c.transcription && !isDiagnostic(c.transcription)
                  const [oLabel, oTone] = outcome(c)
                  const r = callRoutingFacts(c)
                  return (
                  <article key={c.id} className="clg-call">
                    <div className="clg-call-h">
                      <DirIcon c={c} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{c.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'}</b>
                        <small>{new Date(c.created_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
                      </div>
                      <span className={`clg-pill ${oTone}`}>{oLabel}</span>
                    </div>

                    {c.ai_summary ? (
                      <div className="clg-sum">
                        <div className="clg-sum-h"><span>Summary</span>{sentimentChip(c.sentiment)}</div>
                        <p>{c.ai_summary}</p>
                      </div>
                    ) : realTranscript ? (
                      <button type="button" className="clg-sum-btn" onClick={() => summarize(c)} disabled={summarizing.has(c.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z" /></svg>
                        {summarizing.has(c.id) ? 'Summarising…' : 'Summarise this call'}
                      </button>
                    ) : null}

                    {isDiagnostic(c.transcription) && <p className="clg-diag">{c.transcription}</p>}

                    {c.recording_url ? (
                      <div className="clg-rec">
                        <CallPlayer url={c.recording_url} durationSec={c.recording_duration} />
                        <a href={c.recording_url} download className="clg-dl">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download recording
                        </a>
                      </div>
                    ) : !isDiagnostic(c.transcription) && !c.ai_summary ? (
                      <p className="clg-norec">No recording</p>
                    ) : null}

                    {realTranscript && (
                      <div className="clg-tx">
                        <button type="button" onClick={() => toggleTranscript(c.id)} aria-expanded={openTranscript.has(c.id)}>
                          {openTranscript.has(c.id) ? 'Hide transcript' : 'Show transcript'}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: openTranscript.has(c.id) ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        {openTranscript.has(c.id) && <p>{c.transcription}</p>}
                      </div>
                    )}

                    <div className="clg-chips">
                      <span>{fmtDuration(c.duration_seconds)}</span>
                      {c.agent_name && !r.forwardedTo && <span>{c.agent_name}</span>}
                      {r.choice && <span>Menu: {r.choice}</span>}
                      {r.forwardedTo && <span>Forwarded to {r.forwardedTo}{r.forwardedSeconds ? ` · ${fmtDuration(r.forwardedSeconds)}` : ''}</span>}
                      {r.path && <span className="wide">Route: {r.path}</span>}
                    </div>
                  </article>
                )})}
              </div>
            </>
          )}
        </div>
        )}

        {/* ── Contact rail ── */}
        {showContact && selected && (
        <aside className="clg-side">
          <div className="clg-side-top">
            <Avatar name={contact?.name || selected.name} size={64} />
            <p className="clg-side-name">{contact?.name || selected.name}</p>
            {contact?.id && <p className="clg-meta">{(({ supplier: 'Supplier', wholesaler: 'Wholesaler', business: 'Business contact' } as Record<string, string>)[String(contact.relationship_type || '').toLowerCase()]) || 'Customer'}</p>}
            <div className="clg-acts">
              <a href={`tel:${contact?.phone || selected.key}`} aria-label="Call" title="Call">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z"/></svg>
              </a>
              {contact?.email && <a href={`mailto:${contact.email}`} aria-label="Email" title="Email">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
              </a>}
            </div>
          </div>

          {/* Open the full conversation (with all its context) in the inbox. */}
          {convId && (
            <a href={`/admin/inbox?conversation=${convId}`} className="clg-open">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Open in inbox
            </a>
          )}

          {/* Just the essentials: only fields that actually have a value. */}
          <div className="clg-facts">
            {([
              ['phone', 'Mobile', contact?.phone || selected.key],
              ['email', 'Email', contact?.email],
              ['company', 'Company', contact?.company],
              ['address', 'Address', contact?.address],
            ] as const).filter(([, , val]) => !!val).map(([k, label, val]) => (
              <div key={k} className="clg-fact" title={label}>
                <span className="clg-fact-ic" aria-hidden>{FACT_ICON[k]}</span>
                <span>{typeof val === 'string' ? val : String(val)}</span>
              </div>
            ))}
          </div>
          {!contact?.id && <p className="clg-unlinked">Not linked to a saved contact.</p>}
        </aside>
        )}
      </div>
    </div>
  )
}

const fi = (d: React.ReactNode) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const FACT_ICON: Record<string, React.ReactNode> = {
  phone: fi(<><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></>),
  email: fi(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>),
  company: fi(<><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1" /></>),
  address: fi(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
}

const CLG_CSS = `
.clg{--f:#f4f4f5;--f2:#ececef;--line:#ececee;--mut:#71717a;--soft:#8e8e93;height:calc(100vh - 120px);display:flex;flex-direction:column;padding:24px 16px 16px}
[data-theme="dark"] .clg{--f:#2a2a2e;--f2:#333337;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
@media (min-width:900px){.clg{padding:28px 28px 20px}}
.clg button::before,.clg a::before{display:none!important}
.clg-loading{margin:auto;color:var(--mut);font-size:14px}
.clg-head{margin-bottom:18px}
.clg-head h1{margin:0;font-size:clamp(28px,3.4vw,34px);font-weight:700;letter-spacing:-.04em;line-height:1.05;color:var(--ink)}
.clg-head p{margin:7px 0 0;font-size:14.5px;color:var(--mut)}
.clg-cols{display:flex;gap:14px;flex:1;min-height:0}
.clg-list,.clg-detail,.clg-side{background:var(--card,#fff);border-radius:22px;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.clg-list{flex-shrink:0;display:flex;flex-direction:column;overflow:hidden}
.clg-list-top{padding:12px 12px 8px}
.clg-search{display:flex;align-items:center;gap:8px;height:40px;padding:0 13px;border-radius:999px;background:var(--f);color:var(--mut)}
.clg .clg-search input{flex:1;min-width:0;height:100%;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14px;color:var(--ink)!important;padding:0}
.clg-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.clg-tabs::-webkit-scrollbar{display:none}
.clg-tabs button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.clg-tabs button:hover{background:var(--f2)}
.clg-tabs button span{font-weight:500;color:var(--mut);font-variant-numeric:tabular-nums}
.clg-tabs button.on{background:var(--ink);color:var(--card,#fff)}
.clg-tabs button.on span{color:inherit;opacity:.65}
.clg-filter-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.clg-filter{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:none;border-radius:999px;background:transparent;color:var(--mut);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.clg-filter:hover,.clg-filter[aria-expanded="true"]{background:var(--f);color:var(--ink)}
.clg-filter b{min-width:18px;height:18px;padding:0 5px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--coral);color:#fff;font-size:11px}
.clg-clear{border:none;background:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--mut);cursor:pointer}
.clg-adv{margin-top:8px;padding:10px;border-radius:16px;background:var(--f);display:grid;grid-template-columns:1fr 1fr;gap:8px}
.clg-adv-f{display:flex;flex-direction:column;gap:3px;min-width:0}
.clg-adv-f span{font-size:11.5px;font-weight:600;color:var(--mut)}
.clg .clg-adv-f select,.clg .clg-adv-f input{width:100%;height:32px;padding:0 9px;border-radius:10px;border:none!important;background:var(--card,#fff)!important;box-shadow:none!important;font:inherit;font-size:12.5px;color:var(--ink)!important;outline:none}
.clg-adv-dates{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.clg-rows{flex:1;overflow-y:auto;padding:2px 8px 8px}
.clg-none{padding:24px;margin:0;text-align:center;color:var(--mut);font-size:13.5px}
.clg-row{display:flex;align-items:center;gap:11px;width:100%;padding:10px;margin:2px 0;border:none;border-radius:14px;background:transparent;text-align:left;font:inherit;cursor:pointer;transition:background .15s}
.clg-row:hover{background:color-mix(in srgb,var(--f) 55%,transparent)}
.clg-row.on{background:var(--f)}
.clg-av{border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700}
.clg-row-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.clg-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.clg-row-top b{font-size:14px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clg-row-top small{flex-shrink:0;font-size:11.5px;color:var(--soft)}
.clg-row-sub{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mut);min-width:0}
.clg-row-sub.red{color:#dc2626}.clg-row-sub.amber{color:#b45309}
.clg-row-sub em{font-style:normal;color:var(--soft)}
.clg-dir{border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}
.clg-detail{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.clg-pick{margin:auto;color:var(--mut);font-size:14px}
.clg-detail-h{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.clg-back{width:34px;height:34px;border:none;border-radius:50%;background:var(--f);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.clg-name{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.025em;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clg-meta{margin:2px 0 0;font-size:12.5px;color:var(--mut)}
.clg-count{height:26px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;background:var(--f);font-size:12.5px;font-weight:600;color:var(--mut);white-space:nowrap}
.clg-calls{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.clg-call{padding:14px 16px;border-radius:18px;background:var(--f)}
.clg-call-h{display:flex;align-items:center;gap:11px}
.clg-call-h b{display:block;font-size:14px;font-weight:650;color:var(--ink)}
.clg-call-h small{display:block;margin-top:1px;font-size:12px;color:var(--soft)}
.clg-pill{height:24px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;font-size:12px;font-weight:650;white-space:nowrap}
.clg-pill.green{background:#dcfce7;color:#15803d}.clg-pill.red{background:#fee2e2;color:#b91c1c}.clg-pill.amber{background:#fef3c7;color:#b45309}.clg-pill.grey{background:var(--card,#fff);color:var(--mut)}
.clg-sum{margin-top:12px;padding:12px 14px;border-radius:14px;background:var(--card,#fff)}
.clg-sum-h{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.clg-sum-h span:first-child{font-size:12.5px;font-weight:650;color:#7c3aed}
.clg-sum p{margin:0;font-size:13.5px;line-height:1.55;color:var(--ink)}
.clg-sum-btn{display:inline-flex;align-items:center;gap:6px;margin-top:12px;height:32px;padding:0 13px;border:none;border-radius:999px;background:color-mix(in srgb,#8b5cf6 12%,var(--card,#fff));color:#7c3aed;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.clg-sum-btn:disabled{opacity:.6;cursor:default}
.clg-diag{margin:12px 0 0;display:inline-block;padding:4px 9px;border-radius:8px;background:#fffbeb;color:#b45309;font-family:ui-monospace,monospace;font-size:11.5px}
.clg-rec{margin-top:12px;display:flex;flex-direction:column;gap:8px}
.clg-dl{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:var(--card,#fff);color:var(--ink);font-size:12.5px;font-weight:600;text-decoration:none}
.clg-norec{margin:10px 0 0;font-size:13px;color:var(--soft)}
.clg-tx{margin-top:10px}
.clg-tx button{display:inline-flex;align-items:center;gap:5px;padding:0;border:none;background:none;font:inherit;font-size:12.5px;font-weight:650;color:var(--ink);cursor:pointer}
.clg-tx p{margin:8px 0 0;padding:11px 13px;border-radius:12px;background:var(--card,#fff);font-size:13px;line-height:1.6;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.clg-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.clg-chips span{height:24px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;background:var(--card,#fff);font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clg-chips span.wide{height:auto;min-height:24px;padding:3px 9px;white-space:normal}
.clg-side{width:290px;flex-shrink:0;overflow:auto;padding:22px 18px}
.clg-side-top{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:16px}
.clg-side-name{margin:12px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.clg-acts{display:flex;gap:10px;margin-top:12px}
.clg-acts a{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--f);color:var(--ink);text-decoration:none}
.clg-acts a:hover{background:var(--f2)}
.clg-open{display:flex;align-items:center;justify-content:center;gap:7px;height:44px;margin-bottom:14px;border-radius:999px;background:var(--coral);color:#fff;font-size:14px;font-weight:650;text-decoration:none}
.clg-open:hover{filter:brightness(.95)}
.clg-facts{border-radius:16px;background:var(--f);padding:3px 0}
.clg-fact{display:flex;align-items:flex-start;gap:10px;padding:10px 13px;font-size:13.5px;color:var(--ink);overflow-wrap:anywhere}
.clg-fact+.clg-fact{box-shadow:0 -1px 0 var(--line)}
.clg-fact-ic{color:var(--soft);flex-shrink:0;margin-top:1px}
.clg-unlinked{margin:10px 2px 0;font-size:12.5px;color:var(--soft)}
.clg :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
`
