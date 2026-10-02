'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SlotPicker, { viewerTz, tzShort } from '@/components/booking/SlotPicker'
import { Shell } from '@/components/booking/BookingFlow'
import { StatusMark, GoogleCalendarIcon, AppleIcon, OutlookIcon } from '@/components/booking/motion'
import { googleCalendarUrl } from '@/lib/booking-ics'

// The customer's own booking (link from the confirmation SMS / email):
// confirmation, add to calendar, reschedule, cancel. Also the landing page
// after Stripe Checkout, where it confirms the payment.

const money = (c: number, cur = 'aud') => {
  const n = (c || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n}` }
}
const fmtT = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

// The hero eases up and fades as you scroll — a gentle parallax.
function useHeroParallax(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const run = () => {
      raf = 0
      const y = Math.min(window.scrollY, 320)
      el.style.transform = `translate3d(0, ${y * 0.32}px, 0) scale(${1 - y / 2400})`
      el.style.opacity = String(Math.max(0.15, 1 - y / 260))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [ready])
  return ref
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
  const [markKey, setMarkKey] = useState(0)          // replay the mark when the status changes

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

  const heroRef = useHeroParallax(!!b)

  useEffect(() => { if (b?.company?.name) try { document.title = `Your booking — ${b.company.name}` } catch {} }, [b?.company?.name])

  const fetchSlots = useCallback(async (from: string, to: string) => {
    const r = await fetch(`/api/book/manage?token=${encodeURIComponent(token)}&op=slots&from=${from}&to=${to}`)
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Couldn’t load times')
    return d
  }, [token])

  const accent = b?.company?.accent_color && /^#[0-9a-f]{6}$/i.test(b.company.accent_color) ? b.company.accent_color : '#ff7a6b'

  if (error) return (
    <Shell accent="#ff7a6b">
      <div className="bk-card bk-card-in" style={{ display: 'block', maxWidth: 520, padding: '48px 28px', textAlign: 'center' }}>
        <StatusMark kind="neutral" size={72} />
        <div style={{ fontWeight: 800, fontSize: 19, margin: '16px 0 6px' }}>Booking not found</div>
        <div style={{ color: '#6b7280', fontSize: 14 }}>{error}</div>
      </div>
    </Shell>
  )
  if (!b) return (
    <Shell accent="#ff7a6b">
      <div className="bk-card bk-card-in" style={{ display: 'block', maxWidth: 520, padding: '56px 28px', textAlign: 'center' }}>
        {verifying ? <><StatusMark kind="pending" size={72} /><div style={{ fontWeight: 700, fontSize: 16, marginTop: 16, color: '#374151' }}>Confirming your payment…</div></>
          : <><div className="bk-skel" style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 18px' }} /><div className="bk-skel" style={{ width: '60%', height: 22, margin: '0 auto 10px' }} /><div className="bk-skel" style={{ width: '80%', height: 120, margin: '22px auto 0', borderRadius: 14 }} /></>}
      </div>
    </Shell>
  )

  const tz = viewerTz()
  const start = Date.parse(b.starts_at), end = Date.parse(b.ends_at)
  const when = new Date(start).toLocaleString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = `${fmtT(start, tz)} – ${fmtT(end, tz)} ${tzShort(tz, start)}`
  const pageUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  const invite = { uid: b.id, title: `${b.service.name} — ${b.company.name}`, startMs: start, endMs: end, location: b.where || null, description: `Manage your booking: ${pageUrl}`, url: pageUrl }
  const icsUrl = `/api/book/manage?token=${encodeURIComponent(token)}&op=ics`

  const status = b.status as string
  const hero = status === 'confirmed'
    ? { kind: 'success' as const, title: isNew ? 'You’re booked in' : 'Your booking is confirmed', sub: isNew ? 'We’ve sent the details to you. You can manage your booking here any time.' : '' }
    : status === 'pending'
      ? { kind: 'pending' as const, title: payCancelled ? 'Payment not finished' : 'Waiting for payment', sub: `Your time is held until ${fmtT(Date.parse(b.hold_expires_at), tz)}. Complete payment to confirm it.` }
      : status === 'expired'
        ? { kind: 'neutral' as const, title: 'This hold has expired', sub: 'The time wasn’t confirmed because payment wasn’t completed. You can book again below.' }
        : status === 'cancelled'
          ? { kind: 'cancelled' as const, title: 'Booking cancelled', sub: b.cancel_reason && b.cancelled_by === 'system' ? b.cancel_reason + (b.refunded_cents ? ` — ${money(b.refunded_cents, b.currency)} refunded.` : '.') : b.refunded_cents ? `${money(b.refunded_cents, b.currency)} has been refunded to your card.` : '' }
          : status === 'completed'
            ? { kind: 'done' as const, title: 'Thanks for coming in!', sub: '' }
            : { kind: 'neutral' as const, title: 'Booking', sub: '' }

  const doReschedule = async () => {
    if (!slot) return
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'reschedule', startsAt: slot }); setB(d.booking); setMode('view'); setSlot(null); setMsg('Done — your booking has moved. We’ve sent you the new details.'); setMarkKey(k => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const doCancel = async () => {
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'cancel', reason }); setB(d.booking); setMode('view'); setMarkKey(k => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const doPay = async () => {
    setBusy(true); setMsg('')
    try { const d = await post({ action: 'pay' }); window.location.href = d.checkoutUrl }
    catch (e: any) { setMsg(e.message); setBusy(false) }
  }

  const pol = b.policy || {}
  const cutoff = pol.cutoffMs ? new Date(pol.cutoffMs).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
  const rows: [string, React.ReactNode, boolean?][] = [
    ['What', <>{b.service.name}{b.staff_name ? <span style={{ color: '#6b7280', fontWeight: 500 }}> with {b.staff_name}</span> : null}</>],
    ['When', <><div>{when}</div><div style={{ color: '#6b7280', fontWeight: 500, marginTop: 2 }}>{time}</div></>, status === 'cancelled'],
    ...(b.where ? [['Where', /^https?:\/\//.test(b.where) && status === 'confirmed' ? <a href={b.where} target="_blank" rel="noreferrer" style={{ color: accent }}>Join video call ↗</a> : b.where] as [string, React.ReactNode]] : []),
    ...(b.customer_name ? [['Name', b.customer_name] as [string, React.ReactNode]] : []),
    ...(b.price_cents > 0 ? [['Payment',
      b.payment_status === 'paid' ? <>{money(b.amount_due_cents, b.currency)} paid{b.payment_mode === 'deposit' ? <span style={{ color: '#6b7280', fontWeight: 500 }}> · {money(Math.max(0, b.price_cents - b.amount_due_cents), b.currency)} due on the day</span> : null}</>
        : b.payment_status === 'refunded' || b.payment_status === 'partially_refunded' ? <>{money(b.refunded_cents, b.currency)} refunded</>
          : b.payment_status === 'pending' ? <>{money(b.amount_due_cents, b.currency)} to pay now</>
            : <>{money(b.price_cents, b.currency)} · pay on the day</>] as [string, React.ReactNode]] : []),
  ]

  return (
    <Shell accent={accent}>
      <style>{`
        .mb-cal{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .mb-calbtn{display:flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:0 12px;border-radius:13px;border:1px solid rgba(0,0,0,.08);background:#fff;color:#111;font-weight:650;font-size:14px;text-decoration:none;cursor:pointer;font-family:inherit;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .25s,border-color .2s}
        .mb-calbtn:hover{transform:translate3d(0,-2px,0);box-shadow:0 10px 22px -12px rgba(0,0,0,.25);border-color:rgba(0,0,0,.12)}
        .mb-calbtn:active{transform:scale(.96);transition-duration:.08s}
        @media(max-width:420px){.mb-calbtn{flex-direction:column;gap:5px;min-height:66px;font-size:12.5px;padding:8px 6px}}
        .mb-ghost{min-height:44px;padding:0 16px;border-radius:12px;border:1.5px solid #e5e7eb;background:#fff;color:#374151;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;transition:transform .2s cubic-bezier(.22,1,.36,1),border-color .2s,background .2s}
        .mb-ghost:hover{border-color:#d1d5db;background:#fafafa}
        .mb-ghost:active{transform:scale(.97);transition-duration:.08s}
        .mb-actions{display:flex;gap:10px;flex-wrap:wrap}
        @media(max-width:480px){.mb-actions>*{flex:1 1 auto}}
        .mb-pad{padding-left:28px;padding-right:28px}
        @media(max-width:480px){.mb-pad{padding-left:18px;padding-right:18px}}
        .mb-panel{animation:bkRise .45s cubic-bezier(.22,1,.36,1) backwards}
        @media(max-width:820px){.mb-cta.bk-cta{margin:18px -28px -26px;padding-left:28px;padding-right:28px}}
        @media(max-width:480px){.mb-cta.bk-cta{margin:18px -18px -26px;padding-left:18px;padding-right:18px}}
      `}</style>
      <div className="bk-card bk-card-in" style={{ display: 'block', maxWidth: 620 }}>
        <div className="mb-pad" style={{ paddingTop: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          {b.company.logo_url ? <img src={b.company.logo_url} alt="" style={{ height: 32, maxWidth: 140, objectFit: 'contain' }} /> : <div style={{ fontWeight: 800, color: '#374151' }}>{b.company.name}</div>}
        </div>

        <div ref={heroRef} className="mb-pad" style={{ paddingTop: 18, paddingBottom: 22, textAlign: 'center', willChange: 'transform, opacity' }}>
          <StatusMark key={`${status}:${markKey}`} kind={hero.kind} size={92} celebrate={isNew || markKey > 0} />
          <h1 className="bk-rise" style={{ margin: '16px 0 6px', fontSize: 25, color: '#111', fontWeight: 800, letterSpacing: '-.01em', animationDelay: '.55s' }}>{hero.title}</h1>
          {hero.sub && <p className="bk-rise" style={{ margin: '0 auto', maxWidth: 440, color: '#6b7280', fontSize: 14.5, lineHeight: 1.55, animationDelay: '.65s' }}>{hero.sub}</p>}
        </div>

        <div className="mb-pad">
          <div style={{ border: '1px solid rgba(0,0,0,.06)', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
            {rows.map(([k, v, strike], i) => (
              <div key={k} className="bk-rise" style={{ display: 'flex', gap: 14, padding: '13px 16px', borderTop: i ? '1px solid #f5f5f5' : 'none', fontSize: 14, animationDelay: `${0.7 + i * 0.06}s` }}>
                <div style={{ width: 70, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{k}</div>
                <div style={{ color: '#111', fontWeight: 600, minWidth: 0, textDecoration: strike ? 'line-through' : undefined, wordBreak: 'break-word' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {b.confirmation_note && status === 'confirmed' && (
          <div className="mb-pad bk-rise" style={{ marginTop: 14, animationDelay: '1s' }}>
            <div style={{ padding: '12px 14px', borderRadius: 14, background: `color-mix(in srgb, ${accent} 8%, #fff)`, color: '#374151', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{b.confirmation_note}</div>
          </div>
        )}

        {msg && <div className="mb-pad mb-panel" style={{ marginTop: 14 }}><div style={{ padding: '10px 12px', borderRadius: 12, background: msg.startsWith('Done') ? '#ecfdf5' : '#fef2f2', color: msg.startsWith('Done') ? '#047857' : '#b91c1c', fontSize: 13.5 }}>{msg}</div></div>}

        <div className="mb-pad" style={{ paddingTop: 18, paddingBottom: 26 }}>
          {status === 'pending' && (
            <div className="mb-actions">
              <button className="bk-primary" disabled={busy} onClick={doPay}>Complete payment · {money(b.amount_due_cents, b.currency)}</button>
              <button className="mb-ghost" disabled={busy} onClick={async () => { setBusy(true); try { const d = await post({ action: 'cancel' }); setB(d.booking) } catch (e: any) { setMsg(e.message) } finally { setBusy(false) } }}>Release this time</button>
            </div>
          )}

          {status === 'confirmed' && mode === 'view' && (
            <div className="mb-panel" key="view">
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 9 }}>Add to your calendar</div>
              <div className="mb-cal" style={{ marginBottom: 18 }}>
                <a className="mb-calbtn" href={googleCalendarUrl(invite)} target="_blank" rel="noreferrer"><GoogleCalendarIcon size={22} /> Google</a>
                <a className="mb-calbtn" href={icsUrl}><AppleIcon size={21} /> Apple</a>
                <a className="mb-calbtn" href={icsUrl}><OutlookIcon size={22} /> Outlook</a>
              </div>
              <div className="mb-actions" style={{ borderTop: '1px solid #f1f1f1', paddingTop: 16 }}>
                {pol.canReschedule && <button className="bk-primary" onClick={() => { setMode('reschedule'); setMsg('') }}>Reschedule</button>}
                {pol.canCancel && <button className="mb-ghost" onClick={() => { setMode('cancel'); setMsg('') }} style={{ color: '#b91c1c' }}>Cancel booking</button>}
              </div>
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: '#9ca3af', lineHeight: 1.55 }}>
                {pol.beforeCutoff
                  ? <>Free changes until {cutoff}{pol.paid && pol.refund_on_cancel ? ' (full refund if you cancel)' : ''}.</>
                  : pol.canCancel ? <>It’s within {pol.cancel_hours} hours of your booking{pol.paid ? ', so a cancellation won’t be refunded' : ''}. To move it, please contact {b.company.name}.</>
                    : <>To change this booking, please contact {b.company.name}.</>}
              </p>
            </div>
          )}

          {status === 'confirmed' && mode === 'reschedule' && (
            <div className="mb-panel" key="resched">
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14, color: '#111' }}>Choose a new time</div>
              <SlotPicker accent={accent} businessTz={b.timezone} fetchSlots={fetchSlots} selected={slot} onSelect={setSlot} compact />
              <div className="bk-cta mb-cta on" style={{ justifyContent: 'flex-start' }}>
                <button className="bk-primary" disabled={!slot || busy} onClick={doReschedule}>{busy ? 'Moving…' : slot ? `Move to ${new Date(slot).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Pick a time'}</button>
                <button className="mb-ghost" onClick={() => { setMode('view'); setSlot(null) }}>Keep current</button>
              </div>
            </div>
          )}

          {status === 'confirmed' && mode === 'cancel' && (
            <div className="mb-panel" key="cancel">
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6, color: '#111' }}>Cancel this booking?</div>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.55 }}>
                {pol.refundOnCancel ? `You’ll be refunded ${money(b.amount_due_cents, b.currency)} to your card.` : pol.paid ? `Because it’s within ${pol.cancel_hours} hours, your ${b.payment_mode === 'deposit' ? 'deposit' : 'payment'} won’t be refunded.` : 'Your time will be released for someone else.'}
              </p>
              <textarea className="bk-in" rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
              <div className="mb-actions" style={{ marginTop: 12 }}>
                <button className="bk-primary" style={{ background: '#dc2626', boxShadow: '0 8px 20px -10px rgba(220,38,38,.7)' }} disabled={busy} onClick={doCancel}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
                {pol.canReschedule && <button className="mb-ghost" onClick={() => setMode('reschedule')}>Reschedule instead</button>}
                <button className="mb-ghost" onClick={() => setMode('view')}>Keep booking</button>
              </div>
            </div>
          )}

          {(status === 'cancelled' || status === 'expired' || status === 'completed') && (
            <a href={b.book_again_url} className="bk-primary" style={{ textDecoration: 'none' }}>Book again</a>
          )}
        </div>
      </div>
      <div className="bk-shell-foot" style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', margin: '18px 0 8px' }}>Powered by <a href="https://colvy.com" style={{ color: '#9ca3af' }}>Colvy</a></div>
    </Shell>
  )
}
