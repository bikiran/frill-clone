'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'

// Linktree-style scroll story for the homepage. The section pins to the screen
// while you scroll through five beats; the background colour shifts between
// them and a set of product cards flies between layouts — channel messages
// fanned out, then pulled into one inbox, then a payment link and a paid order,
// the AI answering a call, and the follow-ups that bring customers back.
// Scrolling picks the beat; each change then plays as one short, eased move,
// so it's smooth on phones too. With reduced motion it's five still panels.
//
// Other pages (the /for/* workflow pages, the platform page) pass their own
// beats and cards; with no props it tells the homepage story.

export type Pose = { x: number; y: number; r?: number; s?: number; o?: number }
export type Stage = { key: string; eyebrow: string; title: string; body: string; bg: string; ink: string; poses: Record<string, Pose> }

const HOME_STAGES: Stage[] = [
  {
    key: 'channels', eyebrow: 'Every channel', title: 'Every message, wherever it starts.',
    body: 'Instagram, Messenger, SMS, email and phone calls. Customers reach you however they like.',
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

// How a beat changes. Scroll only picks the beat; the change itself is a
// timed, eased move (CSS transitions on transform and opacity, which the
// browser runs off the main thread), so it always finishes — never parked
// half-way with two beats on top of each other — and stays smooth however
// fast the page is scrolled or flung. A change that's interrupted carries on
// from wherever it had got to.
const EASE = 'cubic-bezier(.22,1,.36,1)'
const MOVE = 900       // ms: cards gliding to their new places
const FADE_OUT = 340   // what's leaving goes first…
const FADE_IN = 560    // …and what's arriving fades in after it,
const IN_DELAY = 200   // starting a little later, so they don't sit on top of each other
const STAGGER = 45     // and one after another
const BG = 750         // the background colour

type Full = { x: number; y: number; r: number; s: number; o: number }
const full = (q: Pose): Full => ({ r: 0, s: 1, o: 1, ...q })

// Where a card sits during beat k. Not in that beat: invisible, just below
// where it comes in next, or drifted up from where it was last.
function restPose(stages: Stage[], id: string, k: number): Full {
  const at = (n: number) => stages[n]?.poses[id]
  const here = at(k)
  if (here) return full(here)
  let next = -1, prev = -1
  for (let n = k + 1; n < stages.length; n++) if (at(n)) { next = n; break }
  for (let n = k - 1; n >= 0; n--) if (at(n)) { prev = n; break }
  const enter = (n: number) => { const b = full(at(n)!); return { ...b, y: b.y + 50, s: b.s * 0.9, o: 0 } }
  const leave = (n: number) => { const a = full(at(n)!); return { ...a, y: a.y - 40, s: a.s * 0.94, o: 0 } }
  if (next === k + 1) return enter(next)
  if (prev >= 0 && prev === k - 1) return leave(prev)
  if (next >= 0) return enter(next)
  if (prev >= 0) return leave(prev)
  return { x: 0, y: 40, r: 0, s: 0.9, o: 0 }
}

const place = (q: Full) => `translate(-50%,-50%) translate3d(${q.x}px,${q.y}px,0) rotate(${q.r}deg) scale(${q.s})`

// The transition for a card going from pose a to b. Arriving cards wait their
// turn (delay); leaving ones fade quickly; the rest glide.
function cardMotion(a: Full, b: Full, delay: number): string {
  const o = b.o < a.o ? `opacity ${b.o > 0.01 ? 500 : FADE_OUT}ms ease-out`
    : b.o > a.o ? `opacity ${FADE_IN}ms ease-out ${delay}ms`
    : `opacity ${MOVE}ms ${EASE}`
  const t = b.o > a.o && a.o < 0.01 ? `transform ${MOVE}ms ${EASE} ${delay}ms` : `transform ${MOVE}ms ${EASE}`
  // Hidden once it's faded out, so the browser can skip drawing it.
  return `${t}, ${o}, visibility 0s linear ${b.o > 0.01 ? 0 : FADE_OUT}ms`
}

// ── The cards (clean, real-looking product UI with demo data) ─────────────────
export const card: React.CSSProperties = { background: '#fff', color: '#11131c', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.08)', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif' }
export const Msg = ({ ch, color, who, text, time }: { ch: string; color: string; who: string; text: string; time: string }) => (
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
export const CHIP: Record<string, string> = { WhatsApp: '#16a34a', Instagram: '#db2777', Messenger: '#2563eb', SMS: '#0891b2', Email: '#7c3aed', Phone: '#ea580c' }
const HOME_CARDS: Record<string, ReactNode> = {
  wa: <Msg ch="SMS" color={CHIP.SMS} who="Priya Nair" text="Can I book a tank clean-out for Friday?" time="2m" />,
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
      {[['Mia Chen', 'Instagram', 'Is the 4ft reef tank still…', '#ec4899'], ['Priya Nair', 'SMS', 'Can I book a tank clean-out…', '#0891b2'], ['Leo Martin', 'Messenger', 'Are you open this Sunday?', '#3b82f6'], ['Tom Becker', 'SMS', 'Thanks, I’ll pick it up…', '#0ea5e9'], ['Jack Wu', 'Email', 'Re: Delivery to Geelong', '#8b5cf6'], ['Ana Lopez', 'Phone', 'AI answered · call-back task', '#f97316']].map(([n, ch, s, c], i) => (
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
const HOME_ORDER = ['inbox', 'call', 'order', 'pay', 'wa', 'ig', 'fb', 'sms', 'em', 'ph', 'review', 'restock']   // paint order (later = on top)

export default function ScrollStory({ stages: STAGES = HOME_STAGES, cards: CARDS = HOME_CARDS, order: ORDER = HOME_ORDER, label = 'What Colvy does' }: {
  stages?: Stage[]; cards?: Record<string, ReactNode>; order?: string[]; label?: string
} = {}) {
  const ref = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const N = STAGES.length
  // The beat on screen, and the one before it (to know what's arriving and what's leaving).
  const [view, setView] = useState({ at: 0, from: 0 })
  // No transitions until the first reading has put the right beat up (a reload half-way down shouldn't animate in).
  const [live, setLive] = useState(false)
  const [still, setStill] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStill(true); return }
    let raf = 0, cur = -1, wake = 0
    const read = () => {
      raf = 0
      const el = ref.current, box = pin.current; if (!el || !box) return
      const r = el.getBoundingClientRect()
      // The pinned box, not innerHeight: a phone's address bar showing and hiding changes innerHeight mid-scroll.
      const f = clamp(-r.top / Math.max(1, r.height - box.offsetHeight)) * N
      const k = Math.min(N - 1, Math.floor(f))
      if (k === cur) return
      // A little give at each boundary, so coming to rest right on one doesn't flick back and forth.
      if (cur >= 0 && Math.abs(f - (k > cur ? k : k + 1)) < 0.12) return
      cur = k
      setView(v => (v.at === k ? v : { at: k, from: v.at }))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    wake = requestAnimationFrame(() => { wake = requestAnimationFrame(() => setLive(true)) })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); cancelAnimationFrame(wake) }
  }, [N])

  const { at, from } = view
  const ink = STAGES[at].ink

  // The cards arriving in this change, in the order the beat lists them, for the stagger.
  const arriving = Object.keys(STAGES[at].poses).filter(id => restPose(STAGES, id, at).o > restPose(STAGES, id, from).o)

  const visual = (k: number, motion: boolean) => (
    <div className="ss-visual" style={{ position: 'relative', width: 560, height: 560 }}>
      {ORDER.map(id => {
        const q = restPose(STAGES, id, k)
        if (!motion) return q.o < 0.01 ? null : (
          <div key={id} style={{ position: 'absolute', left: '50%', top: '50%', transform: place(q), opacity: q.o }}>{CARDS[id]}</div>
        )
        const n = arriving.indexOf(id)
        return (
          <div key={id} style={{
            position: 'absolute', left: '50%', top: '50%', transform: place(q), opacity: q.o,
            visibility: q.o > 0.01 ? 'visible' : 'hidden', willChange: 'transform, opacity',
            transition: live ? cardMotion(restPose(STAGES, id, from), q, IN_DELAY + Math.max(0, n) * STAGGER) : 'none',
          }}>
            {CARDS[id]}
          </div>
        )
      })}
    </div>
  )

  if (still) {
    return (
      <section aria-label={label}>
        {STAGES.map((s, k) => (
          <div key={s.key} className="ss-still" style={{ background: s.bg, color: s.ink, padding: 'clamp(56px, 8vw, 96px) 24px' }}>
            <div className="ss-grid" style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40, alignItems: 'center' }}>
              <StageText s={s} />
              <div className="ss-stage" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>{visual(k, false)}</div>
            </div>
          </div>
        ))}
        <Styles />
      </section>
    )
  }

  return (
    <section ref={ref} aria-label={label} style={{ position: 'relative', height: `${N * 100}vh`, background: STAGES[at].bg }}>
      <div ref={pin} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: STAGES[0].bg }}>
        {/* The background colours, stacked; each beat's fades in over the last
            (opacity only, so changing colour doesn't repaint the screen). */}
        {STAGES.map((s, k) => k > 0 && (
          <div key={s.key} aria-hidden style={{ position: 'absolute', inset: 0, background: s.bg, opacity: k <= at ? 1 : 0, willChange: 'opacity', transition: live ? `opacity ${BG}ms cubic-bezier(.4,0,.2,1)` : 'none' }} />
        ))}
        <div className="ss-grid" style={{ position: 'relative', maxWidth: 1240, height: '100%', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40, alignItems: 'center' }}>
          {/* The words for each beat: the old ones lift away, then the new ones rise in. */}
          <div className="ss-copy" style={{ position: 'relative', height: 360 }}>
            {STAGES.map((s, k) => {
              const d = Math.sign(k - at), on = d === 0
              return (
                <div key={s.key} style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: s.ink,
                  opacity: on ? 1 : 0, transform: `translate3d(0, ${d * 36}px, 0)`, visibility: on ? 'visible' : 'hidden',
                  transition: !live ? 'none' : on
                    ? `opacity ${FADE_IN}ms ease-out ${IN_DELAY}ms, transform ${MOVE}ms ${EASE} ${IN_DELAY}ms, visibility 0s`
                    : `opacity ${FADE_OUT - 80}ms ease-out, transform ${MOVE}ms ${EASE}, visibility 0s linear ${FADE_OUT}ms`,
                }}>
                  <StageText s={s} />
                </div>
              )
            })}
          </div>
          <div className="ss-stage" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>{visual(at, true)}</div>
        </div>
        {/* Progress: one dot per beat */}
        <div aria-hidden className="ss-dots" style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {STAGES.map((s, k) => <span key={s.key} style={{ width: 7, height: at === k ? 24 : 7, borderRadius: 4, background: ink, opacity: at === k ? 0.95 : 0.35, transition: `height .5s ${EASE}, opacity .3s, background-color ${BG}ms` }} />)}
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
