'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AdminPage } from '@/components/ui/AdminKit'
import EmptyScroll from '@/components/EmptyScroll'
import { readCache, writeCache } from '@/lib/client-cache'
import NewReservation, { WalkIn } from '@/components/restaurant/NewReservation'
import ReservationDrawer from '@/components/restaurant/ReservationDrawer'
import {
  api, apiRaw, useResCompany, useToast, Toast, SetupNote, Icon, JB_CSS, RS_CSS, StateTag, PeopleIcon, SEATING, TableChip, money, tablesText,
  addDays, dayLabel, timeOf, fmtDay, covers, type Reservation,
} from '@/components/restaurant/shared'

// Table reservations (docs/plans/restaurants.md, Phase 1): the day sheet, with
// the covers through each service against the restaurant's limit, every table
// by sitting with one-tap Seat and Finish, the next two weeks, and the guest
// book. Times are in the restaurant's time zone.

type Tab = 'day' | 'upcoming' | 'guests'
type Day = {
  from: string; today: string; timezone: string; reservations: Reservation[]
  counts: { reservations: number; covers: number; seated: number; toCome: number; noShows: number; cancelled: number }
  maxCovers: number; interval: number; periods: { name: string; start: string; end: string }[]
  closed: { date: string; label: string } | null; strips: { name: string; points: { at: number; covers: number }[] }[]
  /** Phase 2: seating by table (the setting is on and there's a floor plan). */
  useTables?: boolean; hasFloor?: boolean
}

const hhmm = (iso: string, tz: string) => {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) } catch { return '00:00' }
}
const dayKey = (cid: string, d: string) => `res:day:${cid}:${d}`

export default function ReservationsPage() {
  const { companyId, ready } = useResCompany()
  const [tab, setTab] = useState<Tab>('day')
  const [date, setDate] = useState('')
  const [day, setDay] = useState<Day | null>(null)
  const [loading, setLoading] = useState(true)
  const [setup, setSetup] = useState('')
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState<{ enabled: boolean; seating: string[]; canManage: boolean; pageUrl: string } | null>(null)
  const [open, setOpen] = useState<Reservation | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [toast, setToast] = useToast()

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const t = sp.get('tab')
      if (t === 'upcoming' || t === 'guests') setTab(t)
      const d = sp.get('date')
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d)
      if (sp.get('new') === '1') setShowNew(true)
    } catch {}
  }, [])
  const switchTab = (t: Tab) => {
    setTab(t)
    try { const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u.toString()) } catch {}
  }

  useEffect(() => {
    if (!ready || !companyId) return
    const k = `res:meta:${companyId}`
    const c = readCache<any>(k)
    if (c) setMeta(c)
    api(`/api/restaurant/settings?companyId=${companyId}`)
      .then(r => { const m = { enabled: !!r.enabled, seating: r.settings?.seating || [], canManage: !!r.canManage, pageUrl: r.pageUrl || '' }; setMeta(m); writeCache(k, m) })
      .catch(e => { if (/COLVY_V429/.test(e.message)) setSetup(e.message) })
  }, [ready, companyId])

  // The day sheet. Only the newest request may paint (quick date taps).
  const seq = useRef(0)
  const loadDay = useCallback(async (cid: string, d: string, quiet = false) => {
    const mine = ++seq.current
    if (!quiet) {
      const c = d ? readCache<Day>(dayKey(cid, d)) : null
      if (c) { setDay(c); setLoading(false) } else if (day?.from !== d) setLoading(true)
    }
    const r = await apiRaw(`/api/reservations?companyId=${cid}&op=day${d ? `&date=${d}` : ''}`)
    if (mine !== seq.current) return
    setLoading(false)
    if (!r.ok) { if (r.data?.setupNeeded) setSetup(r.data.error); else setErr(r.data?.error || 'Could not load reservations.'); return }
    setErr(''); setSetup('')
    setDay(r.data)
    writeCache(dayKey(cid, r.data.from), r.data)
    if (!d) setDate(r.data.from)
  }, [day?.from])
  useEffect(() => {
    if (!ready) return
    if (!companyId) { setLoading(false); return }
    if (tab === 'day') loadDay(companyId, date)
  }, [ready, companyId, date, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep today's sheet fresh (arrivals turn "Arriving soon", then "Late").
  useEffect(() => {
    if (!companyId || tab !== 'day' || !day || day.from !== day.today) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') loadDay(companyId, day.from, true) }, 60_000)
    return () => clearInterval(id)
  }, [companyId, tab, day?.from, day?.today]) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (r: Reservation) => {
    setOpen(o => (o && o.id === r.id ? r : o))
    if (companyId && day) loadDay(companyId, day.from, true)
  }
  const quick = async (r: Reservation, action: 'seat' | 'complete') => {
    const res = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: r.id, action } })
    if (!res.ok) { setToast(res.data?.error || 'That didn’t work.'); return }
    setToast(action === 'seat' ? `${r.name} seated` : 'Table finished')
    changed(res.data.reservation)
  }

  const tz = day?.timezone || 'Australia/Melbourne'
  const today = day?.today || date
  const off = meta && !meta.enabled

  return (
    <AdminPage title="Reservations" width="xl" sub="Tonight’s tables, covers and guests, in one place."
      actions={<>
        {meta?.canManage && <Link href="/admin/reservations/settings" className="ak-btn" title="Hours, covers, booking page">{Icon.gear}<span className="rs-hide-sm">Settings</span></Link>}
        {(day?.hasFloor || meta?.canManage) && <Link href={`/admin/reservations/floor${date ? `?date=${date}` : ''}`} className="ak-btn" title="Tables on the floor plan, live">{FLOOR_ICON}<span className="rs-hide-sm">Floor plan</span></Link>}
        <button type="button" className="ak-btn" onClick={() => setShowWalkIn(true)} disabled={!companyId || !!setup}>{Icon.people}<span className="rs-hide-sm">Walk-in</span></button>
        <button type="button" className="ak-btn go" onClick={() => setShowNew(true)} disabled={!companyId || !!setup}>{Icon.plus}New reservation</button>
      </>}>
      <style>{JB_CSS + RS_CSS + PAGE_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}
      {off && !setup && (
        <div className="ak-note warn">
          <span>Online table bookings are off, so guests can’t book on your page. You can still take bookings here.{meta?.canManage && <> <Link href="/admin/reservations/settings">Turn them on</Link>.</>}</span>
        </div>
      )}

      <div className="rs-bar">
        <div className="ak-seg" role="tablist" aria-label="View">
          {(['day', 'upcoming', 'guests'] as Tab[]).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => switchTab(t)}>{t === 'day' ? 'Day' : t === 'upcoming' ? 'Upcoming' : 'Guests'}</button>
          ))}
        </div>
        {tab === 'day' && date && (
          <div className="rs-nav">
            <button type="button" className="ak-icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
            <label className="rs-date">
              <b>{dayLabel(date, today, true)}</b>
              <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick a day" />
            </label>
            <button type="button" className="ak-icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
            {today && date !== today && <button type="button" className="ak-btn sm" onClick={() => setDate(today)}>Today</button>}
          </div>
        )}
      </div>

      {tab === 'day' ? (
        loading && !day ? <Skeleton /> : day ? (
          <DaySheet day={day} tz={tz} onOpen={setOpen} onQuick={quick} onNew={() => setShowNew(true)} />
        ) : null
      ) : tab === 'upcoming' ? (
        companyId ? <Upcoming companyId={companyId} onOpen={setOpen} onDay={d => { setDate(d); switchTab('day') }} /> : null
      ) : (
        companyId ? <Guests companyId={companyId} /> : null
      )}

      {showNew && companyId && (
        <NewReservation companyId={companyId} tz={tz} today={today || date} date={date || today} seatingOptions={meta?.seating || []} useTables={!!day?.useTables}
          onClose={() => setShowNew(false)}
          onCreated={(r, noTable) => { setShowNew(false); setToast(`Booked: ${r.name}, ${r.party} at ${timeOf(r.startsAt, tz)}${r.tables?.length ? ` · ${tablesText(r.tables)}` : noTable ? ' · no table free yet' : ''}`); const d = r.startsAt ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.startsAt)) : date; if (tab !== 'day') switchTab('day'); if (d !== date) setDate(d); else if (companyId) loadDay(companyId, d, true) }} />
      )}
      {showWalkIn && companyId && (
        <WalkIn companyId={companyId} useTables={!!day?.useTables} onClose={() => setShowWalkIn(false)}
          onCreated={r => { setShowWalkIn(false); setToast(`${r.name === 'Walk-in' ? 'Walk-in' : r.name} seated, ${r.party}${r.tables?.length ? ` at ${tablesText(r.tables)}` : ''}`); if (tab !== 'day') switchTab('day'); if (today && date !== today) setDate(today); else if (companyId) loadDay(companyId, date, true) }} />
      )}
      {open && companyId && (
        <ReservationDrawer companyId={companyId} tz={tz} today={today} res={open} seatingOptions={meta?.seating || []} useTables={!!day?.hasFloor}
          onClose={() => setOpen(null)} onChange={changed} toast={setToast} />
      )}
      <Toast text={toast} />
    </AdminPage>
  )
}

function Skeleton() {
  return <div className="rs-skel"><div /><div /><div /><div /><div className="wide" /><div className="wide tall" /></div>
}

// ── The day ────────────────────────────────────────────────────────────────

function DaySheet({ day, tz, onOpen, onQuick, onNew }: { day: Day; tz: string; onOpen: (r: Reservation) => void; onQuick: (r: Reservation, a: 'seat' | 'complete') => void; onNew: () => void }) {
  const c = day.counts
  const groups = useMemo(() => {
    const live = day.reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    const out: { name: string; list: Reservation[] }[] = day.periods.length ? day.periods.map(p => ({ name: p.name, list: [] as Reservation[] })) : []
    const other: Reservation[] = []
    for (const r of live) {
      const t = hhmm(r.startsAt, tz)
      let i = -1
      day.periods.forEach((p, k) => { if (p.start <= t) i = k })
      if (i < 0 && day.periods.length) i = 0
      if (i >= 0) out[i].list.push(r); else other.push(r)
    }
    if (other.length) out.push({ name: day.periods.length ? 'Other times' : 'Reservations', list: other })
    return out.filter(g => g.list.length || day.periods.length)
  }, [day, tz])
  const gone = day.reservations.filter(r => r.status === 'cancelled' || r.status === 'no_show')
  const isToday = day.from === day.today
  const empty = !day.reservations.length

  return (
    <>
      <div className="ak-tiles">
        <div className="ak-tile"><span className="ak-tile-l">Booked</span><span className="ak-tile-v">{c.covers}</span><span className="ak-tile-s">{c.reservations} {c.reservations === 1 ? 'table' : 'tables'}{day.maxCovers ? ` · up to ${day.maxCovers} at once` : ''}</span></div>
        <div className="ak-tile"><span className="ak-tile-l">Seated now</span><span className="ak-tile-v">{c.seated}</span><span className="ak-tile-s">{isToday ? covers(c.seated) : 'On the day'}</span></div>
        <div className="ak-tile"><span className="ak-tile-l">Still to come</span><span className="ak-tile-v">{c.toCome}</span><span className="ak-tile-s">{covers(c.toCome)}</span></div>
        <div className="ak-tile"><span className="ak-tile-l">No-shows</span><span className="ak-tile-v">{c.noShows}</span><span className="ak-tile-s">{c.cancelled ? `${c.cancelled} cancelled` : 'None cancelled'}</span></div>
      </div>

      {day.closed ? (
        <div className="ak-note warn"><span>Closed{day.closed.label ? `: ${day.closed.label}` : ''}. Guests can’t book online today; you can still add tables here.</span></div>
      ) : !day.periods.length ? (
        <div className="ak-note"><span>No seating hours on {dayLabel(day.from, day.today, true)}. Guests can’t book online; you can still add tables here.</span></div>
      ) : null}

      {day.strips.some(s => s.points.some(p => p.covers > 0)) && (
        <div className="rs-strips">
          {day.strips.map((s, i) => <CoversStrip key={`${s.name}-${i}`} name={s.name} points={s.points} max={day.maxCovers} tz={tz} />)}
        </div>
      )}

      {empty ? (
        <div className="ak-panel rs-empty">
          <EmptyScroll title={isToday ? 'No tables booked today' : 'No tables booked'} kinds={['plate', 'calendar', 'contact']}
            line="Reservations from your booking page, phone bookings and walk-ins all show here."
            action={<button type="button" className="ak-btn go" onClick={onNew}>{Icon.plus}New reservation</button>} />
        </div>
      ) : (
        <div className="rs-groups">
          {groups.map(g => (
            <section key={g.name} className="ak-panel flush">
              <div className="ak-panel-h"><h2>{g.name}</h2><span className="rs-count">{g.list.length ? `${g.list.length} · ${covers(g.list.reduce((n, r) => n + r.party, 0))}` : 'Nothing booked'}</span></div>
              {g.list.map(r => <Row key={r.id} r={r} tz={tz} isToday={isToday} onOpen={onOpen} onQuick={onQuick} useTables={!!day.useTables} />)}
            </section>
          ))}
          {gone.length > 0 && (
            <details className="ak-panel flush rs-gone">
              <summary className="ak-panel-h"><h2>Cancelled and no-shows</h2><span className="rs-count">{gone.length}</span></summary>
              {gone.map(r => <Row key={r.id} r={r} tz={tz} isToday={isToday} onOpen={onOpen} onQuick={onQuick} />)}
            </details>
          )}
        </div>
      )}
    </>
  )
}

function Row({ r, tz, isToday, onOpen, onQuick, useTables }: { r: Reservation; tz: string; isToday: boolean; onOpen: (r: Reservation) => void; onQuick: (r: Reservation, a: 'seat' | 'complete') => void; useTables?: boolean }) {
  const live = r.status === 'confirmed'
  const [busy, setBusy] = useState(false)
  // Visits before this one (the guest's count includes a table that's seated or done).
  const counted = r.status === 'completed' || (r.status === 'confirmed' && (!!r.seatedAt || Date.parse(r.endsAt) < Date.now()))
  const prior = r.guest ? r.guest.visits - (counted ? 1 : 0) : 0
  const go = async (e: React.MouseEvent, a: 'seat' | 'complete') => { e.stopPropagation(); setBusy(true); try { await onQuick(r, a) } finally { setBusy(false) } }
  return (
    <div className={`rs-row s-${r.state}`} role="button" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r) }} aria-label={`${timeOf(r.startsAt, tz)}, ${r.name}, ${r.party}`}>
      <span className="rs-time">{timeOf(r.startsAt, tz)}</span>
      <span className="rs-party" title={covers(r.party)}><PeopleIcon size={13} />{r.party}</span>
      <div className="rs-main">
        <b className="rs-name"><TableChip tables={r.tables} missing={useTables && (r.status === 'confirmed' || r.status === 'pending')} />{r.name || 'Guest'}</b>
        <div className="rs-meta">
          {r.deposit && <span className={r.deposit.status === 'paid' ? 'ok' : 'warn'}>{r.deposit.status === 'paid' ? `Deposit ${money(r.deposit.cents)} paid` : r.deposit.status === 'refunded' ? 'Deposit refunded' : `Deposit ${money(r.deposit.cents)} not paid`}</span>}
          {prior > 0 && <span>{`${prior + 1}${ord(prior + 1)} visit`}</span>}
          {r.guest && r.guest.noShows > 0 && <span className="warn">{r.guest.noShows} no-show{r.guest.noShows === 1 ? '' : 's'}</span>}
          {r.occasion && <span>🎉 {r.occasion}</span>}
          {r.seating && <span>{SEATING[r.seating] || r.seating}</span>}
          {r.notes && <span className="rs-ell" title={r.notes}>“{r.notes}”</span>}
          {r.source === 'walk_in' && r.name !== 'Walk-in' && <span>Walk-in</span>}
        </div>
      </div>
      <div className="rs-side">
        <StateTag state={r.state} />
        {live && isToday && !r.seatedAt && <button type="button" className="ak-btn sm" onClick={e => go(e, 'seat')} disabled={busy}>Seat</button>}
        {live && r.seatedAt && <button type="button" className="ak-btn sm" onClick={e => go(e, 'complete')} disabled={busy}>Finish</button>}
      </div>
    </div>
  )
}
const FLOOR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7" rx="1.5" /><circle cx="17" cy="6.5" r="3.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /></svg>
)
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th')

/** Guests seated through a service, against the most the room takes. */
function CoversStrip({ name, points, max, tz }: { name: string; points: { at: number; covers: number }[]; max: number; tz: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const peak = Math.max(0, ...points.map(p => p.covers))
  const top = Math.max(max || 0, peak, 1)
  const h = 72
  const label = (i: number) => {
    const p = points[i]
    return `${timeOf(new Date(p.at).toISOString(), tz)} · ${p.covers} seated${max ? ` of ${max}` : ''}`
  }
  const tick = Math.max(1, Math.round(points.length / 6))
  return (
    <figure className="rs-strip ak-panel">
      <figcaption><b>{name}</b><span>Peak {peak}{max ? ` of ${max}` : ''} seated</span></figcaption>
      <div className="rs-plot" style={{ height: h }} onMouseLeave={() => setHover(null)}>
        {max > 0 && <div className="rs-cap" style={{ bottom: (max / top) * h }}><span>Limit {max}</span></div>}
        <div className="rs-bars" role="img" aria-label={`${name}: peak ${peak} guests seated${max ? ` of ${max}` : ''}`}>
          {points.map((p, i) => (
            <span key={p.at} className={`rs-b${hover === i ? ' on' : ''}${max && p.covers > max ? ' over' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
              <i style={{ height: p.covers ? Math.max(3, (p.covers / top) * h) : 0 }} />
            </span>
          ))}
        </div>
        {hover !== null && <div className="rs-tip" style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}>{label(hover)}</div>}
      </div>
      <div className="rs-axis">
        {points.map((p, i) => <span key={p.at}>{i % tick === 0 ? timeOf(new Date(p.at).toISOString(), tz) : ''}</span>)}
      </div>
    </figure>
  )
}

// ── Upcoming ───────────────────────────────────────────────────────────────

function Upcoming({ companyId, onOpen, onDay }: { companyId: string; onOpen: (r: Reservation) => void; onDay: (d: string) => void }) {
  const [d, setD] = useState<any>(() => readCache(`res:range:${companyId}`))
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    apiRaw(`/api/reservations?companyId=${companyId}&op=range`).then(r => {
      if (!live) return
      if (!r.ok) { setErr(r.data?.error || 'Could not load.'); return }
      setD(r.data); writeCache(`res:range:${companyId}`, r.data)
    })
    return () => { live = false }
  }, [companyId])
  if (err) return <div className="ak-note bad">{err}</div>
  if (!d) return <Skeleton />
  const tz = d.timezone
  const byDay = new Map<string, Reservation[]>()
  for (const r of d.reservations as Reservation[]) {
    if (r.status === 'cancelled' || r.status === 'no_show') continue
    const k = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.startsAt))
    byDay.set(k, [...(byDay.get(k) || []), r])
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(d.from, i))
  if (!byDay.size) return (
    <div className="ak-panel rs-empty">
      <EmptyScroll title="Nothing booked yet" kinds={['plate', 'calendar', 'contact']} line="The next two weeks of reservations show here as they come in." />
    </div>
  )
  return (
    <div className="rs-groups">
      {days.filter(k => byDay.has(k)).map(k => {
        const list = byDay.get(k)!
        return (
          <section key={k} className="ak-panel flush">
            <div className="ak-panel-h">
              <button type="button" className="rs-dayh" onClick={() => onDay(k)}><h2>{dayLabel(k, d.today, true)}</h2></button>
              <span className="rs-count">{list.length} · {covers(list.reduce((n, r) => n + r.party, 0))}</span>
            </div>
            {list.map(r => <Row key={r.id} r={r} tz={tz} isToday={k === d.today} onOpen={onOpen} onQuick={() => onDay(k)} />)}
          </section>
        )
      })}
    </div>
  )
}

// ── Guests ─────────────────────────────────────────────────────────────────

function Guests({ companyId }: { companyId: string }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<any[] | null>(null)
  const [tz, setTz] = useState('Australia/Melbourne')
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await apiRaw(`/api/reservations?companyId=${companyId}&op=guests${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
      if (mine !== seq.current) return
      setList(r.ok ? r.data.guests || [] : [])
      if (r.data?.timezone) setTz(r.data.timezone)
    }, q ? 220 : 0)
    return () => clearTimeout(t)
  }, [companyId, q])
  return (
    <>
      <label className="rs-search">{Icon.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search guests by name, mobile or email" aria-label="Search guests" /></label>
      {list === null ? <Skeleton /> : !list.length ? (
        <div className="ak-panel rs-empty">
          <EmptyScroll title={q ? 'Nobody found' : 'No guests yet'} kinds={['contact', 'plate', 'calendar']}
            line={q ? `No guests match “${q.trim()}”.` : 'Everyone who books a table lands here, with their visits and no-shows.'} />
        </div>
      ) : (
        <div className="ak-panel flush">
          <div className="rs-gt" role="table" aria-label="Guests">
            <div className="rs-gr rs-gh" role="row"><span role="columnheader">Guest</span><span role="columnheader">Visits</span><span role="columnheader">No-shows</span><span role="columnheader">Last visit</span><span role="columnheader">Next</span></div>
            {list.map(g => (
              <Link key={g.id} href={`/admin/customers/profile?id=${g.id}`} className="rs-gr" role="row">
                <span role="cell" className="rs-gn"><b>{g.name}{g.vip && <span className="ak-tag violet" style={{ marginLeft: 6 }}>VIP</span>}</b><small>{[g.phone, g.email].filter(Boolean).join(' · ')}{g.allergies ? ` · ⚠︎ ${g.allergies}` : ''}</small></span>
                <span role="cell" className="jb-num">{g.visits}</span>
                <span role="cell" className={`jb-num${g.noShows ? ' rs-bad' : ''}`}>{g.noShows}</span>
                <span role="cell">{g.lastVisit ? fmtDay(g.lastVisit, tz) : '—'}</span>
                <span role="cell">{g.nextVisit ? fmtDay(g.nextVisit, tz) : '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const PAGE_CSS = `
.rs-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.rs-hide-sm{display:inline}
@media(max-width:600px){.ak-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ak-tile{padding:14px}.ak-tile-v{font-size:22px}}
@media(max-width:600px){.rs-hide-sm{display:none}.rs-bar{flex-direction:column;align-items:stretch}.rs-nav{justify-content:space-between}}
.rs-skel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.rs-skel div{height:92px;border-radius:20px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:jbSk 1.2s linear infinite}
.rs-skel .wide{grid-column:1/-1;height:120px}.rs-skel .tall{height:260px}
@media(max-width:700px){.rs-skel{grid-template-columns:repeat(2,minmax(0,1fr))}}
@keyframes jbSk{to{background-position:-200% 0}}
.rs-empty{padding:28px 20px 34px}
.rs-empty .es-title{font-size:16px}
.rs-empty .es-line{max-width:380px;font-size:13.5px}
.rs-strips{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px;margin-bottom:14px}
.rs-strip{margin:0!important;padding:16px 18px 12px!important}
.rs-strip figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}
.rs-strip figcaption b{font-size:14.5px;font-weight:700}
.rs-strip figcaption span{font-size:12.5px;color:var(--mut)}
.rs-plot{position:relative}
.rs-bars{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px}
.rs-b{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;cursor:default}
.rs-b i{display:block;width:100%;border-radius:4px 4px 0 0;background:color-mix(in srgb,var(--coral) 72%,var(--card,#fff));transition:background .12s}
.rs-b.on i{background:var(--coral)}
.rs-b.over i{background:#d97706}
.rs-cap{position:absolute;left:0;right:0;height:0;border-top:1.5px solid color-mix(in srgb,var(--ink) 35%,transparent);z-index:1;pointer-events:none}
.rs-cap span{position:absolute;right:0;bottom:2px;font-size:11px;font-weight:650;color:var(--mut);background:var(--card,#fff);padding:0 0 0 4px}
.rs-tip{position:absolute;bottom:calc(100% + 6px);transform:translateX(-50%);z-index:3;padding:5px 9px;border-radius:9px;background:var(--ink);color:var(--card,#fff);font-size:12px;font-weight:600;white-space:nowrap;pointer-events:none}
.rs-axis{display:flex;gap:2px;margin-top:6px;padding-top:4px;box-shadow:0 -1px 0 var(--line)}
.rs-axis span{flex:1;min-width:0;font-size:10.5px;color:var(--soft);white-space:nowrap;overflow:visible}
.rs-groups{display:flex;flex-direction:column}
.rs-row{display:flex;align-items:center;gap:14px;padding:12px 20px;cursor:pointer;color:var(--ink);transition:background .12s;outline:none}
.rs-row+.rs-row,.ak-panel-h+.rs-row{box-shadow:0 -1px 0 var(--line)}
.rs-row:hover,.rs-row:focus-visible{background:color-mix(in srgb,var(--f) 60%,transparent)}
.rs-row.s-completed,.rs-row.s-cancelled,.rs-row.s-no_show{opacity:.62}
.rs-time{width:62px;flex-shrink:0;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.rs-party{display:inline-flex;align-items:center;gap:4px;width:44px;flex-shrink:0;font-size:14px;font-weight:650;color:var(--mut);font-variant-numeric:tabular-nums}
.rs-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.rs-main b{font-size:14.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--mut);min-width:0}
.rs-meta .warn{color:#b45309;font-weight:600}
.rs-meta .ok{color:#15803d;font-weight:600}
.rs-main b.rs-name{display:flex;align-items:center;gap:8px;min-width:0}
.rs-ell{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-side{display:flex;align-items:center;gap:8px;flex-shrink:0}
.rs-side .ak-btn.sm{min-width:64px}
.s-seated .rs-time{color:#15803d}
.s-late .rs-time{color:#b91c1c}
@media(max-width:600px){.rs-row{flex-wrap:wrap;gap:6px 10px;padding:12px 16px}.rs-main{flex-basis:calc(100% - 120px)}.rs-side{width:100%;justify-content:flex-end}.rs-ell{max-width:200px}}
.rs-gone summary{list-style:none;cursor:pointer}
.rs-gone summary::-webkit-details-marker{display:none}
.rs-dayh{border:none;background:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.rs-dayh:hover h2{text-decoration:underline;text-underline-offset:3px}
.rs-search{display:flex;align-items:center;gap:8px;max-width:420px;height:42px;margin-bottom:14px;padding:0 14px;border-radius:999px;background:var(--f);color:var(--mut)}
.rs-search input{flex:1;min-width:0;border:none;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink)}
.rs-gt{display:flex;flex-direction:column}
.rs-gr{display:grid;grid-template-columns:minmax(0,2.4fr) 70px 80px minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding:12px 20px;color:var(--ink);text-decoration:none;font-size:14px}
.rs-gr+.rs-gr{box-shadow:0 -1px 0 var(--line)}
a.rs-gr:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.rs-gh{font-size:12px;font-weight:650;color:var(--soft);padding-top:14px;padding-bottom:10px}
.rs-gn{display:flex;flex-direction:column;gap:1px;min-width:0}
.rs-gn b{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-gn small{font-size:12.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-bad{color:#b45309;font-weight:650}
@media(max-width:700px){.rs-gr{grid-template-columns:minmax(0,1fr) 54px 64px}.rs-gr>span:nth-child(4),.rs-gr>span:nth-child(5){display:none}}
`
