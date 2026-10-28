'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import ChannelGlyph, { CHANNEL_LABEL, type ChannelKey } from './ChannelGlyph'

// The homepage's big walkthrough (Sellio-style): a life-size Colvy inbox with
// two teammates working in it, their named cursors gliding about. Colvy AI has
// answered first in every thread. Mia tags a chat, Kai picks up one the AI
// handed over, a new conversation arrives and pushes the list down, and Mia
// opens it, types a reply and sends it. Made-up demo data.
//
// Drawn at a fixed size and scaled to fit (the whole app on wide screens, the
// list and the thread on phones). Runs only while it's on screen, and sits
// still for visitors who prefer less motion.

type Status = 'done' | 'handed' | 'waiting' | 'ai' | 'typing'
type Row = { id: string; name: string; ch: ChannelKey; snippet: string; time: string; av: string; status: Status; tag?: string }
type Who = 'mia' | 'kai'
type Msg = { who: 'them' | 'ai' | Who; text: string; at: string }

const TEAM: Record<Who, { name: string; initials: string; color: string }> = {
  mia: { name: 'Mia', initials: 'MS', color: '#ff6a4d' },
  kai: { name: 'Kai', initials: 'KO', color: '#2b6bff' },
}

const ROWS: Row[] = [
  { id: 'priya', name: 'Priya Nair', ch: 'instagram', snippet: 'Perfect, thank you!', time: 'now', av: '#8b5cf6', status: 'done' },
  { id: 'tom', name: 'Tom Becker', ch: 'sms', snippet: 'Thanks, picking up Saturday 👍', time: '2m', av: '#0ea5e9', status: 'done' },
  { id: 'wei', name: 'Wei Chen', ch: 'messenger', snippet: 'Hi Wei! 20 plants comes to 15% off. Want…', time: '14m', av: '#f59e0b', status: 'waiting' },
  { id: 'ana', name: 'Ana Lopez', ch: 'phone', snippet: 'Colvy AI answered a call · 1:42', time: '38m', av: '#10b981', status: 'ai' },
  { id: 'lena', name: 'Lena Fischer', ch: 'email', snippet: 'I’ve handed this to the team. They’ll be in touch.', time: '1h', av: '#ec4899', status: 'handed' },
  { id: 'omar', name: 'Omar Haddad', ch: 'chat', snippet: 'Yes! Delivery to Perth takes 4–6 days.', time: '3h', av: '#f97316', status: 'done' },
  { id: 'emma', name: 'Emma Wright', ch: 'email', snippet: 'Of course. Choose Gift card at checkout.', time: '5h', av: '#06b6d4', status: 'done' },
  { id: 'mateo', name: 'Mateo García', ch: 'sms', snippet: 'I’ve sent a reset link to your email.', time: '1d', av: '#84cc16', status: 'done' },
]
const JACK: Row = { id: 'jack', name: 'Jack Wu', ch: 'instagram', snippet: 'I was charged twice for the same order.', time: 'now', av: '#64748b', status: 'handed' }

const THREADS: Record<'priya' | 'jack', { no: number; email: string; topic: string; place: string; msgs: Msg[]; order: string; tags: string[] }> = {
  priya: {
    no: 213, email: 'priya.nair@example.com', topic: 'Delivery address', place: 'Geelong, VIC', order: '#4821 · $385 · Paid', tags: [],
    msgs: [
      { who: 'them', text: 'Can I change the delivery address on my order?', at: '9:44 AM' },
      { who: 'ai', text: 'Yes, it hasn’t shipped yet. I’ve updated it to your new address in Geelong; you’ll get a confirmation email now.', at: '9:44 AM' },
      { who: 'them', text: 'Perfect, thank you!', at: '9:45 AM' },
    ],
  },
  jack: {
    no: 214, email: 'jack.wu@example.com', topic: 'Duplicate charge', place: 'Brisbane, QLD', order: '#4830 · $129 · Paid twice', tags: ['billing'],
    msgs: [
      { who: 'them', text: 'I was charged twice for the same order.', at: '9:46 AM' },
      { who: 'ai', text: 'Sorry about that! I’ve passed this to the team so they can refund the duplicate charge.', at: '9:46 AM' },
    ],
  },
}
const REPLY = 'Hi Jack, the duplicate charge is refunded. It should show in 3–5 days.'

const FULL = { w: 1280, h: 760 }
const COMPACT = { w: 640, h: 640 }

const P: Record<string, string> = {
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 .01 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  bot: 'M3 11h18v10H3z M12 5a2 2 0 1 0 0 .01 M12 7v4 M8 16h.01 M16 16h.01',
  flow: 'M6 3v6 M18 15v6 M6 9a6 6 0 0 0 6 6h6 M6 3a2 2 0 1 0 0 .01',
  chart: 'M18 20V10 M12 20V4 M6 20v-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  plus: 'M12 5v14 M5 12h14',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6',
  at: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  check: 'M20 6 9 17l-5-5',
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  arrow: 'M5 12h14 M12 5l7 7-7 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  sparkle: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  up: 'M12 19V5 M5 12l7-7 7 7',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
}
const Ic = ({ d, s = 16, w = 2 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const Av = ({ name, color, size = 40 }: { name: string; color: string; size?: number }) => (
  <span className="tid-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `color-mix(in srgb, ${color} 16%, #fff)`, color }}>{initials(name)}</span>
)

function StatusIcon({ s }: { s: Status }) {
  if (s === 'ai') return <span className="tid-st-ai"><AiBuddy size={18} /></span>
  if (s === 'typing') return <span className="tid-st typing" style={{ background: TEAM.kai.color }}><i /><i /><i /></span>
  const d = s === 'done' ? P.check : s === 'handed' ? P.arrow : P.clock
  return <span className={`tid-st ${s}`}><Ic d={d} s={11} w={3} /></span>
}

export default function TeamInboxDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const curRef = useRef<Record<Who, HTMLDivElement | null>>({ mia: null, kai: null })
  const [box, setBox] = useState({ k: 1, full: true })
  const [playing, setPlaying] = useState(false)
  const [still, setStill] = useState(false)
  const [loop, setLoop] = useState(0)

  const [rows, setRows] = useState<Row[]>(ROWS)
  const [open, setOpen] = useState<'priya' | 'jack'>('priya')
  const [typed, setTyped] = useState(0)
  const [miaTyping, setMiaTyping] = useState(false)
  const [sent, setSent] = useState(false)
  const [counts, setCounts] = useState({ all: 35, unassigned: 13 })
  const [fade, setFade] = useState(false)

  // Fit the drawing to the space: the whole app when there's room, else the
  // list and the thread.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      const full = w >= 860
      setBox({ k: Math.min(1, w / (full ? FULL.w : COMPACT.w)), full })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Play only while it's on screen; never with reduced motion.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStill(true); return }
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Glide a cursor to a spot on the drawing (in its own, unscaled pixels).
  const go = (who: Who, spot: string, ox = 0.5, oy = 0.5) => {
    const stage = stageRef.current, c = curRef.current[who]
    const el = stage?.querySelector<HTMLElement>(`[data-spot="${spot}"]`)
    if (!stage || !c || !el) return
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / stage.offsetWidth || 1
    c.style.transform = `translate(${((r.left - s.left + r.width * ox) / k).toFixed(1)}px, ${((r.top - s.top + r.height * oy) / k).toFixed(1)}px)`
  }
  const click = (who: Who) => {
    const c = curRef.current[who]
    if (!c) return
    c.classList.remove('clk'); void c.offsetWidth; c.classList.add('clk')
  }

  // Where the cursors rest when nothing is happening.
  useEffect(() => {
    const t = setTimeout(() => { go('mia', 'msg-ai', 0.25, 1.15); go('kai', box.full ? 'cx' : 'thread-top', 0.6, 0.5) }, 60)
    return () => clearTimeout(t)
  }, [box.full, still])

  // The script.
  useEffect(() => {
    if (!playing) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)) }
    setRows(ROWS); setOpen('priya'); setTyped(0); setSent(false); setMiaTyping(false); setCounts({ all: 35, unassigned: 13 }); setFade(false)
    at(80, () => { go('mia', 'msg-ai', 0.25, 1.15); go('kai', box.full ? 'cx' : 'thread-top', 0.6, 0.5) })
    at(700, () => go('mia', 'row-priya', 0.72, 0.6))
    at(1700, () => { click('mia'); setRows(rs => rs.map(r => (r.id === 'priya' ? { ...r, tag: 'delivery' } : r))) })
    at(2300, () => go('kai', 'row-lena', 0.6, 0.55))
    at(3300, () => { click('kai'); setRows(rs => rs.map(r => (r.id === 'lena' ? { ...r, status: 'typing' } : r))) })
    at(4000, () => { setRows(rs => [JACK, ...rs]); setCounts({ all: 36, unassigned: 14 }) })
    at(4300, () => go('kai', box.full ? 'details' : 'thread-top', 0.5, 0.35))
    at(4800, () => go('mia', 'row-jack', 0.55, 0.55))
    at(5800, () => { click('mia'); setOpen('jack') })
    at(6300, () => setRows(rs => rs.map(r => (r.id === 'lena' ? { ...r, status: 'done', time: 'now', snippet: 'Kai: Hi Lena, a new heater ships today, no charge.' } : r))))
    at(6600, () => go('mia', 'composer', 0.3, 0.42))
    at(7600, () => { click('mia'); setMiaTyping(true) })
    const T0 = 7800, PER = 36
    for (let i = 1; i <= REPLY.length; i++) at(T0 + i * PER, () => setTyped(i))
    const T1 = T0 + REPLY.length * PER + 350
    at(T1, () => { setMiaTyping(false); go('mia', 'send', 0.45, 0.5) })
    at(T1 + 950, () => {
      click('mia'); setSent(true); setTyped(0); setCounts({ all: 36, unassigned: 13 })
      setRows(rs => rs.map(r => (r.id === 'jack' ? { ...r, status: 'done', snippet: 'Mia: Hi Jack, the duplicate charge is refunded…' } : r)))
    })
    at(T1 + 1700, () => go('kai', box.full ? 'cx' : 'thread-top', 0.6, 0.5))
    at(T1 + 2300, () => go('mia', 'msg-mia', 0.2, 1.2))
    at(T1 + 5600, () => setFade(true))
    at(T1 + 6100, () => setLoop(n => n + 1))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, loop, box.full])

  const D = box.full ? FULL : COMPACT
  const row = rows.find(r => r.id === open) || ROWS[0]
  const t = THREADS[open]
  const msgs: Msg[] = open === 'jack' && sent ? [...t.msgs, { who: 'mia', text: REPLY, at: '9:48 AM' }] : t.msgs
  const resolved = open === 'priya' || sent
  const cx = open === 'priya' ? 5 : sent ? 4 : 2
  const cxLabel = ['', 'Poor', 'Upset', 'Okay', 'Good', 'Great'][cx]
  const priyaTag = rows.find(r => r.id === 'priya')?.tag
  const tags = open === 'priya' ? (priyaTag ? [priyaTag] : []) : t.tags
  const first = row.name.split(' ')[0]

  return (
    <div ref={wrapRef} className="tid" style={{ height: Math.round(D.h * box.k) }} aria-label="A Colvy inbox with two teammates and Colvy AI answering customers" role="img">
      <style>{TID_CSS}</style>
      <div ref={stageRef} className={`tid-stage${box.full ? '' : ' compact'}`} style={{ width: D.w, height: D.h, transform: `scale(${box.k})` }} aria-hidden="true">
        <div className={`tid-app${fade ? ' fade' : ''}`}>
          {box.full && (
            <div className="tid-rail">
              <img src="/icon-192.png" alt="" className="tid-logo" />
              {[['Inbox', P.inbox], ['Contacts', P.users], ['Orders', P.bag], ['AI agent', P.bot], ['Automate', P.flow], ['Reports', P.chart]].map(([l, d], i) => (
                <span key={l} className={`tid-ri${i === 0 ? ' on' : ''}`}><Ic d={d} s={19} /><small>{l}</small></span>
              ))}
              <span className="tid-grow" />
              <span className="tid-ri"><Ic d={P.search} s={19} /><small>Search</small></span>
              <span className="tid-me" style={{ background: TEAM.mia.color }}>{TEAM.mia.initials}</span>
            </div>
          )}

          {box.full && (
            <div className="tid-folders">
              <div className="tid-h"><b>Inbox</b><span className="tid-hi"><Ic d={P.search} s={16} /><Ic d={P.plus} s={16} /></span></div>
              {([['Your inbox', 22, P.user], ['All', counts.all, P.users], ['Unread', '', P.mail], ['Unassigned', counts.unassigned, P.circle], ['Mentions', '', P.at], ['Priority', 9, P.flag], ['Resolved', 30, P.check]] as const).map(([l, n, d], i) => (
                <div key={l} className={`tid-f${i === 1 ? ' on' : ''}`}><Ic d={d} s={16} /><span>{l}</span><em key={String(n)}>{n}</em></div>
              ))}
              <p className="tid-sec">Colvy AI</p>
              {([['AI resolved', 13], ['AI routed', 24], ['AI spam', '']] as const).map(([l, n]) => (
                <div key={l} className="tid-f"><span className="tid-f-ai"><AiBuddy size={16} /></span><span>{l}</span><em>{n}</em></div>
              ))}
              <p className="tid-sec">Teams</p>
              {[['Support', '#3b82f6'], ['Sales', '#8b5cf6']].map(([l, c]) => <div key={l} className="tid-f"><span className="tid-dot" style={{ background: c }} /><span>{l}</span><em /></div>)}
            </div>
          )}

          <div className="tid-list">
            <div className="tid-h"><b>All</b><span className="tid-pill"><Ic d={P.inbox} s={14} />Open</span></div>
            {rows.map(r => (
              <div key={r.id} data-spot={`row-${r.id}`} className={`tid-row${r.id === open ? ' sel' : ''}${r.id === 'jack' ? ' new' : ''}`}>
                <span className="tid-avw"><Av name={r.name} color={r.av} /><span className="tid-badge"><ChannelGlyph ch={r.ch} badge size={16} ring="#fff" /></span></span>
                <span className="tid-rb">
                  <span className="tid-rt"><b>{r.name}</b><small>{r.time}</small></span>
                  <span className="tid-rs"><span key={r.snippet}>{r.snippet}</span><StatusIcon s={r.status} /></span>
                  {r.tag && <span className="tid-tagline"><span className="tid-tag">{r.tag}</span></span>}
                </span>
              </div>
            ))}
          </div>

          <div className="tid-thread">
            <div className="tid-th" key={'h' + open}>
              <Av name={row.name} color={row.av} size={36} />
              <span className="tid-thn"><b>{row.name}</b><small>#{t.no} · {t.email}</small></span>
              <span className={`tid-state${resolved ? ' ok' : ''}`} key={String(resolved)}><Ic d={resolved ? P.check : P.circle} s={14} w={2.4} />{resolved ? 'Resolved' : 'Open'}</span>
              <span className="tid-thi"><Ic d={P.user} s={17} /><Ic d={P.moon} s={17} /><Ic d={P.flag} s={17} /><Ic d={P.dots} s={17} w={3} /></span>
            </div>
            <div className="tid-topic" key={'t' + open}>{t.topic}</div>
            <div className="tid-msgs" data-spot="thread-top" key={'m' + open}>
              <span className="tid-day">Today, {t.msgs[0].at}</span>
              {msgs.map((m, i) => m.who === 'them' ? (
                <div key={i} className="tid-m them"><Av name={row.name} color={row.av} size={30} /><span><p>{m.text}</p><small>{m.at}</small></span></div>
              ) : (
                <div key={i} className={`tid-m us${m.who === 'mia' ? ' fresh' : ''}`} data-spot={m.who === 'ai' ? 'msg-ai' : 'msg-mia'}>
                  <span><p>{m.text}</p><small>{m.who === 'ai' ? 'Colvy AI' : 'Mia'} · {m.at} <Ic d={P.check} s={11} w={2.6} /></small></span>
                  {m.who === 'ai' ? <span className="tid-m-ai"><AiBuddy size={30} /></span> : <span className="tid-me sm" style={{ background: TEAM.mia.color }}>{TEAM.mia.initials}</span>}
                </div>
              ))}
            </div>
            <div className="tid-composer" data-spot="composer">
              <div className="tid-ctabs"><span className="on">Reply</span><span>Note</span><span>Ticket</span><em><Ic d={P.bolt} s={13} />AI autopilot</em></div>
              <div className="tid-cbody">{typed ? REPLY.slice(0, typed) : <span className="tid-ph">Reply to {first}…</span>}{miaTyping && <i className="tid-caret" />}</div>
              <div className="tid-cfoot">
                <span className="tid-tools"><span className="tid-ai"><Ic d={P.sparkle} s={15} /></span><Ic d={P.smile} s={17} /><Ic d={P.clip} s={17} /></span>
                <span className="tid-send" data-spot="send"><Ic d={P.up} s={14} w={2.6} />Send</span>
              </div>
            </div>
          </div>

          {box.full && (
            <div className="tid-details" data-spot="details">
              <div className="tid-dtabs"><span className="on">Details</span><span>Copilot</span></div>
              <div className="tid-who" key={'w' + open}><Av name={row.name} color={row.av} size={64} /><b>{row.name}</b><small>{t.email}</small></div>
              <div className="tid-card"><h5>Assignee</h5>
                <div className="tid-cr" key={String(sent)}>{open === 'jack' && sent ? <><span className="tid-me xs" style={{ background: TEAM.mia.color }}>{TEAM.mia.initials}</span>Mia</> : open === 'priya' ? <><span className="tid-f-ai"><AiBuddy size={18} /></span>Colvy AI</> : <><span className="tid-dash" />None assigned</>}</div>
              </div>
              <div className="tid-card"><h5>Presence</h5>
                <div className="tid-cr"><Ic d={P.pin} s={15} />{t.place}</div>
                <div className="tid-cr"><ChannelGlyph ch={row.ch} badge size={16} />{CHANNEL_LABEL[row.ch]}</div>
              </div>
              <div className="tid-card" data-spot="cx"><h5>CX score</h5>
                <div className="tid-cxh"><b>{cxLabel}</b><span>{cx}/5</span></div>
                <div className="tid-bar"><i style={{ left: `${cx * 20}%` }} /></div>
                {open === 'priya' && <p className="tid-note"><span className="tid-chip"><Ic d={P.check} s={11} w={3} />Instant fix</span>“Wow, that was fast.”</p>}
              </div>
              <div className="tid-card"><h5>Tags</h5>
                <div className="tid-tags">{tags.length ? tags.map(g => <span key={g} className="tid-tag">{g}</span>) : <span className="tid-ph">Add a tag</span>}</div>
              </div>
              <div className="tid-card"><h5>Orders</h5><div className="tid-cr"><Ic d={P.bag} s={15} />{t.order}</div></div>
            </div>
          )}
        </div>

        {(['mia', 'kai'] as Who[]).map(w => (
          <div key={w} ref={el => { curRef.current[w] = el }} className="tid-cur" style={{ ['--c' as string]: TEAM[w].color } as React.CSSProperties}>
            <span className="tid-ring" />
            <svg className="tid-arrow" width="22" height="22" viewBox="0 0 24 24"><path d="M3.5 2.5 20 9.6l-7.3 2.6-2.7 7.3z" /></svg>
            <span className="tid-name"><span className="tid-ini">{TEAM[w].initials}</span>{TEAM[w].name}{w === 'mia' && miaTyping && <span className="tid-dots"><i /><i /><i /></span>}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const TID_CSS = `
.tid{position:relative;width:100%;max-width:${FULL.w}px;margin:0 auto}
.tid-stage{position:absolute;top:0;left:0;transform-origin:top left;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,sans-serif;color:#11131c;-webkit-font-smoothing:antialiased}
.tid-app{display:flex;width:100%;height:100%;border-radius:26px;overflow:hidden;background:#f4f4f6;box-shadow:0 0 0 1px rgba(15,17,25,.07),0 40px 100px -30px rgba(15,17,25,.35);transition:opacity .45s ease}
.tid-app.fade{opacity:.15}
.tid-app>div{min-width:0}
.tid-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;flex-shrink:0;letter-spacing:.02em}
.tid-rail{width:76px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0}
.tid-logo{width:46px;height:46px;border-radius:14px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.tid-ri{display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;padding:8px 0 7px;border-radius:14px;color:#6b7280}
.tid-ri small{font-size:10.5px;font-weight:500}
.tid-ri.on{background:#fff;color:#ff6a4d;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.tid-ri.on small{color:#11131c;font-weight:600}
.tid-grow{flex:1}
.tid-me{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
.tid-me.sm{width:30px;height:30px;font-size:11px}
.tid-me.xs{width:22px;height:22px;font-size:9px}
.tid-folders{width:206px;flex-shrink:0;margin:10px 0 10px;padding:16px 10px;border-radius:20px 0 0 20px;background:#fff;border-right:1px solid #f0f0f3}
.tid-h{display:flex;align-items:center;justify-content:space-between;padding:2px 8px 12px}
.tid-h b{font-size:19px;font-weight:700;letter-spacing:-.01em}
.tid-hi{display:inline-flex;gap:12px;color:#6b7280}
.tid-f{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:10px;font-size:13.5px;color:#27272a}
.tid-f svg{color:#6b7280;flex-shrink:0}
.tid-f span{flex:1}
.tid-f em{font-style:normal;font-size:12px;color:#8e8e93;animation:tidPop .4s cubic-bezier(.2,.9,.3,1.3) both}
.tid-f.on{background:#f4f4f6;font-weight:600}
.tid-f-ai{display:inline-flex;flex:0 0 auto!important}
.tid-dot{flex:0 0 auto!important;width:10px;height:10px;border-radius:3px;margin:0 3px}
.tid-sec{margin:14px 10px 4px;font-size:11.5px;font-weight:600;color:#9ca3af}
.tid-list{width:308px;flex-shrink:0;margin:10px 0;padding:16px 8px;background:#fff;border-right:1px solid #f0f0f3;overflow:hidden}
.compact .tid-list{width:262px;margin:0;border-radius:0}
.tid-pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;box-shadow:0 0 0 1px #e5e7eb;font-size:12.5px;font-weight:600}
.tid-row{display:flex;gap:11px;padding:11px 10px;border-radius:14px;position:relative;transition:background .3s}
.tid-row.sel{background:#fff4f1}
.tid-row.sel::before{content:"";position:absolute;left:-8px;top:12px;bottom:12px;width:3px;border-radius:3px;background:#ff6a4d}
.tid-row.new{animation:tidIn .6s cubic-bezier(.22,1,.36,1) both}
@keyframes tidIn{from{max-height:0;opacity:0;padding-top:0;padding-bottom:0;transform:translateY(-8px)}to{max-height:100px;opacity:1}}
.tid-avw{position:relative;flex-shrink:0;height:40px}
.tid-badge{position:absolute;right:-3px;bottom:-3px;display:inline-flex}
.tid-rb{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.tid-rt{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.tid-rt b{font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tid-rt small{font-size:11.5px;color:#8e8e93;flex-shrink:0}
.tid-rs{display:flex;align-items:center;gap:8px}
.tid-rs>span:first-child{flex:1;min-width:0;font-size:12.5px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:tidFade .5s ease both}
.tid-st{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;animation:tidPop .45s cubic-bezier(.2,.9,.3,1.3) both}
.tid-st.done{background:#22c55e}.tid-st.handed{background:#ef4444}.tid-st.waiting{background:#f59e0b}
.tid-st.typing{width:30px;border-radius:999px;gap:2px}
.tid-st.typing i,.tid-dots i{width:3.5px;height:3.5px;border-radius:50%;background:#fff;animation:tidBounce 1s infinite}
.tid-st.typing i:nth-child(2),.tid-dots i:nth-child(2){animation-delay:.15s}
.tid-st.typing i:nth-child(3),.tid-dots i:nth-child(3){animation-delay:.3s}
@keyframes tidBounce{0%,60%,100%{transform:none;opacity:.6}30%{transform:translateY(-3px);opacity:1}}
.tid-st-ai{display:inline-flex;flex-shrink:0}
.tid-tagline{display:flex;animation:tidIn .5s cubic-bezier(.22,1,.36,1) both}
.tid-tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 9px;border-radius:999px;background:#ecfdf3;color:#067647;font-size:11px;font-weight:700;animation:tidPop .45s cubic-bezier(.2,.9,.3,1.3) both}
.tid-tag::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.tid-thread{flex:1;display:flex;flex-direction:column;margin:10px 10px 10px 0;border-radius:0 20px 20px 0;background:#fff;overflow:hidden}
.compact .tid-thread{margin:0;border-radius:0}
.tid-th{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid #f0f0f3;animation:tidFade .4s ease both}
.tid-thn{display:flex;flex-direction:column;flex:1;min-width:0}
.tid-thn b{font-size:14.5px;font-weight:650}
.tid-thn small{font-size:11.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tid-state{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:#fff7ed;color:#c2410c;font-size:12.5px;font-weight:650;animation:tidPop .45s cubic-bezier(.2,.9,.3,1.3) both}
.tid-state.ok{background:#ecfdf3;color:#067647}
.tid-thi{display:inline-flex;gap:14px;color:#6b7280}
.compact .tid-thi{display:none}
.tid-topic{margin:10px 18px 0;padding:7px 12px;border-radius:10px;background:#f6f6f8;font-size:12px;font-weight:600;color:#52525b;animation:tidFade .4s ease both}
.tid-msgs{flex:1;display:flex;flex-direction:column;gap:14px;padding:16px 22px;overflow:hidden;animation:tidFade .45s ease both}
.tid-day{align-self:center;padding:3px 10px;border-radius:999px;background:#f4f4f6;font-size:11px;color:#6b7280;font-weight:600}
.tid-m{display:flex;align-items:flex-end;gap:10px;max-width:86%}
.tid-m p{margin:0;padding:11px 15px;border-radius:18px;font-size:13.5px;line-height:1.45}
.tid-m small{display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:10.5px;color:#9ca3af}
.tid-m>span:not(.tid-me):not(.tid-m-ai){display:flex;flex-direction:column}
.tid-m.them p{background:#f4f4f6;border-bottom-left-radius:6px}
.tid-m.us{align-self:flex-end}
.tid-m.us>span:first-child{align-items:flex-end}
.tid-m.us p{background:#fff1ec;border-bottom-right-radius:6px}
.tid-m.us small svg{color:#ff6a4d}
.tid-m.fresh{animation:tidUp .5s cubic-bezier(.22,1,.36,1) both}
@keyframes tidUp{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.tid-m-ai{display:inline-flex;flex-shrink:0}
.tid-composer{margin:0 14px 14px;padding:10px 12px 10px;border-radius:18px;box-shadow:0 0 0 1px #e8e8ec,0 4px 14px -6px rgba(0,0,0,.08)}
.tid-ctabs{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#6b7280}
.tid-ctabs span{padding:5px 10px;border-radius:9px}
.tid-ctabs span.on{background:#f4f4f6;color:#11131c}
.tid-ctabs em{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-style:normal;color:#52525b}
.tid-ctabs em svg{color:#f59e0b}
.tid-cbody{min-height:38px;padding:10px 4px 6px;font-size:13.5px;line-height:1.45}
.tid-ph{color:#a1a1aa}
.tid-caret{display:inline-block;width:1.5px;height:16px;margin-left:1px;vertical-align:-3px;background:#11131c;animation:tidBlink 1s steps(1) infinite}
@keyframes tidBlink{50%{opacity:0}}
.tid-cfoot{display:flex;align-items:center;justify-content:space-between}
.tid-tools{display:inline-flex;align-items:center;gap:12px;color:#6b7280}
.tid-ai{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff}
.tid-send{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:999px;background:#11131c;color:#fff;font-size:12.5px;font-weight:650}
.tid-details{width:262px;flex-shrink:0;margin:10px 10px 10px 0;padding:14px 12px;border-radius:20px;background:#fff;overflow:hidden}
.tid-dtabs{display:flex;gap:16px;padding:0 6px 10px;border-bottom:1px solid #f0f0f3;font-size:13px;font-weight:600;color:#9ca3af}
.tid-dtabs span.on{color:#11131c;box-shadow:0 12px 0 -10px #ff6a4d}
.tid-who{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 0 12px;animation:tidFade .45s ease both}
.tid-who b{margin-top:6px;font-size:15px;font-weight:700}
.tid-who small{font-size:11.5px;color:#8e8e93}
.tid-card{margin-top:8px;padding:10px 12px;border-radius:14px;background:#fafafa}
.tid-card h5{margin:0 0 6px;font-size:11.5px;font-weight:600;color:#8e8e93}
.tid-cr{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;color:#27272a;animation:tidFade .4s ease both}
.tid-cr svg{color:#9ca3af}
.tid-dash{width:16px;height:16px;border-radius:50%;border:1.5px dashed #c4c4cc}
.tid-cxh{display:flex;justify-content:space-between;font-size:12.5px}
.tid-cxh span{color:#8e8e93}
.tid-bar{position:relative;height:8px;margin-top:6px;border-radius:999px;background:linear-gradient(90deg,#f43f5e,#f59e0b 45%,#22c55e);overflow:hidden}
.tid-bar i{position:absolute;top:0;right:0;bottom:0;background:#ececf0;transition:left .9s cubic-bezier(.22,1,.36,1)}
.tid-note{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:10px 0 0;font-size:12px;color:#3f3f46}
.tid-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#ecfdf3;color:#067647;font-size:10.5px;font-weight:700}
.tid-tags{display:flex;flex-wrap:wrap;gap:6px;font-size:12px}
.tid-cur{position:absolute;top:0;left:0;z-index:5;pointer-events:none;transition:transform 1s cubic-bezier(.6,0,.25,1);will-change:transform}
.tid-arrow{position:absolute;left:-3px;top:-3px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}
.tid-arrow path{fill:var(--c);stroke:#fff;stroke-width:1.6;stroke-linejoin:round}
.tid-name{position:absolute;left:14px;top:18px;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px 0 3px;border-radius:999px;background:var(--c);color:#fff;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 6px 16px -4px color-mix(in srgb,var(--c) 60%,transparent)}
.tid-ini{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.25);font-size:9.5px}
.tid-dots{display:inline-flex;gap:2px;margin-left:2px}
.tid-ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid var(--c);opacity:0}
.tid-cur.clk .tid-ring{animation:tidClick .55s ease-out}
@keyframes tidClick{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}
@keyframes tidPop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes tidFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.tid *{animation:none!important;transition:none!important}}
`
