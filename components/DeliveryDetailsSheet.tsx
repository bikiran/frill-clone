'use client'

// A booked delivery, read live from the calendar: when and for whom with its
// status, where (with directions), the order it's for and the driver's notes,
// with Mark delivered / Not delivered yet, Reschedule and Cancel. Opened from
// the "Delivery scheduled" pill in a conversation and from "Already booked" in
// the Schedule delivery sheet.
//
// The web twin of colvy-mobile's DeliveryDetailsSheet: the same statuses
// (Delivered is stored as 'completed'), and a reschedule drops a new
// "Delivery rescheduled" line into the thread, as the app does.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { deliveryLine } from '@/lib/delivery-line'
import { DELIVERY_WINDOWS, SDS_CSS } from '@/components/ScheduleDeliverySheet'

export const DELIVERY_STATUS: Record<string, { label: string; tone: string }> = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  pending: { label: 'Pending', tone: 'amber' },
  out_for_delivery: { label: 'Out for delivery', tone: 'violet' },
  completed: { label: 'Delivered', tone: 'green' },
  delivered: { label: 'Delivered', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}
/** Delivered, whichever app marked it (the app stores 'completed'). */
export const isDelivered = (s: unknown) => /^(completed|delivered)$/i.test(String(s || ''))

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function DeliveryDetailsSheet({ companyId, eventId, fallback, senderName, onClose, onOpenOrder, onChanged }: {
  companyId: string
  /** The calendar event; when missing, the delivery is looked up by contact and day. */
  eventId?: string | null
  fallback?: { contactId?: string | null; date?: string | null }
  senderName?: string
  onClose: () => void
  /** Show the customer's orders (the contact panel's Orders tab). */
  onOpenOrder?: (orderRef: string) => void
  /** After a change, with the contact fields to keep in step. */
  onChanged?: (contactPatch: Record<string, any> | null) => void
}) {
  const [ev, setEv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [resched, setResched] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [date, setDate] = useState('')
  const [win, setWin] = useState('')

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, busy])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        let row: any = null
        if (eventId) {
          const { data } = await (supabase as any).from('calendar_events').select('*').eq('id', eventId).maybeSingle()
          row = data
        }
        if (!row && fallback?.contactId) {
          let q = (supabase as any).from('calendar_events').select('*')
            .eq('company_id', companyId).eq('event_type', 'delivery').eq('contact_id', fallback.contactId)
          if (fallback.date && /^\d{4}-\d{2}-\d{2}$/.test(fallback.date)) {
            const from = new Date(`${fallback.date}T00:00:00`); const to = new Date(from.getTime() + 864e5)
            q = q.gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString())
          }
          const { data } = await q.order('created_at', { ascending: false }).limit(1)
          row = data?.[0] || null
        }
        if (!live) return
        setEv(row)
        if (row?.starts_at) { setDate(ymd(new Date(row.starts_at))); setWin(row.time_window || '') }
      } catch { /* shown as not found */ }
      finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, eventId, fallback?.contactId, fallback?.date])

  const update = async (changes: Record<string, any>, what: string) => {
    if (!ev || busy) return
    setBusy(what); setErr('')
    try {
      const { error } = await (supabase as any).from('calendar_events').update(changes).eq('id', ev.id)
      if (error) throw error
      const next = { ...ev, ...changes }
      setEv(next)
      // A new day or window goes into the conversation too, as the booking did.
      if (what === 'reschedule' && ev.conversation_id) {
        const day = ymd(new Date(next.starts_at))
        try {
          await (supabase as any).from('messages').insert({
            conversation_id: ev.conversation_id, company_id: ev.company_id || companyId,
            sender_type: 'system', sender_name: senderName || null,
            content: deliveryLine({ date: day, window: next.time_window, address: next.address, orderNumber: next.order_id || null }),
            metadata: { kind: 'delivery_scheduled', event_id: ev.id, date: day, window: next.time_window || null, address: next.address || null, order_number: next.order_id || null, by: senderName || null, rescheduled: true },
          })
        } catch { /* the calendar has the new time either way */ }
      }
      // The contact panel's delivery date and status follow.
      let patch: Record<string, any> | null = null
      if (ev.contact_id) {
        patch = changes.status === 'cancelled' ? { scheduled_delivery: null, delivery_status: null }
          : isDelivered(changes.status) ? { delivery_status: 'delivered' }
          : changes.status === 'scheduled' ? { delivery_status: 'scheduled', scheduled_delivery: ymd(new Date(next.starts_at)) }
          : null
        if (patch) { try { await (supabase as any).from('contacts').update(patch).eq('id', ev.contact_id) } catch {} }
      }
      setResched(false); setConfirmCancel(false)
      onChanged?.(patch)
    } catch (e: any) {
      setErr(`Couldn’t update the delivery. ${e?.message || 'Try again.'}`)
    } finally { setBusy('') }
  }

  const when = ev?.starts_at ? new Date(ev.starts_at) : null
  const st = DELIVERY_STATUS[String(ev?.status || 'scheduled')] || DELIVERY_STATUS.scheduled
  const orderRef = ev?.order_id ? String(ev.order_id) : (String(ev?.title || '').match(/#(\w+)/) || [])[1] || ''
  const who = String(ev?.title || '').replace(/^\s*delivery\s*[—–-]\s*/i, '').replace(/\s*·\s*#\w+$/, '')
  const delivered = isDelivered(ev?.status)
  const quick = useMemo(() => ([['Today', 0], ['Tomorrow', 1], ['In 3 days', 3]] as const).map(([label, days]) => {
    const d = new Date(); d.setDate(d.getDate() + days); return { label, value: ymd(d) }
  }), [])

  return (
    <div className="sds-scrim" onClick={() => { if (!busy) onClose() }}>
      <style href="colvy-schedule-delivery" precedence="default">{SDS_CSS}</style>
      <div className="sds sds-detail" role="dialog" aria-modal="true" aria-labelledby="sdd-title" onClick={e => e.stopPropagation()}>
        <span className="sds-grab" aria-hidden="true" />
        <div className="sds-head">
          <button type="button" className="sds-round" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <h2 id="sdd-title">Delivery</h2>
          <span aria-hidden="true" />
        </div>

        <div className="sds-body">
          {loading ? (
            <p className="sds-hint sds-center">Loading…</p>
          ) : !ev ? (
            <p className="sds-hint sds-center">This delivery isn’t on the calendar any more.</p>
          ) : (
            <>
              <div className="sds-hero">
                <span className="sds-hero-i" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2 3.3 7v10L12 21.8l8.7-4.8V7L12 2.2z" opacity=".22" /><path d="M12 2.2 20.7 7 12 11.8 3.3 7 12 2.2zM3.3 8.6l7.9 4.4v8.4l-7.9-4.4V8.6zm9.5 12.8V13l7.9-4.4V17l-7.9 4.4z" /></svg>
                </span>
                <span className="sds-hero-t">
                  <b>{when ? when.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date not set'}</b>
                  <small>{[ev.time_window, who].filter(Boolean).join(' · ') || 'Any time'}</small>
                </span>
                <span className={`sds-status t-${st.tone}`}>
                  {delivered
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z" /></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
                  {st.label}
                </span>
              </div>

              {resched && (
                <section className="sds-sec">
                  <h3>Reschedule</h3>
                  <div className="sds-chips">
                    {quick.map(q => (
                      <button key={q.label} type="button" className={`sds-chip${date === q.value ? ' on' : ''}`} aria-pressed={date === q.value} onClick={() => setDate(q.value)}>{q.label}</button>
                    ))}
                  </div>
                  <label className="sds-field sds-date">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="New date"
                      onClick={e => { try { (e.target as HTMLInputElement).showPicker?.() } catch {} }} />
                    <span className="sds-date-l">{date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Pick a date'}</span>
                  </label>
                  <div className="sds-chips" style={{ marginTop: 10 }}>
                    {DELIVERY_WINDOWS.map(w => (
                      <button key={w} type="button" className={`sds-chip${win === w ? ' on' : ''}`} aria-pressed={win === w} onClick={() => setWin(win === w ? '' : w)}>{w}</button>
                    ))}
                  </div>
                  <div className="sds-row2">
                    <button type="button" className="sds-btn" onClick={() => setResched(false)}>Back</button>
                    <button type="button" className="sds-btn primary" disabled={!!busy || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
                      onClick={() => update({ starts_at: new Date(`${date}T09:00:00`).toISOString(), time_window: win || null, status: 'scheduled' }, 'reschedule')}>
                      {busy === 'reschedule' ? 'Saving…' : 'Save new time'}
                    </button>
                  </div>
                </section>
              )}

              {ev.address && (
                <section className="sds-sec">
                  <h3>Address</h3>
                  <div className="sds-card sds-addr">
                    <span className="sds-ic orange">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7.5 7.5 0 0 0-7.5 7.5C4.5 15.1 12 22 12 22s7.5-6.9 7.5-12.5A7.5 7.5 0 0 0 12 2zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" /></svg>
                    </span>
                    <span className="sds-card-t"><b className="wrap">{ev.address}</b></span>
                    <a className="sds-pill sds-dir" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(ev.address))}`} target="_blank" rel="noreferrer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.5l7.2 2.3L12.5 20z" /></svg>
                      Directions
                    </a>
                  </div>
                </section>
              )}

              {orderRef && (
                <section className="sds-sec">
                  <h3>Order</h3>
                  <button type="button" className="sds-card sds-addr sds-link" disabled={!onOpenOrder} onClick={() => { onOpenOrder?.(orderRef); onClose() }}>
                    <span className="sds-ic blue">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
                    </span>
                    <span className="sds-card-t"><b>Order #{orderRef}</b></span>
                    {onOpenOrder && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#a1a1aa', flexShrink: 0 }}><path d="m9 6 6 6-6 6" /></svg>}
                  </button>
                </section>
              )}

              {ev.notes && (
                <section className="sds-sec">
                  <h3>Notes</h3>
                  <p className="sds-notes-v">{ev.notes}</p>
                </section>
              )}

              {ev.created_at && <p className="sds-meta">Booked {new Date(ev.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}

              {!resched && (
                <div className="sds-actions">
                  {!delivered ? (
                    <button type="button" className="sds-btn primary wide" disabled={!!busy} onClick={() => update({ status: 'completed' }, 'done')}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                      {busy === 'done' ? 'Saving…' : 'Mark delivered'}
                    </button>
                  ) : (
                    <button type="button" className="sds-btn wide" disabled={!!busy} onClick={() => update({ status: 'scheduled' }, 'undo')}>{busy === 'undo' ? 'Saving…' : 'Not delivered yet'}</button>
                  )}
                  {confirmCancel ? (
                    <div className="sds-confirm" role="alert">
                      <span>Cancel this delivery? It stays on the calendar as cancelled.</span>
                      <div className="sds-row2">
                        <button type="button" className="sds-btn" onClick={() => setConfirmCancel(false)}>Keep it</button>
                        <button type="button" className="sds-btn danger" disabled={!!busy} onClick={() => update({ status: 'cancelled' }, 'cancel')}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel delivery'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="sds-row2">
                      <button type="button" className="sds-btn" onClick={() => setResched(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></svg>
                        Reschedule
                      </button>
                      {ev.status !== 'cancelled' && (
                        <button type="button" className="sds-btn danger" onClick={() => setConfirmCancel(true)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {err && <p className="sds-err" role="alert">{err}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
