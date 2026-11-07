'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { SellioStyles, SCta, SCrumb, SPill, SGhost, STrust, SHead, SBento, SStory, SStats, SMore } from '@/components/marketing/Sellio'

// Landing-styled per-integration pages (WooCommerce / Shopify / Stripe / …).
// Data-driven, sharing the same look as the channel and industry pages.
// Only integrations Colvy actually ships are listed — copy stays honest.

const PINK = '#ff4d8d', PURPLE = '#7c5cff', CYAN = '#0891b2', INK = '#0f1119'
// Brand-ish accents per integration.
const WOO = '#7f54b3', SHOP = '#5a8f2f', STRIPE = '#635bff', SLACK = '#611f69', ZAP = '#ff4a00'

// The integrations Colvy connects to — used in the "rest of your stack" strip.
const STACK = ['WooCommerce', 'Shopify', 'Stripe', 'Slack', 'Zapier', 'Webhooks & API']

type Band = { tag: string; title: string; body: string; bullets: string[]; icon?: string }
type Intg = {
  accent: string; eyebrow: string; name: string; title: string; sub: string; heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  ctaHead: string
}

const INTG: Record<string, Intg> = {
  woocommerce: {
    accent: WOO, eyebrow: 'WooCommerce', name: 'WooCommerce',
    title: 'WooCommerce orders, right in the chat',
    sub: 'Connect your WooCommerce store and see live orders, tracking and customer history beside every conversation — look things up and act without leaving the thread.',
    heroChips: ['Live orders', 'Back-in-stock alerts', 'Abandoned carts'],
    features: [
      { icon: 'tag', title: 'Live orders in the thread', desc: 'Order status, items and totals beside each chat.' },
      { icon: 'user', title: 'Customer sync', desc: 'Orders and lifetime value on every contact.' },
      { icon: 'bolt', title: 'Act without leaving', desc: 'Look up, refund and update from the inbox.' },
      { icon: 'ai', title: 'WISMO answered', desc: 'AI replies “where’s my order?” with live tracking.' },
      { icon: 'search', title: 'Order search', desc: 'Find any order by name, email or number.' },
      { icon: 'chart', title: 'Revenue in context', desc: 'See what each conversation is worth.' },
      { icon: 'bell', title: 'Back-in-stock waitlists', desc: '“Notify me” on sold-out products, texted automatically on restock.' },
      { icon: 'cart', title: 'Abandoned carts', desc: 'Lost checkouts land in the inbox to follow up and recover.' },
    ],
    bands: [
      { tag: 'No tab-switching', title: 'Every order beside the message', body: 'The moment a customer messages, their WooCommerce orders, items and status are right there — no copying order numbers between tabs.', bullets: ['Live order status & items', 'Full purchase history', 'One click to the store admin'] },
      { tag: 'Answers on autopilot', title: '“Where’s my order?” — handled', body: 'Your assistant pulls live tracking and answers the most common question for you, so the team only touches the ones that need a human.', bullets: ['Live tracking in replies', 'AI-drafted order updates', 'Refunds recorded in the thread'] },
      { tag: 'Sales you’d have lost', title: 'Sold out or walked away? Win it back', body: 'The Colvy WordPress plugin adds a “Notify me” form to sold-out products and texts everyone the moment stock returns. Shoppers who leave checkout land in your inbox with their cart, ready for a friendly follow-up.', bullets: ['Automatic back-in-stock texts', 'Abandoned carts in the inbox', 'Recovered orders matched for you'], icon: 'bell' },
    ],
    stats: [{ big: 'Live', label: 'order data' }, { big: '0', label: 'tabs to switch' }, { big: '2-way', label: 'customer sync' }],
    ctaHead: 'Connect WooCommerce to Colvy',
  },
  shopify: {
    accent: SHOP, eyebrow: 'Shopify', name: 'Shopify',
    title: 'Shopify orders in every conversation',
    sub: 'Sync your Shopify store — even multiple stores — so customers and orders flow into Colvy and sit beside every message your team answers.',
    heroChips: ['Multi-store', 'Customer sync', 'Orders in the thread'],
    features: [
      { icon: 'tag', title: 'Orders in the thread', desc: 'Live Shopify orders beside each conversation.' },
      { icon: 'folder', title: 'Multiple stores', desc: 'Connect more than one store to one inbox.' },
      { icon: 'user', title: 'Customer sync', desc: 'Shopify customers matched to every contact.' },
      { icon: 'bolt', title: 'Act in context', desc: 'Look things up and reply without leaving.' },
      { icon: 'ai', title: 'WISMO answered', desc: 'AI handles order-status questions 24/7.' },
      { icon: 'chart', title: 'Revenue per chat', desc: 'See the value behind each conversation.' },
    ],
    bands: [
      { tag: 'One inbox, every store', title: 'All your Shopify stores together', body: 'Run one store or ten from a single inbox — every order and customer is matched to the right conversation automatically.', bullets: ['Multi-store support', 'Auto-matched customers', 'Live order status'] },
      { tag: 'Context that sells', title: 'Know the customer, close the sale', body: 'Purchase history and order value sit beside the chat, so your team can recommend, recover and reassure with full context.', bullets: ['Full order history', 'Lifetime value on the profile', 'AI order-status replies'] },
    ],
    stats: [{ big: 'Multi', label: 'store ready' }, { big: 'Live', label: 'order sync' }, { big: '1', label: 'inbox for every store' }],
    ctaHead: 'Connect Shopify to Colvy',
  },
  stripe: {
    accent: STRIPE, eyebrow: 'Stripe Payments', name: 'Stripe',
    title: 'Take payments inside the chat',
    sub: 'Connect your own Stripe account to send payment links and invoices right in a conversation — and record the sale on the thread the moment it’s paid.',
    heroChips: ['Payment links', 'Invoices', 'Paid in-chat'],
    features: [
      { icon: 'bolt', title: 'Payment links', desc: 'Send a link and get paid without leaving.' },
      { icon: 'tag', title: 'Invoices', desc: 'Create and send invoices from the thread.' },
      { icon: 'chat', title: 'Paid in the conversation', desc: 'The sale is recorded on the thread when paid.' },
      { icon: 'lock', title: 'Your own account', desc: 'Money lands in your Stripe, not ours.' },
      { icon: 'ai', title: 'AI can take payment', desc: 'The assistant sends a link when it’s time.' },
      { icon: 'chart', title: 'Revenue in context', desc: 'See what each conversation earned.' },
    ],
    bands: [
      { tag: 'Close in the chat', title: 'From question to paid, in one thread', body: 'When a customer’s ready, send a Stripe payment link or invoice right there — no switching to another tool, no lost momentum.', bullets: ['One-tap payment links', 'Branded invoices', 'Sale recorded automatically'] },
      { tag: 'Your money, your account', title: 'Connect your own Stripe', body: 'Payments settle straight into your own Stripe account. Colvy just makes it easy to ask for the money at the right moment.', bullets: ['Direct to your Stripe', 'No extra middleman', 'Full payment history on the thread'] },
    ],
    stats: [{ big: 'In-chat', label: 'payments' }, { big: 'Your', label: 'Stripe account' }, { big: 'Auto', label: 'recorded sales' }],
    ctaHead: 'Connect Stripe to Colvy',
  },
  slack: {
    accent: SLACK, eyebrow: 'Slack', name: 'Slack',
    title: 'Get the alerts where your team already works',
    sub: 'Post to Slack when it matters — new ideas, votes, status changes and conversations — so your team stays in the loop without living in another tab.',
    heroChips: ['Idea alerts', 'Status changes', 'Where you work'],
    features: [
      { icon: 'bell', title: 'Real-time alerts', desc: 'Ping a channel on the events that matter.' },
      { icon: 'idea', title: 'Feedback alerts', desc: 'Know when ideas are submitted or voted on.' },
      { icon: 'megaphone', title: 'Status changes', desc: 'Announce when something ships or moves.' },
      { icon: 'link', title: 'Simple webhook', desc: 'Paste a Slack webhook URL — done.' },
      { icon: 'target', title: 'Right channel', desc: 'Send each alert to the right place.' },
      { icon: 'chat', title: 'Stay in flow', desc: 'No extra tab for the whole team.' },
    ],
    bands: [
      { tag: 'In the loop', title: 'The team hears about it in Slack', body: 'New feedback, a wave of votes, a status change — Colvy posts it to the Slack channel your team already watches, so nothing gets missed.', bullets: ['Ideas submitted & voted', 'Status-change announcements', 'Choose the channel'] },
      { tag: 'Two minutes to set up', title: 'Just a webhook URL', body: 'Paste an incoming webhook URL from Slack and you’re live — no complex setup, no maintenance.', bullets: ['Incoming webhook URL', 'No code', 'Turn events on or off'] },
    ],
    stats: [{ big: 'Real-time', label: 'alerts' }, { big: '2 min', label: 'to connect' }, { big: '0', label: 'code' }],
    ctaHead: 'Connect Slack to Colvy',
  },
  zapier: {
    accent: ZAP, eyebrow: 'Zapier', name: 'Zapier',
    title: 'Connect Colvy to 5,000+ apps',
    sub: 'Wire Colvy into the rest of your stack with Zapier — start a Zap whenever something happens in Colvy, all without writing code.',
    heroChips: ['5,000+ apps', 'No code', 'Event triggers'],
    features: [
      { icon: 'plug', title: '5,000+ apps', desc: 'Reach the tools your business already runs.' },
      { icon: 'bolt', title: 'Event triggers', desc: 'Kick off a Zap when things happen in Colvy.' },
      { icon: 'link', title: 'Every field mapped', desc: 'Each event arrives ready to map in your Zap.' },
      { icon: 'target', title: 'Route anywhere', desc: 'Send orders, bookings and messages where you need.' },
      { icon: 'ai', title: 'Automate busywork', desc: 'Let Zaps handle the repetitive steps.' },
      { icon: 'folder', title: 'No code', desc: 'Build it in Zapier’s visual editor.' },
    ],
    bands: [
      { tag: 'Your whole stack', title: 'Colvy, wired into everything', body: 'CRMs, spreadsheets, marketing tools, helpdesks — if Zapier connects to it, Colvy does too. Start workflows from orders, bookings, payments, messages and more.', bullets: ['5,000+ app connections', 'Event-based triggers', 'Pick the events you send'] },
      { tag: 'No developer needed', title: 'Build it without code', body: 'Set up Zaps in a visual editor and let them run. No engineering time, no maintenance headaches.', bullets: ['Visual Zap builder', 'Test events to map fields', 'Runs on autopilot'] },
    ],
    stats: [{ big: '5,000+', label: 'apps' }, { big: '0', label: 'lines of code' }, { big: '20', label: 'Colvy events to pick from' }],
    ctaHead: 'Automate Colvy with Zapier',
  },
  api: {
    accent: CYAN, eyebrow: 'Webhooks & API', name: 'Webhooks & API',
    title: 'Build on Colvy with webhooks & API',
    sub: 'When you need something custom, Colvy sends signed webhooks for the events that matter, has a REST API for your feedback board, and an MCP server for AI assistants.',
    heroChips: ['Webhooks', 'REST API', 'MCP server'],
    features: [
      { icon: 'link', title: 'Outbound webhooks', desc: 'Get notified in real time on events.' },
      { icon: 'bolt', title: 'MCP server', desc: 'Let AI assistants look things up in your Colvy.' },
      { icon: 'globe', title: 'REST API', desc: 'Read and add ideas on your feedback board.' },
      { icon: 'lock', title: 'Signed requests', desc: 'Add a secret and every webhook is signed.' },
      { icon: 'target', title: 'Fits your workflow', desc: 'Wire Colvy into your own systems.' },
      { icon: 'folder', title: 'Test events', desc: 'Send a test event before you go live.' },
    ],
    bands: [
      { tag: 'For your team', title: 'When off-the-shelf isn’t enough', body: 'Webhooks and an API give your developers the hooks to connect Colvy to bespoke systems and build exactly the workflow you need.', bullets: ['Real-time event webhooks', 'REST API for ideas', 'Secrets you control'] },
      { tag: 'Events out', title: 'Your systems hear it first', body: 'New orders, bookings, payments, messages, reviews and more are POSTed to your URL as JSON, so whatever you run in-house can act on them.', bullets: ['JSON to your URL', 'Pick the events you send', 'Signed with your secret'] },
    ],
    stats: [{ big: 'REST', label: 'API' }, { big: 'Real-time', label: 'webhooks' }, { big: 'MCP', label: 'server' }],
    ctaHead: 'Build on Colvy',
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

export default function IntegrationPage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'woocommerce'
  // Unknown slugs fall back to the default page — and its photo, so a missing
  // /integrations/<slug>.jpg can't render this page again as its own image.
  const pageKey = INTG[slug] ? slug : 'woocommerce'
  const intg = INTG[pageKey]
  const accent = intg.accent
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
        @keyframes igFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ig-card,.ig-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ig-card:hover{ transform:translateY(-6px); }
        .ig-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ig-hero{ grid-template-columns:1fr !important; } .ig-band{ grid-template-columns:1fr !important; } .ig-hero-cta{ flex-wrap:nowrap !important; } .ig-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="igFloat"]{ animation:none !important } }
      `}</style>

      <SellioStyles />

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ig-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <SCrumb back={{ label: 'Integrations', href: '/integrations' }} current={intg.eyebrow} icon={intg.features[0].icon} accent={accent} dark={dark} />
            <h1 style={{ fontSize: 'clamp(38px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{intg.title}{!/[.!?]$/.test(intg.title) && <span style={{ color: accent }}>.</span>}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{intg.sub}</p>
            <div className="sl-ctas">
              <SPill accent={accent} onClick={go} cta="hero_start_free">Start free — no card</SPill>
              <SGhost href="/pricing">See pricing</SGhost>
            </div>
            <STrust accent={accent} />
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/integrations/${pageKey}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'igFloat 6s ease-in-out infinite' }}><FeatureIcon name={intg.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {intg.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `igFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURES — bento */}
      <section style={{ padding: 'clamp(56px, 8vw, 100px) 24px', background: dark ? '#0d0e17' : `linear-gradient(180deg, #ffffff, ${accent}0a)` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SHead eyebrow="What you get" title="Everything in one place" grey="Built in, not bolted on" accent={accent} dark={dark} />
          <SBento items={intg.features} accent={accent} dark={dark} />
        </div>
      </section>

      {/* STORY BANDS */}
      {intg.bands.map((b, i) => (
        <SStory key={b.title} tag={b.tag} title={b.title} body={b.body} bullets={b.bullets} accent={accent} tone={i % 2 ? 'soft' : 'deep'} flip={i % 2 === 1} dark={dark}
          icons={intg.features.slice(i * 3, i * 3 + 3).map(x => x.icon)} />
      ))}

      {/* REST OF YOUR STACK */}
      <SMore eyebrow="Integrations" title="Works with the rest of your stack" grey="Wired into every conversation" accent={accent} dark={dark}
        items={Object.entries(INTG).map(([k, x]) => ({ href: `/integrations/${k}`, title: x.name, icon: x.features[0].icon, here: k === pageKey }))} />

      {/* STATS */}
      <section style={{ padding: 'clamp(40px, 6vw, 70px) 24px clamp(56px, 8vw, 90px)' }}>
        <SStats stats={intg.stats} accent={accent} dark={dark} />
      </section>

      <SCta title={intg.ctaHead} accent={accent} onGo={go} user={user} />

      <MarketingFooter dark={dark} />
    </div>
  )
}
