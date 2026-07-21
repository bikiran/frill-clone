'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TYPE_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  delivery:    { label: 'Delivery',    bg: '#fff4f1', fg: '#c2410c', dot: '#f97316' },
  appointment: { label: 'Appointment', bg: '#eef2ff', fg: '#4338ca', dot: '#6366f1' },
  booking:     { label: 'Booking',     bg: '#ecfdf5', fg: '#15803d', dot: '#22c55e' },
  task:        { label: 'Task',        bg: '#f5f3ff', fg: '#7c3aed', dot: '#8b5cf6' },
  pickup:      { label: 'Pickup',      bg: '#fefce8', fg: '#a16207', dot: '#eab308' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  scheduled:   { label: 'Scheduled',   color: '#6b7280' },
  confirmed:   { label: 'Confirmed',   color: '#2563eb' },
  in_progress: { label: 'On its way',  color: '#f97316' },
  completed:   { label: 'Completed',   color: '#15803d' },
  cancelled:   { label: 'Cancelled',   color: '#dc2626' },
  missed:      { label: 'Missed',      color: '#dc2626' },
}

export default function CalendarPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [locationFilter, setLocationFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [dayOpen, setDayOpen] = useState<string | null>(null)

  // ── Reminder settings ────────────────────────────────────────────────────
  const [showReminders, setShowReminders] = useState(false)
  const [reminders, setReminders] = useState<any>({ reminders_enabled: false, lead_hours: 24, email: true })
  const [savingRem, setSavingRem] = useState(false)

  const saveReminders = async () => {
    if (!companyId) return
    setSavingRem(true)
    try {
      await (supabase as any).from('companies').update({ calendar_settings: reminders }).eq('id', companyId)
      setShowReminders(false)
    } catch (e: any) { alert(e.message) }
    finally { setSavingRem(false) }
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id, calendar_settings').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (owned?.[0]?.calendar_settings && Object.keys(owned[0].calendar_settings).length) {
        setReminders({ reminders_enabled: false, lead_hours: 24, email: true, ...owned[0].calendar_settings })
      }
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      setLoading(false)
    })()
  }, [])

  const load = async () => {
    if (!companyId) return
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString()
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const params = new URLSearchParams({ companyId, from, to })
    if (locationFilter) params.set('locationId', locationFilter)
    if (typeFilter) params.set('type', typeFilter)
    const res = await fetch(`/api/calendar?${params}`)
    const d = await res.json()
    setEvents(d.events || [])
    setLocations(d.locations || [])
  }

  useEffect(() => { load() }, [companyId, cursor, locationFilter, typeFilter])

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: tm } = await (supabase as any).from('team_members')
        .select('id, user_id, name').eq('company_id', companyId)
      setTeam(tm || [])
    })()
  }, [companyId])

  // Build the month grid (Monday-first, as is normal in Australia).
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startDay = (first.getDay() + 6) % 7 // 0 = Monday
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const e of events) {
      const d = new Date(e.starts_at)
      const k = keyOf(d)
      ;(m[k] ||= []).push(e)
    }
    return m
  }, [events])

  const monthLabel = cursor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const isToday = (d: Date) => keyOf(d) === keyOf(new Date())

  const shift = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1))

  const save = async () => {
    if (!companyId || !editing?.title?.trim() || !editing?.date) return
    const startsAt = editing.is_all_day
      ? new Date(`${editing.date}T00:00:00`).toISOString()
      : new Date(`${editing.date}T${editing.time || '09:00'}:00`).toISOString()

    const res = await fetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId, id: editing.id,
        event_type: editing.event_type || 'appointment',
        title: editing.title, notes: editing.notes,
        starts_at: startsAt,
        is_all_day: !!editing.is_all_day,
        time_window: editing.time_window || null,
        location_id: editing.location_id || null,
        address: editing.address || null,
        status: editing.status || 'scheduled',
        assigned_to_id: editing.assigned_to_id || null,
        assigned_to_name: editing.assigned_to_name || null,
        reminder_channels: editing.assigned_to_id
          ? (editing.reminder_channels || ['in_app', 'email', 'sms'])
          : null,
        notify_customer: !!editing.notify_customer,
        customer_contact_id: editing.customer_contact_id || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) { alert(d.error || 'Could not save'); return }
    setEditing(null)
    await load()
  }

  const remove = async (id: string) => {
    if (!companyId || !confirm('Delete this event?')) return
    await fetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'delete', id }),
    })
    setEditing(null); setDayOpen(null)
    await load()
  }

  const setStatus = async (id: string, status: string, notifyCustomer: boolean) => {
    if (!companyId) return
    await fetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'set_status', id, status, notifyCustomer }),
    })
    await load()
  }

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 12 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  const dayEvents = dayOpen ? (byDay[dayOpen] || []) : []

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '26px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Calendar</h1>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>Deliveries, appointments, bookings and tasks — everything the team has committed to.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowReminders(true)} title="Reminder settings"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 15px', borderRadius: 10, background: reminders.reminders_enabled ? 'var(--peach)' : '#fff', color: reminders.reminders_enabled ? 'var(--coral)' : 'var(--slate)', border: `1px solid ${reminders.reminders_enabled ? 'var(--coral)' : 'var(--border)'}`, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Reminders
          </button>
          <button onClick={() => setEditing({ event_type: 'appointment', date: new Date().toISOString().slice(0, 10), time: '09:00', status: 'scheduled' })}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add event
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => shift(-1)} style={navBtn}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => shift(1)} style={navBtn}>›</button>
        </div>
        <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}
          style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>
          Today
        </button>

        <span style={{ flex: 1 }} />

        {locations.length > 0 && (
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
            <option value="">All outlets</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
          </select>
        )}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
          <option value="">All types</option>
          {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Month grid — horizontally scrollable on narrow screens so the 7 columns
          never get crushed (they were overflowing/clipping event text on mobile). */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <div className="calendar-scroll-x" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 640 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--canvas)' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} style={{ padding: '9px 8px', fontSize: 11.5, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {grid.map((d, i) => {
            const k = d ? keyOf(d) : ''
            const evs = d ? (byDay[k] || []) : []
            const today = d && isToday(d)
            return (
              <div key={i}
                onClick={() => d && (evs.length ? setDayOpen(k) : setEditing({ event_type: 'appointment', date: d.toISOString().slice(0, 10), time: '09:00', status: 'scheduled' }))}
                style={{
                  minHeight: 108, padding: 7, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  background: d ? (today ? 'var(--peach)' : '#fff') : 'var(--canvas)',
                  cursor: d ? 'pointer' : 'default',
                }}>
                {d && (
                  <>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: '50%', marginBottom: 5,
                      fontSize: 12, fontWeight: today ? 800 : 600,
                      background: today ? 'var(--coral)' : 'transparent',
                      color: today ? '#fff' : 'var(--ink)',
                    }}>{d.getDate()}</span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {evs.slice(0, 3).map(e => {
                        const m = TYPE_META[e.event_type] || TYPE_META.appointment
                        return (
                          <div key={e.id} title={e.title}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '2px 5px', borderRadius: 5, background: m.bg,
                              fontSize: 10.5, fontWeight: 600, color: m.fg,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              opacity: ['cancelled', 'completed'].includes(e.status) ? 0.55 : 1,
                              textDecoration: e.status === 'cancelled' ? 'line-through' : 'none',
                            }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                          </div>
                        )
                      })}
                      {evs.length > 3 && (
                        <span style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 700, paddingLeft: 2 }}>+{evs.length - 3} more</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        </div>
        </div>
      </div>

      {/* Legend + Prexty note */}
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(TYPE_META).map(([k, v]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--slate)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.dot }} />{v.label}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
          <strong>Prexty sync:</strong> this calendar is built ready to sync with Prexty, but <strong>it doesn&rsquo;t sync yet</strong> — Prexty POS doesn&rsquo;t expose an API we can use. Everything here is Colvy&rsquo;s own calendar. When Prexty is ready, existing events will sync without you re-entering anything.
        </p>
      </div>

      {/* Reminder settings */}
      {showReminders && (
        <div onClick={() => setShowReminders(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 340, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '95vw', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Reminders</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Tell the team about events that are due or coming up. Each event is announced once — never repeatedly.
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: reminders.reminders_enabled ? 18 : 0 }}>
              <input type="checkbox" checked={!!reminders.reminders_enabled}
                onChange={e => setReminders({ ...reminders, reminders_enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--coral)', marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Remind the team</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>Off by default — nobody gets surprise emails.</span>
              </span>
            </label>

            {reminders.reminders_enabled && (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>How far ahead</label>
                <select value={reminders.lead_hours}
                  onChange={e => setReminders({ ...reminders, lead_hours: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', background: '#fff' }}>
                  <option value={2}>2 hours before</option>
                  <option value={12}>12 hours before</option>
                  <option value={24}>1 day before</option>
                  <option value={48}>2 days before</option>
                </select>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
                  <input type="checkbox" checked={reminders.email !== false}
                    onChange={e => setReminders({ ...reminders, email: e.target.checked })}
                    style={{ width: 17, height: 17, accentColor: 'var(--coral)', marginTop: 2 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Also email the team</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>
                      Goes to every active team member. In-app notifications are sent either way.
                    </span>
                  </span>
                </label>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveReminders} disabled={savingRem}
                style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {savingRem ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowReminders(false)}
                style={{ padding: '10px 20px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Day detail */}
      {dayOpen && (
        <div onClick={() => setDayOpen(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
              </h2>
              <button onClick={() => setDayOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayEvents.map(e => {
                const m = TYPE_META[e.event_type] || TYPE_META.appointment
                const st = STATUS_META[e.status] || STATUS_META.scheduled
                const loc = locations.find(l => l.id === e.location_id)
                return (
                  <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 5, background: m.bg, color: m.fg }}>{m.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color }}>{st.label}</span>
                      {loc && <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>· {loc.label || loc.suburb}</span>}
                    </div>

                    <p style={{ margin: '0 0 3px', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{e.title}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>
                      {e.is_all_day ? 'All day' : new Date(e.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                      {e.time_window ? ` · ${e.time_window}` : ''}
                      {e.contact ? ` · ${e.contact.name || e.contact.email}` : ''}
                    </p>
                    {e.address && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{e.address}</p>}
                    {e.notes && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>{e.notes}</p>}

                    {/* Delivery status actions */}
                    {e.event_type === 'delivery' && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                        {[
                          ['confirmed', 'Confirm'],
                          ['in_progress', 'On its way'],
                          ['completed', 'Delivered'],
                          ['missed', 'Missed'],
                        ].map(([k, label]) => (
                          <button key={k} onClick={() => setStatus(e.id, k, e.conversation_id ? confirm(`Tell the customer? ("${label}")`) : false)}
                            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: e.status === k ? 'var(--peach)' : '#fff', color: e.status === k ? 'var(--coral)' : 'var(--ink)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={() => { setDayOpen(null); setEditing({ ...e, date: new Date(e.starts_at).toISOString().slice(0, 10), time: new Date(e.starts_at).toTimeString().slice(0, 5) }) }}
                        style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                      {e.conversation_id && (
                        <a href={`/admin/inbox?conversation=${e.conversation_id}`}
                          style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>Open chat</a>
                      )}
                      <button onClick={() => remove(e.id)}
                        style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Event editor */}
      {editing && (
        <div onClick={() => setEditing(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
              {editing.id ? 'Edit event' : 'New event'}
            </h2>

            <label style={L}>Type</label>
            <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
              {Object.entries(TYPE_META).map(([k, v]) => (
                <button key={k} onClick={() => setEditing({ ...editing, event_type: k })}
                  style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${editing.event_type === k ? v.dot : 'var(--border)'}`, background: editing.event_type === k ? v.bg : '#fff', color: editing.event_type === k ? v.fg : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  {v.label}
                </button>
              ))}
            </div>

            <label style={L}>Title</label>
            <input style={I} value={editing.title || ''} placeholder="Deliver 4ft tank to Bikiran"
              onChange={e => setEditing({ ...editing, title: e.target.value })} />

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={L}>Date</label>
                <input type="date" style={I} value={editing.date || ''}
                  onChange={e => setEditing({ ...editing, date: e.target.value })} />
              </div>
              {!editing.is_all_day && (
                <div style={{ flex: 1 }}>
                  <label style={L}>Time</label>
                  <input type="time" style={I} value={editing.time || '09:00'}
                    onChange={e => setEditing({ ...editing, time: e.target.value })} />
                </div>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" checked={!!editing.is_all_day}
                onChange={e => setEditing({ ...editing, is_all_day: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>All day</span>
            </label>

            {editing.event_type === 'delivery' && (
              <>
                <label style={L}>Time window <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— what you promise the customer</span></label>
                <input style={I} value={editing.time_window || ''} placeholder="10am – 2pm"
                  onChange={e => setEditing({ ...editing, time_window: e.target.value })} />

                <label style={L}>Delivery address</label>
                <input style={I} value={editing.address || ''} placeholder="5 Clunes Avenue, Dallas VIC"
                  onChange={e => setEditing({ ...editing, address: e.target.value })} />
              </>
            )}

            {locations.length > 0 && (
              <>
                <label style={L}>Outlet</label>
                <select style={I} value={editing.location_id || ''}
                  onChange={e => setEditing({ ...editing, location_id: e.target.value })}>
                  <option value="">Not tied to an outlet</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
                </select>
              </>
            )}

            {/* Assign to a team member and remind only them */}
            <label style={L}>Team member</label>
            <select style={I} value={editing.assigned_to_id || ''}
              onChange={e => {
                const m = team.find((t: any) => t.id === e.target.value)
                setEditing({ ...editing, assigned_to_id: e.target.value || null, assigned_to_name: m?.name || null })
              }}>
              <option value="">Unassigned</option>
              {team.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            {editing.assigned_to_id && (
              <>
                <label style={L}>Remind them via</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  {([['in_app', 'In-app'], ['email', 'Email'], ['sms', 'SMS']] as const).map(([ch, lbl]) => {
                    const chans: string[] = editing.reminder_channels || ['in_app', 'email', 'sms']
                    const on = chans.includes(ch)
                    return (
                      <button key={ch} type="button"
                        onClick={() => {
                          const next = on ? chans.filter(c => c !== ch) : [...chans, ch]
                          setEditing({ ...editing, reminder_channels: next })
                        }}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                          border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'),
                          background: on ? 'var(--peach)' : '#fff',
                          color: on ? 'var(--coral)' : 'var(--slate)',
                        }}>
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Customer reminder — only meaningful for customer-facing event types */}
            {['delivery', 'appointment', 'booking', 'pickup'].includes(editing.event_type) && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 12px', borderRadius: 10, background: 'var(--canvas)', margin: '8px 0 4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!editing.notify_customer}
                  onChange={e => setEditing({ ...editing, notify_customer: e.target.checked })}
                  style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'block' }}>
                    Also remind the customer
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>
                    Sends the customer a reminder before this {TYPE_META[editing.event_type]?.label.toLowerCase() || 'event'}.
                  </span>
                </span>
              </label>
            )}

            <label style={L}>Notes</label>
            <textarea style={{ ...I, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={editing.notes || ''}
              onChange={e => setEditing({ ...editing, notes: e.target.value })} />

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={save}
                style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditing(null)}
                style={{ padding: '10px 20px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              {editing.id && (
                <button onClick={() => remove(editing.id)}
                  style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: 9, background: '#fff', color: '#dc2626', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: any = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
  background: '#fff', cursor: 'pointer', fontSize: 17, fontWeight: 700,
  color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
