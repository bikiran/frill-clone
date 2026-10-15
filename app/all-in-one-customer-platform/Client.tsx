'use client'

import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import ColvyAppDemo from '@/components/ColvyAppDemo'
import ScrollStory, { Msg, CHIP } from '@/components/ScrollStory'
import type { Stage } from '@/components/ScrollStory'
import { ActionCard, ChatCard, NoteCard, ReviewCard, ReportCard, StatusCard, TrailCard, Ico } from '@/components/story/StoryCards'
import { useShell, useReveal, Reveal, Arrow, SectionHead, Faq, CtaBand, usePointerParallax, FONT } from '@/components/marketing/Kit'
import { PLATFORM_FAQS } from '@/lib/platform-faqs'
import { FOR_PAGES } from '@/lib/for-pages'
import { FOR_CONTENT, FOR_ORDER } from '@/app/for/[slug]/content'

// "The all-in-one customer platform": the whole customer journey in one place.
// The centrepiece is a scroll story following one customer from a post to a
// paid order and a review, with the revenue traced back to the post. Then the
// separate tools Colvy brings together, snapping into one tile as you scroll.

const CORAL = '#ff6a4d'

const STAGES: Stage[] = [
  {
    key: 'post', eyebrow: '1 · It starts with a post', title: 'One link in your Reel.',
    body: 'Make a Colvy short link for a Reel, a TikTok, an ad or a QR poster. Every click is counted, with device, city and where it came from.',
    bg: '#ff6a4d', ink: '#fff4ef',
    poses: { reel: { x: -60, y: -70, r: -3 }, link: { x: 90, y: 150, r: 3 } },
  },
  {
    key: 'chat', eyebrow: '2 · A conversation', title: 'The click becomes a chat.',
    body: 'When that visitor messages you, books or fills in a form, Colvy links it back to the link they came from.',
    bg: '#b4235a', ink: '#ffe0ec',
    poses: { reel: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, chat: { x: 10, y: -20 } },
  },
  {
    key: 'match', eyebrow: '3 · One customer', title: 'Matched across every channel.',
    body: 'Instagram today, SMS tomorrow, a phone call next week: it’s the same person, with one history of every message, order and booking.',
    bg: '#1f2a6b', ink: '#cdd8ff',
    poses: { chat: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, trail: { x: 20, y: -10 } },
  },
  {
    key: 'sell', eyebrow: '4 · The sale', title: 'Paid in the chat. Or booked.',
    body: 'Send a payment link or a booking link from the conversation. The order or booking lands in Colvy, already linked to the customer.',
    bg: '#0b5a44', ink: '#c9f6dc',
    poses: { trail: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, pay: { x: 70, y: -50, r: 3 }, order: { x: -40, y: 130, r: -2 } },
  },
  {
    key: 'follow', eyebrow: '5 · The follow-up', title: 'Then it looks after them.',
    body: 'Order updates, booking reminders, cart follow-ups and a review request go out on their own, and new Google reviews get a reply drafted for you, or posted if you allow it.',
    bg: '#4c1658', ink: '#f6cdfa',
    poses: { order: { x: 150, y: -170, s: 0.75, o: 0.3, r: 4 }, update: { x: -70, y: -90, r: -3 }, review: { x: 60, y: 110, r: 2 } },
  },
  {
    key: 'revenue', eyebrow: '6 · The result', title: 'And you see what the post earned.',
    body: 'Clicks, chats, bookings and sales add up against the link that started them, so you know which post, campaign and channel pays.',
    bg: '#7a0019', ink: '#ffc9dc',
    poses: { review: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, funnel: { x: 10, y: -10 } },
  },
]
const CARDS = {
  reel: (
    <div style={{ width: 230, height: 360, borderRadius: 26, padding: 6, background: '#0b0c12', boxShadow: '0 30px 70px rgba(0,0,0,0.35)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 21, overflow: 'hidden', background: 'linear-gradient(160deg,#f97316,#db2777 55%,#7c3aed)' }}>
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>bloomandboard</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.25)' }}>Reel</span>
        </div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 16, color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.25 }}>The oak side table is back 🌿</div>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, padding: '6px 10px', borderRadius: 999, background: '#fff', color: '#111' }}><Ico name="link" size={13} /> bloom.colvy.com/l/oak</div>
        </div>
      </div>
    </div>
  ),
  link: <ActionCard icon="qr" tint="#db2777" title="bloom.colvy.com/l/oak" sub="Instagram Reel · Oak table restock" left="1,284 clicks · 71% mobile" right="Tracking" rightTone="#db2777" />,
  chat: <ChatCard title="Ella Murphy" sub="Live chat · from the oak table Reel" channel="Instagram" lines={[{ from: 'them', text: 'Saw your Reel! Is the oak table still $189?' }, { from: 'ai', text: 'It is! 4 left in natural oak. Want a payment link?' }]} chips={[{ text: 'Came from: Oak Reel', tone: '#be185d' }]} />,
  trail: <TrailCard title="Ella Murphy · history" steps={[
    { icon: 'link', text: 'Clicked the oak table Reel link', when: 'Mon', tone: '#db2777' },
    { icon: 'chat', text: 'Asked about the oak table on Instagram', when: 'Mon', tone: '#be185d' },
    { icon: 'card', text: 'Paid $189 by payment link', when: 'Mon', tone: '#4f46e5' },
    { icon: 'truck', text: 'Order #10482 delivered', when: 'Thu', tone: '#0369a1' },
    { icon: 'phone', text: 'Called about matching chairs · 2:40', when: 'Fri', tone: '#ea580c' },
  ]} />,
  pay: <ActionCard icon="card" tint="#4f46e5" title="Pay $189.00" sub="Oak side table · natural" left="Sent to Ella · Instagram" right="✓ Paid" />,
  order: <StatusCard title="Order #10482" badge="Paid" sub="Ella Murphy · Express post · Brunswick VIC" strip="● Linked to the oak table Reel" stripTone="#be185d" />,
  update: <NoteCard label="SMS · Order update" text="Your oak side table is on its way! Track it here: bloom.colvy.com/l/t4Kp" left="Sent automatically" right="Delivered" />,
  review: <ReviewCard text="Saw it on Instagram, bought it in the DMs, delivered in 3 days. Love it!" reply="Thank you Ella, enjoy!" />,
  funnel: <ReportCard title="Oak table Reel · example" figure="$2,457" caption="revenue from one link" bars={[2, 4, 7, 9, 6, 5, 8]} rows={[['Clicks', '1,284'], ['Chats started', '41'], ['Orders', '13']]} tone="#be123c" width={310} />,
}
const ORDER = ['link', 'reel', 'chat', 'trail', 'order', 'pay', 'update', 'review', 'funnel']

// The separate tools a business usually juggles, and what Colvy does instead.
const STACK: { icon: string; tool: string; colvy: string; tone: string }[] = [
  { icon: 'chat', tool: 'Shared inbox', colvy: 'Instagram, Messenger, SMS, email and live chat in one inbox, with each customer’s channels linked to one profile', tone: '#2563eb' },
  { icon: 'phone', tool: 'Business phone', colvy: 'Australian numbers, calls in the browser and app, recordings and AI summaries', tone: '#00a876' },
  { icon: 'user', tool: 'CRM', colvy: 'Every customer’s messages, calls, orders, bookings and notes in one history', tone: '#7c3aed' },
  { icon: 'cal', tool: 'Booking page', colvy: 'Online booking with deposits and SMS reminders', tone: '#0d9488' },
  { icon: 'card', tool: 'Payment links', colvy: 'Take payment in any conversation; payments are recorded on the customer’s thread and store orders marked paid', tone: '#4f46e5' },
  { icon: 'spark', tool: 'AI assistant', colvy: 'AI agents that draft or send replies within the rules you set', tone: '#c026d3' },
  { icon: 'link', tool: 'Link tracking', colvy: 'Short links and QR codes tracked from click to sale', tone: '#db2777' },
  { icon: 'send', tool: 'SMS campaigns', colvy: 'Broadcasts to opted-in customers with clicks and sales reported', tone: '#0891b2' },
  { icon: 'form', tool: 'Forms', colvy: 'One-question-at-a-time forms with uploads, signatures and payments', tone: '#d97706' },
  { icon: 'check', tool: 'Reviews', colvy: 'Google reviews in one list, with AI-drafted replies', tone: '#ea580c' },
]

function StackCollapse({ dark, cardBg, cardBorder, muted }: { dark: boolean; cardBg: string; cardBorder: string; muted: string }) {
  const { ref, v } = useReveal(0.25)
  // Each tile starts scattered and tilted, then settles into the grid.
  const scatter = (i: number) => `translate(${((i * 37) % 7 - 3) * 18}px, ${((i * 53) % 5 - 2) * 26 + 30}px) rotate(${((i * 29) % 9 - 4) * 2.5}deg)`
  return (
    <div ref={ref} className="pf-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
      {STACK.map((s, i) => (
        <div key={s.tool} style={{
          padding: '18px 16px', borderRadius: 18, background: cardBg, border: `1px solid ${cardBorder}`,
          opacity: v ? 1 : 0, transform: v ? 'none' : scatter(i),
          transition: `transform .9s cubic-bezier(.16,1,.3,1) ${i * 0.05}s, opacity .6s ease ${i * 0.05}s`,
        }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: s.tone + (dark ? '30' : '18'), color: s.tone, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ico name={s.icon} /></span>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, margin: '12px 0 2px' }}>No separate</div>
          <div style={{ fontSize: 15, fontWeight: 900, margin: '0 0 5px' }}>{s.tool}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: muted }}>{s.colvy}</div>
        </div>
      ))}
    </div>
  )
}

export default function PlatformClient() {
  const t = useShell(CORAL)
  const heroRef = usePointerParallax<HTMLDivElement>()
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: FONT, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes pfUp { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
        .pf-hero-copy > * { animation: pfUp .8s cubic-bezier(.16,1,.3,1) both }
        .pf-hero-copy > :nth-child(2) { animation-delay: .06s } .pf-hero-copy > :nth-child(3) { animation-delay: .12s } .pf-hero-copy > :nth-child(4) { animation-delay: .18s }
        .pf-card { transition: transform .25s cubic-bezier(.16,1,.3,1) } .pf-card:hover { transform: translateY(-5px) }
        @media (max-width: 1100px) { .pf-stack { grid-template-columns: repeat(3, minmax(0,1fr)) !important } }
        @media (max-width: 900px) {
          .pf-hero { grid-template-columns: 1fr !important; padding-top: 104px !important }
          .pf-stack { grid-template-columns: repeat(2, minmax(0,1fr)) !important }
          .pf-for { grid-template-columns: 1fr !important }
        }
        @media (prefers-reduced-motion: reduce) { .pf-hero-copy > * { animation: none !important } }
      `}</style>
      <MarketingNav dark={t.dark} onToggleDark={t.toggleDark} />

      {/* HERO */}
      <section ref={heroRef} className="pf-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 44, alignItems: 'center', maxWidth: 1320, margin: '0 auto', padding: 'clamp(110px, 13vw, 150px) 24px 80px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: t.grid, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div className="pf-hero-copy" style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: CORAL + '16', color: CORAL, fontSize: 13, fontWeight: 800 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: CORAL }} />The all-in-one customer platform</span>
          <h1 style={{ fontSize: 'clamp(42px, 6vw, 78px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98, margin: '20px 0 22px' }}>From first click to five stars. One platform.</h1>
          <p style={{ fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.6, color: t.muted, maxWidth: 560, margin: '0 0 30px' }}>Colvy brings your inbox, phone, customers, payments, bookings, reviews and AI together, and follows every customer from the post they clicked to the order they paid for.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={t.go} style={t.btnPrimary}>{t.user ? 'Go to your dashboard' : 'Start free'} <Arrow /></button>
            <a href="#journey" style={t.btnGhost}>Follow a customer</a>
          </div>
        </div>
        <div style={{ position: 'relative', minWidth: 0, animation: 'pfUp .9s cubic-bezier(.16,1,.3,1) .2s both' }}>
          <div aria-hidden style={{ position: 'absolute', inset: -22, borderRadius: 40, background: `linear-gradient(135deg, ${CORAL}, #ff4d8d 55%, #7c5cff)`, opacity: t.dark ? 0.4 : 0.22, filter: 'blur(30px)' }} />
          <div style={{ position: 'relative', borderRadius: 28, padding: 8, background: 'linear-gradient(150deg, #34363f, #0b0c12 62%)', boxShadow: '0 50px 120px rgba(15,17,25,0.34)', transform: 'perspective(1600px) rotateY(calc(-2deg + var(--mx, 0) * -3deg)) rotateX(calc(1deg + var(--my, 0) * 2deg))', transition: 'transform .3s ease-out' }}>
            <div style={{ borderRadius: 21, overflow: 'hidden' }}><ColvyAppDemo dark={t.dark} /></div>
          </div>
        </div>
      </section>

      {/* THE JOURNEY */}
      <div id="journey">
        <ScrollStory stages={STAGES} cards={CARDS} order={ORDER} label="One customer’s journey through Colvy" />
      </div>

      {/* THE STACK */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(70px, 9vw, 110px) 24px 40px' }}>
        <Reveal><SectionHead eyebrow="One platform" accent={CORAL} muted={t.muted} title="Ten tools, one login." sub="Everything shares the same customer records, so nothing is copied between apps and nobody has to ask a customer twice." /></Reveal>
        <StackCollapse dark={t.dark} cardBg={t.cardBg} cardBorder={t.cardBorder} muted={t.muted} />
        <Reveal delay={0.1}>
          <p style={{ textAlign: 'center', fontSize: 14.5, color: t.muted, margin: '26px auto 0', maxWidth: 640 }}>Keep your online store and payments: Colvy connects to <b style={{ color: t.text }}>Shopify</b>, <b style={{ color: t.text }}>WooCommerce</b> and <b style={{ color: t.text }}>Stripe</b> and works alongside them.</p>
        </Reveal>
      </section>

      {/* EXAMPLE CARDS ROW: what a day in Colvy touches */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '50px 24px 30px' }}>
        <Reveal><SectionHead eyebrow="Every channel" accent={CORAL} muted={t.muted} title="Wherever customers start, it lands in one place." /></Reveal>
        <Reveal delay={0.05}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Msg ch="Instagram" color={CHIP.Instagram} who="Mia Chen" text="Is the 4ft tank still available?" time="now" />
            <Msg ch="SMS" color={CHIP.SMS} who="Tom Becker" text="Thanks, I’ll pick it up Saturday" time="9m" />
            <Msg ch="Email" color={CHIP.Email} who="Jack Wu" text="Re: Delivery to Geelong" time="14m" />
            <Msg ch="Phone" color={CHIP.Phone} who="Ana Lopez" text="Call · 3:12 · summary saved" time="20m" />
          </div>
        </Reveal>
      </section>

      {/* BUILT FOR */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px 30px' }}>
        <Reveal><SectionHead eyebrow="Built for" accent={CORAL} muted={t.muted} title="See the workflow for your business." /></Reveal>
        <div className="pf-for" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
          {FOR_ORDER.map((k, i) => (
            <Reveal key={k} delay={i * 0.05}>
              <a href={`/for/${k}`} className="pf-card" style={{ display: 'block', height: '100%', boxSizing: 'border-box', padding: '18px 16px', borderRadius: 18, border: `1px solid ${t.cardBorder}`, background: t.cardBg, textDecoration: 'none', color: t.text }}>
                <span style={{ display: 'block', width: 26, height: 6, borderRadius: 3, background: FOR_CONTENT[k].accent, marginBottom: 12 }} />
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 900, marginBottom: 4 }}>{FOR_PAGES[k].name}</span>
                <span style={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: t.muted }}>{FOR_CONTENT[k].h1}</span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '70px 24px 40px' }}>
        <Reveal><SectionHead eyebrow="Questions" accent={CORAL} muted={t.muted} title="All-in-one, explained." /></Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PLATFORM_FAQS.map(f => <Faq key={f.q} q={f.q} a={f.a} accent={CORAL} text={t.text} muted={t.muted} cardBg={t.cardBg} cardBorder={t.cardBorder} />)}
        </div>
      </section>

      <CtaBand title="Put every customer in one place." sub="Try everything free for 14 days, then keep the plan that fits. Switch on phones, payments, bookings and AI as you need them." accent={CORAL} onGo={t.go} user={t.user} secondary={{ label: 'See pricing', href: '/pricing' }} />
      <MarketingFooter dark={t.dark} />
    </div>
  )
}
