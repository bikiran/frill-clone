'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SlotPicker, { viewerTz, tzShort } from '@/components/booking/SlotPicker'
import { ParallaxBackdrop, MOTION_CSS } from '@/components/booking/motion'

// The public booking page: service → (staff) → time → details → pay/confirm.
// Rendered at colvy.com/book/<slug>[/<service>], <slug>.colvy.com/book[/<service>]
// and on a custom domain at /book[/<service>].

type Service = {
  id: string; name: string; slug: string; description: string | null; kind: string
  duration_mins: number; capacity: number; price_cents: number; payment_mode: 'none' | 'deposit' | 'full'
  deposit_cents: number; currency: string; location_mode: 'outlet' | 'customer' | 'phone' | 'video'
  location_ids: string[]; staff_ids: string[]; questions: { id: string; label: string; type: string; options: string[]; required: boolean }[]
  color: string | null; image_url: string | null
}
type PageData = {
  company: { name: string; slug: string; logo_url: string | null; accent_color: string | null }
  page: { title: string; intro: string; require_phone: boolean; require_email: boolean; cancel_hours: number; refund_on_cancel: boolean; late_cancel: string; allow_reschedule: boolean }
  timezone: string
  services: Service[]
  staff: { id: string; name: string; avatar_url: string | null }[]
  locations: { id: string; label: string; address: string; is_primary: boolean }[]
}

const money = (c: number, cur = 'aud') => {
  const n = (c || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n}` }
}
const dur = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : (m >= 120 ? 's' : '')}`
const whereLabel = (s: Service) => s.location_mode === 'customer' ? 'At your address' : s.location_mode === 'phone' ? 'Phone call' : s.location_mode === 'video' ? 'Video call' : 'In person'

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} /></svg>
}
const I = {
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pin: 'M12 22s-8-6.5-8-13a8 8 0 0 1 16 0c0 6.5-8 13-8 13zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  card: 'M2 7h20v12H2zM2 11h20',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  cal: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  back: 'M15 18l-6-6 6-6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
}

function Avatar({ name, url, size = 34, accent }: { name: string; url?: string | null; size?: number; accent: string }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return <div style={{ width: size, height: size, borderRadius: '50%', background: `color-mix(in srgb, ${accent} 16%, #fff)`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.38, flexShrink: 0 }}>{initials || '•'}</div>
}

export default function BookingFlow({ slug, domain, initialService }: { slug?: string | null; domain?: string | null; initialService?: string | null }) {
  const [data, setData] = useState<PageData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [service, setService] = useState<Service | null>(null)
  const [staff, setStaff] = useState<string>('any')
  const [locationId, setLocationId] = useState<string>('')
  const [slot, setSlot] = useState<string | null>(null)
  const [step, setStepRaw] = useState<'service' | 'time' | 'details'>('service')
  const [dir, setDir] = useState<'f' | 'b'>('f')
  const mainRef = useRef<HTMLElement>(null)
  const ORDER = { service: 0, time: 1, details: 2 }
  const setStep = (next: 'service' | 'time' | 'details') => {
    setDir(ORDER[next] >= ORDER[step] ? 'f' : 'b')
    setStepRaw(next)
    // On phones the step starts below the summary — bring it into view.
    requestAnimationFrame(() => {
      const el = mainRef.current
      if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 12, behavior: 'smooth' })
    })
  }
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' })
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const query = slug ? `slug=${encodeURIComponent(slug)}` : `domain=${encodeURIComponent(domain || '')}`
  // ?i=<token> personal link from the inbox · ?embed=1 inside a website · ?src=widget|link
  const [ctx, setCtx] = useState<{ invite: string | null; embed: boolean; src: string }>({ invite: null, embed: false, src: 'page' })

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const invite = sp.get('i')
    const embed = sp.get('embed') === '1'
    setCtx({ invite, embed, src: invite ? 'invite' : embed ? 'embed' : (sp.get('src') === 'widget' ? 'widget' : sp.get('src') === 'link' ? 'link' : 'page') })
    Promise.all([
      fetch(`/api/book?op=page&${query}`).then(r => r.json().then(d => ({ ok: r.ok, d }))),
      invite ? fetch(`/api/book?op=invite&${query}&token=${encodeURIComponent(invite)}`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
    ]).then(([{ ok, d }, inv]: any) => {
      if (!ok) { setLoadError(d.error || 'This booking page isn’t available.'); return }
      setData(d)
      try { document.title = `Book — ${d.company.name}` } catch {}
      const prefill = inv?.prefill
      if (prefill) setForm(f => ({ ...f, name: prefill.name || f.name, email: prefill.email || f.email, phone: prefill.phone || f.phone }))
      const want = initialService || prefill?.serviceId
      const pre = want ? d.services.find((s: Service) => s.slug === want || s.id === want) : null
      const only = d.services.length === 1 ? d.services[0] : null
      if (pre || only) { setService(pre || only); setStep('time') }
    }).catch(() => setLoadError('Couldn’t load this page. Please refresh.'))
  }, [query, initialService])

  const accent = data?.company.accent_color && /^#[0-9a-f]{6}$/i.test(data.company.accent_color) ? data.company.accent_color : '#ff7a6b'
  const tz = data?.timezone || 'Australia/Melbourne'

  const serviceStaff = useMemo(() => {
    if (!data || !service) return []
    return service.staff_ids.length ? data.staff.filter(s => service.staff_ids.includes(s.id)) : data.staff
  }, [data, service])
  const serviceLocations = useMemo(() => {
    if (!data || !service || service.location_mode !== 'outlet') return []
    return service.location_ids.length ? data.locations.filter(l => service.location_ids.includes(l.id)) : data.locations.filter(l => l.is_primary)
  }, [data, service])

  useEffect(() => { setStaff('any'); setSlot(null); setLocationId(serviceLocations.length === 1 ? serviceLocations[0].id : '') }, [service?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSlots = useCallback(async (from: string, to: string) => {
    const r = await fetch(`/api/book?op=slots&${query}&service=${service?.id}&staff=${staff}&from=${from}&to=${to}`)
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Couldn’t load times')
    return d
  }, [query, service?.id, staff])

  const due = service ? (service.payment_mode === 'full' ? service.price_cents : service.payment_mode === 'deposit' ? service.deposit_cents : 0) : 0
  const staffName = staff !== 'any' ? data?.staff.find(s => s.id === staff)?.name : null
  const loc = serviceLocations.find(l => l.id === locationId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!service || !slot || submitting) return
    setSubmitting(true); setError('')
    try {
      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, domain, serviceId: service.id, staff, startsAt: slot, locationId: locationId || null,
          name: form.name, email: form.email, phone: form.phone, address: form.address, notes: form.notes,
          answers, timezone: viewerTz(),
          source: ctx.src, invite: ctx.invite,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error || 'Something went wrong — please try again.')
        if (r.status === 409) { setSlot(null); setStep('time') }
        setSubmitting(false)
        return
      }
      if (d.checkoutUrl && ctx.embed) {
        // Stripe Checkout can't run inside a frame — take the whole tab there.
        try { window.top!.location.href = d.checkoutUrl } catch { window.open(d.checkoutUrl, '_blank') }
        setSubmitting(false)
        return
      }
      window.location.href = d.checkoutUrl || `/booking/${d.token}?new=1${ctx.embed ? '&embed=1' : ''}`
    } catch {
      setError('Couldn’t reach the server — check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (loadError) return <Shell accent="#ff7a6b"><div className="bk-card bk-card-in" style={{ display: 'block', maxWidth: 520, padding: '56px 24px', textAlign: 'center' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📅</div><div style={{ fontWeight: 700, fontSize: 18, color: '#111', marginBottom: 6 }}>Booking unavailable</div><div style={{ color: '#6b7280', fontSize: 14.5 }}>{loadError}</div></div></Shell>
  if (!data) return (
    <Shell accent="#ff7a6b">
      <div className="bk-card bk-card-in">
        <aside className="bk-side"><div className="bk-skel" style={{ width: 140, height: 34, marginBottom: 22 }} /><div className="bk-skel" style={{ width: '85%', height: 26, marginBottom: 10 }} /><div className="bk-skel" style={{ width: '60%', height: 14 }} /></aside>
        <main className="bk-main"><div className="bk-skel" style={{ width: 180, height: 22, marginBottom: 18 }} />{[0, 1, 2].map(i => <div key={i} className="bk-skel" style={{ height: 78, marginBottom: 10, borderRadius: 14 }} />)}</main>
      </div>
    </Shell>
  )

  const slotLabel = slot ? new Date(slot).toLocaleString('en-AU', { timeZone: viewerTz(), weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm') : ''

  // ── Left summary panel ──
  const summary = (
    <aside className="bk-side">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        {data.company.logo_url ? <img src={data.company.logo_url} alt="" style={{ height: 38, maxWidth: 140, objectFit: 'contain' }} /> : <Avatar name={data.company.name} size={38} accent={accent} />}
        <div style={{ fontWeight: 700, color: '#4b5563', fontSize: 14 }}>{data.company.name}</div>
      </div>
      {service && step !== 'service' ? (
        <>
          <h1 style={{ margin: '0 0 12px', fontSize: 22, lineHeight: 1.25, color: '#111', fontWeight: 800 }}>{service.name}</h1>
          <div style={{ display: 'grid', gap: 9, color: '#4b5563', fontSize: 14 }}>
            <Row icon={I.clock}>{dur(service.duration_mins)}</Row>
            <Row icon={I.pin}>{loc ? loc.label : whereLabel(service)}</Row>
            {staffName && <Row icon={I.user}>{staffName}</Row>}
            {service.capacity > 1 && <Row icon={I.users}>Group · up to {service.capacity}</Row>}
            {service.price_cents > 0 && <Row icon={I.card}>{money(service.price_cents, service.currency)}{service.payment_mode === 'deposit' ? ` · ${money(service.deposit_cents, service.currency)} deposit today` : service.payment_mode === 'full' ? ' · pay online' : ''}</Row>}
            {slot && <Row icon={I.cal}><b style={{ color: '#111' }}>{slotLabel}</b></Row>}
          </div>
          {service.description && step === 'time' && <p style={{ marginTop: 16, color: '#6b7280', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{service.description}</p>}
        </>
      ) : (
        <>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, lineHeight: 1.2, color: '#111', fontWeight: 800 }}>{data.page.title || `Book with ${data.company.name}`}</h1>
          {data.page.intro && <p style={{ margin: 0, color: '#6b7280', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{data.page.intro}</p>}
        </>
      )}
    </aside>
  )

  return (
    <Shell accent={accent}>
      <div className="bk-card bk-card-in">
        {summary}
        <main className="bk-main" ref={mainRef}>
          <div key={step} className={dir === 'f' ? 'bk-step-f' : 'bk-step-b'}>
          {step !== 'service' && (data.services.length > 1 || step === 'details') && (
            <button type="button" onClick={() => { setError(''); setStep(step === 'details' ? 'time' : 'service') }} style={backBtn}>
              <Icon d={I.back} size={16} /> Back
            </button>
          )}

          {step === 'service' && (
            <>
              <h2 style={h2}>Choose a service</h2>
              {!data.services.length && <p style={{ color: '#6b7280', fontSize: 14 }}>No services are open for online booking right now.</p>}
              <div style={{ display: 'grid', gap: 10 }}>
                {data.services.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => { setService(s); setStep('time') }} className="bk-svc bk-rise" style={{ animationDelay: `${80 + i * 60}ms` }}>
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: s.color || accent, flexShrink: 0 }} />
                    {s.image_url && <img src={s.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5, color: '#111' }}>{s.name}</span>
                      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, color: '#6b7280', fontSize: 13 }}>
                        <span>{dur(s.duration_mins)}</span>
                        <span>· {whereLabel(s)}</span>
                        {s.capacity > 1 && <span>· Group</span>}
                      </span>
                      {s.description && <span style={{ marginTop: 6, color: '#6b7280', fontSize: 13, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{s.description}</span>}
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ display: 'block', fontWeight: 800, color: '#111', fontSize: 15 }}>{s.price_cents ? money(s.price_cents, s.currency) : 'Free'}</span>
                      {s.payment_mode === 'deposit' && <span style={{ display: 'block', fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{money(s.deposit_cents, s.currency)} deposit</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'time' && service && (
            <>
              {serviceLocations.length > 1 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={label}>Location</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {serviceLocations.map(l => (
                      <button key={l.id} type="button" onClick={() => setLocationId(l.id)} className={`bk-chip${locationId === l.id ? ' sel' : ''}`} title={l.address}>{l.label}</button>
                    ))}
                  </div>
                </div>
              )}
              {serviceStaff.length > 1 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={label}>With</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => { setStaff('any'); setSlot(null) }} className={`bk-chip${staff === 'any' ? ' sel' : ''}`}>Anyone available</button>
                    {serviceStaff.map(s => (
                      <button key={s.id} type="button" onClick={() => { setStaff(s.id); setSlot(null) }} className={`bk-chip${staff === s.id ? ' sel' : ''}`}>
                        <Avatar name={s.name} url={s.avatar_url} size={22} accent={accent} /> {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <h2 style={h2}>Pick a time</h2>
              <SlotPicker accent={accent} businessTz={tz} fetchSlots={fetchSlots} selected={slot} reloadKey={`${service.id}:${staff}`}
                onSelect={iso => { setSlot(iso); setError('') }} />
              {error && <div style={errBox}>{error}</div>}
              <div className={`bk-cta${slot ? ' on' : ''}`}>
                {slot && <span className="bk-cta-sum">{slotLabel}</span>}
                <button type="button" disabled={!slot || (serviceLocations.length > 1 && !locationId)} onClick={() => setStep('details')} className="bk-primary">
                  {serviceLocations.length > 1 && !locationId ? 'Choose a location' : slot ? 'Continue' : 'Pick a time'}
                </button>
              </div>
            </>
          )}

          {step === 'details' && service && slot && (
            <form onSubmit={submit}>
              <h2 style={h2}>Your details</h2>
              <div className="bk-fields">
                <Field label="Full name" required><input className="bk-in" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></Field>
                <Field label="Mobile" required={data.page.require_phone}><input className="bk-in" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" required={data.page.require_phone} placeholder="04xx xxx xxx" /></Field>
                <Field label="Email" required={data.page.require_email} wide><input className="bk-in" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" required={data.page.require_email} /></Field>
                {service.location_mode === 'customer' && (
                  <Field label="Address for the appointment" required wide><input className="bk-in" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} autoComplete="street-address" required placeholder="Street, suburb, postcode" /></Field>
                )}
                {service.questions.map(q => (
                  <Field key={q.id} label={q.type === 'checkbox' ? '' : q.label} required={q.required && q.type !== 'checkbox'} wide>
                    {q.type === 'textarea' ? <textarea className="bk-in" rows={3} value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required} />
                      : q.type === 'select' ? (
                        <select className="bk-in" value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required}>
                          <option value="">Choose…</option>
                          {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : q.type === 'checkbox' ? (
                        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14, color: '#374151', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!answers[q.id]} onChange={e => setAnswers({ ...answers, [q.id]: e.target.checked })} required={q.required} style={{ marginTop: 3, accentColor: accent }} />
                          <span>{q.label}{q.required && <span style={{ color: '#dc2626' }}> *</span>}</span>
                        </label>
                      ) : <input className="bk-in" value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required} />}
                  </Field>
                ))}
                <Field label="Anything we should know?" wide><textarea className="bk-in" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>

              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: '#f9fafb', border: '1px solid #f1f1f1', fontSize: 12.5, color: '#6b7280', lineHeight: 1.55 }}>
                {policyText(data.page, due > 0, service.payment_mode)}
              </div>
              {error && <div style={errBox}>{error}</div>}
              <div className="bk-cta on bk-cta-col">
                <button type="submit" disabled={submitting} className="bk-primary" style={{ width: '100%', height: 50, fontSize: 15.5 }}>
                  {submitting ? <Spinner light /> : due > 0 ? `Continue to payment · ${money(due, service.currency)}` : 'Confirm booking'}
                </button>
                {due > 0 && <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 8 }}>🔒 Secure payment by Stripe. Your time is held while you pay.</div>}
              </div>
            </form>
          )}
          </div>
        </main>
      </div>
      <div className="bk-shell-foot" style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', margin: '18px 0 8px' }}>
        Times shown in your timezone ({tzShort(viewerTz())}) · Powered by <a href="https://colvy.com" style={{ color: '#9ca3af' }}>Colvy</a>
      </div>
    </Shell>
  )
}

function policyText(p: PageData['page'], paying: boolean, mode: string) {
  const hrs = p.cancel_hours
  const win = hrs ? (hrs % 24 === 0 ? `${hrs / 24} day${hrs === 24 ? '' : 's'}` : `${hrs} hours`) : ''
  const parts: string[] = []
  if (!hrs) parts.push(`You can ${p.allow_reschedule ? 'reschedule or ' : ''}cancel any time before your booking${paying && p.refund_on_cancel ? ' for a full refund' : ''}.`)
  else {
    parts.push(`Free to ${p.allow_reschedule ? 'reschedule or ' : ''}cancel up to ${win} before${paying && p.refund_on_cancel ? ' — you’ll be refunded in full' : ''}.`)
    if (p.late_cancel === 'block') parts.push(`Within ${win}, please contact us to make changes.`)
    else if (paying) parts.push(`Cancellations within ${win} aren’t refunded${mode === 'deposit' ? ' (the deposit is kept)' : ''}.`)
  }
  parts.push('You’ll get a confirmation with a link to manage your booking.')
  return parts.join(' ')
}

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}><span style={{ color: '#9ca3af', marginTop: 2 }}><Icon d={icon} /></span><span>{children}</span></div>
}

function Field({ label: l, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', gridColumn: wide ? '1 / -1' : undefined }}>
      {l && <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{l}{required && <span style={{ color: '#dc2626' }}> *</span>}</span>}
      {children}
    </label>
  )
}

function Spinner({ light }: { light?: boolean }) {
  return <span style={{ display: 'inline-block', width: 18, height: 18, border: `2px solid ${light ? 'rgba(255,255,255,.5)' : '#e5e7eb'}`, borderTopColor: light ? '#fff' : '#9ca3af', borderRadius: '50%', animation: 'bkspin .7s linear infinite', verticalAlign: 'middle' }} />
}

// Inside a website's iframe (?embed=1): no page background, and tell the host
// page our height so the frame grows with the content (see the embed snippet).
function useEmbed() {
  const [embed, setEmbed] = useState(false)
  useEffect(() => {
    let framed = false
    try { framed = window.self !== window.top } catch { framed = true }
    if (!framed || new URLSearchParams(window.location.search).get('embed') !== '1') return
    setEmbed(true)
    const post = () => { try { window.parent.postMessage({ type: 'colvy-booking-height', height: Math.ceil(document.documentElement.scrollHeight) }, '*') } catch {} }
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    post()
    return () => ro.disconnect()
  }, [])
  return embed
}

export function Shell({ accent, children }: { accent: string; children: React.ReactNode }) {
  const embed = useEmbed()
  return (
    <div style={{ minHeight: embed ? 0 : '100dvh', background: embed ? 'transparent' : '#f6f6f7', padding: embed ? '4px 2px 8px' : '32px 16px', fontFamily: 'Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', position: 'relative', isolation: 'isolate', ['--bk-accent' as any]: accent }}>
      {!embed && <ParallaxBackdrop accent={accent} />}
      {embed && <style>{`html,body{background:transparent!important}.bk-card{box-shadow:none!important}`}</style>}
      <style>{MOTION_CSS}</style>
      <style>{`
        @keyframes bkspin{to{transform:rotate(360deg)}}
        .bk-card{position:relative;z-index:1;max-width:1000px;margin:0 auto;background:rgba(255,255,255,.92);-webkit-backdrop-filter:saturate(1.4) blur(18px);backdrop-filter:saturate(1.4) blur(18px);border-radius:22px;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 2px rgba(0,0,0,.03),0 24px 60px -28px rgba(0,0,0,.22);display:grid;grid-template-columns:300px minmax(0,1fr);overflow:clip}
        .bk-shell-foot{position:relative;z-index:1}
        .bk-cta{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:18px}
        .bk-cta-col{flex-direction:column;align-items:stretch;gap:0}
        .bk-cta-sum{display:none}
        @media(max-width:820px){
          .bk-cta{position:sticky;bottom:0;z-index:5;margin:18px -22px -22px;padding:12px 22px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.86);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px);border-top:1px solid rgba(0,0,0,.06);transform:translate3d(0,0,0)}
          .bk-cta:not(.on){opacity:.96}
          .bk-cta .bk-primary{flex:1}
          .bk-cta-sum{display:block;font-size:12.5px;font-weight:700;color:#374151;line-height:1.3;max-width:46%}
        }
        @media(max-width:480px){.bk-cta{margin:18px -16px -18px;padding-left:16px;padding-right:16px}}
        .bk-side{padding:28px;border-right:1px solid #f1f1f1}
        .bk-main{padding:28px;min-width:0}
        @media(max-width:820px){.bk-card{grid-template-columns:1fr}.bk-side{border-right:none;border-bottom:1px solid #f1f1f1;padding:22px}.bk-main{padding:22px}}
        @media(max-width:480px){.bk-side,.bk-main{padding:18px 16px}}
        .bk-svc{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;border:1px solid #ececec;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .2s, box-shadow .3s cubic-bezier(.22,1,.36,1), transform .3s cubic-bezier(.22,1,.36,1);width:100%;min-height:64px}
        .bk-svc:hover{border-color:var(--bk-accent);box-shadow:0 10px 28px -14px color-mix(in srgb,var(--bk-accent) 70%,transparent);transform:translate3d(0,-2px,0)}
        .bk-svc:active{transform:scale(.985);transition-duration:.08s}
        .bk-chip{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;min-height:40px;border-radius:999px;border:1.5px solid #e5e7eb;background:#fff;font-size:13.5px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit;transition:all .22s cubic-bezier(.22,1,.36,1)}
        .bk-chip:active{transform:scale(.96)}
        .bk-chip.sel{border-color:var(--bk-accent);background:color-mix(in srgb,var(--bk-accent) 9%,#fff);color:color-mix(in srgb,var(--bk-accent) 75%,#000)}
        .bk-primary{height:46px;padding:0 24px;border-radius:12px;border:none;background:var(--bk-accent);color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:8px}
        .bk-primary{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .25s,opacity .2s,filter .2s;box-shadow:0 8px 20px -10px color-mix(in srgb,var(--bk-accent) 80%,transparent)}
        .bk-primary:hover:not(:disabled){filter:brightness(1.05);transform:translate3d(0,-1px,0)}
        .bk-primary:active:not(:disabled){transform:scale(.97);transition-duration:.08s}
        .bk-primary:disabled{opacity:.45;cursor:default;box-shadow:none}
        .bk-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:560px){.bk-fields{grid-template-columns:1fr}}
        .bk-in{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1.5px solid #e5e7eb;font-size:16px;transition:border-color .2s,box-shadow .2s;font-family:inherit;outline:none;background:#fff;color:#111}
        .bk-in:focus{border-color:var(--bk-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--bk-accent) 15%,transparent)}
      `}</style>
      {children}
    </div>
  )
}

const h2: React.CSSProperties = { margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#111' }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }
const errBox: React.CSSProperties = { marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13.5 }
const backBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#6b7280', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14, fontFamily: 'inherit' }
