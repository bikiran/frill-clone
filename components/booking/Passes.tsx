'use client'

import { useEffect, useState } from 'react'
import { LockIcon } from '@/components/booking/icons'

// Class packs and memberships on the public booking page (lib/passes):
//   PassShop    what's for sale, and the details form before card payment
//   PassReturn  back from paying: the pass is ready (or still on its way)
//   UsePass     at "Your details": sign in with a code and pay with a pass
// The sign-in is the customer account's (same token, same browser storage),
// so a customer signed in to their account is already signed in here.

export type ShopProduct = {
  id: string; kind: 'pack' | 'membership'; name: string; description: string | null
  price: string; price_cents: number; currency: string; gives: string; terms: string
  covers: string[] | null; service_ids: string[]
}
export type PassOption = { id: string; name: string; kind: string; label: string; when: string | null; ok: boolean; reason: string | null }
export type PassMe = { name: string; email: string; phone: string }

export const portalKey = (slug: string) => `colvy-portal:${slug}`
export const readToken = (slug: string) => { try { return localStorage.getItem(portalKey(slug)) || '' } catch { return '' } }
const saveToken = (slug: string, t: string | null) => { try { if (t) localStorage.setItem(portalKey(slug), t); else localStorage.removeItem(portalKey(slug)) } catch {} }

const h2: React.CSSProperties = { margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#111' }
const errBox: React.CSSProperties = { marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13.5 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 650, color: '#374151', marginBottom: 6 }

function Ticket({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" /><path d="M14 6v12" /></svg>
}

/** The entry on the service list. */
export function PassesEntry({ count, accent, onOpen }: { count: number; accent: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="bk-svc bk-rise bk-pass-entry" style={{ marginTop: 14 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 12%, #fff)`, color: accent, flexShrink: 0 }}><Ticket /></span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5, color: '#111' }}>Class passes and memberships</span>
        <span style={{ display: 'block', marginTop: 3, color: '#6b7280', fontSize: 13 }}>{count === 1 ? 'Buy ahead and book classes with it' : `${count} options · buy ahead and book classes with them`}</span>
      </span>
      <span aria-hidden style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
    </button>
  )
}

export function PassShop({ products, query, preselect, accent, embed }: { products: ShopProduct[]; query: { slug?: string | null; domain?: string | null }; preselect?: string | null; accent: string; embed?: boolean }) {
  const [pick, setPick] = useState<ShopProduct | null>(() => products.find(p => p.id === preselect) || null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const buy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pick || busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/book/passes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...query, productId: pick.id, ...form, returnUrl: window.location.href }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) { setErr(d.error || 'Something went wrong. Please try again.'); setBusy(false); return }
      if (embed) { try { window.top!.location.href = d.url } catch { window.open(d.url, '_blank') } setBusy(false); return }
      window.location.href = d.url
    } catch { setErr('Couldn’t reach the server. Check your connection and try again.'); setBusy(false) }
  }

  if (!pick) return (
    <>
      <h2 style={h2}>Class passes and memberships</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {products.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setPick(p)} className="bk-svc bk-rise" style={{ animationDelay: `${60 + i * 50}ms`, alignItems: 'flex-start' }}>
            <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: p.kind === 'membership' ? accent : `color-mix(in srgb, ${accent} 45%, #fff)`, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15.5, color: '#111' }}>{p.name}</span>
                <span className="bk-pass-tag">{p.kind === 'membership' ? 'Membership' : 'Class pack'}</span>
              </span>
              <span style={{ display: 'block', marginTop: 4, color: '#6b7280', fontSize: 13 }}>{p.terms}</span>
              {p.covers && <span style={{ display: 'block', marginTop: 3, color: '#6b7280', fontSize: 12.5 }}>For {p.covers.join(', ')}</span>}
              {p.description && <span style={{ display: 'block', marginTop: 6, color: '#6b7280', fontSize: 13, lineHeight: 1.5 }}>{p.description}</span>}
            </span>
            <span style={{ fontWeight: 800, color: '#111', fontSize: 15, flexShrink: 0, textAlign: 'right' }}>{p.price}</span>
          </button>
        ))}
      </div>
      <p style={{ margin: '16px 2px 0', color: '#6b7280', fontSize: 13, lineHeight: 1.55 }}>Already have one? Pick a class and choose “Use my pass” at the end.</p>
    </>
  )

  return (
    <form onSubmit={buy}>
      <h2 style={h2}>{pick.name}</h2>
      <div className="bk-pass-sum">
        <div><span>You get</span><b>{pick.gives}</b></div>
        <div><span>{pick.kind === 'membership' ? 'Price' : 'Pay today'}</span><b>{pick.price}</b></div>
        <p>{pick.kind === 'membership'
          ? 'Billed to your card each period until you cancel. Cancel any time from your account, and it runs to the end of the period you’ve paid for.'
          : pick.terms.includes('use within') ? `Use your classes within the time shown (${pick.terms.split(' · ')[1].replace('use within ', '')} from today).` : 'No expiry: use your classes whenever you like.'}</p>
      </div>
      <div className="bk-fields" style={{ marginTop: 16 }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>Full name <span style={{ color: '#dc2626' }}>*</span></span><input className="bk-in" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></label>
        <label><span style={lbl}>Email <span style={{ color: '#dc2626' }}>*</span></span><input className="bk-in" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></label>
        <label><span style={lbl}>Mobile</span><input className="bk-in" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="04xx xxx xxx" /></label>
      </div>
      <p style={{ margin: '12px 2px 0', color: '#6b7280', fontSize: 12.5, lineHeight: 1.55 }}>To book with it, you sign in with a code sent to this email or mobile.</p>
      {err && <div style={errBox} role="alert">{err}</div>}
      <div className="bk-cta on bk-cta-col">
        <button type="submit" disabled={busy} className="bk-primary" style={{ width: '100%', height: 52, fontSize: 16, borderRadius: 14 }}>
          {busy ? 'One moment…' : pick.kind === 'membership' ? `Start membership · ${pick.price}` : `Continue to payment · ${pick.price}`}
        </button>
        <div className="bk-secure"><LockIcon size={12} />Secure payment by Stripe.</div>
      </div>
      <button type="button" className="bk-quiet" onClick={() => { setPick(null); setErr('') }} style={{ marginTop: 14 }}>See all passes</button>
    </form>
  )
}

/** Back from paying. */
export function PassReturn({ query, passId, sessionId, cancelled, onBook, onShop }: { query: string; passId: string; sessionId: string | null; cancelled: boolean; onBook: () => void; onShop: () => void }) {
  const [state, setState] = useState<{ status: string; name: string; label: string; when: string | null; gives: string; email: string | null } | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (cancelled || !sessionId) return
    let stop = false
    fetch(`/api/book/passes?op=verify&${query}&pass=${encodeURIComponent(passId)}&session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json()).then(d => {
        if (stop || !d?.pass) return
        setState(d.pass)
        // Stripe can take a few seconds to confirm: look again.
        if (d.pass.status === 'pending' && tries < 6) setTimeout(() => !stop && setTries(t => t + 1), 2500)
      }).catch(() => {})
    return () => { stop = true }
  }, [tries]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cancelled) return (
    <div className="bk-rise" style={{ textAlign: 'center', padding: '18px 4px 8px' }}>
      <h2 style={{ ...h2, margin: '0 0 8px' }}>Payment not finished</h2>
      <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>Nothing was charged. You can pick a pass again whenever you’re ready.</p>
      <button type="button" className="bk-primary" onClick={onShop}>See passes</button>
    </div>
  )
  const ready = state?.status === 'active'
  return (
    <div className="bk-rise" style={{ textAlign: 'center', padding: '18px 4px 8px' }}>
      <div className="bk-pass-ok" aria-hidden>{ready ? '✓' : <span className="bk-pass-spin" />}</div>
      <h2 style={{ ...h2, margin: '14px 0 8px' }}>{ready ? (state!.status === 'active' && state!.label === 'Unlimited classes' ? `Welcome to your ${state!.name}` : `Your ${state!.name} is ready`) : 'Confirming your payment…'}</h2>
      {ready ? (
        <>
          <p style={{ color: '#4b5563', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 6px' }}><b>{state!.gives}</b>{state!.when ? ` · ${state!.when}` : ''}</p>
          <p style={{ color: '#6b7280', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
            {state!.email ? `We’ve emailed the details to ${state!.email}. ` : ''}Pick a class, then choose “Use my pass” when you book.
          </p>
          <button type="button" className="bk-primary" onClick={onBook}>Book a class</button>
        </>
      ) : (
        <p style={{ color: '#6b7280', fontSize: 13.5, lineHeight: 1.6 }}>{tries >= 6 ? 'This is taking longer than usual. Your pass will be ready as soon as the payment is confirmed: you’ll get an email.' : 'This only takes a moment.'}</p>
      )}
    </div>
  )
}

/**
 * "Use my pass" at the details step: signs in by code if needed, then lists
 * the customer's passes for this class. `onPick(id)` with the chosen pass (or null).
 */
export function UsePass({ slug, query, serviceId, slot, accent, pick, onPick, onMe, onShop }: {
  slug: string; query: string; serviceId: string; slot: string; accent: string
  pick: string | null; onPick: (id: string | null) => void; onMe: (me: PassMe) => void; onShop: (() => void) | null
}) {
  type Mode = 'idle' | 'loading' | 'signin' | 'code' | 'list'
  const [mode, setMode] = useState<Mode>(() => (readToken(slug) ? 'loading' : 'idle'))
  const [to, setTo] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [options, setOptions] = useState<PassOption[]>([])

  const load = async () => {
    const t = readToken(slug)
    if (!t) { setMode('idle'); return }
    setMode('loading'); setErr('')
    try {
      const r = await fetch(`/api/book/passes?op=mine&${query}&service=${encodeURIComponent(serviceId)}&start=${encodeURIComponent(slot)}`, { headers: { Authorization: `Bearer ${t}` } })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { saveToken(slug, null); setMode('idle'); return }
      if (!r.ok) { setErr(d.error || 'Couldn’t load your passes.'); setMode('idle'); return }
      setOptions(d.options || [])
      if (d.me) onMe(d.me)
      setMode('list')
      const first = (d.options || []).find((o: PassOption) => o.ok)
      onPick(first ? first.id : null)
    } catch { setErr('Couldn’t reach the server.'); setMode('idle') }
  }
  useEffect(() => { if (mode === 'loading') load() }, [serviceId, slot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Inside the booking form: no nested <form>, so Enter and the buttons are handled here.
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn() } }
  const sendCode = async () => {
    if (busy || !to.trim()) return
    setBusy(true); setErr('')
    const r = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, action: 'code', to, for: 'passes' }) }).catch(() => null)
    const d = await r?.json().catch(() => ({})) || {}
    setBusy(false)
    if (!r?.ok) { setErr(d.error || 'We couldn’t send a code just now.'); return }
    setSentTo(d.sentTo || to); setCode(''); setMode('code')
  }
  const verify = async () => {
    if (busy || code.trim().length < 4) return
    setBusy(true); setErr('')
    const r = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, action: 'verify', to, code: code.trim(), for: 'passes' }) }).catch(() => null)
    const d = await r?.json().catch(() => ({})) || {}
    setBusy(false)
    if (!r?.ok || !d.token) { setErr(d.error || 'That code didn’t work.'); return }
    saveToken(slug, d.token)
    await load()
  }

  const box: React.CSSProperties = { marginTop: 18, padding: '14px 16px', borderRadius: 14, border: '1px solid #ececec', background: '#fff' }
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 12%, #fff)`, color: accent, flexShrink: 0 }}><Ticket size={16} /></span>
      <b style={{ fontSize: 14.5, color: '#111', flex: 1 }}>Class pass or membership</b>
    </div>
  )

  return (
    <div style={box} className="bk-usepass">
      {head}
      {mode === 'idle' && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 220px', color: '#6b7280', fontSize: 13.5, lineHeight: 1.5 }}>Have one? Use it to book this class instead of paying.</span>
          <button type="button" className="bk-quiet" style={{ margin: 0 }} onClick={() => { setMode('signin'); setErr('') }}>Use my pass</button>
        </div>
      )}
      {mode === 'loading' && <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: 13.5 }}>Finding your passes…</p>}
      {mode === 'signin' && (
        <div style={{ marginTop: 10 }}>
          <label><span style={lbl}>Your email or mobile</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="bk-in" value={to} onChange={e => setTo(e.target.value)} onKeyDown={enter(sendCode)} autoComplete="email" placeholder="The one you bought it with" autoFocus />
              <button type="button" className="bk-primary" disabled={busy || !to.trim()} onClick={sendCode} style={{ flexShrink: 0, height: 46 }}>{busy ? '…' : 'Send code'}</button>
            </div>
          </label>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 12.5 }}>We’ll send a 6-digit code to sign you in.</p>
        </div>
      )}
      {mode === 'code' && (
        <div style={{ marginTop: 10 }}>
          <label><span style={lbl}>Code sent to {sentTo}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="bk-in" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={enter(verify)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus />
              <button type="button" className="bk-primary" disabled={busy || code.length < 6} onClick={verify} style={{ flexShrink: 0, height: 46 }}>{busy ? '…' : 'Sign in'}</button>
            </div>
          </label>
          <button type="button" className="bk-quiet" style={{ marginTop: 8 }} onClick={() => sendCode()}>Send a new code</button>
        </div>
      )}
      {mode === 'list' && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }} role="radiogroup" aria-label="Pay with">
          {options.map(o => (
            <label key={o.id} className={`bk-passopt${pick === o.id ? ' on' : ''}${o.ok ? '' : ' off'}`}>
              <input type="radio" name="bk-pass" checked={pick === o.id} disabled={!o.ok} onChange={() => onPick(o.id)} style={{ accentColor: accent }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{o.name}</b>
                <span>{o.ok ? `${o.label}${o.when ? ` · ${o.when}` : ''}` : o.reason}</span>
              </span>
            </label>
          ))}
          {!options.length && <p style={{ margin: 0, color: '#6b7280', fontSize: 13.5 }}>There are no passes on this account yet.{onShop && <> <button type="button" className="bk-quiet" style={{ margin: 0 }} onClick={onShop}>See passes</button></>}</p>}
          {options.some(o => o.ok) && (
            <label className={`bk-passopt${pick === null ? ' on' : ''}`}>
              <input type="radio" name="bk-pass" checked={pick === null} onChange={() => onPick(null)} style={{ accentColor: accent }} />
              <span style={{ flex: 1 }}><b>Don’t use a pass</b></span>
            </label>
          )}
          <button type="button" className="bk-quiet" style={{ marginTop: 2, justifySelf: 'start' }} onClick={() => { saveToken(slug, null); setOptions([]); onPick(null); setMode('idle') }}>Not you? Sign out</button>
        </div>
      )}
      {err && <div style={errBox} role="alert">{err}</div>}
    </div>
  )
}

export const PASSES_CSS = `
.bk-pass-tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,var(--bk-accent) 11%,#fff);color:color-mix(in srgb,var(--bk-accent) 82%,#111);font-size:11px;font-weight:750}
.bk-pass-sum{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px;border-radius:14px;background:#f9fafb;border:1px solid #f1f1f1}
.bk-pass-sum div{display:flex;flex-direction:column;gap:2px}
.bk-pass-sum span{font-size:12px;color:#6b7280;font-weight:600}
.bk-pass-sum b{font-size:16px;color:#111;font-weight:800}
.bk-pass-sum p{grid-column:1/-1;margin:2px 0 0;font-size:13px;color:#4b5563;line-height:1.55}
.bk-passopt{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:12px;border:1.5px solid #ececec;cursor:pointer;transition:border-color .2s,background .2s}
.bk-passopt.on{border-color:var(--bk-accent);background:color-mix(in srgb,var(--bk-accent) 5%,#fff)}
.bk-passopt.off{cursor:default;opacity:.75}
.bk-passopt b{display:block;font-size:14px;color:#111}
.bk-passopt span span{display:block;font-size:12.5px;color:#6b7280;margin-top:2px}
.bk-pass-ok{width:56px;height:56px;margin:0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bk-accent) 12%,#fff);color:var(--bk-accent);font-size:26px;font-weight:800}
.bk-pass-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--bk-accent) 25%,#fff);border-top-color:var(--bk-accent);animation:bkspin .8s linear infinite}
@keyframes bkspin{to{transform:rotate(360deg)}}
@media (max-width:520px){.bk-pass-sum{grid-template-columns:1fr}}
`
