'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import PageHeader from '@/components/PageHeader'
import { computeSla, activeClock, clockLabel, CLOCK_COLORS, resolveSla, DEFAULT_SLA, type SlaSettings } from '@/lib/ticket-sla'

const STATUS_COLORS: Record<string, { bg: string; c: string }> = {
  open: { bg: '#dbeafe', c: '#2563eb' },
  in_progress: { bg: '#fef3c7', c: '#d97706' },
  resolved: { bg: '#dcfce7', c: '#059669' },
  closed: { bg: '#f3f4f6', c: '#6b7280' },
}
const PRIORITY_COLORS: Record<string, string> = { low: '#6b7280', normal: '#2563eb', high: '#d97706', urgent: '#dc2626' }
const PAGE_SIZE = 10

const STAT_META: { key: string; label: string; icon: string; bg: string; c: string }[] = [
  { key: 'open', label: 'Open', icon: '💬', bg: '#eff6ff', c: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', icon: '⏱', bg: '#fffbeb', c: '#d97706' },
  { key: 'resolved', label: 'Resolved', icon: '✓', bg: '#f0fdf4', c: '#059669' },
  { key: 'closed', label: 'Closed', icon: '🗄', bg: '#f8fafc', c: '#64748b' },
]

const initials = (name: string) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

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
  const [tick, setTick] = useState(0)
  // Re-render every minute so "due in…" countdowns stay current.
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(iv) }, [])

  const load = async (cid: string) => {
    const res = await fetch(`/api/tickets?companyId=${cid}`)
    const data = await res.json()
    setTickets(data.tickets || [])
    if (data.sla) setSla(resolveSla(data.sla))
    if (Array.isArray(data.team)) setTeam(data.team)
  }

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/signin'); return }
      setMeId(session.user.id)
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      let cid = co?.id
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).maybeSingle()
        cid = tm?.company_id
      }
      if (cid) { setCompanyId(cid); await load(cid) }
      setLoading(false)
      // Clear the sidebar "new tickets" badge — we've now seen them.
      try { localStorage.setItem('colvy-tickets-seen-at', new Date().toISOString()); window.dispatchEvent(new Event('tickets-seen')) } catch {}
    })()
  }, [])

  // Each ticket's deadline clocks, recomputed every minute.
  const withSla = useMemo(() => {
    const now = new Date()
    return tickets.map(t => ({ ...t, _sla: computeSla(t, sla, now) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, sla, tick])
  const teamName = (uid: string | null) => (uid && team.find(m => m.userId === uid)?.name) || ''

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
      return [t.ticket_number, t.subject, t.customer_name, t.customer_email, t.description].some((v: any) => String(v || '').toLowerCase().includes(q))
    })
  }, [withSla, search, statusFilter, priorityFilter, dueFilter, assigneeFilter, meId])

  useEffect(() => { setPage(1) }, [search, statusFilter, priorityFilter, dueFilter, assigneeFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportCsv = () => {
    const rows = [['Ticket', 'Subject', 'Customer', 'Email', 'Channel', 'Priority', 'Status', 'Assignee', 'Deadline', 'Created']]
    filtered.forEach(t => { const a = activeClock(t._sla); rows.push([t.ticket_number, t.subject, t.customer_name, t.customer_email, t.channel, t.priority || 'normal', t.status, teamName(t.assigned_to), clockLabel(a.clock, a.what), new Date(t.created_at).toISOString()]) })
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const selStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Support Tickets"
        subtitle="Tickets raised from conversations, email, and help centre."
        bleed={24}
        action={
          <>
            <button onClick={() => setShowSla(true)} title="Deadlines & assignment" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>⏱ Deadlines</button>
            <button onClick={exportCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>↓ Export</button>
            <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ New Ticket</button>
          </>
        }
      />

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        {STAT_META.map(s => {
          const activeTile = statusFilter === s.key
          return (
            <button key={s.key} onClick={() => setStatusFilter(activeTile ? 'all' : s.key)}
              style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 16, border: activeTile ? `2px solid ${s.c}` : '1px solid var(--border)', background: '#fff', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, color: s.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{counts[s.key] || 0}</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
              </div>
            </button>
          )
        })}
        {sla.enabled && (
          <button onClick={() => setDueFilter(dueFilter === 'overdue' ? 'all' : 'overdue')}
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 16, border: dueFilter === 'overdue' ? '2px solid #dc2626' : '1px solid var(--border)', background: counts.overdue ? '#fffafa' : '#fff', cursor: 'pointer', transition: 'all .15s' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⏰</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: counts.overdue ? '#dc2626' : 'var(--ink)', lineHeight: 1 }}>{counts.overdue || 0}</div>
              <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 4, fontWeight: 600 }}>Overdue</div>
            </div>
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', fontSize: 14 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets by ID, subject, customer, or message…"
            style={{ width: '100%', padding: '10px 14px 10px 34px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={selStyle}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        {sla.enabled && (
          <select value={dueFilter} onChange={e => setDueFilter(e.target.value as any)} style={selStyle}>
            <option value="all">All deadlines</option>
            <option value="overdue">Overdue</option>
            <option value="soon">Due soon</option>
          </select>
        )}
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={selStyle}>
          <option value="all">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {team.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
      </div>

      {loading ? <SkeletonList rows={6} /> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr style={{ background: 'var(--canvas)' }}>
                  {['Ticket', 'Subject', 'Customer', 'Channel', 'Priority', 'Status', ...(sla.enabled ? ['Due'] : []), 'Assignee', 'Updated'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr><td colSpan={sla.enabled ? 9 : 8} style={{ textAlign: 'center', color: 'var(--slate)', padding: 48, fontSize: 14 }}>No tickets match your filters.</td></tr>
                ) : pageRows.map(t => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS.open
                  const pr = t.priority || 'normal'
                  return (
                    <tr key={t.id} onClick={() => router.push(`/admin/tickets/${t.id}`)}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--canvas)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: 'var(--coral)', whiteSpace: 'nowrap' }}>{t.ticket_number}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: 'var(--ink)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials(t.customer_name)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{t.customer_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{t.customer_email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{t.channel}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: PRIORITY_COLORS[pr] || '#6b7280', textTransform: 'capitalize' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLORS[pr] || '#6b7280' }} />{pr}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.c, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{String(t.status || 'open').replace('_', ' ')}</span>
                      </td>
                      {sla.enabled && (() => {
                        const a = activeClock(t._sla)
                        const col = CLOCK_COLORS[a.clock.state]
                        return (
                          <td style={{ padding: '14px 16px' }}>
                            {a.clock.state === 'off' ? <span style={{ color: '#cbd5e1' }}>—</span> : (
                              <span title={a.clock.dueAt ? `Due ${a.clock.dueAt.toLocaleString()}` : ''} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 20, background: col.bg, color: col.c, whiteSpace: 'nowrap' }}>
                                {a.clock.state === 'overdue' ? '⏰ ' : ''}{clockLabel(a.clock, a.what)}
                              </span>
                            )}
                          </td>
                        )
                      })()}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: t.assigned_to ? 'var(--ink)' : 'var(--slate)', whiteSpace: 'nowrap' }}>{teamName(t.assigned_to) || (t.assigned_to ? 'Teammate' : 'Unassigned')}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{new Date(t.updated_at || t.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--slate)' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} tickets
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: 13 }}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{ minWidth: 32, padding: '6px 10px', borderRadius: 8, border: p === page ? '1px solid var(--coral)' : '1px solid var(--border)', background: p === page ? 'var(--peach)' : '#fff', color: p === page ? 'var(--coral)' : 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{p}</button>
                ))}
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontSize: 13 }}>›</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showSla && <SlaSettingsModal companyId={companyId} sla={sla} onClose={() => setShowSla(false)} onSaved={s2 => { setSla(s2); setShowSla(false) }} />}
      {showNew && <NewTicketModal companyId={companyId} onClose={() => setShowNew(false)} onCreated={async () => { setShowNew(false); if (companyId) await load(companyId) }} />}
    </div>
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

  const submit = async () => {
    if (!subject.trim()) { setErr('A subject is required.'); return }
    setBusy(true); setErr('')
    try {
      const desc = `${description.trim() || '(no message)'}${name || email ? `\n\n— From: ${name || 'Customer'} <${email}>` : ''}`
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, subject: subject.trim(), description: desc, priority }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not create ticket')
      onCreated()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>New ticket</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" style={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Customer email" style={inp} />
          </div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject *" style={inp} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the issue…" style={{ ...inp, resize: 'vertical' }} />
          <select value={priority} onChange={e => setPriority(e.target.value)} style={inp}>
            <option value="low">Low priority</option>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent priority</option>
          </select>
          {err && <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creating…' : 'Create ticket'}</button>
          </div>
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
      const res = await fetch('/api/tickets/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ companyId, settings: form }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      onSaved(resolveSla(d.settings))
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }
  const num: React.CSSProperties = { width: 70, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5, textAlign: 'right', fontFamily: 'inherit' }
  return (
    <div onClick={() => !saving && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 24px 70px rgba(0,0,0,0.25)' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>Deadlines & assignment</p>
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
                  <td style={{ padding: '8px 4px', fontSize: 13.5, fontWeight: 700, color: p.color }}>● {p.label}</td>
                  <td style={{ padding: '8px 4px', fontSize: 13, color: 'var(--slate)' }}><input type="number" min={1} value={form.first_response_hours[p.key]} onChange={e => setHours('first_response_hours', p.key, e.target.value)} style={num} /> h</td>
                  <td style={{ padding: '8px 4px', fontSize: 13, color: 'var(--slate)' }}><input type="number" min={1} value={form.resolution_hours[p.key]} onChange={e => setHours('resolution_hours', p.key, e.target.value)} style={num} /> h</td>
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
        {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '12px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button onClick={() => setForm(JSON.parse(JSON.stringify(DEFAULT_SLA)))} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Reset defaults</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
