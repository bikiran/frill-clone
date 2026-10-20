'use client'

// Super admin → Status & incidents. The live public status (computed now, the
// same rules as colvy.com/status) with each component's internal reasoning,
// and the incidents posted to the status page: open one, post updates as it
// moves through investigating → identified → monitoring → resolved, edit,
// publish or hide, delete. Uses /api/platform-admin/status (audit-logged).

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'
import {
  HEALTH_LABEL, INCIDENT_IMPACTS, INCIDENT_IMPACT_LABEL, INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, STATUS_COMPONENTS,
  type Health, type Incident, type IncidentImpact, type IncidentStatus, type OverallLevel, type PublicStatus,
} from '@/lib/status-health'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, minWidth: 0, fontFamily: 'inherit' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const HC: Record<Health, string> = { operational: '#10b981', degraded: '#f59e0b', outage: '#ef4444', unknown: '#64748b' }
const OC: Record<OverallLevel, string> = { operational: '#10b981', partial: '#64748b', degraded: '#f59e0b', outage: '#ef4444', unknown: '#64748b' }
const SC: Record<IncidentStatus, string> = { investigating: '#ef4444', identified: '#f59e0b', monitoring: '#0ea5e9', resolved: '#10b981' }
const Pill = ({ text, color }: { text: string; color: string }) => <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: color + '22', color, whiteSpace: 'nowrap' }}>{text}</span>
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

async function api(body?: any): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await authFetch('/api/platform-admin/status', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch (e: any) { return { ok: false, data: { error: e?.message || 'Network error' } } }
}

function ComponentPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {STATUS_COMPONENTS.map(c => {
        const on = value.includes(c.key)
        return <button key={c.key} type="button" onClick={() => onChange(on ? value.filter(k => k !== c.key) : [...value, c.key])}
          style={{ ...btn(on ? '#ff7a6b' : 'var(--sa-muted)'), padding: '5px 10px', fontSize: 12, background: on ? '#ff7a6b22' : 'var(--sa-card)', borderColor: on ? '#ff7a6b' : 'var(--sa-border)' }}>{c.name}</button>
      })}
    </div>
  )
}

export default function StatusIncidentsPage() {
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const load = async () => { const r = await api(); setD(r.ok ? r.data : { error: r.data.error || 'Could not load' }) }
  useEffect(() => { load() }, [])

  const pub: PublicStatus | null = d?.public || null
  const incidents: Incident[] = d?.incidents || []
  const open = incidents.filter(i => i.status !== 'resolved')
  const closed = incidents.filter(i => i.status === 'resolved')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--sa-text)' }}>Status & incidents</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sa-muted)' }}>What customers see on <a href="https://colvy.com/status" target="_blank" rel="noreferrer" style={{ color: '#ff7a6b' }}>colvy.com/status</a>, checked live, and the incidents posted there.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setD(null); load() }} style={btn('var(--sa-text)')}>Refresh</button>
          {!d?.unavailable && <button onClick={() => setCreating(v => !v)} style={btn('#ff7a6b', true)}>{creating ? 'Close' : 'Open an incident'}</button>}
        </div>
      </div>

      {d?.error && <div style={{ ...card, color: '#ef4444', marginBottom: 12 }}>{d.error}</div>}
      {d?.unavailable && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: 'var(--sa-text)' }}>Incidents and uptime history aren’t set up yet. Run <code>migrations/COLVY_V405_STATUS_INCIDENTS.sql</code> in the Supabase SQL editor. Until then the status page shows live component checks only.</div>}
      {d && !d.unavailable && d.historyAvailable === false && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: 'var(--sa-muted)' }}>The 30-day bars appear once the five-minute snapshot job (/api/cron/status-snapshot) has run.</div>}
      {msg && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: 'var(--sa-text)' }}>{msg}</div>}

      {/* Live status */}
      <div style={{ ...card, marginBottom: 14 }}>
        {!pub ? <p style={{ margin: 0, fontSize: 13, color: 'var(--sa-muted)' }}>{d ? 'Status unavailable.' : 'Checking…'}</p> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: OC[pub.overall.status] }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)' }}>{pub.overall.title}</span>
              <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>checked {when(pub.generatedAt)}</span>
            </div>
            {pub.overall.sub && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--sa-muted)' }}>{pub.overall.sub}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 10, marginTop: 14 }}>
              {pub.components.map(c => (
                <div key={c.key} style={{ border: '1px solid var(--sa-border)', borderRadius: 10, padding: 12, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--sa-text)' }}>{c.name}</span>
                    <Pill text={HEALTH_LABEL[c.status]} color={HC[c.status]} />
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sa-text)' }}>{c.note}{c.latencyMs != null ? ` · ${c.latencyMs} ms` : ''}</p>
                  {(d?.reasons?.[c.key] || []).map((r: string, n: number) => <p key={n} style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', overflowWrap: 'anywhere' }}>{r}</p>)}
                  {pub.history?.uptime[c.key] != null && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>30 days: {pub.history.uptime[c.key]}% uptime</p>}
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>The grey lines are for you only: customers see the status, the note and the latency.</p>
          </>
        )}
      </div>

      {creating && <NewIncident onDone={async (m) => { setCreating(false); setMsg(m); await load() }} />}

      {!d?.unavailable && d && (
        <>
          <p style={{ ...label, margin: '18px 0 8px' }}>Open incidents</p>
          {open.length === 0 && <div style={{ ...card, fontSize: 13, color: 'var(--sa-muted)' }}>Nothing open.</div>}
          <div style={{ display: 'grid', gap: 10 }}>{open.map(i => <IncidentCard key={i.id} i={i} onChanged={async (m) => { setMsg(m); await load() }} />)}</div>
          <p style={{ ...label, margin: '22px 0 8px' }}>Resolved (last 90 days)</p>
          {closed.length === 0 && <div style={{ ...card, fontSize: 13, color: 'var(--sa-muted)' }}>None.</div>}
          <div style={{ display: 'grid', gap: 10 }}>{closed.map(i => <IncidentCard key={i.id} i={i} onChanged={async (m) => { setMsg(m); await load() }} />)}</div>
        </>
      )}
    </div>
  )
}

function NewIncident({ onDone }: { onDone: (msg: string) => void }) {
  const [title, setTitle] = useState('')
  const [impact, setImpact] = useState<IncidentImpact>('minor')
  const [status, setStatus] = useState<IncidentStatus>('investigating')
  const [components, setComponents] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [published, setPublished] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    const r = await api({ action: 'create', title, impact, status, components, message, published })
    setBusy(false)
    if (!r.ok) { setErr(r.data.error || 'That didn’t work'); return }
    onDone(published ? 'Incident opened and shown on the status page.' : 'Incident saved as a draft (not shown publicly).')
  }
  return (
    <div style={{ ...card, display: 'grid', gap: 12, marginBottom: 14 }}>
      <div><p style={label}>Title</p><input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Delays sending SMS" style={input} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <div><p style={label}>Impact</p><select value={impact} onChange={e => setImpact(e.target.value as IncidentImpact)} style={input}>{INCIDENT_IMPACTS.map(x => <option key={x} value={x}>{INCIDENT_IMPACT_LABEL[x]}</option>)}</select></div>
        <div><p style={label}>Status</p><select value={status} onChange={e => setStatus(e.target.value as IncidentStatus)} style={input}>{INCIDENT_STATUSES.filter(x => x !== 'resolved').map(x => <option key={x} value={x}>{INCIDENT_STATUS_LABEL[x]}</option>)}</select></div>
      </div>
      <div><p style={label}>Affected components</p><ComponentPicker value={components} onChange={setComponents} /></div>
      <div><p style={label}>First update for customers</p><textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="What’s happening and what customers might notice." style={{ ...input, resize: 'vertical' }} /></div>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--sa-muted)' }}>Minor lifts the chosen components to at least Degraded; Major and Critical to Outage, while the incident is open and published. Don’t name businesses or paste error messages: this is public.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sa-text)' }}><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /> Show on the public status page now</label>
      {err && <div style={{ fontSize: 12.5, color: '#ef4444' }}>{err}</div>}
      <div><button disabled={busy} onClick={save} style={btn('#ff7a6b', true)}>{busy ? 'Saving…' : 'Open incident'}</button></div>
    </div>
  )
}

function IncidentCard({ i, onChanged }: { i: Incident; onChanged: (msg: string) => void }) {
  const [status, setStatus] = useState<IncidentStatus>(i.status)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(i.title)
  const [impact, setImpact] = useState<IncidentImpact>(i.impact)
  const [components, setComponents] = useState<string[]>(i.components)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { setStatus(i.status); setTitle(i.title); setImpact(i.impact); setComponents(i.components); setMessage('') }, [i.id, i.status, i.updated_at])

  const post = async (key: string, body: any, done: string) => {
    setBusy(key); setErr('')
    const r = await api({ id: i.id, ...body })
    setBusy('')
    if (!r.ok) { setErr(r.data.error || 'That didn’t work'); return }
    onChanged(done)
  }
  const del = async () => {
    if (!(await confirmDialog({ title: 'Delete this incident?', message: 'It disappears from the status page and its history. To close it, resolve it instead.', confirmLabel: 'Delete', tone: 'danger' }))) return
    post('delete', { action: 'delete' }, 'Incident deleted.')
  }

  return (
    <div style={{ ...card, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--sa-text)', overflowWrap: 'anywhere' }}>{i.title}</span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill text={INCIDENT_STATUS_LABEL[i.status]} color={SC[i.status]} />
          <Pill text={INCIDENT_IMPACT_LABEL[i.impact]} color={i.impact === 'minor' ? '#f59e0b' : '#ef4444'} />
          {!i.published && <Pill text="Draft" color="#64748b" />}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--sa-muted)' }}>
        Started {when(i.started_at)}{i.resolved_at ? ` · resolved ${when(i.resolved_at)}` : ''}
        {i.components.length ? ` · ${i.components.map(k => STATUS_COMPONENTS.find(c => c.key === k)?.name || k).join(', ')}` : ' · no specific component'}
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {[...i.updates].reverse().map((u, n) => (
          <div key={n} style={{ borderLeft: '2px solid var(--sa-border)', paddingLeft: 10 }}>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--sa-muted)' }}><b style={{ color: SC[u.status] }}>{INCIDENT_STATUS_LABEL[u.status]}</b> · {when(u.at)}</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--sa-text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{u.message}</p>
          </div>
        ))}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--sa-border)', paddingTop: 10 }}>
          <div><p style={label}>Title</p><input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} style={input} /></div>
          <div><p style={label}>Impact</p><select value={impact} onChange={e => setImpact(e.target.value as IncidentImpact)} style={input}>{INCIDENT_IMPACTS.map(x => <option key={x} value={x}>{INCIDENT_IMPACT_LABEL[x]}</option>)}</select></div>
          <div><p style={label}>Affected components</p><ComponentPicker value={components} onChange={setComponents} /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={!!busy} onClick={async () => { await post('edit', { action: 'update', title, impact, components }, 'Incident updated.'); setEditing(false) }} style={btn('#ff7a6b', true)}>{busy === 'edit' ? 'Saving…' : 'Save details'}</button>
            <button onClick={() => setEditing(false)} style={btn('var(--sa-muted)')}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--sa-border)', paddingTop: 10 }}>
          <p style={label}>Post an update</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={status} onChange={e => setStatus(e.target.value as IncidentStatus)} style={{ ...input, width: 'auto' }}>{INCIDENT_STATUSES.map(x => <option key={x} value={x}>{INCIDENT_STATUS_LABEL[x]}</option>)}</select>
          </div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} maxLength={2000} placeholder={status === 'resolved' ? 'What was fixed.' : 'What’s changed.'} style={{ ...input, resize: 'vertical' }} />
          {err && <div style={{ fontSize: 12.5, color: '#ef4444' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={!!busy || !message.trim()} onClick={() => post('update', { action: 'update', status, message }, status === 'resolved' && i.status !== 'resolved' ? 'Incident resolved.' : 'Update posted.')} style={btn(status === 'resolved' ? '#10b981' : '#ff7a6b', true)}>
              {busy === 'update' ? 'Posting…' : status === 'resolved' && i.status !== 'resolved' ? 'Resolve' : 'Post update'}
            </button>
            <button onClick={() => setEditing(true)} style={btn('var(--sa-text)')}>Edit details</button>
            <button disabled={!!busy} onClick={() => post('publish', { action: 'update', published: !i.published }, i.published ? 'Hidden from the status page.' : 'Shown on the status page.')} style={btn('var(--sa-text)')}>{i.published ? 'Hide from status page' : 'Publish'}</button>
            <button disabled={!!busy} onClick={del} style={btn('#ef4444')}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
