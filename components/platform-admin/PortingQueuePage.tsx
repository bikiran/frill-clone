'use client'

// Super admin → Number porting. Every business's requests to move a number to
// Colvy: the details to lodge with the carriers, the bill, the history, status
// changes with notes, and — once the number has arrived on the platform Twilio
// account — "Attach number", which configures it exactly like a bought number
// and completes the request. Uses /api/platform-admin/porting.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { PORT_STATUSES, PORT_STATUS_LABEL, PORT_TRANSITIONS, canAttach, formatAuNumber, formatAbn, type PortStatus } from '@/lib/number-porting'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, minWidth: 0 }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const TONE: Record<string, string> = { submitted: '#6366f1', in_review: '#f59e0b', submitted_to_carrier: '#0ea5e9', scheduled: '#06b6d4', completed: '#10b981', rejected: '#ef4444', cancelled: '#64748b' }
const Pill = ({ s }: { s: string }) => <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: (TONE[s] || '#64748b') + '22', color: TONE[s] || '#64748b', whiteSpace: 'nowrap' }}>{PORT_STATUS_LABEL[s as PortStatus] || s}</span>
const when = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', ...(d.length === 10 ? {} : { hour: 'numeric', minute: '2-digit' }) }) : '')

export default function PortingQueuePage() {
  const [d, setD] = useState<any>(null)
  const [filter, setFilter] = useState<string>('open')
  const [sel, setSel] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const res = await authFetch('/api/platform-admin/porting')
      setD(await res.json())
    } catch (e: any) { setD({ error: e?.message || 'Could not load' }) }
  }
  useEffect(() => { load() }, [])

  const all: any[] = d?.requests || []
  const shown = all.filter(r => filter === 'all' ? true : filter === 'open' ? !['completed', 'rejected', 'cancelled'].includes(r.status) : r.status === filter)
  const current = all.find(r => r.id === sel) || null
  const counts = PORT_STATUSES.reduce((m, s) => ({ ...m, [s]: all.filter(r => r.status === s).length }), {} as Record<string, number>)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--sa-text)' }}>Number porting</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sa-muted)' }}>Requests to move existing numbers to Colvy. Lodge them with Twilio’s porting team, then attach each number when it arrives on the platform account.</p>
        </div>
        <button onClick={load} style={btn('var(--sa-text)')}>Refresh</button>
      </div>

      {d?.error && <div style={{ ...card, color: '#ef4444', marginBottom: 12 }}>{d.error}</div>}
      {d?.unavailable && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: 'var(--sa-text)' }}>The porting tables aren’t there yet. Run <code>migrations/COLVY_V403_NUMBER_PORTING.sql</code> in the Supabase SQL editor; until then businesses see “email support to move a number”.</div>}
      {d && d.twilioConfigured === false && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: '#f59e0b' }}>The platform Twilio account isn’t configured, so numbers can’t be attached.</div>}
      {msg && <div style={{ ...card, marginBottom: 12, fontSize: 13, color: 'var(--sa-text)' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['open', 'Open'], ...PORT_STATUSES.map(s => [s, PORT_STATUS_LABEL[s]]), ['all', 'All']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...btn(filter === k ? '#ff7a6b' : 'var(--sa-muted)', filter === k), padding: '6px 10px', fontSize: 12 }}>
            {l}{counts[k] ? ` (${counts[k]})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {!d && <div style={card}>Loading…</div>}
          {d && shown.length === 0 && <div style={{ ...card, color: 'var(--sa-muted)', fontSize: 13 }}>No requests here.</div>}
          {shown.map(r => (
            <button key={r.id} onClick={() => { setSel(r.id); setMsg('') }} style={{ ...card, textAlign: 'left', cursor: 'pointer', borderColor: sel === r.id ? '#ff7a6b' : 'var(--sa-border)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--sa-text)', overflowWrap: 'anywhere' }}>{(r.numbers || []).map(formatAuNumber).join(', ')}</span>
                <Pill s={r.status} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 4 }}>{r.company?.name || r.company_id} · from {r.current_carrier} · {when(r.created_at)}</div>
              {r.status === 'completed' && r.billing_status && r.billing_status !== 'active' && <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 4 }}>Billing: {r.billing_status}</div>}
            </button>
          ))}
        </div>
        {current && <Detail r={current} onChanged={async (m) => { setMsg(m); await load() }} />}
      </div>
    </div>
  )
}

function Detail({ r, onChanged }: { r: any; onChanged: (msg: string) => void }) {
  const next: string[] = PORT_TRANSITIONS[r.status as PortStatus] || []
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [internal, setInternal] = useState(false)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [ref, setRef] = useState(r.carrier_reference || '')
  const [attachNum, setAttachNum] = useState('')
  const [sid, setSid] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { setTo(''); setNote(''); setErr(''); setRef(r.carrier_reference || ''); setAttachNum(((r.numbers || []).find((n: string) => !(r.attached || {})[n])) || ''); setSid('') }, [r.id, r.status])

  const post = async (body: any, done: string) => {
    setBusy(body.action); setErr('')
    try {
      const res = await authFetch('/api/platform-admin/porting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, ...body }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'That didn’t work'); return }
      onChanged(j.completed ? 'Number attached. The port is complete and the business has been told.' : done)
    } finally { setBusy('') }
  }

  const facts: [string, any][] = [
    ['Business', r.company?.name ? `${r.company.name} (${r.company.slug || ''})` : r.company_id],
    ['Current provider', r.current_carrier], ['Account holder', r.account_holder], ['Account number', r.account_number],
    ['Service address', r.service_address], ['ABN', r.abn ? formatAbn(r.abn) : '—'],
    ['Contact', `${r.contact_name} · ${r.contact_email} · ${r.contact_phone}`],
    ['Preferred date', r.preferred_date || '—'], ['Scheduled for', r.scheduled_for || '—'], ['Carrier reference', r.carrier_reference || '—'],
    ['Signed', `${r.loa_signed_name} · ${when(r.loa_accepted_at)} · ${r.loa_version || ''}`],
    ['Fees', `Port fee A$${Number(r.port_fee_aud || 0)} · A$${Number(r.monthly_price_aud || 0)}/month · billing ${r.billing_status || '—'}`],
  ]

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', overflowWrap: 'anywhere' }}>{(r.numbers || []).map(formatAuNumber).join(', ')}</span>
        <Pill s={r.status} />
      </div>
      {err && <div style={{ fontSize: 12.5, color: '#ef4444' }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><p style={label}>{k}</p><p style={{ margin: 0, fontSize: 13, color: 'var(--sa-text)', overflowWrap: 'anywhere' }}>{v}</p></div>
        ))}
      </div>

      <div>
        <p style={label}>Letter of authority</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sa-text)', lineHeight: 1.5 }}>{r.loa_text}</p>
      </div>

      <div>
        <p style={label}>Documents</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(r.files || []).length === 0 && <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>None</span>}
          {(r.files || []).map((f: any) => (
            <a key={f.id} href={f.url || '#'} target="_blank" rel="noopener noreferrer" style={{ ...btn('var(--sa-text)'), textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.kind === 'bill' ? 'Bill' : 'Document'}: {f.file_name}
            </a>
          ))}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--sa-muted)' }}>Links last 10 minutes; Refresh for new ones.</p>
      </div>

      {canAttach(r.status) && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px dashed var(--sa-border)' }}>
          <p style={label}>Attach a ported number</p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--sa-muted)', lineHeight: 1.45 }}>When Twilio shows the port complete, the number is on the platform account. Attaching points its calls and texts at Colvy (same as a purchase) and adds it to the business at A$15/month (1800: the toll-free price). The request completes when every number is attached.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={attachNum} onChange={e => setAttachNum(e.target.value)} style={{ ...input, flex: '1 1 160px', width: 'auto' }}>
              {(r.numbers || []).map((n: string) => <option key={n} value={n} disabled={!!(r.attached || {})[n]}>{formatAuNumber(n)}{(r.attached || {})[n] ? ' (attached)' : ''}</option>)}
            </select>
            <input value={sid} onChange={e => setSid(e.target.value.trim())} placeholder="Twilio SID PN… (optional)" style={{ ...input, flex: '2 1 200px', width: 'auto' }} />
            <button disabled={!!busy || !attachNum} onClick={() => post({ action: 'attach', phoneNumber: attachNum, twilioSid: sid || null }, 'Number attached.')} style={btn('#10b981', true)}>{busy === 'attach' ? 'Attaching…' : 'Attach number'}</button>
          </div>
        </div>
      )}

      {next.length > 0 && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--sa-border)' }}>
          <p style={label}>Move to</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {next.map(s => <button key={s} onClick={() => setTo(s)} style={{ ...btn(TONE[s] || 'var(--sa-text)', to === s), padding: '6px 10px', fontSize: 12 }}>{s === r.status ? 'Reschedule' : PORT_STATUS_LABEL[s as PortStatus]}</button>)}
          </div>
          {to === 'scheduled' && <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...input, marginBottom: 8 }} />}
          {to === 'rejected' && <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why it can’t go ahead (the business sees this)" style={{ ...input, minHeight: 60, marginBottom: 8, fontFamily: 'inherit' }} />}
          {(to === 'submitted_to_carrier' || to === 'scheduled') && <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Carrier / Twilio port reference (optional)" style={{ ...input, marginBottom: 8 }} />}
          {to && (
            <>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...input, minHeight: 50, marginBottom: 6, fontFamily: 'inherit' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sa-muted)', marginBottom: 8 }}>
                <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Note is internal (the business is still told about the status change)
              </label>
              <button disabled={!!busy} onClick={() => post({ action: 'status', to, note, internal, scheduledFor: date, reason, carrierReference: ref }, `Moved to ${PORT_STATUS_LABEL[to as PortStatus]}. The business has been told.`)} style={btn('#ff7a6b', true)}>{busy === 'status' ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      )}

      {r.status === 'completed' && r.billing_status !== 'active' && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--sa-border)' }}>
          <p style={label}>Billing ({r.billing_status || 'not set'})</p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--sa-muted)', lineHeight: 1.45 }}>The business is asked to add a card in Settings → Calls & SMS. If you’re billing it another way, say so here.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['manual', 'waived', 'pending'].map(m => <button key={m} disabled={!!busy || r.billing_status === m} onClick={() => post({ action: 'billing', mode: m }, `Billing set to ${m}.`)} style={{ ...btn('var(--sa-text)'), padding: '6px 10px', fontSize: 12 }}>{m === 'manual' ? 'Billed manually' : m === 'waived' ? 'Waived' : 'Ask the business'}</button>)}
          </div>
        </div>
      )}

      <div>
        <p style={label}>Add a note</p>
        <AddNote busy={busy === 'note'} onSave={(text, isInternal) => post({ action: 'note', note: text, internal: isInternal }, isInternal ? 'Internal note saved.' : 'Note saved and sent to the business.')} />
      </div>

      <div>
        <p style={label}>History</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(r.events || []).map((e: any) => (
            <div key={e.id} style={{ fontSize: 12.5, color: 'var(--sa-text)', lineHeight: 1.45 }}>
              <span style={{ color: 'var(--sa-muted)' }}>{when(e.created_at)} · </span>
              {e.to_status && e.from_status !== e.to_status ? <><b>{PORT_STATUS_LABEL[e.to_status as PortStatus] || e.to_status}</b>{e.note ? ' · ' : ''}</> : null}
              {e.note}{e.internal ? <span style={{ color: '#f59e0b' }}> (internal)</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AddNote({ busy, onSave }: { busy: boolean; onSave: (text: string, internal: boolean) => void }) {
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(true)
  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} style={{ ...input, minHeight: 50, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sa-muted)' }}>
          <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Internal (don’t send to the business)
        </label>
        <button disabled={busy || !text.trim()} onClick={() => { onSave(text.trim(), internal); setText('') }} style={btn('#ff7a6b', true)}>{busy ? 'Saving…' : 'Save note'}</button>
      </div>
    </div>
  )
}
