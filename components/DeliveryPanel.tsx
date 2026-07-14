'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Slide-out delivery scheduler. The sidebar used to hold a bare <input
// type="date"> that saved a string on the contact and nothing else — it never
// appeared on the team calendar. This books a REAL `delivery` calendar event
// (date, time window, address, outlet, notes) so the run shows up for everyone,
// and keeps the contact's scheduled_delivery / delivery_status in step.

interface Props {
  companyId: string | null
  contact: any
  onClose: () => void
  onSaved: (patch: any) => void
}

const STATUSES = [
  ['pending', 'Pending'],
  ['scheduled', 'Scheduled'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered'],
  ['failed', 'Failed'],
]

const WINDOWS = ['8am – 12pm', '10am – 2pm', '12pm – 4pm', '2pm – 6pm', 'Anytime']

export default function DeliveryPanel({ companyId, contact, onClose, onSaved }: Props) {
  const [date, setDate] = useState<string>(contact?.scheduled_delivery || '')
  const [window_, setWindow] = useState<string>('10am – 2pm')
  const [address, setAddress] = useState<string>(
    [contact?.address, contact?.city, contact?.country].filter(Boolean).join(', ')
  )
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<string>(contact?.delivery_status || 'scheduled')
  const [outlets, setOutlets] = useState<any[]>([])
  const [outletId, setOutletId] = useState<string>('')
  const [existing, setExisting] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Outlets, so the run is assigned to the right store.
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('locations')
        .select('id, label, suburb').eq('company_id', companyId)
      setOutlets(data || [])
    })()
  }, [companyId])

  // Deliveries already booked for this customer.
  useEffect(() => {
    if (!companyId || !contact?.id) return
    ;(async () => {
      const { data } = await (supabase as any).from('calendar_events')
        .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
        .eq('event_type', 'delivery').order('starts_at', { ascending: true })
      setExisting(data || [])
    })()
  }, [companyId, contact?.id, saving])

  const save = async () => {
    if (!date) { setErr('Pick a delivery date'); return }
    setSaving(true); setErr('')
    try {
      // Book it on the team calendar.
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          event_type: 'delivery',
          title: `Delivery — ${contact?.name || contact?.email || 'Customer'}`,
          notes: notes || null,
          starts_at: new Date(`${date}T09:00:00`).toISOString(),
          is_all_day: true,
          time_window: window_,
          contact_id: contact?.id || null,
          conversation_id: contact?.conversation_id || null,
          location_id: outletId || null,
          address: address || null,
          status,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not book the delivery')

      // Keep the contact in step.
      await (supabase as any).from('contacts')
        .update({ scheduled_delivery: date, delivery_status: status })
        .eq('id', contact.id)
      onSaved({ scheduled_delivery: date, delivery_status: status })
      onClose()
    } catch (e: any) {
      setErr(e.message || 'Could not save')
    } finally { setSaving(false) }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }
  const field: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: '#fff' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 340, display: 'flex', justifyContent: 'flex-end' }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 420, maxWidth: '96vw', height: '100%', background: '#fff', overflowY: 'auto', padding: 22, animation: 'slideIn 0.18s ease-out', boxShadow: '-12px 0 40px rgba(0,0,0,0.16)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Schedule delivery</h2>
          <button type="button" onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--slate)' }}>
          For {contact?.name || contact?.email || 'this customer'} — this books a real event on the team calendar.
        </p>

        {/* Already booked */}
        {existing.length > 0 && (
          <div style={{ marginBottom: 18, padding: 12, borderRadius: 11, background: 'var(--peach)' }}>
            <p style={{ margin: '0 0 7px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--coral)' }}>Already booked</p>
            {existing.map(ev => (
              <p key={ev.id} style={{ margin: '0 0 3px', fontSize: 12.5, color: 'var(--ink)' }}>
                {new Date(ev.starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' })}
                {ev.time_window ? ` · ${ev.time_window}` : ''}
                {ev.status ? ` · ${ev.status}` : ''}
              </p>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Delivery date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Time window</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {WINDOWS.map(w => (
              <button key={w} type="button" onClick={() => setWindow(w)}
                style={{ padding: '7px 12px', borderRadius: 20, border: window_ === w ? '1.5px solid var(--coral)' : '1px solid var(--border)', background: window_ === w ? 'var(--peach)' : '#fff', color: window_ === w ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Delivery address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, suburb, state" style={field} />
        </div>

        {outlets.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Outlet</label>
            <select value={outletId} onChange={e => setOutletId(e.target.value)} style={{ ...field, cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...field, cursor: 'pointer' }}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={label}>Notes for the driver</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Gate code, leave at door, call on arrival…"
            style={{ ...field, resize: 'vertical' }} />
        </div>

        {err && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={save} disabled={saving}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Booking…' : 'Book delivery'}
          </button>
          <a href="/admin/calendar"
            style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Full calendar
          </a>
        </div>
      </div>
    </div>
  )
}
