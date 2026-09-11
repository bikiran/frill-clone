'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

// Landing-styled competitor comparison pages (Colvy vs Podium / Gorgias / Gladly
// / Intercom / Zendesk / Freshdesk). Data-driven so every comparison shares the
// same layout: hero + stat tiles, a feature-by-feature table, a "where Colvy
// wins" grid, a migration section and a CTA.
//
// We intentionally do NOT reproduce any competitor's real customer names, quotes
// or results — those belong to them. Copy here is product-level and neutral.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', TEAL = '#12b5a5', INDIGO = '#4f46e5', INK = '#0f1119'

// Standard capability row order for every table. Comms rows first, then the
// product-feedback suite — where Colvy is unique among these tools. A competitor
// with a shorter `comp` array shows ✗ for the rows it doesn't declare.
const FEAT = [
  'SMS (Australian 🇦🇺 numbers)', 'WhatsApp', 'Instagram DMs', 'Facebook / Meta DMs',
  'Email (Gmail / Outlook)', 'Phone calls & voicemail', 'Google Reviews', 'Live chat widget',
  'AI assistant', 'Call intelligence & transcription', 'WISMO automation', 'POS / ERP integrations',
  'Payments (send link, get paid)', 'Australian 🇦🇺 phone numbers', 'Australian 🇦🇺 support team', '45-minute migration',
  'Ideas & feedback board', 'Public roadmap', 'Announcements / changelog', 'Polls & surveys',
  'Media gallery', 'Team notes', 'Shared calendar', 'Tasks & reminders',
]

type Val = boolean | string
type Cmp = {
  name: string; accent: string; heroTitle: string; heroAccent: string; heroSub: string
  stats: { big: string; label: string }[]
  comp: Val[]                    // aligned to FEAT; Colvy is always ✓
  tableNote: string
  wins: { t: string; d: string }[]
  checklist: string[]
}

const CMP: Record<string, Cmp> = {
  podium: {
    name: 'Podium', accent: GREEN, heroTitle: 'The Podium alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'More channels, AI that learns from every chat, Australian support and real results — everything Podium locks behind contracts and add-ons, Colvy includes.',
    stats: [{ big: 'No', label: 'lock-in contracts' }, { big: '14', label: 'channels included' }, { big: '45 min', label: 'full migration' }],
    comp: [true, false, true, true, false, true, true, true, 'Limited', true, false, 'Limited', true, true, 'Overseas', false],
    tableNote: 'Colvy covers more channels, deeper AI and genuine Australian 🇦🇺 support.',
    wins: [
      { t: 'One conversation, nothing siloed', d: 'Every channel lives in one thread per customer — SMS, calls, email, WhatsApp, Instagram, reviews. Not separate inboxes.' },
      { t: 'WISMO automation', d: 'Colvy AI handles “where is my order?” automatically — checks tracking and replies. Podium has no WISMO automation.' },
      { t: 'AI that takes action', d: 'Colvy AI creates orders, processes refunds and applies discounts — not just conversational replies.' },
      { t: 'Australian 🇦🇺 support team', d: 'Talk to real humans in Australia. Podium routes support through overseas teams with timezone delays.' },
      { t: 'Save thousands a year', d: 'No long contracts, no hidden fees, cancel anytime — priced for SMBs, not enterprise.' },
      { t: 'Better review results', d: 'AI-powered review requests hit at exactly the right moment to grow your Google rating.' },
    ],
    checklist: ['All your conversations migrated in 45 minutes', 'SMS and webchat work exactly how you expect', 'Google Review requests, better timed', 'Phone calls with AI transcription & summaries', 'WhatsApp, Instagram and email added automatically', 'Colvy AI answers mundane and complex questions 24/7', 'Australian 🇦🇺 support team when you need them', 'No long-term contracts — cancel anytime'],
  },
  gorgias: {
    name: 'Gorgias', accent: PURPLE, heroTitle: 'The Gorgias alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'More than a helpdesk. 14 channels, smarter AI, Google Reviews, payments and a real Australian support team — everything Gorgias doesn’t do, Colvy does.',
    stats: [{ big: 'AI', label: 'not just macros' }, { big: 'All-in-one', label: 'not just tickets' }, { big: '45 min', label: 'full migration' }],
    comp: ['Add-on', 'Add-on', true, true, true, 'Add-on', false, true, 'Macros only', false, 'Basic', 'Shopify only', false, false, false, false],
    tableNote: 'Colvy goes beyond helpdesk tickets with full communications, AI and Australian 🇦🇺 support.',
    wins: [
      { t: 'More than a helpdesk', d: 'Gorgias is a support ticket system. Colvy covers sales, support, marketing, reviews and payments in one place.' },
      { t: 'Real phone calls, not add-ons', d: 'Calls, voicemail and call intelligence are included natively. Gorgias treats phone as a paid add-on.' },
      { t: 'Google Reviews built in', d: 'Automate review requests and respond from the inbox. Gorgias has no review management.' },
      { t: 'AI that reads your data', d: 'Colvy AI checks orders, tracking and history to draft accurate replies. Gorgias relies on macros.' },
      { t: 'Works beyond Shopify', d: 'WooCommerce, Shopify, Xero and more. Gorgias is built for Shopify first.' },
      { t: 'Australian 🇦🇺 support team', d: 'Real humans in Australia. Gorgias support is US/EU based.' },
    ],
    checklist: ['All support tickets become unified conversation threads', 'Phone, SMS, WhatsApp and social added automatically', 'Google Review requests automated after every order', 'AI assistant handles common questions 24/7', 'Call intelligence transcribes and summarises every call', 'Send a payment link and get paid in the thread', 'Works with any ecommerce platform, not just Shopify', 'No long-term contracts — cancel anytime'],
  },
  freshdesk: {
    name: 'Freshdesk', accent: CYAN, heroTitle: 'The Freshdesk alternative that', heroAccent: 'does it all', heroSub: 'Freshdesk is a budget helpdesk. Colvy is a complete communication platform with 14 channels, AI, Google Reviews, payments and Australian support — all included.',
    stats: [{ big: '14', label: 'channels included' }, { big: '$0', label: 'add-on fees' }, { big: '45 min', label: 'full migration' }],
    comp: ['Add-on', 'Add-on', true, true, true, 'Add-on', false, true, 'Basic', false, false, 'Limited', false, false, false, false],
    tableNote: 'Freshdesk nickel-and-dimes on channels. Colvy includes everything in one plan.',
    wins: [
      { t: 'All channels included, no add-ons', d: 'Phone, SMS and WhatsApp are extra on Freshdesk. Colvy includes all 14 channels in one plan.' },
      { t: 'Google Reviews built in', d: 'Automate requests and respond from the same inbox. Freshdesk has no review management.' },
      { t: 'AI that reads your data', d: 'Colvy AI checks orders, tracking and history and handles WISMO. Freshdesk relies on canned responses.' },
      { t: 'Call intelligence included', d: 'Every call transcribed, summarised and searchable. Freshdesk has no call intelligence.' },
      { t: 'Payments built in', d: 'Send a secure link via SMS or email; the customer pays on their device. Freshdesk has no payments.' },
      { t: 'Australian 🇦🇺 support team', d: 'Real humans in Australia who understand your market.' },
    ],
    checklist: ['Phone, SMS, WhatsApp, email and social all included', 'Google Reviews automated and managed in one place', 'AI assistant handles WISMO and common questions 24/7', 'Call intelligence transcribes and summarises every call', 'Secure payment links, PCI-compliant', 'POS/ERP integrations with WooCommerce, Xero and more', 'Australian 🇦🇺 support team available when you need them', 'No per-agent pricing — add your whole team'],
  },
  zendesk: {
    name: 'Zendesk', accent: BLUE, heroTitle: 'The Zendesk alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'Threads, not tickets. Every channel included. Set up in 45 minutes, not weeks. Colvy replaces Zendesk with simplicity, speed and AI.',
    stats: [{ big: 'Threads', label: 'not tickets' }, { big: '45 min', label: 'setup vs weeks' }, { big: '$0', label: 'add-on fees' }],
    comp: ['Add-on', 'Add-on', 'Add-on', true, true, 'Add-on', false, true, 'Add-on', false, false, 'Limited', false, 'Limited', false, false],
    tableNote: 'Zendesk charges extra for nearly everything. Colvy includes it all.',
    wins: [
      { t: 'Threads, not tickets', d: 'Zendesk forces every interaction into a ticket. Colvy gives each customer one conversation thread across all channels.' },
      { t: 'Set up in 45 minutes, not weeks', d: 'Zendesk needs lengthy implementation and training. Colvy migrates you in a single session.' },
      { t: 'No add-on tax', d: 'Zendesk charges extra for phone, SMS, WhatsApp and AI. With Colvy every channel and feature is included.' },
      { t: 'AI that understands your business', d: 'Colvy AI reads orders, tracking and history. Zendesk AI relies on help articles and basic automation.' },
      { t: 'Google Reviews management', d: 'Automate requests and respond from your inbox. Zendesk has no Google Reviews feature.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, local numbers, pricing in AUD. Zendesk is US-based with USD pricing.' },
    ],
    checklist: ['Every customer gets one conversation thread — no ticket numbers', 'Phone, SMS, WhatsApp, social and email all included', 'AI assistant handles common questions and WISMO', 'Call intelligence transcribes and summarises every call', 'Google Reviews automated and managed in one place', 'Secure payment links built in', 'No per-agent pricing or add-on fees', 'Full migration handled by the Colvy team in 45 minutes'],
  },
  intercom: {
    name: 'Intercom', accent: CORAL, heroTitle: 'The Intercom alternative —', heroAccent: 'true omnichannel', heroSub: 'Intercom is chat-first and charges extra for phone and SMS. Colvy is a true omnichannel platform where every channel — chat, calls, SMS, social — is included.',
    stats: [{ big: 'Calls', label: 'built in, not add-on' }, { big: '14', label: 'channels included' }, { big: '45 min', label: 'full migration' }],
    comp: ['Add-on', 'Add-on', true, true, true, 'Add-on', false, true, 'Fin AI (paid)', false, false, 'Limited', false, false, false, false],
    tableNote: 'Intercom is built around chat. Colvy is built around every channel your customers use.',
    wins: [
      { t: 'True omnichannel', d: 'Intercom is chat-first and charges extra for phone and SMS. Colvy includes every channel natively.' },
      { t: 'Calls built in', d: 'Voice, voicemail and call intelligence are included — not a paid add-on.' },
      { t: 'AI that takes action', d: 'Colvy AI checks orders and takes real actions, not just conversational answers behind a paywall.' },
      { t: 'Google Reviews management', d: 'Automate requests and respond from your inbox. Intercom has no review management.' },
      { t: 'Payments in the thread', d: 'Send a link and get paid without leaving the conversation.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, local numbers, pricing in AUD.' },
    ],
    checklist: ['Chat, calls, SMS, WhatsApp, social and email all included', 'AI assistant handles common questions and WISMO 24/7', 'Call intelligence transcribes and summarises every call', 'Google Reviews automated and managed in one place', 'Secure payment links built in', 'POS/ERP integrations with WooCommerce, Xero and more', 'No add-on tax for phone or SMS', 'Full migration in 45 minutes'],
  },
  gladly: {
    name: 'Gladly', accent: PINK, heroTitle: 'The Gladly alternative —', heroAccent: 'SMB pricing, not enterprise', heroSub: 'Gladly charges enterprise prices and is US-centric. Colvy is built for Australian 🇦🇺 SMBs with local support, local numbers and no lock-in contracts.',
    stats: [{ big: 'SMB', label: 'pricing, not enterprise' }, { big: 'No', label: 'lock-in contracts' }, { big: '45 min', label: 'full migration' }],
    comp: [true, true, true, true, true, true, false, true, 'Enterprise', 'Enterprise', false, 'Limited', false, false, false, false],
    tableNote: 'Gladly is enterprise and US-centric. Colvy is priced and built for Australian 🇦🇺 SMBs.',
    wins: [
      { t: 'SMB pricing', d: 'Fair, flat pricing built for growing businesses — not enterprise contracts and minimums.' },
      { t: 'No lock-in', d: 'Month-to-month, cancel anytime. Gladly ties you into enterprise agreements.' },
      { t: 'Australian 🇦🇺 support & numbers', d: 'Local team, local numbers, pricing in AUD. Gladly is US-centric.' },
      { t: 'Google Reviews built in', d: 'Automate requests and respond from your inbox. Gladly has no review management.' },
      { t: 'AI that takes action', d: 'Colvy AI checks orders and takes real actions without an enterprise upgrade.' },
      { t: 'Live the same afternoon', d: 'Set up in 45 minutes, not a multi-month enterprise rollout.' },
    ],
    checklist: ['Every channel included at SMB pricing', 'AI assistant handles common questions and WISMO 24/7', 'Call intelligence transcribes and summarises every call', 'Google Reviews automated and managed in one place', 'Secure payment links built in', 'Australian 🇦🇺 support team and local numbers', 'No lock-in contracts — cancel anytime', 'Full migration in 45 minutes'],
  },
  coax: {
    name: 'Coax', accent: TEAL, heroTitle: 'The Coax alternative with a', heroAccent: 'built-in feedback loop', heroSub: 'Everything Coax does for conversations — plus a built-in ideas board, public roadmap and changelog, so your product and comms live in one lively platform.',
    stats: [{ big: '1', label: 'platform for comms + product' }, { big: '14', label: 'channels included' }, { big: '45 min', label: 'full migration' }],
    // Coax is a strong comms peer (all comms rows ✓); Colvy adds the feedback suite (auto ✗ for Coax).
    comp: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    tableNote: 'Colvy matches Coax on conversations — and adds the product-feedback suite Coax doesn’t have.',
    wins: [
      { t: 'A built-in feedback board', d: 'Capture, prioritise and vote on ideas right inside Colvy. Coax has no ideas board.' },
      { t: 'A public roadmap', d: 'Show customers what’s planned, in progress and shipped — build trust in the open. Coax has none.' },
      { t: 'Announcements & changelog', d: 'Post release notes and auto-notify the customers who asked. Tied to the inbox, not a separate tool.' },
      { t: 'The full loop', d: 'Idea → roadmap → announcement, connected to conversations so customers hear back when their idea ships.' },
      { t: 'One platform, one bill', d: 'Run support, sales and your product roadmap in one place instead of bolting on a feedback tool.' },
      { t: 'Everything Coax does, too', d: 'SMS, WhatsApp, calls, email, social, reviews, payments and AI — all still included.' },
    ],
    checklist: ['Every channel you run in Coax — SMS, WhatsApp, calls, email, social', 'Plus a built-in ideas & feedback board', 'A public roadmap customers can follow', 'Announcements & changelog tied to the inbox', 'Polls & surveys to validate decisions', 'Call intelligence on every call', 'Australian 🇦🇺 support and local numbers', 'No lock-in contracts — cancel anytime'],
  },
  manychat: {
    name: 'ManyChat', accent: INDIGO, heroTitle: 'The ManyChat alternative that', heroAccent: 'closes the loop', heroSub: 'ManyChat automates chat-marketing flows. Colvy is a full inbox, CRM, calls and feedback platform — real conversations and real revenue, not just automations.',
    stats: [{ big: 'Inbox', label: '+ CRM, not just flows' }, { big: '14', label: 'channels included' }, { big: '45 min', label: 'full migration' }],
    comp: ['Add-on', true, true, true, 'Basic', false, false, true, 'Flows', false, false, 'Limited', 'Add-on', false, false, false],
    tableNote: 'ManyChat is built for chat-marketing flows. Colvy is a full communication + feedback platform.',
    wins: [
      { t: 'A real shared inbox', d: 'A true team inbox with a CRM profile beside every chat — not just automated flows.' },
      { t: 'Voice calls included', d: 'Calls, voicemail and call intelligence are built in. ManyChat is messaging-only.' },
      { t: 'A feedback suite built in', d: 'Ideas board, roadmap and changelog to build what customers ask for. ManyChat has none.' },
      { t: 'Sell and get paid in chat', d: 'Live orders, payment links and recorded sales — right in the thread.' },
      { t: 'AI that takes action', d: 'Colvy AI checks orders and takes real actions, beyond keyword-triggered flows.' },
      { t: 'Australian 🇦🇺 support', d: 'Local team, local numbers, pricing in AUD.' },
    ],
    checklist: ['A real team inbox with CRM, not just flows', 'Voice calls, voicemail and call intelligence', 'Ideas board, roadmap and changelog built in', 'Payments and recorded sales in the thread', 'AI that reads orders and takes action', 'Google Reviews automated and managed', 'Australian 🇦🇺 support and local numbers', 'No lock-in contracts — cancel anytime'],
  },
}

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

const Check = ({ c }: { c: string }) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>)
const Cross = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e0625a" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

export default function ComparePage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'podium'
  const c = CMP[slug] || CMP.podium
  const accent = c.accent
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
  const scrollToTable = () => document.getElementById('cmp-table')?.scrollIntoView({ behavior: 'smooth' })

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const rowLine = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,17,25,0.07)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  const cell = (v: Val) => v === true ? <Check c={GREEN} /> : v === false ? <Cross /> : <span style={{ fontSize: 12.5, color: muted, fontWeight: 600 }}>{v}</span>

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .cmp-card,.cmp-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cmp-card:hover{ transform:translateY(-5px); }
        .cmp-btn:hover{ transform:translateY(-2px); }
        .cmp-row:hover{ background:${dark ? 'rgba(255,255,255,0.03)' : accent + '07'} !important; }
        @media (max-width:760px){ .cmp-hero-cta{ flex-wrap:wrap !important; } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '150px 24px 50px', background: dark ? 'linear-gradient(180deg,#10111b,#0a0b12 80%)' : `linear-gradient(180deg, ${accent}0d 0%, #ffffff 80%)` }}>
        <Reveal>
          <a href="/compare" style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent, background: accent + '16', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', marginBottom: 18 }}>← Compare</a>
          <h1 style={{ fontSize: 'clamp(34px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 auto 16px', maxWidth: 900 }}>{c.heroTitle} <span style={{ color: accent }}>{c.heroAccent}</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 640, margin: '0 auto 28px', lineHeight: 1.6 }}>{c.heroSub}</p>
          <div className="cmp-hero-cta" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={go} className="cmp-btn" style={btnPrimary}>Start 14-day free trial</button>
            <button onClick={scrollToTable} className="cmp-btn" style={btnGhost}>See full comparison →</button>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${c.stats.length}, 1fr)`, gap: 16, maxWidth: 760, margin: '44px auto 0' }}>
            {c.stats.map(s => (
              <div key={s.label} style={{ borderRadius: 20, padding: '24px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FEATURE TABLE */}
      <section id="cmp-table" style={{ maxWidth: 1000, margin: '0 auto', padding: '50px 24px 20px', scrollMarginTop: 80 }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Colvy vs {c.name}: <span style={{ color: accent }}>feature by feature</span></h2>
          <p style={{ fontSize: 16, color: muted, margin: '0 0 26px', maxWidth: 620, lineHeight: 1.55 }}>{c.tableNote}</p>
        </Reveal>
        <Reveal delay={0.05}>
          <div style={{ borderRadius: 20, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', background: accent + '12', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>
              <div style={{ padding: '14px 18px' }}>Feature</div>
              <div style={{ padding: '14px 12px', textAlign: 'center', color: accent }}>Colvy</div>
              <div style={{ padding: '14px 12px', textAlign: 'center' }}>{c.name}</div>
            </div>
            {FEAT.map((f, i) => (
              <div key={f} className="cmp-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', alignItems: 'center', borderTop: `1px solid ${rowLine}`, transition: 'background 0.15s' }}>
                <div style={{ padding: '13px 18px', fontSize: 14, fontWeight: 600, color: text }}>{f}</div>
                <div style={{ padding: '13px 12px', display: 'flex', justifyContent: 'center' }}><Check c={GREEN} /></div>
                <div style={{ padding: '13px 12px', display: 'flex', justifyContent: 'center', textAlign: 'center' }}>{cell(c.comp[i] ?? false)}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* WHERE COLVY WINS */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '50px 24px' }}>
        <Reveal><h2 style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 6px' }}>Where Colvy <span style={{ color: accent }}>wins</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16, color: muted, margin: '0 0 34px' }}>Key areas where Colvy outperforms {c.name} for Australian 🇦🇺 businesses.</p></Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {c.wins.map((w, i) => (
            <Reveal key={w.t} delay={(i % 3) * 0.05}>
              <div className="cmp-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: accent + '16', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Check c={accent} /></div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: text }}>{w.t}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{w.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* MIGRATION / CHECKLIST */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : accent + '08', padding: 'clamp(48px, 7vw, 88px) 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 28 }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Everything you have now, <span style={{ color: accent }}>plus more</span></h2>
            <p style={{ fontSize: 16.5, color: muted, margin: 0, maxWidth: 620, lineHeight: 1.6 }}>Switching from {c.name} to Colvy means keeping what works and gaining what was missing.</p>
          </Reveal>
          <Reveal delay={0.05}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px 28px' }}>
              {c.checklist.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check c={accent} /></span>{item}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Transition everything in 45 minutes</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Our team handles the migration. Keep your number, your reviews and your customers — just lose the limitations.</p>
            <div className="cmp-hero-cta" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={go} className="cmp-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Grab a free trial</button>
              <a href="mailto:support@colvy.com?subject=Colvy%20demo" className="cmp-btn" style={{ padding: '16px 32px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 800, fontSize: 16, border: '1px solid rgba(255,255,255,0.4)', textDecoration: 'none' }}>Book a demo</a>
            </div>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
