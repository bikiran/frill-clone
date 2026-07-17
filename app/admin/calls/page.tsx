'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Call = {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: string
  duration_seconds: number | null
  recording_url: string | null
  transcription: string | null
  is_voicemail: boolean | null
  caller_name?: string | null
  agent_name: string | null
  contact_id: string | null
  created_at: string
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed' | 'voicemail'>('all')

  useEffect(() => {
    const init = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
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
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(300)
    setCalls(data || [])
  }

  // Live updates — new calls and status changes (ringing → voicemail/completed)
  // appear without a reload.
  useEffect(() => {
    if (!companyId) return
    const channel = (supabase as any)
      .channel(`calls-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          setCalls(prev => {
            if (payload.eventType === 'INSERT') {
              if (prev.find(c => c.id === payload.new.id)) return prev
              return [payload.new, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(c => c.id !== payload.old.id)
            }
            return prev
          })
        })
      .subscribe()
    return () => { (supabase as any).removeChannel(channel) }
  }, [companyId])

  const fmtDuration = (s: number | null) => {
    if (!s) return '—'
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isMissed = (c: Call) => c.direction === 'inbound' && ['no-answer', 'missed', 'failed'].includes(c.status) && !c.is_voicemail
  const isVoicemail = (c: Call) => !!c.is_voicemail || c.status === 'voicemail'

  const filtered = calls.filter(c => {
    if (filter === 'inbound') return c.direction === 'inbound'
    if (filter === 'outbound') return c.direction === 'outbound'
    if (filter === 'missed') return isMissed(c)
    if (filter === 'voicemail') return isVoicemail(c)
    return true
  })

  const counts = {
    all: calls.length,
    inbound: calls.filter(c => c.direction === 'inbound').length,
    outbound: calls.filter(c => c.direction === 'outbound').length,
    missed: calls.filter(isMissed).length,
    voicemail: calls.filter(isVoicemail).length,
  }

  const StatusBadge = ({ c }: { c: Call }) => {
    let label = c.status, bg = '#f3f4f6', fg = '#6b7280'
    if (isVoicemail(c)) { label = 'Voicemail'; bg = '#fef3c7'; fg = '#b45309' }
    else if (isMissed(c)) { label = 'Missed'; bg = '#fee2e2'; fg = '#dc2626' }
    else if (c.status === 'completed' || c.status === 'in_progress') { label = 'Completed'; bg = '#dcfce7'; fg = '#15803d' }
    else if (['ringing', 'ringing_agents', 'initiated'].includes(c.status)) { label = 'Ringing'; bg = '#dbeafe'; fg = '#2563eb' }
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color: fg, textTransform: 'capitalize' }}>{label}</span>
  }

  const DirIcon = ({ c }: { c: Call }) => {
    if (isMissed(c)) return <span style={{ color: '#dc2626', fontSize: 16 }}>↙</span>
    if (c.direction === 'inbound') return <span style={{ color: '#15803d', fontSize: 16 }}>↙</span>
    return <span style={{ color: '#2563eb', fontSize: 16 }}>↗</span>
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading calls…</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Call Logs</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--slate)', fontSize: 14 }}>Incoming, outgoing, missed calls and voicemails.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {([
          ['all', 'All'], ['inbound', 'Incoming'], ['outbound', 'Outgoing'], ['missed', 'Missed'], ['voicemail', 'Voicemail'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: '1px solid ' + (filter === key ? 'var(--coral)' : 'var(--border)'),
              background: filter === key ? 'var(--coral)' : '#fff',
              color: filter === key ? '#fff' : 'var(--slate)',
            }}>
            {label} <span style={{ opacity: 0.7 }}>({counts[key]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
          No calls to show.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {filtered.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <DirIcon c={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.caller_name || (c.direction === 'inbound' ? c.from_number : c.to_number) || 'Unknown'}</span>
                  <StatusBadge c={c} />
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                  {c.direction === 'inbound' ? c.from_number : c.to_number}
                  {c.agent_name ? ` · ${c.agent_name}` : ''}
                </p>
                {/* Diagnostic reason — the webhook records WHY a call went to
                    voicemail or failed (e.g. "[ringing sip:…]", "[ring failed: …]",
                    "[to voicemail: no agents online]"). Surface it so routing
                    issues are visible without digging into the database. */}
                {c.transcription && /^\[/.test(c.transcription) && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#b45309', fontFamily: 'ui-monospace, monospace', background: '#fffbeb', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                    {c.transcription}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)' }}>{new Date(c.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{fmtDuration(c.duration_seconds)}</p>
              </div>
              {c.recording_url && (
                <audio controls src={c.recording_url} style={{ height: 32, maxWidth: 200 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
