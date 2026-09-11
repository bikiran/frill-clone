'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Landing-styled marketing pages for the mega-menu categories (Channels, Phones,
// AI Assistant, Integrations, Industries, Compare). Data-driven so every page
// shares the same look and animation language as the main landing page.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', YELLOW = '#ffcb45', INK = '#0f1119'

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
  channels: {
    accent: BLUE, eyebrow: 'Omni-channel inbox', title: 'Every channel,', titleAccent: 'one conversation', sub: 'WhatsApp, Instagram, SMS, email, live chat and reviews land in one shared inbox — each message tied to a full customer profile.',
    heroChips: ['WhatsApp', 'Instagram', 'SMS', 'Email', 'Live chat'],
    features: [
      { icon: 'inbox', title: 'Shared inbox', desc: 'Every channel threads into one place your whole team can work from.' },
      { icon: 'chat', title: 'Live chat widget', desc: 'Capture leads on your site and continue the chat over SMS.' },
      { icon: 'chat', title: 'WhatsApp & SMS', desc: 'Text customers from a business number — or bring your own.' },
      { icon: 'reaction', title: 'Meta DMs', desc: 'Instagram and Messenger, answered from the same thread.' },
      { icon: 'mail', title: 'Email', desc: 'Email sits in the thread alongside every other channel.' },
      { icon: 'star', title: 'Google reviews', desc: 'See and reply to reviews without leaving Colvy.' },
    ],
    bands: [
      { tag: 'Unified', title: 'One thread per customer', body: 'Stop switching tabs. Every message from every channel threads into a single conversation with full history and context.', bullets: ['All channels in one inbox', 'Full profile beside every chat', 'Assign, @mention and collaborate'] },
      { tag: 'Faster replies', title: 'Templates, AI & automation', body: 'Reply in a tap with saved answers, or let AI draft it. Route each conversation to the right teammate automatically.', bullets: ['Saved replies & snippets', 'AI-drafted responses', 'Auto-routing & assignment'] },
    ],
    stats: [{ big: '6+', label: 'channels, one inbox' }, { big: '2×', label: 'faster replies' }, { big: '4 min', label: 'to set up' }],
    cta: { title: 'Bring every channel together', sub: 'Set up your shared inbox in minutes — no credit card.' },
  },
  phones: {
    accent: GREEN, eyebrow: 'Built-in phone system', title: 'Talk, transfer,', titleAccent: 'transcribe', sub: 'A full cloud phone system inside the inbox — every call logged, recorded and summarised right next to the customer.',
    heroChips: ['Live call', 'AI notes', 'Transcribed', 'IVR'],
    features: [
      { icon: 'phone', title: 'Voice calls', desc: 'Make and receive calls with full history and context.' },
      { icon: 'phone', title: 'Click to dial', desc: 'One-click calling from any browser tab.' },
      { icon: 'target', title: 'IVR & routing', desc: 'Send callers to the right team, every time.' },
      { icon: 'camera', title: 'Call recording', desc: 'Record, transcribe and summarise every call.' },
      { icon: 'chat', title: 'Missed-call text-back', desc: 'Auto-SMS the caller the moment you miss a call.' },
      { icon: 'pin', title: 'Numbers & porting', desc: 'Bring your number across or get a new one.' },
    ],
    bands: [
      { tag: 'Context first', title: 'Know the caller before you answer', body: 'Every call rings with the full customer profile, past conversations and orders on screen — so you pick up ready.', bullets: ['Caller context on every ring', 'Full history beside the call', 'Notes saved to the thread'] },
      { tag: 'After the call', title: 'AI notes, done for you', body: 'Calls are transcribed and summarised automatically, with follow-up tasks created so nothing slips.', bullets: ['Auto transcription & summary', 'Follow-up tasks created', 'Searchable call records'] },
    ],
    stats: [{ big: '100+', label: 'countries reachable' }, { big: 'HD', label: 'audio quality' }, { big: '0', label: 'hardware needed' }],
    cta: { title: 'A phone system inside your inbox', sub: 'Calling, recording and AI notes — all in one place.' },
  },
  'ai-assistant': {
    accent: PURPLE, eyebrow: 'AI assistant', title: 'Replies drafted', titleAccent: 'in a blink', sub: 'An assistant trained on your docs that drafts replies, summarises threads and takes real actions — you stay in control.',
    heroChips: ['Auto-reply', 'Summarise', 'Take action', 'Route'],
    features: [
      { icon: 'ai', title: 'AI replies', desc: 'Draft on-brand answers in a tap, ready to send or edit.' },
      { icon: 'book', title: 'Knowledge base', desc: 'Teach it your docs so answers are always accurate.' },
      { icon: 'bolt', title: 'AI actions', desc: 'Look up orders, create tasks and take action inline.' },
      { icon: 'pen', title: 'Auto-summaries', desc: 'Every long thread, TL;DR’d in one line.' },
      { icon: 'target', title: 'Auto-routing', desc: 'Send each conversation to the right team automatically.' },
      { icon: 'link', title: 'Workflows', desc: 'Trigger follow-ups and actions on any event.' },
    ],
    bands: [
      { tag: 'Trained on you', title: 'Answers from your own knowledge', body: 'Point the assistant at your help center and docs. It answers in your voice, with your facts — never generic.', bullets: ['Grounded in your content', 'On-brand tone', 'Always up to date'] },
      { tag: 'You approve', title: 'Drafts, not surprises', body: 'AI proposes; your team decides. Every reply is a suggestion you can send, tweak or discard.', bullets: ['Human-in-the-loop by default', 'One-tap send or edit', 'Full audit of every action'] },
    ],
    stats: [{ big: '70%', label: 'faster first reply' }, { big: '24/7', label: 'always on' }, { big: '1-tap', label: 'to send' }],
    cta: { title: 'Put an assistant on every thread', sub: 'Draft replies, summarise and act — in your voice.' },
  },
  integrations: {
    accent: CYAN, eyebrow: 'Integrations', title: 'Connect your', titleAccent: 'whole stack', sub: 'Commerce, payments and the tools you already run — wired into every conversation in Colvy.',
    heroChips: ['WooCommerce', 'Stripe', 'Shopify', 'Slack', 'Zapier'],
    features: [
      { icon: 'tag', title: 'WooCommerce', desc: 'Live orders, refunds and customer data in the chat.' },
      { icon: 'tag', title: 'Shopify', desc: 'Orders and customers synced into every thread.' },
      { icon: 'tag', title: 'Stripe', desc: 'Send payment links and take payment in chat.' },
      { icon: 'chat', title: 'Slack', desc: 'Get alerts and reply where your team already works.' },
      { icon: 'bolt', title: 'Zapier', desc: 'Connect Colvy to 6,000+ apps, no code.' },
      { icon: 'folder', title: 'Xero', desc: 'Invoices and accounting kept in sync.' },
    ],
    bands: [
      { tag: 'Sell in the chat', title: 'Commerce, right in the thread', body: 'Look up live orders, recover carts and take payment without leaving the conversation — then see the revenue each chat drove.', bullets: ['Live orders & refunds', 'Payment links & recorded sales', 'Revenue-per-conversation'] },
      { tag: 'No code', title: 'Wire up the rest in minutes', body: 'Zapier and webhooks connect Colvy to the tools you already use, so data flows both ways automatically.', bullets: ['6,000+ apps via Zapier', 'Inbound & outbound webhooks', 'Two-way sync'] },
    ],
    stats: [{ big: '6,000+', label: 'apps via Zapier' }, { big: '2-way', label: 'data sync' }, { big: '0', label: 'lines of code' }],
    cta: { title: 'Connect the tools you already use', sub: 'Commerce, payments and 6,000+ apps — in one place.' },
  },
  industries: {
    accent: PINK, eyebrow: 'Industries', title: 'Tuned to', titleAccent: 'your industry', sub: 'The same platform, shaped around how your team actually works — from SaaS to hospitality.',
    heroChips: ['SaaS', 'E-commerce', 'Hospitality', 'Real estate', 'Agencies'],
    features: [
      { icon: 'bolt', title: 'SaaS & tech', desc: 'Feedback → roadmap → ship, and support in one place.' },
      { icon: 'star', title: 'Agencies', desc: 'Every client, channel and conversation in one workspace.' },
      { icon: 'tag', title: 'E-commerce', desc: 'Orders, support and sell-in-chat for online stores.' },
      { icon: 'reaction', title: 'Hospitality', desc: 'Bookings, enquiries and guest comms in one thread.' },
      { icon: 'pin', title: 'Real estate', desc: 'Leads, inspections and follow-ups that never slip.' },
      { icon: 'help', title: 'Healthcare', desc: 'Reminders and patient comms, handled with care.' },
    ],
    bands: [
      { tag: 'Your workflow', title: 'Set up for how you work', body: 'Colvy adapts to your team — the channels you use, the way you route work and the tools you run.', bullets: ['Channels tuned to you', 'Routing that fits your team', 'Integrations for your stack'] },
      { tag: 'Grow with it', title: 'From first hello to fifth reorder', body: 'Capture the lead, close the sale, support the customer and win the repeat — all in one lively place.', bullets: ['Lead capture to repeat sales', 'Full history per customer', 'Revenue you can see'] },
    ],
    stats: [{ big: '1', label: 'platform for it all' }, { big: '4 min', label: 'to get going' }, { big: '∞', label: 'ways to fit' }],
    cta: { title: 'Made to fit your business', sub: 'Start free and shape Colvy around your team.' },
  },
  compare: {
    accent: CORAL, eyebrow: 'Why Colvy', title: 'All of it,', titleAccent: 'without the add-on fees', sub: 'Feedback, inbox, CRM and calling in one lively platform — priced for SMBs, not enterprise.',
    heroChips: ['One platform', 'SMB pricing', 'No per-seat tricks', '45-min setup'],
    features: [
      { icon: 'bolt', title: 'One platform', desc: 'Feedback, inbox, CRM and calls — not four subscriptions.' },
      { icon: 'tag', title: 'SMB pricing', desc: 'Fair, flat pricing. Calls priced well under the pack.' },
      { icon: 'target', title: '45-min setup', desc: 'Live the same afternoon, not next quarter.' },
      { icon: 'user', title: 'No per-seat tricks', desc: 'Add your team without watching the bill explode.' },
      { icon: 'star', title: 'Real support', desc: 'Talk to humans who actually help.' },
      { icon: 'lock', title: 'Own your data', desc: 'Export anytime. Encrypted in transit and at rest.' },
    ],
    bands: [
      { tag: 'One bill', title: 'Stop stitching five tools together', body: 'Most teams pay for a helpdesk, a CRM, a calling app, a survey tool and a changelog. Colvy is all of it, in one thread.', bullets: ['Feedback + inbox + CRM + calls', 'One login, one bill', 'Everything shares context'] },
      { tag: 'Honest pricing', title: 'Priced for growing businesses', body: 'Software is predictable; usage is billed separately and fairly. No surprise per-seat or add-on fees.', bullets: ['Flat, published pricing', 'Usage billed transparently', 'Cancel anytime'] },
    ],
    stats: [{ big: '5→1', label: 'tools replaced' }, { big: '45 min', label: 'to go live' }, { big: '$0', label: 'to start' }],
    cta: { title: 'See the whole platform', sub: 'Everything in one place — start free today.' },
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
  const slug = (params?.slug as string) || 'channels'
  const page = PAGES[slug] || PAGES.channels
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
      <section className="sol-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 70px' }}>
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
        {/* Hero visual — futuristic gradient card with floating chips */}
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <div aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', filter: 'blur(36px)' }} />
            <div aria-hidden style={{ position: 'absolute', bottom: -60, left: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,0,0,0.2)', filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.92)', animation: 'solFloat 6s ease-in-out infinite' }}><FeatureIcon name={page.features[0].icon} color="rgba(255,255,255,0.92)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {page.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `solFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
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
