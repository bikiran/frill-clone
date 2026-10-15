'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'

// Linktree-style scroll story for the homepage. The section pins to the screen
// while you scroll through five beats; the background colour shifts between
// them and a set of product cards flies between layouts — channel messages
// fanned out, then pulled into one inbox, then a payment link and a paid order,
// the AI answering a call, and the follow-ups that bring customers back.
// Everything is driven by scroll position (no timers), so it moves exactly as
// fast as the visitor scrolls. With reduced motion it's five still panels.

type Pose = { x: number; y: number; r?: number; s?: number; o?: number }
type Stage = { key: string; eyebrow: string; title: string; body: string; bg: string; ink: string; poses: Record<string, Pose> }

const STAGES: Stage[] = [
  {
    key: 'channels', eyebrow: 'Every channel', title: 'Every message, wherever it starts.',
    body: 'WhatsApp, Instagram, Messenger, SMS, email and phone calls. Customers reach you however they like.',
    bg: '#ff6a4d', ink: '#fff4ef',
    poses: { wa: { x: -125, y: -175, r: -6 }, ig: { x: 75, y: -120, r: 5 }, fb: { x: -150, y: -30, r: 3 }, sms: { x: 100, y: 10, r: -4 }, em: { x: -95, y: 115, r: 5 }, ph: { x: 115, y: 155, r: -3 } },
  },
  {
    key: 'inbox', eyebrow: 'One inbox', title: 'All in one inbox.',
    body: 'One thread per customer, with their orders and history beside it. Your whole team works from the same place.',
    bg: '#1f2a6b', ink: '#cdd8ff',
    poses: { wa: { x: 0, y: -20, s: 0.55, o: 0 }, ig: { x: 0, y: -20, s: 0.55, o: 0 }, fb: { x: 0, y: -20, s: 0.55, o: 0 }, sms: { x: 0, y: -20, s: 0.55, o: 0 }, em: { x: 0, y: -20, s: 0.55, o: 0 }, ph: { x: 0, y: -20, s: 0.55, o: 0 }, inbox: { x: 0, y: 0 } },
  },
  {
    key: 'sell', eyebrow: 'Sell in the chat', title: 'Turn questions into sales.',
    body: 'Send a payment link without leaving the conversation. The order lands as paid and the sale is recorded.',
    bg: '#0b5a44', ink: '#c9f6dc',
    poses: { inbox: { x: -80, y: -40, s: 0.86, o: 0.45, r: -3 }, pay: { x: 95, y: -70, r: 3 }, order: { x: 30, y: 125, r: -2 } },
  },
  {
    key: 'ai', eyebrow: 'AI that picks up', title: 'Never miss a call again.',
    body: 'Colvy’s AI answers in a natural voice, checks your stock, texts links and leaves your team a call-back task.',
    bg: '#4c1658', ink: '#f6cdfa',
    poses: { pay: { x: 320, y: -120, r: 12, o: 0 }, order: { x: 300, y: 160, r: 10, o: 0 }, call: { x: 0, y: 0 } },
  },
  {
    key: 'return', eyebrow: 'Customers come back', title: 'Keep them coming back.',
    body: 'Back-in-stock texts, review replies and follow-ups go out on their own, so every customer feels looked after.',
    bg: '#7a0019', ink: '#ffc9dc',
    poses: { call: { x: -70, y: -120, s: 0.82, o: 0.35, r: -3 }, review: { x: 70, y: -60, r: 3 }, restock: { x: -35, y: 115, r: -3 } },
  },
]

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))
// Hold each beat for a while, then move: the change happens in the middle
// half of the scroll between two beats.
const ease = (f: number) => { const t = clamp((f - 0.22) / 0.56); return t * t * (3 - 2 * t) }
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

function poseAt(id: string, p: number): Pose & { r: number; s: number; o: number } {
  const i = Math.floor(clamp(p, 0, STAGES.length - 1)), j = Math.min(i + 1, STAGES.length - 1)
  const t = ease(p - i)
  const full = (q?: Pose) => q ? { r: 0, s: 1, o: 1, ...q } : undefined
  let a = full(STAGES[i].poses[id]), b = full(STAGES[j].poses[id])
  // Not in a beat: fade in/out in place (slightly lower and smaller).
  if (!a && !b) return { x: 0, y: 40, r: 0, s: 0.9, o: 0 }
  if (!a) a = { ...b!, y: b!.y + 50, s: b!.s * 0.9, o: 0 }
  if (!b) b = { ...a, y: a.y - 40, s: a.s * 0.94, o: 0 }
  const l = (k: 'x' | 'y' | 'r' | 's' | 'o', f = t) => (a as any)[k] + ((b as any)[k] - (a as any)[k]) * f
  // Outgoing cards fade early, incoming ones late, so they don't pile up.
  const ft = b.o < a.o ? clamp(t * 1.7) : b.o > a.o ? clamp((t - 0.35) / 0.65) : t
  return { x: l('x'), y: l('y'), r: l('r'), s: l('s'), o: l('o', ft) }
}

// ── The cards (clean, real-looking product UI with demo data) ─────────────────
const card: React.CSSProperties = { background: '#fff', color: '#11131c', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.08)', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif' }
const Msg = ({ ch, color, who, text, time }: { ch: string; color: string; who: string; text: string; time: string }) => (
  <div style={{ ...card, width: 250, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, background: color, color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ch[0]}</span>
      <span style={{ fontSize: 12, fontWeight: 800 }}>{who}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#9ca3af' }}>{time}</span>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.45, color: '#374151' }}>{text}</div>
    <div style={{ marginTop: 7, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color }}>{ch}</div>
  </div>
)
const CHIP: Record<string, string> = { WhatsApp: '#16a34a', Instagram: '#db2777', Messenger: '#2563eb', SMS: '#0891b2', Email: '#7c3aed', Phone: '#ea580c' }
const CARDS: Record<string, ReactNode> = {
  wa: <Msg ch="WhatsApp" color={CHIP.WhatsApp} who="Priya Nair" text="Can I book a tank clean-out for Friday?" time="2m" />,
  ig: <Msg ch="Instagram" color={CHIP.Instagram} who="Mia Chen" text="Is the 4ft reef tank still available? 🐠" time="now" />,
  fb: <Msg ch="Messenger" color={CHIP.Messenger} who="Leo Martin" text="Are you open this Sunday?" time="5m" />,
  sms: <Msg ch="SMS" color={CHIP.SMS} who="Tom Becker" text="Thanks, I’ll pick it up Saturday 👍" time="9m" />,
  em: <Msg ch="Email" color={CHIP.Email} who="Jack Wu" text="Re: Delivery to Geelong — what’s the cost?" time="14m" />,
  ph: <Msg ch="Phone" color={CHIP.Phone} who="Ana Lopez" text="Missed call · 0412 555 018" time="20m" />,
  inbox: (
    <div style={{ ...card, width: 340, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid #f0f0f3' }}>
        <img src="/icon-192.png" alt="" width={22} height={22} style={{ borderRadius: 6 }} />
        <span style={{ fontSize: 14, fontWeight: 800 }}>Inbox</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#2563eb' }}>6 new</span>
      </div>
      {[['Mia Chen', 'Instagram', 'Is the 4ft reef tank still…', '#ec4899'], ['Priya Nair', 'WhatsApp', 'Can I book a tank clean-out…', '#22c55e'], ['Leo Martin', 'Messenger', 'Are you open this Sunday?', '#3b82f6'], ['Tom Becker', 'SMS', 'Thanks, I’ll pick it up…', '#0ea5e9'], ['Jack Wu', 'Email', 'Re: Delivery to Geelong', '#8b5cf6'], ['Ana Lopez', 'Phone', 'AI answered · call-back task', '#f97316']].map(([n, ch, s, c], i) => (
        <div key={n} style={{ display: 'flex', gap: 10, padding: '9px 16px', borderTop: i ? '1px solid #f4f4f6' : 'none', background: i ? '#fff' : '#fff6f3' }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n.split(' ').map(w => w[0]).join('')}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{n}</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: CHIP[ch], background: CHIP[ch] + '14', padding: '1px 5px', borderRadius: 4 }}>{ch}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{s}</div>
          </div>
        </div>
      ))}
    </div>
  ),
  pay: (
    <div style={{ ...card, width: 270, overflow: 'hidden' }}>
      <div style={{ padding: '15px 16px', display: 'flex', gap: 11, alignItems: 'center' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💳</span>
        <div><div style={{ fontSize: 15, fontWeight: 900 }}>Pay $385.00</div><div style={{ fontSize: 11.5, color: '#6b7280' }}>4ft reef tank + LED light</div></div>
      </div>
      <div style={{ padding: '9px 16px', borderTop: '1px solid #f0f0f3', display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: '#6b7280' }}>Sent to Mia · Instagram</span><span style={{ color: '#16a34a' }}>✓ Paid</span>
      </div>
    </div>
  ),
  order: (
    <div style={{ ...card, width: 270, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13.5, fontWeight: 900 }}>Order #4821</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '3px 9px', borderRadius: 999 }}>Paid</span>
      </div>
      <div style={{ fontSize: 11.5, color: '#6b7280', margin: '6px 0 10px' }}>Mia Chen · Pickup Saturday · Richmond</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#f5f3ff', fontSize: 12, fontWeight: 800, color: '#6d28d9' }}>● Sale recorded · $385</div>
    </div>
  ),
  call: (
    <div style={{ width: 350, padding: 1.5, borderRadius: 20, background: 'linear-gradient(135deg,#6366f1,#a855f7 52%,#22d3ee)', boxShadow: '0 30px 70px rgba(0,0,0,0.32)' }}>
      <div style={{ ...card, boxShadow: 'none', borderRadius: 18.5, padding: '15px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a855f7,#22d3ee)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>〰</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 800 }}>AI answered a call · 1:42</div><div style={{ fontSize: 11.5, color: '#6b7280' }}>Ana Lopez · 0412 555 018</div></div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0e7490', background: '#ecfeff', padding: '3px 8px', borderRadius: 999 }}>⚡ 1.9s replies</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0 10px' }}>
          <span style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 11px', borderRadius: '12px 12px 12px 4px', background: '#f1f5f9' }}>Do you have neon tetras in stock?</span>
          <span style={{ alignSelf: 'flex-end', fontSize: 12, padding: '7px 11px', borderRadius: '12px 12px 4px 12px', background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', color: '#312e81' }}>Yes, 40 in stock at $3 each. Want me to hold some?</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 9px', borderRadius: 999 }}>✓ Call-back task created</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '3px 9px', borderRadius: 999 }}>Texted a link</span>
        </div>
      </div>
    </div>
  ),
  review: (
    <div style={{ ...card, width: 290, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, letterSpacing: 1, color: '#f59e0b' }}>★★★★★</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Google · 2h ago</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, margin: '7px 0 10px', color: '#374151' }}>“Best reef shop in Melbourne. They texted me the moment my tank came in!”</div>
      <div style={{ fontSize: 11.5, padding: '8px 10px', borderRadius: 10, background: '#fff7ed', color: '#9a3412' }}><b>Reply sent</b> · “Thank you Sarah, enjoy the new tank! 🐠”</div>
    </div>
  ),
  restock: (
    <div style={{ ...card, width: 290, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: CHIP.SMS, marginBottom: 6 }}>SMS · Back in stock</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: '#374151' }}>Good news! The Fluval 307 filter is back. Reply YES and we’ll hold one for you.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: '#6b7280' }}>Sent to 12 waiting customers</span><span style={{ color: '#16a34a' }}>5 replied YES</span>
      </div>
    </div>
  ),
}
const ORDER = ['inbox', 'call', 'order', 'pay', 'wa', 'ig', 'fb', 'sms', 'em', 'ph', 'review', 'restock']   // paint order (later = on top)

export default function ScrollStory() {
  const ref = useRef<HTMLElement>(null)
  const [p, setP] = useState(0)
  const [still, setStill] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStill(true); return }
    let raf = 0
    const read = () => {
      raf = 0
      const el = ref.current; if (!el) return
      const r = el.getBoundingClientRect()
      const span = r.height - window.innerHeight
      setP(clamp(-r.top / Math.max(1, span)) * (STAGES.length - 1))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])

  const i = Math.floor(clamp(p, 0, STAGES.length - 1)), j = Math.min(i + 1, STAGES.length - 1)
  const t = ease(p - i)
  const bg = mix(STAGES[i].bg, STAGES[j].bg, t)
  const ink = mix(STAGES[i].ink, STAGES[j].ink, t)

  const visual = (at: number) => (
    <div className="ss-visual" style={{ position: 'relative', width: 560, height: 560 }}>
      {ORDER.map(id => {
        const q = poseAt(id, at)
        if (q.o < 0.01) return null
        return (
          <div key={id} style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) translate3d(${q.x}px,${q.y}px,0) rotate(${q.r}deg) scale(${q.s})`, opacity: q.o, willChange: 'transform, opacity' }}>
            {CARDS[id]}
          </div>
        )
      })}
    </div>
  )

  if (still) {
    return (
      <section aria-label="What Colvy does">
        {STAGES.map((s, k) => (
          <div key={s.key} className="ss-still" style={{ background: s.bg, color: s.ink, padding: 'clamp(56px, 8vw, 96px) 24px' }}>
            <div className="ss-grid" style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40, alignItems: 'center' }}>
              <StageText s={s} />
              <div className="ss-stage" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>{visual(k)}</div>
            </div>
          </div>
        ))}
        <Styles />
      </section>
    )
  }

  return (
    <section ref={ref} aria-label="What Colvy does" style={{ position: 'relative', height: `${STAGES.length * 110}vh`, background: bg }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: bg, color: ink }}>
        <div className="ss-grid" style={{ maxWidth: 1240, height: '100%', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40, alignItems: 'center' }}>
          {/* The words for each beat, crossfading and sliding as you scroll. */}
          <div className="ss-copy" style={{ position: 'relative', height: 360 }}>
            {STAGES.map((s, k) => {
              const d = (i + t) - k
              const o = clamp(1 - Math.abs(d) * 2.2)
              if (o <= 0) return null
              return (
                <div key={s.key} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: o, transform: `translate3d(0, ${-d * 70}px, 0)`, pointerEvents: o > 0.5 ? 'auto' : 'none' }}>
                  <StageText s={s} />
                </div>
              )
            })}
          </div>
          <div className="ss-stage" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>{visual(p)}</div>
        </div>
        {/* Progress: one dot per beat */}
        <div aria-hidden className="ss-dots" style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {STAGES.map((s, k) => <span key={s.key} style={{ width: 7, height: Math.round(p) === k ? 24 : 7, borderRadius: 4, background: ink, opacity: Math.round(p) === k ? 0.95 : 0.35, transition: 'height .3s cubic-bezier(.16,1,.3,1), opacity .3s' }} />)}
        </div>
      </div>
      <Styles />
    </section>
  )
}

function StageText({ s }: { s: Stage }) {
  return (
    <div>
      <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 16 }}>{s.eyebrow}</span>
      <h2 className="ss-title" style={{ fontSize: 'clamp(40px, 5.6vw, 76px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 0.98, margin: '0 0 20px', color: 'inherit' }}>{s.title}</h2>
      <p style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', lineHeight: 1.55, maxWidth: 480, margin: 0, opacity: 0.88 }}>{s.body}</p>
    </div>
  )
}

function Styles() {
  return (
    <style>{`
      @media (max-width: 900px) {
        .ss-grid { display: flex !important; flex-direction: column; justify-content: center; gap: 0 !important; padding-top: 64px !important }
        .ss-copy { height: 230px !important; flex-shrink: 0; width: 100%; align-self: stretch }
        .ss-title { font-size: clamp(34px, 9.5vw, 46px) !important }
        .ss-stage { position: relative; height: min(52vh, 380px); width: 100%; align-self: stretch }
        .ss-stage .ss-visual { position: absolute !important; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.6) }
        .ss-dots { right: 8px !important }
        .ss-still .ss-grid { padding-top: 0 !important }
      }
    `}</style>
  )
}
