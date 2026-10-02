'use client'

import { useCallback, useEffect, useState } from 'react'
import SlotPicker, { viewerTz, tzShort } from '@/components/booking/SlotPicker'
import { Shell } from '@/components/booking/BookingFlow'
import { buildIcs, googleCalendarUrl } from '@/lib/booking-ics'

// The customer's own booking (link from the confirmation SMS / email):
// confirmation, add to calendar, reschedule, cancel. Also the landing page
// after Stripe Checkout, where it confirms the payment.

const money = (c: number, cur = 'aud') => {
  const n = (c || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n}` }
}

export default function ManageBooking({ token }: { token: string }) {
  const [b, setB] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view')
  const [slot, setSlot] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [payCancelled, setPayCancelled] = useState(false)

  const post = useCallback(async (body: any) => {
    const r = await fetch('/api/book/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Something went wrong')
    return d
  }, [token])

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setIsNew(sp.get('new') === '1' || sp.get('paid') === '1')
    setPayCancelled(sp.get('payment') === 'cancelled')
    const clean = () => { try { window.history.replaceState(null, '', window.location.pathname) } catch {} }
    ;(async () => {
      try {
        if (sp.get('paid') === '1') {
          setVerifying(true)
          // The webhook usually wins; verify covers a slow one. Retry briefly.
          for (let i = 0; i < 6; i++) {
            const d = await post({ action: 'verify' })
            setB(d.booking)
            if (d.booking?.status !== 'pending' && d.booking?.status !== 'expired') break
            await new Promise(r => setTimeout(r, 2000))
          }
          setVerifying(false)
          clean()
          return
        }
        const r = await fetch(`/api/book/manage?token=${encodeURIComponent(token)}`)
        const d = await r.json()
        if (!r.ok) { setError(d.error || 'Booking not found'); return }
        setB(d.booking)
        if (sp.get('new') === '1') clean()
      } catch (e: any) { setError(e.message || 'Couldn’t load your booking'); setVerifying(false) }
    })()
  }, [token, post])

  useEffect(() => { if (b?.company?.name) try { document.title = `Your booking — ${b.company.name}` } catch {} }, [b?.company?.name])

  const fetchSlots = useCallback(async (from: string, to: string) => {
    const r = await fetch(`/api/book/manage?token=${encodeURIComponent(token)}&op=slots&from=${from}&to=${to}`)
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Couldn’t load times')
    return d
  }, [token])

  const accent = b?.company?.accent_color && /^#[0-9a-f]{6}$/i.test(b.company.accent_color) ? b.company.accent_color : '#ff7a6b'

  if (error) return <Shell accent="#ff7a6b"><div className="bk-card" style={{ display: 'block', maxWidth: 520, padding: '48px 28px', textAlign: 'center' }}><div style={{ fontSize: 34 }}>🔍</div><div style={{ fontWeight: 800, fontSize: 18, margin: '10px 0 6px' }}>Booking not found</div><div style={{ color: '#6b7280', fontSize: 14 }}>{error}</div></div></Shell>
  if (!b) return <Shell accent="#ff7a6b"><div style={{ textAlign: 'center', padding: 80, color: '#9ca3af', fontSize: 14 }}>{verifying ? 'Confirming your payment…' : 'Loading…'}</div></Shell>

  const tz = viewerTz()
  const start = Date.parse(b.starts_at), end = Date.parse(b.ends_at)
  const when = new Date(start).toLocaleString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = `${fmtT(start, tz)} – ${fmtT(end, tz)} ${tzShort(tz)}`
  const invite = { uid: b.id, title: `${b.service.name} — ${b.company.name}`, startMs: start, endMs: end, location: b.where || null, description: `Manage your booking: ${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}`, url: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : null }
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(invite)], { type: 'text/calendar' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'booking.ics'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const status = b.status as string
  const hero = status === 'confirmed'
    ? { icon: '✓', bg: '#ecfdf5', fg: '#059669', title: isNew ? 'You’re booked in!' : 'Your booking is confirmed', sub: isNew ? 'We’ve sent the details to you. You can manage your booking here any time.' : '' }
    : status === 'pending'
      ? { icon: '⏳', bg: '#fffbeb', fg: '#b45309', title: payCancelled ? 'Payment not finished' : 'Waiting for payment', sub: `Your time is held until ${fmtT(Date.parse(b.hold_expires_at), tz)}. Complete payment to confirm it.` }
      : status === 'expired'
        ? { icon: '⌛', bg: '#f3f4f6', fg: '#6b7280', title: 'This hold has expired', sub: 'The time wasn’t confirmed because payment wasn’t completed. You can book again below.' }
        : status === 'cancelled'
          ? { icon: '✕', bg: '#fef2f2', fg: '#dc2626', title: 'This booking is cancelled', sub: b.cancel_reason && b.cancelled_by === 'system' ? b.cancel_reason + (b.refunded_cents ? ` — ${money(b.refunded_cents, b.currency)} refunded.` : '.') : b.refunded_cents ? `${money(b.refunded_cents, b.currency)} has been refunded to your card.` : '' }
          : status === 'completed'
            ? { icon: '★', bg: '#eff6ff', fg: '#2563eb', title: 'Thanks for coming in!', sub: '' }
            : { icon: '•', bg: '#f3f4f6', fg: '#6b7280', title: 'Booking', sub: '' }

  const doReschedule = async () => {
    if (!slot) return
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'reschedule', startsAt: slot }); setB(d.booking); setMode('view'); setSlot(null); setMsg('Done — your booking has moved. We’ve sent you the new details.') }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const doCancel = async () => {
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'cancel', reason }); setB(d.booking); setMode('view') }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const doPay = async () => {
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'pay' }); window.location.href = d.checkoutUrl }
    catch (e: any) { setMsg(e.message); setBusy(false) }
  }

  const pol = b.policy || {}
  const cutoff = pol.cutoffMs ? new Date(pol.cutoffMs).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <Shell accent={accent}>
      <div className="bk-card" style={{ display: 'block', maxWidth: 620 }}>
        <div style={{ padding: '26px 28px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          {b.company.logo_url ? <img src={b.company.logo_url} alt="" style={{ height: 34, maxWidth: 140, objectFit: 'contain' }} /> : <div style={{ fontWeight: 800, color: '#374151' }}>{b.company.name}</div>}
        </div>

        <div style={{ padding: '22px 28px', textAlign: 'center' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', background: hero.bg, color: hero.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, animation: isNew && status === 'confirmed' ? 'bkpop .45s cubic-bezier(.2,1.6,.4,1)' : undefined }}>{hero.icon}</div>
          <h1 style={{ margin: '14px 0 6px', fontSize: 23, color: '#111', fontWeight: 800 }}>{hero.title}</h1>
          {hero.sub && <p style={{ margin: '0 auto', maxWidth: 440, color: '#6b7280', fontSize: 14, lineHeight: 1.55 }}>{hero.sub}</p>}
          <style>{`@keyframes bkpop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        </div>

        <div style={{ margin: '0 28px', border: '1px solid #f1f1f1', borderRadius: 14, overflow: 'hidden' }}>
          <Detail k="What" v={<>{b.service.name}{b.staff_name ? <span style={{ color: '#6b7280', fontWeight: 500 }}> with {b.staff_name}</span> : null}</>} />
          <Detail k="When" v={<><div>{when}</div><div style={{ color: '#6b7280', fontWeight: 500, marginTop: 2 }}>{time}</div></>} strike={status === 'cancelled'} />
          {b.where && <Detail k="Where" v={/^https?:\/\//.test(b.where) && status === 'confirmed' ? <a href={b.where} target="_blank" rel="noreferrer" style={{ color: accent }}>Join video call ↗</a> : b.where} />}
          {b.customer_name && <Detail k="Name" v={b.customer_name} />}
          {b.price_cents > 0 && (
            <Detail k="Payment" v={
              b.payment_status === 'paid' ? <>{money(b.amount_due_cents, b.currency)} paid{b.payment_mode === 'deposit' ? <span style={{ color: '#6b7280', fontWeight: 500 }}> · {money(Math.max(0, b.price_cents - b.amount_due_cents), b.currency)} due on the day</span> : null}</>
                : b.payment_status === 'refunded' || b.payment_status === 'partially_refunded' ? <>{money(b.refunded_cents, b.currency)} refunded</>
                  : b.payment_status === 'pending' ? <>{money(b.amount_due_cents, b.currency)} to pay now</>
                    : <>{money(b.price_cents, b.currency)} · pay on the day</>
            } />
          )}
        </div>

        {b.confirmation_note && status === 'confirmed' && (
          <div style={{ margin: '14px 28px 0', padding: '12px 14px', borderRadius: 12, background: `color-mix(in srgb, ${accent} 7%, #fff)`, color: '#374151', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{b.confirmation_note}</div>
        )}

        {msg && <div style={{ margin: '14px 28px 0', padding: '10px 12px', borderRadius: 10, background: msg.startsWith('Done') ? '#ecfdf5' : '#fef2f2', color: msg.startsWith('Done') ? '#047857' : '#b91c1c', fontSize: 13.5 }}>{msg}</div>}

        <div style={{ padding: '18px 28px 26px' }}>
          {status === 'pending' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bk-primary" disabled={busy} onClick={doPay}>Complete payment · {money(b.amount_due_cents, b.currency)}</button>
              <button onClick={async () => { setBusy(true); try { const d = await post({ action: 'cancel' }); setB(d.booking) } catch (e: any) { setMsg(e.message) } finally { setBusy(false) } }} disabled={busy} style={ghost}>Release this time</button>
            </div>
          )}

          {status === 'confirmed' && mode === 'view' && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <a href={googleCalendarUrl(invite)} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: 'none' }}>＋ Google Calendar</a>
                <button onClick={downloadIcs} style={ghost}>＋ Apple / Outlook</button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #f1f1f1', paddingTop: 16 }}>
                {pol.canReschedule && <button className="bk-primary" onClick={() => { setMode('reschedule'); setMsg('') }}>Reschedule</button>}
                {pol.canCancel && <button onClick={() => { setMode('cancel'); setMsg('') }} style={{ ...ghost, color: '#b91c1c' }}>Cancel booking</button>}
              </div>
              <p style={{ marginTop: 12, fontSize: 12.5, color: '#9ca3af', lineHeight: 1.55 }}>
                {pol.beforeCutoff
                  ? <>Free changes until {cutoff}{pol.paid && pol.refund_on_cancel ? ' (full refund if you cancel)' : ''}.</>
                  : pol.canCancel ? <>It’s within {pol.cancel_hours} hours of your booking{pol.paid ? ', so a cancellation won’t be refunded' : ''}. To move it, please contact {b.company.name}.</>
                    : <>To change this booking, please contact {b.company.name}.</>}
              </p>
            </>
          )}

          {status === 'confirmed' && mode === 'reschedule' && (
            <>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, color: '#111' }}>Choose a new time</div>
              <SlotPicker accent={accent} businessTz={b.timezone} fetchSlots={fetchSlots} selected={slot} onSelect={setSlot} compact />
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button className="bk-primary" disabled={!slot || busy} onClick={doReschedule}>{busy ? 'Moving…' : slot ? `Move to ${new Date(slot).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Pick a time'}</button>
                <button onClick={() => { setMode('view'); setSlot(null) }} style={ghost}>Keep current time</button>
              </div>
            </>
          )}

          {status === 'confirmed' && mode === 'cancel' && (
            <>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: '#111' }}>Cancel this booking?</div>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.55 }}>
                {pol.refundOnCancel ? `You’ll be refunded ${money(b.amount_due_cents, b.currency)} to your card.` : pol.paid ? `Because it’s within ${pol.cancel_hours} hours, your ${b.payment_mode === 'deposit' ? 'deposit' : 'payment'} won’t be refunded.` : 'Your time will be released for someone else.'}
              </p>
              <textarea className="bk-in" rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="bk-primary" style={{ background: '#dc2626' }} disabled={busy} onClick={doCancel}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
                {pol.canReschedule && <button onClick={() => setMode('reschedule')} style={ghost}>Reschedule instead</button>}
                <button onClick={() => setMode('view')} style={ghost}>Keep booking</button>
              </div>
            </>
          )}

          {(status === 'cancelled' || status === 'expired' || status === 'completed') && (
            <a href={b.book_again_url} className="bk-primary" style={{ textDecoration: 'none' }}>Book again</a>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', margin: '18px 0 8px' }}>Powered by <a href="https://colvy.com" style={{ color: '#9ca3af' }}>Colvy</a></div>
    </Shell>
  )
}

const fmtT = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

function Detail({ k, v, strike }: { k: string; v: React.ReactNode; strike?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '12px 16px', borderTop: '1px solid #f5f5f5', fontSize: 14 }}>
      <div style={{ width: 70, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{k}</div>
      <div style={{ color: '#111', fontWeight: 600, minWidth: 0, textDecoration: strike ? 'line-through' : undefined, wordBreak: 'break-word' }}>{v}</div>
    </div>
  )
}

const ghost: React.CSSProperties = { height: 42, padding: '0 16px', borderRadius: 11, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center' }
