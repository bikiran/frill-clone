'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Use-case Solutions pages — "Colvy for <the job you're trying to do>": customer
// support, sales, marketing, reviews, product feedback and payments/orders. These
// cross-cut the channel/feature/industry sections. Data-driven so every page
// shares the same look and animation language as the rest of the marketing site:
// a photographed hero, a feature grid, alternating bands and a stats strip.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Page = {
  accent: string; eyebrow: string; title: string; titleAccent: string; sub: string
  heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  cta: { title: string; sub: string }
}

const PAGES: Record<string, Page> = {
  'customer-support': {
    accent: BLUE, eyebrow: 'Customer support', title: 'Support that', titleAccent: 'never drops a thread', sub: 'Every question — SMS, WhatsApp, email, chat, social and calls — lands in one shared inbox, with AI drafts and the customer’s full history beside every reply.',
    heroChips: ['Shared inbox', 'AI drafts', 'Order lookup', 'Auto-routing'],
    features: [
      { icon: 'inbox', title: 'One shared inbox', desc: 'Every channel threads into one place your whole team works from.' },
      { icon: 'ai', title: 'AI-drafted replies', desc: 'On-brand answers in a tap — send, tweak or discard. You stay in control.' },
      { icon: 'tag', title: 'Order lookup & WISMO', desc: 'Answer “where’s my order?” automatically, with live tracking pulled into the thread.' },
      { icon: 'target', title: 'Routing & assignment', desc: 'Send each conversation to the right teammate the moment it arrives.' },
      { icon: 'phone', title: 'Calls in the same place', desc: 'Take calls with full context on screen and AI notes after.' },
      { icon: 'book', title: 'Help center & saved replies', desc: 'Reuse your best answers and let customers self-serve.' },
    ],
    bands: [
      { tag: 'Unified', title: 'One thread per customer', body: 'Stop switching tabs. Every message from every channel threads into a single conversation with full history and context.', bullets: ['All channels in one inbox', 'Full profile beside every chat', 'Assign, @mention and collaborate'] },
      { tag: 'Less busywork', title: 'Let AI handle the routine', body: 'AI drafts replies, answers WISMO and summarises long threads, so your team spends its time on the questions that need a human.', bullets: ['AI drafts grounded in your docs', 'Automatic WISMO answers', 'One-line thread summaries'] },
    ],
    stats: [{ big: '1', label: 'inbox for every channel' }, { big: '24/7', label: 'AI first response' }, { big: '45 min', label: 'to set up' }],
    cta: { title: 'Support every customer from one place', sub: 'Set up your shared inbox in minutes — no credit card.' },
  },
  sales: {
    accent: GREEN, eyebrow: 'Sales & conversions', title: 'Turn conversations', titleAccent: 'into revenue', sub: 'Capture leads from every channel, follow up automatically and sell — with live orders and payment links — right inside the chat.',
    heroChips: ['Lead capture', 'Live orders', 'Payment links', 'Follow-ups'],
    features: [
      { icon: 'chat', title: 'Capture every lead', desc: 'A website widget and every social channel feed straight into your inbox.' },
      { icon: 'user', title: 'CRM beside every chat', desc: 'See who you’re talking to, what they’ve bought and where they’re up to.' },
      { icon: 'tag', title: 'Sell in the thread', desc: 'Build a live order and take payment without leaving the conversation.' },
      { icon: 'link', title: 'Payment links', desc: 'Send a secure link by SMS or email; they pay on their device.' },
      { icon: 'bolt', title: 'Automated follow-ups', desc: 'Nudge quotes and abandoned carts on autopilot so nothing goes cold.' },
      { icon: 'phone', title: 'Missed-call text-back', desc: 'Auto-SMS callers you miss so the lead never slips away.' },
    ],
    bands: [
      { tag: 'Never miss a lead', title: 'Every enquiry, captured and followed up', body: 'Leads arrive from chat, SMS, social and calls — Colvy catches them all, assigns an owner and follows up automatically.', bullets: ['One pipeline for every channel', 'Auto-assign and remind', 'Follow-ups that run themselves'] },
      { tag: 'Close in the chat', title: 'From “interested” to paid — in one thread', body: 'Build the order, send a payment link and get paid without bouncing the customer to another tool. Every sale is recorded against the conversation.', bullets: ['Live orders in the thread', 'Secure payment links', 'Revenue you can see per chat'] },
    ],
    stats: [{ big: 'in-chat', label: 'checkout' }, { big: '1', label: 'pipeline, every channel' }, { big: 'per-chat', label: 'revenue you can see' }],
    cta: { title: 'Sell where your customers already are', sub: 'Capture, follow up and get paid — all in the chat.' },
  },
  marketing: {
    accent: PURPLE, eyebrow: 'Marketing & campaigns', title: 'Broadcasts that', titleAccent: 'start conversations', sub: 'Send targeted SMS, WhatsApp and email campaigns from the same place you talk to customers — and reply to every response in one inbox.',
    heroChips: ['SMS & WhatsApp', 'Segments', 'Broadcasts', 'Replies in-inbox'],
    features: [
      { icon: 'megaphone', title: 'One-off broadcasts', desc: 'Compose once and send across SMS, WhatsApp and email.' },
      { icon: 'target', title: 'Audience segments', desc: 'Target by purchase history, tags, channel or activity.' },
      { icon: 'pen', title: 'Templates', desc: 'Reusable, on-brand messages ready to personalise and send.' },
      { icon: 'bolt', title: 'Automations', desc: 'Welcome series, win-backs and post-purchase flows that run themselves.' },
      { icon: 'chat', title: 'Two-way, not blast-only', desc: 'Every reply lands in the shared inbox — a campaign becomes a conversation.' },
      { icon: 'lock', title: 'Opt-in handling', desc: 'Consent and opt-outs managed automatically, so you stay compliant.' },
    ],
    bands: [
      { tag: 'Reach them where they read', title: 'Campaigns on the channels people actually open', body: 'Email still has its place, but SMS and WhatsApp get read in minutes. Compose once and reach customers on the channel they prefer.', bullets: ['SMS, WhatsApp and email in one composer', 'Segment by behaviour and history', 'Schedule or send now'] },
      { tag: 'Two-way by design', title: 'When they reply, you’re right there', body: 'A campaign isn’t a dead end. Replies flow into the same inbox as everything else, so a broadcast can turn into a sale or a support win.', bullets: ['Replies in the shared inbox', 'Full context on every responder', 'Automatic opt-out handling'] },
    ],
    stats: [{ big: '3-in-1', label: 'SMS · WhatsApp · email' }, { big: '2-way', label: 'every campaign' }, { big: 'built-in', label: 'opt-out handling' }],
    cta: { title: 'Turn campaigns into conversations', sub: 'Broadcast, segment and reply — all in one place.' },
  },
  reviews: {
    accent: AMBER, eyebrow: 'Reviews & reputation', title: 'More reviews,', titleAccent: 'less chasing', sub: 'Automate Google review requests at the perfect moment, then read and reply to every review without leaving your inbox.',
    heroChips: ['Google reviews', 'Auto-requests', 'Reply in-inbox', 'Alerts'],
    features: [
      { icon: 'star', title: 'Automated requests', desc: 'Ask for a review right after a great interaction or delivery.' },
      { icon: 'chat', title: 'Reply from the inbox', desc: 'Respond to every Google review in the same place you work.' },
      { icon: 'bell', title: 'Instant alerts', desc: 'Know the moment a new review lands — good or bad.' },
      { icon: 'target', title: 'Smart timing', desc: 'Trigger requests on order completion, a resolved chat or a milestone.' },
      { icon: 'pen', title: 'Reply templates', desc: 'Thoughtful, on-brand responses ready to personalise.' },
      { icon: 'chart', title: 'Reputation at a glance', desc: 'Track rating and volume over time in one view.' },
    ],
    bands: [
      { tag: 'Ask at the right moment', title: 'Requests that actually convert', body: 'The best time to ask is right after a happy moment. Colvy triggers review requests automatically on the events that signal a satisfied customer.', bullets: ['Trigger on delivery or resolution', 'One-tap for the customer', 'Follow-up reminders'] },
      { tag: 'Respond fast', title: 'Reply to every review, in one place', body: 'Reviews shape whether people choose you. See and respond to each one from your inbox, so nothing sits unanswered.', bullets: ['All reviews in the inbox', 'Instant new-review alerts', 'Templates to reply fast'] },
    ],
    stats: [{ big: 'Google', label: 'reviews managed in-app' }, { big: 'auto', label: 'request timing' }, { big: '1', label: 'inbox for it all' }],
    cta: { title: 'Grow your rating on autopilot', sub: 'Request, monitor and reply — without the chasing.' },
  },
  feedback: {
    accent: CORAL, eyebrow: 'Product feedback', title: 'Close the loop', titleAccent: 'with your customers', sub: 'Capture ideas, prioritise a public roadmap and announce what shipped — tied to the conversations that sparked them.',
    heroChips: ['Ideas board', 'Roadmap', 'Changelog', 'Polls'],
    features: [
      { icon: 'idea', title: 'Ideas & voting', desc: 'Collect requests and let customers vote so priorities are clear.' },
      { icon: 'map', title: 'Public roadmap', desc: 'Show what’s planned, in progress and shipped — build trust in the open.' },
      { icon: 'megaphone', title: 'Announcements & changelog', desc: 'Post release notes and auto-notify the people who asked.' },
      { icon: 'vote', title: 'Polls & surveys', desc: 'Validate a decision before you build it.' },
      { icon: 'link', title: 'Linked to conversations', desc: 'Turn a chat into an idea, and connect who asked for what.' },
      { icon: 'bell', title: 'Notify on ship', desc: 'When an idea ships, everyone who wanted it hears back automatically.' },
    ],
    bands: [
      { tag: 'Capture every idea', title: 'A home for what customers want', body: 'Requests hide in chats, emails and calls. Colvy pulls them into one board where customers vote and you see what matters most.', bullets: ['Ideas board with voting', 'Create an idea from any chat', 'See who asked for what'] },
      { tag: 'Tell them when it ships', title: 'The loop that builds loyalty', body: 'From idea to roadmap to changelog — and back to the customer. Announce what shipped and the people who asked get notified in the thread.', bullets: ['Public roadmap', 'Announcements & changelog', 'Auto-notify requesters on ship'] },
    ],
    stats: [{ big: 'idea→ship', label: 'one connected loop' }, { big: 'public', label: 'roadmap & changelog' }, { big: 'auto', label: 'ship notifications' }],
    cta: { title: 'Build what your customers ask for', sub: 'Capture, prioritise and announce — all in one place.' },
  },
  payments: {
    accent: CYAN, eyebrow: 'Payments & orders', title: 'Get paid', titleAccent: 'in the chat', sub: 'Send a secure payment link, take the order and track delivery — without the customer ever leaving the conversation.',
    heroChips: ['Payment links', 'Live orders', 'WISMO', 'Refunds'],
    features: [
      { icon: 'link', title: 'Secure payment links', desc: 'Send by SMS or email; the customer pays on their device.' },
      { icon: 'tag', title: 'Live orders in-thread', desc: 'Build and confirm an order without switching tools.' },
      { icon: 'target', title: 'WISMO automation', desc: 'Auto-answer “where’s my order?” with live tracking.' },
      { icon: 'bolt', title: 'Refunds in the thread', desc: 'Process a refund right where the conversation happened.' },
      { icon: 'plug', title: 'WooCommerce, Shopify & Stripe', desc: 'Orders, customers and payments synced both ways.' },
      { icon: 'chart', title: 'Recorded sales', desc: 'Every sale tied to the chat that drove it.' },
    ],
    bands: [
      { tag: 'Sell without leaving', title: 'Checkout, right in the conversation', body: 'Bouncing customers to a separate checkout loses sales. Build the order and send a secure payment link inside the thread instead.', bullets: ['PCI-compliant payment links', 'Live orders in the chat', 'Sale recorded against the conversation'] },
      { tag: 'After the sale', title: 'Answer “where’s my order?” for you', body: 'Order and tracking data flow into the thread, so WISMO questions are answered automatically and refunds happen in a click.', bullets: ['Automatic order tracking', 'Refunds in the thread', 'Two-way sync with your store'] },
    ],
    stats: [{ big: 'secure', label: 'PCI-compliant links' }, { big: 'in-chat', label: 'checkout' }, { big: 'auto', label: 'order tracking' }],
    cta: { title: 'Take payment where you talk', sub: 'Links, live orders and tracking — all in the chat.' },
  },
}

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 30 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function SolutionPage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'customer-support'
  const page = PAGES[slug] || PAGES['customer-support']
  const accent = page.accent
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

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes solFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .sol-card,.sol-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .sol-card:hover{ transform:translateY(-6px); }
        .sol-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .sol-hero{ grid-template-columns:1fr !important; } .sol-band{ grid-template-columns:1fr !important; } .sol-hero-cta{ flex-wrap:nowrap !important; } .sol-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="solFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="sol-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 70px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}>
              <FeatureIcon name={page.features[0].icon} color={accent} size={15} />{page.eyebrow}
            </span>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 74px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px' }}>{page.title}<br /><span style={{ color: accent }}>{page.titleAccent}</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{page.sub}</p>
            <div className="sol-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="sol-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="sol-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        {/* Hero visual — real photography behind the accent overlay + floating chips */}
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/solutions/${slug}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}73 42%, rgba(10,12,20,0.55) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', animation: 'solFloat 6s ease-in-out infinite' }}><FeatureIcon name={page.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {page.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '9px 16px', animation: `solFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {page.features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="sol-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {page.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="sol-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
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
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'solFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={page.features[Math.min(i + 1, page.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {page.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 16px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})`, overflow: 'hidden' }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 14px' }}>{page.cta.title}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>{page.cta.sub}</p>
            <button onClick={go} className="sol-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
