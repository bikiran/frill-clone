'use client'

// Landing "Just shipped": the newest features as a bento of photo cards, each
// with a small live piece of the product playing over its photo: the floor plan
// filling up, a guest tapping "I'm here", a quote being accepted, a sign-in
// code arriving, a tax invoice printing, a repeat booking and a waitlist offer.
//
// Every animation is CSS, paused until its card is on screen (and paused again
// when it scrolls away), looping gently while it's in view. With reduced motion
// the cards show the finished state and nothing moves. Made-up names only.

import { Fragment, useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'

const CORAL = '#ff6a4d'
const PINK = '#ff4d8d'
const GREEN = '#00c48c'
const BLUE = '#2b59ff'
const CYAN = '#0891b2'
const INDIGO = '#4f46e5'
const INK = '#0f1119'
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

type Key = 'res' | 'chk' | 'job' | 'acc' | 'rec' | 'reg'
type Feature = { key: Key; icon: keyof typeof ICONS; title: string; desc: string; cta: string; href: string; color: string; img: string }

const FEATURES: Feature[] = [
  { key: 'res', icon: 'utensils', title: 'Table reservations', desc: 'A table booking page, a live floor plan, covers and pacing, deposits for bigger groups and no-show tools.', cta: 'See reservations', href: '/product/reservations', color: PINK, img: '/new/reservations.webp' },
  { key: 'chk', icon: 'hand', title: '“I’m here” check-in', desc: 'Guests tap “I’m here” on their booking page. Your team gets an alert and sees them as arrived.', cta: 'See check-in', href: '/product/check-in', color: GREEN, img: '/new/check-in.webp' },
  { key: 'job', icon: 'briefcase', title: 'Jobs & quotes', desc: 'Quotes customers accept online, a jobs board and calendar, clash checks, checklists, photos and sign-off.', cta: 'See jobs', href: '/product/jobs', color: BLUE, img: '/new/jobs.webp' },
  { key: 'acc', icon: 'key', title: 'Customer accounts', desc: 'Customers sign in with a code to see bookings, quotes and orders, pay deposits and book again. No password.', cta: 'See accounts', href: '/product/customer-accounts', color: CYAN, img: '/new/accounts.webp' },
  { key: 'rec', icon: 'receipt', title: 'Receipts & tax invoices', desc: 'Send a receipt by email or text, or let them open it in their account. Tax invoices show your ABN and GST.', cta: 'See receipts', href: '/product/receipts', color: INDIGO, img: '/new/receipts.webp' },
  { key: 'reg', icon: 'repeat', title: 'Regular bookings & waitlist', desc: 'Repeat a booking every few weeks, and offer freed-up times to the people waiting, automatically.', cta: 'See bookings', href: '/product/booking', color: CORAL, img: '/new/booking.webp' },
]

const ICONS = {
  utensils: <><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>,
  hand: <><path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></>,
  briefcase: <><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>,
  receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
}
const Icon = ({ name, size = 18, color = 'currentColor', width = 2 }: { name: keyof typeof ICONS; size?: number; color?: string; width?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
)
const Arrow = ({ s = 14 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
const Tick = ({ s = 12, c = 'currentColor' }: { s?: number; c?: string }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>

// An animated element: `kf` is a keyframe below, `d` its delay in seconds. All
// share one cycle (CYCLE), so a card's pieces stay in step loop after loop.
const CYCLE = 9
const a = (kf: string, d = 0, extra: CSSProperties = {}): CSSProperties => ({ animation: `${kf} ${CYCLE}s cubic-bezier(0.16,1,0.3,1) ${d}s infinite both`, ...extra })

// ── The live pieces ─────────────────────────────────────────────────────────

const TABLES: { k: 'c' | 'r'; x: number; y: number; w?: number; h?: number; r?: number; seats: number; at: number }[] = [
  { k: 'c', x: 38, y: 36, r: 15, seats: 2, at: 0.5 },
  { k: 'c', x: 92, y: 36, r: 15, seats: 2, at: 1.6 },
  { k: 'r', x: 128, y: 19, w: 62, h: 34, seats: 4, at: 0.9 },
  { k: 'r', x: 204, y: 19, w: 54, h: 34, seats: 4, at: 2.3 },
  { k: 'r', x: 20, y: 76, w: 80, h: 38, seats: 6, at: 1.3 },
  { k: 'c', x: 146, y: 95, r: 20, seats: 4, at: 2.0 },
  { k: 'r', x: 186, y: 76, w: 72, h: 38, seats: 6, at: 2.7 },
]
function FloorPlan() {
  return (
    <div className="js-stack" style={{ width: 300 }}>
      <div className="js-ui" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Tonight <span style={{ color: '#8a8f9c', fontWeight: 600 }}>· Floor</span></span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: '#8a8f9c' }}>38/48 covers</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: '#eef0f5', overflow: 'hidden', marginBottom: 10 }}>
          <i style={a('js-bar', 0.4, { display: 'block', height: '100%', width: '82%', borderRadius: 99, background: `linear-gradient(90deg, ${PINK}, ${CORAL})` })} />
        </div>
        <svg viewBox="0 0 280 130" width="100%" style={{ display: 'block' }} aria-hidden>
          {TABLES.map((t, i) => {
            const cx = t.k === 'c' ? t.x : t.x + (t.w || 0) / 2
            const cy = t.k === 'c' ? t.y : t.y + (t.h || 0) / 2
            return (
              <g key={i}>
                {t.k === 'c'
                  ? <circle cx={t.x} cy={t.y} r={t.r} className="js-tbl" style={a('js-book', t.at)} />
                  : <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={9} className="js-tbl" style={a('js-book', t.at)} />}
                <text x={cx} y={cy + 4} textAnchor="middle" className="js-tbl-n" style={a('js-book-n', t.at)}>{t.seats}</text>
              </g>
            )
          })}
          <circle cx={146} cy={95} r={20} fill="none" stroke={PINK} strokeWidth={2} className="js-ring" style={a('js-ring', 3.3, { transformOrigin: '146px 95px' })} />
        </svg>
      </div>
      <div className="js-toast js-booked" style={a('js-pop', 2.0)}>
        <span className="js-dot" style={{ background: GREEN }} />Booked · table for 4 · 7:30 pm
      </div>
    </div>
  )
}

function CheckIn() {
  return (
    <div className="js-stack" style={{ width: 226, paddingTop: 24 }}>
      <div className="js-alert" style={a('js-drop', 2.9, { position: 'absolute', top: 0, left: -14, right: -14, zIndex: 2 })}>
        <span className="js-dot" style={{ background: GREEN, boxShadow: `0 0 0 4px ${GREEN}33` }} />
        <span style={{ flex: 1 }}><b>Sam has arrived</b> · table 4</span>
        <span style={{ opacity: 0.6, fontFamily: MONO, fontSize: 10.5 }}>now</span>
      </div>
      <div className="js-ui js-phone">
        <div style={{ fontSize: 11, color: '#8a8f9c', fontWeight: 700, letterSpacing: '.02em' }}>Harbour Bistro</div>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-.01em', margin: '6px 0 2px' }}>Tonight, 7:30 pm</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Table for 4 · booked by Sam</div>
        <div style={{ position: 'relative', marginTop: 16, height: 42 }}>
          <div className="js-btn" style={a('js-press', 0)}>
            <span className="js-la" style={a('js-label-a', 0, { position: 'absolute' })}>I’m here</span>
            <span className="js-lb" style={a('js-label-b', 0, { position: 'absolute', display: 'inline-flex', alignItems: 'center', gap: 6 })}><Tick s={13} c="#fff" /> Checked in</span>
          </div>
          <i className="js-ripple" style={a('js-ripple', 0)} />
        </div>
        <div style={{ fontSize: 10.5, color: '#9aa0ad', marginTop: 10, textAlign: 'center' }}>We’ll let the team know you’re here</div>
      </div>
    </div>
  )
}

function Quote() {
  const line = (l: string, v: string) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 11.5 }}><span style={{ color: '#4b5160' }}>{l}</span><span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>
  return (
    <div className="js-stack" style={{ width: 250 }}>
      <div className="js-ui" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>Quote Q-1042</b>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#8a8f9c' }}>v1</span>
        </div>
        {line('Switchboard upgrade', '$1,240.00')}
        {line('RCD safety switch × 2', '$171.00')}
        {line('Labour, 3 h', '$360.00')}
        <div style={{ height: 1, background: '#eceef3', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#8a8f9c' }}>Total incl. GST</span>
          <b style={{ fontFamily: MONO, fontSize: 15 }}>$1,771.00</b>
        </div>
        <div className="js-stamp" style={a('js-stamp', 2.2)}>Accepted</div>
      </div>
      <div className="js-track">
        <span className="js-step on">Quoting</span>
        <span className="js-line"><i style={a('js-grow', 3.0)} /></span>
        <span className="js-step" style={a('js-step-on', 3.4)}>Scheduled · Thu 9 am</span>
      </div>
    </div>
  )
}

function SignIn() {
  return (
    <div className="js-ui" style={{ width: 232, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#8a8f9c', fontWeight: 700, marginBottom: 8 }}>Your sign-in code</div>
      <div style={{ display: 'flex', gap: 5 }}>
        {'482190'.split('').map((n, i) => (
          <span key={i} className="js-box"><span style={a('js-pop', 0.5 + i * 0.28)}>{n}</span></span>
        ))}
      </div>
      <div style={a('js-pop', 2.5, { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' })}>
        <span className="js-chip" style={{ background: '#e7f9f2', color: '#047857' }}><Tick s={11} /> Signed in</span>
        <span className="js-chip">2 bookings · 1 quote</span>
      </div>
    </div>
  )
}

function Receipt() {
  const line = (l: string, v: string, bold = false) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', fontWeight: bold ? 800 : 500 }}><span>{l}</span><span style={{ fontFamily: MONO }}>{v}</span></div>
  return (
    <div className="js-stack" style={{ width: 196 }}>
      <div className="js-paper" style={a('js-print', 0.3)}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em' }}>TAX INVOICE</div>
        <div style={{ fontSize: 9.5, color: '#8a8f9c', fontFamily: MONO, margin: '2px 0 6px' }}>ABN 12 345 678 901</div>
        {line('Cut & colour', '$90.91')}
        {line('GST', '$9.09')}
        <div style={{ height: 1, background: '#eceef3', margin: '3px 0' }} />
        {line('Total', '$100.00', true)}
      </div>
      <span className="js-chip js-sent" style={a('js-pop', 2.2, { position: 'absolute', right: -6, bottom: -12 })}><Tick s={11} /> Sent by text</span>
    </div>
  )
}

function Regular() {
  return (
    <div className="js-ui" style={{ width: 240, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
        <Icon name="repeat" size={13} color={CORAL} width={2.4} /> Every 4 weeks · Tue 9:30
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
        {['Wk 1', 'Wk 5', 'Wk 9', 'Wk 13'].map((w, i) => (
          <span key={w} className="js-wk" style={a('js-pop', 0.4 + i * 0.35)}>{w}</span>
        ))}
      </div>
      <div style={a('js-pop', 2.2, { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 })}>
        <span className="js-dot" style={{ background: CORAL }} /><span><b>2:30 pm</b> freed up · offered to Jess</span>
      </div>
      <div style={a('js-pop', 3.4, { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, color: '#047857', fontWeight: 700 })}>
        <Tick s={11} /> Jess took it
      </div>
    </div>
  )
}

const LIVE: Record<Key, ComponentType> = { res: FloorPlan, chk: CheckIn, job: Quote, acc: SignIn, rec: Receipt, reg: Regular }

// ── The section ─────────────────────────────────────────────────────────────

export default function JustShipped({ dark }: { dark: boolean }) {
  const secRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [hl, setHl] = useState<Key | null>(null)
  const [headIn, setHeadIn] = useState(false)
  const [slide, setSlide] = useState(0)

  // Cards: 'seen' once (the entrance), 'run' while on screen (the loop).
  useEffect(() => {
    const root = secRef.current
    if (!root) return
    const head = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setHeadIn(true); head.disconnect() } }, { threshold: 0.3 })
    const h = root.querySelector('.js-head')
    if (h) head.observe(h)
    const cards = new IntersectionObserver(entries => {
      for (const e of entries) {
        const el = e.target as HTMLElement
        if (e.isIntersecting) el.classList.add('seen', 'run')
        else el.classList.remove('run')
      }
    }, { threshold: 0.25 })
    root.querySelectorAll('.js-card').forEach(c => cards.observe(c))
    return () => { head.disconnect(); cards.disconnect() }
  }, [])

  // Phones: which card the swipe row is on, for the dots.
  useEffect(() => {
    const t = trackRef.current
    if (!t) return
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const first = t.firstElementChild as HTMLElement | null
        const step = first ? first.offsetWidth + 14 : 1
        setSlide(Math.max(0, Math.min(FEATURES.length - 1, Math.round(t.scrollLeft / step))))
      })
    }
    t.addEventListener('scroll', on, { passive: true })
    return () => { t.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const spot = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget, r = el.getBoundingClientRect()
    el.style.setProperty('--x', `${e.clientX - r.left}px`)
    el.style.setProperty('--y', `${e.clientY - r.top}px`)
  }
  const goTo = (i: number) => {
    const t = trackRef.current, c = t?.children[i] as HTMLElement | undefined
    if (t && c) t.scrollTo({ left: c.offsetLeft - t.offsetLeft - 20, behavior: 'smooth' })
  }

  // "customer accounts." wears the gradient.
  const words = 'New: tables, jobs and customer accounts.'.split(' ')

  return (
    <section ref={secRef} id="new" className={`js-sec${dark ? ' dk' : ''}`} style={{ scrollMarginTop: 80 }}>
      <style>{CSS}</style>
      <div className="js-aurora" aria-hidden><i /><i /><i /></div>
      <div className="js-grid-bg" aria-hidden />

      <div className="js-wrap">
        <header className={`js-head${headIn ? ' in' : ''}`}>
          <div className="js-intro">
            <span className="js-pill"><span className="js-live" />Just shipped <b>{FEATURES.length} new</b></span>
            <h2 className="js-h2">
              {words.map((w, i) => (
                <Fragment key={i}><span className="js-w"><span style={{ transitionDelay: `${i * 0.07}s` }} className={i >= words.length - 2 ? 'js-grad' : ''}>{w}</span></span>{i < words.length - 1 ? ' ' : ''}</Fragment>
              ))}
            </h2>
            <p className="js-lede">Table reservations for restaurants and cafés, jobs and quotes for trades, regular bookings and a waitlist for appointments, and an account page where your customers see it all, receipts included.</p>
          </div>
          <nav className="js-index" aria-label="What’s new">
            {FEATURES.map((f, i) => (
              <a key={f.key} href={f.href} onMouseEnter={() => setHl(f.key)} onMouseLeave={() => setHl(null)} onFocus={() => setHl(f.key)} onBlur={() => setHl(null)}
                style={{ ['--c' as string]: f.color, transitionDelay: `${0.25 + i * 0.06}s` } as CSSProperties}>
                <span className="js-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="js-t">{f.title}</span>
                <Arrow s={13} />
              </a>
            ))}
          </nav>
        </header>

        <div ref={trackRef} className={`js-bento${hl ? ' hl' : ''}`}>
          {FEATURES.map((f, i) => {
            const Live = LIVE[f.key]
            return (
              <a key={f.key} href={f.href} className={`js-card js-${f.key}${hl === f.key ? ' on' : ''}`} onPointerMove={spot}
                style={{ ['--c' as string]: f.color, ['--i' as string]: i } as CSSProperties}>
                <img src={f.img} alt="" aria-hidden loading="lazy" decoding="async" className="js-photo" />
                <span className="js-tint" aria-hidden />
                <span className="js-scrim" aria-hidden />
                <span className="js-spot" aria-hidden />
                <span className="js-zone" aria-hidden><Live /></span>
                <span className="js-copy">
                  <span className="js-title"><span className="js-ic"><Icon name={f.icon} size={17} color="#fff" /></span>{f.title}</span>
                  <span className="js-desc">{f.desc}</span>
                  <span className="js-cta">{f.cta} <Arrow /></span>
                </span>
              </a>
            )
          })}
        </div>
        <div className="js-dots" role="tablist" aria-label="New features">
          {FEATURES.map((f, i) => (
            <button key={f.key} type="button" role="tab" aria-selected={slide === i} aria-label={f.title} onClick={() => goTo(i)} className={slide === i ? 'on' : ''} style={{ ['--c' as string]: f.color } as CSSProperties} />
          ))}
        </div>
      </div>
    </section>
  )
}

const CSS = `
.js-sec{position:relative;overflow:hidden;background:${INK};color:#fff;padding:clamp(64px,9vw,112px) 0 clamp(56px,8vw,96px);isolation:isolate}
.js-sec.dk{background:#07080d}
.js-aurora{position:absolute;inset:-20% -10% auto;height:120%;z-index:-1;pointer-events:none}
.js-aurora i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.42;animation:js-drift 22s ease-in-out infinite alternate}
.js-aurora i:nth-child(1){width:520px;height:520px;left:-6%;top:2%;background:${CORAL}}
.js-aurora i:nth-child(2){width:460px;height:460px;right:-4%;top:-6%;background:${INDIGO};animation-duration:26s;animation-delay:-6s}
.js-aurora i:nth-child(3){width:420px;height:420px;left:38%;top:44%;background:${PINK};opacity:.26;animation-duration:30s;animation-delay:-12s}
.js-grid-bg{position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent);mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent)}
.js-wrap{max-width:1200px;margin:0 auto;padding:0 24px}

.js-head{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:48px;align-items:end;margin-bottom:34px}
.js-pill{display:inline-flex;align-items:center;gap:9px;padding:7px 14px 7px 12px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:18px;backdrop-filter:blur(6px)}
.js-pill b{margin-left:2px;padding:2px 8px;border-radius:999px;background:${CORAL};font-size:11px;letter-spacing:.04em}
.js-live{width:8px;height:8px;border-radius:50%;background:${GREEN};box-shadow:0 0 0 0 ${GREEN}aa;animation:js-live 1.8s ease-out infinite}
.js-h2{font-size:clamp(32px,5vw,58px);font-weight:900;letter-spacing:-.03em;line-height:1.02;margin:0 0 16px}
.js-w{display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.12em;margin-bottom:-.12em}
.js-w>span{display:inline-block;transform:translateY(110%);opacity:0;transition:transform .7s cubic-bezier(.16,1,.3,1),opacity .5s}
.js-head.in .js-w>span{transform:none;opacity:1}
.js-grad{background:linear-gradient(92deg,${CORAL},${PINK} 45%,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
.js-lede{font-size:17px;line-height:1.6;color:rgba(255,255,255,.68);margin:0;max-width:640px}
.js-index{display:flex;flex-direction:column;border-top:1px solid rgba(255,255,255,.12)}
.js-index a{display:flex;align-items:center;gap:12px;padding:11px 2px;border-bottom:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.78);text-decoration:none;font-size:14px;font-weight:700;opacity:0;transform:translateX(16px);transition:opacity .5s, transform .6s cubic-bezier(.16,1,.3,1), color .2s, padding .25s}
.js-head.in .js-index a{opacity:1;transform:none}
.js-index a:hover,.js-index a:focus-visible{color:#fff;padding-left:8px;outline:none}
.js-index .js-n{font-family:${MONO};font-size:11.5px;color:var(--c);width:20px}
.js-index .js-t{flex:1}
.js-index svg{opacity:.4;transition:opacity .2s, transform .2s}
.js-index a:hover svg{opacity:1;transform:translateX(3px)}

.js-bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,352px);gap:18px;grid-template-areas:"res res chk" "job acc chk" "job rec reg"}
.js-res{grid-area:res}.js-chk{grid-area:chk}.js-job{grid-area:job}.js-acc{grid-area:acc}.js-rec{grid-area:rec}.js-reg{grid-area:reg}

.js-card{--x:50%;--y:50%;position:relative;display:block;border-radius:26px;overflow:hidden;color:#fff;text-decoration:none;background:#151824;
  box-shadow:0 0 0 1px rgba(255,255,255,.09) inset, 0 30px 60px rgba(0,0,0,.35);
  opacity:0;transform:translateY(46px) scale(.96);
  transition:opacity .8s cubic-bezier(.16,1,.3,1) calc(var(--i)*.08s), transform .8s cubic-bezier(.16,1,.3,1) calc(var(--i)*.08s), box-shadow .3s}
.js-card.seen{opacity:1;transform:none}
.js-card.seen:hover,.js-card.seen:focus-visible,.js-card.on{transform:translateY(-6px);box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 70%,transparent) inset,0 40px 80px rgba(0,0,0,.45),0 0 60px color-mix(in srgb,var(--c) 30%,transparent);outline:none;transition-delay:0s}
.js-bento.hl .js-card.seen:not(.on){opacity:.5}
.js-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.1) contrast(1.05);transform:scale(1.02);transition:transform 1.2s cubic-bezier(.16,1,.3,1)}
.js-card:hover .js-photo,.js-card.on .js-photo{transform:scale(1.08)}
.js-tint{position:absolute;inset:0;background:var(--c);mix-blend-mode:soft-light;opacity:.5}
.js-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,17,25,.25) 0%,rgba(15,17,25,.38) 40%,rgba(15,17,25,.93) 100%)}
.js-res .js-scrim{background:linear-gradient(90deg,rgba(15,17,25,.94) 0%,rgba(15,17,25,.7) 42%,rgba(15,17,25,.22) 100%),linear-gradient(180deg,transparent 50%,rgba(15,17,25,.5))}
.js-spot{position:absolute;inset:0;opacity:0;transition:opacity .3s;background:radial-gradient(360px circle at var(--x) var(--y),color-mix(in srgb,var(--c) 34%,transparent),transparent 60%);mix-blend-mode:screen}
.js-card:hover .js-spot{opacity:1}

.js-zone{position:absolute;left:22px;right:22px;top:22px;height:150px;display:flex;align-items:flex-start;justify-content:flex-end;pointer-events:none}
.js-chk .js-zone,.js-job .js-zone{height:auto;bottom:210px;align-items:center;justify-content:center}
.js-res .js-zone{left:auto;right:40px;top:0;bottom:0;height:auto;width:330px;align-items:center;justify-content:center}
.js-copy{position:absolute;left:24px;right:24px;bottom:22px;display:flex;flex-direction:column}
.js-res .js-copy{right:auto;max-width:min(380px,48%);bottom:26px}
.js-title{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:900;letter-spacing:-.02em;margin-bottom:8px}
.js-res .js-title{font-size:clamp(24px,2.6vw,32px)}
.js-ic{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 30%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent) inset;backdrop-filter:blur(6px)}
.js-desc{font-size:14px;line-height:1.5;color:rgba(255,255,255,.78);margin-bottom:12px}
.js-cta{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800}
.js-cta svg{transition:transform .25s}
.js-card:hover .js-cta svg{transform:translateX(4px)}

/* The live pieces */
.js-stack{position:relative}
.js-ui{position:relative;background:#fff;color:${INK};border-radius:16px;box-shadow:0 22px 50px rgba(0,0,0,.38),0 0 0 1px rgba(15,17,25,.06);font-size:12px;text-align:left}
.js-toast,.js-alert{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:13px;font-size:11.5px;white-space:nowrap;box-shadow:0 16px 36px rgba(0,0,0,.35)}
.js-toast{background:#fff;color:${INK};font-weight:700}
.js-booked{position:absolute;right:-22px;bottom:-20px}
.js-alert{background:rgba(15,17,25,.82);color:#fff;backdrop-filter:blur(10px);box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 16px 36px rgba(0,0,0,.4)}
.js-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%}
.js-tbl{fill:#eef0f5;stroke:#dfe3ec;stroke-width:1.5}
.js-tbl-n{font:700 11px ${MONO};fill:#8a8f9c}
.js-phone{padding:18px 16px 14px;border-radius:24px;box-shadow:0 26px 60px rgba(0,0,0,.45),0 0 0 6px rgba(255,255,255,.14)}
.js-btn{position:absolute;inset:0;border-radius:12px;background:${GREEN};color:#fff;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center}
.js-ripple{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.75)}
.js-stamp{position:absolute;right:-12px;top:-16px;transform:rotate(-14deg);box-shadow:0 8px 20px rgba(0,0,0,.25);padding:5px 12px;border-radius:9px;border:2.5px solid ${GREEN};color:${GREEN};font-weight:900;font-size:15px;text-transform:uppercase;letter-spacing:.08em;background:rgba(255,255,255,.9)}
.js-track{display:flex;align-items:center;gap:8px;margin-top:12px}
.js-step{padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(255,255,255,.12);color:rgba(255,255,255,.8);white-space:nowrap;box-shadow:0 0 0 1px rgba(255,255,255,.14) inset}
.js-step.on{background:#fff;color:${INK}}
.js-line{flex:1;height:2px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
.js-line i{display:block;height:100%;width:100%;background:${BLUE};transform-origin:left}
.js-box{width:30px;height:34px;border-radius:9px;background:#f3f4f8;box-shadow:0 0 0 1px #e3e6ee inset;display:inline-flex;align-items:center;justify-content:center;font:800 15px ${MONO};color:${INK}}
.js-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;background:#f1f2f6;color:#4b5160;font-size:10.5px;font-weight:800;white-space:nowrap}
.js-sent{background:#e7f9f2;color:#047857;box-shadow:0 10px 24px rgba(0,0,0,.3);padding:6px 10px;font-size:11px}
.js-paper{background:#fff;color:${INK};padding:12px 13px 22px;box-shadow:0 22px 50px rgba(0,0,0,.4);
  -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/12px 100%;mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/12px 100%;border-radius:4px 4px 0 0}
.js-wk{flex:1;text-align:center;padding:6px 0;border-radius:9px;background:#fff1ec;color:#c2410c;font-size:10.5px;font-weight:800;box-shadow:0 0 0 1px #ffd8cb inset}

/* Paused until on screen */
.js-card [style*="animation"]{animation-play-state:paused!important}
.js-card.run [style*="animation"]{animation-play-state:running!important}

@keyframes js-pop{0%{opacity:0;transform:translateY(8px) scale(.94)}5%{opacity:1;transform:none}84%{opacity:1;transform:none}90%,100%{opacity:0;transform:translateY(-4px)}}
@keyframes js-drop{0%{opacity:0;transform:translateY(-14px) scale(.96)}5%{opacity:1;transform:none}80%{opacity:1;transform:none}88%,100%{opacity:0;transform:translateY(-8px)}}
@keyframes js-bar{0%{transform:scaleX(0);transform-origin:left}30%{transform:scaleX(1)}86%{transform:scaleX(1)}94%,100%{transform:scaleX(0)}}
@keyframes js-book{0%{fill:#eef0f5;stroke:#dfe3ec}4%{fill:${PINK};stroke:${PINK}}82%{fill:${PINK};stroke:${PINK}}90%,100%{fill:#eef0f5;stroke:#dfe3ec}}
@keyframes js-book-n{0%{fill:#8a8f9c}4%{fill:#fff}82%{fill:#fff}90%,100%{fill:#8a8f9c}}
@keyframes js-ring{0%{opacity:0;transform:scale(1)}4%{opacity:.9}24%{opacity:0;transform:scale(1.7)}100%{opacity:0;transform:scale(1.7)}}
@keyframes js-press{0%,22%{transform:none;background:${GREEN}}25%{transform:scale(.93)}29%{transform:none;background:#047857}86%{background:#047857}92%,100%{background:${GREEN}}}
@keyframes js-label-a{0%,25%{opacity:1}28%,88%{opacity:0}93%,100%{opacity:1}}
@keyframes js-label-b{0%,25%{opacity:0;transform:translateY(6px)}30%,86%{opacity:1;transform:none}91%,100%{opacity:0}}
@keyframes js-ripple{0%,21%{opacity:0;transform:scale(.3)}23%{opacity:.8;transform:scale(.6)}34%,100%{opacity:0;transform:scale(2.6)}}
@keyframes js-stamp{0%{opacity:0;transform:rotate(-14deg) scale(2.2)}4%{opacity:1;transform:rotate(-14deg) scale(.92)}7%{transform:rotate(-14deg) scale(1)}84%{opacity:1;transform:rotate(-14deg) scale(1)}90%,100%{opacity:0;transform:rotate(-14deg) scale(1)}}
@keyframes js-grow{0%{transform:scaleX(0)}8%{transform:scaleX(1)}80%{transform:scaleX(1)}88%,100%{transform:scaleX(0)}}
@keyframes js-step-on{0%{background:rgba(255,255,255,.12);color:rgba(255,255,255,.8)}5%,78%{background:${BLUE};color:#fff}86%,100%{background:rgba(255,255,255,.12);color:rgba(255,255,255,.8)}}
@keyframes js-print{0%{clip-path:inset(0 0 100% 0);transform:translateY(-10px)}18%{clip-path:inset(0 0 0 0);transform:none}84%{clip-path:inset(0 0 0 0);transform:none}92%,100%{clip-path:inset(0 0 100% 0);transform:translateY(-10px)}}
@keyframes js-drift{0%{transform:translate(0,0) scale(1)}100%{transform:translate(60px,40px) scale(1.15)}}
@keyframes js-live{0%{box-shadow:0 0 0 0 ${GREEN}aa}80%,100%{box-shadow:0 0 0 9px ${GREEN}00}}

.js-dots{display:none}

@media (max-width:1040px){
  .js-head{grid-template-columns:1fr;gap:26px}
  .js-index{display:none}
  .js-bento{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:400px 470px 380px 360px;grid-template-areas:"res res" "chk job" "acc rec" "reg reg"}
  .js-chk .js-zone,.js-job .js-zone{bottom:196px}
  .js-reg .js-copy{right:auto;max-width:48%}
  .js-reg .js-zone{left:auto;right:30px;top:0;bottom:0;height:auto;align-items:center}
  .js-reg .js-scrim{background:linear-gradient(90deg,rgba(15,17,25,.94) 0%,rgba(15,17,25,.6) 50%,rgba(15,17,25,.25) 100%)}
}
@media (max-width:680px){
  .js-wrap{padding:0}
  .js-head{padding:0 20px;margin-bottom:24px}
  .js-bento{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding:6px 20px 24px;scroll-padding:0 20px}
  .js-bento::-webkit-scrollbar{display:none}
  .js-card{flex:0 0 min(84vw,340px);height:500px;scroll-snap-align:start}
  .js-zone,.js-res .js-zone,.js-chk .js-zone,.js-job .js-zone,.js-reg .js-zone{left:16px;right:16px;top:16px;bottom:206px;width:auto;height:auto;align-items:center;justify-content:center}
  .js-copy,.js-res .js-copy,.js-reg .js-copy{left:20px;right:20px;max-width:none;bottom:20px}
  .js-res .js-scrim,.js-reg .js-scrim{background:linear-gradient(180deg,rgba(15,17,25,.25) 0%,rgba(15,17,25,.38) 40%,rgba(15,17,25,.93) 100%)}
  .js-res .js-title{font-size:22px}
  .js-res .js-stack{transform:scale(.92)}
  .js-booked{left:-6px;right:auto;bottom:-22px}
  .js-dots{display:flex;justify-content:center;gap:8px;margin-top:2px}
  .js-dots button{width:8px;height:8px;border-radius:99px;border:none;padding:0;background:rgba(255,255,255,.28);cursor:pointer;transition:width .3s, background .3s}
  .js-dots button.on{width:26px;background:var(--c)}
}
@media (prefers-reduced-motion:reduce){
  .js-sec *{animation:none!important}
  .js-card,.js-w>span,.js-index a{transition:none!important;opacity:1!important;transform:none!important}
  .js-ripple,.js-ring,.js-la{display:none}
  .js-lb{opacity:1}
  .js-tbl{fill:${PINK};stroke:${PINK}}.js-tbl-n{fill:#fff}
  .js-track .js-step:last-child{background:${BLUE};color:#fff}
}
`
