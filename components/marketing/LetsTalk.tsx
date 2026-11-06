'use client'

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Turnstile, { type TurnstileHandle, TURNSTILE_SITE_KEY } from '@/components/Turnstile'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import { cleanLeadName, cleanLeadPhone, displayLeadPhone, LETS_TALK_MIN_MS } from '@/lib/lets-talk'

// "Have questions? Let's talk." A name and a phone number, just above the
// footer on every marketing page (MarketingFooter renders it). It lands in
// Colvy's own inbox as a call-back request (app/api/lets-talk).
//
// Nothing extra loads until someone starts on the form: then it fetches its
// ticket and, when Turnstile is set up, Cloudflare's check (invisible unless
// Cloudflare needs a click).

const CORAL = '#ff6a4d'
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function LetsTalk({ dark = false }: { dark?: boolean }) {
  const pathname = usePathname() || '/'
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [trap, setTrap] = useState('')
  const [started, setStarted] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ first: string; phone: string } | null>(null)
  const [error, setError] = useState('')
  const [bad, setBad] = useState<{ name?: string; phone?: string }>({})
  const ticket = useRef<{ token: string; at: number } | null>(null)
  const ticketLoading = useRef<Promise<void> | null>(null)
  const human = useRef('')
  const humanBox = useRef<TurnstileHandle>(null)

  const loadTicket = () => {
    ticketLoading.current = fetch('/api/lets-talk', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d?.token) ticket.current = { token: d.token, at: Date.now() } })
      .catch(() => {})
    return ticketLoading.current
  }
  const start = () => {
    if (started) return
    setStarted(true)
    void loadTicket()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    start()
    const n = cleanLeadName(name), p = cleanLeadPhone(phone)
    const nextBad = {
      name: n ? undefined : 'Please enter your name.',
      phone: p ? undefined : 'Please enter a phone number we can call, like 0412 345 678.',
    }
    setBad(nextBad)
    setError('')
    if (!n || !p) return
    setSending(true)
    try {
      if (!ticket.current) await (ticketLoading.current || loadTicket())
      if (!ticket.current) await loadTicket()
      if (!ticket.current) throw new Error('We couldn’t reach Colvy. Check your connection and try again.')
      // Cloudflare's token usually lands within a second of starting.
      if (TURNSTILE_SITE_KEY) for (let i = 0; i < 40 && !human.current; i++) await wait(150)
      const left = ticket.current.at + LETS_TALK_MIN_MS + 150 - Date.now()
      if (left > 0) await wait(left)
      const res = await fetch('/api/lets-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, phone: p, page: pathname, token: ticket.current.token, turnstileToken: human.current, website: trap }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.ok) {
        if (/refresh/i.test(d?.error || '')) { ticket.current = null; void loadTicket() }
        throw new Error(d?.error || 'Something went wrong. Please try again.')
      }
      setDone({ first: n.split(' ')[0], phone: displayLeadPhone(p) })
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      humanBox.current?.reset()   // each Cloudflare token works once
    } finally {
      setSending(false)
    }
  }

  const ink = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.64)' : 'rgba(15,17,25,0.6)'
  const line = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.08)'

  return (
    <section id="lets-talk" className={`lt${dark ? ' lt-dk' : ''}`} aria-labelledby="lt-title">
      <style>{`
        .lt{ padding:clamp(56px,8vw,104px) 16px; color:${ink}; }
        .lt-card{ position:relative; overflow:hidden; max-width:1180px; margin:0 auto; border-radius:32px; padding:clamp(28px,5vw,64px);
          display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:clamp(28px,5vw,72px); align-items:center;
          background:linear-gradient(135deg,#fff6f2 0%,#ffffff 52%,#f6f4ff 100%); border:1px solid ${line};
          box-shadow:0 40px 90px -50px rgba(15,17,25,.35); }
        .lt-dk .lt-card{ background:linear-gradient(135deg,rgba(255,106,77,.12) 0%,rgba(255,255,255,.035) 52%,rgba(124,92,255,.12) 100%); box-shadow:none; }
        .lt-glow{ position:absolute; border-radius:50%; filter:blur(70px); pointer-events:none; }
        .lt-copy, .lt-form{ position:relative; }
        .lt-eyebrow{ display:inline-flex; align-items:center; gap:9px; padding:7px 14px 7px 11px; border-radius:999px; border:1px solid ${line};
          background:${dark ? 'rgba(255,255,255,.05)' : '#fff'}; font-size:13.5px; font-weight:700; margin-bottom:22px; }
        .lt-dot{ width:8px; height:8px; border-radius:50%; background:#00c48c; box-shadow:0 0 0 0 rgba(0,196,140,.5); animation:ltPulse 2.2s infinite; }
        @keyframes ltPulse{ 0%{ box-shadow:0 0 0 0 rgba(0,196,140,.45); } 70%{ box-shadow:0 0 0 9px rgba(0,196,140,0); } 100%{ box-shadow:0 0 0 0 rgba(0,196,140,0); } }
        .lt-h{ margin:0; font-size:clamp(38px,5.4vw,62px); line-height:1.02; font-weight:900; letter-spacing:-.04em; }
        .lt-h em{ font-style:normal; color:${CORAL}; }
        .lt-sub{ margin:18px 0 0; font-size:clamp(16.5px,1.6vw,19px); line-height:1.55; color:${muted}; max-width:460px; }
        .lt-points{ list-style:none; padding:0; margin:28px 0 0; display:grid; gap:12px; }
        .lt-points li{ display:flex; align-items:center; gap:12px; font-size:15.5px; font-weight:600; }
        .lt-tick{ flex:none; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;
          background:${dark ? 'rgba(255,106,77,.16)' : 'rgba(255,106,77,.12)'}; color:${CORAL}; }
        .lt-form{ background:${dark ? '#12131c' : '#fff'}; border:1px solid ${line}; border-radius:26px; padding:clamp(20px,3vw,30px);
          box-shadow:${dark ? 'none' : '0 24px 60px -30px rgba(15,17,25,.28)'}; }
        .lt-field{ display:block; margin-bottom:16px; }
        .lt-field span{ display:block; font-size:13.5px; font-weight:800; margin:0 0 7px 2px; }
        .lt-in{ width:100%; box-sizing:border-box; height:56px; padding:0 18px; border-radius:16px; font:inherit; font-size:16.5px; color:${ink};
          background:${dark ? 'rgba(255,255,255,.06)' : '#f4f4f6'}; border:1.5px solid transparent; outline:none;
          transition:border-color .15s, box-shadow .15s, background .15s; }
        .lt-in::placeholder{ color:${dark ? 'rgba(244,245,251,.38)' : 'rgba(15,17,25,.38)'}; }
        .lt-in:focus{ border-color:${CORAL}; box-shadow:0 0 0 4px rgba(255,106,77,.16); background:${dark ? 'rgba(255,255,255,.08)' : '#fff'}; }
        .lt-in[aria-invalid="true"]{ border-color:#e5484d; }
        .lt-bad{ display:block; margin:7px 0 0 2px; font-size:13px; font-weight:600; color:#e5484d; }
        .lt-trap{ position:absolute !important; left:-10000px !important; width:1px; height:1px; overflow:hidden; }
        .lt-btn{ position:relative; width:100%; height:58px; margin-top:6px; border:0; border-radius:999px; cursor:pointer; font:inherit; font-size:17px; font-weight:900;
          color:#fff; background:${CORAL}; display:flex; align-items:center; justify-content:center; gap:12px; padding:0 10px 0 26px;
          box-shadow:0 16px 34px -14px rgba(255,106,77,.7); transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s, opacity .18s; }
        .lt-btn:hover{ transform:translateY(-2px); box-shadow:0 20px 40px -14px rgba(255,106,77,.75); }
        .lt-btn:active{ transform:translateY(0); }
        .lt-btn[disabled]{ cursor:default; opacity:.85; transform:none; }
        .lt-arr{ width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,.22); display:inline-flex; align-items:center; justify-content:center; transition:transform .2s; }
        .lt-btn:hover .lt-arr{ transform:translateX(3px); }
        .lt-spin{ width:18px; height:18px; border-radius:50%; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; animation:ltSpin .7s linear infinite; }
        @keyframes ltSpin{ to{ transform:rotate(360deg); } }
        .lt-err{ margin:14px 0 0; padding:11px 14px; border-radius:14px; font-size:14px; font-weight:600; color:#c2410c; background:${dark ? 'rgba(229,72,77,.12)' : '#fff1ee'}; }
        .lt-fine{ margin:14px 2px 0; font-size:12.5px; line-height:1.5; color:${muted}; }
        .lt-fine a{ color:inherit; text-decoration:underline; text-underline-offset:2px; }
        .lt-done{ text-align:center; padding:18px 6px; animation:ltIn .45s cubic-bezier(.22,1,.36,1) both; }
        .lt-check{ width:68px; height:68px; margin:0 auto 18px; border-radius:50%; background:rgba(0,196,140,.14); color:#00a877; display:flex; align-items:center; justify-content:center; animation:ltPop .5s cubic-bezier(.34,1.56,.64,1) both; }
        .lt-check path{ stroke-dasharray:24; stroke-dashoffset:24; animation:ltDraw .45s .2s ease-out forwards; }
        .lt-done h3{ margin:0; font-size:24px; font-weight:900; letter-spacing:-.02em; }
        .lt-done p{ margin:10px auto 0; max-width:340px; font-size:15.5px; line-height:1.55; color:${muted}; }
        .lt-done a{ color:${CORAL}; font-weight:800; text-decoration:none; }
        @keyframes ltIn{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }
        @keyframes ltPop{ from{ transform:scale(.5); opacity:0; } to{ transform:scale(1); opacity:1; } }
        @keyframes ltDraw{ to{ stroke-dashoffset:0; } }
        @media (max-width:860px){ .lt-card{ grid-template-columns:1fr; border-radius:28px; } .lt-sub{ max-width:none; } }
        @media (max-width:600px){ .lt{ padding:44px 12px; } .lt-card{ padding:26px 18px 18px; border-radius:26px; } .lt-points{ margin-top:22px; } .lt-form{ padding:18px; border-radius:22px; } }
        @media (prefers-reduced-motion:reduce){ .lt-dot, .lt-done, .lt-check, .lt-check path, .lt-spin{ animation:none !important; } .lt-check path{ stroke-dashoffset:0; } .lt-btn, .lt-arr{ transition:none; } }
      `}</style>
      <div className="lt-card">
        <span aria-hidden className="lt-glow" style={{ width: 340, height: 340, top: -140, left: -110, background: CORAL, opacity: dark ? 0.16 : 0.14 }} />
        <span aria-hidden className="lt-glow" style={{ width: 300, height: 300, bottom: -150, right: -90, background: '#7c5cff', opacity: dark ? 0.16 : 0.1 }} />

        <div className="lt-copy">
          <div className="lt-eyebrow"><span className="lt-dot" aria-hidden />Talk to the Colvy team</div>
          <h2 id="lt-title" className="lt-h">Have questions?<br /><em>Let’s talk.</em></h2>
          <p className="lt-sub">Leave your details and our team will get back to you.</p>
          <ul className="lt-points">
            {['A real person from our team, not a bot', 'Ask about pricing, setup or moving from another tool', 'We only use your number to get back to you'].map(t => (
              <li key={t}>
                <span className="lt-tick" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="lt-form" aria-live="polite">
          {done ? (
            <div className="lt-done">
              <div className="lt-check" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
              <h3>Thanks, {done.first}.</h3>
              <p>Our team will call or text you on <b style={{ color: ink }}>{done.phone}</b> soon.</p>
              <p>Need us sooner? Call or text <a href={COLVY_CONTACT.telHref}>{COLVY_CONTACT.phoneDisplay}</a>.</p>
            </div>
          ) : (
            <form onSubmit={submit} onFocusCapture={start} onPointerDownCapture={start} noValidate>
              <label className="lt-field">
                <span>Name</span>
                <input className="lt-in" name="name" autoComplete="name" placeholder="Your name" maxLength={60}
                  value={name} onChange={e => { setName(e.target.value); if (bad.name) setBad(b => ({ ...b, name: undefined })) }}
                  aria-invalid={!!bad.name} aria-describedby={bad.name ? 'lt-bad-name' : undefined} />
                {bad.name && <small id="lt-bad-name" className="lt-bad">{bad.name}</small>}
              </label>
              <label className="lt-field">
                <span>Phone number</span>
                <input className="lt-in" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0412 345 678" maxLength={24}
                  value={phone} onChange={e => { setPhone(e.target.value); if (bad.phone) setBad(b => ({ ...b, phone: undefined })) }}
                  aria-invalid={!!bad.phone} aria-describedby={bad.phone ? 'lt-bad-phone' : undefined} />
                {bad.phone && <small id="lt-bad-phone" className="lt-bad">{bad.phone}</small>}
              </label>
              {/* People never see this; bots fill it in. */}
              <div className="lt-trap" aria-hidden>
                <label>Website<input name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
              </div>
              {started && <Turnstile ref={humanBox} onToken={t => { human.current = t }} action="lets-talk" />}
              <button type="submit" className="lt-btn" disabled={sending}>
                {sending ? <><span className="lt-spin" aria-hidden />Sending…</> : <>Call me back<span className="lt-arr" aria-hidden><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></>}
              </button>
              {error && <p className="lt-err" role="alert">{error}</p>}
              <p className="lt-fine">We’ll call or text you about your question, nothing else. No marketing. See our <a href="/privacy">privacy policy</a>.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
