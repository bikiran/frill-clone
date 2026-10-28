'use client'

import { useEffect, useRef, useState } from 'react'
import InviteCta from '@/components/InviteCta'
import ChannelGlyph, { type ChannelKey } from './ChannelGlyph'

// "One conversation, start to finish." The step index on the left drives a
// phone running Colvy on the right, and the phone plays one customer's whole
// story as a single thread that keeps building: chats from four channels land
// in the inbox, Sam's opens, a photo goes from the gallery, a payment link
// gets paid, the sale is recorded, and the follow-up is set. Small cards
// beside the phone show what happens behind the scenes. Clicking a step jumps
// there with everything before it already in the thread.
//
// Runs only while on screen. With reduced motion it doesn't advance and each
// step shows its finished state. Made-up demo data.

const CORAL = '#ff6a4d'
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

const STEPS = [
  { title: 'Every channel in one inbox', desc: 'Instagram, Messenger, SMS and email land in one list, and each customer keeps one thread.', href: '/inbox-crm', ms: 6600 },
  { title: 'Reply with media from your gallery', desc: 'Send saved photos and videos in a tap. Mark up a photo or trim a video first.', href: '/inbox-crm#gallery', ms: 5800 },
  { title: 'Take the payment in chat', desc: 'Send a payment link and watch it turn to paid, right in the conversation.', href: '/inbox-crm#woo', ms: 6000 },
  { title: 'Record the sale', desc: 'Log the revenue Colvy helped you make, even when it was paid off-Stripe.', href: '/inbox-crm#woo', ms: 5400 },
  { title: 'Automate the follow-up', desc: 'Make a task for the team and schedule the next message, so nothing slips.', href: '/inbox-crm#tasks', ms: 6400 },
]
const N = STEPS.length

// The inbox, newest first once they've all arrived.
const ROWS: { id: string; name: string; ch: ChannelKey; text: string; at: number; av: string }[] = [
  { id: 'wei', name: 'Wei Chen', ch: 'messenger', text: 'Is the 20% plant deal still on?', at: 250, av: '#f59e0b' },
  { id: 'tom', name: 'Tom Becker', ch: 'email', text: 'Re: Wholesale order for March', at: 800, av: '#0ea5e9' },
  { id: 'priya', name: 'Priya Nair', ch: 'sms', text: 'Can I change the delivery address?', at: 1350, av: '#8b5cf6' },
  { id: 'sam', name: 'Sam Rivera', ch: 'instagram', text: 'Do you still have the 4ft reef tank?', at: 1900, av: '#ec4899' },
]
const OPEN_AT = 3500 // Sam's chat opens

type Item = { id: string; step: number; at: number; kind: 'them' | 'me' | 'sys' | 'img' | 'pay' | 'sched'; text?: string; icon?: string }
const ITEMS: Item[] = [
  { id: 'a1', step: 0, at: OPEN_AT, kind: 'them', text: 'Hi! Do you still have the 4ft reef tank in stock? 🐠' },
  { id: 'a2', step: 0, at: 5300, kind: 'me', text: 'Yes! We have 2 left 🙌' },
  { id: 'b1', step: 1, at: 300, kind: 'them', text: 'Can you show me one?' },
  { id: 'b2', step: 1, at: 3000, kind: 'img' },
  { id: 'b3', step: 1, at: 3700, kind: 'me', text: 'Here it is, all set up in the shop 📸' },
  { id: 'c1', step: 2, at: 400, kind: 'them', text: 'Love it. I’ll take it!' },
  { id: 'c2', step: 2, at: 1200, kind: 'pay' },
  { id: 'c3', step: 2, at: 2600, kind: 'them', text: 'Paid! 🙌' },
  { id: 'd1', step: 3, at: 2300, kind: 'sys', icon: 'sale', text: 'Sale recorded · $385 · credited to Mia' },
  { id: 'e1', step: 4, at: 400, kind: 'sys', icon: 'task', text: 'Task for Kai · Ship the 4ft reef tank' },
  { id: 'e2', step: 4, at: 1100, kind: 'sys', icon: 'clock', text: 'Follow-up scheduled · Mon 10:00' },
  { id: 'e3', step: 4, at: 3100, kind: 'me', text: 'Thanks Sam! It ships today 🚚' },
  { id: 'e4', step: 4, at: 3900, kind: 'sched', text: 'How’s the new tank settling in? 🐠' },
]
// Replies typed into the composer before they're sent.
const TYPING: { step: number; from: number; item: string }[] = [
  { step: 0, from: 4100, item: 'a2' },
  { step: 4, from: 1800, item: 'e3' },
]
const PAID_AT = 3100
const REV_FROM = 12840, SALE = 385

// Little aquariums for the gallery (no photos to load).
const TANKS: { w: [string, string]; f: string[] }[] = [
  { w: ['#38bdf8', '#0369a1'], f: ['🐠', '🐟'] },
  { w: ['#2dd4bf', '#0f766e'], f: ['🐡', '🐠', '🐟'] },
  { w: ['#60a5fa', '#1e3a8a'], f: ['🐟', '🐠'] },
  { w: ['#22d3ee', '#155e75'], f: ['🐠'] },
  { w: ['#818cf8', '#312e81'], f: ['🐟', '🐡'] },
  { w: ['#34d399', '#065f46'], f: ['🐟', '🐠'] },
]
const FISH_AT = [[18, 26], [58, 44], [34, 58]]
const Tank = ({ i, big }: { i: number; big?: boolean }) => {
  const t = TANKS[i]
  return (
    <span className={`hw-tank${big ? ' big' : ''}`} style={{ background: `linear-gradient(180deg, ${t.w[0]}, ${t.w[1]})` }}>
      <i className="hw-plant" style={{ left: '12%', height: '42%' }} /><i className="hw-plant" style={{ left: '22%', height: '30%' }} /><i className="hw-plant" style={{ right: '14%', height: '36%' }} />
      {t.f.map((f, k) => <b key={k} style={{ left: `${FISH_AT[k][0]}%`, top: `${FISH_AT[k][1]}%`, animationDelay: `${k * 0.7}s` }}>{f}</b>)}
    </span>
  )
}

const P: Record<string, string> = {
  task: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  sale: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  card: 'M1 4h22v16H1z M1 10h22',
  back: 'm15 18-6-6 6-6',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  plus: 'M12 5v14 M5 12h14',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  check: 'M20 6 9 17l-5-5',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  image: 'M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
}
const Ic = ({ d, s = 16, w = 2 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const Av = ({ name, color, size = 34 }: { name: string; color: string; size?: number }) => (
  <span className="hw-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `color-mix(in srgb, ${color} 18%, #fff)`, color }}>{name.split(' ').map(w => w[0]).join('')}</span>
)
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

export default function HowItWorks() {
  const [active, setActive] = useState(0)
  const [clock, setClock] = useState({ step: 0, ms: 0 })
  const [onScreen, setOnScreen] = useState(false)
  const [still, setStill] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const msRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    on(); mq.addEventListener('change', on)
    const el = rootRef.current
    const io = el ? new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.2 }) : null
    if (el && io) io.observe(el)
    return () => { mq.removeEventListener('change', on); io?.disconnect() }
  }, [])

  // One clock per step; leaving the screen pauses it where it is.
  useEffect(() => {
    if (still || !onScreen) return
    const start = performance.now() - msRef.current
    const id = setInterval(() => {
      const ms = performance.now() - start
      if (ms >= STEPS[active].ms) { msRef.current = 0; setActive(a => (a + 1) % N); return }
      msRef.current = ms
      setClock({ step: active, ms })
    }, 50)
    return () => clearInterval(id)
  }, [active, onScreen, still])

  const pick = (i: number) => { msRef.current = 0; setActive(i) }
  const ms = still ? 1e9 : clock.step === active ? clock.ms : 0
  const now = (step: number, at: number) => step < active || (step === active && ms >= at)
  const fresh = (step: number) => step === active && !still

  // What the phone shows right now.
  const thread = active > 0 || ms >= OPEN_AT
  const rows = ROWS.filter(r => active > 0 || ms >= r.at).reverse()
  const samTap = active === 0 && ms >= 2900 && ms < OPEN_AT
  const items = ITEMS.filter(x => now(x.step, x.at))
  const typing = TYPING.find(t => t.step === active && ms >= t.from && ms < ITEMS.find(x => x.id === t.item)!.at)
  const typedText = typing ? (() => { const full = ITEMS.find(x => x.id === typing.item)!.text!; const until = ITEMS.find(x => x.id === typing.item)!.at - 250; return full.slice(0, Math.ceil(full.length * Math.min(1, (ms - typing.from) / (until - typing.from)))) })() : ''
  const sendTap = !!typing && ms >= ITEMS.find(x => x.id === typing.item)!.at - 260
  const gallery = active === 1 && ms >= 1150 && ms < 2950
  const picked = active === 1 && ms >= 2000
  const record = active === 3 && ms >= 450 && ms < 2300
  const paid = now(2, PAID_AT)
  const banner = active === 2 && ms >= PAID_AT && ms < 5300
  const revenue = REV_FROM + SALE * (active > 3 ? 1 : active === 3 ? Math.max(0, Math.min(1, (ms - 2400) / 900)) : 0)

  return (
    <section ref={rootRef} className="hw" aria-labelledby="hw-title">
      <style>{HW_CSS}</style>
      <div aria-hidden className="hw-dots" />
      <div aria-hidden className="hw-glow" />
      <div className="hw-in">
        <div className="hw-head">
          <div>
            <p className="hw-kicker">How it works</p>
            <h2 id="hw-title">One conversation,<br />start to finish.</h2>
          </div>
          <p className="hw-count" aria-live="polite">{String(active + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}</p>
        </div>

        <div className="hw-grid">
          {/* The steps as an index: number, title, and the open one's detail */}
          <div>
            <ol className="hw-steps">
              {STEPS.map((s, i) => {
                const on = i === active
                return (
                  <li key={s.title} className={on ? 'on' : ''}>
                    <button type="button" onClick={() => pick(i)} aria-expanded={on}>
                      <span className="hw-n">{String(i + 1).padStart(2, '0')}</span>
                      <span className="hw-t">{s.title}</span>
                      <span aria-hidden className="hw-x">+</span>
                    </button>
                    <div className="hw-more">
                      <div>
                        <div className="hw-pad">
                          <p>{s.desc}</p>
                          <a href={s.href} tabIndex={on ? 0 : -1}>Check it out <Ic d="M5 12h14 M12 5l7 7-7 7" s={13} w={2.4} /></a>
                        </div>
                      </div>
                    </div>
                    {on && !still && <span key={`run-${active}`} aria-hidden className="hw-bar" style={{ animationDuration: `${s.ms}ms`, animationPlayState: onScreen ? 'running' : 'paused' }} />}
                  </li>
                )
              })}
            </ol>
            <div className="hw-cta">
              <InviteCta cta={{ id: 'home_agents_start_free', location: 'home' }} href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 12, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: `0 12px 32px ${CORAL}40` }}>Get started free</InviteCta>
              <span>Free to start · no card</span>
            </div>
          </div>

          {/* The phone, with what happens behind the scenes beside it */}
          <div className="hw-stage" aria-hidden="true">
            {/* Behind-the-scenes cards */}
            {active === 0 && ms >= 300 && (
              <div className="hw-sat l" style={{ top: '16%' }}>
                <small>New chats</small>
                <div className="hw-chans">{ROWS.map(r => <span key={r.id} className={active > 0 || ms >= r.at ? 'on' : ''}><ChannelGlyph ch={r.ch} badge size={26} ring="#fff" /></span>)}</div>
                <b>{rows.length} channel{rows.length === 1 ? '' : 's'}, one inbox</b>
              </div>
            )}
            {active === 1 && ms >= 1150 && (
              <div className="hw-sat r" style={{ top: '22%' }}>
                <small><Ic d={P.image} s={13} />Gallery</small>
                <div className="hw-mini">{[0, 1, 2].map(i => <Tank key={i} i={i} />)}</div>
                <b>128 photos and videos</b>
                <span className="hw-sub">Mark up or trim before sending</span>
              </div>
            )}
            {active === 2 && ms >= PAID_AT + 150 && (
              <div className="hw-sat r" style={{ top: '18%' }}>
                <small><Ic d={P.card} s={13} />Payment received</small>
                <b className="hw-big">$385.00</b>
                <span className="hw-sub">Visa •••• 4242 · just now</span>
                <span className="hw-ok"><Ic d={P.check} s={12} w={3} />Paid</span>
              </div>
            )}
            {active === 3 && ms >= 2300 && (
              <div className="hw-sat r" style={{ top: '20%' }}>
                <small><Ic d={P.sale} s={13} />Revenue via Colvy · this month</small>
                <b className="hw-big">{money(revenue)}</b>
                <div className="hw-bars">{[38, 52, 44, 63, 58, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}<i className="up" style={{ height: `${46 + 40 * Math.max(0, Math.min(1, (ms - 2400) / 900))}%` }} /></div>
                <span className="hw-sub">+$385 from Sam’s chat</span>
              </div>
            )}
            {active === 4 && ms >= 500 && (
              <div className="hw-sat l" style={{ top: '30%' }}>
                <small><Ic d={P.task} s={13} />Task</small>
                <b>Ship the 4ft reef tank</b>
                <span className="hw-who"><Av name="Kai Ono" color="#2b6bff" size={22} />Kai · due today</span>
              </div>
            )}
            {active === 4 && ms >= 1200 && (
              <div className="hw-sat r" style={{ top: '52%' }}>
                <small><Ic d={P.clock} s={13} />Scheduled reply</small>
                <b>Mon 10:00</b>
                <span className="hw-sub">Edit, send now or cancel</span>
              </div>
            )}

            <div className="hw-phone">
              <span className="hw-btn" style={{ left: -3, top: 132, height: 30 }} />
              <span className="hw-btn" style={{ left: -3, top: 176, height: 54 }} />
              <span className="hw-btn" style={{ left: -3, top: 240, height: 54 }} />
              <span className="hw-btn" style={{ right: -3, top: 200, height: 78 }} />
              <div className="hw-frame"><div className="hw-bezel"><div className="hw-screen">
                <div className="hw-island" />
                <div className="hw-status"><b>9:41</b><span><i /><i /><i /><i /></span></div>

                {banner && (
                  <div className="hw-banner">
                    <img src="/icon-192.png" alt="" width={30} height={30} />
                    <div><small>Colvy · now</small><b>Payment received</b><span>$385.00 from Sam Rivera</span></div>
                  </div>
                )}

                <div className={`hw-panes${thread ? ' thread' : ''}`}>
                  {/* The inbox */}
                  <div className="hw-pane">
                    <div className="hw-ibar">
                      <div className="hw-brand"><img src="/icon-192.png" alt="" width={24} height={24} /><b>Inbox</b>{rows.length > 0 && <span className="hw-badge" key={rows.length}>{rows.length}</span>}</div>
                      <div className="hw-segs"><span className="on">All</span><span>Unread</span><span>Mine</span></div>
                    </div>
                    <div className="hw-rows">
                      {rows.map(r => (
                        <div key={r.id} className={`hw-row${fresh(0) ? ' in' : ''}${r.id === 'sam' && samTap ? ' tap' : ''}`}>
                          <span className="hw-avw"><Av name={r.name} color={r.av} /><span className="hw-chb"><ChannelGlyph ch={r.ch} badge size={15} ring="#fff" /></span></span>
                          <div><b>{r.name}</b><span>{r.text}</span></div>
                          <em>now<i /></em>
                          {r.id === 'sam' && samTap && <i className="hw-ripple" />}
                        </div>
                      ))}
                      {rows.length === 0 && <p className="hw-empty">Waiting for messages…</p>}
                    </div>
                    <div className="hw-tabs">
                      <span className="on"><Ic d={P.inbox} s={18} />Inbox</span>
                      <span><Ic d={P.users} s={18} />Contacts</span>
                      <span><Ic d={P.phone} s={18} />Calls</span>
                      <span><Ic d={P.task} s={18} />Tasks</span>
                    </div>
                  </div>

                  {/* Sam's thread */}
                  <div className="hw-pane">
                    <div className="hw-tbar">
                      <Ic d={P.back} s={18} w={2.4} />
                      <span className="hw-avw"><Av name="Sam Rivera" color="#ec4899" size={32} /><span className="hw-chb"><ChannelGlyph ch="instagram" badge size={14} ring="#fff" /></span></span>
                      <div><b>Sam Rivera</b><span>Instagram · Sydney</span></div>
                      <span className="hw-call"><Ic d={P.phone} s={15} /></span>
                    </div>
                    <div className={`hw-thread${gallery || record ? ' dim' : ''}`}>
                      <p className="hw-day">Today</p>
                      {items.map(x => {
                        const cls = `hw-it ${x.kind}${fresh(x.step) ? ' in' : ''}`
                        if (x.kind === 'sys') return <div key={x.id} className={cls}><span><Ic d={P[x.icon!]} s={13} />{x.text}</span></div>
                        if (x.kind === 'img') return <div key={x.id} className={cls}><Tank i={1} big /></div>
                        if (x.kind === 'pay') return (
                          <div key={x.id} className={cls}>
                            <div className={`hw-pay${paid ? ' paid' : ''}`}>
                              <small><Ic d={P.card} s={13} />Payment link</small>
                              <span>4ft Reef Tank</span>
                              <b>$385.00</b>
                              <em key={paid ? 'p' : 'u'}>{paid ? <><Ic d={P.check} s={13} w={3} />Paid</> : 'Pay now'}</em>
                            </div>
                          </div>
                        )
                        if (x.kind === 'sched') return <div key={x.id} className={cls}><div><small><Ic d={P.clock} s={12} />Scheduled · Mon 10:00</small>{x.text}</div></div>
                        return <div key={x.id} className={cls}><div>{x.text}</div></div>
                      })}
                    </div>
                    <div className="hw-comp">
                      <span className={`hw-plus${active === 1 && ms >= 950 && ms < 1300 ? ' tap' : ''}`}><Ic d={P.plus} s={16} w={2.4} />{active === 1 && ms >= 950 && ms < 1300 && <i className="hw-ripple" />}</span>
                      <span className={`hw-input${typedText ? ' typing' : ''}`}>{typedText || 'Reply to Sam…'}{typedText && <i className="hw-caret" />}</span>
                      <span className={`hw-send${sendTap ? ' tap' : ''}`}><Ic d={P.send} s={14} w={2.2} />{sendTap && <i className="hw-ripple" />}</span>
                    </div>

                    {/* Gallery sheet */}
                    <div className={`hw-sheet${gallery ? ' up' : ''}`}>
                      <i className="hw-grab" />
                      <div className="hw-sh"><b>Gallery</b><span className="on">Photos</span><span>Videos</span></div>
                      <div className="hw-grid3">
                        {TANKS.map((_, i) => (
                          <span key={i} className={`hw-cell${i === 1 && picked ? ' sel' : ''}`}><Tank i={i} />{i === 1 && picked && <em><Ic d={P.check} s={11} w={3.4} /></em>}</span>
                        ))}
                      </div>
                      <span className={`hw-cta2${picked ? ' on' : ''}${active === 1 && ms >= 2650 ? ' tap' : ''}`}>{picked ? 'Send 1 photo' : 'Select'}{active === 1 && ms >= 2650 && <i className="hw-ripple" />}</span>
                    </div>

                    {/* Record a sale sheet */}
                    <div className={`hw-sheet${record ? ' up' : ''}`}>
                      <i className="hw-grab" />
                      <div className="hw-sh"><b>Record sale</b></div>
                      <div className="hw-field"><small>Amount</small><b>$385.00</b></div>
                      <div className="hw-field"><small>Paid by</small><div className="hw-chips"><span className="on">Payment link</span><span>Bank transfer</span><span>Cash</span></div></div>
                      <div className="hw-field"><small>Credited to</small><span className="hw-who"><Av name="Mia Lane" color={CORAL} size={22} />Mia</span></div>
                      <span className={`hw-cta2 on${active === 3 && ms >= 1950 ? ' tap' : ''}`}>Record sale{active === 3 && ms >= 1950 && <i className="hw-ripple" />}</span>
                    </div>
                  </div>
                </div>
              </div></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const HW_CSS = `
.hw{position:relative;background:#0a0b10;padding:clamp(64px,9vw,120px) 24px;overflow:hidden;color:#fff}
.hw-dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.075) 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 75%);mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 75%)}
.hw-glow{position:absolute;right:8%;top:20%;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,${CORAL}33,transparent 65%)}
.hw-in{position:relative;max-width:1200px;margin:0 auto}
.hw-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:clamp(28px,4vw,52px)}
.hw-kicker{margin:0 0 14px;font-family:${MONO};font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${CORAL}}
.hw-head h2{margin:0;font-size:clamp(32px,4.8vw,56px);font-weight:900;letter-spacing:-.035em;line-height:1.02}
.hw-count{margin:0;font-family:${MONO};font-size:12px;letter-spacing:.06em;color:rgba(255,255,255,.45);font-variant-numeric:tabular-nums}
.hw-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,80px);align-items:center}

.hw-steps{list-style:none;margin:0;padding:0;border-top:1px solid rgba(255,255,255,.1)}
.hw-steps li{position:relative;border-bottom:1px solid rgba(255,255,255,.1)}
.hw-steps button{display:grid;grid-template-columns:46px 1fr auto;align-items:baseline;width:100%;text-align:left;background:none;border:0;cursor:pointer;padding:19px 0;color:#fff;font:inherit}
.hw-steps button::before{display:none !important}
.hw-n{font-family:${MONO};font-size:12.5px;color:rgba(255,255,255,.32);font-variant-numeric:tabular-nums;transition:color .25s}
.hw-t{font-size:clamp(17px,1.9vw,21px);font-weight:800;letter-spacing:-.015em;line-height:1.25;color:rgba(255,255,255,.5);transition:color .25s}
.hw-x{font-family:${MONO};font-size:18px;line-height:1;margin-left:12px;color:rgba(255,255,255,.25);transition:transform .3s,color .25s}
.hw-steps li.on .hw-n,.hw-steps li.on .hw-x{color:${CORAL}}
.hw-steps li.on .hw-t{color:#fff}
.hw-steps li.on .hw-x{transform:rotate(45deg)}
.hw-steps button:hover .hw-t{color:rgba(255,255,255,.85)}
.hw-more{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s ease}
.hw-steps li.on .hw-more{grid-template-rows:1fr}
.hw-more>div{overflow:hidden}
.hw-pad{padding:0 0 20px 46px}
.hw-pad p{margin:0 0 12px;font-size:15px;line-height:1.55;color:rgba(255,255,255,.66);max-width:440px}
.hw-pad a{display:inline-flex;align-items:center;gap:8px;font-family:${MONO};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#fff;text-decoration:none;padding-bottom:3px;border-bottom:1px solid ${CORAL}}
.hw-bar{position:absolute;left:0;bottom:-1px;height:2px;width:0;background:${CORAL};box-shadow:0 0 12px ${CORAL};animation:hwFill linear forwards}
.hw-cta{display:flex;align-items:center;gap:18px;margin-top:30px;flex-wrap:wrap}
.hw-cta>span{font-family:${MONO};font-size:12px;letter-spacing:.04em;color:rgba(255,255,255,.45)}

/* Stage + phone */
.hw-stage{position:relative;display:flex;justify-content:center;padding:10px 0}
.hw-phone{position:relative;width:min(330px,100%);z-index:1}
.hw-btn{position:absolute;width:3px;border-radius:2px;background:#05060a}
.hw-frame{position:relative;background:linear-gradient(145deg,#2a2c35,#0b0c12 60%);border-radius:52px;padding:5px;box-shadow:0 60px 120px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.07) inset}
.hw-bezel{background:#05060a;border-radius:47px;padding:9px}
.hw-screen{position:relative;background:#fff;border-radius:39px;overflow:hidden;aspect-ratio:300/640;color:#0f1119;font-size:13px;isolation:isolate}
.hw-island{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:92px;height:27px;border-radius:999px;background:#05060a;z-index:6}
.hw-status{position:absolute;top:0;left:0;right:0;height:46px;display:flex;align-items:center;justify-content:space-between;padding:4px 26px 0 30px;z-index:5;font-size:13px}
.hw-status b{font-weight:700;letter-spacing:-.01em}
.hw-status span{display:inline-flex;align-items:flex-end;gap:2px;height:11px}
.hw-status i{width:3px;border-radius:1px;background:#0f1119}
.hw-status i:nth-child(1){height:4px}.hw-status i:nth-child(2){height:6px}.hw-status i:nth-child(3){height:8px}.hw-status i:nth-child(4){height:11px}

.hw-banner{position:absolute;left:8px;right:8px;top:48px;z-index:7;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:18px;background:rgba(245,245,247,.9);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 12px 30px rgba(0,0,0,.18);animation:hwDrop .55s cubic-bezier(.22,1,.36,1) both}
.hw-banner img{border-radius:8px;flex-shrink:0}
.hw-banner div{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.hw-banner small{font-size:10.5px;color:#71717a}
.hw-banner b{font-size:12.5px}
.hw-banner span{font-size:12px;color:#3f3f46}

.hw-panes{position:absolute;inset:46px 0 0;display:flex;width:200%;transition:transform .55s cubic-bezier(.65,0,.35,1)}
.hw-panes.thread{transform:translateX(-50%)}
.hw-pane{position:relative;width:50%;height:100%;display:flex;flex-direction:column;overflow:hidden}

.hw-ibar{padding:6px 16px 10px}
.hw-brand{display:flex;align-items:center;gap:8px}
.hw-brand img{border-radius:7px}
.hw-brand b{font-size:22px;font-weight:800;letter-spacing:-.03em}
.hw-badge{min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:${CORAL};color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;animation:hwPop .4s cubic-bezier(.34,1.56,.64,1) both}
.hw-segs{display:flex;gap:6px;margin-top:10px}
.hw-segs span{padding:5px 11px;border-radius:999px;background:#f4f4f5;font-size:11.5px;font-weight:600;color:#52525b}
.hw-segs span.on{background:#18181b;color:#fff}
.hw-rows{flex:1;padding:2px 8px;overflow:hidden}
.hw-row{position:relative;display:grid;grid-template-columns:40px 1fr auto;gap:10px;align-items:center;padding:9px 8px;border-radius:14px;overflow:hidden;transition:background .2s}
.hw-row.in{animation:hwRow .55s cubic-bezier(.22,1,.36,1) both}
.hw-row.tap{background:#f4f4f5}
.hw-row div{min-width:0;display:flex;flex-direction:column;line-height:1.3}
.hw-row b{font-size:13px}
.hw-row div span{font-size:12px;color:#52525b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hw-row em{font-style:normal;font-size:10.5px;color:#a1a1aa;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.hw-row em i{width:8px;height:8px;border-radius:50%;background:${CORAL}}
.hw-empty{margin:40px 0 0;text-align:center;color:#a1a1aa;font-size:12px}
.hw-tabs{display:flex;justify-content:space-around;padding:8px 6px 16px;border-top:1px solid #f0f0f2;background:#fff}
.hw-tabs span{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9.5px;font-weight:600;color:#a1a1aa}
.hw-tabs span.on{color:${CORAL}}

.hw-av{border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;letter-spacing:-.02em}
.hw-avw{position:relative;display:inline-flex;flex-shrink:0}
.hw-chb{position:absolute;right:-3px;bottom:-3px;display:inline-flex}

.hw-tbar{display:flex;align-items:center;gap:9px;padding:4px 12px 10px;border-bottom:1px solid #f0f0f2}
.hw-tbar>svg{color:${CORAL};flex-shrink:0}
.hw-tbar div{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.hw-tbar b{font-size:13.5px}
.hw-tbar div span{font-size:11px;color:#71717a}
.hw-call{width:30px;height:30px;border-radius:50%;background:#f4f4f5;display:inline-flex;align-items:center;justify-content:center;color:#3f3f46}

.hw-thread{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;padding:10px 12px;overflow:hidden;background:#fafafa;transition:filter .3s;-webkit-mask-image:linear-gradient(180deg,transparent,#000 28px);mask-image:linear-gradient(180deg,transparent,#000 28px)}
.hw-thread.dim{filter:brightness(.82)}
.hw-day{margin:0 0 2px;text-align:center;font-size:10.5px;font-weight:600;color:#a1a1aa}
.hw-it{display:flex;flex-shrink:0}
.hw-it.in{animation:hwGrow .5s cubic-bezier(.22,1,.36,1) both}
.hw-it>div{max-width:80%;padding:9px 12px;font-size:12.5px;line-height:1.42;font-weight:500}
.hw-it.them>div{background:#fff;border-radius:16px 16px 16px 5px;box-shadow:0 0 0 1px #ececef,0 2px 6px rgba(15,17,25,.04)}
.hw-it.me{justify-content:flex-end}
.hw-it.me>div{background:${CORAL};color:#fff;border-radius:16px 16px 5px 16px}
.hw-it.sys{justify-content:center}
.hw-it.sys span{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:#f0f0f3;font-size:11px;font-weight:600;color:#52525b}
.hw-it.sys svg{color:${CORAL}}
.hw-it.img{justify-content:flex-end}
.hw-it.pay{justify-content:flex-end}
.hw-it.sched{justify-content:flex-end}
.hw-it.sched>div{border-radius:16px 16px 5px 16px;border:1.5px dashed color-mix(in srgb,${CORAL} 55%,transparent);color:#3f3f46;background:color-mix(in srgb,${CORAL} 6%,#fff)}
.hw-it.sched small{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:${CORAL};margin-bottom:3px}

.hw-pay{width:186px;padding:11px 12px 12px;border-radius:16px 16px 5px 16px;background:#fff;box-shadow:0 0 0 1px #ececef,0 6px 16px rgba(15,17,25,.06);display:flex;flex-direction:column;gap:2px}
.hw-pay small{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:#71717a}
.hw-pay span{font-size:12px;color:#3f3f46;margin-top:4px}
.hw-pay b{font-size:20px;letter-spacing:-.02em}
.hw-pay em{margin-top:8px;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:8px;border-radius:999px;background:${CORAL};color:#fff;font-style:normal;font-size:12px;font-weight:700;animation:hwPop .45s cubic-bezier(.34,1.56,.64,1) both}
.hw-pay.paid em{background:#dcfce7;color:#15803d}

.hw-tank{position:relative;display:block;width:100%;height:100%;overflow:hidden;border-radius:inherit}
.hw-tank::after{content:"";position:absolute;left:0;right:0;bottom:0;height:18%;background:linear-gradient(180deg,#e7d3a8,#c9a96e)}
.hw-tank::before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.28),transparent 40%)}
.hw-tank b{position:absolute;font-size:15px;line-height:1;animation:hwSwim 3.2s ease-in-out infinite alternate}
.hw-tank.big b{font-size:24px}
.hw-plant{position:absolute;bottom:12%;width:7%;border-radius:999px 999px 0 0;background:linear-gradient(180deg,#4ade80,#15803d)}
.hw-it.img .hw-tank{width:178px;height:126px;border-radius:16px 16px 5px 16px;box-shadow:0 6px 16px rgba(15,17,25,.12)}

.hw-comp{display:flex;align-items:center;gap:7px;padding:9px 10px 16px;border-top:1px solid #f0f0f2;background:#fff}
.hw-plus,.hw-send{position:relative;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;transition:transform .15s}
.hw-plus{background:#f4f4f5;color:#3f3f46}
.hw-send{background:${CORAL};color:#fff}
.hw-plus.tap,.hw-send.tap{transform:scale(.88)}
.hw-input{flex:1;min-width:0;padding:8px 12px;border-radius:999px;background:#f4f4f5;font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:clip}
.hw-input.typing{color:#18181b}
.hw-caret{display:inline-block;width:1.5px;height:13px;margin-left:1px;vertical-align:-2px;background:${CORAL};animation:hwBlink 1s steps(1) infinite}

.hw-sheet{position:absolute;left:0;right:0;bottom:0;z-index:4;padding:8px 14px 18px;border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -14px 40px rgba(15,17,25,.18);transform:translateY(105%);transition:transform .45s cubic-bezier(.22,1,.36,1)}
.hw-sheet.up{transform:none}
.hw-grab{display:block;width:36px;height:4px;border-radius:999px;background:#e4e4e7;margin:0 auto 10px}
.hw-sh{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.hw-sh b{font-size:15px;margin-right:auto}
.hw-sh span{padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#71717a;background:#f4f4f5}
.hw-sh span.on{background:#18181b;color:#fff}
.hw-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.hw-cell{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;transition:transform .25s,box-shadow .25s}
.hw-cell.sel{transform:scale(.92);box-shadow:0 0 0 3px ${CORAL}}
.hw-cell em{position:absolute;right:5px;top:5px;width:18px;height:18px;border-radius:50%;background:${CORAL};color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff;animation:hwPop .35s cubic-bezier(.34,1.56,.64,1) both}
.hw-cta2{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-top:12px;padding:11px;border-radius:999px;background:#f4f4f5;color:#a1a1aa;font-size:13px;font-weight:700;transition:background .25s,color .25s,transform .15s}
.hw-cta2.on{background:${CORAL};color:#fff}
.hw-cta2.tap{transform:scale(.97)}
.hw-field{display:flex;flex-direction:column;gap:6px;padding:9px 0;border-bottom:1px solid #f4f4f5}
.hw-field small{font-size:10.5px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.04em}
.hw-field>b{font-size:22px;letter-spacing:-.02em}
.hw-chips{display:flex;gap:5px;flex-wrap:wrap}
.hw-chips span{padding:5px 9px;border-radius:999px;background:#f4f4f5;font-size:11px;font-weight:600;color:#52525b}
.hw-chips span.on{background:color-mix(in srgb,${CORAL} 14%,#fff);color:#c2410c;box-shadow:inset 0 0 0 1px color-mix(in srgb,${CORAL} 45%,transparent)}
.hw-who{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600}

.hw-ripple{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(15,17,25,.16);pointer-events:none;animation:hwRipple .5s ease-out forwards}
.hw-send .hw-ripple,.hw-cta2.on .hw-ripple{background:rgba(255,255,255,.45)}

/* Behind-the-scenes cards */
.hw-sat{position:absolute;z-index:2;width:196px;padding:12px 14px 13px;border-radius:18px;background:rgba(255,255,255,.96);color:#18181b;box-shadow:0 24px 60px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.4) inset;display:flex;flex-direction:column;gap:6px;animation:hwSat .6s cubic-bezier(.22,1,.36,1) both}
.hw-sat.l{left:calc(50% - 165px - 196px + 22px)}
.hw-sat.r{left:calc(50% + 165px - 22px)}
.hw-sat small{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#71717a}
.hw-sat small svg{color:${CORAL}}
.hw-sat b{font-size:14px;letter-spacing:-.01em;line-height:1.3}
.hw-sat b.hw-big{font-size:26px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.hw-sub{font-size:11.5px;color:#71717a}
.hw-ok{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700}
.hw-chans{display:flex;gap:6px}
.hw-chans>span{display:inline-flex;opacity:.2;filter:grayscale(1);transform:scale(.85);transition:opacity .35s,filter .35s,transform .45s cubic-bezier(.34,1.56,.64,1)}
.hw-chans>span.on{opacity:1;filter:none;transform:none}
.hw-mini{display:flex;gap:5px}
.hw-mini .hw-tank{width:52px;height:52px;border-radius:9px}
.hw-mini .hw-tank b{font-size:12px}
.hw-bars{display:flex;align-items:flex-end;gap:5px;height:46px}
.hw-bars i{flex:1;border-radius:4px 4px 2px 2px;background:#e4e4e7}
.hw-bars i.up{background:${CORAL}}

@keyframes hwFill{from{width:0}to{width:100%}}
@keyframes hwRow{from{opacity:0;transform:translateY(-14px);max-height:0;padding-top:0;padding-bottom:0}to{opacity:1;transform:none;max-height:80px}}
@keyframes hwGrow{from{opacity:0;transform:translateY(10px) scale(.96);max-height:0}to{opacity:1;transform:none;max-height:240px}}
@keyframes hwPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes hwDrop{from{opacity:0;transform:translateY(-24px) scale(.96)}to{opacity:1;transform:none}}
@keyframes hwSat{from{opacity:0;transform:translateY(16px) scale(.94)}to{opacity:1;transform:none}}
@keyframes hwRipple{from{transform:scale(.3);opacity:1}to{transform:scale(6);opacity:0}}
@keyframes hwSwim{from{transform:translateX(0)}to{transform:translateX(14px)}}
@keyframes hwBlink{50%{opacity:0}}

@media (max-width:1320px){.hw-sat{display:none}}
@media (max-width:900px){
  .hw-grid{grid-template-columns:1fr}
  .hw-glow{right:-20%;top:auto;bottom:4%}
}
@media (prefers-reduced-motion:reduce){
  .hw-panes,.hw-sheet,.hw-cell{transition:none}
  .hw-row.in,.hw-it.in,.hw-badge,.hw-banner,.hw-sat,.hw-pay em,.hw-cell em,.hw-tank b,.hw-caret{animation:none}
}
`
