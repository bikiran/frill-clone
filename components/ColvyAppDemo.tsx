'use client'

import { useEffect, useRef, useState } from 'react'

// The homepage hero's product demo: a faithful, compact copy of the real Colvy
// inbox — sidebar, conversation list, thread with the AI's suggested reply, and
// the customer panel — with made-up demo data. It plays a short loop: an
// Instagram message arrives, the AI drafts a reply, it's sent, the customer
// asks to buy, a payment link goes out and the order lands as paid. Pauses when
// off screen; shows the finished state when the visitor prefers less motion.

const CORAL = '#ff6a4d'

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6
const TIMES: Record<Step, number> = { 0: 900, 1: 1300, 2: 4200, 3: 1600, 4: 1300, 5: 2000, 6: 3600 }
const AI_TEXT = 'Yes! We have 2 left at $385, including the LED light. Want me to send you a payment link?'

const CONVOS = [
  { id: 'tom', name: 'Tom Becker', ch: 'SMS', snippet: 'Thanks, picking up Saturday 👍', time: '9m', av: '#0ea5e9' },
  { id: 'priya', name: 'Priya Nair', ch: 'WhatsApp', snippet: 'Can I book a tank clean-out?', time: '24m', av: '#22c55e' },
  { id: 'ana', name: 'Ana Lopez', ch: 'Phone', snippet: 'AI answered a call · 1:42', time: '1h', av: '#a855f7' },
  { id: 'jack', name: 'Jack Wu', ch: 'Email', snippet: 'Re: Delivery to Geelong', time: '2h', av: '#f59e0b' },
]
const CH_STYLE: Record<string, [string, string]> = {
  SMS: ['#ecfdf5', '#047857'], WhatsApp: ['#ecfdf5', '#15803d'], Instagram: ['#fdf2f8', '#be185d'],
  Phone: ['#f5f3ff', '#6d28d9'], Email: ['#eff6ff', '#1d4ed8'],
}

const Icon = ({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)
const I = {
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 .01 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  check: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  cal: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  spark: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z',
}

export default function ColvyAppDemo({ dark = false }: { dark?: boolean }) {
  const t = dark
    ? { bg: '#12131c', panel: '#171826', rail: '#0f1018', line: 'rgba(255,255,255,0.08)', ink: '#f2f3f8', sub: 'rgba(242,243,248,0.55)', soft: 'rgba(255,255,255,0.06)', bubble: 'rgba(255,255,255,0.08)', sel: 'rgba(255,106,77,0.12)' }
    : { bg: '#ffffff', panel: '#fbfbfc', rail: '#f6f6f8', line: 'rgba(15,17,25,0.08)', ink: '#11131c', sub: 'rgba(17,19,28,0.52)', soft: '#f4f4f6', bubble: '#f1f2f5', sel: '#fff3ef' }

  const [step, setStep] = useState<Step>(0)
  const [typed, setTyped] = useState(0)
  const [run, setRun] = useState(0)          // bumps each loop to replay entry animations
  const root = useRef<HTMLDivElement>(null)
  const visible = useRef(true)
  const still = useRef(false)

  // Pause off screen; finished state for reduced motion.
  useEffect(() => {
    still.current = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still.current) { setStep(6); setTyped(AI_TEXT.length); return }
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting }, { threshold: 0.15 })
    if (root.current) io.observe(root.current)
    return () => io.disconnect()
  }, [])

  // The script.
  useEffect(() => {
    if (still.current) return
    let timer: ReturnType<typeof setTimeout>
    const advance = () => {
      if (!visible.current) { timer = setTimeout(advance, 600); return }
      if (step === 6) { setTyped(0); setRun(r => r + 1); setStep(0) }
      else setStep((step + 1) as Step)
    }
    timer = setTimeout(advance, TIMES[step])
    return () => clearTimeout(timer)
  }, [step])

  // The AI typing its suggestion.
  useEffect(() => {
    if (step !== 2 || still.current) return
    setTyped(0)
    const iv = setInterval(() => setTyped(n => (n >= AI_TEXT.length ? n : n + 2)), 38)
    return () => clearInterval(iv)
  }, [step, run])

  const answered = step >= 3
  const paid = step >= 6
  const chip = (ch: string) => {
    const [b, c] = CH_STYLE[ch] || ['#f4f4f5', '#52525b']
    return <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4, background: dark ? c + '26' : b, color: dark ? '#fff' : c }}>{ch}</span>
  }
  const list = [
    { id: 'mia', name: 'Mia Chen', ch: 'Instagram', snippet: paid ? 'Paid · $385 ✓' : step >= 4 ? 'Yes please!' : 'Is the 4ft reef tank still…', time: 'now', av: '#ec4899', unread: !answered },
    ...CONVOS.map(c => ({ ...c, unread: false })),
  ]

  return (
    <div ref={root} className="cad" style={{ containerType: 'inline-size', width: '100%', background: t.bg, color: t.ink, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif', userSelect: 'none' }}>
      <style>{`
        @keyframes cadIn { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes cadRow { from { opacity: 0; transform: translateY(-14px) } to { opacity: 1; transform: none } }
        @keyframes cadPop { 0% { opacity: 0; transform: scale(.9) } 60% { transform: scale(1.03) } 100% { opacity: 1; transform: none } }
        @keyframes cadDot { 0%,80%,100% { opacity: .35; transform: none } 40% { opacity: 1; transform: translateY(-3px) } }
        @keyframes cadCaret { 50% { opacity: 0 } }
        .cad-in { animation: cadIn .45s cubic-bezier(.16,1,.3,1) both }
        .cad-row { animation: cadRow .5s cubic-bezier(.16,1,.3,1) both }
        .cad-pop { animation: cadPop .5s cubic-bezier(.16,1,.3,1) both }
        .cad-grid { display: grid; grid-template-columns: 50px 186px 1fr 172px; height: 430px }
        @container (max-width: 700px) { .cad-grid { grid-template-columns: 46px 172px 1fr } .cad-side { display: none !important } }
        @container (max-width: 520px) { .cad-grid { grid-template-columns: 1fr; height: 400px } .cad-list, .cad-rail { display: none !important } }
        @media (prefers-reduced-motion: reduce) { .cad-in, .cad-row, .cad-pop { animation: none } }
      `}</style>

      {/* Browser chrome with the business's own Colvy address */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${t.line}`, background: t.rail }}>
        {['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        <span style={{ margin: '0 auto', fontSize: 11, color: t.sub, padding: '3px 14px', borderRadius: 7, background: t.soft, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          reefhouse.colvy.com/admin/inbox
        </span>
        <span style={{ width: 40 }} />
      </div>

      <div className="cad-grid">
        {/* App sidebar */}
        <div className="cad-rail" style={{ borderRight: `1px solid ${t.line}`, background: t.rail, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 0' }}>
          <img src="/icon-192.png" alt="" width={26} height={26} style={{ borderRadius: 7, marginBottom: 8 }} />
          {[['inbox', true, list.filter(c => c.unread).length], ['users'], ['check'], ['cal'], ['bag', false, paid ? 1 : 0], ['phone'], ['spark']].map(([k, on, n]: any) => (
            <span key={k} style={{ position: 'relative', width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? (dark ? 'rgba(255,106,77,0.16)' : '#fff1ec') : 'transparent', color: on ? CORAL : t.sub }}>
              <Icon d={(I as any)[k]} size={15} />
              {n > 0 && <span key={k + run + n} className="cad-pop" style={{ position: 'absolute', top: 2, right: 1, minWidth: 13, height: 13, padding: '0 3px', borderRadius: 7, background: k === 'bag' ? '#16a34a' : '#ef4444', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>}
            </span>
          ))}
        </div>

        {/* Conversation list */}
        <div className="cad-list" style={{ borderRight: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 12px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Inbox</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: dark ? 'rgba(59,130,246,0.18)' : '#eff6ff', color: '#2563eb' }}>{list.filter(c => c.unread).length} unread</span>
          </div>
          <div style={{ display: 'flex', gap: 5, padding: '0 12px 8px' }}>
            {['All', 'Unread', 'Mine'].map((x, i) => <span key={x} style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, border: `1px solid ${i ? t.line : CORAL}`, color: i ? t.sub : CORAL, background: i ? 'transparent' : (dark ? 'rgba(255,106,77,0.1)' : '#fff6f3') }}>{x}</span>)}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            {list.map(c => (
              <div key={c.id === 'mia' ? 'mia' + run : c.id} className={c.id === 'mia' ? 'cad-row' : undefined}
                style={{ display: 'flex', gap: 8, padding: '9px 12px', borderTop: `1px solid ${t.line}`, background: c.id === 'mia' ? t.sel : 'transparent', borderLeft: `2.5px solid ${c.id === 'mia' ? CORAL : 'transparent'}` }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: c.av, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.name.split(' ').map(w => w[0]).join('')}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {c.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                    <span style={{ fontSize: 11.5, fontWeight: c.unread ? 800 : 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: t.sub, flexShrink: 0 }}>{c.time}</span>
                  </div>
                  <div style={{ margin: '3px 0 2px' }}>{chip(c.ch)}</div>
                  <div style={{ fontSize: 10.5, color: c.id === 'mia' && paid ? '#16a34a' : t.sub, fontWeight: c.id === 'mia' && paid ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.snippet}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', background: t.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderBottom: `1px solid ${t.line}` }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#ec4899', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>MC</span>
            <div style={{ lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Mia Chen</div>
              <div style={{ fontSize: 10, color: t.sub }}>via Instagram · Reef House Melbourne</div>
            </div>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#16a34a', padding: '4px 9px', borderRadius: 8, border: '1px solid #bbf7d0', background: dark ? 'rgba(22,163,74,0.12)' : '#f0fdf4' }}><Icon d={I.phone} size={10} /> Call</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', padding: '4px 9px', borderRadius: 8, background: dark ? 'rgba(245,158,11,0.14)' : '#fffbeb' }}>Open</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', justifyContent: 'flex-end' }}>
            {step >= 1 && (
              <div key={'m1' + run} className="cad-in" style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
                <div style={{ padding: '8px 11px', borderRadius: '13px 13px 13px 4px', background: t.bubble, fontSize: 11.5, lineHeight: 1.45 }}>Hi! Is the 4ft reef tank still available? 🐠</div>
                <div style={{ fontSize: 9, color: t.sub, margin: '3px 4px 0' }}>2:14 pm · Instagram</div>
              </div>
            )}
            {answered && (
              <div key={'m2' + run} className="cad-in" style={{ alignSelf: 'flex-end', maxWidth: '82%', textAlign: 'right' }}>
                <div style={{ padding: '8px 11px', borderRadius: '13px 13px 4px 13px', background: `linear-gradient(135deg, #ff8a6b, ${CORAL})`, color: '#fff', fontSize: 11.5, lineHeight: 1.45, textAlign: 'left' }}>{AI_TEXT}</div>
                <div style={{ fontSize: 9, color: t.sub, margin: '3px 4px 0' }}>Delivered · <span style={{ color: '#7c3aed', fontWeight: 700 }}>✦ Support Agent</span></div>
              </div>
            )}
            {step >= 4 && (
              <div key={'m3' + run} className="cad-in" style={{ alignSelf: 'flex-start', padding: '8px 11px', borderRadius: '13px 13px 13px 4px', background: t.bubble, fontSize: 11.5 }}>Yes please! 🙌</div>
            )}
            {step >= 5 && (
              <div key={'m4' + run} className="cad-in" style={{ alignSelf: 'flex-end', width: 190, borderRadius: 13, overflow: 'hidden', border: `1px solid ${t.line}`, background: t.panel }}>
                <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: dark ? 'rgba(99,102,241,0.2)' : '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>💳</span>
                  <div style={{ lineHeight: 1.3 }}>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>Pay $385.00</div>
                    <div style={{ fontSize: 9.5, color: t.sub }}>4ft reef tank + LED light</div>
                  </div>
                </div>
                <div style={{ padding: '6px 11px', borderTop: `1px solid ${t.line}`, fontSize: 9.5, fontWeight: 700, color: paid ? '#16a34a' : t.sub }}>{paid ? '✓ Paid · just now' : 'Opened on iPhone · Melbourne'}</div>
              </div>
            )}
            {step === 2 && (
              <div key={'ai' + run} className="cad-in" style={{ borderRadius: 12, padding: 1, background: 'linear-gradient(135deg,#6366f1,#a855f7,#22d3ee)' }}>
                <div style={{ borderRadius: 11, background: t.bg, padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, color: '#7c3aed', marginBottom: 5 }}>
                    <Icon d={I.spark} size={12} color="#7c3aed" /> Support Agent suggests a reply
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: t.sub }}>Checked stock ✓</span>
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, minHeight: 34 }}>
                    {AI_TEXT.slice(0, typed)}<span style={{ display: 'inline-block', width: 1.5, height: 12, background: '#7c3aed', marginLeft: 1, verticalAlign: -2, animation: 'cadCaret 1s steps(1) infinite' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: typed >= AI_TEXT.length ? '#7c3aed' : '#a78bfa', padding: '4px 11px', borderRadius: 7, transition: 'background .3s' }}>Send</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.sub, border: `1px solid ${t.line}`, padding: '4px 10px', borderRadius: 7 }}>Edit</span>
                  </div>
                </div>
              </div>
            )}
            {step === 0 && (
              <div style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 4, padding: '9px 12px', borderRadius: 12, background: t.bubble }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: t.sub, animation: `cadDot 1.1s ${i * 0.15}s infinite` }} />)}
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ padding: '8px 12px 10px', borderTop: `1px solid ${t.line}` }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: t.soft }}>Reply</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', color: t.sub }}>Note</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: t.sub, alignSelf: 'center' }}>Sending by <b style={{ color: t.ink }}>Instagram</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px 7px 11px', borderRadius: 10, border: `1px solid ${t.line}` }}>
              <span style={{ flex: 1, fontSize: 11, color: t.sub }}>Reply to Mia…</span>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d={I.spark} size={11} color="#fff" /></span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: CORAL, padding: '5px 11px', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Send <Icon d={I.send} size={10} color="#fff" /></span>
            </div>
          </div>
        </div>

        {/* Customer panel */}
        <div className="cad-side" style={{ borderLeft: `1px solid ${t.line}`, background: t.panel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 800, borderBottom: `1px solid ${t.line}`, paddingBottom: 7 }}>
            <span style={{ color: CORAL }}>Information</span><span style={{ color: t.sub }}>Orders</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, margin: '2px auto 6px', background: dark ? 'rgba(236,72,153,0.16)' : '#fdf2f8', color: '#db2777', fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</span>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>Mia Chen</div>
            <div style={{ fontSize: 10, color: t.sub }}>@mia.reefs · Richmond VIC</div>
          </div>
          {[['Lifetime', paid ? '$1,625' : '$1,240'], ['Orders', paid ? '7' : '6'], ['Last visit', '3 weeks ago']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
              <span style={{ color: t.sub }}>{k}</span>
              <span key={v} className={paid && k !== 'Last visit' ? 'cad-pop' : undefined} style={{ fontWeight: 800 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['Reef', 'VIP', 'Marketing ✓'].map(x => <span key={x} style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: dark ? 'rgba(255,106,77,0.14)' : '#fff1ec', color: CORAL }}>{x}</span>)}
          </div>
          {paid && (
            <div key={'order' + run} className="cad-pop" style={{ marginTop: 'auto', borderRadius: 10, border: '1px solid #bbf7d0', background: dark ? 'rgba(22,163,74,0.1)' : '#f0fdf4', padding: '8px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>Order #4821 · Paid ✓</div>
              <div style={{ fontSize: 9.5, color: t.sub, marginTop: 2 }}>$385.00 · pickup Saturday</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
