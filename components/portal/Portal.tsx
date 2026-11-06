'use client'

// "Your account" — a business's page for its customers (the customer portal,
// version 1): what's coming up (with Change or Cancel), payments due (Pay),
// quotes and jobs, orders and receipts, the conversation with the business,
// and their preferences. No password: a one-time code to the email or mobile
// the business has for them, or a link the business sent (?b= a booking's
// manage token, ?q= a quote's token), which signs them in for a day.
// The session token lives in this browser only (localStorage, per business).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '@/components/booking/BookingFlow'
import type { PortalPublic, PortalMe, PortalComing, PortalOrder } from '@/lib/portal/types'
import type { PortalReceipt } from '@/lib/portal/receipts'

const KEY = (slug: string) => `colvy-portal:${slug}`
const money = (cents: number, cur = 'aud') => {
  const n = (cents || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n.toFixed(2)}` }
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
const dayShort = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' })
const dayNum = (iso: string) => new Date(iso).getDate()
const monShort = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { month: 'short' })
const dateLong = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
const ago = (iso: string) => {
  const d = Date.now() - Date.parse(iso), m = Math.round(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`
  return dateLong(iso)
}

type Step = 'loading' | 'off' | 'signin' | 'code' | 'ready'

export default function Portal({ slug }: { slug: string }) {
  const [biz, setBiz] = useState<PortalPublic | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [offWhy, setOffWhy] = useState('')
  const [me, setMe] = useState<PortalMe | null>(null)
  const [to, setTo] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [resendIn, setResendIn] = useState(0)

  const token = () => { try { return localStorage.getItem(KEY(slug)) || '' } catch { return '' } }
  const setToken = (t: string | null) => { try { if (t) localStorage.setItem(KEY(slug), t); else localStorage.removeItem(KEY(slug)) } catch {} }
  const call = useCallback(async (method: 'GET' | 'POST', q: string, body?: any) => {
    const t = token()
    const r = await fetch(`/api/portal${q}`, {
      method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: body ? JSON.stringify({ slug, ...body }) : undefined,
    })
    const d = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, data: d }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMe = useCallback(async () => {
    const r = await call('GET', `?slug=${encodeURIComponent(slug)}&op=me`)
    if (r.ok) { setMe(r.data); setStep('ready'); return true }
    if (r.status === 401) setToken(null)
    setStep('signin')
    return false
  }, [call, slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    ;(async () => {
      const r = await call('GET', `?slug=${encodeURIComponent(slug)}&op=company`)
      if (!live) return
      if (!r.ok) { setOffWhy(r.data?.error || 'This page isn’t available.'); setStep('off'); return }
      setBiz(r.data)
      try { document.title = `Your account · ${r.data.name}` } catch {}
      const sp = new URLSearchParams(window.location.search)
      const b = sp.get('b'), q = sp.get('q')
      const tidy = () => { if (b || q) try { window.history.replaceState(null, '', window.location.pathname) } catch {} }
      // Already signed in here: keep that session (a link's is only for a day).
      if (token() && await loadMe()) { tidy(); return }
      // Arrived from a link the business sent: sign in with it, then tidy the address bar.
      if (b || q) {
        const x = await call('POST', '', { action: 'link', ...(b ? { booking: b } : { quote: q }) })
        if (x.ok && x.data.token) setToken(x.data.token)
        tidy()
        if (token()) { await loadMe(); return }
      }
      setStep('signin')
    })()
    return () => { live = false }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn(n => n - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const sendCode = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await call('POST', '', { action: 'code', to })
      if (!r.ok) { setErr(r.data?.error || 'That didn’t work. Please try again.'); return }
      setSentTo(r.data.sentTo || to); setCode(''); setStep('code'); setResendIn(30)
    } finally { setBusy(false) }
  }
  const verify = async (c = code) => {
    if (c.replace(/\D/g, '').length !== 6) return
    setErr(''); setBusy(true)
    try {
      const r = await call('POST', '', { action: 'verify', to, code: c })
      if (!r.ok || !r.data.token) { setErr(r.data?.error || 'That code didn’t work.'); return }
      setToken(r.data.token)
      await loadMe()
    } finally { setBusy(false) }
  }
  const signOut = async () => {
    await call('POST', '', { action: 'signout' }).catch(() => {})
    setToken(null); setMe(null); setTo(''); setCode(''); setStep('signin')
  }
  const track = (kind: string, id?: string) => { try { void fetch('/api/portal', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ slug, action: 'track', kind, id }) }) } catch {} }

  const accent = biz?.accent && /^#[0-9a-f]{6}$/i.test(biz.accent) ? biz.accent : '#ff7a6b'

  if (step === 'off') return (
    <Shell accent="#ff7a6b">
      <div className="bk-card bk-card-in pt-solo"><b>Not available</b><span>{offWhy}</span></div>
      <style>{PT_CSS}</style>
    </Shell>
  )

  return (
    <Shell accent={accent}>
      <style>{PT_CSS}</style>
      <div className="pt">
        <header className="pt-top">
          {biz?.logoUrl ? <img src={biz.logoUrl} alt={biz.name} /> : <b>{biz?.name || ' '}</b>}
          {step === 'ready' && <button type="button" className="pt-link" onClick={signOut}>Sign out</button>}
        </header>

        {step === 'loading' && (
          <div className="pt-card"><div className="bk-skel" style={{ width: '45%', height: 26 }} /><div className="bk-skel" style={{ width: '70%', height: 14, marginTop: 12 }} /><div className="bk-skel" style={{ height: 120, marginTop: 22, borderRadius: 16 }} /></div>
        )}

        {(step === 'signin' || step === 'code') && biz && (
          <div className="pt-card pt-sign bk-rise">
            <span className="pt-badge" aria-hidden><Ic.user /></span>
            <h1>Your account</h1>
            <p className="pt-sub">Bookings, orders, quotes, payments and messages with {biz.name}, all in one place.</p>
            {step === 'signin' ? (
              <form onSubmit={e => { e.preventDefault(); sendCode() }}>
                <label className="pt-lab" htmlFor="pt-to">Email or mobile</label>
                <input id="pt-to" className="bk-in" value={to} onChange={e => setTo(e.target.value)} placeholder="you@example.com or 0400 000 000" autoComplete="email" inputMode="email" autoFocus maxLength={200} />
                <button type="submit" className="bk-primary pt-wide" disabled={busy || to.trim().length < 5}>{busy ? 'Sending…' : 'Send me a code'}</button>
                <p className="pt-fine">Use the email or mobile {biz.name} has for you. We’ll send a 6-digit code, no password needed.</p>
              </form>
            ) : (
              <form onSubmit={e => { e.preventDefault(); verify() }}>
                <p className="pt-sent">If <b>{sentTo}</b> matches an account with {biz.name}, a code is on its way.</p>
                <label className="pt-lab" htmlFor="pt-code">6-digit code</label>
                <input id="pt-code" className="bk-in pt-code" value={code} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v) }} placeholder="••••••" aria-label="6-digit code" />
                <button type="submit" className="bk-primary pt-wide" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
                <div className="pt-row2">
                  <button type="button" className="pt-link" onClick={() => { setStep('signin'); setErr('') }}>Use something else</button>
                  <button type="button" className="pt-link" disabled={resendIn > 0 || busy} onClick={sendCode}>{resendIn > 0 ? `Send again in ${resendIn}s` : 'Send again'}</button>
                </div>
              </form>
            )}
            {err && <div className="pt-err" role="alert">{err}</div>}
          </div>
        )}

        {step === 'ready' && me && biz && <Account biz={biz} me={me} setMe={setMe} call={call} track={track} signOut={signOut} />}
      </div>
      {!biz?.hidePoweredBy && <div className="bk-shell-foot pt-foot">Powered by <a href="https://colvy.com">Colvy</a></div>}
    </Shell>
  )
}

function Account({ biz, me, setMe, call, track, signOut }: {
  biz: PortalPublic; me: PortalMe; setMe: (m: PortalMe) => void
  call: (m: 'GET' | 'POST', q: string, b?: any) => Promise<{ ok: boolean; status: number; data: any }>
  track: (kind: string, id?: string) => void; signOut: () => void
}) {
  const first = (me.me.name || '').trim().split(/\s+/)[0]
  const on = (k: string) => biz.sections[k] !== false
  const coming = me.comingUp || [], pay = me.payments || [], quotes = me.quotes || [], jobs = me.jobs || [], orders = me.orders || []
  const waiting = quotes.filter(q => q.waiting)
  const chips = [
    on('coming_up') && { id: 'pt-coming', label: 'Coming up', n: coming.length },
    on('payments') && { id: 'pt-pay', label: 'To pay', n: pay.length, hot: pay.length > 0 },
    on('quotes') && { id: 'pt-quotes', label: 'Quotes', n: waiting.length, hot: waiting.length > 0 },
    on('orders') && { id: 'pt-orders', label: 'Orders', n: orders.length },
    on('messages') && { id: 'pt-msgs', label: 'Messages', n: null },
  ].filter(Boolean) as { id: string; label: string; n: number | null; hot?: boolean }[]
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [receipt, setReceipt] = useState<string | null>(null)

  return (
    <>
      <div className="pt-card pt-hello bk-rise">
        <div>
          <h1>{first ? `Hi ${first}` : 'Your account'}</h1>
          <p className="pt-sub">Your account with {biz.name}.{me.me.via === 'link' && <> Not you? <button type="button" className="pt-link" onClick={signOut}>Sign out</button></>}</p>
        </div>
        <div className="pt-chips">
          {chips.map(c => <button key={c.id} type="button" className={`pt-chip${c.hot ? ' hot' : ''}`} onClick={() => go(c.id)}>{c.label}{c.n !== null && <b>{c.n}</b>}</button>)}
        </div>
      </div>

      {on('payments') && pay.length > 0 && (
        <section id="pt-pay" className="pt-card bk-rise">
          <h2><span className="pt-ic hot"><Ic.card /></span>Payments due</h2>
          {pay.map(p => (
            <div key={p.id} className="pt-item">
              <div className="pt-main"><b>{p.description || 'Payment'}</b><span>Sent {dateLong(p.createdAt)}</span></div>
              <strong className="pt-amt">{money(p.cents, p.currency)}</strong>
              {p.url ? <a className="bk-primary pt-sm" href={p.url} onClick={() => track('pay', p.id)}>Pay</a> : <span className="pt-pill">Ask us for a new link</span>}
            </div>
          ))}
        </section>
      )}

      {on('coming_up') && (
        <section id="pt-coming" className="pt-card bk-rise">
          <h2><span className="pt-ic"><Ic.cal /></span>Coming up</h2>
          {!coming.length ? <p className="pt-none">Nothing booked right now.</p> : coming.map(c => <ComingRow key={`${c.kind}:${c.id}`} c={c} track={track} />)}
        </section>
      )}

      {on('quotes') && (quotes.length > 0 || jobs.length > 0) && (
        <section id="pt-quotes" className="pt-card bk-rise">
          <h2><span className="pt-ic"><Ic.doc /></span>Quotes and jobs</h2>
          {quotes.map(q => (
            <div key={q.id} className="pt-item">
              <div className="pt-main"><b>{q.title || `Quote ${q.number}`}</b><span>Quote {q.number}{q.sentAt ? ` · ${dateLong(q.sentAt)}` : ''}</span></div>
              <strong className="pt-amt">{money(q.cents)}</strong>
              <span className={`pt-pill ${q.waiting ? 'hot' : q.status === 'accepted' ? 'ok' : ''}`}>{q.statusLabel}</span>
              <a className={q.waiting ? 'bk-primary pt-sm' : 'pt-btn'} href={q.url} onClick={() => track('open_quote', q.id)}>{q.waiting ? 'View and accept' : 'View'}</a>
            </div>
          ))}
          {jobs.map(j => (
            <div key={j.id} className="pt-item">
              <div className="pt-main"><b>{j.title}</b><span>{j.nextVisit ? `Next visit ${dateLong(j.nextVisit)}, ${time(j.nextVisit)}` : 'Job'}</span></div>
              <span className={`pt-pill ${j.status === 'done' || j.status === 'completed' ? 'ok' : 'blue'}`}>{j.statusLabel}</span>
            </div>
          ))}
        </section>
      )}

      {on('orders') && (
        <section id="pt-orders" className="pt-card bk-rise">
          <h2><span className="pt-ic"><Ic.bag /></span>Orders and receipts</h2>
          {!orders.length ? <p className="pt-none">No orders yet.</p> : orders.map(o => <OrderRow key={`${o.kind}:${o.id}`} o={o} track={track} onReceipt={setReceipt} />)}
        </section>
      )}

      {on('messages') && me.messages !== undefined && <Messages biz={biz} me={me} setMe={setMe} call={call} />}

      {on('preferences') && <Prefs biz={biz} me={me} setMe={setMe} call={call} />}
      {receipt && <ReceiptSheet slug={biz.slug} rkey={receipt} call={call} onClose={() => setReceipt(null)} />}
    </>
  )
}

function ComingRow({ c, track }: { c: PortalComing; track: (k: string, id?: string) => void }) {
  return (
    <div className="pt-item">
      <div className="pt-date" aria-hidden><small>{dayShort(c.startsAt)}</small><b>{dayNum(c.startsAt)}</b><small>{monShort(c.startsAt)}</small></div>
      <div className="pt-main">
        <b>{c.title}</b>
        <span>{c.allDay ? dateLong(c.startsAt) : `${dateLong(c.startsAt)}, ${time(c.startsAt)}`}{c.where ? ` · ${c.where}` : ''}</span>
      </div>
      <span className={`pt-pill ${c.status === 'pending' ? 'hot' : c.kind === 'delivery' ? 'blue' : 'ok'}`}>{c.statusLabel}</span>
      {c.manageUrl && <a className="pt-btn" href={c.manageUrl} onClick={() => track('open_booking', c.id)}>Change or cancel</a>}
    </div>
  )
}

function OrderRow({ o, track, onReceipt }: { o: PortalOrder; track: (k: string, id?: string) => void; onReceipt: (key: string) => void }) {
  return (
    <div className="pt-item">
      <span className={`pt-src ${o.kind}`} title={o.kind === 'online' ? 'Online order' : o.kind === 'payment' ? 'Payment' : 'In store'}>{o.kind === 'online' ? <Ic.globe /> : o.kind === 'payment' ? <Ic.card /> : <Ic.store />}</span>
      <div className="pt-main">
        <b>{o.kind === 'online' ? `Online order${o.number ? ` #${o.number}` : ''}` : o.kind === 'payment' ? 'Payment' : 'In store'} · {dateLong(o.at)}</b>
        <span className="pt-ell" title={o.items}>{o.items || '—'}</span>
      </div>
      <strong className="pt-amt">{money(o.cents, o.currency)}</strong>
      <span className={`pt-pill ${o.paid ? 'ok' : 'hot'}`}>{o.statusLabel}</span>
      {o.receipt
        ? <button type="button" className="pt-btn" onClick={() => onReceipt(o.receipt!)}><Ic.doc />Receipt</button>
        : o.url && <a className="pt-btn" href={o.url} target="_blank" rel="noreferrer" onClick={() => track('open_order', o.id)}>{o.kind === 'online' ? 'View in shop' : 'Receipt'}</a>}
    </div>
  )
}

/**
 * A receipt (or tax invoice) over the page, like paper: the business, what was
 * bought, GST, how it was paid. "Print or save as PDF" prints just the receipt.
 */
function ReceiptSheet({ slug, rkey, call, onClose }: { slug: string; rkey: string; call: (m: 'GET' | 'POST', q: string, b?: any) => Promise<any>; onClose: () => void }) {
  const [r, setR] = useState<PortalReceipt | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    call('GET', `?slug=${encodeURIComponent(slug)}&op=receipt&key=${encodeURIComponent(rkey)}`).then(x => {
      if (!live) return
      if (x.ok) setR(x.data); else setErr(x.data?.error || 'Couldn’t open that receipt.')
    })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    document.body.classList.add('pt-printing')
    return () => { live = false; document.removeEventListener('keydown', esc); document.body.classList.remove('pt-printing') }
  }, [rkey]) // eslint-disable-line react-hooks/exhaustive-deps
  // A receipt always shows cents ($12.00, not $12).
  const m = (c: number) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(r?.currency || 'aud').toUpperCase(), minimumFractionDigits: 2 }).format((c || 0) / 100) } catch { return `$${((c || 0) / 100).toFixed(2)}` } }
  const day =(iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
  const at = (iso: string | null) => (iso ? `${day(iso)}, ${time(iso)}` : '')
  return (
    <div className="pt-rc-wrap" role="dialog" aria-modal="true" aria-label="Receipt" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pt-rc-bar">
        <button type="button" className="pt-btn" onClick={onClose}>Close</button>
        {r && <button type="button" className="bk-primary pt-sm" onClick={() => window.print()}><Ic.print />Print or save as PDF</button>}
      </div>
      {!r && !err && <div className="pt-rc"><div className="bk-skel" style={{ height: 30, width: '50%' }} /><div className="bk-skel" style={{ height: 160, marginTop: 24, borderRadius: 12 }} /></div>}
      {err && <div className="pt-rc"><p className="pt-none">{err}</p></div>}
      {r && (
        <article className="pt-rc" id="pt-receipt">
          <header className="pt-rc-head">
            <div className="pt-rc-biz">
              {r.business.logoUrl ? <img src={r.business.logoUrl} alt={r.business.name} /> : <b>{r.business.name}</b>}
              <span>
                {r.business.logoUrl && <><b>{r.business.name}</b><br /></>}
                {r.business.abn && <>ABN {r.business.abn}<br /></>}
                {r.business.address && <>{r.business.address}<br /></>}
                {[r.business.phone, r.business.email].filter(Boolean).join(' · ')}
                {r.business.website && <><br />{r.business.website.replace(/^https?:\/\//, '')}</>}
              </span>
            </div>
            <div className="pt-rc-title">
              <h2>{r.title}</h2>
              <span>No. <b>{r.number}</b></span>
              {r.ref && <span>{r.ref}</span>}
              <span>{at(r.date)}</span>
            </div>
          </header>
          {(r.customer || r.where) && (
            <div className="pt-rc-meta">
              {r.customer && <div><small>Customer</small><b>{r.customer}</b></div>}
              {r.where && <div><small>Where</small><b>{r.where}</b></div>}
            </div>
          )}
          <table className="pt-rc-t">
            <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Amount</th></tr></thead>
            <tbody>
              {r.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="n">{l.qty}</td><td className="n">{l.cents == null ? '' : m(l.cents)}</td></tr>)}
            </tbody>
          </table>
          <div className="pt-rc-sum">
            {r.adjustments.map((a, i) => <div key={i}><span>{a.label}</span><span>{a.cents < 0 ? `−${m(-a.cents)}` : m(a.cents)}</span></div>)}
            <div className="tot"><span>Total{r.currency !== 'AUD' ? ` (${r.currency})` : ''}</span><span>{m(r.totalCents)}</span></div>
            {r.gstCents ? <div className="gst"><span>Includes GST of</span><span>{m(r.gstCents)}</span></div> : null}
          </div>
          <div className={`pt-rc-paid ${r.status}`}>
            <b>{r.statusLabel}</b>
            <span>{[r.paymentMethod, r.paidAt && r.status === 'paid' ? `on ${day(r.paidAt)}` : ''].filter(Boolean).join(' ')}</span>
          </div>
          {(r.shopUrl || r.cardReceiptUrl) && (
            <p className="pt-rc-links">
              {r.shopUrl && <a href={r.shopUrl} target="_blank" rel="noreferrer">Returns or changes: this order in the shop ↗</a>}
              {r.cardReceiptUrl && <a href={r.cardReceiptUrl} target="_blank" rel="noreferrer">Card receipt from Stripe ↗</a>}
            </p>
          )}
          <footer className="pt-rc-foot">Thank you for your business{r.business.name ? `, from everyone at ${r.business.name}` : ''}.</footer>
        </article>
      )}
    </div>
  )
}

function Messages({ biz, me, setMe, call }: { biz: PortalPublic; me: PortalMe; setMe: (m: PortalMe) => void; call: (m: 'GET' | 'POST', q: string, b?: any) => Promise<any> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const items = me.messages?.items || []
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight }, [items.length])
  const send = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true); setErr('')
    try {
      const r = await call('POST', '', { action: 'reply', text: t })
      if (!r.ok) { setErr(r.data?.error || 'Couldn’t send that. Please try again.'); return }
      setText('')
      setMe({ ...me, messages: { canReply: true, items: [...items, r.data.message] } })
    } finally { setBusy(false) }
  }
  return (
    <section id="pt-msgs" className="pt-card bk-rise">
      <h2><span className="pt-ic"><Ic.chat /></span>Messages</h2>
      {items.length > 0 ? (
        <div className="pt-thread" ref={box}>
          {items.map(m => (
            <div key={m.id} className={`pt-msg${m.mine ? ' me' : ''}`}>
              <div className="pt-bub">{m.text}</div>
              <small>{m.mine ? 'You' : (m.by || biz.name)} · {ago(m.at)}</small>
            </div>
          ))}
        </div>
      ) : <p className="pt-none">No messages yet. Ask {biz.name} anything here.</p>}
      {me.messages?.canReply !== false && (
        <form className="pt-reply" onSubmit={e => { e.preventDefault(); send() }}>
          <textarea className="bk-in" rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder={`Message ${biz.name}…`} aria-label="Your message"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }} />
          <button type="submit" className="bk-primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </form>
      )}
      {err && <div className="pt-err" role="alert">{err}</div>}
    </section>
  )
}

function Prefs({ biz, me, setMe, call }: { biz: PortalPublic; me: PortalMe; setMe: (m: PortalMe) => void; call: (m: 'GET' | 'POST', q: string, b?: any) => Promise<any> }) {
  const [name, setName] = useState(me.me.name)
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  const save = async (patch: any, what: string) => {
    setBusy(what); setErr(''); setSaved('')
    try {
      const r = await call('POST', '', { action: 'prefs', ...patch })
      if (!r.ok) { setErr(r.data?.error || 'Couldn’t save that.'); return }
      setMe({ ...me, me: { ...me.me, ...r.data.me } })
      setSaved(what)
      setTimeout(() => setSaved(s => (s === what ? '' : s)), 2200)
    } finally { setBusy('') }
  }
  const dirty = name.trim() && name.trim() !== me.me.name
  return (
    <section id="pt-prefs" className="pt-card bk-rise">
      <h2><span className="pt-ic"><Ic.gear /></span>Preferences</h2>
      <div className="pt-field">
        <label className="pt-lab" htmlFor="pt-name">Your name</label>
        <div className="pt-inrow">
          <input id="pt-name" className="bk-in" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" />
          <button type="button" className="pt-btn" disabled={!dirty || !!busy} onClick={() => save({ name: name.trim() }, 'name')}>{busy === 'name' ? 'Saving…' : saved === 'name' ? 'Saved' : 'Save'}</button>
        </div>
      </div>
      <div className="pt-kv">
        {me.me.email && <div><span>Email</span><b>{me.me.email}</b></div>}
        {me.me.phone && <div><span>Mobile</span><b>{me.me.phone}</b></div>}
        <p className="pt-fine">To change these, send {biz.name} a message.</p>
      </div>
      <Toggle label="News and offers by email" on={me.me.marketingEmail} busy={busy === 'email'} saved={saved === 'email'} onChange={v => save({ marketingEmail: v }, 'email')} />
      {me.me.smsOnFile && <Toggle label="News and offers by text" on={me.me.marketingSms} busy={busy === 'sms'} saved={saved === 'sms'} locked={!me.me.marketingSms} onChange={v => save({ marketingSms: v }, 'sms')} />}
      {me.me.smsOnFile && !me.me.marketingSms && <p className="pt-fine">Texts are off. To get them again, reply START to any text from {biz.name}.</p>}
      <p className="pt-fine">You’ll still get messages about your bookings, orders and payments.</p>
      {err && <div className="pt-err" role="alert">{err}</div>}
    </section>
  )
}

function Toggle({ label, on, busy, saved, locked, onChange }: { label: string; on: boolean; busy: boolean; saved: boolean; locked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`pt-tog${locked ? ' locked' : ''}`}>
      <span>{label}{saved && <em> · Saved</em>}</span>
      <input type="checkbox" role="switch" checked={on} disabled={busy || locked} onChange={e => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  )
}

const S = (d: React.ReactNode) => () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const Ic = {
  user: S(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  cal: S(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>),
  card: S(<><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M7 15h3" /></>),
  doc: S(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  bag: S(<><path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  chat: S(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />),
  gear: S(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  globe: S(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>),
  store: S(<><path d="M4 10v10h16V10M3 4h18l-1 6H4L3 4Z" /><path d="M10 20v-5h4v5" /></>),
  print: S(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>),
}

const PT_CSS = `
.pt{position:relative;z-index:1;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.pt-top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:0 4px}
.pt-top img{height:34px;max-width:170px;object-fit:contain}
.pt-top>b{font-size:17px;font-weight:800;color:#1f2937}
.pt-card{background:rgba(255,255,255,.94);-webkit-backdrop-filter:saturate(1.4) blur(18px);backdrop-filter:saturate(1.4) blur(18px);border:1px solid rgba(0,0,0,.06);border-radius:24px;padding:22px 24px;box-shadow:0 1px 2px rgba(0,0,0,.03),0 24px 60px -32px rgba(0,0,0,.22);scroll-margin-top:16px}
.pt-solo{display:flex!important;flex-direction:column;gap:6px;max-width:460px;padding:40px 28px;text-align:center;color:#6b7280}
.pt-solo b{color:#111;font-size:18px}
.pt-card h1{margin:0;font-size:27px;font-weight:800;letter-spacing:-.02em;color:#111}
.pt-card h2{display:flex;align-items:center;gap:10px;margin:0 0 6px;font-size:17px;font-weight:800;letter-spacing:-.01em;color:#111}
.pt-sub{margin:6px 0 0;color:#6b7280;font-size:14.5px;line-height:1.55}
.pt-sign{max-width:460px;width:100%;margin:6vh auto 0;padding:32px 30px;text-align:left}
.pt-sign form{display:flex;flex-direction:column;gap:10px;margin-top:22px}
.pt-badge{display:flex;width:52px;height:52px;margin-bottom:16px;border-radius:17px;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bk-accent) 14%,#fff);color:var(--bk-accent)}
.pt-badge svg{width:26px;height:26px}
.pt-lab{font-size:13px;font-weight:700;color:#374151}
.pt-wide{width:100%;height:50px!important;margin-top:4px}
.pt-fine{margin:4px 0 0;font-size:12.5px;line-height:1.55;color:#9ca3af}
.pt-sent{margin:0 0 4px;font-size:14px;line-height:1.55;color:#4b5563}
.pt-code{font-size:26px!important;letter-spacing:.42em;text-align:center;font-weight:700;font-variant-numeric:tabular-nums;padding:12px 0!important}
.pt-row2{display:flex;justify-content:space-between;gap:10px;margin-top:4px}
.pt-link{border:none;background:none;padding:0;font:inherit;font-size:13.5px;font-weight:650;color:var(--bk-accent);cursor:pointer}
.pt-link:disabled{color:#9ca3af;cursor:default}
.pt-err{margin-top:12px;padding:10px 12px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.pt-hello{display:flex;flex-direction:column;gap:16px}
.pt-chips{display:flex;flex-wrap:wrap;gap:8px}
.pt-chip{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13.5px;font-weight:650;color:#27272a;cursor:pointer;transition:background .15s,transform .15s}
.pt-chip:hover{background:#ebebed}
.pt-chip:active{transform:scale(.97)}
.pt-chip b{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#fff;font-size:12px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.pt-chip.hot b{background:var(--bk-accent);color:#fff;box-shadow:none}
.pt-ic{display:inline-flex;width:32px;height:32px;border-radius:11px;align-items:center;justify-content:center;background:#f4f4f5;color:#3f3f46;flex-shrink:0}
.pt-ic.hot{background:color-mix(in srgb,var(--bk-accent) 14%,#fff);color:var(--bk-accent)}
.pt-item{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid #f1f1f3}
.pt-item:first-of-type{border-top:none}
.pt-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pt-main b{font-size:14.5px;font-weight:700;color:#111}
.pt-main span{font-size:13px;color:#6b7280}
.pt-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-amt{font-size:14.5px;font-weight:800;font-variant-numeric:tabular-nums;color:#111;white-space:nowrap}
.pt-date{flex:0 0 52px;height:58px;border-radius:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;background:color-mix(in srgb,var(--bk-accent) 10%,#fff);color:color-mix(in srgb,var(--bk-accent) 75%,#111)}
.pt-date small{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.2}
.pt-date b{font-size:19px;font-weight:800;line-height:1.1;color:#111}
.pt-pill{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:#f4f4f5;color:#52525b}
.pt-pill.ok{background:#ecfdf5;color:#047857}
.pt-pill.hot{background:color-mix(in srgb,var(--bk-accent) 13%,#fff);color:color-mix(in srgb,var(--bk-accent) 80%,#111)}
.pt-pill.blue{background:#eff6ff;color:#1d4ed8}
.pt-btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:11px;border:1.5px solid #e5e7eb;background:#fff;color:#111;font:inherit;font-size:13.5px;font-weight:650;text-decoration:none;white-space:nowrap;cursor:pointer;transition:border-color .15s,background .15s}
.pt-btn:hover:not(:disabled){border-color:#d1d5db;background:#fafafa}
.pt-btn:disabled{opacity:.5;cursor:default}
.pt-sm{height:36px!important;padding:0 16px!important;font-size:13.5px!important;text-decoration:none;white-space:nowrap}
.pt-src{flex:0 0 40px;height:40px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:#f4f4f5;color:#52525b}
.pt-src.online{background:#eff6ff;color:#1d4ed8}
.pt-none{margin:6px 0 0;font-size:14px;color:#9ca3af}
.pt-thread{display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;margin:10px 0 12px;padding:4px 2px;scrollbar-width:thin}
.pt-msg{display:flex;flex-direction:column;align-items:flex-start;gap:3px;max-width:82%}
.pt-msg.me{align-self:flex-end;align-items:flex-end}
.pt-bub{padding:10px 13px;border-radius:18px 18px 18px 6px;background:#f4f4f5;color:#111;font-size:14.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.pt-msg.me .pt-bub{border-radius:18px 18px 6px 18px;background:var(--bk-accent);color:#fff}
.pt-msg small{font-size:11.5px;color:#9ca3af;padding:0 4px}
.pt-reply{display:flex;gap:10px;align-items:flex-end;margin-top:6px}
.pt-reply textarea{flex:1;resize:none;min-height:46px;max-height:160px}
.pt-field{margin:10px 0 14px}
.pt-inrow{display:flex;gap:10px;margin-top:6px}
.pt-inrow .bk-in{flex:1}
.pt-inrow .pt-btn{height:auto}
.pt-kv{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:14px;background:#fafafa;margin-bottom:8px}
.pt-kv>div{display:flex;justify-content:space-between;gap:12px;font-size:14px}
.pt-kv>div span{color:#6b7280}
.pt-kv .pt-fine{margin:0}
.pt-tog{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #f1f1f3;font-size:14.5px;font-weight:600;color:#111;cursor:pointer}
.pt-tog em{font-style:normal;color:#047857;font-weight:600;font-size:13px}
.pt-tog input{position:absolute;opacity:0;width:1px;height:1px}
.pt-tog i{flex:0 0 46px;height:28px;border-radius:14px;background:#e4e4e7;position:relative;transition:background .2s}
.pt-tog i::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .22s cubic-bezier(.22,1,.36,1)}
.pt-tog input:checked+i{background:var(--bk-accent)}
.pt-tog input:checked+i::after{transform:translateX(18px)}
.pt-tog input:focus-visible+i{box-shadow:0 0 0 3px color-mix(in srgb,var(--bk-accent) 35%,transparent)}
.pt-tog input:disabled+i{opacity:.6}
.pt-tog.locked{cursor:default}
.pt-foot{text-align:center;font-size:12px;color:#9ca3af;margin:18px 0 8px}
.pt-foot a{color:#9ca3af}
.pt-btn svg{width:15px;height:15px;margin-right:6px}
.pt-rc-wrap{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;overflow-y:auto;background:rgba(17,17,17,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:ptFade .2s ease}
@keyframes ptFade{from{opacity:0}}
.pt-rc-bar{width:100%;max-width:640px;display:flex;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:1}
.pt-rc-bar .pt-btn,.pt-rc-bar .bk-primary{box-shadow:0 6px 18px -8px rgba(0,0,0,.35)}
.pt-rc-bar .bk-primary svg{width:16px;height:16px}
.pt-rc{width:100%;max-width:640px;box-sizing:border-box;background:#fff;border-radius:18px;padding:30px 32px 26px;color:#111;box-shadow:0 30px 70px -30px rgba(0,0,0,.45);animation:ptRise .28s cubic-bezier(.22,1,.36,1)}
@keyframes ptRise{from{opacity:0;transform:translateY(10px)}}
.pt-rc-head{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:2px solid var(--bk-accent,#111)}
.pt-rc-biz{display:flex;flex-direction:column;gap:8px;min-width:0}
.pt-rc-biz img{height:40px;max-width:170px;object-fit:contain;object-position:left}
.pt-rc-biz>b{font-size:19px;font-weight:800}
.pt-rc-biz span{font-size:12.5px;line-height:1.55;color:#4b5563}
.pt-rc-biz span b{color:#111;font-size:13.5px}
.pt-rc-title{display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right;flex-shrink:0}
.pt-rc-title h2{margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:-.01em;text-transform:uppercase}
.pt-rc-title span{font-size:12.5px;color:#4b5563;font-variant-numeric:tabular-nums}
.pt-rc-title span b{color:#111}
.pt-rc-meta{display:flex;gap:28px;flex-wrap:wrap;padding:14px 0 4px}
.pt-rc-meta div{display:flex;flex-direction:column;gap:2px}
.pt-rc-meta small{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9ca3af}
.pt-rc-meta b{font-size:14px}
.pt-rc-t{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
.pt-rc-t th{padding:8px 0;border-bottom:1px solid #111;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;text-align:left}
.pt-rc-t td{padding:10px 0;border-bottom:1px solid #f0f0f2;vertical-align:top}
.pt-rc-t .n{text-align:right;white-space:nowrap;padding-left:14px;font-variant-numeric:tabular-nums}
.pt-rc-sum{margin:10px 0 0 auto;max-width:300px;display:flex;flex-direction:column;gap:6px;font-size:14px;font-variant-numeric:tabular-nums}
.pt-rc-sum div{display:flex;justify-content:space-between;gap:16px;color:#4b5563}
.pt-rc-sum .tot{margin-top:4px;padding-top:10px;border-top:2px solid #111;color:#111;font-size:18px;font-weight:800}
.pt-rc-sum .gst{font-size:13px}
.pt-rc-paid{display:flex;align-items:center;gap:10px;margin-top:20px;padding:12px 14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-size:13.5px}
.pt-rc-paid b{font-size:14px}
.pt-rc-paid.unpaid{background:#fff7ed;color:#9a3412}
.pt-rc-paid.refunded,.pt-rc-paid.cancelled{background:#f4f4f5;color:#3f3f46}
.pt-rc-links{display:flex;flex-direction:column;gap:6px;margin:16px 0 0;font-size:13.5px}
.pt-rc-links a{color:#111;font-weight:650}
.pt-rc-foot{margin-top:22px;padding-top:14px;border-top:1px solid #f0f0f2;font-size:12.5px;color:#6b7280;text-align:center}
@media print{
  body.pt-printing *{visibility:hidden!important}
  body.pt-printing #pt-receipt,body.pt-printing #pt-receipt *{visibility:visible!important}
  body.pt-printing #pt-receipt{position:absolute;left:0;top:0;width:100%;max-width:none;box-shadow:none;border-radius:0;padding:0;animation:none}
  body.pt-printing .pt-rc-links{display:none}
  .pt-rc-wrap{position:static;background:none;padding:0;overflow:visible}
}
@media(max-width:560px){
  .pt-rc{padding:22px 18px 20px;border-radius:16px}
  .pt-rc-head{flex-direction:column}
  .pt-rc-title{align-items:flex-start;text-align:left}
  .pt-card{padding:18px 16px;border-radius:20px}
  .pt-sign{padding:26px 20px;margin-top:2vh}
  .pt-card h1{font-size:24px}
  .pt-item{flex-wrap:wrap;gap:8px 12px}
  .pt-item .pt-main{flex-basis:calc(100% - 120px)}
  .pt-item>.pt-btn,.pt-item>.bk-primary{margin-left:auto}
  .pt-reply{flex-direction:column;align-items:stretch}
}
`
