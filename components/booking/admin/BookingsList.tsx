'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import SlotPicker from '@/components/booking/SlotPicker'
import { api, money, card, btn, btnGhost, input, Modal, Toggle } from './shared'

// The team's list of online bookings, grouped by day, with cancel (+ refund),
// reschedule, completed and no-show.

const STATUS: Record<string, { label: string; bg: string; c: string }> = {
  confirmed: { label: 'Confirmed', bg: '#ecfdf5', c: '#059669' },
  pending: { label: 'Awaiting payment', bg: '#fffbeb', c: '#b45309' },
  cancelled: { label: 'Cancelled', bg: '#fef2f2', c: '#dc2626' },
  completed: { label: 'Completed', bg: '#eff6ff', c: '#2563eb' },
  no_show: { label: 'No-show', bg: '#f3f4f6', c: '#6b7280' },
  expired: { label: 'Expired', bg: '#f3f4f6', c: '#6b7280' },
}
const PAY: Record<string, string> = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Part refunded', pending: 'Unpaid' }

export default function BookingsList({ companyId, bookings, timezone, scope, setScope, reload, flash }: {
  companyId: string; bookings: any[]; timezone: string
  scope: string; setScope: (s: string) => void; reload: () => void; flash: (m: string) => void
}) {
  const [search, setSearch] = useState('')
  const [cancelling, setCancelling] = useState<any | null>(null)
  const [moving, setMoving] = useState<any | null>(null)
  const [noShow, setNoShow] = useState<any | null>(null)

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return s ? bookings.filter(b => [b.customer_name, b.customer_email, b.customer_phone, b.service_name, b.staff_name].some(v => String(v || '').toLowerCase().includes(s))) : bookings
  }, [bookings, search])

  const groups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const b of rows) {
      const k = new Date(b.starts_at).toLocaleDateString('en-CA', { timeZone: timezone })
      const l = m.get(k) || []; l.push(b); m.set(k, l)
    }
    return [...m.entries()]
  }, [rows, timezone])

  const act = async (b: any, action: string) => {
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action } }); flash(action === 'complete' ? 'Marked completed' : action === 'no_show' ? 'Marked as no-show' : 'Updated'); reload() }
    catch (e: any) { flash(e.message) }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: timezone })
  const dayTitle = (k: string) => k === today ? 'Today' : k === tomorrow ? 'Tomorrow' : new Date(`${k}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
          {[['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: scope === k ? '#fff' : 'transparent', color: scope === k ? 'var(--ink, #111)' : 'var(--slate, #6b7280)', boxShadow: scope === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none', fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, service…" style={{ ...input, width: 240, marginLeft: 'auto' }} />
      </div>

      {!groups.length && (
        <div style={{ ...card, textAlign: 'center', padding: '36px 20px', color: 'var(--slate, #6b7280)', fontSize: 14 }}>
          {scope === 'upcoming' ? 'No upcoming bookings yet. Share your booking link to get started.' : 'Nothing here.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 18 }}>
        {groups.map(([day, list]) => (
          <div key={day}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--slate, #6b7280)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{dayTitle(day)} · {list.length}</div>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {list.map((b, i) => {
                const st = STATUS[b.status] || STATUS.confirmed
                const past = Date.parse(b.ends_at) < Date.now()
                return (
                  <div key={b.id} style={{ display: 'flex', gap: 14, padding: '12px 16px', borderTop: i ? '1px solid var(--border, #f3f4f6)' : 'none', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 82, flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: b.status === 'cancelled' ? '#9ca3af' : 'var(--ink, #111)', textDecoration: b.status === 'cancelled' ? 'line-through' : undefined }}>{t(b.starts_at)}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{t(b.ends_at)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {b.customer_name || 'Customer'}
                        <span style={{ fontWeight: 500, color: 'var(--slate, #6b7280)' }}> · {b.service_name}{b.staff_name ? ` with ${b.staff_name}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--slate, #6b7280)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {b.customer_phone && <a href={`tel:${b.customer_phone}`} style={{ color: 'inherit' }}>{b.customer_phone}</a>}
                        {b.customer_email && <span>{b.customer_email}</span>}
                        {(b.address || b.location_label) && <span>📍 {b.address || b.location_label}</span>}
                      </div>
                      {Array.isArray(b.answers) && b.answers.length > 0 && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{b.answers.map((a: any) => `${a.label}: ${a.value}`).join(' · ')}</div>
                      )}
                      {b.notes && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>“{b.notes}”</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ ...pill, background: st.bg, color: st.c }}>{st.label}</span>
                      {b.status === 'confirmed' && b.customer_confirmed_at && <span style={{ ...pill, background: '#ecfdf5', color: '#047857' }} title="Replied C to the reminder">✓ Customer confirmed</span>}
                      {b.status === 'confirmed' && !b.customer_confirmed_at && (b.reminder_24h_at || b.reminder_2h_at) && <span style={{ ...pill, background: '#f9fafb', color: '#6b7280' }}>Reminded</span>}
                      {b.amount_due_cents > 0 && PAY[b.payment_status] && (
                        <span style={{ ...pill, background: '#f9fafb', color: '#374151' }}>{PAY[b.payment_status]} {money(b.payment_status === 'refunded' || b.payment_status === 'partially_refunded' ? b.refunded_cents : b.amount_due_cents, b.currency)}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {b.conversation_id && <Link href={`/admin/inbox?conversation=${b.conversation_id}`} style={{ ...btnGhost, height: 30, fontSize: 12, textDecoration: 'none' }}>💬 Chat</Link>}
                      {b.status === 'confirmed' && !past && <button onClick={() => setMoving(b)} style={{ ...btnGhost, height: 30, fontSize: 12 }}>Move</button>}
                      {b.status === 'confirmed' && past && <button onClick={() => act(b, 'complete')} style={{ ...btnGhost, height: 30, fontSize: 12 }}>✓ Done</button>}
                      {b.status === 'confirmed' && past && <button onClick={() => setNoShow(b)} style={{ ...btnGhost, height: 30, fontSize: 12 }}>No-show</button>}
                      {(b.status === 'completed' || b.status === 'no_show') && <button onClick={() => act(b, 'confirm')} style={{ ...btnGhost, height: 30, fontSize: 12 }}>Undo</button>}
                      {(b.status === 'confirmed' || b.status === 'pending') && <button onClick={() => setCancelling(b)} style={{ ...btnGhost, height: 30, fontSize: 12, color: '#dc2626' }}>Cancel</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {cancelling && <CancelDialog companyId={companyId} b={cancelling} onClose={() => setCancelling(null)} onDone={m => { setCancelling(null); flash(m); reload() }} />}
      {noShow && <NoShowDialog companyId={companyId} b={noShow} onClose={() => setNoShow(null)} onDone={m => { setNoShow(null); flash(m); reload() }} />}
      {moving && <MoveDialog companyId={companyId} b={moving} timezone={timezone} onClose={() => setMoving(null)} onDone={m => { setMoving(null); flash(m); reload() }} />}
    </div>
  )
}

function CancelDialog({ companyId, b, onClose, onDone }: { companyId: string; b: any; onClose: () => void; onDone: (m: string) => void }) {
  const paid = b.payment_status === 'paid'
  const [refund, setRefund] = useState(paid)
  const [notify, setNotify] = useState(true)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try {
      const d = await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'cancel', refund, notify, reason } })
      onDone(d.refundError ? `Cancelled — refund failed: ${d.refundError}` : d.refunded ? `Cancelled and refunded ${money(d.refunded, b.currency)}` : 'Booking cancelled')
    } catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title="Cancel booking" onClose={onClose} width={460} footer={<>
      <button onClick={onClose} style={btnGhost}>Keep it</button>
      <button onClick={go} disabled={busy} style={{ ...btn, background: '#dc2626' }}>{busy ? 'Cancelling…' : 'Cancel booking'}</button>
    </>}>
      <div style={{ fontSize: 14, marginBottom: 14 }}><b>{b.customer_name}</b> · {b.service_name}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {paid && (
          <label style={row}><Toggle on={refund} onChange={setRefund} /> Refund {money(b.amount_due_cents - (b.refunded_cents || 0), b.currency)} to their card</label>
        )}
        <label style={row}><Toggle on={notify} onChange={setNotify} /> Let the customer know (SMS / email)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason (optional, included in the note on the conversation)" style={input} />
        {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  )
}

function NoShowDialog({ companyId, b, onClose, onDone }: { companyId: string; b: any; onClose: () => void; onDone: (m: string) => void }) {
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'no_show', notify } }); onDone(notify ? 'Marked as no-show — sent them a link to rebook' : 'Marked as no-show') }
    catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title="Mark as no-show" onClose={onClose} width={440} footer={<>
      <button onClick={onClose} style={btnGhost}>Cancel</button>
      <button onClick={go} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Mark no-show'}</button>
    </>}>
      <div style={{ fontSize: 14, marginBottom: 14 }}><b>{b.customer_name}</b> · {b.service_name}</div>
      <label style={row}><Toggle on={notify} onChange={setNotify} /> Send “Sorry we missed you — pick another time?” with a booking link</label>
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </Modal>
  )
}

function MoveDialog({ companyId, b, timezone, onClose, onDone }: { companyId: string; b: any; timezone: string; onClose: () => void; onDone: (m: string) => void }) {
  const [slot, setSlot] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fetchSlots = useCallback((from: string, to: string) => api(`/api/bookings?companyId=${companyId}&op=slots&id=${b.id}&from=${from}&to=${to}`), [companyId, b.id])
  const go = async () => {
    if (!slot) return
    setBusy(true); setError('')
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'reschedule', startsAt: slot, notify } }); onDone('Booking moved') }
    catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title={`Move ${b.customer_name || 'booking'}`} onClose={onClose} width={720} footer={<>
      <label style={{ ...row, marginRight: 'auto' }}><Toggle on={notify} onChange={setNotify} /> Tell the customer</label>
      <button onClick={onClose} style={btnGhost}>Cancel</button>
      <button onClick={go} disabled={!slot || busy} style={btn}>{busy ? 'Moving…' : 'Move booking'}</button>
    </>}>
      <SlotPicker businessTz={timezone} fetchSlots={fetchSlots} selected={slot} onSelect={setSlot} accent="#ff7a6b" />
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </Modal>
  )
}

const pill: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }
