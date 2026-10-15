'use client'

import { useEffect, useState } from 'react'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import ScrollStory, { Msg, CHIP } from '@/components/ScrollStory'
import type { Stage } from '@/components/ScrollStory'
import { ActionCard, ChatCard, ListCard, NoteCard, StatusCard, Ico } from '@/components/story/StoryCards'
import { useShell, Reveal, Arrow, SectionHead, Faq, CtaBand, FONT } from '@/components/marketing/Kit'
import { BUSINESS_NUMBER_FAQS } from '@/lib/business-number-faqs'

// "Get a business phone number online in Australia". Everything here is what
// Colvy's number product does today: local 02/03/07/08 or 04 mobile numbers,
// bought online for $15 a month, calls and SMS in the shared inbox, browser and
// mobile app calling, recordings with AI summaries. Example numbers use the
// ranges ACMA sets aside for fiction (5550 xxxx and 0491 570 xxx).

const GREEN = '#00a876'

const CITIES: { label: string; code: string; numbers: string[] }[] = [
  { label: 'Melbourne', code: '03', numbers: ['(03) 5550 2184', '(03) 5550 7731', '(03) 5550 4402'] },
  { label: 'Sydney', code: '02', numbers: ['(02) 5550 3317', '(02) 5550 9025', '(02) 5550 1148'] },
  { label: 'Brisbane', code: '07', numbers: ['(07) 5550 6610', '(07) 5550 2273', '(07) 5550 8849'] },
  { label: 'Perth', code: '08', numbers: ['(08) 5550 1902', '(08) 5550 7764', '(08) 5550 3315'] },
  { label: 'Mobile', code: '04', numbers: ['0491 570 156', '0491 570 159', '0491 570 313'] },
]

// The number picker in the hero: it steps through cities, picks a number and
// shows it going live, on a loop. Still frame with reduced motion.
function NumberPicker({ dark }: { dark: boolean }) {
  const [city, setCity] = useState(0)
  const [phase, setPhase] = useState(0)   // 0 list, 1 picked, 2 live
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPhase(2); return }
    const id = setInterval(() => {
      setPhase(p => {
        if (p < 2) return p + 1
        setCity(c => (c + 1) % CITIES.length)
        return 0
      })
    }, 1500)
    return () => clearInterval(id)
  }, [])
  const c = CITIES[city]
  const panel = dark ? '#12131d' : '#fff'
  const line = dark ? 'rgba(255,255,255,0.08)' : '#eef0f3'
  const ink = dark ? '#f4f5fb' : '#11131c'
  const quiet = dark ? 'rgba(244,245,251,0.6)' : '#6b7280'
  return (
    <div style={{ width: '100%', maxWidth: 440, borderRadius: 24, background: panel, border: `1px solid ${line}`, boxShadow: '0 40px 90px -30px rgba(0,80,60,0.45)', overflow: 'hidden', color: ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: `1px solid ${line}` }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: GREEN + '1c', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico name="phone" /></span>
        <div><div style={{ fontWeight: 900, fontSize: 15 }}>Get a business number</div><div style={{ fontSize: 12, color: quiet }}>Calls & SMS · $15/month</div></div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '14px 18px 4px', flexWrap: 'wrap' }}>
        {CITIES.map((x, i) => (
          <span key={x.label} style={{ fontSize: 12, fontWeight: 800, padding: '6px 10px', borderRadius: 999, transition: 'all .35s cubic-bezier(.16,1,.3,1)', background: i === city ? GREEN : 'transparent', color: i === city ? '#fff' : quiet, border: `1.5px solid ${i === city ? GREEN : line}` }}>{x.label} {x.code}</span>
        ))}
      </div>
      <div style={{ padding: '10px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.numbers.map((n, i) => {
          const picked = i === 0 && phase >= 1
          return (
            <div key={c.label + n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${picked ? GREEN : line}`, background: picked ? GREEN + '12' : 'transparent', transition: 'all .35s cubic-bezier(.16,1,.3,1)', animation: `bnIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.07}s both` }}>
              <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}>{n}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: picked ? GREEN : quiet }}>{picked ? 'Selected ✓' : 'Choose'}</span>
            </div>
          )
        })}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: phase === 2 ? GREEN : (dark ? 'rgba(255,255,255,0.04)' : '#f6f7f9'), color: phase === 2 ? '#fff' : quiet, transition: 'all .45s cubic-bezier(.16,1,.3,1)' }}>
          <Ico name="check" />
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>{phase === 2 ? `${c.numbers[0]} is ready for calls and texts` : 'Pick a number to continue'}</span>
        </div>
      </div>
    </div>
  )
}

const STAGES: Stage[] = [
  {
    key: 'pick', eyebrow: 'Online in minutes', title: 'Pick a number for your city.',
    body: 'A local 02, 03, 07 or 08 landline, or an 04 mobile. Choose it in Colvy, pay online and fill in one short form.',
    bg: '#047857', ink: '#d1fae5',
    poses: { numbers: { x: -10, y: -40 }, form: { x: 80, y: 160, r: 3 } },
  },
  {
    key: 'ring', eyebrow: 'Answer anywhere', title: 'It rings in your browser and on your phone.',
    body: 'Calls ring the right person first, then the rest of the team, on the web and in the Colvy app for iPhone and Android.',
    bg: '#0f3d3e', ink: '#ccfbf1',
    poses: { numbers: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, incoming: { x: 20, y: -40 }, app: { x: -40, y: 150, r: -2 } },
  },
  {
    key: 'text', eyebrow: 'Calls and texts', title: 'Texts land in the same thread.',
    body: 'Customers can text the same number. Calls and SMS sit together in the shared inbox, next to the customer’s orders and history.',
    bg: '#1f2a6b', ink: '#cdd8ff',
    poses: { incoming: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, thread: { x: 10, y: -20 } },
  },
  {
    key: 'record', eyebrow: 'Every call kept', title: 'Recorded, transcribed, summarised.',
    body: 'Calls are recorded and transcribed, with a short AI summary on the conversation. Voicemails are transcribed too.',
    bg: '#4c1658', ink: '#f6cdfa',
    poses: { thread: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, summary: { x: 20, y: -40 }, voicemail: { x: -40, y: 150, r: -2 } },
  },
]
const CARDS = {
  numbers: <ListCard title="Your numbers" badge="2 numbers" rows={[{ name: 'Richmond store', sub: '(03) 5550 2184 · calls & SMS', tag: 'Local', tone: '#047857', hot: true }, { name: 'Sales mobile', sub: '0491 570 156 · calls & SMS', tag: 'Mobile', tone: '#0369a1' }]} width={320} />,
  form: <StatusCard title="Business details" badge="Submitted" badgeTone="#047857" sub="Business name, address and proof of address" strip="Checked before the number goes live" stripTone="#047857" width={290} />,
  incoming: <ActionCard icon="phone" tint="#047857" title="Incoming call · (03) 5550 2184" sub="Mia Chen · returning customer · 3 orders" left="Ringing Sam, then everyone" right="Answer" rightTone="#047857" width={300} />,
  app: <Msg ch="Phone" color={CHIP.Phone} who="Answered on iPhone" text="Tom picked up in the Colvy app · 3:12" time="now" />,
  thread: <ChatCard title="Mia Chen" sub="Calls & SMS · (03) 5550 2184" channel="SMS" lines={[{ from: 'them', text: 'Thanks for the call! Can you text me the address?' }, { from: 'us', text: '12 Swan St, Richmond. See you Saturday!' }]} chips={[{ text: 'Call · 3:12 earlier', tone: '#0369a1' }]} />,
  summary: <StatusCard title="Call summary" badge="AI" badgeTone="#7c3aed" sub="Mia Chen · 3:12 · recorded" strip="Wants a 4ft tank set up; coming in Saturday to pick filters." stripTone="#7c3aed" width={300} />,
  voicemail: <NoteCard label="Voicemail · transcribed" labelTone="#7c3aed" text="Hi, it’s Leo. Just checking if the order’s ready for pickup tomorrow, thanks." left="0:18 · after hours" right="Reply sent" />,
}
const ORDER = ['form', 'numbers', 'app', 'incoming', 'thread', 'voicemail', 'summary']

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: 'phone', title: 'Calls in the browser and app', body: 'Answer and make calls from Colvy on the web, or the iPhone and Android app. No desk phone needed.' },
  { icon: 'chat', title: 'SMS on the same number', body: 'Landline and mobile numbers both send and receive texts, straight into the shared inbox.' },
  { icon: 'user', title: 'Know who’s calling', body: 'Callers are matched to their customer record, so you see their name, orders and past chats as it rings.' },
  { icon: 'bell', title: 'Ring the right people', body: 'Each caller’s usual contact is tried first, then everyone available. Choose how long it rings before voicemail.' },
  { icon: 'form', title: 'Recordings and AI summaries', body: 'Calls are recorded and transcribed, with a short AI summary saved on the conversation.' },
  { icon: 'store', title: 'A number per location', body: 'Add a number for each store or team and assign it to that location. All answered from one inbox.' },
]

export default function BusinessNumberClient() {
  const t = useShell(GREEN)
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: FONT, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes bnIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes bnUp { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
        .bn-hero-copy > * { animation: bnUp .8s cubic-bezier(.16,1,.3,1) both }
        .bn-hero-copy > :nth-child(2) { animation-delay: .06s } .bn-hero-copy > :nth-child(3) { animation-delay: .12s } .bn-hero-copy > :nth-child(4) { animation-delay: .18s }
        .bn-card { transition: transform .25s cubic-bezier(.16,1,.3,1) } .bn-card:hover { transform: translateY(-5px) }
        @media (max-width: 900px) {
          .bn-hero { grid-template-columns: 1fr !important; padding-top: 104px !important }
          .bn-grid3 { grid-template-columns: 1fr !important } .bn-grid2 { grid-template-columns: 1fr !important }
          .bn-types th, .bn-types td { padding: 12px 10px !important; font-size: 13.5px !important }
        }
        @media (prefers-reduced-motion: reduce) { .bn-hero-copy > * { animation: none !important } }
      `}</style>
      <MarketingNav dark={t.dark} onToggleDark={t.toggleDark} />

      {/* HERO */}
      <section className="bn-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 44, alignItems: 'center', maxWidth: 1240, margin: '0 auto', padding: 'clamp(110px, 13vw, 150px) 24px 80px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: t.grid, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: GREEN, opacity: t.dark ? 0.16 : 0.12, filter: 'blur(90px)', right: '6%', top: '14%', pointerEvents: 'none' }} />
        <div className="bn-hero-copy" style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: GREEN + '16', color: GREEN, fontSize: 13, fontWeight: 800 }}>Australian business numbers</span>
          <h1 style={{ fontSize: 'clamp(40px, 5.8vw, 74px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.99, margin: '20px 0 22px' }}>Get a business phone number online, in minutes.</h1>
          <p style={{ fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.6, color: t.muted, maxWidth: 560, margin: '0 0 30px' }}>Choose a local 02, 03, 07 or 08 number or an 04 mobile, and answer calls and texts from your browser or phone, in the same inbox as the rest of your customers. <b style={{ color: t.text }}>$15 a month</b> per number.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={t.go} style={t.btnPrimary}>{t.user ? 'Get a number in Colvy' : 'Get your number'} <Arrow /></button>
            <a href="#how" style={t.btnGhost}>How it works</a>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', minWidth: 0, animation: 'bnUp .9s cubic-bezier(.16,1,.3,1) .2s both' }}>
          <NumberPicker dark={t.dark} />
        </div>
      </section>

      {/* NUMBER TYPES */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '30px 24px 40px' }}>
        <Reveal><SectionHead eyebrow="Number types" accent={GREEN} muted={t.muted} title="Local or mobile. Calls and texts on both." /></Reveal>
        <Reveal delay={0.05}>
          <div style={{ borderRadius: 22, border: `1px solid ${t.cardBorder}`, overflow: 'hidden', background: t.cardBg }}>
            <table className="bn-types" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead>
                <tr style={{ background: t.soft }}>
                  {['Number', 'Area', 'Calls & SMS', 'Price'].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.muted }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['02 landline', 'Sydney, Canberra and NSW', true, '$15/month'],
                  ['03 landline', 'Melbourne, Hobart, Victoria and Tasmania', true, '$15/month'],
                  ['07 landline', 'Brisbane, Gold Coast and Queensland', true, '$15/month'],
                  ['08 landline', 'Perth, Adelaide and Darwin', true, '$15/month'],
                  ['04 mobile', 'Anywhere in Australia', true, '$15/month'],
                  ['1300 / 1800', 'National numbers', false, 'Not available yet'],
                ].map(([n, a, ok, p]) => (
                  <tr key={n as string} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                    <td style={{ padding: '15px 18px', fontWeight: 900 }}>{n}</td>
                    <td style={{ padding: '15px 18px', color: t.muted }}>{a}</td>
                    <td style={{ padding: '15px 18px', color: ok ? GREEN : t.muted, fontWeight: 800 }}>{ok ? '✓ Yes' : '—'}</td>
                    <td style={{ padding: '15px 18px', fontWeight: 700, color: ok ? t.text : t.muted }}>{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ maxWidth: 1180, margin: '0 auto', padding: '70px 24px 50px' }}>
        <Reveal><SectionHead eyebrow="How it works" accent={GREEN} muted={t.muted} title="Three steps, all online." sub="No contracts, no technician visits and no hardware." /></Reveal>
        <div className="bn-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
          {[
            { n: 1, title: 'Pick your number', body: 'In Colvy, choose a city for a local landline or pick a mobile, then choose from the numbers available.' },
            { n: 2, title: 'Pay and add your details', body: 'Pay $15 a month by card. Australian rules need your business name, street address and proof of address, so we ask in one short form.' },
            { n: 3, title: 'Start calling and texting', body: 'Once your details are checked the number is connected. Calls and texts arrive in your shared inbox, browser and app.' },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 0.07}>
              <div className="bn-card" style={{ height: '100%', boxSizing: 'border-box', padding: '26px 24px', borderRadius: 22, background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: GREEN, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 17 }}>{s.n}</span>
                <h3 style={{ fontSize: 19, fontWeight: 900, margin: '16px 0 8px' }}>{s.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: 0 }}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* STORY */}
      <div>
        <ScrollStory stages={STAGES} cards={CARDS} order={ORDER} label="How a Colvy business number works" />
      </div>

      {/* FEATURES */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(70px, 9vw, 110px) 24px 40px' }}>
        <Reveal><SectionHead eyebrow="What you get" accent={GREEN} muted={t.muted} title="A phone system that knows your customers." sub="Because the number lives inside Colvy, every call and text sits next to the customer’s orders, bookings and past conversations." /></Reveal>
        <div className="bn-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <div className="bn-card" style={{ height: '100%', boxSizing: 'border-box', padding: '24px 22px', borderRadius: 20, background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ width: 42, height: 42, borderRadius: 13, background: GREEN + '1a', color: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ico name={f.icon} size={20} /></span>
                <h3 style={{ fontSize: 18, fontWeight: 900, margin: '14px 0 6px' }}>{f.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: 0 }}>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PRICING NOTE */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 30px' }}>
        <Reveal>
          <div className="bn-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: '28px 26px', borderRadius: 24, background: `linear-gradient(150deg, ${GREEN}, #0f3d3e)`, color: '#fff' }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>Each number</div>
              <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', margin: '6px 0 4px' }}>$15<span style={{ fontSize: 18, fontWeight: 700, opacity: 0.85 }}> AUD/month</span></div>
              <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.9, margin: 0 }}>Billed monthly. Cancel any time.</p>
            </div>
            <div style={{ padding: '28px 26px', borderRadius: 24, background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted }}>Calls and texts</div>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: '10px 0 14px' }}>Calling and SMS run on Colvy’s <b>Inbox</b> or <b>Everything</b> plan, with 3,000 SMS a month included. Call minutes are billed on usage.</p>
              <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: GREEN, textDecoration: 'none' }}>See plans and pricing <Arrow size={14} /></a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '70px 24px 40px' }}>
        <Reveal><SectionHead eyebrow="Questions" accent={GREEN} muted={t.muted} title="Business numbers, answered." /></Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BUSINESS_NUMBER_FAQS.map(f => <Faq key={f.q} q={f.q} a={f.a} accent={GREEN} text={t.text} muted={t.muted} cardBg={t.cardBg} cardBorder={t.cardBorder} />)}
        </div>
      </section>

      <CtaBand title="Get your business number today." sub="Sign up, pick a number and start answering calls and texts from one inbox." accent={GREEN} onGo={t.go} user={t.user} secondary={{ label: 'Explore Colvy Phones', href: '/phones' }} />
      <MarketingFooter dark={t.dark} />
    </div>
  )
}
