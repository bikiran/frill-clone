'use client'

// The public table booking page: how many → which day → what time → your
// details → booked (with the link to change or cancel). Served at
// colvy.com/reserve/<slug> and <slug>.colvy.com/reserve, and inside a
// restaurant's website (?embed=1, the iframe grows to fit).
// Times are the restaurant's local times.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '@/components/booking/BookingFlow'
import Turnstile, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/Turnstile'

type Restaurant = {
  name: string; slug: string; logo: string | null; accent: string | null; timezone: string; title: string; intro: string; confirmationNote: string
  partyMin: number; partyMax: number; largePartyNote: string; maxDaysAhead: number; requirePhone: boolean; requireEmail: boolean; seating: string[]
  /** Phase 2: a deposit to book (only when the restaurant takes card payments). */
  deposit?: { mode: 'per_person' | 'per_booking'; cents: number; minParty: number; days: string[] } | null
  cancelHours?: number; allowChanges?: boolean
}
type Done = { startsAt: string; party: number; name: string; seating: string | null; manageUrl: string }

const SEAT: Record<string, string> = { indoor: 'Inside', outdoor: 'Outside', bar: 'At the bar' }
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const dayParts = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`)
  return { dow: t.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' }), n: t.getUTCDate(), mon: t.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' }) }
}
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const timeIn = (iso: string, tz: string) => {
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(' ', '').toLowerCase() } catch { return '' }
}
const dateIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
/** The deposit this party would pay on this day (the same rule as lib/restaurant/settings depositFor). */
function depositOf(d: Restaurant['deposit'], party: number, date: string): number {
  if (!d || d.cents <= 0 || party < d.minParty) return 0
  if (d.days.length && !d.days.includes(DOW[new Date(`${date}T12:00:00Z`).getUTCDay()])) return 0
  return d.mode === 'per_person' ? d.cents * party : d.cents
}

async function get(path: string) {
  const r = await fetch(path)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || 'Something went wrong.')
  return d
}

export default function ReserveFlow({ slug }: { slug: string }) {
  const q = `slug=${encodeURIComponent(slug)}`
  const [r, setR] = useState<Restaurant | null>(null)
  const [today, setToday] = useState('')
  const [poweredBy, setPoweredBy] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [party, setParty] = useState(2)
  const [days, setDays] = useState<{ date: string; open: boolean }[] | null>(null)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<{ start: string; period: string }[] | null>(null)
  const [start, setStart] = useState('')
  const [step, setStep] = useState<'when' | 'details' | 'done'>('when')
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', seating: '', occasion: '', marketing: false, website: '' })
  const [token, setToken] = useState('')
  const human = useRef<TurnstileHandle>(null)
  const opened = useRef(Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const [paying, setPaying] = useState('')
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // From Book again on their account page: ?party=4 (the same size as last
    // time) and ?i=<invite>, a personal link that fills in their details.
    const sp = new URLSearchParams(window.location.search)
    const want = Math.round(Number(sp.get('party')))
    if (want >= 1 && want <= 99) setParty(want)
    const invite = sp.get('i')
    if (invite) {
      get(`/api/reserve?${q}&op=invite&token=${encodeURIComponent(invite)}`).then(d => {
        const p = d?.prefill
        if (p) setF(x => ({ ...x, name: x.name || p.name || '', phone: x.phone || p.phone || '', email: x.email || p.email || '' }))
      }).catch(() => {})
    }
    get(`/api/reserve?${q}&op=page`).then(d => {
      setR(d.restaurant); setToday(d.today); setPoweredBy(!d.hidePoweredBy)
      setParty(p => Math.max(d.restaurant.partyMin, Math.min(d.restaurant.partyMax, p)))
    }).catch(e => setLoadErr(e.message))
  }, [q])

  // Which days have a table for this party (the next three weeks).
  const [from, setFrom] = useState('')
  useEffect(() => { if (today && !from) setFrom(today) }, [today, from])
  useEffect(() => {
    if (!r || !from) return
    let live = true
    setDays(null)
    get(`/api/reserve?${q}&op=days&party=${party}&from=${from}`).then(d => {
      if (!live) return
      setDays(d.days || [])
      setDate(cur => (cur && (d.days || []).some((x: any) => x.date === cur && x.open)) ? cur : ((d.days || []).find((x: any) => x.open)?.date || ''))
    }).catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [r, q, party, from])
  useEffect(() => {
    if (!date) { setSlots([]); return }
    let live = true
    setSlots(null)
    get(`/api/reserve?${q}&op=slots&party=${party}&date=${date}`).then(d => {
      if (!live) return
      setSlots(d.slots || [])
      setStart(cur => ((d.slots || []).some((s: any) => s.start === cur) ? cur : ''))
    }).catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [q, party, date])

  const periods = useMemo(() => {
    const m: { name: string; list: { start: string }[] }[] = []
    for (const s of slots || []) {
      const last = m[m.length - 1]
      if (last && last.name === s.period) last.list.push(s); else m.push({ name: s.period, list: [s] })
    }
    return m
  }, [slots])

  const go = (s: typeof step) => { setStep(s); setErr(''); requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!r) return
    setErr('')
    if (!f.name.trim()) { setErr('Please add your name.'); return }
    if (r.requirePhone && f.phone.replace(/\D/g, '').length < 8) { setErr('Please add your mobile number so we can confirm your table.'); return }
    if (r.requireEmail && !/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Please add your email address.'); return }
    if (!f.phone.trim() && !f.email.trim()) { setErr('Please add a mobile number or email so we can confirm your table.'); return }
    if (TURNSTILE_SITE_KEY && !token) { setErr('Please wait a moment while we check you’re not a robot.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/reserve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, startsAt: start, party, name: f.name, phone: f.phone, email: f.email, notes: f.notes, seating: f.seating || null, occasion: f.occasion, marketing: f.marketing, website: f.website, openedAt: opened.current, turnstileToken: token }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.checkoutUrl) {
        // A deposit: the table is held while they pay on Stripe, then they land on their booking.
        setPaying(d.checkoutUrl)
        let framed = false
        try { framed = window.self !== window.top } catch { framed = true }
        if (framed) window.open(d.checkoutUrl, '_blank', 'noopener')
        else window.location.assign(d.checkoutUrl)
        return
      }
      if (!res.ok) {
        human.current?.reset(); setToken('')
        if (d?.full) {
          // Taken while they typed: back to the times, refreshed.
          setStart(''); setSlots(null)
          get(`/api/reserve?${q}&op=slots&party=${party}&date=${date}`).then(x => setSlots(x.slots || [])).catch(() => setSlots([]))
          go('when')
        }
        setErr(d?.error || 'Something went wrong. Please try again.')
        return
      }
      setDone(d.reservation); go('done')
    } finally { setBusy(false) }
  }

  const accent = r?.accent || '#ff7a6b'
  if (loadErr) return <Shell accent={accent}><div className="rv-card"><div className="rv-in"><h1 className="rv-h1">Sorry</h1><p className="rv-p">{loadErr}</p></div></div><style>{CSS}</style></Shell>
  if (!r) return <Shell accent={accent}><div className="rv-card"><div className="rv-in"><div className="rv-sk" style={{ width: '60%', height: 28 }} /><div className="rv-sk" style={{ height: 120, marginTop: 18 }} /></div></div><style>{CSS}</style></Shell>
  const tz = r.timezone
  const viewerTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return tz } })()
  const parties = Array.from({ length: Math.min(r.partyMax, 12) - r.partyMin + 1 }, (_, i) => r.partyMin + i)
  const lastDay = today ? addDays(today, r.maxDaysAhead) : ''
  const deposit = depositOf(r.deposit, party, date)

  return (
    <Shell accent={accent}>
      <style>{CSS}</style>
      <div className="rv-card" ref={top}>
        <header className="rv-head">
          {r.logo ? <img src={r.logo} alt="" className="rv-logo" /> : <span className="rv-logo rv-mono" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span>}
          <div style={{ minWidth: 0 }}>
            <h1 className="rv-h1">{step === 'done' ? 'You’re booked' : r.title}</h1>
            <p className="rv-sub">{r.name}</p>
          </div>
        </header>

        {step === 'when' && (
          <div className="rv-in">
            {r.intro && <p className="rv-intro">{r.intro}</p>}
            <section>
              <h2 className="rv-l">How many guests?</h2>
              <div className="rv-party" role="group" aria-label="Guests">
                {parties.map(n => <button key={n} type="button" className={`bk-chip rv-pc${party === n ? ' sel' : ''}`} onClick={() => setParty(n)} aria-pressed={party === n}>{n}</button>)}
              </div>
              {r.partyMax > 12 && (
                <select className="bk-in" style={{ marginTop: 8, maxWidth: 200 }} value={party > 12 ? party : ''} onChange={e => e.target.value && setParty(Number(e.target.value))} aria-label="More guests">
                  <option value="">More than 12…</option>
                  {Array.from({ length: r.partyMax - 12 }, (_, i) => 13 + i).map(n => <option key={n} value={n}>{n} guests</option>)}
                </select>
              )}
              <p className="rv-hint">{r.largePartyNote || `For groups over ${r.partyMax}, please get in touch with ${r.name}.`}</p>
            </section>

            <section>
              <div className="rv-row"><h2 className="rv-l">Day</h2>
                <div className="rv-arrows">
                  <button type="button" onClick={() => setFrom(addDays(from, -21))} disabled={!from || from <= today} aria-label="Earlier days">‹</button>
                  <button type="button" onClick={() => setFrom(addDays(from, 21))} disabled={!from || addDays(from, 21) > lastDay} aria-label="Later days">›</button>
                </div>
              </div>
              <div className="rv-days" role="group" aria-label="Day">
                {days === null ? Array.from({ length: 7 }).map((_, i) => <span key={i} className="rv-day rv-sk" />) : days.map(d => {
                  const p = dayParts(d.date)
                  return (
                    <button key={d.date} type="button" className={`rv-day${d.date === date ? ' sel' : ''}`} disabled={!d.open} onClick={() => { setDate(d.date); setErr('') }} aria-pressed={d.date === date} aria-label={`${longDay(d.date)}${d.open ? '' : ', no tables'}`}>
                      <small>{d.date === today ? 'Today' : p.dow}</small><b>{p.n}</b><small>{p.mon}</small>
                    </button>
                  )
                })}
              </div>
              {days && !days.some(d => d.open) && <p className="rv-hint">No tables for {party} in these weeks. Try other days or a smaller group.</p>}
            </section>

            {date && (
              <section>
                <h2 className="rv-l">Time · {longDay(date)}</h2>
                {slots === null ? <div className="rv-times">{Array.from({ length: 6 }).map((_, i) => <span key={i} className="rv-time rv-sk" />)}</div>
                  : !slots.length ? <p className="rv-hint" style={{ marginTop: 0 }}>Fully booked for {party} that day. Try another day.</p>
                  : periods.map(p => (
                    <div key={p.name} className="rv-period">
                      <h3>{p.name}</h3>
                      <div className="rv-times">
                        {p.list.map(s => <button key={s.start} type="button" className={`rv-time${s.start === start ? ' sel' : ''}`} onClick={() => setStart(s.start)} aria-pressed={s.start === start}>{timeIn(s.start, tz)}</button>)}
                      </div>
                    </div>
                  ))}
                {viewerTz !== tz && slots && slots.length > 0 && <p className="rv-hint">Times are local to {r.name}.</p>}
              </section>
            )}
            {err && <div className="rv-err" role="alert">{err}</div>}
            <div className="rv-cta">
              <span className="rv-sum">{start ? `${party} · ${longDay(date)} · ${timeIn(start, tz)}` : 'Pick a time'}</span>
              <button type="button" className="bk-primary" disabled={!start} onClick={() => go('details')}>Continue</button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <form className="rv-in" onSubmit={submit} noValidate>
            <button type="button" className="rv-back" onClick={() => go('when')}>‹ Change time</button>
            <div className="rv-pick"><b>Table for {party}</b><span>{longDay(date)} at {timeIn(start, tz)}</span></div>
            {deposit > 0 && (
              <div className="rv-dep">
                <b>{dollars(deposit)} deposit to book</b>
                <span>{r.deposit?.mode === 'per_person' ? `${dollars(r.deposit.cents)} a guest, ` : ''}paid by card on the next screen. {r.allowChanges && r.cancelHours != null ? `You get it back if you cancel at least ${r.cancelHours} hours before.` : `Call ${r.name} to change your booking.`}</span>
              </div>
            )}
            {paying && (
              <div className="rv-dep" role="status">
                <b>Your table is held for 30 minutes</b>
                <span>Finish paying the deposit to confirm it. <a href={paying} target="_blank" rel="noopener noreferrer">Open the payment page</a></span>
              </div>
            )}
            <div className="bk-fields">
              <label className="rv-f" style={{ gridColumn: '1 / -1' }}><span>Name <i>*</i></span><input className="bk-in" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={120} /></label>
              <label className="rv-f"><span>Mobile {r.requirePhone && <i>*</i>}</span><input className="bk-in" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} type="tel" autoComplete="tel" inputMode="tel" maxLength={40} /></label>
              <label className="rv-f"><span>Email {r.requireEmail && <i>*</i>}</span><input className="bk-in" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} type="email" autoComplete="email" inputMode="email" maxLength={200} /></label>
            </div>
            {r.seating.length > 0 && (
              <div>
                <span className="rv-l2">Where would you like to sit?</span>
                <div className="rv-party">
                  <button type="button" className={`bk-chip${!f.seating ? ' sel' : ''}`} onClick={() => setF({ ...f, seating: '' })}>No preference</button>
                  {r.seating.map(o => <button key={o} type="button" className={`bk-chip${f.seating === o ? ' sel' : ''}`} onClick={() => setF({ ...f, seating: o })}>{SEAT[o] || o}</button>)}
                </div>
                <p className="rv-hint">We’ll do our best.</p>
              </div>
            )}
            <label className="rv-f"><span>Special occasion?</span><input className="bk-in" value={f.occasion} onChange={e => setF({ ...f, occasion: e.target.value })} maxLength={80} placeholder="Birthday, anniversary…" /></label>
            <label className="rv-f"><span>Anything we should know?</span><textarea className="bk-in" style={{ minHeight: 84, resize: 'vertical' }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={1000} placeholder="Allergies, a high chair, accessibility…" /></label>
            <input type="text" name="website" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label className="rv-check"><input type="checkbox" checked={f.marketing} onChange={e => setF({ ...f, marketing: e.target.checked })} /><span>Send me news and offers from {r.name}</span></label>
            <Turnstile ref={human} onToken={setToken} action="reserve" />
            {err && <div className="rv-err" role="alert">{err}</div>}
            <div className="rv-cta">
              <span className="rv-sum">{party} · {timeIn(start, tz)}{deposit > 0 ? ` · ${dollars(deposit)} deposit` : ''}</span>
              <button type="submit" className="bk-primary" disabled={busy || !!paying}>{busy ? 'Booking…' : paying ? 'Waiting for payment…' : deposit > 0 ? 'Book and pay deposit' : 'Book table'}</button>
            </div>
          </form>
        )}

        {step === 'done' && done && (
          <div className="rv-in">
            <div className="rv-ok" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            <div className="rv-pick big">
              <b>Table for {done.party}</b>
              <span>{longDay(dateIn(done.startsAt, tz))} at {timeIn(done.startsAt, tz)}</span>
              {done.seating && <span>{SEAT[done.seating] || done.seating} (requested)</span>}
            </div>
            <p className="rv-p">Thanks, {done.name.split(' ')[0]}. {f.phone || f.email ? `We’ve sent the details to ${f.phone ? 'your phone' : 'your email'}.` : ''}</p>
            {r.confirmationNote && <p className="rv-intro">{r.confirmationNote}</p>}
            <a className="bk-primary rv-manage" href={done.manageUrl}>Change or cancel</a>
          </div>
        )}
      </div>
      {poweredBy && <p className="rv-foot">Powered by <a href="https://colvy.com">Colvy</a></p>}
    </Shell>
  )
}

const CSS = `
.rv-card{position:relative;z-index:1;max-width:620px;margin:0 auto;background:rgba(255,255,255,.94);-webkit-backdrop-filter:saturate(1.4) blur(18px);backdrop-filter:saturate(1.4) blur(18px);border-radius:24px;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 2px rgba(0,0,0,.03),0 24px 60px -28px rgba(0,0,0,.22);color:#111;scroll-margin-top:12px}
.rv-head{display:flex;align-items:center;gap:14px;padding:24px 26px 18px;border-bottom:1px solid #f1f1f1}
.rv-logo{width:48px;height:48px;border-radius:14px;object-fit:cover;flex-shrink:0}
.rv-mono{display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bk-accent) 14%,#fff);color:var(--bk-accent);font-weight:800;font-size:20px}
.rv-h1{margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.25}
.rv-sub{margin:2px 0 0;font-size:14px;color:#6b7280}
.rv-in{display:flex;flex-direction:column;gap:22px;padding:22px 26px 26px}
.rv-intro{margin:0;padding:12px 14px;border-radius:14px;background:#f9fafb;color:#374151;font-size:14px;line-height:1.55;white-space:pre-wrap}
.rv-l{margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6b7280}
.rv-l2{display:block;margin:0 0 8px;font-size:13px;font-weight:600;color:#374151}
.rv-row{display:flex;align-items:center;justify-content:space-between}
.rv-row .rv-l{margin-bottom:10px}
.rv-arrows{display:flex;gap:4px;margin-bottom:8px}
.rv-arrows button{width:32px;height:32px;border:none;border-radius:50%;background:#f4f4f5;font-size:18px;cursor:pointer;color:#111}
.rv-arrows button:disabled{opacity:.3;cursor:default}
.rv-party{display:flex;flex-wrap:wrap;gap:8px}
.rv-pc{min-width:46px;justify-content:center}
.rv-hint{margin:8px 0 0;font-size:13px;color:#6b7280;line-height:1.5}
.rv-days{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;margin:0 -2px;scroll-snap-type:x proximity;scrollbar-width:thin}
.rv-day{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;flex:0 0 62px;height:76px;border:1.5px solid #e5e7eb;border-radius:16px;background:#fff;font-family:inherit;color:#111;cursor:pointer;scroll-snap-align:start;transition:border-color .2s,background .2s,transform .15s}
.rv-day small{font-size:11.5px;font-weight:600;color:#6b7280}
.rv-day b{font-size:19px;font-weight:800}
.rv-day:hover:not(:disabled){border-color:var(--bk-accent)}
.rv-day:active:not(:disabled){transform:scale(.96)}
.rv-day.sel{border-color:var(--bk-accent);background:color-mix(in srgb,var(--bk-accent) 10%,#fff)}
.rv-day:disabled{opacity:.38;cursor:default;background:#fafafa}
.rv-day:disabled b{text-decoration:line-through;text-decoration-thickness:1.5px}
.rv-period+.rv-period{margin-top:14px}
.rv-period h3{margin:0 0 8px;font-size:13px;font-weight:700;color:#374151}
.rv-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.rv-time{height:44px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-family:inherit;font-size:14.5px;font-weight:700;color:#111;cursor:pointer;font-variant-numeric:tabular-nums;transition:border-color .2s,background .2s,transform .15s}
.rv-time:hover{border-color:var(--bk-accent)}
.rv-time:active{transform:scale(.96)}
.rv-time.sel{border-color:var(--bk-accent);background:var(--bk-accent);color:#fff}
.rv-cta{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 -26px -26px;padding:14px 26px calc(14px + env(safe-area-inset-bottom));background:rgba(255,255,255,.9);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px);border-top:1px solid rgba(0,0,0,.06);border-radius:0 0 24px 24px}
.rv-sum{font-size:13.5px;font-weight:700;color:#374151;min-width:0}
.rv-cta .bk-primary{flex-shrink:0;min-width:140px}
.rv-back{align-self:flex-start;border:none;background:none;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:#6b7280;cursor:pointer}
.rv-pick{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:16px;background:color-mix(in srgb,var(--bk-accent) 8%,#fff);border:1px solid color-mix(in srgb,var(--bk-accent) 22%,#fff)}
.rv-pick b{font-size:16px;font-weight:800}
.rv-pick span{font-size:14px;color:#374151}
.rv-pick.big b{font-size:19px}
.rv-f{display:flex;flex-direction:column;gap:5px}
.rv-f>span{font-size:13px;font-weight:600;color:#374151}
.rv-f i{font-style:normal;color:#dc2626}
.rv-check{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#374151;cursor:pointer;line-height:1.45}
.rv-check input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--bk-accent);flex-shrink:0}
.rv-err{padding:10px 12px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13.5px}
.rv-dep{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--accent,#ff7a6b) 10%,#fff);font-size:13.5px;line-height:1.45;color:#3f3f46}
.rv-dep b{font-size:14.5px;color:#18181b}
.rv-dep a{color:inherit;font-weight:650}
.rv-p{margin:0;font-size:15px;line-height:1.55;color:#374151}
.rv-ok{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bk-accent) 14%,#fff);color:var(--bk-accent);animation:rvPop .5s cubic-bezier(.34,1.56,.64,1) both}
@keyframes rvPop{from{transform:scale(.5);opacity:0}to{transform:none;opacity:1}}
.rv-manage{align-self:flex-start;text-decoration:none}
.rv-foot{position:relative;z-index:1;text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 0}
.rv-foot a{color:#9ca3af}
.rv-sk{display:block;border-radius:12px;background:linear-gradient(90deg,#f3f4f6 25%,#e9eaec 50%,#f3f4f6 75%);background-size:200% 100%;animation:rvSk 1.2s linear infinite;border-color:transparent!important}
.rv-time.rv-sk{height:44px}
@keyframes rvSk{to{background-position:-200% 0}}
@media(max-width:560px){.rv-head{padding:18px 16px 14px}.rv-in{padding:18px 16px 20px}.rv-cta{margin:0 -16px -20px;padding-left:16px;padding-right:16px}.rv-h1{font-size:19px}}
`
