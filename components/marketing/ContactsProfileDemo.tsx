'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import ChannelGlyph, { type ChannelKey } from './ChannelGlyph'

// "Every customer, one profile. Every chat they ever had." (Sellio-style), in
// Colvy's own Contacts look: the contacts list with a profile floating beside
// it. A teammate's cursor clicks through customers and the profile turns to
// each one: their details, what they're worth, and every conversation they've
// had on every channel. Midway a first message makes a brand-new contact,
// which slides in at the top. Made-up demo data.
//
// Drawn at a fixed size and scaled to fit (the profile and a narrow list on
// phones). Runs only while on screen; sits still with reduced motion.

type Chat = { ch: ChannelKey; text: string; when: string; ai?: boolean }
type Person = {
  id: string; name: string; email: string; city: string; cc: string; last: string; av: string; ch: ChannelKey
  tags: [string, string][]; phone: string; company: string; status: string; ltv: string; orders: number; chats: Chat[]
}

const PEOPLE: Person[] = [
  { id: 'sam', name: 'Sam Rivera', email: 'sam@riverareef.com.au', city: 'Sydney', cc: 'au', last: 'Just now', av: '#ec4899', ch: 'instagram', tags: [['VIP', '#f59e0b'], ['Reef', '#06b6d4']], phone: '0412 555 018', company: 'Rivera Reef Co', status: 'Active', ltv: '$4,280', orders: 17,
    chats: [
      { ch: 'instagram', text: 'Do you still have the 4ft reef tank?', when: '2m' },
      { ch: 'sms', text: 'Order #4821 is out for delivery 🚚', when: '3d', ai: true },
      { ch: 'phone', text: 'Colvy AI answered a call · 1:42', when: '2w', ai: true },
      { ch: 'email', text: 'Re: Warranty on the chiller', when: '1mo' },
    ] },
  { id: 'priya', name: 'Priya Nair', email: 'priya@nairdesign.com.au', city: 'Geelong', cc: 'au', last: '2 minutes ago', av: '#8b5cf6', ch: 'sms', tags: [['Buyer', '#ff6a4d']], phone: '0466 077 557', company: 'Nair Design', status: 'Active', ltv: '$1,120', orders: 6,
    chats: [
      { ch: 'sms', text: 'Perfect, thank you!', when: '2m' },
      { ch: 'chat', text: 'Can I change the delivery address?', when: '2m', ai: true },
      { ch: 'email', text: 'Your booking is confirmed for Sat 10am', when: '1w' },
    ] },
  { id: 'tom', name: 'Tom Becker', email: 'tom.becker@gmail.com', city: 'Melbourne', cc: 'au', last: '3 hours ago', av: '#0ea5e9', ch: 'email', tags: [['Buyer', '#ff6a4d'], ['Wholesale', '#8b5cf6']], phone: '0400 112 908', company: 'Becker Pets', status: 'Active', ltv: '$9,640', orders: 42,
    chats: [
      { ch: 'email', text: 'Re: Wholesale order for March', when: '3h' },
      { ch: 'phone', text: 'Call with Kai · 6:15', when: '2d' },
      { ch: 'messenger', text: 'Thanks, picking up Saturday 👍', when: '1w' },
      { ch: 'sms', text: 'Your back-in-stock item is here', when: '3w', ai: true },
    ] },
  { id: 'wei', name: 'Wei Chen', email: 'wei@pinnacle.co.nz', city: 'Auckland', cc: 'nz', last: 'Yesterday', av: '#f59e0b', ch: 'messenger', tags: [['Trial', '#0ea5e9']], phone: '+64 21 555 0199', company: 'Pinnacle', status: 'Active', ltv: '$240', orders: 1, chats: [{ ch: 'messenger', text: 'Hi Wei! 20 plants comes to 15% off.', when: '1d', ai: true }] },
  { id: 'ana', name: 'Ana Lopez', email: 'ana.lopez@outlook.com', city: 'Brisbane', cc: 'au', last: '2 days ago', av: '#10b981', ch: 'phone', tags: [['Repeat', '#10b981']], phone: '0433 908 112', company: '', status: 'Active', ltv: '$860', orders: 5, chats: [] },
  { id: 'lena', name: 'Lena Fischer', email: 'lena@fischer.de', city: 'Berlin', cc: 'de', last: '4 days ago', av: '#ec4899', ch: 'email', tags: [], phone: '+49 30 2281 4470', company: '', status: 'Active', ltv: '$310', orders: 2, chats: [] },
  { id: 'omar', name: 'Omar Haddad', email: 'omar@haddad.ae', city: 'Dubai', cc: 'ae', last: 'Last week', av: '#f97316', ch: 'chat', tags: [['Buyer', '#ff6a4d']], phone: '', company: '', status: 'Active', ltv: '$520', orders: 3, chats: [] },
  { id: 'emma', name: 'Emma Wright', email: 'emma@wrightstudio.com', city: 'Perth', cc: 'au', last: '2 weeks ago', av: '#06b6d4', ch: 'email', tags: [['Buyer', '#ff6a4d'], ['Enterprise', '#8b5cf6']], phone: '', company: '', status: 'Active', ltv: '$2,050', orders: 9, chats: [] },
]
const JACK: Person = {
  id: 'jack', name: 'Jack Wu', email: 'jack.wu@gmail.com', city: 'Brisbane', cc: 'au', last: 'Just now', av: '#64748b', ch: 'instagram', tags: [['New', '#22c55e']], phone: '', company: '', status: 'New', ltv: '$0', orders: 0,
  chats: [{ ch: 'instagram', text: 'Hi! Do you deliver to Brisbane?', when: 'now' }, { ch: 'instagram', text: 'Yes, 2–3 days, free over $99 🙂', when: 'now', ai: true }],
}

const FULL = { w: 1200, h: 700 }
const COMPACT = { w: 660, h: 700 }

const P: Record<string, string> = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  building: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01 M9 17h.01 M15 17h.01',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  chev: 'M6 9l6 6 6-6',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
}
const Ic = ({ d, s = 16, w = 2 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const Av = ({ p, size }: { p: Person; size: number }) => (
  <span className="cpd-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `color-mix(in srgb, ${p.av} 16%, #fff)`, color: p.av }}>{initials(p.name)}</span>
)
const Flag = ({ cc }: { cc: string }) => <img className="cpd-flag" src={`https://flagcdn.com/w40/${cc}.png`} alt="" width={18} height={18} loading="lazy" />
const Tag = ({ t }: { t: [string, string] }) => <span className="cpd-tag" style={{ ['--tag' as string]: t[1] } as React.CSSProperties}>{t[0]}</span>

export default function ContactsProfileDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const curRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ k: 1, full: true })
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(0)
  const [people, setPeople] = useState<Person[]>(PEOPLE)
  const [sel, setSel] = useState('sam')
  const [hover, setHover] = useState<string | null>(null)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      const full = w >= 900
      setBox({ k: Math.min(1, w / (full ? FULL.w : COMPACT.w)), full })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const go = (spot: string, ox = 0.5, oy = 0.5) => {
    const stage = stageRef.current, c = curRef.current
    const el = stage?.querySelector<HTMLElement>(`[data-spot="${spot}"]`)
    if (!stage || !c || !el) return
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / stage.offsetWidth || 1
    c.style.transform = `translate(${((r.left - s.left + r.width * ox) / k).toFixed(1)}px, ${((r.top - s.top + r.height * oy) / k).toFixed(1)}px)`
  }
  const click = () => { const c = curRef.current; if (!c) return; c.classList.remove('clk'); void c.offsetWidth; c.classList.add('clk') }

  // The script: visit a few customers, then a new one arrives and is opened.
  useEffect(() => {
    if (!playing) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)) }
    const visit = (t: number, id: string) => {
      at(t, () => { go(`row-${id}`, 0.32, 0.55); setHover(id) })
      at(t + 1000, () => { click(); setSel(id); setHover(null) })
    }
    setPeople(PEOPLE); setSel('sam'); setHover(null); setFade(false)
    at(60, () => go('row-sam', 0.6, 0.9))
    visit(700, 'priya')
    visit(4200, 'tom')
    at(7600, () => setPeople(ps => [JACK, ...ps]))
    visit(8600, 'jack')
    at(12000, () => go('card-chats', 0.5, 0.35))
    visit(14000, 'sam')
    at(17400, () => setFade(true))
    at(17900, () => setLoop(n => n + 1))
    return () => timers.forEach(clearTimeout)
  }, [playing, loop, box.full])

  const D = box.full ? FULL : COMPACT
  const p = people.find(x => x.id === sel) || PEOPLE[0]

  return (
    <div ref={wrapRef} className="cpd" style={{ height: Math.round(D.h * box.k) }} role="img" aria-label="Colvy's contacts list with a customer's profile: their details, value and every conversation on every channel">
      <style>{CPD_CSS}</style>
      <div ref={stageRef} className={`cpd-stage${box.full ? '' : ' compact'}${fade ? ' fade' : ''}`} style={{ width: D.w, height: D.h, transform: `scale(${box.k})` }} aria-hidden="true">
        {/* The contacts list */}
        <div className="cpd-list">
          <div className="cpd-tr cpd-th">
            {box.full && <span className="cpd-cb" />}
            <span><Ic d={P.user} s={15} />Full name</span>
            {box.full && <span><Ic d={P.mail} s={15} />Email</span>}
            {box.full && <span><Ic d={P.pin} s={15} />Location</span>}
            <span><Ic d={P.clock} s={15} />Last activity</span>
            {box.full && <span><Ic d={P.tag} s={15} />Segments</span>}
          </div>
          <div className="cpd-rows">
            {people.map(x => (
              <div key={x.id} data-spot={`row-${x.id}`} className={`cpd-tr cpd-row${x.id === sel ? ' sel' : ''}${x.id === hover ? ' hov' : ''}${x.id === 'jack' ? ' new' : ''}`}>
                {box.full && <span className="cpd-cb" />}
                <span className="cpd-name"><span className="cpd-avw"><Av p={x} size={34} /><span className="cpd-badge"><ChannelGlyph ch={x.ch} badge size={15} ring="#fff" /></span></span><b>{x.name}</b></span>
                {box.full && <span className="cpd-muted">{x.email}</span>}
                {box.full && <span className="cpd-loc"><Flag cc={x.cc} />{x.city}</span>}
                <span className="cpd-muted">{x.last}</span>
                {box.full && <span className="cpd-tags">{x.tags.length ? x.tags.map(t => <Tag key={t[0]} t={t} />) : <span className="cpd-dash">–</span>}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* The profile */}
        <div className="cpd-card">
          <div className="cpd-in" key={p.id}>
            <div className="cpd-who">
              <span className="cpd-avw lg"><Av p={p} size={74} /><i className="cpd-on" /><span className="cpd-badge lg"><ChannelGlyph ch={p.ch} badge size={22} ring="#fff" /></span></span>
              <b>{p.name}</b>
              <small>Last active {p.last.toLowerCase()}</small>
            </div>
            <div className="cpd-stats">
              <span><small>Lifetime</small><b>{p.ltv}</b></span>
              <span><small>Orders</small><b>{p.orders}</b></span>
              <span><small>Conversations</small><b>{p.chats.length || 1}</b></span>
            </div>
            <div className="cpd-sec">
              <div className="cpd-sech">Contact details<Ic d={P.chev} s={15} /></div>
              <div className="cpd-body">
                {([
                  [P.mail, 'Email', p.email],
                  [P.phone, 'Phone', p.phone || '–'],
                  [P.pin, 'City', <span key="c" className="cpd-loc"><Flag cc={p.cc} />{p.city}</span>],
                  [P.building, 'Company', p.company ? <span key="co" className="cpd-co"><span className="cpd-co-l" style={{ background: p.av }}>{p.company[0]}</span>{p.company}</span> : '–'],
                  [P.tag, 'Segments', p.tags.length ? <span key="t" className="cpd-tags">{p.tags.map(t => <Tag key={t[0]} t={t} />)}</span> : '–'],
                  [P.check, 'Status', p.status],
                ] as [string, string, React.ReactNode][]).map(([d, l, v], i) => (
                  <div key={l} className="cpd-kv" style={{ animationDelay: `${120 + i * 55}ms` }}><span><Ic d={d} s={15} />{l}</span><em>{v}</em></div>
                ))}
              </div>
            </div>
            <div className="cpd-sec" data-spot="card-chats">
              <div className="cpd-sech">Every conversation<span className="cpd-n">{p.chats.length}</span></div>
              <div className="cpd-body cpd-chats">
                {p.chats.length ? p.chats.map((c, i) => (
                  <div key={i} className="cpd-chat" style={{ animationDelay: `${420 + i * 90}ms` }}>
                    <ChannelGlyph ch={c.ch} badge size={22} />
                    <span>{c.text}</span>
                    {c.ai && <span className="cpd-ai" title="Colvy AI"><AiBuddy size={16} /></span>}
                    <small>{c.when}</small>
                  </div>
                )) : <div className="cpd-chat" style={{ animationDelay: '420ms' }}><span className="cpd-muted">Earlier chats, calls and emails show here.</span></div>}
              </div>
            </div>
          </div>
        </div>

        <div ref={curRef} className="cpd-cur">
          <span className="cpd-ring" />
          <svg className="cpd-arrow" width="22" height="22" viewBox="0 0 24 24"><path d="M3.5 2.5 20 9.6l-7.3 2.6-2.7 7.3z" /></svg>
          <span className="cpd-nm"><span>KO</span>Kai</span>
        </div>
      </div>
    </div>
  )
}

const CPD_CSS = `
.cpd{position:relative;width:100%;max-width:${FULL.w}px;margin:0 auto}
.cpd-stage{position:absolute;top:0;left:0;transform-origin:top left;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;transition:opacity .45s ease}
.cpd-stage.fade{opacity:.15}
.cpd-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;letter-spacing:.02em;flex-shrink:0}
.cpd-avw{position:relative;display:inline-flex;flex-shrink:0}
.cpd-badge{position:absolute;right:-3px;bottom:-3px;display:inline-flex}
.cpd-badge.lg{right:-2px;bottom:-2px}
.cpd-flag{width:18px;height:18px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08);flex-shrink:0}
.cpd-tag{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px 0 9px;border-radius:999px;background:color-mix(in srgb,var(--tag) 11%,#fff);color:color-mix(in srgb,var(--tag) 85%,#000);font-size:12px;font-weight:600;white-space:nowrap}
.cpd-tag::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--tag)}
.cpd-muted{color:#71717a}
.cpd-dash{color:#c4c4cc}

.cpd-list{position:absolute;left:0;top:44px;width:860px;bottom:0;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 62%,transparent);mask-image:linear-gradient(180deg,#000 62%,transparent)}
.compact .cpd-list{width:300px;top:24px}
.cpd-tr{display:grid;grid-template-columns:40px 190px 214px 130px 116px 1fr;align-items:center;padding:0 16px}
.compact .cpd-tr{grid-template-columns:1fr 104px;padding:0 14px}
.cpd-th{height:50px;background:#fafafa;border-bottom:1px solid #f0f0f2;font-size:12.5px;font-weight:500;color:#8e8e93}
.cpd-th span{display:inline-flex;align-items:center;gap:8px}
.cpd-th svg{color:#a1a1aa}
.cpd-cb{width:16px;height:16px;border-radius:5px;box-shadow:inset 0 0 0 1.5px #d4d4d8}
.cpd-row{height:60px;border-bottom:1px solid #f4f4f5;font-size:13.5px;position:relative;transition:background .25s ease}
.cpd-row>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpd-row.hov{background:#fafafa}
.cpd-row.sel{background:color-mix(in srgb,#ff6a4d 8%,transparent)}
.cpd-row.sel::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:#ff6a4d}
.cpd-row.new{animation:cpdNew .7s cubic-bezier(.22,1,.36,1) both}
@keyframes cpdNew{from{height:0;opacity:0;transform:translateY(-10px)}to{height:60px;opacity:1}}
.cpd-name{display:inline-flex;align-items:center;gap:11px}
.cpd-name b{font-weight:600;overflow:hidden;text-overflow:ellipsis}
.cpd-loc{display:inline-flex;align-items:center;gap:8px}
.cpd-tags{display:inline-flex;gap:6px;flex-wrap:nowrap}

.cpd-card{position:absolute;right:0;top:0;width:376px;bottom:6px;border-radius:26px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 24px 60px -20px rgba(16,24,40,.28);overflow:hidden}
.compact .cpd-card{width:342px}
.cpd-in{height:100%;padding:24px 14px 14px;box-sizing:border-box;display:flex;flex-direction:column;animation:cpdSwap .5s cubic-bezier(.22,1,.36,1) both}
@keyframes cpdSwap{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.cpd-who{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}
.cpd-who b{margin-top:10px;font-size:20px;font-weight:700;letter-spacing:-.01em}
.cpd-who small{font-size:13.5px;color:#71717a}
.cpd-on{position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2.5px #fff}
.cpd-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:16px 0 10px}
.cpd-stats span{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px;border-radius:14px;background:#fafafa}
.cpd-stats small{font-size:11px;color:#8e8e93}
.cpd-stats b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.cpd-sec{margin-top:8px;border-radius:16px;background:#f4f4f5;padding:3px}
.cpd-sech{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 8px 11px;font-size:13px;font-weight:600;color:#52525b}
.cpd-sech svg{color:#a1a1aa}
.cpd-n{min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:#fff;font-size:11.5px;display:inline-flex;align-items:center;justify-content:center;color:#18181b}
.cpd-body{border-radius:13px;background:#fff;padding:4px 12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.cpd-kv{display:flex;align-items:center;justify-content:space-between;gap:10px;height:32px;font-size:13px;animation:cpdRow .45s cubic-bezier(.22,1,.36,1) both}
.cpd-kv>span{display:inline-flex;align-items:center;gap:9px;color:#71717a;flex-shrink:0}
.cpd-kv>span svg{color:#a1a1aa}
.cpd-kv em{font-style:normal;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-flex;justify-content:flex-end}
@keyframes cpdRow{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.cpd-co{display:inline-flex;align-items:center;gap:7px;padding:2px 9px 2px 3px;border-radius:999px;background:#f4f4f5}
.cpd-co-l{width:18px;height:18px;border-radius:6px;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.cpd-chats{padding:6px 8px}
.cpd-chat{display:flex;align-items:center;gap:10px;height:38px;font-size:12.5px;animation:cpdRow .45s cubic-bezier(.22,1,.36,1) both}
.cpd-chat>span:nth-child(2){flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpd-chat small{font-size:11px;color:#a1a1aa;flex-shrink:0}
.cpd-ai{display:inline-flex;flex-shrink:0}

.cpd-cur{position:absolute;top:0;left:0;z-index:5;pointer-events:none;transition:transform .95s cubic-bezier(.6,0,.25,1);will-change:transform}
.cpd-arrow{position:absolute;left:-3px;top:-3px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}
.cpd-arrow path{fill:#2b6bff;stroke:#fff;stroke-width:1.6;stroke-linejoin:round}
.cpd-nm{position:absolute;left:14px;top:18px;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px 0 3px;border-radius:999px;background:#2b6bff;color:#fff;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 6px 16px -4px rgba(43,107,255,.6)}
.cpd-nm span{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.25);font-size:9.5px}
.cpd-ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid #2b6bff;opacity:0}
.cpd-cur.clk .cpd-ring{animation:cpdClick .55s ease-out}
@keyframes cpdClick{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}
@media (prefers-reduced-motion: reduce){.cpd *{animation:none!important;transition:none!important}}
`
