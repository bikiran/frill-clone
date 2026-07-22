'use client'

import { enrichNames } from '@/lib/team-names'
import AssigneePicker from '@/components/AssigneePicker'
import { decodeEntities as dec } from '@/lib/decode-entities'
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
  const [search, setSearch] = useState('')
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
    let evts: any[] = d.events || []

    // Tasks created on the Tasks page have a due date but live in
    // conversation_tasks, so they never appeared here. Show them alongside
    // calendar events (read-only markers — editing happens on the Tasks page).
    // Skipped when the user is filtering to a non-task event type.
    if (!typeFilter || typeFilter === 'task') {
      try {
        const { data: rows } = await (supabase as any).from('conversation_tasks')
          .select('*').eq('company_id', companyId)
          .gte('due_date', from).lte('due_date', to).limit(500)
        const taskEvents = (rows || [])
          .filter((t: any) => t.due_date)
          .map((t: any) => ({
            id: `task:${t.id}`,
            _taskId: t.id,
            _fromTasks: true,
            company_id: t.company_id,
            conversation_id: t.conversation_id,
            event_type: 'task',
            title: t.title || t.text,
            notes: t.text,
            starts_at: t.due_date,
            is_all_day: true,
            status: (t.status === 'done' || t.done) ? 'completed'
              : t.status === 'in_progress' ? 'in_progress' : 'scheduled',
            assignees: Array.isArray(t.assignees) ? t.assignees : [],
            assigned_to_name: t.assigned_to || null,
            assigned_to_id: t.assigned_to_id || null,
          }))
        evts = [...evts, ...taskEvents]
      } catch { /* tasks unavailable — just show calendar events */ }
    }

    setEvents(evts)
    setLocations(d.locations || [])
  }

  useEffect(() => { load() }, [companyId, cursor, locationFilter, typeFilter])

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const members: any[] = []
      const { data: co } = await (supabase as any).from('companies')
        .select('owner_id, name').eq('id', companyId).maybeSingle()
      if (co?.owner_id) {
        members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner' })
      }
      // Read the way the Team page does — no company_id filter, since invited
      // members can have a null company_id and RLS already scopes the rows.
      // Filtering by company_id was hiding everyone except the owner.
      const { data: tm } = await (supabase as any).from('team_members').select('*')
      for (const m of (tm || [])) {
        if (companyId && m.company_id && m.company_id !== companyId) continue
        const uid = m.user_id || m.id
        if (members.some(x => x.user_id === uid)) continue
        members.push({
          id: m.id, user_id: uid,
          name: m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member'),
          email: m.email,
          pending: m.status === 'invited',
        })
      }
      await enrichNames(members)
      setTeam(members)
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
  // Local YYYY-MM-DD. toISOString() converts to UTC first, which in Melbourne
  // (UTC+10/+11) rolls a midnight-local date back to the previous day — that's
  // why clicking the 5th opened the 4th. Build the string from local parts.
  const localYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

  // Search matches title, notes and assignee names, across the loaded month.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return events.filter(e => {
      const names = (Array.isArray(e.assignees) ? e.assignees.map((a: any) => a.name) : [e.assigned_to_name])
        .filter(Boolean).join(' ')
      return [e.title, e.notes, names].filter(Boolean)
        .some((s: string) => dec(s).toLowerCase().includes(q))
    }).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }, [search, events])

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
        assigned_to_id: (typeof editing.assigned_to_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editing.assigned_to_id)) ? editing.assigned_to_id : null,
        assigned_to_name: editing.assigned_to_name || null,
        assignees: editing.assignees || [],
        reminder_channels: (editing.assignees || []).length
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
      <style>{`
        /* One column definition for BOTH the weekday header and the date cells,
           so they can never drift out of alignment. box-sizing keeps the 1px
           borders from pushing columns wider. */
        .cal-row {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        .cal-head { background: var(--canvas); border-bottom: 1px solid var(--border); }
        .cal-hcell {
          padding: 9px 4px; text-align: center;
          font-size: 11.5px; font-weight: 800; color: var(--slate);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .cal-hcell-abbr { display: none; }
        .cal-cell {
          box-sizing: border-box;
          min-height: 108px; padding: 7px;
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          overflow: hidden;
        }
        /* Remove the right border on the last column so the grid edge is clean. */
        .cal-cell:nth-child(7n) { border-right: none; }

        /* Event tooltip: anchored to its pill, shown below on hover, never
           resizes the pill or the grid. */
        .cal-event { position: relative; }
        .cal-event .cal-tip {
          display: none;
          position: absolute; left: 0; top: calc(100% + 3px); z-index: 30;
          white-space: normal; width: max-content; max-width: 220px;
          background: var(--ink); color: #fff;
          padding: 6px 9px; border-radius: 7px;
          font-size: 11.5px; font-weight: 600; line-height: 1.35;
          box-shadow: 0 6px 20px rgba(0,0,0,0.22);
          pointer-events: none;
        }
        .cal-event:hover { z-index: 31; }
        .cal-event:hover .cal-tip { display: block; }

        /* Phones: keep all 7 days visible without horizontal scroll by using
           single-letter weekday labels and tighter cells — Apple/Google style. */
        @media (max-width: 620px) {
          .cal-grid-wrap { min-width: 0 !important; }
          .cal-hcell-full { display: none; }
          .cal-hcell-abbr { display: inline; }
          .cal-hcell { padding: 7px 2px; }
          .cal-cell { min-height: 74px; padding: 4px; }
        }
      `}</style>
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
          <button onClick={() => setEditing({ event_type: 'appointment', date: localYmd(new Date()), time: '09:00', status: 'scheduled' })}
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

        {/* Search events by title, notes or assignee */}
        <div style={{ position: 'relative' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{ padding: '7px 11px 7px 31px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, background: '#fff', width: 170, boxSizing: 'border-box' }} />
        </div>

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

      {searchResults ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)' }}>
            {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search}”
          </div>
          {searchResults.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>No events match your search.</div>
          )}
          {searchResults.map(e => {
            const m = TYPE_META[e.event_type] || TYPE_META.appointment
            const when = new Date(e.starts_at)
            const as = (Array.isArray(e.assignees) && e.assignees.length) ? e.assignees : (e.assigned_to_name ? [{ name: e.assigned_to_name }] : [])
            return (
              <button key={e.id} onClick={() => { if (e._fromTasks) { window.location.href = '/admin/tasks'; return } setSearch(''); setEditing({ ...e, date: localYmd(new Date(e.starts_at)), time: new Date(e.starts_at).toTimeString().slice(0, 5), assignees: as }) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{dec(e.title)}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                    {when.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{m.label}
                    {as.length > 0 && ` · ${as.map((a: any) => a.name).join(', ')}`}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <div className="calendar-scroll-x" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="cal-grid-wrap" style={{ minWidth: 560 }}>
          {/* Weekday header */}
          <div className="cal-row cal-head">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="cal-hcell">
                <span className="cal-hcell-full">{d}</span>
                <span className="cal-hcell-abbr">{d[0]}</span>
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="cal-row cal-body">
            {grid.map((d, i) => {
              const k = d ? keyOf(d) : ''
              const evs = d ? (byDay[k] || []) : []
              const today = d && isToday(d)
              return (
                <div key={i} className="cal-cell"
                  onClick={() => d && (evs.length ? setDayOpen(k) : setEditing({ event_type: 'appointment', date: localYmd(d), time: '09:00', status: 'scheduled' }))}
                  style={{
                    background: d ? (today ? 'var(--peach)' : '#fff') : 'var(--canvas)',
                    cursor: d ? 'pointer' : 'default',
                  }}>
                  {d && (
                    <>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%', marginBottom: 4,
                        fontSize: 12.5, fontWeight: today ? 800 : 600,
                        background: today ? 'var(--coral)' : 'transparent',
                        color: today ? '#fff' : 'var(--ink)',
                      }}>{d.getDate()}</span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {evs.slice(0, 3).map(e => {
                          const m = TYPE_META[e.event_type] || TYPE_META.appointment
                          return (
                            <div key={e.id} title={dec(e.title)} className="cal-event"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '2px 5px', borderRadius: 5, background: m.bg,
                                fontSize: 10.5, fontWeight: 600, color: m.fg,
                                overflow: 'hidden', whiteSpace: 'nowrap',
                                opacity: ['cancelled', 'completed'].includes(e.status) ? 0.55 : 1,
                                textDecoration: e.status === 'cancelled' ? 'line-through' : 'none',
                              }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dec(e.title)}</span>
                              <span className="cal-tip">{dec(e.title)}</span>
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
      )}

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

                    <p style={{ margin: '0 0 3px', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{dec(e.title)}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>
                      {e.is_all_day ? 'All day' : new Date(e.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                      {e.time_window ? ` · ${e.time_window}` : ''}
                      {e.contact ? ` · ${e.contact.name || e.contact.email}` : ''}
                    </p>
                    {e.address && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{e.address}</p>}
                    {e.notes && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>{dec(e.notes)}</p>}
                    {(() => {
                      const as = (Array.isArray(e.assignees) && e.assignees.length)
                        ? e.assignees
                        : (e.assigned_to_name ? [{ name: e.assigned_to_name }] : [])
                      if (!as.length) return null
                      return (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                          {as.map((a: any, i: number) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)', fontSize: 11, fontWeight: 700 }}>
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )
                    })()}

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
                      {/* Tasks shown here live in the Tasks page, not in
                          calendar_events — editing them here would try to save
                          the wrong record, so send the user where they belong. */}
                      {e._fromTasks ? (
                        <a href="/admin/tasks"
                          style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>Open in Tasks</a>
                      ) : (
                      <button onClick={() => { setDayOpen(null); setEditing({ ...e, date: localYmd(new Date(e.starts_at)), time: new Date(e.starts_at).toTimeString().slice(0, 5), assignees: (Array.isArray(e.assignees) && e.assignees.length) ? e.assignees : (e.assigned_to_id ? [{ id: e.assigned_to_id, name: e.assigned_to_name }] : []) }) }}
                        style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                      )}
                      {e.conversation_id && (
                        <a href={`/admin/inbox?conversation=${e.conversation_id}`}
                          style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>Open chat</a>
                      )}
                      {!e._fromTasks && (
                      <button onClick={() => remove(e.id)}
                        style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
                      )}
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

            {/* Assign to one or more team members and remind them */}
            <label style={L}>Team members</label>
            <div style={{ marginBottom: 8 }}>
              <AssigneePicker
                members={team as any}
                value={editing.assignees || []}
                onChange={(next) => setEditing({
                  ...editing,
                  assignees: next,
                  assigned_to_id: next[0]?.id || null,
                  assigned_to_name: next[0]?.name || null,
                })}
              />
            </div>

            {(editing.assignees || []).length > 0 && (
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
