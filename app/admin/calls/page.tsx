'use client'
import { useState, useEffect, useMemo } from 'react'
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
  contact_id: string | null
  created_at: string
}

export default function CallsPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededCalls = seededCid ? readCache<Call[]>(`calls:${seededCid}`) : undefined
  const [calls, setCalls] = useState<Call[]>(seededCalls ?? [])
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [loading, setLoading] = useState(!seededCalls)
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed' | 'voicemail'>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openTranscript, setOpenTranscript] = useState<Set<string>>(new Set())
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  // Live updates — new calls and status changes appear without a reload.
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

  const fmtDuration = (s: number | null) => {
    if (!s) return '0:00'
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const d = Math.floor(diff / 86_400_000), h = Math.floor(diff / 3_600_000), m = Math.floor(diff / 60_000)
    if (d > 0) return `${d}d ago`
    if (h > 0) return `${h}h ago`
    if (m > 0) return `${m}m ago`
    return 'just now'
  }
  const isMissed = (c: Call) => c.direction === 'inbound' && ['no-answer', 'missed', 'failed'].includes(c.status) && !c.is_voicemail
  const isVoicemail = (c: Call) => !!c.is_voicemail || c.status === 'voicemail'
  const otherParty = (c: Call) => (c.direction === 'inbound' ? c.from_number : c.to_number) || 'Unknown'
  const isDiagnostic = (t: string | null) => !!t && /^\[/.test(t)

  // A one-line description of a call for the list sub-row.
  const callLabel = (c: Call) => {
    if (isVoicemail(c)) return `Voicemail ${fmtDuration(c.duration_seconds)}`
    if (isMissed(c)) return 'Missed'
    if (c.recording_url) return `Answered ${fmtDuration(c.duration_seconds)}`
    if (c.duration_seconds) return `${fmtDuration(c.duration_seconds)}`
    return 'No recording'
  }

  const counts = {
    all: calls.length,
    inbound: calls.filter(c => c.direction === 'inbound').length,
    outbound: calls.filter(c => c.direction === 'outbound').length,
    missed: calls.filter(isMissed).length,
    voicemail: calls.filter(isVoicemail).length,
  }

  // Filter by tab, then group by the other party into "conversations".
  const groups = useMemo(() => {
    const passesTab = (c: Call) =>
      filter === 'all' ? true :
      filter === 'inbound' ? c.direction === 'inbound' :
      filter === 'outbound' ? c.direction === 'outbound' :
      filter === 'missed' ? isMissed(c) :
      isVoicemail(c)
    const q = search.trim().toLowerCase()
    const map = new Map<string, Call[]>()
    for (const c of calls) {
      if (!passesTab(c)) continue
      const key = otherParty(c)
      if (q && !key.toLowerCase().includes(q) && !(c.caller_name || '').toLowerCase().includes(q)) continue
      const arr = map.get(key) || []; arr.push(c); map.set(key, arr)
    }
    const out = Array.from(map.entries()).map(([key, cs]) => {
      const sorted = [...cs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      const name = sorted.find(c => c.caller_name)?.caller_name || key
      return { key, name, calls: sorted, latest: sorted[0] }
    })
    out.sort((a, b) => +new Date(b.latest.created_at) - +new Date(a.latest.created_at))
    return out
  }, [calls, filter, search])

  // Keep a valid selection.
  useEffect(() => {
    if (isMobile) return
    if (groups.length && (!selectedKey || !groups.find(g => g.key === selectedKey))) setSelectedKey(groups[0].key)
  }, [groups, selectedKey, isMobile])

  const selected = groups.find(g => g.key === selectedKey) || null

  const summarize = async (c: Call) => {
    setSummarizing(s => new Set(s).add(c.id))
    try {
      const res = await fetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: c.id }) })
      const d = await res.json()
      if (d.summary) setCalls(cs => cs.map(x => x.id === c.id ? { ...x, ai_summary: d.summary } : x))
    } catch {} finally { setSummarizing(s => { const n = new Set(s); n.delete(c.id); return n }) }
  }

  const toggleTranscript = (id: string) => setOpenTranscript(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const Avatar = ({ name }: { name: string }) => (
    <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
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

  return (
    <div style={{ padding: '20px 24px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 14px' }}>Call Logs</h1>
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* ── List ── */}
        {showList && (
        <div style={{ width: isMobile ? '100%' : 340, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
              {([['all', 'All'], ['inbound', 'Incoming'], ['outbound', 'Outgoing'], ['missed', 'Missed'], ['voicemail', 'Voicemail']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid ' + (filter === k ? 'var(--coral)' : 'var(--border)'), background: filter === k ? 'var(--peach)' : '#fff', color: filter === k ? 'var(--coral)' : 'var(--slate)' }}>
                  {l} <span style={{ opacity: 0.7 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
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

        {/* ── Detail ── */}
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
                      {/* AI summary */}
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

                      {/* Diagnostic reason (voicemail/failure) */}
                      {isDiagnostic(c.transcription) && (
                        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#b45309', fontFamily: 'ui-monospace, monospace', background: '#fffbeb', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>{c.transcription}</p>
                      )}

                      {/* Recording */}
                      {c.recording_url ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <audio controls src={c.recording_url} style={{ height: 36, maxWidth: 280 }} />
                          <a href={c.recording_url} download style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>Download</a>
                        </div>
                      ) : !isDiagnostic(c.transcription) && !c.ai_summary ? (
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No call recording · {callLabel(c)}</p>
                      ) : null}

                      {/* Transcript toggle */}
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

                      {/* Details footer */}
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
      </div>
    </div>
  )
}
