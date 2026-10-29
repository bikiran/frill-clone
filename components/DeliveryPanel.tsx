'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { SelectPopover } from '@/components/ui/SelectMenu'
import { DELIVERY_STATUS_OPTIONS } from '@/components/inbox/ContactPanelBits'

// Slide-out delivery scheduler. The sidebar used to hold a bare <input
// type="date"> that saved a string on the contact and nothing else — it never
// appeared on the team calendar. This books a REAL `delivery` calendar event
// (date, time window, address, outlet, notes) so the run shows up for everyone,
// and keeps the contact's scheduled_delivery / delivery_status in step.
//
// Sellio-style sheet: the customer up top, the next two weeks as a strip of
// days to tap (any other date from "Other date"), time windows as pills, grey
// fields, and the booking button pinned to the bottom.

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

// YYYY-MM-DD in local time (toISOString would shift it to UTC).
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }

export default function DeliveryPanel({ companyId, contact, onClose, onSaved }: Props) {
  const [date, setDate] = useState<string>(contact?.scheduled_delivery ? String(contact.scheduled_delivery).slice(0, 10) : '')
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
  const pickRef = useRef<HTMLInputElement | null>(null)
  const outletRef = useRef<HTMLButtonElement | null>(null)
  const statusRef = useRef<HTMLButtonElement | null>(null)
  const [menu, setMenu] = useState<'' | 'outlet' | 'status'>('')

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

  // Escape closes the sheet.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cpop')) onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  // Today and the next 13 days, for the strip.
  const days = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return Array.from({ length: 14 }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d })
  }, [])
  const inStrip = !date || days.some(d => ymd(d) === date)

  const save = async () => {
    if (!date) { setErr('Pick a delivery date'); return }
    setSaving(true); setErr('')
    try {
      // Book it on the team calendar.
      const res = await authFetch('/api/calendar', {
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

  const who = contact?.name || contact?.email || 'this customer'
  const chosen = date ? fromYmd(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  return (
    <div className="dlv-scrim" onClick={onClose}>
      <style>{DLV_CSS}</style>
      <div className="dlv" role="dialog" aria-modal="true" aria-labelledby="dlv-title" onClick={e => e.stopPropagation()}>
        <div className="dlv-scroll">
          <div className="dlv-head">
            <div style={{ minWidth: 0 }}>
              <h2 id="dlv-title">Schedule delivery</h2>
              <p>Books a delivery on the team calendar.</p>
            </div>
            <button type="button" className="dlv-x" onClick={onClose} aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Who it's for */}
          <div className="dlv-who">
            <span className="dlv-av" aria-hidden>{who.charAt(0).toUpperCase()}</span>
            <span className="dlv-who-t">
              <b>{who}</b>
              <small>{address || 'No address yet'}</small>
            </span>
          </div>

          {/* Already booked */}
          {existing.length > 0 && (
            <div className="dlv-booked">
              <span className="dlv-lbl">Already booked</span>
              {existing.map(ev => (
                <span key={ev.id} className="dlv-booked-row">
                  {ICON.cal}
                  <span>
                    {new Date(ev.starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {ev.time_window ? ` · ${ev.time_window}` : ''}
                  </span>
                  {ev.status && <em>{(STATUSES.find(s => s[0] === ev.status)?.[1]) || ev.status}</em>}
                </span>
              ))}
            </div>
          )}

          <section className="dlv-sec" aria-labelledby="dlv-date-l">
            <div className="dlv-sec-h">
              <span className="dlv-lbl" id="dlv-date-l">Day</span>
              {chosen && <span className="dlv-chosen">{chosen}</span>}
            </div>
            <div className="dlv-days" role="radiogroup" aria-labelledby="dlv-date-l">
              {days.map((d, i) => {
                const v = ymd(d), on = v === date
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} className={`dlv-day${on ? ' on' : ''}`} onClick={() => { setDate(v); setErr('') }}>
                    <small>{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-AU', { weekday: 'short' })}</small>
                    <b>{d.getDate()}</b>
                    <small>{d.toLocaleDateString('en-AU', { month: 'short' })}</small>
                  </button>
                )
              })}
              <label className={`dlv-day dlv-other${!inStrip ? ' on' : ''}`}>
                {ICON.cal}
                <small>{!inStrip ? fromYmd(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'Other date'}</small>
                <input ref={pickRef} type="date" value={date} aria-label="Pick another date"
                  onChange={e => { setDate(e.target.value); setErr('') }}
                  onClick={() => { try { pickRef.current?.showPicker?.() } catch {} }} />
              </label>
            </div>
          </section>

          <section className="dlv-sec" aria-labelledby="dlv-win-l">
            <span className="dlv-lbl" id="dlv-win-l">Time window</span>
            <div className="dlv-pills" role="radiogroup" aria-labelledby="dlv-win-l">
              {WINDOWS.map(w => (
                <button key={w} type="button" role="radio" aria-checked={window_ === w} className={window_ === w ? 'on' : ''} onClick={() => setWindow(w)}>{w}</button>
              ))}
            </div>
          </section>

          <section className="dlv-sec">
            <label className="dlv-lbl" htmlFor="dlv-addr">Address</label>
            <span className="dlv-field">
              {ICON.pin}
              <input id="dlv-addr" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, suburb, state" />
            </span>
          </section>

          <div className="dlv-two">
            {outlets.length > 0 && (
              <section className="dlv-sec">
                <span className="dlv-lbl" id="dlv-outlet-l">From</span>
                <button ref={outletRef} type="button" className="dlv-field dlv-pick" aria-haspopup="listbox" aria-expanded={menu === 'outlet'} aria-labelledby="dlv-outlet-l"
                  onClick={() => setMenu(m => (m === 'outlet' ? '' : 'outlet'))}>
                  {ICON.store}
                  <span>{outlets.find(o => o.id === outletId)?.label || outlets.find(o => o.id === outletId)?.suburb || 'Any outlet'}</span>
                  {ICON.down}
                </button>
                <SelectPopover open={menu === 'outlet'} onClose={() => setMenu('')} anchorRef={outletRef} label="Deliver from" align="start" width={230}
                  value={outletId} onPick={setOutletId}
                  options={[{ value: '', label: 'Any outlet', icon: ICON.store }, ...outlets.map(o => ({ value: o.id, label: o.label || o.suburb || 'Outlet', icon: ICON.store }))]} />
              </section>
            )}
            <section className="dlv-sec">
              <span className="dlv-lbl" id="dlv-status-l">Status</span>
              <button ref={statusRef} type="button" className="dlv-field dlv-pick" aria-haspopup="listbox" aria-expanded={menu === 'status'} aria-labelledby="dlv-status-l"
                onClick={() => setMenu(m => (m === 'status' ? '' : 'status'))}>
                <span className="dlv-dot" style={{ background: DELIVERY_STATUS_OPTIONS.find(o => o.value === status)?.dot || '#d4d4d8' }} aria-hidden />
                <span>{DELIVERY_STATUS_OPTIONS.find(o => o.value === status)?.label || 'Scheduled'}</span>
                {ICON.down}
              </button>
              <SelectPopover open={menu === 'status'} onClose={() => setMenu('')} anchorRef={statusRef} label="Delivery status" align="start" width={230}
                value={status} onPick={setStatus} options={DELIVERY_STATUS_OPTIONS} />
            </section>
          </div>

          <section className="dlv-sec">
            <label className="dlv-lbl" htmlFor="dlv-notes">Notes for the driver</label>
            <textarea id="dlv-notes" className="dlv-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Gate code, leave at the door, call on arrival…" />
          </section>
        </div>

        <div className="dlv-foot">
          {err && <p className="dlv-err" role="alert">{err}</p>}
          <button type="button" className="dlv-go" onClick={save} disabled={saving}>
            {saving ? 'Booking…' : date ? `Book for ${fromYmd(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Book delivery'}
          </button>
          <a className="dlv-cal" href="/admin/calendar">Open the calendar {ICON.arrow}</a>
        </div>
      </div>
    </div>
  )
}

const glyph = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const ICON = {
  cal: glyph(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, 15),
  pin: glyph(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  store: glyph(<><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>),
  box: glyph(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></>),
  down: glyph(<polyline points="6 9 12 15 18 9" />, 14),
  arrow: glyph(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 14),
}

const DLV_CSS = `
.dlv-scrim{position:fixed;inset:0;z-index:340;display:flex;justify-content:flex-end;padding:10px;background:rgba(15,15,20,.28);animation:dlvFade .18s ease both}
.dlv{--dlv-fill:#f4f4f5;--dlv-fill-2:#ececef;--dlv-ink:var(--ink,#18181b);--dlv-muted:#71717a;--dlv-on-bg:#18181b;--dlv-on-fg:#fff;
  width:440px;max-width:100%;height:100%;display:flex;flex-direction:column;background:var(--card,#fff);border-radius:24px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,0,0,.05),0 30px 80px -20px rgba(16,24,40,.35);animation:dlvIn .32s cubic-bezier(.22,1,.36,1) both}
[data-theme="dark"] .dlv{--dlv-fill:#2a2a2e;--dlv-fill-2:#333337;--dlv-muted:#9a9aa0;--dlv-on-bg:#f4f4f5;--dlv-on-fg:#18181b}
.dlv button::before,.dlv a::before{display:none!important}
.dlv-scroll{flex:1;overflow-y:auto;padding:22px 22px 8px;display:flex;flex-direction:column;gap:18px}
.dlv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dlv-head h2{margin:0;font-size:24px;font-weight:700;letter-spacing:-.03em;line-height:1.1;color:var(--dlv-ink)}
.dlv-head p{margin:5px 0 0;font-size:13.5px;color:var(--dlv-muted)}
.dlv-x{width:36px;height:36px;flex-shrink:0;border:none;border-radius:50%;background:var(--dlv-fill);color:var(--dlv-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s}
.dlv-x:hover{background:var(--dlv-fill-2);color:var(--dlv-ink)}
.dlv-who{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:var(--dlv-fill)}
.dlv-av{width:40px;height:40px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--coral,#ff7a6b);color:#fff;font-weight:700;font-size:16px}
.dlv-who-t{min-width:0;display:flex;flex-direction:column;line-height:1.3}
.dlv-who-t b{font-size:15px;font-weight:650;color:var(--dlv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dlv-who-t small{font-size:12.5px;color:var(--dlv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dlv-booked{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:18px;background:var(--peach,#fff4f1)}
.dlv-booked-row{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--dlv-ink)}
.dlv-booked-row svg{color:var(--coral,#ff7a6b);flex-shrink:0}
.dlv-booked-row em{margin-left:auto;font-style:normal;font-size:12px;font-weight:600;color:var(--dlv-muted)}
.dlv-sec{display:flex;flex-direction:column;gap:8px;min-width:0}
.dlv-sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.dlv-lbl{font-size:13px;font-weight:600;color:var(--dlv-ink)}
.dlv-chosen{font-size:12.5px;color:var(--dlv-muted)}
.dlv-days{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -22px;padding:2px 22px 4px;scroll-snap-type:x proximity}
.dlv-days::-webkit-scrollbar{display:none}
.dlv-day{position:relative;flex:0 0 58px;height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border:none;border-radius:16px;background:var(--dlv-fill);color:var(--dlv-ink);font:inherit;cursor:pointer;scroll-snap-align:start;transition:background .15s,transform .12s}
.dlv-day:hover{background:var(--dlv-fill-2)}
.dlv-day:active{transform:scale(.96)}
.dlv-day small{font-size:11.5px;color:var(--dlv-muted);font-weight:500}
.dlv-day b{font-size:21px;font-weight:700;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.dlv-day.on{background:var(--dlv-on-bg);color:var(--dlv-on-fg)}
.dlv-day.on small{color:inherit;opacity:.7}
.dlv-other{flex-basis:76px;gap:5px;color:var(--dlv-muted)}
.dlv-other svg{color:var(--dlv-ink)}
.dlv-other.on svg{color:inherit}
.dlv-other input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none}
.dlv-pills{display:flex;flex-wrap:wrap;gap:6px}
.dlv-pills button{height:36px;padding:0 14px;border:none;border-radius:999px;background:var(--dlv-fill);color:var(--dlv-ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.dlv-pills button:hover{background:var(--dlv-fill-2)}
.dlv-pills button.on{background:var(--dlv-on-bg);color:var(--dlv-on-fg)}
.dlv-field{position:relative;display:flex;align-items:center;gap:9px;height:46px;padding:0 14px;border-radius:14px;background:var(--dlv-fill);color:var(--dlv-muted);border:1.5px solid transparent;transition:background .15s,border-color .15s}
.dlv-field:focus-within{background:var(--card,#fff);border-color:var(--dlv-fill-2)}
.dlv .dlv-field input,.dlv .dlv-field select{flex:1;min-width:0;height:100%;border:none!important;outline:none;background:transparent!important;box-shadow:none!important;font:inherit;font-size:14.5px;color:var(--dlv-ink)!important;padding:0}
.dlv-field input::placeholder,.dlv-notes::placeholder{color:var(--dlv-muted)}
.dlv-pick{width:100%;font:inherit;font-size:14.5px;color:var(--dlv-ink);text-align:left;cursor:pointer}
.dlv-pick>span:not(.dlv-dot){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dlv-pick:hover{background:var(--dlv-fill-2)}
.dlv-pick[aria-expanded="true"]{background:var(--card,#fff);border-color:var(--dlv-fill-2)}
.dlv-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin:0 3px}
.dlv-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.dlv .dlv-notes{width:100%;min-height:84px;padding:12px 14px;border:1.5px solid transparent!important;border-radius:14px;background:var(--dlv-fill)!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;line-height:1.5;color:var(--dlv-ink)!important;resize:vertical}
.dlv .dlv-notes:focus{background:var(--card,#fff)!important;border-color:var(--dlv-fill-2)!important}
.dlv-foot{display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:12px 22px 18px;border-top:1px solid var(--dlv-fill)}
.dlv-err{margin:0;font-size:13px;font-weight:600;color:#dc2626}
.dlv-go{height:50px;border:none;border-radius:999px;background:var(--coral,#ff7a6b);color:#fff;font:inherit;font-size:15px;font-weight:650;cursor:pointer;transition:filter .15s,transform .12s}
.dlv-go:hover{filter:brightness(.95)}
.dlv-go:active{transform:scale(.985)}
.dlv-go:disabled{opacity:.7;cursor:wait}
.dlv-cal{align-self:center;display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:999px;font-size:13px;font-weight:600;color:var(--dlv-muted);text-decoration:none}
.dlv-cal:hover{color:var(--dlv-ink);background:var(--dlv-fill)}
.dlv :focus-visible{outline:2px solid var(--coral,#ff7a6b);outline-offset:2px}
@media (max-width:520px){.dlv-scrim{padding:0}.dlv{border-radius:22px 22px 0 0;height:auto;max-height:92%;margin-top:auto;width:100%}}
@keyframes dlvIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes dlvFade{from{opacity:0}to{opacity:1}}
@media (max-width:520px){@keyframes dlvIn{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}}
@media (prefers-reduced-motion:reduce){.dlv,.dlv-scrim{animation:none}}
`
