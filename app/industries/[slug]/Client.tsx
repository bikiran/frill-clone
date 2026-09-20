'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Landing-styled per-industry pages (Colvy for SaaS / Agencies / Retail / …).
// Data-driven, sharing the same look as the main landing and solutions pages.
// Each industry carries its own pain-points, playbook and FAQ so the page
// speaks to that audience specifically. Copy is neutral — no fabricated stories.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', INK = '#0f1119'

// Shared "every channel" list — the same across industries.
const CHANNELS = ['Phone calls', 'SMS / MMS', 'WhatsApp', 'Instagram & Facebook', 'Email', 'Google Reviews', 'Live chat', 'Contact forms']

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Ind = {
  accent: string; eyebrow: string; name: string; sub: string; heroChips: string[]
  pains: { title: string; desc: string }[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  playbook: { title: string; desc: string }[]
  faqs: { q: string; a: string }[]
  stats: { big: string; label: string }[]
}

const IND: Record<string, Ind> = {
  saas: {
    accent: PURPLE, eyebrow: 'SaaS & tech', name: 'SaaS & tech', sub: 'Turn feedback into features and support into retention — ideas, roadmap, shared inbox and AI, all in one place.',
    heroChips: ['Ideas → roadmap → ship', 'Shared inbox', 'AI support'],
    pains: [
      { title: 'Feedback scattered everywhere', desc: 'Feature requests live in Slack, email, calls and a spreadsheet no one reads.' },
      { title: 'Users don’t know what shipped', desc: 'You build what they asked for and never close the loop, so it feels ignored.' },
      { title: 'Support doesn’t scale', desc: 'A growing user base, the same small team, and repetitive tickets all day.' },
    ],
    features: [
      { icon: 'idea', title: 'Ideas & feedback', desc: 'Collect and prioritise what customers actually want.' },
      { icon: 'map', title: 'Public roadmap', desc: 'Show what’s planned, in progress and shipped.' },
      { icon: 'megaphone', title: 'Announcements', desc: 'Close the loop when a requested feature ships.' },
      { icon: 'inbox', title: 'Shared inbox', desc: 'Support across chat, email and social in one thread.' },
      { icon: 'ai', title: 'AI support', desc: 'Deflect FAQs and draft replies from your docs 24/7.' },
      { icon: 'chart', title: 'Product analytics', desc: 'See demand and sentiment in one view.' },
    ],
    bands: [
      { tag: 'Close the loop', title: 'From feedback to shipped', body: 'Capture ideas, prioritise on a roadmap, and auto-notify the customers who asked when it ships — the whole loop in one platform.', bullets: ['Voting & prioritisation', 'Public + private roadmaps', 'Auto-notify on release'] },
      { tag: 'Support that scales', title: 'AI answers, humans close', body: 'Your assistant handles the repetitive questions and drafts the rest, so a small team supports a growing user base.', bullets: ['AI trained on your docs', 'Draft-and-send replies', 'Seamless handoff to a human'] },
    ],
    playbook: [
      { title: 'Collect ideas in one board', desc: 'Point users to a public board or capture requests straight from support threads.' },
      { title: 'Prioritise by demand', desc: 'Let votes and segments show what your most valuable users actually want.' },
      { title: 'Show the roadmap', desc: 'Publish what’s planned, in progress and shipped — no more “is this coming?”' },
      { title: 'Close the loop', desc: 'Auto-notify everyone who asked the moment a feature ships.' },
    ],
    faqs: [
      { q: 'Can the roadmap be private?', a: 'Yes — run a fully public roadmap, an internal one, or a mix per board.' },
      { q: 'Does the AI use our own docs?', a: 'It answers from your knowledge base and help docs, so replies stay accurate and on-brand.' },
      { q: 'Can we segment feedback by plan?', a: 'Yes — see what enterprise vs. free users are asking for, and weight by account value.' },
    ],
    stats: [{ big: '1', label: 'platform for product + support' }, { big: '24/7', label: 'AI coverage' }, { big: '45 min', label: 'to get going' }],
  },
  agencies: {
    accent: CORAL, eyebrow: 'Agencies', name: 'agencies', sub: 'Every client, channel and conversation in one workspace — with white-label branding and per-client reporting.',
    heroChips: ['White-label', 'Per-client reporting', 'Every channel'],
    pains: [
      { title: 'A tool per client', desc: 'Every client has their own inbox, login and process — and it’s chaos.' },
      { title: 'Reporting eats your week', desc: 'Proving the value you deliver means hours in spreadsheets each month.' },
      { title: 'Your brand disappears', desc: 'Clients see the tools, not you — so it’s harder to justify the retainer.' },
    ],
    features: [
      { icon: 'inbox', title: 'Per-client inboxes', desc: 'Keep every client’s conversations cleanly separated.' },
      { icon: 'lock', title: 'White-label', desc: 'Your brand, your domain — front and centre.' },
      { icon: 'chart', title: 'Client reporting', desc: 'Show the results you’re driving, per client.' },
      { icon: 'phone', title: 'Calls & SMS', desc: 'Manage calls and texts for every account.' },
      { icon: 'vote', title: 'Approvals', desc: 'Draft, review and get sign-off before it sends.' },
      { icon: 'star', title: 'Reviews', desc: 'Grow each client’s Google rating on autopilot.' },
    ],
    bands: [
      { tag: 'One workspace', title: 'All your clients, one login', body: 'Stop juggling a dozen tools and logins. Run every client’s comms from a single workspace with clean separation.', bullets: ['Client-scoped inboxes & data', 'Team roles & permissions', 'Switch clients in a click'] },
      { tag: 'Your brand', title: 'White-label the whole thing', body: 'Put your agency’s brand on the platform and reports, so clients see you — not us.', bullets: ['Custom domain & branding', 'Branded review requests', 'Branded reporting'] },
    ],
    playbook: [
      { title: 'Add each client as a workspace', desc: 'Clean separation of inboxes, contacts and data — switch in a click.' },
      { title: 'White-label it', desc: 'Your domain, logo and colours across the platform and every report.' },
      { title: 'Route work to the right people', desc: 'Assign teammates per client with roles and permissions.' },
      { title: 'Send branded reports', desc: 'Show results per client without the monthly spreadsheet grind.' },
    ],
    faqs: [
      { q: 'Can clients have their own login?', a: 'Yes — invite clients with scoped access to just their own workspace.' },
      { q: 'Is billing per client or per seat?', a: 'You manage every client under one account; see the pricing page for current plans.' },
      { q: 'Can we fully white-label it?', a: 'Custom domain, branding, and branded review requests and reports are all supported.' },
    ],
    stats: [{ big: '∞', label: 'clients, one workspace' }, { big: 'White-label', label: 'your brand' }, { big: '45 min', label: 'onboarding' }],
  },
  ecommerce: {
    accent: BLUE, eyebrow: 'Retail & e-commerce', name: 'retail & e-commerce', sub: 'Orders, support and post-purchase care across every channel — sell and get paid right in the chat.',
    heroChips: ['WooCommerce & Shopify', 'Sell in chat', 'Reviews on autopilot'],
    pains: [
      { title: '“Where’s my order?” all day', desc: 'Your team copies order numbers between tabs to answer the same question.' },
      { title: 'Carts abandoned, no follow-up', desc: 'Shoppers drift off and nobody reaches out at the right moment.' },
      { title: 'Reviews need constant chasing', desc: 'Growing your rating means someone remembering to ask, every time.' },
    ],
    features: [
      { icon: 'tag', title: 'Orders in the chat', desc: 'Live WooCommerce & Shopify orders beside every message.' },
      { icon: 'bolt', title: 'Sell & get paid', desc: 'Send a payment link and record the sale in the thread.' },
      { icon: 'ai', title: 'WISMO automation', desc: 'AI answers “where’s my order?” with live tracking.' },
      { icon: 'star', title: 'Google Reviews', desc: 'Automated review requests after every purchase.' },
      { icon: 'megaphone', title: 'SMS campaigns', desc: 'Broadcast offers and win-backs that convert.' },
      { icon: 'pin', title: 'Multi-location', desc: 'One inbox across every store, each with its own number.' },
    ],
    bands: [
      { tag: 'Sell in the conversation', title: 'Turn a chat into a sale', body: 'Look up orders, recover carts and take payment without leaving the thread — then see the revenue each conversation drove.', bullets: ['Live orders & refunds', 'Payment links & recorded sales', 'Revenue per conversation'] },
      { tag: 'Grow your rating', title: 'Reviews without the chasing', body: 'AI sends the review request at exactly the right moment after purchase, across every location.', bullets: ['Auto review requests', 'Reply from the inbox', 'Per-location profiles'] },
    ],
    playbook: [
      { title: 'Connect your store', desc: 'WooCommerce or Shopify orders sync into every conversation.' },
      { title: 'Let AI answer WISMO', desc: 'The assistant pulls live tracking and answers order questions 24/7.' },
      { title: 'Sell and get paid in chat', desc: 'Send a payment link, recover a cart, record the sale on the thread.' },
      { title: 'Automate review requests', desc: 'Ask for a review at the perfect post-purchase moment.' },
    ],
    faqs: [
      { q: 'Which stores connect?', a: 'WooCommerce and Shopify sync live orders and customers; multiple stores are supported.' },
      { q: 'Can we take payment in the chat?', a: 'Yes — connect your own Stripe to send payment links and invoices in the thread.' },
      { q: 'Does it handle multiple locations?', a: 'Run one inbox across locations, each with its own number and review profile.' },
    ],
    stats: [{ big: '14', label: 'channels, one thread' }, { big: 'Auto', label: 'review requests' }, { big: '45 min', label: 'to set up' }],
  },
  hospitality: {
    accent: GREEN, eyebrow: 'Hospitality', name: 'hospitality', sub: 'Bookings, enquiries and guest comms in one thread — before, during and after the visit.',
    heroChips: ['Bookings', 'Guest comms', 'Reviews'],
    pains: [
      { title: 'Booking calls go to voicemail', desc: 'You’re busy serving guests and enquiries slip while the phone rings out.' },
      { title: 'Messages on five apps', desc: 'WhatsApp, Instagram, texts and email — all on someone’s personal phone.' },
      { title: 'Great visits, no reviews', desc: 'Happy guests leave without ever being asked to leave a review.' },
    ],
    features: [
      { icon: 'calendar', title: 'Bookings & enquiries', desc: 'Every request in one place, answered fast.' },
      { icon: 'chat', title: 'WhatsApp & SMS', desc: 'Confirmations and reminders guests actually read.' },
      { icon: 'star', title: 'Review requests', desc: 'Ask happy guests for a review at the right moment.' },
      { icon: 'ai', title: 'AI answers FAQs', desc: 'Hours, menus, bookings — handled 24/7.' },
      { icon: 'phone', title: 'Calls & voicemail', desc: 'Never miss a booking call; AI texts back missed ones.' },
      { icon: 'user', title: 'Team handover', desc: 'Front-of-house and management on the same thread.' },
    ],
    bands: [
      { tag: 'Fill every table', title: 'Answer faster, book more', body: 'Guests message on whatever channel they like — Colvy brings it together so nothing slips and every enquiry gets a fast, on-brand reply.', bullets: ['One thread per guest', 'AI replies out of hours', 'Missed-call text-back'] },
      { tag: 'Turn visits into regulars', title: 'Reviews & repeat visits', body: 'Automated review requests and follow-ups keep your rating climbing and guests coming back.', bullets: ['Timed review requests', 'Win-back campaigns', 'Reply to reviews in one place'] },
    ],
    playbook: [
      { title: 'Bring every channel together', desc: 'Calls, WhatsApp, Instagram and email land in one shared inbox.' },
      { title: 'Let AI answer out of hours', desc: 'Hours, menus and bookings answered 24/7; missed calls get a text back.' },
      { title: 'Confirm and remind', desc: 'Automated booking confirmations and reminders guests actually read.' },
      { title: 'Ask for the review', desc: 'A timed request after the visit, on the channel they prefer.' },
    ],
    faqs: [
      { q: 'Can guests reply to reminders?', a: 'Yes — reminders are two-way, so guests can confirm or reschedule by text.' },
      { q: 'Does it work across venues?', a: 'Run every location from one inbox, each with its own number and review profile.' },
      { q: 'What happens to missed calls?', a: 'Callers you miss get an automatic text back, so the booking isn’t lost.' },
    ],
    stats: [{ big: '24/7', label: 'AI answers' }, { big: 'Every', label: 'channel, one thread' }, { big: '45 min', label: 'to launch' }],
  },
  'real-estate': {
    accent: CYAN, eyebrow: 'Real estate', name: 'real estate', sub: 'Leads, inspections and follow-ups in one thread — never let a hot lead go cold.',
    heroChips: ['Lead capture', 'Inspection follow-ups', 'AI qualification'],
    pains: [
      { title: 'The first to reply wins', desc: 'Leads go cold in minutes and the fastest agent takes the listing.' },
      { title: 'Follow-ups fall through', desc: 'After an open home, busy agents forget to chase warm buyers.' },
      { title: 'Enquiries scattered', desc: 'Portal leads, DMs and calls live in different places, easily missed.' },
    ],
    features: [
      { icon: 'target', title: 'Lead capture', desc: 'Portal, form and DM enquiries land in one inbox.' },
      { icon: 'calendar', title: 'Inspection follow-ups', desc: 'Auto-follow up after every open home.' },
      { icon: 'chat', title: 'SMS & calls', desc: 'Reach buyers and vendors the way they respond.' },
      { icon: 'ai', title: 'AI qualification', desc: 'Qualify and route leads before they go cold.' },
      { icon: 'star', title: 'Reviews', desc: 'Grow your reputation after every settlement.' },
      { icon: 'user', title: 'Contacts & CRM', desc: 'Full history beside every buyer and vendor.' },
    ],
    bands: [
      { tag: 'Speed to lead', title: 'Reply first, win the listing', body: 'The first agent to respond usually wins. Colvy answers instantly and routes hot leads to the right agent, day or night.', bullets: ['Instant AI first reply', 'Auto-routing to agents', 'Full lead history'] },
      { tag: 'After the sale', title: 'Follow-ups & reviews', body: 'Automated post-inspection and post-settlement follow-ups keep the pipeline warm and the reviews flowing.', bullets: ['Post-inspection nudges', 'Settlement review requests', 'Win-back for cold leads'] },
    ],
    playbook: [
      { title: 'Catch every lead', desc: 'Portal, form, DM and call enquiries land in one inbox.' },
      { title: 'Reply instantly with AI', desc: 'An instant first response qualifies and holds the lead, day or night.' },
      { title: 'Route to the right agent', desc: 'Hot leads go straight to whoever should own them.' },
      { title: 'Follow up automatically', desc: 'Post-inspection and post-settlement nudges keep the pipeline warm.' },
    ],
    faqs: [
      { q: 'Where do portal leads go?', a: 'Route enquiries from portals, forms and DMs into a single shared inbox.' },
      { q: 'Can each agent see their own leads?', a: 'Yes — assign and route leads per agent, with full history on each contact.' },
      { q: 'Does it ask for reviews?', a: 'Automated review requests go out after settlement, by text or email.' },
    ],
    stats: [{ big: 'Instant', label: 'first reply' }, { big: '1', label: 'thread per contact' }, { big: '45 min', label: 'to get going' }],
  },
  healthcare: {
    accent: PINK, eyebrow: 'Healthcare', name: 'healthcare', sub: 'Reminders, patient comms and enquiries handled with care — on every channel.',
    heroChips: ['Reminders', 'Two-way SMS', 'Recalls'],
    pains: [
      { title: 'No-shows cost you daily', desc: 'Empty slots from forgotten appointments add up fast.' },
      { title: 'The front desk is swamped', desc: 'Phones ring while patients wait, and messages pile up between shifts.' },
      { title: 'Patients drift off schedule', desc: 'Recalls slip and patients don’t come back when they should.' },
    ],
    features: [
      { icon: 'calendar', title: 'Appointment reminders', desc: 'Cut no-shows with timely, two-way reminders.' },
      { icon: 'chat', title: 'Two-way SMS', desc: 'Patients reply, reschedule and confirm by text.' },
      { icon: 'bell', title: 'Recalls', desc: 'Automated recalls bring patients back on schedule.' },
      { icon: 'ai', title: 'AI triage & FAQs', desc: 'Answer common questions and route the rest.' },
      { icon: 'phone', title: 'Calls & voicemail', desc: 'Never miss a call; missed ones get a text back.' },
      { icon: 'lock', title: 'Handled with care', desc: 'Encrypted in transit and at rest; access controlled.' },
    ],
    bands: [
      { tag: 'Fewer no-shows', title: 'Reminders patients act on', body: 'Two-way reminders and easy rescheduling keep the calendar full and reduce gaps, without extra front-desk load.', bullets: ['Two-way SMS reminders', 'Self-serve reschedule', 'Automated recalls'] },
      { tag: 'Every enquiry', title: 'One place for patient comms', body: 'Calls, texts and web enquiries land in one thread per patient, so nothing is missed between shifts.', bullets: ['One thread per patient', 'Missed-call text-back', 'AI answers FAQs 24/7'] },
    ],
    playbook: [
      { title: 'Send two-way reminders', desc: 'Timely reminders patients can confirm or reschedule by text.' },
      { title: 'Automate recalls', desc: 'Bring patients back on schedule without manual chasing.' },
      { title: 'Answer FAQs with AI', desc: 'Hours, prep and common questions handled 24/7; the rest routed to staff.' },
      { title: 'Catch missed calls', desc: 'Missed calls get an automatic text back, so nothing’s lost.' },
    ],
    faqs: [
      { q: 'Is patient data handled securely?', a: 'Data is encrypted in transit and at rest, with access controls across your team.' },
      { q: 'Can patients reschedule themselves?', a: 'Yes — two-way reminders let patients confirm or reschedule by reply.' },
      { q: 'Does it reduce no-shows?', a: 'Two-way reminders and easy rescheduling are designed to keep the calendar full.' },
    ],
    stats: [{ big: 'Fewer', label: 'no-shows' }, { big: '24/7', label: 'AI answers' }, { big: 'Secure', label: 'by design' }],
  },
}

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

function Faq({ q, a, accent, text, muted, cardBg, cardBorder }: { q: string; a: string; accent: string; text: string; muted: string; cardBg: string; cardBorder: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 16, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: text, fontSize: 16, fontWeight: 800, fontFamily: 'inherit' }}>
        {q}
        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: accent + '18', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden' }}>
        <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, lineHeight: 1.6, color: muted }}>{a}</p>
      </div>
    </div>
  )
}

export default function IndustryPage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'saas'
  const ind = IND[slug] || IND.saas
  const accent = ind.accent
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = '/admin'; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, '/admin'); return }
      await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }
  const titleName = slug === 'saas' ? 'SaaS & tech' : ind.name

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes indFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ind-card,.ind-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ind-card:hover{ transform:translateY(-6px); }
        .ind-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ind-hero{ grid-template-columns:1fr !important; } .ind-band{ grid-template-columns:1fr !important; } .ind-hero-cta{ flex-wrap:nowrap !important; } .ind-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="indFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ind-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name={ind.features[0].icon} color={accent} size={15} />Industries</span>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 18px' }}>Colvy for <span style={{ color: accent }}>{titleName}</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{ind.sub}</p>
            <div className="ind-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ind-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ind-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/industries/${slug}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'indFloat 6s ease-in-out infinite' }}><FeatureIcon name={ind.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {ind.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `indFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* SOUND FAMILIAR — industry pain-points */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 24px 44px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>Sound familiar?</h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 26px', lineHeight: 1.55, textAlign: 'center' }}>The everyday friction Colvy is built to take off your plate in {titleName.toLowerCase()}.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {ind.pains.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.05}>
              <div style={{ height: '100%', borderRadius: 20, padding: 24, background: dark ? 'rgba(255,255,255,0.03)' : accent + '08', border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: accent + '1c', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 22, fontWeight: 900 }}>!</span>
                <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{p.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {ind.features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="ind-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {ind.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="ind-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <Reveal>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>{b.tag}</span>
                <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{b.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{b.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {b.bullets.map(bl => (
                    <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div style={{ direction: 'ltr' }}>
              <Reveal delay={0.1}>
                <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${accent}22, ${accent}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'indFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={ind.features[Math.min(i + 2, ind.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* PLAYBOOK — tailored setup steps */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(30px, 5vw, 56px) 24px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>Up and running in an <span style={{ color: accent }}>afternoon</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.55, textAlign: 'center' }}>A simple path from sign-up to results, built for {titleName.toLowerCase()}.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
          {ind.playbook.map((s, i) => (
            <Reveal key={s.title} delay={(i % 4) * 0.05}>
              <div style={{ position: 'relative', height: '100%', borderRadius: 20, padding: '26px 22px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: accent, color: '#fff', fontWeight: 900, fontSize: 15, marginBottom: 14 }}>{i + 1}</span>
                <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: muted, margin: 0 }}>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* EVERY CHANNEL */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Every channel, <span style={{ color: accent }}>one thread</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>Customers reach out however they like — Colvy brings it together, one conversation per customer.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {CHANNELS.map(ch => (
              <span key={ch} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px' }}>{ch}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {ind.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(26px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px 60px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 26px' }}>Questions, answered</h2>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ind.faqs.map((f, i) => (
            <Reveal key={f.q} delay={(i % 3) * 0.05}>
              <Faq q={f.q} a={f.a} accent={accent} text={text} muted={muted} cardBg={cardBg} cardBorder={cardBorder} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Built for {titleName}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ind-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
