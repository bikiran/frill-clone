'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import AiBuddy from '@/components/AiBuddy'

// "Support that fits your industry" (Sellio-style): a big photo card for one
// industry with its neighbours peeking either side. Over the photo a customer
// asks something typical for that trade, Colvy AI types, then answers. Three
// things Colvy does for that industry sit underneath. It moves on by itself
// while on screen (not while hovered), and the arrows, the side cards or a
// swipe change it by hand. With reduced motion it doesn't advance and the
// chat shows straight away. Made-up conversations.

type Industry = {
  key: string; title: string; line: string; href: string; accent: string; icon: string
  ask: string; reply: string; chips: [string, string][]
}

const I: Record<string, string> = {
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  bed: 'M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  layers: 'm12 2 10 5-10 5L2 7l10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  home: 'm3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z M3.2 12H9l1.5-3 3 6 1.5-3h5.8',
  box: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7 12 12l8.7-5 M12 22V12',
  cart: 'M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M2 2h3l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  cal: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  sms: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  star: 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
}

const INDUSTRIES: Industry[] = [
  { key: 'ecommerce', title: 'Ecommerce', line: 'Order questions answered from live WooCommerce data, on chat, Instagram, SMS and email.', href: '/for/ecommerce', accent: '#f97316', icon: I.bag,
    ask: 'Where is my order? It was meant to be here yesterday.', reply: 'Order #4821 left the warehouse this morning and arrives today. Tracking link is on its way by SMS.',
    chips: [[I.box, 'AI answers order questions'], [I.cart, 'Abandoned carts followed up'], [I.chat, 'Instagram and SMS too']] },
  { key: 'hospitality', title: 'Hospitality', line: 'Bookings, guest questions and reviews in one thread for every guest.', href: '/industries/hospitality', accent: '#10b981', icon: I.bed,
    ask: 'Can we check in early on Friday? Our flight lands at 9.', reply: 'Early check-in from 11am is free on Friday. I’ve noted it for the front desk, see you then!',
    chips: [[I.cal, 'Bookings from the chat'], [I.sms, 'SMS reminders'], [I.star, 'Reviews asked after the stay']] },
  { key: 'saas', title: 'SaaS & tech', line: 'Support, feedback and the roadmap together, so nothing a customer says gets lost.', href: '/industries/saas', accent: '#2b6bff', icon: I.zap,
    ask: 'How do I connect my own domain?', reply: 'Add a CNAME record pointing to your workspace, then press Verify in Settings. Here’s the 2-minute guide.',
    chips: [[I.book, 'Answers from your Help Centre'], [I.flag, 'Feedback goes to the roadmap'], [I.user, 'Sent to the right person']] },
  { key: 'agencies', title: 'Agencies', line: 'A workspace for every client, with requests that become tasks for your team.', href: '/industries/agencies', accent: '#8b5cf6', icon: I.layers,
    ask: 'Can you put the new promo banner live this week?', reply: 'Yes! I’ve made it a task for the web team and Kai will confirm the go-live date today.',
    chips: [[I.layers, 'A workspace per client'], [I.check, 'Requests become tasks'], [I.inbox, 'One inbox for every client']] },
  { key: 'real-estate', title: 'Real estate', line: 'Every enquiry answered and every inspection booked, even after hours.', href: '/for/real-estate', accent: '#0891b2', icon: I.home,
    ask: 'Is 14 Ocean St still available? Can I see it?', reply: 'It is! Open inspections are Saturday at 10:00 and 11:30. Shall I book you in for one?',
    chips: [[I.chat, 'Every enquiry answered'], [I.cal, 'Inspections booked in the chat'], [I.phone, 'Missed calls texted back']] },
  { key: 'healthcare', title: 'Healthcare', line: 'Online booking, reminders and patient messages, handled with care.', href: '/industries/healthcare', accent: '#ec4899', icon: I.heart,
    ask: 'Can I move my appointment to Thursday?', reply: 'Done. You’re now booked for Thursday at 2:30pm. We’ll text you a reminder the day before.',
    chips: [[I.cal, 'Online booking'], [I.sms, 'Reminders by SMS'], [I.inbox, 'Every patient message in one place']] },
]
const N = INDUSTRIES.length
const STEP_MS = 7000

const Ic = ({ d, s = 18, w = 2 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const Chev = ({ left }: { left?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={left ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg>
)

// Where each card sits relative to the open one.
const slot = (i: number, at: number) => {
  const r = (i - at + N) % N
  return r === 0 ? 'mid' : r === 1 ? 'next' : r === N - 1 ? 'prev' : r <= N / 2 ? 'off-r' : 'off-l'
}

export default function IndustryCarousel({ dark = false, text, muted }: { dark?: boolean; text: string; muted: string }) {
  const [at, setAt] = useState(0)
  // How far the open card's chat has got: 1 question, 2 typing, 3 answer.
  const [chat, setChat] = useState({ at: 0, stage: 0 })
  const [onScreen, setOnScreen] = useState(false)
  const [held, setHeld] = useState(false)
  const [still, setStill] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    on(); mq.addEventListener('change', on)
    const el = rootRef.current
    const io = el ? new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.35 }) : null
    if (el && io) io.observe(el)
    return () => { mq.removeEventListener('change', on); io?.disconnect() }
  }, [])

  // The little conversation on the open card, then on to the next industry.
  useEffect(() => {
    if (still || !onScreen) return
    const t = [650, 1700, 3000].map((ms, i) => setTimeout(() => setChat({ at, stage: i + 1 }), ms))
    return () => t.forEach(clearTimeout)
  }, [at, onScreen, still])

  useEffect(() => {
    if (still || !onScreen || held) return
    const t = setTimeout(() => setAt(a => (a + 1) % N), STEP_MS)
    return () => clearTimeout(t)
  }, [at, onScreen, held, still])

  const go = (d: number) => setAt(a => (a + d + N) % N)
  const cur = INDUSTRIES[at]
  const stage = still ? 3 : chat.at === at ? chat.stage : 0

  return (
    <section className={`ind${dark ? ' dark' : ''}`} style={{ color: text }}>
      <style>{IND_CSS}</style>
      <div className="ind-head">
        <h2>Support that fits your industry</h2>
        <p style={{ color: muted }}>Shops, hotels, software, agencies, agents and clinics: one shared inbox for every channel your customers already use.</p>
      </div>

      <div ref={rootRef} className="ind-track" role="region" aria-roledescription="carousel" aria-label="Colvy by industry"
        onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
        onPointerDown={e => { swipe.current = e.clientX }}
        onPointerUp={e => { const s = swipe.current; swipe.current = null; if (s != null && Math.abs(e.clientX - s) > 44) go(e.clientX < s ? 1 : -1) }}>
        {INDUSTRIES.map((x, i) => {
          const where = slot(i, at)
          const side = where === 'prev' || where === 'next'
          return (
            <div key={x.key} className={`ind-card ${where}`} style={{ ['--acc' as string]: x.accent }}
              aria-hidden={where !== 'mid'} aria-roledescription="slide" aria-label={`${x.title}, ${i + 1} of ${N}`}
              onClick={side ? () => go(where === 'next' ? 1 : -1) : undefined}>
              <Image src={`/industries/${x.key}.jpg`} alt="" fill sizes="(max-width: 760px) 92vw, 70vw" className="ind-photo" />
              <span className="ind-tint" />
              <span className="ind-shade" />
              <span className="ind-glyph"><Ic d={x.icon} s={22} /></span>

              {where === 'mid' && (
                <>
                  <div className="ind-chat" key={`chat-${at}`}>
                    {stage >= 1 && <div className="ind-ask">{x.ask}</div>}
                    {stage === 2 && <div className="ind-dots" aria-label="Colvy AI is typing"><i /><i /><i /></div>}
                    {stage >= 3 && (
                      <div className="ind-reply">
                        <p>{x.reply}</p>
                        <span><AiBuddy size={18} />Colvy AI</span>
                      </div>
                    )}
                  </div>
                  <div className="ind-cap" key={`cap-${at}`}>
                    <h3><Ic d={x.icon} s={24} />{x.title}</h3>
                    <p>{x.line}</p>
                    <a href={x.href}>Colvy for {x.title.toLowerCase()} <Chev /></a>
                  </div>
                </>
              )}
            </div>
          )
        })}
        <button type="button" className="ind-arrow l" onClick={() => go(-1)} aria-label="Previous industry"><Chev left /></button>
        <button type="button" className="ind-arrow r" onClick={() => go(1)} aria-label="Next industry"><Chev /></button>
      </div>

      <ul className="ind-chips" key={`chips-${at}`} style={{ ['--acc' as string]: cur.accent }} aria-live="polite">
        {cur.chips.map(([d, label], i) => (
          <li key={label} style={{ animationDelay: `${80 + i * 70}ms` }}><span><Ic d={d} s={15} /></span>{label}</li>
        ))}
      </ul>
      <div className="ind-dotnav" role="tablist" aria-label="Choose an industry">
        {INDUSTRIES.map((x, i) => (
          <button key={x.key} type="button" role="tab" aria-selected={i === at} aria-label={x.title} className={i === at ? 'on' : ''} onClick={() => setAt(i)} />
        ))}
      </div>
    </section>
  )
}

const IND_CSS = `
.ind{padding:clamp(56px,8vw,104px) 0 clamp(48px,7vw,88px);overflow:hidden}
.ind-head{max-width:980px;margin:0 auto clamp(30px,4vw,52px);padding:0 24px;text-align:center}
.ind-head h2{margin:0 0 14px;font-size:clamp(32px,5vw,56px);font-weight:900;letter-spacing:-.03em;line-height:1.04}
.ind-head p{max-width:640px;margin:0 auto;font-size:clamp(16px,1.7vw,19px);line-height:1.6}

.ind-track{--s:clamp(120px,15%,250px);--g:clamp(10px,1vw,16px);position:relative;width:calc(100% - 64px);max-width:1480px;aspect-ratio:2.3;min-height:440px;max-height:660px;margin:0 auto;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.ind-card{position:absolute;top:0;bottom:0;border-radius:24px;overflow:hidden;background:color-mix(in srgb,var(--acc) 40%,#111);isolation:isolate;transition:left .75s cubic-bezier(.65,0,.35,1),width .75s cubic-bezier(.65,0,.35,1),opacity .5s ease;will-change:left,width}
.ind-card.mid{left:calc(var(--s) + var(--g));width:calc(100% - 2 * var(--s) - 2 * var(--g));z-index:2}
.ind-card.prev{left:0;width:var(--s);cursor:pointer;z-index:1}
.ind-card.next{left:calc(100% - var(--s));width:var(--s);cursor:pointer;z-index:1}
.ind-card.off-l{left:calc(-1 * var(--s) - var(--g));width:var(--s);opacity:0;pointer-events:none}
.ind-card.off-r{left:calc(100% + var(--g));width:var(--s);opacity:0;pointer-events:none}
.ind-photo{object-fit:cover;transform:scale(1.04);transition:transform 1.2s cubic-bezier(.22,1,.36,1)}
.ind-card.mid .ind-photo{transform:scale(1)}
.ind-tint{position:absolute;inset:0;background:var(--acc);mix-blend-mode:color;opacity:.2;transition:opacity .6s ease}
.ind-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,color-mix(in srgb,var(--acc) 55%,#000 45%) 100%);opacity:.9;transition:opacity .6s ease}
.ind-card.prev .ind-tint,.ind-card.next .ind-tint{opacity:.55}
.ind-card.prev .ind-shade,.ind-card.next .ind-shade{background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 20%,transparent) 0%,color-mix(in srgb,var(--acc) 70%,#000 30%) 100%);opacity:1}
.ind-glyph{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);color:#fff;opacity:0;transition:opacity .4s ease;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))}
.ind-card.prev .ind-glyph,.ind-card.next .ind-glyph{opacity:1;transition-delay:.35s}

.ind-cap{position:absolute;left:clamp(20px,2.4vw,40px);bottom:clamp(20px,2.4vw,38px);max-width:min(480px,46%);color:#fff;animation:indUp .7s cubic-bezier(.22,1,.36,1) .35s both}
.ind-cap h3{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:clamp(22px,2.1vw,34px);font-weight:800;letter-spacing:-.02em}
.ind-cap p{margin:0 0 14px;font-size:clamp(14.5px,1.05vw,17px);line-height:1.5;color:rgba(255,255,255,.88)}
.ind-cap a{display:inline-flex;align-items:center;gap:4px;color:#fff;font-size:13.5px;font-weight:700;text-decoration:none;padding:7px 12px 7px 14px;border-radius:999px;background:rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);transition:background .2s ease}
.ind-cap a:hover{background:rgba(255,255,255,.28)}

.ind-chat{position:absolute;right:clamp(16px,2.4vw,40px);bottom:clamp(86px,8vw,140px);width:min(390px,42%);display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.ind-ask{max-width:100%;padding:11px 15px;border-radius:18px 18px 6px 18px;background:color-mix(in srgb,var(--acc) 30%,rgb(20 16 14 / .5));backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 8px 24px rgba(0,0,0,.14);color:#fff;font-size:clamp(14px,1vw,16px);font-weight:600;line-height:1.4;animation:indPop .5s cubic-bezier(.34,1.56,.64,1) both;transform-origin:100% 100%}
.ind-dots{align-self:flex-start;display:inline-flex;gap:4px;padding:12px 15px;border-radius:999px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.18);animation:indPop .4s cubic-bezier(.34,1.56,.64,1) both;transform-origin:0 100%}
.ind-dots i{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:indDot 1.1s ease-in-out infinite}
.ind-dots i:nth-child(2){animation-delay:.15s}.ind-dots i:nth-child(3){animation-delay:.3s}
.ind-reply{align-self:stretch;padding:13px 15px 11px;border-radius:18px 18px 18px 6px;background:#fff;color:#18181b;box-shadow:0 18px 44px rgba(0,0,0,.22);animation:indPop .55s cubic-bezier(.34,1.56,.64,1) both;transform-origin:0 100%}
.ind-reply p{margin:0 0 9px;font-size:clamp(14px,1vw,16px);line-height:1.45;font-weight:500}
.ind-reply span{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#71717a}

.ind-arrow{position:absolute;top:50%;z-index:3;width:38px;height:38px;margin-top:-19px;border-radius:50%;border:0;background:#fff;color:#18181b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18);transition:transform .2s ease}
.ind-arrow::before{display:none !important}
.ind-arrow:hover{transform:scale(1.08)}
.ind-arrow:focus-visible{outline:3px solid #ff6a4d;outline-offset:2px}
.ind-arrow.l{left:calc(var(--s) / 2 - 19px)}
.ind-arrow.r{right:calc(var(--s) / 2 - 19px)}

.ind-chips{list-style:none;display:flex;justify-content:center;flex-wrap:wrap;margin:clamp(22px,3vw,30px) auto 0;padding:0 24px;max-width:1480px;gap:0}
.ind-chips li{display:inline-flex;align-items:center;gap:11px;padding:6px clamp(18px,3vw,44px);font-size:clamp(14.5px,1vw,16px);font-weight:600;animation:indUp .55s cubic-bezier(.22,1,.36,1) both}
.ind-chips li+li{border-left:1px solid rgba(15,17,25,.1)}
.ind.dark .ind-chips li+li{border-left-color:rgba(255,255,255,.12)}
.ind-chips li>span{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,transparent);flex-shrink:0}

.ind-dotnav{display:none;justify-content:center;gap:6px;margin-top:18px}
.ind-dotnav button{width:7px;height:7px;padding:0;border:0;border-radius:999px;background:rgba(15,17,25,.18);cursor:pointer;transition:width .3s ease,background .3s ease}
.ind-dotnav button::before{display:none !important}
.ind-dotnav button.on{width:22px;background:#ff6a4d}
.ind.dark .ind-dotnav button{background:rgba(255,255,255,.2)}
.ind.dark .ind-dotnav button.on{background:#ff6a4d}

@keyframes indPop{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:none}}
@keyframes indUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes indDot{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}

@media (max-width:760px){
  .ind-track{--s:22px;--g:8px;width:calc(100% - 24px);aspect-ratio:auto;height:560px;max-height:none}
  .ind-card{border-radius:20px}
  .ind-arrow{display:none}
  .ind-glyph{display:none}
  .ind-cap{left:18px;right:18px;bottom:18px;max-width:none}
  .ind-cap p{font-size:13.5px}
  .ind-chat{left:18px;right:18px;width:auto;top:18px;bottom:auto}
  .ind-ask{max-width:88%}
  .ind-reply{align-self:flex-start;max-width:92%}
  .ind-chips{flex-direction:column;align-items:flex-start;gap:12px;width:max-content;max-width:calc(100% - 48px)}
  .ind-chips li{padding:0}
  .ind-chips li+li{border-left:0}
  .ind-dotnav{display:flex}
}
@media (prefers-reduced-motion:reduce){
  .ind-card,.ind-photo,.ind-tint,.ind-shade,.ind-glyph{transition:none}
  .ind-cap,.ind-ask,.ind-dots,.ind-reply,.ind-chips li{animation:none}
  .ind-dots i{animation:none}
}
`
