'use client'

// Schedule a delivery for a customer, filled in from what Colvy already knows:
// their latest open order's shipping address (or the one on their profile),
// their phone, and the order it's for. Each part can be changed before saving.
// On save it goes on the team calendar and a "Delivery scheduled" card drops
// into the customer's conversation, so whoever reads the thread next sees it.
// The customer is only told when "Text them the details" is on.
//
// The web twin of colvy-mobile's ScheduleDeliverySheet: same sections, same
// time windows, same chat line (lib/delivery-line), so a delivery booked on
// either app reads the same in both. Opened from the composer's + menu and
// the contact panel's Delivery row.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { deliveryDay, deliveryLine } from '@/lib/delivery-line'

type Order = { id: string; order_number: string; total?: number | null; status?: string | null; order_date?: string | null; item_count?: number | null; address: string }

export const DELIVERY_WINDOWS = ['Morning', 'Afternoon', 'Evening', '9am–12pm', '12pm–5pm', 'After 7pm']
const CLOSED = /^(completed|cancelled|refunded|delivered|failed|shipped)$/i
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', scheduled: 'Scheduled', out_for_delivery: 'Out for delivery', completed: 'Delivered', delivered: 'Delivered', failed: 'Failed', cancelled: 'Cancelled' }
const digits = (s?: string | null) => String(s || '').replace(/\D/g, '')
// YYYY-MM-DD in local time (toISOString would shift it to UTC).
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addressOf = (v: any): string => {
  let a: any = v
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return a.trim() } }
  if (!a || typeof a !== 'object') return ''
  return [
    [a.address_1, a.address_2].filter(Boolean).join(', '),
    a.city, (a.state || '').toUpperCase(), a.postcode,
    a.country && a.country !== 'AU' ? a.country : '',
  ].filter(Boolean).join(', ')
}

// The profile's address as one line, without repeating a suburb or postcode
// the street line already names.
const profileAddress = (c: any): string => {
  const line = String(c?.address || '').trim()
  const low = line.toLowerCase()
  const rest = [c?.city, c?.state, c?.postcode].map(x => String(x || '').trim()).filter(x => x && !low.includes(x.toLowerCase()))
  return [line, ...rest].filter(Boolean).join(', ')
}

const fmtMoney = (n: any) => (n == null || n === '' ? '' : `$${(Number(n) || 0).toFixed(2)}`)
const fmtDay = (d?: string | null) => {
  const t = d ? new Date(d) : null
  return t && !isNaN(+t) ? t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''
}

/** "in the evening", "between 9am–12pm", "after 7pm", for the text to the customer. */
function windowPhrase(w: string): string {
  if (/^(morning|afternoon|evening)$/i.test(w)) return `in the ${w.toLowerCase()}`
  if (/^after\b/i.test(w)) return w.charAt(0).toLowerCase() + w.slice(1)
  return `between ${w}`
}

export default function ScheduleDeliverySheet({ companyId, contact, conversationId, senderName, defaultLocationId, onClose, onScheduled, tellCustomer, onOpenBooked }: {
  companyId: string
  contact: any
  /** The thread the card goes into; the contact's latest one when not given. */
  conversationId?: string | null
  senderName?: string
  /** The outlet to deliver from, when the conversation already belongs to one. */
  defaultLocationId?: string | null
  onClose: () => void
  /** After saving, with the contact fields that changed. */
  onScheduled?: (patch: Record<string, any>) => void
  /** Sends the customer a message over their channel; without it there's no "text them" option. */
  tellCustomer?: (text: string) => Promise<string>
  /** Open one of their booked deliveries (components/DeliveryDetailsSheet). */
  onOpenBooked?: (eventId: string) => void
}) {
  const today = ymd(new Date())
  const profileAddr = profileAddress(contact)
  const name = String(contact?.name || contact?.email || 'Customer')
  const first = name.trim().split(/\s+/)[0]

  const [date, setDate] = useState(today)
  const [win, setWin] = useState('')
  const [address, setAddress] = useState(profileAddr)
  const [addrSource, setAddrSource] = useState<'order' | 'profile' | 'typed' | ''>(profileAddr ? 'profile' : '')
  const [editAddr, setEditAddr] = useState(false)
  const [saveToProfile, setSaveToProfile] = useState(true)
  const [phone, setPhone] = useState<string>(contact?.phone || '')
  const [editPhone, setEditPhone] = useState(false)
  const [notes, setNotes] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [pickOrder, setPickOrder] = useState(false)
  const [locations, setLocations] = useState<any[]>([])
  const [locationId, setLocationId] = useState<string>(defaultLocationId || '')
  const [booked, setBooked] = useState<any[]>([])
  const [tell, setTell] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const dateRef = useRef<HTMLInputElement>(null)

  // Escape closes.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, saving])

  // Their orders (to pick the one this is for, and its address), the outlets,
  // and what's already booked for them.
  useEffect(() => {
    let live = true
    ;(async () => {
      const ors: string[] = []
      if (contact?.id) ors.push(`contact_id.eq.${contact.id}`)
      if (contact?.email) ors.push(`customer_email.ilike.${String(contact.email).replace(/[,()]/g, '')}`)
      const tail = digits(contact?.phone).slice(-9)
      if (tail.length >= 8) ors.push(`customer_phone.ilike.%${tail}%`)
      const [ordRes, locRes, bookRes] = await Promise.all([
        ors.length
          ? (supabase as any).from('orders').select('id, order_number, total, status, order_date, item_count, shipping_address')
            .eq('company_id', companyId).or(ors.join(',')).order('order_date', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] }),
        (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false }),
        contact?.id
          ? (supabase as any).from('calendar_events').select('id, starts_at, time_window, status, address')
            .eq('company_id', companyId).eq('contact_id', contact.id).eq('event_type', 'delivery').neq('status', 'cancelled')
            .gte('starts_at', new Date(`${today}T00:00:00`).toISOString()).order('starts_at', { ascending: true }).limit(4)
          : Promise.resolve({ data: [] }),
      ].map(p => Promise.resolve(p).catch(() => ({ data: [] }))))
      if (!live) return
      const list: Order[] = ((ordRes as any).data || []).map((o: any) => ({
        id: o.id, order_number: String(o.order_number ?? ''), total: o.total, status: o.status,
        order_date: o.order_date, item_count: o.item_count, address: addressOf(o.shipping_address),
      }))
      setOrders(list)
      // The order this delivery is most likely for: the newest one still open,
      // from the last month. Its shipping address is the one to use.
      const monthAgo = Date.now() - 31 * 864e5
      const open = list.find(o => !CLOSED.test(String(o.status || '')) && (!o.order_date || +new Date(o.order_date) > monthAgo))
      if (open) {
        setOrder(open)
        if (open.address) { setAddress(open.address); setAddrSource('order') }
      } else if (!profileAddr) {
        const withAddr = list.find(o => o.address)
        if (withAddr) { setAddress(withAddr.address); setAddrSource('order') }
      }
      const locs = (locRes as any).data || []
      setLocations(locs)
      if (!defaultLocationId && locs.length > 1) setLocationId('')
      setBooked((bookRes as any).data || [])
      setLoading(false)
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contact?.id])

  const chooseOrder = (o: Order | null) => {
    setOrder(o); setPickOrder(false)
    if (o?.address && addrSource !== 'typed') { setAddress(o.address); setAddrSource('order') }
  }

  const quick = useMemo(() => ([['Today', 0], ['Tomorrow', 1], ['In 3 days', 3]] as const).map(([label, days]) => {
    const d = new Date(); d.setDate(d.getDate() + days); return { label, value: ymd(d) }
  }), [])

  const save = async () => {
    if (saving) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('Pick a date first'); return }
    setSaving(true); setErr('')
    try {
      const who = contact?.name || contact?.phone || contact?.email || 'customer'
      const noteLines = [notes.trim(), phone && phone !== contact?.phone ? `Phone: ${phone}` : ''].filter(Boolean).join('\n')
      // The thread the card goes into: this one, else their latest.
      let convId = conversationId || null
      if (!convId && contact?.id) {
        const { data: c } = await (supabase as any).from('conversations').select('id')
          .eq('company_id', companyId).eq('contact_id', contact.id)
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        convId = c?.id || null
      }
      const res = await authFetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, event_type: 'delivery',
          title: `Delivery — ${who}${order ? ` · #${order.order_number}` : ''}`,
          notes: noteLines || null,
          // The window is what matters to the customer, not a clock time.
          starts_at: new Date(`${date}T09:00:00`).toISOString(), is_all_day: true,
          time_window: win || null, address: address.trim() || null,
          location_id: locationId || null,
          contact_id: contact?.id || null, conversation_id: convId,
          order_id: order?.order_number || null,
          status: 'scheduled',
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Couldn’t book the delivery')

      // Keep the customer's record in step: the delivery date and status the
      // contact panel shows, and an address or phone they didn't have yet.
      const patch: Record<string, any> = { scheduled_delivery: date, delivery_status: 'scheduled' }
      if (saveToProfile && !profileAddr && address.trim()) patch.address = address.trim()
      if (!contact?.phone && phone.trim()) patch.phone = phone.trim()
      if (contact?.id) { try { await (supabase as any).from('contacts').update(patch).eq('id', contact.id) } catch {} }

      // The card in the chat stream: an internal line, never sent to the customer.
      if (convId) {
        try {
          await (supabase as any).from('messages').insert({
            conversation_id: convId, company_id: companyId,
            sender_type: 'system', sender_name: senderName || null,
            content: deliveryLine({ date, window: win, address: address.trim(), orderNumber: order?.order_number }),
            metadata: { kind: 'delivery_scheduled', event_id: d.event?.id || null, date, window: win || null, address: address.trim() || null, order_number: order?.order_number || null, by: senderName || null },
          })
        } catch { /* the delivery is booked either way */ }
      }

      // Only when asked: tell the customer.
      let told = ''
      if (tell && tellCustomer) {
        const when = new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        const text = `Hi ${first}, your delivery is booked for ${when}${win ? `, ${windowPhrase(win)}` : ''}.${address.trim() ? `\nAddress: ${address.trim()}` : ''}\nWe’ll let you know when it’s on its way.`
        try { told = await tellCustomer(text) } catch (e: any) { told = `but the message to ${first} didn’t send (${e?.message || 'error'})` }
      }
      onScheduled?.({ ...patch, _told: told })
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Couldn’t book the delivery')
    } finally { setSaving(false) }
  }

  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const outletName = (l: any) => l.label || l.suburb || 'Outlet'

  return (
    <div className="sds-scrim" onClick={() => { if (!saving) onClose() }}>
      <style href="colvy-schedule-delivery" precedence="default">{SDS_CSS}</style>
      <div className="sds" role="dialog" aria-modal="true" aria-labelledby="sds-title" onClick={e => e.stopPropagation()}>
        <span className="sds-grab" aria-hidden="true" />
        <div className="sds-head">
          <button type="button" className="sds-round" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <h2 id="sds-title">Schedule delivery</h2>
          <button type="button" className="sds-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="sds-body">
          {/* Who it's for */}
          <div className="sds-card">
            <span className="sds-av" aria-hidden="true">{initials || '?'}</span>
            <span className="sds-card-t">
              <b>{name}</b>
              {editPhone
                ? <input className="sds-inline" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" autoFocus
                    onBlur={() => setEditPhone(false)} onKeyDown={e => { if (e.key === 'Enter') setEditPhone(false) }} aria-label="Mobile number" />
                : <small>{phone || 'No phone number'}</small>}
            </span>
            <button type="button" className="sds-pill" onClick={() => setEditPhone(v => !v)}>{phone ? (editPhone ? 'Done' : 'Edit') : 'Add phone'}</button>
          </div>

          {booked.length > 0 && (
            <div className="sds-booked">
              <span className="sds-booked-h">Already booked</span>
              {booked.map(b => {
                const inner = (<>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
                  <span>{deliveryDay(ymd(new Date(b.starts_at)))}{b.time_window ? ` · ${b.time_window}` : ''}</span>
                  {b.status && <em>{STATUS_LABEL[b.status] || b.status}</em>}
                </>)
                return onOpenBooked
                  ? <button key={b.id} type="button" className="sds-booked-r link" onClick={() => onOpenBooked(b.id)} title="Open this delivery">{inner}<svg className="go" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
                  : <span key={b.id} className="sds-booked-r">{inner}</span>
              })}
            </div>
          )}

          <section className="sds-sec">
            <h3>Date</h3>
            <div className="sds-chips">
              {quick.map(q => (
                <button key={q.label} type="button" className={`sds-chip${date === q.value ? ' on' : ''}`} aria-pressed={date === q.value} onClick={() => { setDate(q.value); setErr('') }}>
                  {date === q.value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
                  {q.label}
                </button>
              ))}
            </div>
            <label className="sds-field sds-date" onClick={() => { try { dateRef.current?.showPicker?.() } catch {} }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>
              <input ref={dateRef} type="date" value={date} min={today} onChange={e => { setDate(e.target.value); setErr('') }} aria-label="Delivery date" />
              <span className="sds-date-l">{date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Pick a date'}</span>
            </label>
          </section>

          <section className="sds-sec">
            <h3>Time window</h3>
            <div className="sds-chips">
              {DELIVERY_WINDOWS.map(w => (
                <button key={w} type="button" className={`sds-chip${win === w ? ' on' : ''}`} aria-pressed={win === w} onClick={() => setWin(win === w ? '' : w)}>{w}</button>
              ))}
            </div>
          </section>

          <section className="sds-sec">
            <h3>Address</h3>
            {editAddr || !address ? (
              <>
                <label className="sds-field">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                  <textarea rows={2} value={address} placeholder="Street, suburb, postcode" autoFocus={editAddr} aria-label="Delivery address"
                    onChange={e => { setAddress(e.target.value); setAddrSource('typed') }}
                    onBlur={() => { if (address.trim()) setEditAddr(false) }} />
                </label>
                {!profileAddr && address.trim() && (
                  <label className="sds-check">
                    <input type="checkbox" checked={saveToProfile} onChange={e => setSaveToProfile(e.target.checked)} />
                    Save to {first}’s profile
                  </label>
                )}
                {loading && !address && <p className="sds-hint">Looking for an address on their orders…</p>}
              </>
            ) : (
              <div className="sds-card sds-addr">
                <span className="sds-ic orange">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7.5 7.5 0 0 0-7.5 7.5C4.5 15.1 12 22 12 22s7.5-6.9 7.5-12.5A7.5 7.5 0 0 0 12 2zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" /></svg>
                </span>
                <span className="sds-card-t">
                  <b className="wrap">{address}</b>
                  <small>{addrSource === 'order' ? 'From their latest order' : addrSource === 'profile' ? 'From their profile' : 'Entered here'}</small>
                </span>
                <button type="button" className="sds-pill" onClick={() => setEditAddr(true)}>Edit</button>
              </div>
            )}
            {profileAddr && address && profileAddr !== address && (
              <button type="button" className="sds-alt" onClick={() => { setAddress(profileAddr); setAddrSource('profile'); setEditAddr(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h13l-4-4M17 17H4l4 4" /></svg>
                <span>Use profile address · {profileAddr}</span>
              </button>
            )}
          </section>

          <section className="sds-sec">
            <h3>Order</h3>
            {order && !pickOrder ? (
              <div className="sds-card sds-addr">
                <span className="sds-ic blue">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
                </span>
                <span className="sds-card-t">
                  <b>Order #{order.order_number}</b>
                  <small className="cap">{[fmtDay(order.order_date), order.item_count ? `${order.item_count} item${order.item_count === 1 ? '' : 's'}` : '', fmtMoney(order.total), order.status].filter(Boolean).join(' · ')}</small>
                </span>
                <button type="button" className="sds-pill" onClick={() => setPickOrder(true)}>Change</button>
              </div>
            ) : orders.length ? (
              <div className="sds-orders" role="radiogroup" aria-label="Which order">
                {orders.map(o => (
                  <button key={o.id} type="button" role="radio" aria-checked={order?.id === o.id} className={`sds-order${order?.id === o.id ? ' on' : ''}`} onClick={() => chooseOrder(o)}>
                    <b>#{o.order_number}</b>
                    <span className="cap">{[fmtDay(o.order_date), fmtMoney(o.total), o.status].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={!order} className={`sds-order${!order ? ' on' : ''}`} onClick={() => chooseOrder(null)}>
                  <span className="muted">Not for an order</span>
                </button>
              </div>
            ) : (
              <p className="sds-hint">{loading ? 'Looking for their orders…' : 'No orders found for them.'}</p>
            )}
          </section>

          {locations.length > 1 && (
            <section className="sds-sec">
              <h3>Delivering from</h3>
              <div className="sds-chips">
                <button type="button" className={`sds-chip${!locationId ? ' on' : ''}`} aria-pressed={!locationId} onClick={() => setLocationId('')}>Any outlet</button>
                {locations.map(l => (
                  <button key={l.id} type="button" className={`sds-chip${locationId === l.id ? ' on' : ''}`} aria-pressed={locationId === l.id} onClick={() => setLocationId(l.id)}>{outletName(l)}</button>
                ))}
              </div>
            </section>
          )}

          <section className="sds-sec">
            <h3>Notes</h3>
            <textarea className="sds-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the driver should know" aria-label="Notes for the driver" />
          </section>

          {tellCustomer && (
            <label className="sds-tell">
              <span className="sds-tell-t">
                <b>Text {first} the details</b>
                <small>The day, the window and the address, on their usual channel.</small>
              </span>
              <span className={`sds-switch${tell ? ' on' : ''}`}>
                <input type="checkbox" role="switch" checked={tell} onChange={e => setTell(e.target.checked)} aria-label={`Text ${first} the details`} />
                <i aria-hidden="true" />
              </span>
            </label>
          )}

          <p className="sds-info">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z" /></svg>
            <span>It goes on the team calendar, and a note drops into {first}’s conversation. {tell ? `${first} gets a message with the details.` : 'Nothing is sent to them.'}</span>
          </p>
          {err && <p className="sds-err" role="alert">{err}</p>}
        </div>
      </div>
    </div>
  )
}

export const SDS_CSS = `
.sds-scrim{position:fixed;inset:0;z-index:1150;background:rgba(15,15,20,.42);display:flex;align-items:center;justify-content:center;padding:20px;animation:sdsFade .16s ease-out}
.sds{position:relative;width:480px;max-width:100%;max-height:min(860px,92vh);display:flex;flex-direction:column;background:var(--card,#fff);border-radius:26px;box-shadow:0 30px 70px -20px rgba(16,24,40,.45);overflow:hidden;animation:sdsUp .22s cubic-bezier(.2,.8,.2,1)}
.sds button::before{display:none!important}
.sds-grab{display:none}
.sds-head{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:10px;padding:16px 18px 10px}
.sds-head h2{margin:0;text-align:center;font-size:17px;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.sds-round{width:40px;height:40px;border:0;border-radius:50%;background:#f2f2f5;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer}
.sds-round:hover{background:#e8e8ec}
.sds-save{height:40px;padding:0 22px;border:0;border-radius:999px;background:var(--coral,#ff7a6b);color:#fff;font:inherit;font-size:14.5px;font-weight:750;cursor:pointer;box-shadow:0 6px 16px -8px color-mix(in srgb,var(--coral,#ff7a6b) 80%,transparent)}
.sds-save:disabled{opacity:.6;cursor:default}
.sds-body{overflow-y:auto;padding:6px 18px 22px;display:flex;flex-direction:column;gap:20px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(120,120,128,.35) transparent}
.sds-body::-webkit-scrollbar{width:6px}
.sds-body::-webkit-scrollbar-track{background:transparent}
.sds-body::-webkit-scrollbar-thumb{background:rgba(120,120,128,.35);border-radius:6px}
.sds-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:18px;background:#f2f2f5}
.sds-av{width:44px;height:44px;flex-shrink:0;border-radius:14px;background:color-mix(in srgb,var(--coral,#ff7a6b) 13%,#fff);color:var(--coral,#ff7a6b);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800}
.sds-card-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.sds-card-t b{font-size:15px;font-weight:800;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sds-card-t b.wrap{white-space:normal;font-weight:700;font-size:14.5px;line-height:1.4}
.sds-card-t small{font-size:12.5px;color:var(--slate,#71717a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cap{text-transform:capitalize}
.sds .sds-inline,.sds .sds-inline:focus{width:100%;box-sizing:border-box;border:none!important;border-bottom:1.5px solid var(--coral,#ff7a6b)!important;border-radius:0;background:transparent;padding:2px 0;font:inherit;font-size:14px;color:var(--ink);outline:none!important;box-shadow:none!important}
.sds-pill{flex-shrink:0;height:32px;padding:0 14px;border:0;border-radius:999px;background:var(--card,#fff);color:var(--coral,#ff7a6b);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.sds-pill:hover{background:color-mix(in srgb,var(--coral,#ff7a6b) 8%,#fff)}
.sds-booked{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:16px;background:color-mix(in srgb,#059669 7%,transparent)}
.sds-booked-h{font-size:12px;font-weight:750;color:#047857;text-transform:uppercase;letter-spacing:.04em}
.sds-booked-r{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--ink)}
.sds-booked-r svg{color:#059669;flex-shrink:0}
.sds-booked-r em{margin-left:auto;font-style:normal;font-size:11.5px;font-weight:700;color:#047857;background:color-mix(in srgb,#059669 12%,transparent);padding:2px 8px;border-radius:999px}
.sds-sec h3{margin:0 0 10px;font-size:15px;font-weight:800;color:var(--ink)}
.sds-chips{display:flex;flex-wrap:wrap;gap:8px}
.sds-chip{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 18px;border:0;border-radius:999px;background:#f2f2f5;color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer;transition:background .15s,color .15s}
.sds-chip:hover{background:#e8e8ec}
.sds-chip.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 13%,#fff);color:var(--coral,#ff7a6b)}
.sds-field{display:flex;align-items:flex-start;gap:10px;margin-top:10px;padding:12px 14px;border-radius:14px;background:#f2f2f5;color:var(--slate,#71717a);cursor:text}
/* Flush under its heading only; after chips (the date field under Today / Tomorrow) it keeps its gap. */
.sds-sec>h3+.sds-field{margin-top:0}
.sds-chips+.sds-field{margin-top:10px}
.sds-field svg{flex-shrink:0;margin-top:1px}
.sds .sds-field textarea,.sds .sds-field textarea:focus{flex:1;min-width:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none!important;padding:0;font:inherit;font-size:14.5px;line-height:1.45;color:var(--ink);resize:none}
.sds-date{position:relative;align-items:center;cursor:pointer}
.sds .sds-date input{position:absolute;inset:0;opacity:0;cursor:pointer;border:0;width:100%}
.sds-date-l{font-size:14.5px;font-weight:600;color:var(--ink)}
.sds-check{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.sds-check input{width:17px;height:17px;accent-color:var(--coral,#ff7a6b)}
.sds-hint{margin:6px 2px 0;font-size:13px;color:var(--slate,#71717a)}
.sds-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center}
.sds-ic.orange{background:#fff1e6;color:#ea580c}.sds-ic.blue{background:#eef4ff;color:#2563eb}
.sds-alt{display:flex;align-items:center;gap:6px;margin-top:9px;padding:0 4px;border:0;background:none;color:var(--coral,#ff7a6b);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;max-width:100%;text-align:left}
.sds-alt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sds-orders{display:flex;flex-direction:column;gap:8px}
.sds-order{display:flex;align-items:center;gap:10px;padding:12px 14px;border:0;border-radius:14px;background:#f2f2f5;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
.sds-order b{font-size:14.5px;font-weight:800}
.sds-order span{flex:1;min-width:0;font-size:13px;color:var(--slate,#71717a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sds-order .muted{color:var(--slate,#71717a)}
.sds-order.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 13%,#fff);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--coral,#ff7a6b) 45%,transparent)}
.sds .sds-notes,.sds .sds-notes:focus{width:100%;box-sizing:border-box;min-height:84px;padding:12px 14px;border:none!important;border-radius:14px;background:#f2f2f5;font:inherit;font-size:14.5px;line-height:1.45;color:var(--ink);resize:vertical;outline:none!important;box-shadow:none!important}
.sds-tell{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:#f7f7f9;cursor:pointer}
.sds-tell-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.sds-tell-t b{font-size:14px;font-weight:750;color:var(--ink)}.sds-tell-t small{font-size:12.5px;color:var(--slate,#71717a)}
.sds-switch{position:relative;width:44px;height:26px;flex-shrink:0;border-radius:999px;background:#d4d4d8;transition:background .18s}
.sds-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.sds-switch i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s}
.sds-switch.on{background:var(--coral,#ff7a6b)}.sds-switch.on i{transform:translateX(18px)}
.sds-switch input:focus-visible+i{outline:2px solid var(--coral,#ff7a6b);outline-offset:3px}
.sds-info{display:flex;align-items:flex-start;gap:8px;margin:0;padding:0 4px;font-size:12.5px;line-height:1.5;color:var(--slate,#71717a)}
.sds-info svg{flex-shrink:0;margin-top:2px}
.sds-err{margin:0;padding:10px 12px;border-radius:12px;background:#fef3f2;color:#b42318;font-size:13px;font-weight:600}
.sds-booked-r.link{width:100%;border:0;background:none;padding:2px 0;font:inherit;text-align:left;cursor:pointer;border-radius:8px}
.sds-booked-r.link:hover span{text-decoration:underline;text-underline-offset:3px}
.sds-booked-r .go{flex-shrink:0;color:#047857;opacity:.6}
.sds-booked-r.link em{margin-left:auto}
/* The delivery itself (DeliveryDetailsSheet) */
.sds-detail .sds-head{grid-template-columns:40px 1fr 40px}
.sds-center{text-align:center;padding:30px 0}
.sds-hero{display:flex;align-items:center;gap:14px;padding:16px;border-radius:22px;background:#ecfdf5}
.sds-hero-i{width:56px;height:56px;flex-shrink:0;border-radius:18px;background:var(--card,#fff);color:#059669;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(16,24,40,.06)}
.sds-hero-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sds-hero-t b{font-size:18px;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.sds-hero-t small{font-size:13.5px;color:var(--slate,#71717a)}
.sds-status{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:750;padding:5px 10px;border-radius:999px}
.sds-status.t-green{color:#059669;background:transparent}.sds-status.t-blue{color:#2563eb;background:#eff6ff}
.sds-status.t-amber{color:#b45309;background:#fffbeb}.sds-status.t-violet{color:#7c3aed;background:#f5f3ff}.sds-status.t-red{color:#dc2626;background:#fef2f2}
.sds-dir{display:inline-flex;align-items:center;gap:6px;height:36px;text-decoration:none}
.sds-link{width:100%;border:0;font:inherit;text-align:left;cursor:pointer;transition:background .15s}
.sds-link:hover:not(:disabled){background:#ececf0}
.sds-link:disabled{cursor:default}
.sds-notes-v{margin:0;padding:12px 14px;border-radius:14px;background:#f2f2f5;font-size:14px;line-height:1.5;color:var(--ink);white-space:pre-wrap}
.sds-meta{margin:0;text-align:center;font-size:13px;color:var(--slate,#71717a)}
.sds-actions{display:flex;flex-direction:column;gap:10px}
.sds-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px}
.sds-sec .sds-row2{margin-top:14px}
.sds-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 16px;border:0;border-radius:999px;background:#f2f2f5;color:var(--ink);font:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s,filter .15s}
.sds-btn:hover:not(:disabled){background:#e8e8ec}
.sds-btn:disabled{opacity:.55;cursor:default}
.sds-btn.wide{width:100%}
.sds-btn.primary{background:#059669;color:#fff}.sds-btn.primary:hover:not(:disabled){background:#047857}
.sds-btn.danger{background:#fdecec;color:#dc2626}.sds-btn.danger:hover:not(:disabled){background:#fbdcdc}
.sds-chat{display:inline-flex;align-items:center;justify-content:center;gap:7px;align-self:center;height:36px;padding:0 14px;border:0;border-radius:999px;background:none;color:var(--coral,#ff7a6b);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.sds-chat:hover{background:color-mix(in srgb,var(--coral,#ff7a6b) 9%,transparent)}
.sds-confirm{display:flex;flex-direction:column;gap:4px;padding:12px;border-radius:18px;background:#fef2f2;font-size:13.5px;font-weight:600;color:#b42318}
@keyframes sdsFade{from{opacity:0}to{opacity:1}}
@keyframes sdsUp{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .sds-scrim{align-items:flex-end;padding:0}
  .sds{width:100%;max-height:92vh;border-radius:26px 26px 0 0;animation:sdsSheet .26s cubic-bezier(.2,.8,.2,1)}
  .sds-grab{display:block;width:40px;height:5px;margin:8px auto 0;border-radius:999px;background:#d4d4d8}
  .sds-head{padding-top:8px}
  .sds-body{padding-bottom:calc(22px + env(safe-area-inset-bottom))}
}
@keyframes sdsSheet{from{transform:translateY(100%)}to{transform:none}}
[data-theme="dark"] .sds-round,[data-theme="dark"] .sds-card,[data-theme="dark"] .sds-chip,[data-theme="dark"] .sds-field,[data-theme="dark"] .sds-order,[data-theme="dark"] .sds .sds-notes{background:#2a2a2e}
[data-theme="dark"] .sds-chip:hover,[data-theme="dark"] .sds-round:hover{background:#34343a}
[data-theme="dark"] .sds-chip.on,[data-theme="dark"] .sds-order.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 18%,#1c1c1f)}
[data-theme="dark"] .sds-pill{background:#1c1c1f}
[data-theme="dark"] .sds-tell{background:#232327}
[data-theme="dark"] .sds-switch{background:#3a3a40}
[data-theme="dark"] .sds-av{background:color-mix(in srgb,var(--coral,#ff7a6b) 18%,#1c1c1f)}
[data-theme="dark"] .sds-ic.orange{background:#3a2516}[data-theme="dark"] .sds-ic.blue{background:#1c2740}
[data-theme="dark"] .sds-err{background:#3a1d1b;color:#fda29b}
[data-theme="dark"] .sds-booked-r em,[data-theme="dark"] .sds-booked-h{color:#34d399}
[data-theme="dark"] .sds-hero{background:color-mix(in srgb,#10b981 12%,#1c1c1f)}[data-theme="dark"] .sds-hero-i{background:#1c1c1f}
[data-theme="dark"] .sds-btn,[data-theme="dark"] .sds-notes-v{background:#2a2a2e}[data-theme="dark"] .sds-btn:hover:not(:disabled),[data-theme="dark"] .sds-link:hover:not(:disabled){background:#34343a}
[data-theme="dark"] .sds-btn.primary{background:#059669}[data-theme="dark"] .sds-btn.danger{background:#3a1d1b;color:#fda29b}[data-theme="dark"] .sds-confirm{background:#2b1a19;color:#fda29b}
[data-theme="dark"] .sds-status.t-blue{background:#172036;color:#93c5fd}[data-theme="dark"] .sds-status.t-amber{background:#2d2312;color:#fcd34d}[data-theme="dark"] .sds-status.t-violet{background:#241b38;color:#c4b5fd}[data-theme="dark"] .sds-status.t-red{background:#3a1d1b;color:#fda29b}[data-theme="dark"] .sds-status.t-green{color:#34d399}
`
