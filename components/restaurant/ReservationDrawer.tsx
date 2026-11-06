'use client'

// One reservation, in a sheet beside the day: what to do next (seat, finish,
// no-show, undo), move it (time and party size), cancel it, edit the details,
// and the guest's history and profile (VIP, allergies, birthday), which follow
// them to every visit.

import { useEffect, useMemo, useRef, useState } from 'react'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useRefundAccess, RefundPinField, RefundNotAllowed, isPinError } from '@/components/RefundPin'
import {
  apiRaw, Icon, PartyStepper, PeopleIcon, StateTag, TableChip, TablePicker, money, tablesText, addDays, dayLabel, dayShort, dayNum, timeOf, fmtDay, dayKeyIn, SEATING, SOURCE, RS_CSS, type Reservation,
} from '@/components/restaurant/shared'

type Guest = { guest: { id: string; name: string; phone: string; email: string; profile: any; birthday: string | null }; stats: any; reservations: Reservation[] }
type Slot = { start: string; period: string; ok: boolean; reason: string | null; coversLeft: number | null }

export default function ReservationDrawer({ companyId, tz, today, res, seatingOptions, useTables, onClose, onChange, toast }: {
  companyId: string; tz: string; today: string; res: Reservation; seatingOptions: string[]; useTables?: boolean
  onClose: () => void; onChange: (r: Reservation) => void; toast: (m: string) => void
}) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'view' | 'move' | 'edit' | 'table' | 'cancel'>('view')
  const [guest, setGuest] = useState<Guest | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  useEffect(() => { setMode('view'); setErr(''); panel.current?.focus() }, [res.id])
  useEffect(() => {
    setGuest(null)
    if (!res.contactId) return
    let live = true
    apiRaw(`/api/reservations?companyId=${companyId}&op=guest&contactId=${res.contactId}`).then(r => { if (live && r.ok) setGuest(r.data) })
    return () => { live = false }
  }, [companyId, res.contactId, res.id])

  const act = async (action: string, extra: any = {}, done?: string) => {
    setErr(''); setBusy(action)
    try {
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action, ...extra } })
      if (!r.ok) { setErr(r.data?.error || 'That didn’t work. Please try again.'); return r }
      onChange(r.data.reservation)
      if (done) toast(done)
      return r
    } finally { setBusy('') }
  }
  const cancel = async () => {
    // A paid deposit: choose whether to give it back (a refund, so the refund PIN applies).
    if (res.deposit?.status === 'paid') { setMode('cancel'); return }
    const ok = await confirmDialog({ title: `Cancel ${res.name}’s table?`, message: `${dayLabel(dayKeyIn(res.startsAt, tz), today, true)} at ${timeOf(res.startsAt, tz)} for ${res.party}. ${res.phone || res.email ? 'We’ll let them know.' : ''}`, confirmLabel: 'Cancel reservation', cancelLabel: 'Keep it', tone: 'danger' })
    if (ok) await act('cancel', { notify: true }, 'Reservation cancelled')
  }

  const day = dayKeyIn(res.startsAt, tz)
  const live = res.status === 'confirmed' || res.status === 'pending'
  const started = Date.parse(res.startsAt) <= Date.now()
  const undoable = (res.status === 'completed' || res.status === 'no_show') && Date.parse(res.startsAt) > Date.now() - 24 * 3600e3

  return (
    <div className="rd-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="rd" role="dialog" aria-modal="true" aria-label={`Reservation: ${res.name}`} ref={panel} tabIndex={-1}>
        <style>{RS_CSS + RD_CSS}</style>
        <header className="rd-h">
          <div style={{ minWidth: 0 }}>
            <div className="rd-tags"><StateTag state={res.state} />{guest?.guest.profile?.vip && <span className="ak-tag violet">VIP</span>}{res.source && <span className="ak-tag">{SOURCE[res.source] || res.source}</span>}</div>
            <h2>{res.name || 'Guest'}</h2>
            <p className="rd-when"><b>{timeOf(res.startsAt, tz)}</b> · {dayLabel(day, today, true)} · <PeopleIcon /> {res.party}</p>
          </div>
          <button type="button" className="ak-icon-btn" onClick={onClose} aria-label="Close">{Icon.x}</button>
        </header>

        <div className="rd-b">
          {mode === 'view' && (
            <>
              <div className="rd-acts">
                {live && !res.seatedAt && <button type="button" className="ak-btn go" disabled={!!busy} onClick={() => act('seat', {}, `${res.name} seated`)}>{Icon.check}{busy === 'seat' ? 'Seating…' : 'Seat'}</button>}
                {live && res.seatedAt && <button type="button" className="ak-btn go" disabled={!!busy} onClick={() => act('complete', {}, 'Table finished')}>{Icon.check}{busy === 'complete' ? 'Finishing…' : 'Finish table'}</button>}
                {live && res.seatedAt && <button type="button" className="ak-btn" disabled={!!busy} onClick={() => act('unseat')}>Not seated yet</button>}
                {live && !res.seatedAt && started && <button type="button" className="ak-btn" disabled={!!busy} onClick={() => act('no_show', {}, 'Marked as a no-show')}>No-show</button>}
                {live && <button type="button" className="ak-btn" disabled={!!busy} onClick={() => setMode('move')}>Move</button>}
                {undoable && <button type="button" className="ak-btn" disabled={!!busy} onClick={() => act('undo', {}, 'Back to booked')}>Undo {res.status === 'no_show' ? 'no-show' : 'finish'}</button>}
              </div>
              {err && <div className="ak-note bad" role="alert">{err}</div>}

              <section className="rd-sec">
                <dl className="rd-kv">
                  {res.seatedAt && <><dt>Seated</dt><dd>{timeOf(res.seatedAt, tz)}</dd></>}
                  <dt>Until</dt><dd>{timeOf(res.endsAt, tz)}</dd>
                  {(useTables || !!res.tables?.length) && (live || !!res.tables?.length) && <><dt>Table</dt><dd className="rd-table">
                    {res.tables?.length ? <TableChip tables={res.tables} /> : <span className="rd-muted">None yet</span>}
                    {live && useTables && <button type="button" className="ak-btn sm ghost" onClick={() => setMode('table')}>{res.tables?.length ? 'Change' : 'Choose'}</button>}
                  </dd></>}
                  {res.deposit && <><dt>Deposit</dt><dd>{money(res.deposit.cents)} · {res.deposit.status === 'paid' ? 'paid' : res.deposit.status === 'refunded' ? 'refunded' : res.deposit.status === 'partially_refunded' ? 'partly refunded' : 'not paid yet'}</dd></>}
                  {res.seating && <><dt>Seating</dt><dd>{SEATING[res.seating] || res.seating}</dd></>}
                  {res.occasion && <><dt>Occasion</dt><dd>{res.occasion}</dd></>}
                  {res.phone && <><dt>Mobile</dt><dd><a href={`tel:${res.phone}`}>{res.phone}</a></dd></>}
                  {res.email && <><dt>Email</dt><dd><a href={`mailto:${res.email}`}>{res.email}</a></dd></>}
                  {res.confirmedByGuest && <><dt>Confirmed</dt><dd>The guest confirmed</dd></>}
                  {res.cancelReason && <><dt>Reason</dt><dd>{res.cancelReason}</dd></>}
                </dl>
                {res.notes && <div className="rd-note"><b>Guest’s requests</b><p>{res.notes}</p></div>}
                {res.internalNotes && <div className="rd-note team"><b>Team notes</b><p>{res.internalNotes}</p></div>}
                <div className="rd-links">
                  {res.status !== 'cancelled' && <button type="button" className="ak-btn sm ghost" onClick={() => setMode('edit')}>{Icon.pen}Edit details</button>}
                  {res.conversationId && <a className="ak-btn sm ghost" href={`/admin/inbox?conversation=${res.conversationId}`}>Open conversation</a>}
                  {res.manageUrl && live && <button type="button" className="ak-btn sm ghost" onClick={() => navigator.clipboard?.writeText(res.manageUrl!).then(() => toast('Guest’s change link copied')).catch(() => {})}>{Icon.link}Copy guest link</button>}
                </div>
              </section>

              {res.contactId && <GuestCard companyId={companyId} tz={tz} res={res} data={guest} onSaved={g => { setGuest(g); toast('Guest profile saved') }} />}

              {live && <button type="button" className="rd-cancel" onClick={cancel} disabled={!!busy}>Cancel reservation</button>}
            </>
          )}
          {mode === 'move' && <MoveForm companyId={companyId} tz={tz} today={today} res={res} onBack={() => setMode('view')} onMoved={r => { onChange(r); setMode('view'); toast('Reservation moved') }} />}
          {mode === 'table' && <TableForm companyId={companyId} res={res} onBack={() => setMode('view')} onSaved={(r, noTable) => { onChange(r); setMode('view'); toast(noTable ? 'No table is free for them then' : r.tables?.length ? `${tablesText(r.tables)} for ${r.name}` : 'Table taken off') }} />}
          {mode === 'cancel' && <CancelForm companyId={companyId} res={res} onBack={() => setMode('view')} onCancelled={(r, msg) => { onChange(r); setMode('view'); toast(msg) }} />}
          {mode === 'edit' && <EditForm companyId={companyId} res={res} seatingOptions={seatingOptions} onBack={() => setMode('view')} onSaved={r => { onChange(r); setMode('view'); toast('Saved') }} />}
        </div>
      </aside>
    </div>
  )
}

function GuestCard({ companyId, tz, res, data, onSaved }: { companyId: string; tz: string; res: Reservation; data: Guest | null; onSaved: (g: Guest) => void }) {
  const [edit, setEdit] = useState(false)
  const [p, setP] = useState({ vip: false, allergies: '', notes: '', birthday: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!data) return
    setP({ vip: !!data.guest.profile?.vip, allergies: data.guest.profile?.allergies || '', notes: data.guest.profile?.notes || '', birthday: data.guest.birthday || '' })
  }, [data])
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action: 'update', profile: { vip: p.vip, allergies: p.allergies, notes: p.notes, seating_pref: data?.guest.profile?.seating_pref || null }, birthday: p.birthday || null } })
      if (!r.ok) { setErr(r.data?.error || 'Could not save.'); return }
      if (data) onSaved({ ...data, guest: { ...data.guest, profile: { ...data.guest.profile, vip: p.vip, allergies: p.allergies, notes: p.notes }, birthday: p.birthday || null } })
      setEdit(false)
    } finally { setBusy(false) }
  }
  if (!data) return <section className="rd-sec"><h3>Guest</h3><div className="rd-sk" /></section>
  const s = data.stats || {}
  const past = data.reservations.filter(r => r.id !== res.id).slice(0, 4)
  return (
    <section className="rd-sec">
      <div className="rd-sec-h"><h3>Guest</h3>{!edit && <button type="button" className="ak-btn sm ghost" onClick={() => setEdit(true)}>Edit profile</button>}</div>
      <div className="rd-stats">
        <div><b>{s.visits || 0}</b><span>{s.visits === 1 ? 'visit' : 'visits'}</span></div>
        <div><b>{s.noShows || 0}</b><span>{s.noShows === 1 ? 'no-show' : 'no-shows'}</span></div>
        <div><b>{s.lastVisit ? fmtDay(s.lastVisit, tz) : '—'}</b><span>last visit</span></div>
      </div>
      {!edit ? (
        <>
          {(data.guest.profile?.allergies || data.guest.birthday || data.guest.profile?.notes) ? (
            <dl className="rd-kv">
              {data.guest.profile?.allergies && <><dt>Allergies</dt><dd className="rd-alert">{data.guest.profile.allergies}</dd></>}
              {data.guest.birthday && <><dt>Birthday</dt><dd>{new Date(`${data.guest.birthday}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</dd></>}
              {data.guest.profile?.notes && <><dt>Notes</dt><dd>{data.guest.profile.notes}</dd></>}
            </dl>
          ) : <p className="ak-hint" style={{ margin: 0 }}>Add allergies, a birthday or notes and they’ll show on every visit.</p>}
          {past.length > 0 && (
            <ul className="rd-past">
              {past.map(r => <li key={r.id}><span>{fmtDay(r.startsAt, tz)} · {r.party}</span><StateTag state={r.state} /></li>)}
            </ul>
          )}
        </>
      ) : (
        <div className="rd-form">
          <label className="rs-check"><input type="checkbox" checked={p.vip} onChange={e => setP({ ...p, vip: e.target.checked })} /><span>VIP</span></label>
          <div><label className="ak-label" htmlFor="rd-all">Allergies and dietary needs</label><input id="rd-all" className="ak-field" value={p.allergies} onChange={e => setP({ ...p, allergies: e.target.value })} maxLength={300} placeholder="e.g. Coeliac, no shellfish" /></div>
          <div><label className="ak-label" htmlFor="rd-bd">Birthday</label><input id="rd-bd" type="date" className="ak-field" value={p.birthday} onChange={e => setP({ ...p, birthday: e.target.value })} /></div>
          <div><label className="ak-label" htmlFor="rd-gn">Notes about this guest</label><textarea id="rd-gn" className="ak-field" style={{ minHeight: 70 }} value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })} maxLength={1000} placeholder="Likes the window table, regular on Fridays…" /></div>
          {err && <div className="ak-note bad" role="alert">{err}</div>}
          <div className="rd-form-f"><button type="button" className="ak-btn ghost" onClick={() => setEdit(false)}>Cancel</button><button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
        </div>
      )}
    </section>
  )
}

function TableForm({ companyId, res, onBack, onSaved }: { companyId: string; res: Reservation; onBack: () => void; onSaved: (r: Reservation, noTable: boolean) => void }) {
  const current = (res.tables || []).map(t => t.id)
  const [value, setValue] = useState<string[] | null>(current.length ? current : null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action: 'assign', tables: value } })
      if (!r.ok) { setErr(r.data?.error || 'Could not change the table.'); return }
      onSaved(r.data.reservation, !!r.data.noTable && value === null)
    } finally { setBusy(false) }
  }
  return (
    <div className="rd-form">
      <h3 style={{ margin: 0 }}>Table for {res.party}</h3>
      <TablePicker companyId={companyId} at={res.startsAt} party={res.party} excludeId={res.id} value={value} onChange={setValue} allowNone currentIds={current} />
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <div className="rd-form-f"><button type="button" className="ak-btn ghost" onClick={onBack}>Back</button><button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save table'}</button></div>
    </div>
  )
}

/** Cancelling a reservation with a paid deposit: refund it or keep it. */
function CancelForm({ companyId, res, onBack, onCancelled }: { companyId: string; res: Reservation; onBack: () => void; onCancelled: (r: Reservation, msg: string) => void }) {
  const access = useRefundAccess(companyId)
  const [refund, setRefund] = useState(true)
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cents = res.deposit?.cents || 0
  const canRefund = access.canRefund && !access.locked
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const giveBack = refund && canRefund
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action: 'cancel', notify: true, reason, refund: giveBack, ...(giveBack && pin ? { refundPin: pin } : {}) } })
      if (!r.ok) { if (isPinError(r.data?.code)) setPin(''); setErr(r.data?.error || 'Could not cancel.'); return }
      onCancelled(r.data.reservation, r.data.refundError ? `Cancelled. The refund didn’t go through: ${r.data.refundError}` : r.data.refunded ? `Cancelled and ${money(r.data.refunded)} refunded` : 'Reservation cancelled, deposit kept')
    } finally { setBusy(false) }
  }
  return (
    <div className="rd-form">
      <h3 style={{ margin: 0 }}>Cancel {res.name}’s table?</h3>
      <p className="ak-hint" style={{ margin: 0 }}>They paid a {money(cents)} deposit. {res.phone || res.email ? 'We’ll let them know it’s cancelled.' : ''}</p>
      {canRefund ? (
        <label className="rs-check"><input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} /><span>Refund the {money(cents)} deposit to their card</span></label>
      ) : access.loading ? null : !access.canRefund ? <RefundNotAllowed /> : <p className="ak-hint" style={{ margin: 0, color: '#b45309' }}>Refunds are locked for a while after wrong PINs. Cancel now and refund later from Payments, or try again soon.</p>}
      {refund && canRefund && access.pinSet && <RefundPinField value={pin} onChange={setPin} id="rd-pin" />}
      <div><label className="ak-label" htmlFor="rd-why">Reason (optional)</label><input id="rd-why" className="ak-field" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="e.g. They called to cancel" /></div>
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <div className="rd-form-f"><button type="button" className="ak-btn ghost" onClick={onBack}>Keep it</button><button type="button" className="ak-btn dark" onClick={go} disabled={busy || (refund && canRefund && access.pinSet && pin.length < 4)}>{busy ? 'Cancelling…' : refund && canRefund ? 'Cancel and refund' : 'Cancel, keep deposit'}</button></div>
    </div>
  )
}

function MoveForm({ companyId, tz, today, res, onBack, onMoved }: { companyId: string; tz: string; today: string; res: Reservation; onBack: () => void; onMoved: (r: Reservation) => void }) {
  const [party, setParty] = useState(res.party)
  const [date, setDate] = useState(dayKeyIn(res.startsAt, tz))
  const [start, setStart] = useState<string>(res.startsAt)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [notify, setNotify] = useState(true)
  const [over, setOver] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    setSlots(null)
    apiRaw(`/api/reservations?companyId=${companyId}&op=slots&date=${date}&party=${party}&exclude=${res.id}`).then(r => {
      if (mine !== seq.current) return
      setSlots(r.ok ? r.data.slots || [] : [])
    })
  }, [companyId, date, party, res.id])
  useEffect(() => { setOver('') }, [party, date, start])
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today])
  const chosen = slots?.find(s => s.start === start)
  const same = start === res.startsAt && party === res.party
  const save = async (force = false) => {
    setErr('')
    if (!force && chosen && !chosen.ok && (chosen.reason === 'full' || chosen.reason === 'pace')) { setOver('That time is full. Move them anyway?'); return }
    setBusy(true)
    try {
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action: 'move', startsAt: start, party, force, notify } })
      if (r.ok) { onMoved(r.data.reservation); return }
      if (r.status === 409 && r.data?.full && !force) { setOver(`${r.data.error} Move them anyway?`); return }
      setErr(r.data?.error || 'Could not move the reservation.')
    } finally { setBusy(false) }
  }
  return (
    <div className="rd-form">
      <button type="button" className="rd-back" onClick={onBack}>‹ Back</button>
      <h3 style={{ margin: 0 }}>Move or change party size</h3>
      <div><span className="ak-label">Guests</span><PartyStepper value={party} onChange={setParty} /></div>
      <div>
        <span className="ak-label">Day</span>
        <div className="rd-days">
          {days.map(d => <button key={d} type="button" className={`rd-day${d === date ? ' on' : ''}`} onClick={() => setDate(d)} aria-pressed={d === date} aria-label={dayLabel(d, today, true)}><small>{d === today ? 'Today' : dayShort(d)}</small><b>{dayNum(d)}</b></button>)}
        </div>
      </div>
      <div>
        <span className="ak-label">Time</span>
        {slots === null ? <div className="rd-sk" /> : !slots.length ? <p className="ak-hint" style={{ margin: 0 }}>No seating times that day.</p> : (
          <div className="rs-grid">
            {slots.map(s => (
              <button key={s.start} type="button" className={`rs-slot${s.start === start ? ' on' : !s.ok && (s.reason === 'full' || s.reason === 'pace') ? ' off' : ''}`} onClick={() => setStart(s.start)} aria-pressed={s.start === start}>
                <b>{timeOf(s.start, tz)}</b>{!s.ok && (s.reason === 'full' || s.reason === 'pace') && <small>Full</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      {(res.phone || res.email) && <label className="rs-check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /><span>Let the guest know</span></label>}
      {over && <div className="rs-warn" role="alert">{Icon.warn}<span>{over}</span></div>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <div className="rd-form-f">
        <button type="button" className="ak-btn ghost" onClick={onBack}>Cancel</button>
        {over ? <button type="button" className="ak-btn dark" onClick={() => save(true)} disabled={busy}>{busy ? 'Moving…' : 'Move anyway'}</button>
          : <button type="button" className="ak-btn go" onClick={() => save(false)} disabled={busy || same}>{busy ? 'Moving…' : 'Move reservation'}</button>}
      </div>
    </div>
  )
}

function EditForm({ companyId, res, seatingOptions, onBack, onSaved }: { companyId: string; res: Reservation; seatingOptions: string[]; onBack: () => void; onSaved: (r: Reservation) => void }) {
  const [f, setF] = useState({ name: res.name, phone: res.phone, email: res.email, notes: res.notes, internalNotes: res.internalNotes, seating: res.seating || '', occasion: res.occasion })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiRaw('/api/reservations', { method: 'PATCH', json: { companyId, id: res.id, action: 'update', ...f, seating: f.seating || null } })
      if (r.ok) onSaved(r.data.reservation); else setErr(r.data?.error || 'Could not save.')
    } finally { setBusy(false) }
  }
  return (
    <div className="rd-form">
      <button type="button" className="rd-back" onClick={onBack}>‹ Back</button>
      <h3 style={{ margin: 0 }}>Edit details</h3>
      <div><label className="ak-label" htmlFor="re-name">Name</label><input id="re-name" className="ak-field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} /></div>
      <div className="rs-two">
        <div><label className="ak-label" htmlFor="re-ph">Mobile</label><input id="re-ph" className="ak-field" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} inputMode="tel" maxLength={40} /></div>
        <div><label className="ak-label" htmlFor="re-em">Email</label><input id="re-em" className="ak-field" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} inputMode="email" maxLength={200} /></div>
      </div>
      {(seatingOptions.length > 0 || f.seating) && (
        <div>
          <span className="ak-label">Seating</span>
          <div className="rs-chips">
            <button type="button" className={`rs-chip${!f.seating ? ' on' : ''}`} onClick={() => setF({ ...f, seating: '' })}>No preference</button>
            {Array.from(new Set([...seatingOptions, ...(f.seating ? [f.seating] : [])])).map(o => <button key={o} type="button" className={`rs-chip${f.seating === o ? ' on' : ''}`} onClick={() => setF({ ...f, seating: o })}>{SEATING[o] || o}</button>)}
          </div>
        </div>
      )}
      <div><label className="ak-label" htmlFor="re-occ">Occasion</label><input id="re-occ" className="ak-field" value={f.occasion} onChange={e => setF({ ...f, occasion: e.target.value })} maxLength={80} /></div>
      <div><label className="ak-label" htmlFor="re-notes">Guest’s requests</label><textarea id="re-notes" className="ak-field" style={{ minHeight: 70 }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={1000} /></div>
      <div><label className="ak-label" htmlFor="re-int">Team notes</label><textarea id="re-int" className="ak-field" style={{ minHeight: 70 }} value={f.internalNotes} onChange={e => setF({ ...f, internalNotes: e.target.value })} maxLength={1000} /></div>
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <div className="rd-form-f"><button type="button" className="ak-btn ghost" onClick={onBack}>Cancel</button><button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </div>
  )
}

const RD_CSS = `
.rd-table{display:flex;align-items:center;gap:8px}
.rd-muted{color:var(--soft)}
.rd-ov{position:fixed;inset:0;z-index:900;display:flex;justify-content:flex-end;background:rgba(15,15,20,.22);animation:jbFade .18s ease both}
.rd{--f:#f4f4f5;--f2:#ececef;--line:#ececee;--mut:#71717a;--soft:#8e8e93;width:min(440px,100%);height:100%;display:flex;flex-direction:column;background:var(--card,#fff);color:var(--ink);box-shadow:-20px 0 60px rgba(0,0,0,.16);outline:none;animation:rdIn .34s cubic-bezier(.22,1,.36,1) both}
[data-theme="dark"] .rd{--f:#2a2a2e;--f2:#333337;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
@keyframes rdIn{from{transform:translate3d(24px,0,0);opacity:0}to{transform:none;opacity:1}}
@keyframes jbFade{from{opacity:0}to{opacity:1}}
.rd-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 12px;box-shadow:0 1px 0 var(--line)}
.rd-h h2{margin:6px 0 2px;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;overflow-wrap:anywhere}
.rd-tags{display:flex;flex-wrap:wrap;gap:5px}
.rd-when{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:0;font-size:14px;color:var(--mut)}
.rd-when b{color:var(--ink);font-variant-numeric:tabular-nums}
.rd-b{flex:1;overflow-y:auto;padding:16px 20px 28px;display:flex;flex-direction:column;gap:16px}
.rd-acts{display:flex;flex-wrap:wrap;gap:8px}
.rd-sec{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:20px;background:var(--f)}
.rd-sec h3,.rd-form h3{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em}
.rd-sec-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.rd-sec .ak-field{background:var(--card,#fff)}
.rd-kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 12px;margin:0;font-size:14px}
.rd-kv dt{color:var(--mut)}
.rd-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.rd-kv a{color:var(--ink)}
.rd-alert{font-weight:650;color:#b91c1c}
.rd-note{padding:11px 13px;border-radius:14px;background:var(--card,#fff);font-size:14px}
.rd-note b{display:block;font-size:12px;font-weight:700;color:var(--mut);margin-bottom:3px}
.rd-note p{margin:0;white-space:pre-wrap;line-height:1.5}
.rd-note.team{box-shadow:inset 3px 0 0 #f59e0b}
.rd-links{display:flex;flex-wrap:wrap;gap:6px}
.rd-links .ak-btn{background:var(--card,#fff);text-decoration:none}
.rd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rd-stats div{display:flex;flex-direction:column;gap:1px;padding:10px 12px;border-radius:14px;background:var(--card,#fff);min-width:0}
.rd-stats b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-stats span{font-size:12px;color:var(--mut)}
.rd-past{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rd-past li{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px;color:var(--mut)}
.rd-form{display:flex;flex-direction:column;gap:14px}
.rd-form .ak-field{width:100%;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid transparent;background-color:var(--f);outline:none;font:inherit;font-size:14.5px;color:var(--ink);box-sizing:border-box}
.rd-sec .rd-form .ak-field{background-color:var(--card,#fff)}
.rd-form textarea.ak-field{height:auto;padding:11px 14px;line-height:1.5;resize:vertical}
.rd-form .ak-label{display:block;margin:0 0 7px;font-size:13px;font-weight:650}
.rd-form-f{display:flex;justify-content:flex-end;gap:8px}
.rd-back{align-self:flex-start;border:none;background:none;padding:0;font:inherit;font-size:13.5px;font-weight:650;color:var(--mut);cursor:pointer}
.rd-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.rd-day{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 50px;height:54px;border:none;border-radius:14px;background:var(--f);font:inherit;color:var(--ink);cursor:pointer}
.rd-day small{font-size:11px;font-weight:650;color:var(--soft)}
.rd-day b{font-size:16px;font-weight:700}
.rd-day.on{background:var(--ink);color:var(--card,#fff)}
.rd-day.on small{color:color-mix(in srgb,var(--card,#fff) 70%,transparent)}
.rd-sk{height:52px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:rdSk 1.2s linear infinite}
.rd-sec .rd-sk{background:linear-gradient(90deg,var(--card,#fff) 25%,var(--f2) 50%,var(--card,#fff) 75%);background-size:200% 100%}
@keyframes rdSk{to{background-position:-200% 0}}
.rd-cancel{align-self:flex-start;border:none;background:none;padding:4px 0;font:inherit;font-size:14px;font-weight:650;color:#b91c1c;cursor:pointer}
.rd-cancel:disabled{opacity:.5}
@media(max-width:600px){.rd-ov{align-items:flex-end}.rd{width:100%;height:auto;max-height:92dvh;border-radius:24px 24px 0 0;animation-name:rdUp}}
@keyframes rdUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
`
