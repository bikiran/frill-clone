'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AdminPage } from '@/components/ui/AdminKit'
import TickSlider from '@/components/TickSlider'
import FloorCanvas, { type FTable } from '@/components/restaurant/FloorCanvas'
import FloorEditor, { type Plan } from '@/components/restaurant/FloorEditor'
import ReservationDrawer from '@/components/restaurant/ReservationDrawer'
import { zonedToUtc } from '@/lib/booking-time'
import { readCache, writeCache } from '@/lib/client-cache'
import {
  apiRaw, useResCompany, useToast, Toast, SetupNote, Icon, JB_CSS, RS_CSS, PartyStepper, PeopleIcon, StateTag,
  addDays, dayLabel, timeOf, tableName, covers, type Reservation,
} from '@/components/restaurant/shared'

// The floor plan (docs/plans/restaurants.md, Phase 2).
//   Live: every table at a moment (now, or any time that day on the slider):
//   free, booked (who and when), seated, late, or out of action; the day's
//   bookings that still need a table, placed by tapping one and then a table;
//   tap a table to seat, finish, see who's next, seat a walk-in there or take
//   it out of action.
//   Edit layout (owners and admins): components/restaurant/FloorEditor.
// Live state is worked out from the reservations and their tables (plus
// "out of action until"), never stored separately, so it can't drift.

type Day = {
  from: string; today: string; timezone: string; reservations: Reservation[]; interval: number
  periods: { name: string; start: string; end: string }[]; useTables?: boolean; hasFloor?: boolean
}
type Floor = Plan & { canManage: boolean }

const isLive = (r: Reservation) => r.status === 'confirmed' || r.status === 'pending'
const MIN = 60_000

export default function FloorPage() {
  const { companyId, ready } = useResCompany()
  const [edit, setEdit] = useState(false)
  const [date, setDate] = useState('')
  const [floor, setFloor] = useState<Floor | null>(null)
  const [day, setDay] = useState<Day | null>(null)
  const [setup, setSetup] = useState('')
  const [err, setErr] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [at, setAt] = useState<number | null>(null)          // null: now (follows the clock)
  const [now, setNow] = useState(() => Date.now())
  const [tableId, setTableId] = useState<string | null>(null)
  const [placing, setPlacing] = useState<Reservation | null>(null)
  const [open, setOpen] = useState<Reservation | null>(null)
  const [toast, setToast] = useToast()

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('edit') === '1') setEdit(true)
      const d = sp.get('date')
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d)
    } catch {}
  }, [])
  const switchEdit = (on: boolean) => {
    setEdit(on); setTableId(null); setPlacing(null)
    try { const u = new URL(window.location.href); if (on) u.searchParams.set('edit', '1'); else u.searchParams.delete('edit'); window.history.replaceState(null, '', u.toString()) } catch {}
  }

  const loadFloor = useCallback(async (cid: string) => {
    const c = readCache<Floor>(`res:floor:${cid}`)
    if (c) setFloor(c)
    const r = await apiRaw(`/api/restaurant/floor?companyId=${cid}`)
    if (!r.ok) { if (r.data?.setup || r.status === 503) setSetup(r.data?.error || 'Tables need a database update.'); else setErr(r.data?.error || 'Could not load the floor plan.'); return }
    const f: Floor = { areas: r.data.areas || [], tables: r.data.tables || [], combos: r.data.combos || [], canManage: !!r.data.canManage }
    setFloor(f); writeCache(`res:floor:${cid}`, f)
  }, [])
  const seq = useRef(0)
  const loadDay = useCallback(async (cid: string, d: string) => {
    const mine = ++seq.current
    const r = await apiRaw(`/api/reservations?companyId=${cid}&op=day${d ? `&date=${d}` : ''}`)
    if (mine !== seq.current) return
    if (!r.ok) { if (r.data?.setupNeeded) setSetup(r.data.error); else setErr(r.data?.error || 'Could not load the day.'); return }
    setDay(r.data); setErr(''); setNow(Date.now())
    if (!d) setDate(r.data.from)
  }, [])
  useEffect(() => { if (ready && companyId) loadFloor(companyId) }, [ready, companyId, loadFloor])
  useEffect(() => { if (ready && companyId) loadDay(companyId, date) }, [ready, companyId, date, loadDay])
  // The room changes by the minute: keep "now" and the day fresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      if (companyId && date && !edit) loadDay(companyId, date)
    }, 30_000)
    return () => clearInterval(id)
  }, [companyId, date, edit, loadDay])
  // A guest tapped "I'm here": the room updates straight away.
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent).detail || {}
      if (n.type !== 'booking' || !companyId || !date || edit) return
      if (/^🙋/.test(String(n.message || ''))) setToast(String(n.message).replace(/^🙋\s*/, ''))
      setNow(Date.now()); loadDay(companyId, date)
    }
    window.addEventListener('colvy:notification', on)
    return () => window.removeEventListener('colvy:notification', on)
  }, [companyId, date, edit, loadDay]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAt(null); setTableId(null); setPlacing(null) }, [date])
  useEffect(() => { if (floor && (!area || !floor.areas.some(a => a.id === area))) setArea(floor.areas[0]?.id || null) }, [floor]) // eslint-disable-line react-hooks/exhaustive-deps

  const tz = day?.timezone || 'Australia/Melbourne'
  const today = day?.today || date
  const isToday = !!day && day.from === day.today
  // The slider: the day's first seating to an hour and a half after its last.
  const span = useMemo(() => {
    if (!day) return null
    const ps = day.periods.length ? day.periods : [{ name: 'Day', start: '11:00', end: '22:00' }]
    return { min: zonedToUtc(day.from, ps[0].start, tz), max: zonedToUtc(day.from, ps[ps.length - 1].end, tz) + 90 * MIN, step: (day.interval || 15) * MIN }
  }, [day, tz])
  const T = at ?? (isToday ? now : span?.min ?? now)
  const following = at === null && isToday

  const res = (day?.reservations || []).filter(isLive)
  const onTable = useMemo(() => {
    const m = new Map<string, Reservation[]>()
    for (const r of res) for (const t of r.tables || []) { const l = m.get(t.id) || []; l.push(r); m.set(t.id, l) }
    for (const l of m.values()) l.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    return m
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps
  const unplaced = res.filter(r => !(r.tables || []).length && Date.parse(r.endsAt) > (isToday ? now : 0))

  type Live = { state: 'free' | 'soon' | 'booked' | 'seated' | 'late' | 'out' | 'here'; cur: Reservation | null; next: Reservation | null }
  const liveOf = (t: FTable): Live => {
    const list = onTable.get(t.id) || []
    // Right now, a party that's been seated is at the table even if they came early.
    const cur = list.find(r => (Date.parse(r.startsAt) <= T || (following && !!r.seatedAt)) && Date.parse(r.endsAt) > T) || null
    const next = list.find(r => r !== cur && Date.parse(r.startsAt) > T) || null
    // Right now, a guest who tapped "I'm here" is waiting for this table.
    const here = following && !cur?.seatedAt ? list.find(r => r.arrivedAt && !r.seatedAt && Date.parse(r.endsAt) > T) || null : null
    if (here) return { state: 'here', cur: here, next: next === here ? null : next }
    if (t.unavailable_until && Date.parse(t.unavailable_until) > T && !cur) return { state: 'out', cur, next }
    if (cur) return { state: cur.seatedAt ? 'seated' : following && Date.parse(cur.startsAt) < now - 15 * MIN ? 'late' : 'booked', cur, next }
    if (next && Date.parse(next.startsAt) - T <= 60 * MIN) return { state: 'soon', cur, next }
    return { state: 'free', cur, next }
  }
  // Free for the whole of the booking being placed.
  const freeFor = (t: FTable, r: Reservation) => {
    const a = Date.parse(r.startsAt), b = Date.parse(r.endsAt)
    if (t.unavailable_until && Date.parse(t.unavailable_until) > a) return false
    return !(onTable.get(t.id) || []).some(x => x.id !== r.id && Date.parse(x.startsAt) < b && Date.parse(x.endsAt) > a)
  }

  const tables = (floor?.tables || []).filter(t => !floor?.areas.length || (t.area_id || floor.areas[0].id) === area)
  const counts = useMemo(() => {
    const all = floor?.tables || []
    const states = all.map(liveOf)
    return {
      free: states.filter(s => s.state === 'free' || s.state === 'soon').length,
      seated: states.filter(s => s.state === 'seated').length,
      booked: states.filter(s => s.state === 'booked' || s.state === 'late').length,
      guests: states.reduce((n, s) => n + (s.state === 'seated' ? s.cur!.party : 0), 0),
    }
  }, [floor, day, T]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (r: Reservation, action: string, extra: any = {}, done?: string) => {
    const x = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: r.id, action, ...extra } })
    if (!x.ok) { setToast(x.data?.error || 'That didn’t work.'); return false }
    if (done) setToast(done)
    if (companyId) loadDay(companyId, date)
    return true
  }
  const place = async (t: FTable) => {
    if (!placing) return
    const r = placing
    setPlacing(null)
    const ok = await act(r, 'assign', { tables: [t.id] }, `${r.name} at ${tableName(t.label)}${r.party > t.max_party ? ` (seats ${t.max_party})` : ''}`)
    if (ok) setTableId(t.id)
  }
  const tap = (t: FTable) => {
    if (placing) { if (freeFor(t, placing)) place(t); else setToast(`${tableName(t.label)} is taken then`); return }
    setTableId(id => (id === t.id ? null : t.id))
  }
  const sel = tableId ? (floor?.tables || []).find(t => t.id === tableId) || null : null

  const noFloor = floor && !floor.tables.length
  const plan = useMemo<Plan | null>(() => (floor ? { areas: floor.areas, tables: floor.tables, combos: floor.combos } : null), [floor])
  return (
    <AdminPage title="Floor plan" back={{ href: `/admin/reservations${date ? `?date=${date}` : ''}`, label: 'Reservations' }} width="xl"
      sub={edit ? 'Your rooms and tables. Drag them into place, then save.' : 'Who’s at each table, and who’s next.'}
      actions={floor?.canManage ? (
        <div className="ak-seg" role="tablist" aria-label="Mode">
          <button type="button" role="tab" aria-selected={!edit} className={!edit ? 'on' : ''} onClick={() => switchEdit(false)}>Live</button>
          <button type="button" role="tab" aria-selected={edit} className={edit ? 'on' : ''} onClick={() => switchEdit(true)}>Edit layout</button>
        </div>
      ) : null}>
      <style>{JB_CSS + RS_CSS + FL_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}

      {floor && edit && companyId && (
        <FloorEditor companyId={companyId} initial={plan!} toast={setToast}
          onSaved={p => { const f = { ...p, canManage: floor.canManage }; setFloor(f); writeCache(`res:floor:${companyId}`, f); if (companyId) loadDay(companyId, date) }} />
      )}

      {floor && !edit && (noFloor ? (
        <div className="fl-empty ak-panel">
          <b>No tables on your floor plan yet</b>
          <p>Add your tables and Colvy gives every booking one, shows the room live, and only offers online times when a table is free.</p>
          {floor.canManage ? <button type="button" className="ak-btn go" onClick={() => switchEdit(true)}>{Icon.plus}Set up your tables</button> : <p className="ak-hint">Ask an owner or admin to set up the tables.</p>}
        </div>
      ) : (
        <>
          {day && !day.useTables && floor.canManage && (
            <div className="ak-note info"><span>Bookings aren’t given tables automatically yet. <Link href="/admin/reservations/settings">Turn on “Seat by table”</Link> in Reservation Settings.</span></div>
          )}
          <div className="fl-bar">
            <div className="rs-nav">
              <button type="button" className="ak-icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
              <label className="rs-date fl-date"><b>{date ? dayLabel(date, today, true) : '…'}</b><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick a day" /></label>
              <button type="button" className="ak-icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
            </div>
            {span && (
              <div className="fl-time">
                <TickSlider label="Time" ariaLabel="Time" value={Math.min(span.max, Math.max(span.min, T))} min={span.min} max={span.max} step={span.step}
                  onChange={v => setAt(v)} format={v => timeOf(new Date(v).toISOString(), tz)} showMax={false} ticks={24} />
                {isToday && !following && <button type="button" className="ak-btn sm" onClick={() => setAt(null)}>Now</button>}
              </div>
            )}
            {floor.areas.length > 1 && (
              <div className="ak-seg" role="tablist" aria-label="Areas">
                {floor.areas.map(a => <button key={a.id} type="button" role="tab" aria-selected={area === a.id} className={area === a.id ? 'on' : ''} onClick={() => setArea(a.id)}>{a.name}</button>)}
              </div>
            )}
          </div>

          <div className="fl-sum" aria-live="polite">
            <span><b>{following ? 'Now' : timeOf(new Date(T).toISOString(), tz)}</b></span>
            <span><i className="dot seated" />{counts.seated} seated · {covers(counts.guests)}</span>
            <span><i className="dot booked" />{counts.booked} booked</span>
            <span><i className="dot free" />{counts.free} free</span>
          </div>

          {placing && (
            <div className="fl-placing" role="status">
              <span>Choose a table for <b>{placing.name}</b>, {placing.party} at {timeOf(placing.startsAt, tz)}. Tables free then are ringed in green.</span>
              <button type="button" className="ak-btn sm" onClick={() => setPlacing(null)}>Cancel</button>
            </div>
          )}

          <div className="fl-grid">
            <FloorCanvas label="Floor plan, live" tables={tables} minRows={8}
              selected={sel ? [sel.id] : []}
              highlight={placing ? tables.filter(t => freeFor(t, placing)).map(t => t.id) : undefined}
              tone={t => { const s = liveOf(t).state; return `${s}${placing && !freeFor(t, placing) ? ' dim' : ''}` }}
              onTap={t => tap(t)}
              render={t => {
                const l = liveOf(t)
                const who = l.cur || null
                return <>
                  <b>{t.label}</b>
                  {who ? <small>{who.name.split(' ')[0] || 'Guest'} · {who.party}</small>
                    : l.state === 'out' ? <small>Out</small>
                    : l.next ? <small>{timeOf(l.next.startsAt, tz).replace(':00', '')} · {l.next.party}</small>
                    : <small>{t.min_party === t.max_party ? t.max_party : `${t.min_party}–${t.max_party}`}</small>}
                </>
              }} />

            <aside className="fl-side">
              {sel ? (
                <TableCard t={sel} live={liveOf(sel)} list={onTable.get(sel.id) || []} tz={tz} T={T} isToday={isToday} companyId={companyId!}
                  areaName={floor.areas.find(a => a.id === sel.area_id)?.name || ''}
                  onClose={() => setTableId(null)} onOpen={setOpen} onAct={act}
                  onChanged={msg => { setToast(msg); if (companyId) { loadFloor(companyId); loadDay(companyId, date) } }} />
              ) : (
                <div className="fl-card">
                  <div className="fl-card-h"><h3>Needs a table</h3><span className="rs-count">{unplaced.length || ''}</span></div>
                  {!unplaced.length ? <p className="ak-hint" style={{ margin: 0 }}>Every booking {isToday ? 'still to come today' : 'that day'} has a table.</p> : (
                    <ul className="fl-list">
                      {unplaced.map(r => (
                        <li key={r.id} className={placing?.id === r.id ? 'on' : ''}>
                          <button type="button" className="fl-li" onClick={() => setOpen(r)}>
                            <b>{timeOf(r.startsAt, tz)}</b><span>{r.name}</span><span className="fl-p"><PeopleIcon size={12} />{r.party}</span>
                          </button>
                          <button type="button" className="ak-btn sm" onClick={() => { setPlacing(p => (p?.id === r.id ? null : r)); setTableId(null) }}>{placing?.id === r.id ? 'Cancel' : 'Place'}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="ak-hint" style={{ margin: 0 }}>Tap a table to seat guests, see who’s next, seat a walk-in or take it out of action.</p>
                </div>
              )}
            </aside>
          </div>
        </>
      ))}

      {open && companyId && (
        <ReservationDrawer companyId={companyId} tz={tz} today={today} res={open} seatingOptions={[]} useTables
          onClose={() => setOpen(null)} onChange={r => { setOpen(o => (o && o.id === r.id ? r : o)); if (companyId) loadDay(companyId, date) }} toast={setToast} />
      )}
      <Toast text={toast} />
    </AdminPage>
  )
}

function TableCard({ t, live, list, tz, T, isToday, companyId, areaName, onClose, onOpen, onAct, onChanged }: {
  t: FTable; live: { state: string; cur: Reservation | null; next: Reservation | null }; list: Reservation[]; tz: string; T: number; isToday: boolean
  companyId: string; areaName: string
  onClose: () => void; onOpen: (r: Reservation) => void; onAct: (r: Reservation, action: string, extra?: any, done?: string) => Promise<boolean>; onChanged: (msg: string) => void
}) {
  const [busy, setBusy] = useState('')
  const [walk, setWalk] = useState(false)
  const [party, setParty] = useState(Math.min(t.max_party, Math.max(t.min_party, 2)))
  useEffect(() => { setWalk(false); setParty(Math.min(t.max_party, Math.max(t.min_party, 2))) }, [t.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = live.cur
  const later = list.filter(r => r.id !== cur?.id && Date.parse(r.endsAt) > T)
  const out = !!t.unavailable_until && Date.parse(t.unavailable_until) > Date.now()
  const run = async (k: string, fn: () => Promise<any>) => { setBusy(k); try { await fn() } finally { setBusy('') } }

  const seatWalkIn = () => run('walk', async () => {
    const r = await apiRaw('/api/reservations', { method: 'POST', json: { companyId, walkIn: true, party, name: 'Walk-in', tables: [t.id] } })
    if (!r.ok) { onChanged(r.data?.error || 'Could not seat them.'); return }
    setWalk(false); onChanged(`Walk-in of ${party} seated at ${tableName(t.label)}`)
  })
  const setOut = (mins: number | null) => run('out', async () => {
    const until = mins === null ? null : new Date(Date.now() + mins * MIN).toISOString()
    const r = await apiRaw('/api/restaurant/floor', { method: 'PATCH', json: { companyId, tableId: t.id, unavailableUntil: until } })
    if (!r.ok) { onChanged(r.data?.error || 'That didn’t work.'); return }
    onChanged(until ? `${tableName(t.label)} out of action until ${timeOf(until, tz)}` : `${tableName(t.label)} is back in action`)
  })
  // "Rest of the day": until 4am tomorrow, the restaurant's time.
  const restOfDay = () => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    return Math.max(30, Math.round((zonedToUtc(addDays(d, 1), '04:00', tz) - Date.now()) / MIN))
  }

  return (
    <div className="fl-card">
      <div className="fl-card-h">
        <div><h3>Table {t.label}</h3><span className="fl-sub">{t.min_party === t.max_party ? t.max_party : `${t.min_party}–${t.max_party}`} seats{areaName ? ` · ${areaName}` : ''}{!t.online ? ' · team only' : ''}</span></div>
        <button type="button" className="ak-icon-btn" onClick={onClose} aria-label="Close">{Icon.x}</button>
      </div>

      {cur ? (
        <div className={`fl-cur s-${cur.state}`}>
          <button type="button" className="fl-cur-b" onClick={() => onOpen(cur)}>
            <b>{cur.name || 'Guest'}</b>
            <span>{cur.party} · {timeOf(cur.startsAt, tz)}–{timeOf(cur.endsAt, tz)}{cur.seatedAt ? ` · seated ${timeOf(cur.seatedAt, tz)}` : ''}</span>
          </button>
          <div className="fl-acts">
            <StateTag state={cur.state} />
            {cur.status === 'confirmed' && !cur.seatedAt && isToday && <button type="button" className="ak-btn sm go" disabled={!!busy} onClick={() => run('seat', () => onAct(cur, 'seat', {}, `${cur.name} seated`))}>Seat</button>}
            {cur.status === 'confirmed' && cur.seatedAt && <button type="button" className="ak-btn sm go" disabled={!!busy} onClick={() => run('done', () => onAct(cur, 'complete', {}, `${tableName(t.label)} is free`))}>Finish</button>}
          </div>
        </div>
      ) : out ? (
        <div className="fl-cur s-out"><b>Out of action</b><span>Until {timeOf(t.unavailable_until!, tz)}{t.unavailable_note ? ` · ${t.unavailable_note}` : ''}</span></div>
      ) : (
        <div className="fl-cur s-free"><b>Free</b><span>{live.next ? `Until ${timeOf(live.next.startsAt, tz)}` : 'For the rest of the day'}</span></div>
      )}

      {later.length > 0 && (
        <div>
          <span className="ak-label">Later</span>
          <ul className="fl-list">
            {later.map(r => (
              <li key={r.id}><button type="button" className="fl-li" onClick={() => onOpen(r)}><b>{timeOf(r.startsAt, tz)}</b><span>{r.name}</span><span className="fl-p"><PeopleIcon size={12} />{r.party}</span></button></li>
            ))}
          </ul>
        </div>
      )}

      {isToday && !cur && !out && (
        walk ? (
          <div className="fl-walk">
            <PartyStepper value={party} onChange={setParty} max={100} />
            <button type="button" className="ak-btn go" disabled={!!busy} onClick={seatWalkIn}>{busy === 'walk' ? 'Seating…' : 'Seat now'}</button>
            <button type="button" className="ak-btn ghost" onClick={() => setWalk(false)}>Cancel</button>
            {party > t.max_party && <p className="ak-hint" style={{ margin: 0, width: '100%', color: '#b45309' }}>{tableName(t.label)} seats {t.max_party}.</p>}
            {live.next && <p className="ak-hint" style={{ margin: 0, width: '100%' }}>{live.next.name} has it at {timeOf(live.next.startsAt, tz)}.</p>}
          </div>
        ) : <button type="button" className="ak-btn" onClick={() => setWalk(true)}>{Icon.people}Seat a walk-in here</button>
      )}

      <div>
        <span className="ak-label">Out of action</span>
        {out ? <button type="button" className="ak-btn sm" disabled={!!busy} onClick={() => setOut(null)}>Back in action</button> : (
          <div className="rs-chips">
            {[[30, '30 min'], [60, '1 hour'], [120, '2 hours']].map(([m, l]) => <button key={m} type="button" className="rs-chip" disabled={!!busy} onClick={() => setOut(m as number)}>{l}</button>)}
            <button type="button" className="rs-chip" disabled={!!busy} onClick={() => setOut(restOfDay())}>Rest of the day</button>
          </div>
        )}
        <p className="ak-hint" style={{ margin: '6px 0 0' }}>A wobbly leg, a staff meal: nobody is given it, online or by Colvy, until then.</p>
      </div>
    </div>
  )
}

const FL_CSS = `
.fl-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.fl-date{min-width:150px}
.fl-time{display:flex;align-items:center;gap:8px;flex:1 1 280px;min-width:220px}
.fl-time>*:first-child{flex:1;min-width:0}
.fl-sum{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;color:var(--mut)}
.fl-sum b{color:var(--ink)}
.fl-sum span{display:inline-flex;align-items:center;gap:6px}
.fl-sum .dot{width:10px;height:10px;border-radius:4px;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--ink) 14%,transparent)}
.fl-sum .dot.seated{background:color-mix(in srgb,#16a34a 40%,var(--card,#fff))}
.fl-sum .dot.booked{background:color-mix(in srgb,#3b82f6 35%,var(--card,#fff))}
.fl-sum .dot.free{background:var(--card,#fff)}
.fl-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
@media(max-width:980px){.fl-grid{grid-template-columns:minmax(0,1fr)}}
.fl-side{position:sticky;top:84px;display:flex;flex-direction:column;gap:12px}
@media(max-width:980px){.fl-side{position:static}}
.fl-card{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--line,rgba(0,0,0,.06))}
.fl-card-h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.fl-card-h h3{margin:0;font-size:17px;font-weight:750}
.fl-sub{font-size:13px;color:var(--mut)}
.fl-cur{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:16px;background:var(--f)}
.fl-cur>b{font-size:15px}
.fl-cur>span{font-size:13px;color:var(--mut)}
.fl-cur.s-seated{background:color-mix(in srgb,#16a34a 12%,var(--card,#fff))}
.fl-cur.s-here{background:color-mix(in srgb,#16a34a 9%,var(--card,#fff));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,#16a34a 45%,transparent)}
.fl-cur.s-late{background:color-mix(in srgb,#ef4444 10%,var(--card,#fff))}
.fl-cur.s-booked,.fl-cur.s-due{background:color-mix(in srgb,#3b82f6 10%,var(--card,#fff))}
.fl-cur-b{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:0;border:none;background:none;font:inherit;color:var(--ink);text-align:left;cursor:pointer}
.fl-cur-b b{font-size:15.5px}
.fl-cur-b span{font-size:13px;color:var(--mut)}
.fl-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.fl-list li{display:flex;align-items:center;gap:8px;border-radius:12px}
.fl-list li.on{background:color-mix(in srgb,#16a34a 10%,transparent)}
.fl-li{flex:1;display:flex;align-items:center;gap:10px;min-width:0;padding:8px 10px;border:none;border-radius:12px;background:var(--f);font:inherit;font-size:13.5px;color:var(--ink);text-align:left;cursor:pointer}
.fl-li:hover{background:var(--f2)}
.fl-li b{font-variant-numeric:tabular-nums;width:58px;flex-shrink:0}
.fl-li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl-p{display:inline-flex;align-items:center;gap:3px;margin-left:auto;color:var(--mut);font-weight:600;flex-shrink:0}
.fl-walk{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fl-placing{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:16px;background:color-mix(in srgb,#16a34a 12%,var(--card,#fff));font-size:14px}
.fl-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:56px 20px;text-align:center}
.fl-empty b{font-size:18px}
.fl-empty p{margin:0;max-width:480px;color:var(--mut);line-height:1.5}
`
