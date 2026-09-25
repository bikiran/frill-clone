'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Landing-styled per-integration pages (WooCommerce / Shopify / Stripe / …).
// Data-driven, sharing the same look as the channel and industry pages.
// Only integrations Colvy actually ships are listed — copy stays honest.

const PINK = '#ff4d8d', PURPLE = '#7c5cff', CYAN = '#0891b2', INK = '#0f1119'
// Brand-ish accents per integration.
const WOO = '#7f54b3', SHOP = '#5a8f2f', STRIPE = '#635bff', SLACK = '#611f69', ZAP = '#ff4a00'

// The integrations Colvy connects to — used in the "rest of your stack" strip.
const STACK = ['WooCommerce', 'Shopify', 'Stripe', 'Slack', 'Zapier', 'Webhooks & API']

type Band = { tag: string; title: string; body: string; bullets: string[] }
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
    heroChips: ['Live orders', 'Customer sync', 'Refunds & tracking'],
    features: [
      { icon: 'tag', title: 'Live orders in the thread', desc: 'Order status, items and totals beside each chat.' },
      { icon: 'user', title: 'Customer sync', desc: 'Orders and lifetime value on every contact.' },
      { icon: 'bolt', title: 'Act without leaving', desc: 'Look up, refund and update from the inbox.' },
      { icon: 'ai', title: 'WISMO answered', desc: 'AI replies “where’s my order?” with live tracking.' },
      { icon: 'search', title: 'Order search', desc: 'Find any order by name, email or number.' },
      { icon: 'chart', title: 'Revenue in context', desc: 'See what each conversation is worth.' },
    ],
    bands: [
      { tag: 'No tab-switching', title: 'Every order beside the message', body: 'The moment a customer messages, their WooCommerce orders, items and status are right there — no copying order numbers between tabs.', bullets: ['Live order status & items', 'Full purchase history', 'One click to the store admin'] },
      { tag: 'Answers on autopilot', title: '“Where’s my order?” — handled', body: 'Your assistant pulls live tracking and answers the most common question for you, so the team only touches the ones that need a human.', bullets: ['Live tracking in replies', 'AI-drafted order updates', 'Refunds recorded in the thread'] },
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
    sub: 'Wire Colvy into the rest of your stack with Zapier — trigger workflows on events and push data both ways, all without writing code.',
    heroChips: ['5,000+ apps', 'No code', 'Two-way'],
    features: [
      { icon: 'plug', title: '5,000+ apps', desc: 'Reach the tools your business already runs.' },
      { icon: 'bolt', title: 'Event triggers', desc: 'Kick off a Zap when things happen in Colvy.' },
      { icon: 'link', title: 'Webhook catch', desc: 'Send data in from anywhere.' },
      { icon: 'target', title: 'Route anywhere', desc: 'Push contacts and events where you need.' },
      { icon: 'ai', title: 'Automate busywork', desc: 'Let Zaps handle the repetitive steps.' },
      { icon: 'folder', title: 'No code', desc: 'Build it in Zapier’s visual editor.' },
    ],
    bands: [
      { tag: 'Your whole stack', title: 'Colvy, wired into everything', body: 'CRMs, spreadsheets, marketing tools, helpdesks — if Zapier connects to it, Colvy does too. Trigger workflows on events and keep data in sync.', bullets: ['5,000+ app connections', 'Event-based triggers', 'Two-way data flow'] },
      { tag: 'No developer needed', title: 'Build it without code', body: 'Set up Zaps in a visual editor and let them run. No engineering time, no maintenance headaches.', bullets: ['Visual Zap builder', 'Inbound & outbound', 'Runs on autopilot'] },
    ],
    stats: [{ big: '5,000+', label: 'apps' }, { big: '0', label: 'lines of code' }, { big: '2-way', label: 'data flow' }],
    ctaHead: 'Automate Colvy with Zapier',
  },
  api: {
    accent: CYAN, eyebrow: 'Webhooks & API', name: 'Webhooks & API',
    title: 'Build on Colvy with webhooks & API',
    sub: 'When you need something custom, Colvy speaks webhooks and API — push events out, pull data in, and wire Colvy into anything your team builds.',
    heroChips: ['Webhooks', 'REST API', 'Custom builds'],
    features: [
      { icon: 'link', title: 'Outbound webhooks', desc: 'Get notified in real time on events.' },
      { icon: 'bolt', title: 'Inbound webhooks', desc: 'Send data into Colvy from anywhere.' },
      { icon: 'globe', title: 'REST API', desc: 'Read and write your Colvy data.' },
      { icon: 'lock', title: 'Secure by design', desc: 'Scoped access and secrets you control.' },
      { icon: 'target', title: 'Fits your workflow', desc: 'Wire Colvy into your own systems.' },
      { icon: 'folder', title: 'Docs & examples', desc: 'Everything you need to get building.' },
    ],
    bands: [
      { tag: 'For your team', title: 'When off-the-shelf isn’t enough', body: 'Webhooks and an API give your developers the hooks to connect Colvy to bespoke systems and build exactly the workflow you need.', bullets: ['Real-time event webhooks', 'Read / write REST API', 'Secrets you control'] },
      { tag: 'Both directions', title: 'Data in, data out', body: 'Push events out to your systems and send data back in — Colvy stays in sync with whatever you run in-house.', bullets: ['Inbound & outbound', 'Two-way sync', 'Scoped access'] },
    ],
    stats: [{ big: 'REST', label: 'API' }, { big: 'Real-time', label: 'webhooks' }, { big: '2-way', label: 'sync' }],
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
  const intg = INTG[slug] || INTG.woocommerce
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

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ig-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name={intg.features[0].icon} color={accent} size={15} />{intg.eyebrow}</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{intg.title}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{intg.sub}</p>
            <div className="ig-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ig-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ig-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/integrations/${slug}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {intg.features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="ig-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {intg.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="ig-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
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
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'igFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={intg.features[Math.min(i + 2, intg.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* REST OF YOUR STACK */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Works with the <span style={{ color: accent }}>rest of your stack</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>Connect the tools you already run — commerce, payments, alerts and automation, wired into every conversation.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {STACK.map(s => (
              <span key={s} style={{ fontSize: 13.5, fontWeight: 700, color: s === intg.name ? '#fff' : text, background: s === intg.name ? accent : cardBg, border: `1px solid ${s === intg.name ? accent : cardBorder}`, borderRadius: 999, padding: '8px 16px' }}>{s}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {intg.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(26px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>{intg.ctaHead}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ig-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
