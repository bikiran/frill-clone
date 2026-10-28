'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { api, card, btn, btnGhost, input, label, hint } from './shared'
import { ClockIcon, ChatIcon, WarnIcon, GearIcon, CalendarIcon, CheckIcon } from '@/components/booking/icons'
import EmptyScroll from '@/components/EmptyScroll'

// Bookings → Waitlist: who's waiting for which service and days, what they've
// been offered, and offering a free time by hand. lib/booking-waitlist.ts.

type Offer = { id: string; slot_start: string; status: string; channel: string | null; sent_at: string | null; mode: string; booking_id: string | null; error: string | null }
type Entry = {
  id: string; service_id: string; customer_name: string; customer_phone: string; customer_email: string | null
  conversation_id: string | null; days: string[] | null; date_from: string; date_to: string; time_window: string
  status: string; created_at: string; offers_count: number; last_offered_at: string | null; wants: string; source: string; offers: Offer[]
}

const STATUS: Record<string, { label: string; bg: string; c: string }> = {
  waiting: { label: 'Waiting', bg: '#fffbeb', c: '#b45309' },
  offered: { label: 'Offered', bg: '#eff6ff', c: '#1d4ed8' },
  booked: { label: 'Booked', bg: '#ecfdf5', c: '#047857' },
  expired: { label: 'Expired', bg: '#f3f4f6', c: '#6b7280' },
  removed: { label: 'Removed', bg: '#f3f4f6', c: '#6b7280' },
}
const OFFER: Record<string, string> = { sent: 'Offered', sending: 'Sending', claimed: 'Booked it', gone: 'Taken by someone else', expired: 'Lapsed', failed: 'Couldn’t send', skipped: 'Skipped (replied STOP)' }
const FILTERS: [string, string][] = [['live', 'Waiting'], ['booked', 'Booked'], ['expired', 'Expired'], ['removed', 'Removed'], ['all', 'All']]

export default function WaitlistTab({ companyId, services, timezone, enabled, onGoSettings, flash }: {
  companyId: string; services: any[]; timezone: string; enabled: boolean; onGoSettings: () => void; flash: (m: string) => void
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [hintMsg, setHintMsg] = useState('')
  const [status, setStatus] = useState('live')
  const [serviceId, setServiceId] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState('')
  const flashRef = useRef(flash)
  flashRef.current = flash

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/bookings/waitlist?companyId=${companyId}&status=${status}${serviceId ? `&serviceId=${serviceId}` : ''}`)
      setEntries(d.entries || []); setHintMsg(d.setupNeeded ? d.hint : '')
    } catch (e: any) { setEntries([]); flashRef.current(e.message) }
  }, [companyId, status, serviceId])
  useEffect(() => { load() }, [load])

  const svcName = (id: string) => services.find(s => s.id === id)?.name || 'Service'
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm')
  const joined = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })

  // Waiting for this day? (specific days, or a range that covers it)
  const wantsDay = (e: Entry, d: string) => e.days?.length ? e.days.includes(d) : d >= String(e.date_from).slice(0, 10) && d <= String(e.date_to).slice(0, 10)
  const groups = useMemo(() => {
    const list = (entries || []).filter(e => !day || wantsDay(e, day))
    // Queue order (longest waiting first) inside each service.
    const m = new Map<string, Entry[]>()
    for (const e of [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))) m.set(e.service_id, [...(m.get(e.service_id) || []), e])
    return [...m.entries()]
  }, [entries, day])

  const remove = async (e: Entry) => {
    if (!confirm(`Take ${e.customer_name} off the waitlist? They won’t be texted about openings.`)) return
    setBusy(e.id)
    try { await api('/api/bookings/waitlist', { method: 'PATCH', json: { companyId, id: e.id, action: 'remove' } }); flash('Removed from the waitlist'); load() }
    catch (err: any) { flash(err.message) } finally { setBusy('') }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{CSS}</style>
      {hintMsg && <div className="wl-warn"><WarnIcon size={16} style={{ marginTop: 1 }} /><span>{hintMsg}</span></div>}
      {!enabled && !hintMsg && (
        <div className="wl-off">
          <ClockIcon size={18} style={{ color: 'var(--coral,#ff7a6b)', marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink,#111)', fontSize: 14 }}>The waitlist is off</div>
            <div style={{ ...hint, marginTop: 2 }}>Turn it on and a full day on your booking page offers “Join the waitlist”. When a time frees up, the people waiting get a text to book it.</div>
          </div>
          <button onClick={onGoSettings} style={btnGhost}><GearIcon size={14} /> Settings</button>
        </div>
      )}

      {enabled && !hintMsg && <OfferTime companyId={companyId} services={services.filter(s => s.active)} timezone={timezone} onDone={(m) => { flash(m); load() }} />}

      <div className="wl-filters">
        <div className="wl-pills">
          {FILTERS.map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`wl-pill${status === k ? ' on' : ''}`}>{l}</button>)}
        </div>
        <div className="wl-right">
          <select value={serviceId} onChange={e => setServiceId(e.target.value)} style={{ ...input, width: 'auto', minWidth: 0, flex: '1 1 150px' }} aria-label="Service">
            <option value="">All services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} style={{ ...input, width: 'auto', minWidth: 0, flex: '1 1 140px' }} aria-label="Waiting for this day" />
          {day && <button onClick={() => setDay('')} style={btnGhost}>Any day</button>}
        </div>
      </div>

      {entries === null ? <div style={{ color: 'var(--slate,#6b7280)', fontSize: 13.5 }}>Loading…</div>
        : !groups.length ? (
          <div className="wl-empty">
            <EmptyScroll compact kinds={['calendar', 'contact']} title={status === 'live' ? 'Nobody’s waiting' : 'Nothing here'}
              line={day ? 'Nobody is waiting for that day.' : status === 'live' ? 'People who join the waitlist from your booking page show here.' : 'Past waitlist entries show up here.'}
              action={day ? <button type="button" className="cv-btn" onClick={() => setDay('')}>Any day</button> : undefined} />
          </div>
        ) : groups.map(([sid, list]) => (
          <section key={sid}>
            <div className="wl-group"><b>{svcName(sid)}</b><span> · {list.length} {status === 'live' ? 'waiting' : list.length === 1 ? 'person' : 'people'}</span></div>
            <div style={{ display: 'grid', gap: 10 }}>
              {list.map((e, i) => {
                const st = STATUS[e.status] || STATUS.waiting
                const live = e.status === 'waiting' || e.status === 'offered'
                return (
                  <article key={e.id} className="wl-card">
                    <div className="wl-top">
                      {live && status === 'live' && <span className="wl-pos" title="Place in the queue">{i + 1}</span>}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="wl-name">{e.customer_name}</div>
                        <div className="wl-contact">
                          <a href={`tel:${e.customer_phone}`}>{e.customer_phone}</a>
                          {e.customer_email && <a href={`mailto:${e.customer_email}`}>{e.customer_email}</a>}
                        </div>
                      </div>
                      <div className="wl-actions">
                        {e.conversation_id && <Link href={`/admin/inbox?conversation=${e.conversation_id}`} className="wl-btn"><ChatIcon size={14} /> Chat</Link>}
                        {live && <button onClick={() => remove(e)} disabled={busy === e.id} className="wl-btn danger">{busy === e.id ? 'Removing…' : 'Remove'}</button>}
                      </div>
                    </div>
                    <div className="wl-wants"><CalendarIcon size={14} /> {e.wants}</div>
                    <div className="wl-tags">
                      <span className="wl-chip" style={{ background: st.bg, color: st.c }}>{st.label}</span>
                      <span className="wl-chip">Joined {joined(e.created_at)}</span>
                      <span className="wl-chip">{e.offers_count ? `${e.offers_count} offer${e.offers_count === 1 ? '' : 's'} sent` : 'No offers yet'}</span>
                      {e.source === 'staff' && <span className="wl-chip">Added by the team</span>}
                    </div>
                    {e.offers.length > 0 && (
                      <div className="wl-offers">
                        {e.offers.slice(0, 5).map(o => (
                          <div key={o.id} className="wl-offer">
                            <span>{fmt(o.slot_start)}</span>
                            <span className={o.status === 'claimed' ? 'ok' : ''}>{o.status === 'claimed' && <CheckIcon size={12} strokeWidth={3} />} {OFFER[o.status] || o.status}{o.channel === 'email' ? ' · by email' : o.channel === 'sms' ? ' · by text' : ''}{o.mode === 'order' && o.status === 'sent' ? ' · held' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
    </div>
  )
}

// Offer a free time by hand: pick a service and day, then one of its free times.
function OfferTime({ companyId, services, timezone, onDone }: { companyId: string; services: any[]; timezone: string; onDone: (m: string) => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 10)
  const [serviceId, setServiceId] = useState(services[0]?.id || '')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState('')
  useEffect(() => { if (!serviceId && services[0]) setServiceId(services[0].id) }, [services, serviceId])

  const find = async () => {
    if (!serviceId) return
    setLoading(true)
    try { const d = await api(`/api/bookings/waitlist?companyId=${companyId}&op=free&serviceId=${serviceId}&date=${date}`); setSlots((d.slots || []).map((s: any) => s.start)) }
    catch (e: any) { onDone(e.message) } finally { setLoading(false) }
  }
  const offer = async (start: string) => {
    setSending(start)
    try {
      const d = await api('/api/bookings/waitlist', { method: 'POST', json: { companyId, action: 'offer', serviceId, startsAt: start } })
      onDone(d.deferred ? 'Queued. Texts go out from 9am, if it’s still free and far enough away.'
        : d.offers ? `Offered to ${d.offers} ${d.offers === 1 ? 'person' : 'people'}${d.held ? ' (held for them)' : ''}`
        : 'Nobody waiting wants that time (or they’ve already been offered it).')
    } catch (e: any) { onDone(e.message) } finally { setSending('') }
  }
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

  if (!services.length) return null
  return (
    <section style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink,#111)' }}>Offer a free time</div>
      <div style={{ ...hint, marginTop: 2 }}>Had a gap open up some other way? Offer it to the people waiting for that day, the same way a cancellation would.</div>
      <div className="wl-offer-form">
        <label style={{ minWidth: 0 }}><span style={label}>Service</span>
          <select value={serviceId} onChange={e => { setServiceId(e.target.value); setSlots(null) }} style={input}>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label style={{ minWidth: 0 }}><span style={label}>Day</span>
          <input type="date" value={date} min={today} onChange={e => { setDate(e.target.value); setSlots(null) }} style={input} />
        </label>
        <button onClick={find} disabled={loading || !serviceId} style={{ ...btn, alignSelf: 'end' }}>{loading ? 'Finding…' : 'Find free times'}</button>
      </div>
      {slots && (slots.length ? (
        <div className="wl-slots">
          {slots.map(s => <button key={s} onClick={() => offer(s)} disabled={!!sending} className="wl-slot">{sending === s ? 'Offering…' : <>Offer {t(s)}</>}</button>)}
        </div>
      ) : <div style={{ ...hint, marginTop: 12 }}>No free times that day (times have to be at least your minimum notice away).</div>)}
    </section>
  )
}

const CSS = `
.wl-warn{padding:12px 14px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13.5px;display:flex;gap:8px;align-items:flex-start}
.wl-off{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;padding:14px;border-radius:14px;background:var(--peach,#fff6f3);border:1px solid #fde4dc}
.wl-filters{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.wl-pills{display:flex;gap:8px;flex-wrap:wrap}
.wl-pill{height:36px;padding:0 14px;border-radius:12px;border:1px solid transparent;background:#f3f4f6;color:#4b5563;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.wl-pill.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 13%,#fff);color:color-mix(in srgb,var(--coral,#ff7a6b) 80%,#000);border-color:color-mix(in srgb,var(--coral,#ff7a6b) 25%,#fff)}
.wl-right{display:flex;gap:8px;flex-wrap:wrap;flex:1 1 280px;justify-content:flex-end;min-width:0}
.wl-group{font-size:13.5px;color:var(--slate,#6b7280);margin:4px 0 10px}
.wl-group b{color:var(--ink,#111);font-size:14.5px}
.wl-card{background:#fff;border:1px solid var(--border,#ececec);border-radius:14px;padding:14px 16px;min-width:0}
.wl-top{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.wl-pos{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;background:var(--peach,#fff1ee);color:var(--coral,#e5604f)}
.wl-name{font-weight:700;font-size:15px;color:var(--ink,#111);overflow-wrap:anywhere}
.wl-contact{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin-top:2px;min-width:0}
.wl-contact a{color:var(--slate,#6b7280);text-decoration:none;overflow-wrap:anywhere}
.wl-actions{display:flex;gap:6px;flex-wrap:wrap}
.wl-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 11px;border-radius:9px;border:1px solid var(--border,#e5e7eb);background:#fff;color:var(--ink,#111);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}
.wl-btn.danger{color:#dc2626}
.wl-wants{display:flex;gap:7px;align-items:center;margin-top:10px;font-size:13.5px;color:#374151;font-weight:600;overflow-wrap:anywhere}
.wl-wants svg{color:#9ca3af}
.wl-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.wl-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:#f3f4f6;color:#4b5563;white-space:nowrap}
.wl-offers{margin-top:10px;border-top:1px solid #f3f4f6;padding-top:8px;display:grid;gap:4px}
.wl-offer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--slate,#6b7280)}
.wl-offer .ok{color:#047857;font-weight:700;display:inline-flex;align-items:center;gap:3px}
.wl-empty{text-align:center;padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:16px;background:#fff}
.wl-offer-form{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:10px;margin-top:12px}
@media(max-width:600px){.wl-offer-form{grid-template-columns:1fr}.wl-offer-form button{width:100%;justify-content:center}}
.wl-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:12px}
.wl-slot{min-height:40px;border-radius:10px;border:1.5px solid color-mix(in srgb,var(--coral,#ff7a6b) 35%,#fff);background:#fff;color:color-mix(in srgb,var(--coral,#ff7a6b) 80%,#000);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.wl-slot:hover{border-color:var(--coral,#ff7a6b)}
`
