'use client'

import InviteCta from '@/components/InviteCta'
import AgentTeamBand from '@/components/AgentTeamBand'
import { useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import ContactsProfileDemo from '@/components/marketing/ContactsProfileDemo'
import ColvyAppDemo from '@/components/ColvyAppDemo'
import TeamInboxDemo from '@/components/marketing/TeamInboxDemo'
import ChannelFlow from '@/components/marketing/ChannelFlow'
import IndustryCarousel from '@/components/marketing/IndustryCarousel'
import ScrollStory from '@/components/ScrollStory'
import MarketingFooter from '@/components/MarketingFooter'
import MarketingNav from '@/components/MarketingNav'

// ─────────────────────────────────────────────────────────────────────────────
// Colvy landing — bright, bold, full-bleed and kinetic (ManyChat energy):
// oversized type with rotating words, edge-to-edge colour bands (no empty
// sides), opaque floating chat bubbles kept off the copy, a big bold Colvy
// brand moment, and a short animated demo-photo panel (placeholder images for
// now). Light-first with a dark toggle.
// ─────────────────────────────────────────────────────────────────────────────

const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const PURPLE = '#7c5cff'
const PINK = '#ff4d8d'
const CYAN = '#0891b2'
const INK = '#0f1119'
// Numbers, indexes and labels: a plain system monospace, for the instrument-panel details.
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

// Rotating hero noun — "Turn every chat into a ___".
const HERO_WORDS = ['customer.', 'sale.', 'booking.', 'callback.', 'repeat order.', '5★ review.']
// Rotating capability line for the brand band.
const CAPABILITIES = ['making sales', 'every channel', 'phone calls', 'call summaries', 'voice typing', 'scheduled replies', 'restock alerts', 'follow-ups', 'happy customers']

// Opaque floating chat bubbles — positioned to the RIGHT half + corners so they
// never sit on the headline or body copy.
const BUBBLES = [
  // Three, on the edges, so they frame the live demo instead of covering it.
  { text: '★★★★★ thank you!', color: YELLOW, x: '-5%', y: '-5%', depth: 1.2, delay: 0 },
  { text: 'Can I get 2 more?', color: CORAL, x: '76%', y: '22%', depth: 1.0, delay: 0.6 },
  { text: 'Order #4821 · Paid ✅', color: GREEN, x: '-7%', y: '86%', depth: 0.8, delay: 1.1 },
]

// Big-text ticker just above the feature bands.
const MARQUEE_WORDS = ['One inbox for every channel', 'Sell inside the chat', 'Reply in seconds', 'Schedule it for later', 'Speak it, send it polished', 'Record every sale', 'Text them when it’s back', 'Automate the follow-up', 'Never miss a customer']

const BRANDS = [
  { name: 'Instagram', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.svg' },
  { name: 'Messenger', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/messenger.svg' },
  { name: 'WooCommerce', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/woocommerce.svg' },
  { name: 'Stripe', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/stripe.svg' },
  { name: 'Gmail', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/gmail.svg' },
  { name: 'Slack', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg' },
  { name: 'Twilio', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/twilio.svg' },
  { name: 'Zapier', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zapier.svg' },
  { name: 'Shopify', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/shopify.svg' },
]

// Trust strip for the hero banner (ManyChat-style bottom badges).
const TRUST: { label: string; logo?: string; star?: boolean }[] = [
  { label: 'Shopify ready', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/shopify.svg' },
  { label: 'Meta Business tools', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/meta.svg' },
  { label: 'WooCommerce ready', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/woocommerce.svg' },
  { label: 'Stripe payments', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/stripe.svg' },
]


// ── hooks / helpers ──────────────────────────────────────────────────────────
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 34 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

// ManyChat-style big-text reveal: words rise into view, staggered, on scroll.
function BigReveal({ text }: { text: string }) {
  const { ref, v } = useReveal(0.35)
  const words = text.split(' ')
  return (
    <span ref={ref as any} style={{ display: 'inline' }}>
      {words.map((w, i) => (
        <span key={i}>
          <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.14em', marginBottom: '-0.14em' }}>
            <span style={{ display: 'inline-block', transform: v ? 'translateY(0)' : 'translateY(112%)', opacity: v ? 1 : 0, transition: `transform 0.65s cubic-bezier(0.16,1,0.3,1) ${i * 0.075}s, opacity 0.5s ${i * 0.075}s` }}>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

// Scroll-linked parallax drift for any block (translateY relative to viewport).
function Parallax({ strength = 0.06, children }: { strength?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)
  useEffect(() => {
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (el) { const r = el.getBoundingClientRect(); setY(((r.top + r.height / 2) - window.innerHeight / 2) * -strength) }
        raf = 0
      })
    }
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [strength])
  return <div ref={ref} style={{ transform: `translateY(${y}px)`, willChange: 'transform' }}>{children}</div>
}
function useCycle(len: number, ms: number) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % len), ms); return () => clearInterval(t) }, [len, ms])
  return i
}
function RotatingWord({ words, color, ms = 2100 }: { words: string[]; color?: string; ms?: number }) {
  const i = useCycle(words.length, ms)
  // Every word sits in the same grid cell, so the slot is always as wide as the
  // longest word and the headline never reflows (it used to shift the whole
  // hero each time a longer word came round — layout shift).
  return (
    <span style={{ display: 'inline-grid', color }}>
      {words.map((w, j) => (
        <span key={j === i ? `on-${i}` : j} aria-hidden={j !== i} style={{ gridArea: '1 / 1', whiteSpace: 'nowrap', visibility: j === i ? 'visible' : 'hidden', animation: j === i ? 'wordIn 0.55s cubic-bezier(0.16,1,0.3,1)' : undefined }}>{w}</span>
      ))}
    </span>
  )
}

// Full-bleed stats band that auto-slides through pages of real metrics.
function fmtNum(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}
function StatsBand({ stats }: { stats: { teams: number; conversations: number; messages: number; contacts: number; orders: number; callMinutes: number; paymentsTotal: number } }) {
  const pool: { v: string; l: string }[] = [
    { v: stats.teams > 0 ? fmtNum(stats.teams) + '+' : '12,000+', l: 'Teams on Colvy' },
    { v: stats.conversations > 0 ? fmtNum(stats.conversations) + '+' : '10K+', l: 'Conversations handled' },
    { v: stats.messages > 0 ? fmtNum(stats.messages) + '+' : '250K+', l: 'Messages exchanged' },
    ...(stats.contacts > 0 ? [{ v: fmtNum(stats.contacts) + '+', l: 'Customers managed' }] : []),
    ...(stats.callMinutes > 0 ? [{ v: fmtNum(stats.callMinutes) + ' min', l: 'Minutes on calls' }] : []),
    ...(stats.paymentsTotal > 0 ? [{ v: '$' + fmtNum(stats.paymentsTotal) + '+', l: 'Payments handled' }] : []),
    { v: '98%', l: 'Customer satisfaction' },
    { v: '45 min', l: 'To get set up' },
  ]
  const pages: { v: string; l: string }[][] = []
  for (let i = 0; i < pool.length; i += 4) pages.push(pool.slice(i, i + 4))
  const [p, setP] = useState(0)
  useEffect(() => {
    if (pages.length < 2) return
    const t = setInterval(() => setP(x => (x + 1) % pages.length), 3600)
    return () => clearInterval(t)
  }, [pages.length])
  return (
    <section style={{ background: CORAL, color: '#fff', padding: 'clamp(56px, 8vw, 92px) 24px', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: `${pages.length * 100}%`, transform: `translateX(-${p * (100 / pages.length)}%)`, transition: 'transform 0.6s cubic-bezier(0.16,1,0.3,1)' }}>
          {pages.map((page, pi) => (
            <div key={pi} style={{ width: `${100 / pages.length}%`, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 28, padding: '0 6px', alignContent: 'center' }}>
              {page.map(s => (
                <div key={s.l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(38px, 5.5vw, 64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.88)', marginTop: 8, fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {pages.length > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 34 }}>
            {pages.map((_, i) => (
              <button key={i} onClick={() => setP(i)} aria-label={`Stats page ${i + 1}`} style={{ width: i === p ? 26 : 9, height: 9, borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer', background: i === p ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'width 0.4s ease' }} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

// Clean line icons (lucide-style) for the engagement-suite cards.
function SuiteIcon({ name, color }: { name: string; color: string }) {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'idea': return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
    case 'map': return <svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
    case 'megaphone': return <svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
    case 'form': return <svg {...p}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h5" /></svg>
    case 'chart': return <svg {...p}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="10" /></svg>
    case 'vote': return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
    case 'help': return <svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="4.93" y1="4.93" x2="9.17" y2="9.17" /><line x1="14.83" y1="14.83" x2="19.07" y2="19.07" /><line x1="14.83" y1="9.17" x2="19.07" y2="4.93" /><line x1="4.93" y1="19.07" x2="9.17" y2="14.83" /></svg>
    default: return null
  }
}

// The rest of the customer-engagement suite — surfaced as a lively horizontal
// carousel whose cards slide in from the right on scroll (Apple-style). `img`
// is an optional real background photo (with a dark scrim for legibility);
// falls back to the abstract colour mesh when absent.
const SUITE: { icon: string; title: string; desc: string; cta: string; href: string; color: string; img?: string }[] = [
  { icon: 'idea', title: 'Ideas board', desc: 'Capture feature requests and let customers upvote what matters most.', cta: 'Explore ideas', href: '/product/ideas', color: CORAL, img: '/suite/ideas.webp' },
  { icon: 'map', title: 'Public roadmap', desc: "Show what's planned, in progress and shipped — build trust in the open.", cta: 'See roadmap', href: '/product/roadmap', color: BLUE, img: '/suite/roadmap.webp' },
  { icon: 'megaphone', title: 'Announcements', desc: 'Post changelogs and auto-notify everyone who voted when their idea ships.', cta: 'See updates', href: '/product/announcements', color: GREEN, img: '/suite/announcements.webp' },
  { icon: 'form', title: 'Forms', desc: 'Collect leads, requests and details with branded custom forms.', cta: 'Explore forms', href: '/product', color: PURPLE, img: '/suite/forms.webp' },
  { icon: 'chart', title: 'Surveys', desc: 'Ask customers anything and measure sentiment over time.', cta: 'Explore surveys', href: '/product', color: CYAN, img: '/suite/surveys.webp' },
  { icon: 'vote', title: 'Polls & voting', desc: 'Run quick polls and let the best ideas rise to the top automatically.', cta: 'Explore polls', href: '/product', color: PINK, img: '/suite/polls.webp' },
  { icon: 'help', title: 'Help centre', desc: 'Self-serve articles and a knowledge base so customers find answers fast.', cta: 'Explore help', href: '/product', color: YELLOW, img: '/suite/help.webp' },
]

function SuiteCard({ s, i, dark, border }: { s: typeof SUITE[number]; i: number; dark: boolean; border: string }) {
  const { ref, v } = useReveal(0.18)
  return (
    <a ref={ref as any} href={s.href} className="cv-suite-card" style={{
      scrollSnapAlign: 'start', flex: '0 0 auto', width: 'min(80vw, 300px)', minHeight: 384,
      position: 'relative', borderRadius: 24, overflow: 'hidden', textDecoration: 'none',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.10)' : border}`, background: '#0f1119', color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 24,
      opacity: v ? 1 : 0, transform: v ? 'none' : 'translateX(110px) scale(0.97)',
      transition: `opacity 0.75s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s, transform 0.75s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s`,
      boxShadow: v ? '0 30px 70px rgba(15,17,25,0.30)' : 'none',
    }}>
      {/* Real background photo (when provided), colour-graded toward the card's
          accent (soft-light wash + a touch more saturation/contrast) for a
          cinematic feel, then a dark scrim so text stays legible. */}
      {s.img && <img src={s.img} alt="" aria-hidden loading="lazy" decoding="async" className="cv-suite-photo" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.12) contrast(1.05) brightness(0.98)' }} />}
      {s.img && <div aria-hidden style={{ position: 'absolute', inset: 0, background: s.color, mixBlendMode: 'soft-light', opacity: 0.42 }} />}
      {s.img && <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(15,17,25,0.10) 0%, rgba(15,17,25,0.52) 42%, rgba(15,17,25,0.94) 100%)` }} />}
      {/* Abstract futuristic backdrop — colour mesh + grid + glow. Kept subtle
          over a photo, full-strength without one. */}
      {!s.img && <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(130% 90% at 82% -5%, ${s.color}66, transparent 55%), radial-gradient(90% 70% at -5% 105%, ${s.color}33, transparent 60%)` }} />}
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.055) 1px,transparent 1px)', backgroundSize: '34px 34px', opacity: s.img ? 0.28 : 0.5 }} />
      <div aria-hidden style={{ position: 'absolute', top: -50, right: -50, width: 190, height: 190, borderRadius: '50%', background: s.color, opacity: s.img ? 0.3 : 0.45, filter: 'blur(64px)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ width: 58, height: 58, borderRadius: 16, background: `${s.color}26`, border: `1px solid ${s.color}77`, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><SuiteIcon name={s.icon} color="#fff" /></div>
        <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{s.title}</h3>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', margin: '0 0 16px' }}>{s.desc}</p>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{s.cta} <ArrowRight s={14} /></span>
      </div>
    </a>
  )
}

function FeatureSuite({ dark, text, muted, cardBorder, canvas }: { dark: boolean; text: string; muted: string; cardBorder: string; canvas: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const nudge = (dir: number) => trackRef.current?.scrollBy({ left: dir * 336, behavior: 'smooth' })
  const arrowBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 999, border: `1px solid ${cardBorder}`, background: dark ? '#171826' : '#fff', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
  return (
    <section style={{ background: canvas, padding: 'clamp(56px, 8vw, 96px) 0', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 30 }}>
        <div style={{ maxWidth: 640 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: '#6646f0', color: '#fff', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Beyond the inbox</span>
          <h2 style={{ fontSize: 'clamp(28px, 4.4vw, 50px)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.06, margin: '0 0 14px', color: text }}><BigReveal text="Everything your customers touch." /></h2>
          <p style={{ fontSize: 17, color: muted, lineHeight: 1.6, margin: 0 }}>Ideas, roadmap, announcements, forms, surveys, polls and a help centre — the whole feedback loop, connected to the inbox.</p>
        </div>
        <div className="cv-desktop" style={{ display: 'flex', gap: 10, flexShrink: 0, paddingBottom: 4 }}>
          <button onClick={() => nudge(-1)} aria-label="Previous" style={arrowBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
          <button onClick={() => nudge(1)} aria-label="Next" style={arrowBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
        </div>
      </div>
      <div ref={trackRef} className="cv-suite-track" style={{ display: 'flex', gap: 20, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '8px 24px 22px', scrollbarWidth: 'none' }}>
        {SUITE.map((s, i) => <SuiteCard key={s.title} s={s} i={i} dark={dark} border={cardBorder} />)}
      </div>
    </section>
  )
}

// Hero trust strip — compact chips that fade in one at a time on reveal.
function TrustStrip({ muted, dark, cardBg, border }: { muted: string; dark: boolean; cardBg: string; border: string }) {
  const { ref, v } = useReveal(0.35)
  return (
    <div ref={ref as any} className="cv-trust" style={{ position: 'absolute', left: 0, right: 0, bottom: 26, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 'clamp(9px, 1.6vw, 14px)', padding: '0 24px', zIndex: 2 }}>
      {TRUST.map((t, i) => (
        <span key={t.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: muted, whiteSpace: 'nowrap',
          padding: '8px 15px', borderRadius: 999, background: cardBg, border: `1px solid ${border}`, boxShadow: dark ? 'none' : '0 4px 16px rgba(15,17,25,0.05)',
          opacity: v ? 1 : 0, transform: v ? 'none' : 'translateY(12px)',
          transition: `opacity 0.5s ease ${i * 0.13}s, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 0.13}s`,
        }}>
          {t.star
            ? <span style={{ color: YELLOW, letterSpacing: 1 }}>★★★★★</span>
            : <img src={t.logo} alt="" width={18} height={18} style={{ opacity: dark ? 0.85 : 0.65, filter: dark ? 'invert(1)' : 'none' }} />}
          {t.label}
        </span>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [realStats, setRealStats] = useState({ teams: 0, conversations: 0, messages: 0, contacts: 0, orders: 0, callMinutes: 0, paymentsTotal: 0 })
  const [dark, setDark] = useState(false)
  // Scroll and pointer drive the hero's parallax through CSS variables on the
  // page root (--sy, --mx, --my) — never React state, which re-rendered this
  // whole page on every scroll frame and mouse move.
  const rootRef = useRef<HTMLDivElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    // The stats band, counted on the server.
    //
    // This used to run in the browser on the anon key: five head-counts plus
    // twenty thousand rows each of `calls` and `chat_payments`, summed here.
    // A marketing page therefore needed SELECT on every company's customer
    // data to render seven numbers, and that requirement is exactly what kept
    // those tables readable by anyone. The endpoint returns the seven numbers.
    fetch('/api/platform-stats')
      .then(r => r.json())
      .then(d => { if (d && typeof d.teams === 'number') setRealStats(d) })
      .catch(() => {})
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { rootRef.current?.style.setProperty('--sy', String(Math.min(window.scrollY, 1600))); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const mouseRaf = useRef(0)
  const onHeroMouse = (e: React.MouseEvent) => {
    const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5
    if (mouseRaf.current) return
    mouseRaf.current = requestAnimationFrame(() => {
      mouseRaf.current = 0
      const el = rootRef.current; if (!el) return
      el.style.setProperty('--mx', x.toFixed(3)); el.style.setProperty('--my', y.toFixed(3))
    })
  }

  const handleDashboard = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`
      else await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const canvas = dark ? '#0e0f18' : '#fff6f2'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`

  // Full-bleed feature bands (edge-to-edge colour — kills the empty sides).
  const BIG = [
    { color: BLUE, band: dark ? 'rgba(43,89,255,0.10)' : '#eef2ff', tag: 'Sell inside the chat', title: 'Turn a message into money.', body: 'Look up live WooCommerce orders, take payments, recover abandoned carts, text everyone on a waitlist the moment stock is back and record off-Stripe sales — right where the customer is talking to you. Then see the real revenue each conversation drove.', bullets: ['Live orders, refunds & payment links', 'Abandoned carts & back-in-stock waitlists', 'Revenue-per-conversation reporting'], href: '/inbox-crm#woo', visual: 'sale' as const },
    { color: GREEN, band: dark ? 'rgba(0,196,140,0.10)' : '#eafaf4', tag: 'Online booking', title: 'Bookings that fill themselves.', body: 'Customers book a service, a time and a team member on your own booking page, pay a deposit, and get SMS reminders. If plans change, they move it themselves. Every booking lands in the same thread as their messages.', bullets: ['Live staff & location availability', 'Stripe deposits and SMS reminders', 'Self-serve reschedule & cancel'], href: '/product/booking', visual: 'booking' as const },
    { color: PURPLE, band: dark ? 'rgba(124,92,255,0.10)' : '#f3efff', tag: 'Work less, close more', title: 'Automations that never sleep.', body: 'Auto-reply, route and follow up. Schedule a reply for the right moment, turn any conversation into an assignable task on a calendar, trigger order updates, and let AI draft the reply — you stay in control.', bullets: ['Order-status & follow-up automations', 'Scheduled replies — edit, send now or cancel', 'Tasks, calendar & reminders', 'AI-assisted replies with an undo'], href: '/inbox-crm#tasks', visual: 'flow' as const },
  ]

  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div ref={rootRef} className="cv-root" style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s', ['--sy' as any]: 0, ['--mx' as any]: 0, ['--my' as any]: 0 }}>
      <style>{`
        @keyframes floatY { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes popIn { 0%{opacity:0;transform:scale(0.9) translateY(10px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.25} 50%{opacity:1} }
        @keyframes wordIn { from{opacity:0;transform:translateY(0.4em)} to{opacity:1;transform:translateY(0)} }
        @keyframes hiwFill { from{width:0%} to{width:100%} }
        @keyframes livePing { 0%{transform:scale(1);opacity:.55} 80%,100%{transform:scale(2.6);opacity:0} }
        .cv-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 42px ${CORAL}66; }
        .cv-btn-primary,.cv-btn-ghost,.cv-card,.cv-navlink { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cv-btn-ghost:hover { border-color:${CORAL}; color:${CORAL}; }
        .cv-card:hover { transform:translateY(-6px); }
        .cv-navlink:hover { color:${CORAL} !important; }
        .cv-marquee-track { display:flex; width:max-content; animation:marquee 32s linear infinite; }
        .cv-suite-track::-webkit-scrollbar { display:none; }
        .cv-suite-card:hover { transform:translateY(-6px) !important; box-shadow:0 40px 90px rgba(15,17,25,0.42) !important; }
        .cv-sm{ display:none; }
        @media (max-width:900px){ .cv-prof-head{ grid-template-columns:1fr !important; align-items:start !important; } .cv-hero{ flex-direction:column !important; align-items:stretch !important; } .cv-big-row{ grid-template-columns:1fr !important; } .cv-hero-grid{ grid-template-columns:1fr !important; } .cv-desktop{ display:none !important; } .cv-mobile-toggle{ display:flex !important; } .cv-bubbles{ display:none !important; } .cv-brand-huge{ font-size:64px !important; } .cv-trust{ position:static !important; margin-top:32px; bottom:auto !important; width:100% !important; } .cv-lg{ display:none !important; } .cv-sm{ display:inline !important; } .cv-hero-cta{ flex-wrap:nowrap !important; } .cv-hero-cta > *{ flex:1 1 0 !important; min-width:0 !important; justify-content:center !important; padding-left:14px !important; padding-right:14px !important; white-space:nowrap !important; } }
        @media (prefers-reduced-motion: reduce){ .cv-marquee-track{ animation:none } [class*="cv-float"]{ animation:none !important } .cv-live-ring{ animation:none !important } .cv-hiw-bar{ animation:none !important; width:100% !important } }
        /* Below the fold: let the browser skip layout/paint (and pause the CSS
           animations) of sections until they're near the viewport. */
        .cv-root > section:nth-of-type(n+3), .cv-root > #features > section, .cv-root > footer { content-visibility:auto; contain-intrinsic-size:auto 760px; }
      `}</style>

      {/* NAV */}
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO — full-bleed, grid-lined, colour blobs bleeding off both edges */}
      <section className="cv-hero" onMouseMove={onHeroMouse} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: 'clamp(84px, 12vw, 120px) 24px 130px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 58%)' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-14%', left: '-8%', width: 460, height: 460, background: YELLOW, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.5, transform: 'translate3d(0, calc(var(--sy) * 0.12px), 0)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-12%', right: '-8%', width: 520, height: 520, background: BLUE, borderRadius: '58% 42% 45% 55% / 55% 48% 52% 45%', opacity: dark ? 0.16 : 0.14, transform: 'translate3d(0, calc(var(--sy) * -0.08px), 0)' }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
          <div className="cv-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
            {/* Left: copy */}
            <div style={{ maxWidth: 620 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 24, background: dark ? 'rgba(255,106,77,0.14)' : 'rgba(255,106,77,0.1)', border: `1px solid ${CORAL}44`, color: CORAL, fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'blink 1.6s infinite' }} /> <span className="cv-lg">Shared inbox, business phone &amp; SMS, AI-powered CRM</span><span className="cv-sm">Inbox, phone &amp; SMS, AI CRM</span>
              </div>
              <h1 style={{ fontSize: 'clamp(46px, 6.8vw, 92px)', fontWeight: 900, lineHeight: 0.97, letterSpacing: '-0.035em', margin: '0 0 24px' }}>
                Turn every chat<br />into a{' '}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <RotatingWord words={HERO_WORDS} color={CORAL} />
                  <svg viewBox="0 0 320 20" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -8, width: '100%', height: 14 }}><path d="M3 14 Q 160 2 317 12" stroke={YELLOW} strokeWidth="7" fill="none" strokeLinecap="round" /></svg>
                </span>
              </h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>
                One shared inbox for SMS, calls, Instagram, Messenger, email &amp; live chat — with a business number, an AI-powered CRM, store orders, payments and AI agents built in. For teams of every size, from your first hire to enterprise.
              </p>
              <div className="cv-hero-cta" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <InviteCta cta={{ id: 'home_hero_start_free', location: 'home' }} onClick={handleDashboard} className="cv-btn-primary" style={btnPrimary}>{user ? 'Go to dashboard' : (<><span className="cv-lg">Start free — no card</span><span className="cv-sm">Start free</span></>)}</InviteCta>
                <a href="#features" className="cv-btn-ghost" style={btnGhost}><span className="cv-lg">See how it works ↓</span><span className="cv-sm">How it works ↓</span></a>
              </div>
              <ProofStrip dark={dark} teams={realStats.teams} messages={realStats.messages} text={text} muted={muted} border={cardBorder} />
            </div>

            {/* Right: product demo + opaque bubbles kept to this side */}
            <div style={{ position: 'relative', transform: 'translate3d(0, calc(var(--sy) * -0.04px), 0)' }}>
              <div className="cv-bubbles" aria-hidden style={{ position: 'absolute', inset: '-8% -4%', zIndex: 3, pointerEvents: 'none' }}>
                {BUBBLES.map((b, i) => (
                  <div key={i} className="cv-float" style={{ position: 'absolute', left: b.x, top: b.y, transform: `translate3d(calc(var(--mx) * ${34 * b.depth}px), calc(var(--my) * ${34 * b.depth}px), 0)`, transition: 'transform 0.2s ease-out' }}>
                    <div style={{ animation: `floatY ${5 + i * 0.6}s ease-in-out ${b.delay}s infinite` }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderRadius: '16px 16px 16px 4px', background: dark ? '#171826' : '#fff', border: `1px solid ${cardBorder}`, boxShadow: '0 16px 40px rgba(15,17,25,0.16)', fontSize: 13.5, fontWeight: 700, color: text, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />{b.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div aria-hidden style={{ position: 'absolute', inset: -22, borderRadius: 40, background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, opacity: dark ? 0.42 : 0.24, filter: 'blur(30px)' }} />
              {/* Sleek device: titanium bezel wrapping the live inbox window */}
              <div style={{ position: 'relative', borderRadius: 28, padding: 8, background: 'linear-gradient(150deg, #34363f, #0b0c12 62%)', boxShadow: '0 50px 120px rgba(15,17,25,0.34), 0 0 0 1px rgba(255,255,255,0.06) inset', transform: 'perspective(1600px) rotateY(calc(-2deg + var(--mx) * -3deg)) rotateX(calc(1deg + var(--my) * 2deg)) translate(calc(var(--mx) * -8px), calc(var(--my) * -8px))', transition: 'transform 0.3s ease-out' }}>
                <div style={{ position: 'relative', borderRadius: 21, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}>
                  {/* subtle screen sheen */}
                  <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', background: 'linear-gradient(120deg, rgba(255,255,255,0.14), transparent 30%)' }} />
                  <ColvyAppDemo dark={dark} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip pinned to the bottom of the banner (ManyChat-style) */}
        <TrustStrip muted={muted} dark={dark} cardBg={cardBg} border={cardBorder} />
      </section>

      {/* BRAND MARQUEE (full-bleed) */}
      <section style={{ padding: '30px 0 34px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}`, background: canvas, overflow: 'hidden' }}>
        <p style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, margin: '0 0 22px' }}>Connects every channel &amp; tool you already use</p>
        <div style={{ position: 'relative', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div className="cv-marquee-track">{[...BRANDS, ...BRANDS].map((b, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 30px', flexShrink: 0 }}><img src={b.logo} alt="" loading="lazy" decoding="async" width={24} height={24} style={{ width: 24, height: 24, opacity: dark ? 0.85 : 0.7, filter: dark ? 'invert(1)' : 'none' }} /><span style={{ fontSize: 17, fontWeight: 800, color: muted, whiteSpace: 'nowrap' }}>{b.name}</span></div>))}</div>
        </div>
      </section>

      {/* SEE IT IN ACTION — a life-size inbox where Colvy AI and two teammates
          work side by side, their named cursors gliding about (Sellio-style). */}
      <section style={{ padding: 'clamp(56px, 8vw, 104px) 24px clamp(40px, 6vw, 72px)', background: bg }}>
        <Reveal>
          <div style={{ maxWidth: 760, margin: '0 auto clamp(28px, 4vw, 48px)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: CORAL }}>See it in action</p>
            <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.04 }}>Your whole team, one inbox.</h2>
            <p style={{ margin: 0, fontSize: 'clamp(16px, 1.7vw, 19px)', lineHeight: 1.6, color: muted }}>Colvy AI answers first, day and night. Your team picks up the rest together, in real time.</p>
          </div>
        </Reveal>
        <TeamInboxDemo />
      </section>

      {/* EVERY CHANNEL, ONE INBOX — messages travel from each channel into
          Colvy and on to whoever answers. */}
      <section style={{ padding: 'clamp(48px, 7vw, 96px) 24px', background: bg }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto clamp(32px, 5vw, 60px)', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.04 }}>Every channel, one inbox.</h2>
            <p style={{ margin: '0 0 26px', fontSize: 'clamp(16px, 1.7vw, 19px)', lineHeight: 1.6, color: muted }}>Customers write from your website, Instagram, Messenger, SMS or email, or they call. Colvy AI or the right person on your team answers, all from one place.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <InviteCta cta={{ id: 'home_channels_start_free', location: 'home' }} onClick={handleDashboard} className="cv-btn-primary" style={btnPrimary}>{user ? 'Go to dashboard' : 'Start for free'}</InviteCta>
              <a href="/demo" className="cv-btn-ghost" style={btnGhost}>Get a demo</a>
            </div>
          </div>
        </Reveal>
        <ChannelFlow />
      </section>

      {/* SCROLL STORY — pins while you scroll; colours shift and the product
          cards fly between beats (Linktree-style). Wrapped in a div so the
          below-the-fold content-visibility rule (sections only) leaves it be. */}
      <div><ScrollStory /></div>

      {/* BIG BOLD COLVY BRAND BAND (full-bleed, dark, animated capability) */}
      <section style={{ position: 'relative', background: INK, color: '#fff', padding: 'clamp(64px, 9vw, 120px) 24px', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.6 }} />
        <div aria-hidden style={{ position: 'absolute', top: '-30%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: CORAL, opacity: 0.35, filter: 'blur(90px)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-30%', left: '-6%', width: 420, height: 420, borderRadius: '50%', background: PURPLE, opacity: 0.3, filter: 'blur(90px)' }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <img src="/icon-192.png" alt="Colvy" loading="lazy" decoding="async" width={88} height={88} style={{ width: 'clamp(56px,8vw,88px)', height: 'clamp(56px,8vw,88px)', borderRadius: 'clamp(16px,2.4vw,24px)', boxShadow: `0 20px 50px rgba(0,0,0,0.5)` }} />
              <span className="cv-brand-huge" style={{ fontWeight: 900, fontSize: 'clamp(56px, 11vw, 132px)', letterSpacing: '-0.04em', lineHeight: 1 }}>Colvy</span>
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 4.4vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '0 auto', maxWidth: 900 }}>
              One platform for{' '}
              <span style={{ display: 'inline-block', minWidth: '5ch', textAlign: 'left' }}><RotatingWord words={CAPABILITIES} color={YELLOW} ms={1900} /></span>
            </h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', margin: '18px auto 0', maxWidth: 620, lineHeight: 1.6 }}>Chat, orders, payments, calls and AI summaries — the whole customer relationship, in one bold place.</p>
          </Reveal>
        </div>
      </section>

      {/* BIG-TEXT MARQUEE (ManyChat-style ticker, transparent) */}
      <section style={{ background: 'transparent', padding: 'clamp(26px, 4vw, 48px) 0', overflow: 'hidden' }}>
        <div className="cv-marquee-track" style={{ animationDuration: '30s' }}>
          {[...Array(2)].flatMap((_, dup) => MARQUEE_WORDS.map((w, i) => (
            <span key={`${dup}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 'clamp(30px, 5.5vw, 68px)', fontWeight: 900, letterSpacing: '-0.03em', color: i % 2 === 0 ? text : CORAL, whiteSpace: 'nowrap', padding: '0 28px' }}>{w}</span>
              <span aria-hidden style={{ width: 'clamp(11px,1.6vw,18px)', height: 'clamp(11px,1.6vw,18px)', borderRadius: '50%', background: i % 2 === 0 ? CORAL : YELLOW, flexShrink: 0 }} />
            </span>
          )))}
        </div>
      </section>

      {/* BIG FEATURE BANDS (full-bleed colour, edge-to-edge) */}
      <div id="features">
        {/* EVERY CUSTOMER, ONE PROFILE — Colvy's contacts with a profile
            beside them: details, value and every chat on every channel. */}
        <section style={{ background: dark ? 'rgba(255,106,77,0.10)' : '#fff1ec', padding: 'clamp(56px, 8vw, 100px) 24px', overflow: 'hidden' }}>
          <div className="cv-prof-head" style={{ maxWidth: 1200, margin: '0 auto clamp(32px, 5vw, 56px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 'clamp(20px, 4vw, 64px)', alignItems: 'end' }}>
            <Reveal>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL, color: '#fff', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>One shared inbox</span>
              <h3 style={{ fontSize: 'clamp(32px, 4.8vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0, color: text }}>Every customer, one profile.<br /><span style={{ color: dark ? 'rgba(244,245,251,0.45)' : 'rgba(15,17,25,0.4)' }}>Every chat they ever had.</span></h3>
            </Reveal>
            <Reveal delay={0.1}>
              <p style={{ fontSize: 17, color: muted, lineHeight: 1.6, margin: '0 0 16px' }}>A first message on any channel makes a contact. Orders, segments and every conversation stay on one profile, so anyone on your team can pick up the thread.</p>
              <a href="/inbox-crm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, color: text, textDecoration: 'none' }}>Explore <ArrowRight s={15} /></a>
            </Reveal>
          </div>
          <ContactsProfileDemo />
        </section>

        {BIG.map((f, i) => {
          const flip = i % 2 === 1
          return (
            <section key={f.title} style={{ background: f.band, padding: 'clamp(56px, 8vw, 100px) 24px', overflow: 'hidden' }}>
              <div className="cv-big-row" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px, 5vw, 72px)', alignItems: 'center' }}>
                <div style={{ order: flip ? 2 : 1 }}>
                  <Reveal>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: f.color, color: '#fff', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>{f.tag}</span>
                    <h3 style={{ fontSize: 'clamp(30px, 4.4vw, 52px)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.04, margin: '0 0 16px', color: text }}><BigReveal text={f.title} /></h3>
                    <p style={{ fontSize: 17.5, color: muted, lineHeight: 1.65, margin: '0 0 22px', maxWidth: 520 }}>{f.body}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {f.bullets.map(b => (<li key={b} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 15.5, fontWeight: 600, color: text }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: f.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{b}</li>))}
                    </ul>
                    <a href={f.href} className="cv-btn-primary" style={{ ...btnPrimary, background: f.color, boxShadow: `0 10px 30px ${f.color}55` }}>Explore <ArrowRight s={15} /></a>
                  </Reveal>
                </div>
                <div style={{ order: flip ? 1 : 2, display: 'flex', justifyContent: 'center' }}>
                  <Parallax strength={flip ? -0.05 : 0.05}>
                    <Reveal>
                      {f.visual === 'sale' && <SaleMock color={f.color} text={text} muted={muted} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                      {f.visual === 'booking' && <BookingMock color={f.color} text={text} muted={muted} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                      {f.visual === 'flow' && <FlowMock color={f.color} text={text} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                    </Reveal>
                  </Parallax>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* AI TEAM — the five agents, linking to /ai-agents */}
      <AgentTeamBand dark={dark} />

      {/* SUPPORT THAT FITS YOUR INDUSTRY — a photo per trade, with a customer
          question and Colvy AI's answer playing over it. */}
      <IndustryCarousel dark={dark} text={text} muted={muted} />

      {/* BEYOND THE INBOX — engagement suite carousel (slides in from the right) */}
      <FeatureSuite dark={dark} text={text} muted={muted} cardBorder={cardBorder} canvas={canvas} />

      {/* SEE HOW IT WORKS — interactive, clickable, animated (full-bleed) */}
      <HowItWorks dark={dark} cardBorder={cardBorder} />


      {/* STATS — full-bleed bold band, auto-sliding through real metrics */}
      <StatsBand stats={realStats} />

      {/* PARALLAX PHOTO BANNER */}
      <ParallaxBanner />

      {/* BIG CTA (full-bleed gradient) */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 9vw, 120px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -50, left: '6%', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -70, right: '8%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(34px, 6vw, 68px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.02, margin: '0 0 16px' }}>Ready to sell through the chat?</h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px', fontWeight: 600 }}>Free forever for small teams. Upgrade as you grow.</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: '0 0 34px' }}>No credit card · Set up in about 45 minutes · Cancel anytime</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
              <InviteCta cta={{ id: 'home_band_start_free', location: 'home' }} onClick={handleDashboard} ring={CORAL} className="cv-btn-primary" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontFamily: 'inherit', fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>{user ? 'Go to dashboard' : 'Get started — it’s free'}</InviteCta>
              {!user && <a href="/pricing" style={{ padding: '16px 30px', borderRadius: 999, border: '2px solid rgba(255,255,255,0.6)', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>See all plans</a>}
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}

// ── Lightweight animated product mocks ───────────────────────────────────────
function SaleMock({ color, text, muted, cardBg, border }: { color: string; text: string; muted: string; cardBg: string; border: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '11px 15px', borderRadius: '16px 16px 16px 4px', background: cardBg, border: `1px solid ${border}`, fontSize: 14, fontWeight: 600, color: text, animation: 'popIn 0.5s both', boxShadow: '0 10px 30px rgba(15,17,25,0.08)' }}>I&rsquo;ve just sent the payment 🙌</div>
      <div style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, background: color, color: '#fff', fontSize: 13.5, fontWeight: 800, animation: 'popIn 0.5s 0.3s both', boxShadow: `0 12px 30px ${color}55` }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>Sale recorded · $385 · Bank transfer
      </div>
      <div style={{ alignSelf: 'flex-start', width: '100%', padding: 16, borderRadius: 16, background: cardBg, border: `1px solid ${border}`, animation: 'popIn 0.5s 0.55s both', boxShadow: '0 14px 40px rgba(15,17,25,0.08)' }}>
        <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>Revenue via Colvy · 30d</p>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: text, letterSpacing: '-0.02em' }}>$18,240</p>
        <div style={{ display: 'flex', gap: 4, marginTop: 10, height: 36, alignItems: 'flex-end' }}>{[40, 62, 48, 78, 90, 68, 100].map((h, i) => <span key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: color, opacity: 0.35 + (h / 100) * 0.65 }} />)}</div>
      </div>
    </div>
  )
}
function BookingMock({ color, text, muted, cardBg, border }: { color: string; text: string; muted: string; cardBg: string; border: string }) {
  const card = { padding: 16, borderRadius: 16, background: cardBg, border: `1px solid ${border}`, boxShadow: '0 14px 40px rgba(15,17,25,0.08)' }
  return (
    <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '11px 15px', borderRadius: '16px 16px 16px 4px', background: cardBg, border: `1px solid ${border}`, fontSize: 14, fontWeight: 600, color: text, animation: 'popIn 0.5s both', boxShadow: '0 10px 30px rgba(15,17,25,0.08)' }}>Can I get my tank checked this week?</div>
      <div style={{ ...card, animation: 'popIn 0.5s 0.3s both' }}>
        <p style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>Thu 9 Oct · Aquarium health check</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {['9:00', '10:30', '11:00', '1:30', '2:00', '3:30'].map((t, i) => (
            <span key={t} style={{ padding: '8px 0', borderRadius: 9, textAlign: 'center', fontSize: 13, fontWeight: 800, background: i === 1 ? color : border, color: i === 1 ? '#fff' : text }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, background: color, color: '#fff', fontSize: 13.5, fontWeight: 800, animation: 'popIn 0.5s 0.55s both', boxShadow: `0 12px 30px ${color}55` }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Booked · 10:30am · $20 deposit paid
      </div>
      <div style={{ ...card, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10, animation: 'popIn 0.5s 0.8s both' }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, background: color + '1f', color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: text }}>SMS reminder goes out 24 hours before</span>
      </div>
    </div>
  )
}
// ── See how it works: clickable step list drives an animated phone ───────────
type Step = { title: string; desc: string; href: string; channel: string; who: string; color: string; bubbles: { side: 'them' | 'me' | 'system'; text: string; kind?: 'text' | 'image' | 'pill' | 'system' }[] }
const HIW_STEPS: Step[] = [
  { title: 'Every channel in one inbox', desc: 'Instagram, Messenger, email & SMS — one thread.', href: '/inbox-crm', channel: 'Instagram', who: 'Sam Rivera', color: '#E1306C',
    bubbles: [{ side: 'them', text: 'Hi! Do you still have the 4ft reef tank in stock? 🐠' }, { side: 'me', text: 'Hey Sam! Yes — 2 left.' }] },
  { title: 'Reply with media from your gallery', desc: 'Send saved photos & videos in a tap — mark up a photo or trim a video first.', href: '/inbox-crm#gallery', channel: 'Instagram', who: 'Sam Rivera', color: '#E1306C',
    bubbles: [{ side: 'them', text: 'Can you show me one?' }, { side: 'me', text: '', kind: 'image' }, { side: 'me', text: 'Here it is 📸' }] },
  { title: 'Take the payment in chat', desc: 'Send a payment link or record any method — right here.', href: '/inbox-crm#woo', channel: 'Instagram', who: 'Sam Rivera', color: '#E1306C',
    bubbles: [{ side: 'me', text: 'Sent you a payment link 💳' }, { side: 'them', text: "I've sent the payment 🙌" }, { side: 'me', text: 'Order #123466 · Paid ✅', kind: 'pill' }] },
  { title: 'Record the sale', desc: 'Log the revenue Colvy helped you make — even off-Stripe.', href: '/inbox-crm#woo', channel: 'Instagram', who: 'Sam Rivera', color: '#E1306C',
    bubbles: [{ side: 'me', text: 'Sale recorded · $385 · Bank transfer', kind: 'pill' }, { side: 'system', text: 'Credited to you · added to Revenue via Colvy', kind: 'system' }] },
  { title: 'Automate the follow-up', desc: 'Auto-reply, assign a task and schedule the next nudge.', href: '/inbox-crm#tasks', channel: 'Instagram', who: 'Sam Rivera', color: '#E1306C',
    bubbles: [{ side: 'system', text: 'Task created · Ship 4ft reef tank', kind: 'system' }, { side: 'system', text: 'Follow-up scheduled in 3 days', kind: 'system' }, { side: 'me', text: "Thanks Sam! We'll have this on its way today 🚚" }] },
]

function HowItWorks({ dark, cardBorder }: { dark: boolean; cardBorder: string }) {
  const [active, setActive] = useState(0)
  // Auto-advance continuously. Keying the timer on `active` means a click simply
  // jumps to that step and the cycle carries on from there (full dwell time),
  // rather than pausing.
  useEffect(() => {
    const t = setTimeout(() => setActive(a => (a + 1) % HIW_STEPS.length), 4200)
    return () => clearTimeout(t)
  }, [active])
  const pick = (i: number) => setActive(i)
  const step = HIW_STEPS[active]

  return (
    <section style={{ position: 'relative', background: '#0a0b10', padding: 'clamp(64px, 9vw, 120px) 24px', overflow: 'hidden' }}>
      {/* A faint dot grid and one warm light behind the phone: depth without decoration. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.075) 1px, transparent 1px)', backgroundSize: '22px 22px', WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 25%, transparent 75%)', maskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 25%, transparent 75%)' }} />
      <div aria-hidden className="cv-hiw-glow" style={{ position: 'absolute', right: '6%', top: '24%', width: 460, height: 460, borderRadius: '50%', background: `radial-gradient(circle, ${CORAL}2e, transparent 65%)` }} />
      <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 'clamp(28px, 4vw, 52px)' }}>
          <div>
            <p style={{ margin: '0 0 14px', fontFamily: MONO, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: CORAL }}>How it works</p>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 'clamp(32px, 4.8vw, 56px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02 }}>One conversation,<br />start to finish.</h2>
          </div>
          <p aria-live="polite" style={{ margin: 0, fontFamily: MONO, fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
            {String(active + 1).padStart(2, '0')} / {String(HIW_STEPS.length).padStart(2, '0')}
          </p>
        </div>

        <div className="cv-hiw" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'center' }}>
          {/* Left: the steps as an index — number, title, and the open one's detail */}
          <div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {HIW_STEPS.map((s, i) => {
                const on = i === active
                return (
                  <li key={s.title} style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <button onClick={() => pick(i)} aria-expanded={on}
                      style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', alignItems: 'baseline', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '19px 0', color: '#fff', font: 'inherit' }}>
                      <span style={{ fontFamily: MONO, fontSize: 12.5, color: on ? CORAL : 'rgba(255,255,255,0.32)', fontVariantNumeric: 'tabular-nums', transition: 'color 0.25s' }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 'clamp(17px, 1.9vw, 21px)', fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.25, color: on ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'color 0.25s' }}>{s.title}</span>
                      <span aria-hidden style={{ fontFamily: MONO, fontSize: 18, lineHeight: 1, marginLeft: 12, color: on ? CORAL : 'rgba(255,255,255,0.25)', transform: on ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s, color 0.25s' }}>+</span>
                    </button>
                    <div style={{ display: 'grid', gridTemplateRows: on ? '1fr' : '0fr', transition: 'grid-template-rows 0.35s ease' }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 0 20px 46px' }}>
                          <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,0.66)', maxWidth: 440 }}>{s.desc}</p>
                          <a href={s.href} tabIndex={on ? 0 : -1} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', paddingBottom: 3, borderBottom: `1px solid ${CORAL}` }}>
                            Check it out
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                          </a>
                        </div>
                      </div>
                    </div>
                    {/* This step's time on screen, drawn along its own rule. */}
                    {on && <span key={`run-${active}`} aria-hidden className="cv-hiw-bar" style={{ position: 'absolute', left: 0, bottom: -1, height: 2, width: 0, background: CORAL, boxShadow: `0 0 12px ${CORAL}`, animation: 'hiwFill 4.2s linear forwards' }} />}
                  </li>
                )
              })}
            </ol>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30, flexWrap: 'wrap' }}>
              <InviteCta cta={{ id: 'home_agents_start_free', location: 'home' }} href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 12, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: `0 12px 32px ${CORAL}40` }}>Get started free</InviteCta>
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.45)' }}>Free to start · no card</span>
            </div>
          </div>

          {/* Right: the conversation itself */}
          <div style={{ position: 'relative' }}>
            <PhoneMock step={step} activeKey={active} border={cardBorder} />
          </div>
        </div>
      </div>
      <style>{`@media (max-width:900px){ .cv-hiw{ grid-template-columns:1fr !important; } .cv-hiw-glow{ right:-20% !important; top:auto !important; bottom:4% } }`}</style>
    </section>
  )
}

// Hero social proof: real numbers only, set like an instrument read-out.
const CHANNEL_GLYPHS: { name: string; path: React.ReactNode }[] = [
  { name: 'Instagram', path: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" /></> },
  { name: 'Messenger', path: <><path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3z" /><polyline points="7.5 13.5 10.5 10.5 13 12.5 16.5 9" /></> },
  { name: 'SMS', path: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></> },
  { name: 'Email', path: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></> },
  { name: 'Phone', path: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></> },
]

function ProofStrip({ dark, teams, messages, text, muted, border }: { dark: boolean; teams: number; messages: number; text: string; muted: string; border: string }) {
  const short = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n)
  const cells: { value: string; label: string; live?: boolean }[] = [
    teams > 0 ? { value: `${short(teams)}+`, label: 'teams live', live: true } : { value: 'Now', label: 'onboarding teams', live: true },
    ...(messages > 0 ? [{ value: `${short(messages)}+`, label: 'messages' }] : []),
  ]
  const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '11px 16px', minWidth: 0 }
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, whiteSpace: 'nowrap' }
  return (
    <div className="cv-proof" style={{ display: 'inline-flex', alignItems: 'stretch', maxWidth: '100%', marginTop: 28, border: `1px solid ${border}`, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', overflow: 'hidden' }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ ...cell, borderLeft: i ? `1px solid ${border}` : 'none' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 16, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {c.live && (
              <span aria-hidden style={{ position: 'relative', width: 7, height: 7, flexShrink: 0 }}>
                <span className="cv-live-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, animation: 'livePing 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN }} />
              </span>
            )}
            {c.value}
          </span>
          <span style={label}>{c.label}</span>
        </div>
      ))}
      <div style={{ ...cell, borderLeft: `1px solid ${border}` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 19, color: text }}>
          {CHANNEL_GLYPHS.map(g => (
            <svg key={g.name} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={g.name} style={{ opacity: 0.8 }}>{g.path}</svg>
          ))}
        </span>
        <span style={label}>One inbox</span>
      </div>
      <style>{`@media (max-width:420px){ .cv-proof > div{ padding:10px 11px !important } }`}</style>
    </div>
  )
}

function PhoneMock({ step, activeKey, border }: { step: Step; activeKey: number; border: string }) {
  return (
    <div style={{ alignSelf: 'center', position: 'relative', width: 'min(300px, 100%)' }}>
      {/* side buttons */}
      <span aria-hidden style={{ position: 'absolute', left: -3, top: 132, width: 3, height: 30, borderRadius: 2, background: '#05060a' }} />
      <span aria-hidden style={{ position: 'absolute', left: -3, top: 176, width: 3, height: 54, borderRadius: 2, background: '#05060a' }} />
      <span aria-hidden style={{ position: 'absolute', left: -3, top: 240, width: 3, height: 54, borderRadius: 2, background: '#05060a' }} />
      <span aria-hidden style={{ position: 'absolute', right: -3, top: 200, width: 3, height: 78, borderRadius: 2, background: '#05060a' }} />
      {/* titanium frame */}
      <div style={{ position: 'relative', background: 'linear-gradient(145deg, #2a2c35, #0b0c12 60%)', borderRadius: 48, padding: 5, boxShadow: '0 50px 110px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06) inset' }}>
        <div style={{ background: '#05060a', borderRadius: 44, padding: 8 }}>
          <div style={{ position: 'relative', background: '#f6f7fb', borderRadius: 38, overflow: 'hidden', aspectRatio: '295 / 620', display: 'flex', flexDirection: 'column' }}>
            {/* dynamic island */}
            <div aria-hidden style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 86, height: 26, borderRadius: 999, background: '#05060a', zIndex: 3 }} />
            {/* Colvy app bar (branding) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '40px 15px 10px', background: '#fff' }}>
              <img src="/icon-192.png" alt="" width={24} height={24} style={{ borderRadius: 7, display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 14.5, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>Colvy</span>
              <span style={{ fontSize: 11, color: 'rgba(15,17,25,0.62)', fontWeight: 600 }}>Inbox</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '3px 9px', borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />Live</span>
            </div>
            {/* contact row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', background: '#fff', borderBottom: `1px solid ${border}` }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${CORAL}, ${PURPLE})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>SR</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>{step.who}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(15,17,25,0.64)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: step.color }} />via {step.channel}</p>
              </div>
            </div>
            {/* bubbles (re-mount on step change for the entry animation) */}
            <div key={activeKey} style={{ flex: 1, padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 9, overflow: 'hidden' }}>
              {step.bubbles.map((b, i) => {
                const anim = { animation: `popIn 0.45s cubic-bezier(0.16,1,0.3,1) ${i * 0.18}s both` }
                if (b.kind === 'system') return (<div key={i} style={{ ...anim, alignSelf: 'center', maxWidth: '92%', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'rgba(15,17,25,0.55)', background: '#eef1f6', padding: '7px 12px', borderRadius: 12 }}>{b.text}</div>)
                if (b.kind === 'pill') return (<div key={i} style={{ ...anim, alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 7, background: GREEN, color: '#fff', fontSize: 12, fontWeight: 800, padding: '9px 13px', borderRadius: 999 }}>{b.text}</div>)
                if (b.kind === 'image') return (<div key={i} style={{ ...anim, alignSelf: 'flex-end', width: 140, height: 98, borderRadius: '14px 14px 4px 14px', overflow: 'hidden', border: `1px solid ${border}` }}><img src="https://images.unsplash.com/photo-1520302630591-fd1c66edc19d?w=300&q=75&auto=format&fit=crop" alt="Reef tank" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>)
                const me = b.side === 'me'
                return (<div key={i} style={{ ...anim, alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%', padding: '10px 13px', borderRadius: me ? '15px 15px 4px 15px' : '15px 15px 15px 4px', background: me ? CORAL : '#fff', color: me ? '#fff' : INK, border: me ? 'none' : `1px solid ${border}`, fontSize: 13, fontWeight: 600, lineHeight: 1.45, boxShadow: me ? 'none' : '0 4px 14px rgba(15,17,25,0.05)' }}>{b.text}</div>)
              })}
            </div>
            {/* composer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px 14px', background: '#fff', borderTop: `1px solid ${border}` }}>
              <span style={{ flex: 1, fontSize: 12, color: 'rgba(15,17,25,0.6)', background: '#f1f3f8', padding: '9px 12px', borderRadius: 999 }}>Reply to Sam…</span>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: CORAL, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlowMock({ color, text, cardBg, border }: { color: string; text: string; cardBg: string; border: string }) {
  const steps = [{ t: 'New message arrives', c: color }, { t: 'Auto-reply sent', c: GREEN }, { t: 'Task created & assigned', c: BLUE }, { t: 'Follow-up scheduled', c: YELLOW }]
  return (
    <div style={{ width: '100%', maxWidth: 380 }}>
      {steps.map((s, i) => (
        <div key={s.t} style={{ animation: `popIn 0.5s ${i * 0.18}s both` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 14, background: cardBg, border: `1px solid ${border}`, boxShadow: '0 10px 30px rgba(15,17,25,0.06)' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: s.c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: text }}>{s.t}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={s.c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          {i < steps.length - 1 && <div style={{ width: 2, height: 14, background: border, margin: '0 0 0 31px' }} />}
        </div>
      ))}
    </div>
  )
}

// ── Full-bleed parallax photo banner ─────────────────────────────────────────
function ParallaxBanner() {
  const ref = useRef<HTMLDivElement>(null)
  const [off, setOff] = useState(0)
  useEffect(() => {
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (el) { const r = el.getBoundingClientRect(); setOff(((r.top + r.height / 2) - window.innerHeight / 2) * -0.14) }
        raf = 0
      })
    }
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [])
  const IMG = '/hero/landing-omni.webp'
  return (
    <section ref={ref} style={{ position: 'relative', minHeight: 'clamp(400px, 66vh, 660px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '-16%', bottom: '-16%', backgroundImage: `url(${IMG})`, backgroundSize: 'cover', backgroundPosition: 'center', transform: `translateY(${off}px) scale(1.12)`, willChange: 'transform' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(120deg, rgba(15,17,25,0.78) 0%, rgba(15,17,25,0.4) 45%, ${CORAL}cc 100%)` }} />
      <div style={{ position: 'relative', maxWidth: 860, textAlign: 'center', padding: '0 24px', color: '#fff' }}>
        <Reveal>
          <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.85)', margin: '0 0 16px' }}>Everywhere your customers are</p>
          <h2 style={{ fontSize: 'clamp(34px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02, margin: '0 0 18px' }}>Be there in every chat,<br />on every channel.</h2>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 30px', fontWeight: 500 }}>From the first hello to the fifth reorder — Colvy keeps every conversation, order and sale in one lively place.</p>
          <InviteCta cta={{ id: 'home_footer_start_free', location: 'home' }} href="/signup" ring={CORAL} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 32px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 16, textDecoration: 'none', boxShadow: '0 16px 40px rgba(0,0,0,0.28)' }}>Start free — no card</InviteCta>
        </Reveal>
      </div>
    </section>
  )
}
