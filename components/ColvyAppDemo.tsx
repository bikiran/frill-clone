'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import ChannelGlyph, { type ChannelKey } from '@/components/marketing/ChannelGlyph'
import { MoodFace } from '@/components/inbox/Mood'

// The homepage hero's product demo: today's Colvy inbox, compact, with
// made-up data. The rail, the conversation cards with the channel on each
// avatar, the thread with its Call and Open pills, the agent bar ("Kai is
// answering this conversation") and the reply box, and on wide screens the
// customer panel. On a phone it's the thread alone, as in the phone inbox.
//
// It plays a short loop: an Instagram message arrives, Kai (an AI agent)
// checks stock and answers, the customer says yes and her mood lands on her
// name, a payment link goes out and the order lands as paid. Pauses off
// screen; shows the finished state when the visitor prefers less motion.

const CORAL = '#ff6a4d'
const KAI = { name: 'Kai', shape: 'flower' as const, color: '#7c5cff' }

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
// typing · asks · Kai drafts · sent · "yes please" · payment link · paid · hold
const TIMES: Record<Step, number> = { 0: 1100, 1: 1500, 2: 3700, 3: 1500, 4: 1800, 5: 2100, 6: 1600, 7: 3800 }
const LAST: Step = 7
const AI_TEXT = 'Yes! We have 2 left at $385 with the LED light. Want me to send you a payment link?'

const OTHERS: { id: string; name: string; ch: ChannelKey; text: string; time: string; h: number }[] = [
  { id: 'tom', name: 'Tom Becker', ch: 'sms', text: 'Thanks, picking up Saturday 👍', time: '9m', h: 205 },
  { id: 'priya', name: 'Priya Nair', ch: 'messenger', text: 'Can I book a tank clean-out?', time: '24m', h: 150 },
  { id: 'ana', name: 'Ana Lopez', ch: 'phone', text: 'Kai answered a call · 1:42', time: '1h', h: 275 },
  { id: 'jack', name: 'Jack Wu', ch: 'email', text: 'Re: Delivery to Geelong', time: '2h', h: 35 },
]

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 .01 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  bot: 'M12 8V4H8 M4 8h16a0 0 0 0 1 0 0v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z M2 14h2 M20 14h2 M9 13v2 M15 13v2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.35-4.35',
  plus: 'M12 5v14 M5 12h14',
  back: 'M15 18l-6-6 6-6',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  chev: 'M6 9l6 6 6-6',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  spark: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z',
  card: 'M2 5h20v14H2z M2 10h20',
  check: 'M20 6 9 17l-5-5',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v6 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  pen: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  userPlus: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 .01 M19 8v6 M22 11h-6',
}
const Ico = ({ d, s = 16, w = 2 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2)

export default function ColvyAppDemo({ dark = false }: { dark?: boolean }) {
  const [step, setStep] = useState<Step>(0)
  const [typed, setTyped] = useState(0)
  const [run, setRun] = useState(0)          // bumps each loop to replay the entry animations
  const root = useRef<HTMLDivElement>(null)
  const visible = useRef(true)
  const still = useRef(false)

  // Pause off screen; the finished state for reduced motion.
  useEffect(() => {
    still.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still.current) { setStep(LAST); setTyped(AI_TEXT.length); return }
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
      if (step === LAST) { setTyped(0); setRun(r => r + 1); setStep(0) }
      else setStep((step + 1) as Step)
    }
    timer = setTimeout(advance, TIMES[step])
    return () => clearTimeout(timer)
  }, [step])

  // Kai writing its reply.
  useEffect(() => {
    if (step !== 2 || still.current) return
    setTyped(0)
    const iv = setInterval(() => setTyped(n => (n >= AI_TEXT.length ? n : n + 2)), 34)
    return () => clearInterval(iv)
  }, [step, run])

  const asked = step >= 1
  const kaiOn = step >= 2
  const sent = step >= 3
  const said = step >= 4
  const linked = step >= 5
  const paid = step >= 6
  const unread = step === 1 || step === 2 || step === 4
  const miaPreview = paid ? 'Order placed · $385.00'
    : linked ? 'Payment link · $385.00'
    : said ? 'Yes please! 🙌'
    : sent ? `Kai: ${AI_TEXT}`
    : asked ? 'Hi! Is the 4ft reef tank still available? 🐠'
    : 'typing…'

  const face = (size: number) => <AiBuddy size={size} color={KAI.color} shape={KAI.shape} />
  const mood = said ? <span key={'md' + run} className="cad-mood"><MoodFace mood="positive" size={15} idle /></span> : null

  return (
    <div ref={root} className={`cad${dark ? ' dk' : ''}`} role="img"
      aria-label="The Colvy inbox: Kai, an AI agent, answers an Instagram message, sends a payment link and the order comes in paid"
      style={{ ['--kai' as string]: KAI.color } as React.CSSProperties}>
      <style>{CSS}</style>

      {/* Browser bar with the business's own Colvy address */}
      <div className="cad-bar">
        <span className="cad-lights">{['#ff5f57', '#febc2e', '#28c840'].map(c => <i key={c} style={{ background: c }} />)}</span>
        <span className="cad-url">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          reefhouse.colvy.com/admin/inbox
        </span>
        <span style={{ width: 42 }} />
      </div>

      <div className="cad-app">
        {/* Rail: big icons with their names, the open one on a white tile */}
        <nav className="cad-rail">
          <img src="/icon-192.png" alt="" width={30} height={30} className="cad-logo" />
          {([['Home', P.home], ['Inbox', P.inbox], ['Contacts', P.users], ['Orders', P.bag], ['AI agents', P.bot]] as const).map(([label, d]) => (
            <span key={label} className={`cad-tile${label === 'Inbox' ? ' on' : ''}`}>
              <Ico d={d} s={17} w={1.9} />
              {label}
              {label === 'Inbox' && unread && <b key={'u' + run + step} className="cad-badge cad-pop">1</b>}
              {label === 'Orders' && paid && <b key={'o' + run} className="cad-badge ok cad-pop">1</b>}
            </span>
          ))}
          <span className="cad-me">C<i /></span>
        </nav>

        {/* Conversation cards */}
        <section className="cad-card cad-list">
          <div className="cad-lh"><b>Inbox</b><span className="cad-rb"><Ico d={P.plus} s={14} w={2.4} /></span></div>
          <div className="cad-search"><Ico d={P.search} s={13} />Search</div>
          <div className="cad-chips">
            <span className="cad-chip on">All</span><span className="cad-chip">Unread</span><span className="cad-chip">Mine</span>
          </div>
          <div className="cad-rows">
            <div key={'mia' + run} className={`cad-row sel cad-rowin${unread ? ' unread' : ''}`}>
              <span className="cad-av" style={{ ['--h' as string]: 330 } as React.CSSProperties}>MC<span className="cad-ch"><ChannelGlyph ch="instagram" badge size={15} ring="var(--card)" /></span></span>
              <div style={{ minWidth: 0 }}>
                <div className="cad-rtop"><span className="cad-rname">Mia Chen</span>{mood}<span className="cad-rtime">now</span></div>
                <div className="cad-rmid">
                  <span className={`cad-rprev${!asked ? ' typing' : ''}${paid ? ' paid' : ''}`}>{miaPreview}</span>
                  {unread && <b key={'c' + step} className="cad-count cad-pop">1</b>}
                </div>
              </div>
            </div>
            {OTHERS.map(c => (
              <div key={c.id} className="cad-row">
                <span className="cad-av" style={{ ['--h' as string]: c.h } as React.CSSProperties}>{initials(c.name)}<span className="cad-ch"><ChannelGlyph ch={c.ch} badge size={15} ring="var(--soft-solid)" /></span></span>
                <div style={{ minWidth: 0 }}>
                  <div className="cad-rtop"><span className="cad-rname">{c.name}</span><span className="cad-rtime">{c.time}</span></div>
                  <div className="cad-rmid"><span className="cad-rprev">{c.text}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The conversation */}
        <section className="cad-card cad-th">
          <header className="cad-thh">
            <span className="cad-back"><Ico d={P.back} s={18} w={2.4} /></span>
            <span className="cad-av cad-thav" style={{ ['--h' as string]: 330 } as React.CSSProperties}>MC<span className="cad-ch"><ChannelGlyph ch="instagram" badge size={14} ring="var(--card)" /></span></span>
            <div className="cad-thn">
              <b>Mia Chen{mood}</b>
              <span>Instagram · Reef House Richmond</span>
            </div>
            <span className="cad-pill cad-call"><Ico d={P.phone} s={12} w={2.2} /><span>Call</span></span>
            <span className="cad-pill cad-open"><i className="cad-open-dot" />Open<Ico d={P.chev} s={11} w={2.8} /></span>
            <span className="cad-ib"><Ico d={P.tag} s={15} /></span>
            <span className="cad-ib"><Ico d={P.more} s={16} w={3} /></span>
          </header>

          <div className="cad-stream">
            <span className="cad-day">Today</span>
            {!asked && (
              <div className="cad-msg in"><span className="cad-dots">{[0, 1, 2].map(i => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</span></div>
            )}
            {asked && (
              <div key={'m1' + run} className="cad-msg in cad-in">
                <div className="cad-b">Hi! Is the 4ft reef tank still available? 🐠</div>
                <div className="cad-meta">2:14 pm · Instagram</div>
              </div>
            )}
            {kaiOn && (
              <div key={'m2' + run} className="cad-msg out cad-in">
                <div className={`cad-b${sent ? '' : ' draft'}`}>
                  {sent ? AI_TEXT : <>{AI_TEXT.slice(0, typed)}<span className="cad-caret" /></>}
                </div>
                <div className="cad-meta">
                  {face(13)}
                  {sent ? <><b>Kai</b> · AI agent · Delivered</> : <><b>Kai</b> is replying · checked stock <Ico d={P.check} s={10} w={3} /></>}
                </div>
              </div>
            )}
            {said && (
              <div key={'m3' + run} className="cad-msg in cad-in">
                <div className="cad-b">Yes please! 🙌</div>
              </div>
            )}
            {linked && (
              <div key={'m4' + run} className="cad-pay cad-in">
                <div className="cad-pay-top">
                  <span className="cad-pay-ic"><Ico d={P.card} s={15} /></span>
                  <span className="cad-pay-t"><b>Payment link · $385.00</b><span>4ft reef tank + LED light</span></span>
                </div>
                <div className={`cad-pay-st${paid ? ' ok' : ''}`}>
                  {paid ? <><Ico d={P.check} s={12} w={3} />Paid · just now</> : <><i className="cad-live" />Opened on iPhone</>}
                </div>
              </div>
            )}
            {paid && (
              <div key={'m5' + run} className="cad-life cad-in">
                <Ico d={P.bag} s={13} w={2.2} /><b>Order placed</b><span>· #4821 · $385.00</span>
              </div>
            )}
          </div>

          {/* Which agent is answering, and the way to take over */}
          {kaiOn && (
            <div key={'agb' + run} className="cad-agb cad-up">
              <span className="cad-agb-f">{face(26)}<i /></span>
              <span className="cad-agb-t">
                <span className="cad-agb-l1"><b>Kai</b> is answering this conversation</span>
                <span className="cad-agb-l2">Replies on its own when it’s sure</span>
              </span>
              <span className="cad-take"><Ico d={P.hand} s={13} w={2} /><span>Take control</span></span>
            </div>
          )}

          <div className="cad-comp">
            <div className="cad-comp-top">
              <span className="cad-seg"><span className="on">Reply</span><span>Note</span></span>
              <span className="cad-via">Sending by <b>Instagram</b></span>
            </div>
            <div className="cad-ph">Reply to Mia…</div>
            <div className="cad-tools">
              <Ico d={P.mic} s={14} /><Ico d={P.clip} s={14} /><Ico d={P.smile} s={14} />
              <span className="cad-ai"><Ico d={P.spark} s={12} w={2.2} /></span>
              <span className="cad-send">Send<Ico d={P.send} s={11} w={2.4} /></span>
            </div>
          </div>
        </section>

        {/* The customer, on wide screens */}
        <aside className="cad-card cad-side">
          <div className="cad-tabs"><span className="on">Information</span><span>Timeline</span><span>Orders</span></div>
          <div className="cad-who">
            <span className="cad-av cad-big" style={{ ['--h' as string]: 330 } as React.CSSProperties}>MC</span>
            <b>Mia Chen{mood}</b>
            <span>@mia.reefs · Richmond VIC</span>
            <span className="cad-acts">
              <i style={{ background: '#ecfdf3', color: '#16a34a' }}><Ico d={P.userPlus} s={13} /></i>
              <i style={{ background: '#eff6ff', color: '#2563eb' }}><Ico d={P.pen} s={13} /></i>
              <i style={{ background: 'var(--soft)', color: 'var(--sub)' }}><Ico d={P.more} s={14} w={3} /></i>
            </span>
          </div>
          <div className="cad-facts">
            {([['Lifetime spend', paid ? '$1,625' : '$1,240'], ['Orders', paid ? '7' : '6'], ['Last order', paid ? 'Just now' : '3 weeks ago']] as const).map(([k, v]) => (
              <div key={k} className="cad-fact"><span>{k}</span><b key={v} className={paid ? 'cad-pop' : undefined}>{v}</b></div>
            ))}
          </div>
          <div className="cad-tags">
            {([['Reef keeper', CORAL], ['VIP', '#f59e0b'], ['Newsletter', '#3b82f6']] as const).map(([t, c]) => (
              <span key={t} className="cad-tag" style={{ ['--c' as string]: c } as React.CSSProperties}><i />{t}</span>
            ))}
          </div>
          {paid && (
            <div key={'ord' + run} className="cad-ord cad-in">
              <div><b>Order #4821</b><span className="cad-ord-chip">Paid</span></div>
              <span>$385.00 · Pickup Saturday</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

const CSS = `
.cad{--pg:#f2f2f4;--card:#fff;--ink:#18181b;--sub:#71717a;--mute:#a1a1aa;--soft:#f5f5f6;--soft-solid:#f5f5f6;--line:rgba(16,24,40,.07);--bin:#fff;--chrome:#e9e9ec;
  container-type:inline-size;container-name:cad;width:100%;background:var(--pg);color:var(--ink);font-family:inherit;line-height:1.35;text-align:left;user-select:none;-webkit-user-select:none}
.cad.dk{--pg:#0b0c12;--card:#16171f;--ink:#f2f3f8;--sub:rgba(242,243,248,.6);--mute:rgba(242,243,248,.4);--soft:rgba(255,255,255,.055);--soft-solid:#1f2029;--line:rgba(255,255,255,.08);--bin:#22232d;--chrome:#11121a}
.cad *{box-sizing:border-box}
.cad b{font-weight:inherit}
.cad-bar{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;background:var(--chrome)}
.cad-lights{display:inline-flex;gap:6px}
.cad-lights i{width:10px;height:10px;border-radius:50%}
.cad-url{margin:0 auto;display:inline-flex;align-items:center;gap:6px;padding:3px 14px;border-radius:8px;background:var(--card);color:var(--sub);font-size:11px;white-space:nowrap;overflow:hidden;max-width:70%}

.cad-app{display:grid;grid-template-columns:60px 206px minmax(0,1fr);gap:8px;padding:8px 8px 8px 0;height:476px}
.cad-side{display:none!important}
@container cad (min-width:880px){.cad-app{grid-template-columns:64px 232px minmax(0,1fr) 214px}.cad-side{display:flex!important}}
@container cad (max-width:559px){.cad-app{grid-template-columns:minmax(0,1fr);padding:0;height:486px}.cad-rail,.cad-list{display:none!important}.cad-th{border-radius:0!important;box-shadow:none!important}.cad-back{display:inline-flex!important}}

.cad-rail{display:flex;flex-direction:column;align-items:center;gap:3px;padding-top:2px;min-height:0}
.cad-logo{width:30px;height:30px;border-radius:9px;margin:2px 0 8px;display:block}
.cad-tile{position:relative;width:52px;padding:6px 0 5px;border-radius:13px;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--sub);font-size:9.5px;font-weight:600;white-space:nowrap}
.cad-tile.on{background:var(--card);color:var(--ink);font-weight:750;box-shadow:0 0 0 1px var(--line),0 2px 6px -3px rgba(16,24,40,.18)}
.cad-tile.on svg{color:${CORAL}}
.cad-badge{position:absolute;top:1px;right:7px;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--pg)}
.cad-badge.ok{background:#16a34a}
.cad-me{position:relative;margin-top:auto;margin-bottom:2px;width:30px;height:30px;border-radius:50%;background:${CORAL};color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.cad-me i{position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px var(--pg)}

.cad-card{background:var(--card);border-radius:18px;box-shadow:0 0 0 1px var(--line);min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column}

.cad-lh{display:flex;align-items:center;padding:12px 12px 8px 14px}
.cad-lh b{font-size:15px;font-weight:800;letter-spacing:-.01em}
.cad-rb{margin-left:auto;width:28px;height:28px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center}
.cad-search{margin:0 10px 8px;height:30px;border-radius:999px;background:var(--soft);display:flex;align-items:center;gap:6px;padding:0 11px;color:var(--mute);font-size:11.5px}
.cad-chips{display:flex;gap:5px;padding:0 10px 6px}
.cad-chip{height:24px;padding:0 10px;border-radius:999px;background:var(--soft);font-size:11px;font-weight:650;color:var(--sub);display:inline-flex;align-items:center}
.cad-chip.on{background:var(--ink);color:var(--card)}
.cad-rows{flex:1;min-height:0;overflow:hidden;padding:2px 0 8px}
.cad-row{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);column-gap:9px;align-items:center;margin:4px 8px;padding:9px 10px;border-radius:15px;background:var(--soft)}
.cad-row.sel{background:var(--card);box-shadow:0 0 0 1px var(--line),0 8px 22px -12px rgba(16,24,40,.3)}
.cad-row.sel::after{content:'';position:absolute;left:-8px;top:13px;bottom:13px;width:4px;border-radius:0 4px 4px 0;background:${CORAL}}
.cad-row.unread{background:color-mix(in srgb,${CORAL} 7%,var(--card))}
.cad-av{position:relative;width:34px;height:34px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12.5px;font-weight:700;background:linear-gradient(160deg,hsl(var(--h,14) 92% 72%),hsl(var(--h,14) 72% 55%))}
.cad-ch{position:absolute;right:-4px;bottom:-3px;display:inline-flex;line-height:0}
.cad-rtop{display:flex;align-items:center;gap:4px;min-width:0}
.cad-rname{font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cad-row.unread .cad-rname{font-weight:800}
.cad-rtime{margin-left:auto;padding-left:4px;font-size:10px;color:var(--mute);flex-shrink:0}
.cad-rmid{display:flex;align-items:center;gap:5px;min-width:0;margin-top:2px}
.cad-rprev{flex:1;min-width:0;font-size:11.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cad-row.unread .cad-rprev{color:var(--ink);font-weight:600}
.cad-rprev.typing{color:${CORAL};font-style:italic}
.cad-rprev.paid{color:#16a34a;font-weight:650}
.cad-count{min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:${CORAL};color:#fff;font-size:9.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}

.cad-th{container-type:inline-size;container-name:cadth}
.cad-thh{display:flex;align-items:center;gap:8px;padding:10px 10px 10px 12px;border-bottom:1px solid var(--line);min-width:0}
.cad-back{display:none;color:var(--sub);margin:0 -3px 0 -4px}
.cad-thn{flex:1;min-width:0;line-height:1.25}
.cad-thn b{display:flex;align-items:center;gap:5px;font-size:13.5px;font-weight:750;white-space:nowrap}
.cad-thn > span{display:block;font-size:10.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cad-pill{height:28px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;border-radius:999px;font-size:11.5px;font-weight:650;flex-shrink:0;white-space:nowrap}
.cad-call{background:#ecfdf3;color:#067647}
.cad-open{background:#fff4e5;color:#b54708;padding:0 9px 0 10px}
.cad-open-dot{width:8px;height:8px;border-radius:50%;box-shadow:inset 0 0 0 2px currentColor}
.cad.dk .cad-call{background:rgba(22,163,74,.16);color:#4ade80}
.cad.dk .cad-open{background:rgba(245,158,11,.15);color:#fbbf24}
.cad-ib{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--sub);flex-shrink:0}
.cad-mood{display:inline-flex;line-height:0;animation:cadMood .9s cubic-bezier(.34,1.4,.64,1) both}

.cad-stream{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;padding:10px 12px 8px}
.cad-day{align-self:center;font-size:10px;font-weight:600;color:var(--sub);background:var(--soft);padding:3px 10px;border-radius:999px;margin-bottom:auto}
.cad-msg{max-width:84%;display:flex;flex-direction:column;gap:3px;flex-shrink:0}
.cad-msg.in{align-self:flex-start}
.cad-msg.out{align-self:flex-end;align-items:flex-end}
.cad-b{padding:8px 11px;font-size:12px;line-height:1.45;border-radius:16px}
.cad-msg.in .cad-b{background:var(--bin);border-bottom-left-radius:5px;box-shadow:0 0 0 1px var(--line),0 3px 8px -4px rgba(16,24,40,.12)}
.cad-msg.out .cad-b{background:linear-gradient(135deg,#ff8a6b,${CORAL});color:#fff;border-bottom-right-radius:5px}
.cad-msg.out .cad-b.draft{background:color-mix(in srgb,var(--kai) 9%,var(--card));color:var(--ink);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--kai) 32%,transparent)}
.cad-meta{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;color:var(--mute);padding:0 3px;white-space:nowrap}
.cad-meta b{color:var(--kai);font-weight:700}
.cad-meta svg{color:#16a34a}
.cad-caret{display:inline-block;width:1.5px;height:12px;background:var(--kai);margin-left:1px;vertical-align:-2px;animation:cadCaret 1s steps(1) infinite}
.cad-dots{display:inline-flex;gap:4px;padding:11px 12px;background:var(--bin);border-radius:16px;border-bottom-left-radius:5px;box-shadow:0 0 0 1px var(--line)}
.cad-dots i{width:5px;height:5px;border-radius:50%;background:var(--mute);animation:cadDot 1.1s infinite}

.cad-pay{align-self:flex-end;flex-shrink:0;width:min(224px,84%);border-radius:16px;background:var(--card);box-shadow:0 0 0 1px var(--line),0 10px 24px -14px rgba(16,24,40,.32);overflow:hidden}
.cad-pay-top{display:flex;align-items:center;gap:9px;padding:9px 11px}
.cad-pay-ic{width:30px;height:30px;border-radius:9px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cad.dk .cad-pay-ic{background:rgba(99,102,241,.18);color:#a5b4fc}
.cad-pay-t{min-width:0;line-height:1.3}
.cad-pay-t b{display:block;font-size:12px;font-weight:800}
.cad-pay-t span{display:block;font-size:10.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cad-pay-st{display:flex;align-items:center;gap:6px;padding:6px 11px;border-top:1px solid var(--line);font-size:10.5px;font-weight:650;color:var(--sub);transition:color .3s,background .3s}
.cad-pay-st.ok{color:#16a34a;background:color-mix(in srgb,#16a34a 8%,transparent)}
.cad-live{width:7px;height:7px;border-radius:50%;background:#f59e0b;animation:cadLive 1.4s ease-out infinite}
.cad-life{align-self:center;flex-shrink:0;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:6px 13px;border-radius:999px;background:color-mix(in srgb,#16a34a 13%,transparent);color:#15803d;font-size:11px;white-space:nowrap}
.cad-life b{font-weight:700}
.cad-life span{opacity:.82;overflow:hidden;text-overflow:ellipsis}
.cad.dk .cad-life{color:#4ade80}

.cad-agb{display:flex;align-items:center;gap:9px;margin:0 10px 8px;padding:6px 6px 6px 9px;border-radius:16px;background:var(--soft);flex-shrink:0}
.cad-agb-f{position:relative;display:inline-flex;flex-shrink:0}
.cad-agb-f i{position:absolute;right:-3px;bottom:-3px;width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px var(--soft-solid)}
.cad-agb-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.cad-agb-l1{font-size:11.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cad-agb-l1 b{color:var(--ink);font-weight:750}
.cad-agb-l2{font-size:10px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cad-take{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border-radius:999px;background:#0d0d0d;color:#fff;font-size:11px;font-weight:650;white-space:nowrap;flex-shrink:0}
.cad.dk .cad-take{background:#fff;color:#0d0d0d}

.cad-comp{margin:0 10px 10px;border-radius:16px;background:var(--card);box-shadow:0 0 0 1px var(--line),0 6px 16px -10px rgba(16,24,40,.22);padding:7px 8px 8px;flex-shrink:0}
.cad-comp-top{display:flex;align-items:center;gap:6px}
.cad-seg{display:inline-flex;padding:2px;border-radius:999px;background:var(--soft)}
.cad-seg span{padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:650;color:var(--sub)}
.cad-seg span.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.14)}
.cad-via{margin-left:auto;font-size:10px;color:var(--sub);white-space:nowrap}
.cad-via b{color:var(--ink);font-weight:700}
.cad-ph{font-size:11.5px;color:var(--mute);padding:8px 4px 7px}
.cad-tools{display:flex;align-items:center;gap:9px;padding-left:4px;color:var(--mute)}
.cad-ai{margin-left:auto;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0}
.cad-send{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 12px;border-radius:999px;background:${CORAL};color:#fff;font-size:11px;font-weight:700;flex-shrink:0;margin-left:-3px}

@container cadth (max-width:400px){.cad-ib{display:none}.cad-call span{display:none}.cad-call{width:28px;padding:0;justify-content:center}.cad-agb-l2{display:none}.cad-take span{display:none}.cad-take{width:28px;padding:0;justify-content:center}.cad-via{display:none}}

.cad-side{flex-direction:column;gap:10px;padding:10px}
.cad-tabs{display:flex;padding:3px;border-radius:999px;background:var(--soft)}
.cad-tabs span{flex:1;text-align:center;padding:4px 0;border-radius:999px;font-size:10px;font-weight:650;color:var(--sub)}
.cad-tabs span.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.14)}
.cad-who{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0 2px;text-align:center}
.cad-big{width:54px;height:54px;font-size:19px;margin-bottom:5px}
.cad-who > b{display:flex;align-items:center;gap:5px;font-size:14px;font-weight:800}
.cad-who > span{font-size:10.5px;color:var(--sub)}
.cad-acts{display:flex!important;gap:6px;margin-top:7px}
.cad-acts i{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.cad.dk .cad-acts i{background:var(--soft)!important}
.cad-facts{display:flex;flex-direction:column;gap:4px}
.cad-fact{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px;border-radius:12px;background:var(--soft);font-size:11px}
.cad-fact span{color:var(--sub)}
.cad-fact b{font-weight:750;display:inline-block}
.cad-tags{display:flex;flex-wrap:wrap;gap:4px}
.cad-tag{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 8px;border-radius:999px;background:var(--soft);font-size:10px;font-weight:600}
.cad-tag i{width:6px;height:6px;border-radius:50%;background:var(--c)}
.cad-ord{margin-top:auto;border-radius:14px;padding:9px 11px;background:color-mix(in srgb,#16a34a 9%,var(--card));box-shadow:inset 0 0 0 1px color-mix(in srgb,#16a34a 26%,transparent);font-size:10.5px;color:var(--sub)}
.cad-ord div{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;color:var(--ink)}
.cad-ord div b{font-size:11.5px;font-weight:800}
.cad-ord-chip{font-size:9.5px;font-weight:800;color:#fff;background:#16a34a;padding:2px 7px;border-radius:999px}

@keyframes cadIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes cadUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes cadRow{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
@keyframes cadPopK{0%{opacity:0;transform:scale(.5)}60%{transform:scale(1.15)}100%{opacity:1;transform:none}}
@keyframes cadMood{0%{opacity:0;transform:translate(-26px,90px) scale(.4) rotate(-40deg)}55%{opacity:1;transform:translate(4px,-12px) scale(1.3) rotate(10deg)}80%{transform:translate(0,2px) scale(.92)}100%{opacity:1;transform:none}}
@keyframes cadDot{0%,80%,100%{opacity:.35;transform:none}40%{opacity:1;transform:translateY(-3px)}}
@keyframes cadCaret{50%{opacity:0}}
@keyframes cadLive{0%{box-shadow:0 0 0 0 rgba(245,158,11,.5)}100%{box-shadow:0 0 0 7px rgba(245,158,11,0)}}
.cad-in{animation:cadIn .5s cubic-bezier(.16,1,.3,1) both}
.cad-up{animation:cadUp .45s cubic-bezier(.22,1,.36,1) both}
.cad-rowin{animation:cadRow .55s cubic-bezier(.16,1,.3,1) both}
.cad-pop{animation:cadPopK .45s cubic-bezier(.16,1,.3,1) both}
@media (prefers-reduced-motion:reduce){.cad *,.cad *::before,.cad *::after{animation:none!important;transition:none!important}}
`
