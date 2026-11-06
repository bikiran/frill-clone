'use client'

// "New reservation" for the team (a phone booking, a regular asking at the
// door): party size, day, a time from the seating grid (full times are shown
// struck through and can still be booked, after a warning), the guest, and
// their requests. "Walk-in" seats a party now.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isTime, zonedToUtc } from '@/lib/booking-time'
import { apiRaw, Dialog, PartyStepper, Icon, addDays, dayLabel, dayShort, dayNum, timeOf, SEATING, RS_CSS, type Reservation } from '@/components/restaurant/shared'

type Slot = { start: string; period: string; ok: boolean; reason: 'full' | 'pace' | 'notice' | 'far' | null; coversLeft: number | null }
type Contact = { id: string; name: string | null; phone: string | null; email: string | null }

const OCCASIONS = ['Birthday', 'Anniversary', 'Date night', 'Business', 'Celebration']
const REASON: Record<string, string> = { full: 'Full', pace: 'Busy', notice: 'Soon', far: 'Far' }

function useContactSearch(companyId: string, term: string) {
  const [hits, setHits] = useState<Contact[]>([])
  useEffect(() => {
    const t = term.trim().replace(/[%,()]/g, ' ')
    if (t.length < 2) { setHits([]); return }
    let live = true
    const id = setTimeout(async () => {
      const { data } = await (supabase as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId)
        .or(`name.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`).limit(6)
      if (live) setHits(data || [])
    }, 200)
    return () => { live = false; clearTimeout(id) }
  }, [term, companyId])
  return hits
}

export default function NewReservation({ companyId, tz, today, date: initialDate, seatingOptions, onClose, onCreated }: {
  companyId: string; tz: string; today: string; date: string; seatingOptions: string[]
  onClose: () => void; onCreated: (r: Reservation) => void
}) {
  const [party, setParty] = useState(2)
  const [date, setDate] = useState(initialDate < today ? today : initialDate)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState<string | null>(null)
  const [otherTime, setOtherTime] = useState('')
  const [contact, setContact] = useState<Contact | null>(null)
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' })
  const [nameFocus, setNameFocus] = useState(false)
  const [seating, setSeating] = useState<string>('')
  const [occasion, setOccasion] = useState('')
  const [notes, setNotes] = useState('')
  const [internal, setInternal] = useState('')
  const [notify, setNotify] = useState(true)
  const [over, setOver] = useState<string>('')   // the "it's full" warning, once shown
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hits = useContactSearch(companyId, contact ? '' : guest.name || guest.phone)

  // Seating times for this party and day (team view: full ones marked).
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    setSlots(null)
    const t = setTimeout(async () => {
      const r = await apiRaw(`/api/reservations?companyId=${companyId}&op=slots&date=${date}&party=${party}`)
      if (mine !== seq.current) return
      if (!r.ok) { setErr(r.data?.error || 'Could not load the times.'); setSlots([]); return }
      setSlots(r.data.slots || []); setDuration(r.data.duration || 0)
    }, 120)
    return () => clearTimeout(t)
  }, [companyId, date, party])
  // A different party or day may change whether the chosen time fits.
  useEffect(() => { setOver('') }, [party, date, start, otherTime])

  const chosen = useMemo(() => {
    if (otherTime && isTime(otherTime)) return new Date(zonedToUtc(date, otherTime, tz)).toISOString()
    return start
  }, [start, otherTime, date, tz])
  const chosenSlot = slots?.find(s => s.start === chosen) || null
  const periods = useMemo(() => {
    const m: { name: string; slots: Slot[] }[] = []
    for (const s of slots || []) {
      const last = m[m.length - 1]
      if (last && last.name === s.period) last.slots.push(s); else m.push({ name: s.period, slots: [s] })
    }
    return m
  }, [slots])
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today])
  const canNotify = !!(contact?.phone || contact?.email || guest.phone.trim() || guest.email.trim())

  const save = async (force = false) => {
    setErr('')
    const name = (contact?.name || guest.name).trim()
    if (!chosen) { setErr('Pick a time.'); return }
    if (!name) { setErr('Add the guest’s name.'); return }
    if (!force && chosenSlot && !chosenSlot.ok && (chosenSlot.reason === 'full' || chosenSlot.reason === 'pace')) {
      setOver(chosenSlot.reason === 'pace'
        ? 'Lots of guests are already arriving around then. Book anyway?'
        : `That time is full${chosenSlot.coversLeft != null ? ` (${Math.max(0, chosenSlot.coversLeft)} seats left)` : ''}. Book anyway?`)
      return
    }
    setBusy(true)
    try {
      const r = await apiRaw('/api/reservations', {
        method: 'POST', json: {
          companyId, startsAt: chosen, party, name, contactId: contact?.id || null,
          phone: contact ? contact.phone : guest.phone, email: contact ? contact.email : guest.email,
          seating: seating || null, occasion, notes, internalNotes: internal, notify: canNotify && notify, force,
        },
      })
      if (r.ok) { onCreated(r.data.reservation); return }
      if (r.status === 409 && r.data?.full && !force) { setOver(`${r.data.error} Book anyway?`); return }
      setErr(r.data?.error || 'Could not make the reservation.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog title="New reservation" onClose={onClose} width={620} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      {over
        ? <button type="button" className="ak-btn dark" onClick={() => save(true)} disabled={busy}>{busy ? 'Booking…' : 'Book anyway'}</button>
        : <button type="button" className="ak-btn go" onClick={() => save(false)} disabled={busy}>{busy ? 'Booking…' : 'Book table'}</button>}
    </>}>
      <style>{RS_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label className="ak-label" htmlFor="nr-party">Guests</label>
          <PartyStepper id="nr-party" value={party} onChange={setParty} max={500} />
        </div>
        {duration > 0 && <p className="ak-hint" style={{ margin: '0 0 12px' }}>Table for {party} · {duration} min</p>}
      </div>

      <div>
        <span className="ak-label">Day</span>
        <div className="nr-days" role="group" aria-label="Day">
          {days.map(d => (
            <button key={d} type="button" className={`nr-day${d === date ? ' on' : ''}`} onClick={() => { setDate(d); setStart(null) }} aria-pressed={d === date} aria-label={dayLabel(d, today, true)}>
              <small>{d === today ? 'Today' : dayShort(d)}</small><b>{dayNum(d)}</b>
            </button>
          ))}
          <label className="nr-day nr-other" title="Another day">
            <small>Other</small>
            <input type="date" min={today} value={days.includes(date) ? '' : date} onChange={e => { if (e.target.value) { setDate(e.target.value); setStart(null) } }} aria-label="Another day" />
          </label>
        </div>
        {!days.includes(date) && <p className="ak-hint">{dayLabel(date, today, true)}</p>}
      </div>

      <div>
        <span className="ak-label">Time</span>
        {slots === null ? (
          <div className="rs-grid" aria-busy="true">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="nr-sk" />)}</div>
        ) : !slots.length ? (
          <p className="ak-hint" style={{ marginTop: 0 }}>No seating times on {dayLabel(date, today)} (closed, or outside your hours). Add a time below if you’re opening for this booking.</p>
        ) : (
          <div className="rs-slots">
            {periods.map(p => (
              <div key={p.name}>
                <h4>{p.name}</h4>
                <div className="rs-grid">
                  {p.slots.map(s => {
                    const on = !otherTime && start === s.start
                    return (
                      <button key={s.start} type="button" className={`rs-slot${on ? ' on' : !s.ok && (s.reason === 'full' || s.reason === 'pace') ? ' off' : ''}`}
                        onClick={() => { setStart(s.start); setOtherTime('') }} aria-pressed={on}
                        aria-label={`${timeOf(s.start, tz)}${!s.ok && s.reason ? `, ${REASON[s.reason] || ''}` : ''}`}>
                        <b>{timeOf(s.start, tz)}</b>
                        {!s.ok && (s.reason === 'full' || s.reason === 'pace') ? <small>{REASON[s.reason]}</small>
                          : s.coversLeft != null && s.coversLeft < 10 ? <small>{s.coversLeft} left</small> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <label className="ak-hint" htmlFor="nr-other" style={{ margin: 0 }}>Or another time</label>
          <input id="nr-other" type="time" className="ak-field" style={{ width: 130, height: 38 }} value={otherTime} onChange={e => setOtherTime(e.target.value)} />
        </div>
      </div>

      <div>
        <span className="ak-label">Guest</span>
        {contact ? (
          <div className="rs-picked">
            <div><b>{contact.name || contact.phone || contact.email}</b><span>{[contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone or email on file'}</span></div>
            <button type="button" className="ak-btn sm ghost" onClick={() => setContact(null)}>Change</button>
          </div>
        ) : (
          <div className="rs-two">
            <div style={{ position: 'relative', gridColumn: '1 / -1' }}>
              <input className="ak-field" value={guest.name} onChange={e => setGuest({ ...guest, name: e.target.value })} onFocus={() => setNameFocus(true)} onBlur={() => setTimeout(() => setNameFocus(false), 150)}
                placeholder="Name" aria-label="Guest name" maxLength={120} autoComplete="off" />
              {nameFocus && hits.length > 0 && (
                <div className="rs-hits" role="listbox" aria-label="Guests on file">
                  {hits.map(h => (
                    <button key={h.id} type="button" role="option" aria-selected="false" onMouseDown={e => e.preventDefault()} onClick={() => { setContact(h); setNameFocus(false) }}>
                      <b>{h.name || h.phone || h.email}</b><span>{[h.phone, h.email].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className="ak-field" value={guest.phone} onChange={e => setGuest({ ...guest, phone: e.target.value })} placeholder="Mobile" aria-label="Guest mobile" inputMode="tel" maxLength={40} />
            <input className="ak-field" value={guest.email} onChange={e => setGuest({ ...guest, email: e.target.value })} placeholder="Email (optional)" aria-label="Guest email" inputMode="email" maxLength={200} />
          </div>
        )}
      </div>

      {seatingOptions.length > 0 && (
        <div>
          <span className="ak-label">Seating</span>
          <div className="rs-chips">
            <button type="button" className={`rs-chip${!seating ? ' on' : ''}`} onClick={() => setSeating('')}>No preference</button>
            {seatingOptions.map(o => <button key={o} type="button" className={`rs-chip${seating === o ? ' on' : ''}`} onClick={() => setSeating(o)}>{SEATING[o] || o}</button>)}
          </div>
        </div>
      )}

      <div>
        <label className="ak-label" htmlFor="nr-occ">Occasion</label>
        <input id="nr-occ" className="ak-field" value={occasion} onChange={e => setOccasion(e.target.value)} maxLength={80} placeholder="Optional" list="nr-occasions" />
        <datalist id="nr-occasions">{OCCASIONS.map(o => <option key={o} value={o} />)}</datalist>
      </div>

      <div className="rs-two">
        <div>
          <label className="ak-label" htmlFor="nr-notes">Guest’s requests</label>
          <textarea id="nr-notes" className="ak-field" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="High chair, allergies, a quiet table…" />
        </div>
        <div>
          <label className="ak-label" htmlFor="nr-int">Team notes</label>
          <textarea id="nr-int" className="ak-field" value={internal} onChange={e => setInternal(e.target.value)} maxLength={1000} placeholder="Only the team sees these" />
        </div>
      </div>

      <label className="rs-check" style={{ opacity: canNotify ? 1 : 0.5 }}>
        <input type="checkbox" checked={canNotify && notify} disabled={!canNotify} onChange={e => setNotify(e.target.checked)} />
        <span>Send the guest a confirmation{canNotify ? '' : ' (add a mobile or email)'}</span>
      </label>

      {over && <div className="rs-warn" role="alert">{Icon.warn}<span>{over}</span></div>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <style>{`
        .nr-days{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 6px;margin:0 -2px;scrollbar-width:thin}
        .nr-day{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;flex:0 0 54px;height:58px;border:none;border-radius:16px;background:var(--f);font:inherit;color:var(--ink);cursor:pointer;transition:background .15s}
        .nr-day small{font-size:11px;font-weight:650;color:var(--soft)}
        .nr-day b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
        .nr-day:hover{background:var(--f2)}
        .nr-day.on{background:var(--ink);color:var(--card,#fff)}
        .nr-day.on small{color:color-mix(in srgb,var(--card,#fff) 70%,transparent)}
        .nr-other input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
        .nr-other::after{content:'';width:16px;height:16px;margin-top:2px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 3v4M8 3v4M3 10h18'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 3v4M8 3v4M3 10h18'/%3E%3C/svg%3E") center/contain no-repeat}
        .nr-sk{height:48px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:jbSk 1.2s linear infinite}
        @keyframes jbSk{to{background-position:-200% 0}}
      `}</style>
    </Dialog>
  )
}

/** Seat a party that's just walked in (now, for the usual time). */
export function WalkIn({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: (r: Reservation) => void }) {
  const [party, setParty] = useState(2)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [over, setOver] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setOver('') }, [party])
  const save = async (force = false) => {
    setErr(''); setBusy(true)
    try {
      const r = await apiRaw('/api/reservations', { method: 'POST', json: { companyId, walkIn: true, party, name: name.trim() || 'Walk-in', phone, notes, force } })
      if (r.ok) { onCreated(r.data.reservation); return }
      if (r.status === 409 && r.data?.full && !force) { setOver(`${r.data.error} Seat them anyway?`); return }
      setErr(r.data?.error || 'Could not seat the walk-in.')
    } finally { setBusy(false) }
  }
  return (
    <Dialog title="Walk-in" onClose={onClose} width={440} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      {over
        ? <button type="button" className="ak-btn dark" onClick={() => save(true)} disabled={busy}>{busy ? 'Seating…' : 'Seat anyway'}</button>
        : <button type="button" className="ak-btn go" onClick={() => save(false)} disabled={busy}>{busy ? 'Seating…' : 'Seat now'}</button>}
    </>}>
      <style>{RS_CSS}</style>
      <div>
        <label className="ak-label" htmlFor="wi-party">Guests</label>
        <PartyStepper id="wi-party" value={party} onChange={setParty} />
      </div>
      <div className="rs-two">
        <input className="ak-field" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" maxLength={120} />
        <input className="ak-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile (optional)" aria-label="Mobile" inputMode="tel" maxLength={40} />
      </div>
      <textarea className="ak-field" style={{ minHeight: 70 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" maxLength={1000} />
      <p className="ak-hint" style={{ margin: 0 }}>They’re seated straight away and counted in the covers until you finish their table.</p>
      {over && <div className="rs-warn" role="alert">{Icon.warn}<span>{over}</span></div>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
    </Dialog>
  )
}
