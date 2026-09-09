'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import OmniInboxDemo from '@/components/OmniInboxDemo'
import MarketingFooter from '@/components/MarketingFooter'

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
const INK = '#0f1119'

// Rotating hero noun — "Turn every chat into a ___".
const HERO_WORDS = ['customer.', 'sale.', 'booking.', 'callback.', 'repeat order.', '5★ review.']
// Rotating capability line for the brand band.
const CAPABILITIES = ['making sales', 'every channel', 'phone calls', 'call summaries', 'follow-ups', 'happy customers']

// Opaque floating chat bubbles — positioned to the RIGHT half + corners so they
// never sit on the headline or body copy.
const BUBBLES = [
  { text: "I've sent the payment 🙌", color: GREEN, x: '2%', y: '6%', depth: 1.2, delay: 0 },
  { text: 'Order #123466 · Paid ✅', color: BLUE, x: '60%', y: '-2%', depth: 1.0, delay: 0.5 },
  { text: '★★★★★ thank you!', color: YELLOW, x: '88%', y: '40%', depth: 1.3, delay: 0.9 },
  { text: 'Sale recorded · $385', color: PURPLE, x: '54%', y: '86%', depth: 0.7, delay: 1.3 },
  { text: 'Can I get 2 more?', color: CORAL, x: '90%', y: '80%', depth: 0.9, delay: 1.1 },
]

// Big-text ticker just above the feature bands.
const MARQUEE_WORDS = ['One inbox for every channel', 'Sell inside the chat', 'Reply in seconds', 'Record every sale', 'Automate the follow-up', 'Never miss a customer']

const BRANDS = [
  { name: 'WhatsApp', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.svg' },
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
  { label: '4.9/5 average rating', star: true },
  { label: 'Meta Business tools', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/meta.svg' },
  { label: 'WooCommerce ready', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/woocommerce.svg' },
  { label: 'Stripe payments', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/stripe.svg' },
]

const STORIES = [
  { name: 'Sam Rivera', role: 'CEO', company: 'Roxy Aquarium', color: CORAL, photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80&auto=format&fit=crop', quote: 'A WhatsApp message becomes a paid sale without leaving the thread.', metric: '4 min setup' },
  { name: 'Aiko Tanaka', role: 'Product Lead', company: 'nePlay', color: BLUE, photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80&auto=format&fit=crop', quote: 'One shared inbox for every channel. Our team finally moves fast.', metric: '2× replies' },
  { name: 'Jordan Mills', role: 'Founder', company: 'Prexty', color: GREEN, photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80&auto=format&fit=crop', quote: 'We see the real revenue every conversation generates. Game changer.', metric: '+28 NPS' },
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
  return <span key={i} style={{ color, display: 'inline-block', animation: 'wordIn 0.55s cubic-bezier(0.16,1,0.3,1)' }}>{words[i]}</span>
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
    ...(stats.orders > 0 ? [{ v: fmtNum(stats.orders) + '+', l: 'Orders processed' }] : []),
    ...(stats.callMinutes > 0 ? [{ v: fmtNum(stats.callMinutes) + ' min', l: 'Minutes on calls' }] : []),
    ...(stats.paymentsTotal > 0 ? [{ v: '$' + fmtNum(stats.paymentsTotal) + '+', l: 'Payments handled' }] : []),
    { v: '98%', l: 'Customer satisfaction' },
    { v: '4 min', l: 'To get set up' },
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

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [realStats, setRealStats] = useState({ teams: 0, conversations: 0, messages: 0, contacts: 0, orders: 0, callMinutes: 0, paymentsTotal: 0 })
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    // Real platform metrics for the stats band. Counts are head-only (cheap);
    // the two sum-based ones pull just the numeric column (capped).
    Promise.all([
      (supabase as any).from('companies').select('*', { count: 'exact', head: true }),
      (supabase as any).from('conversations').select('*', { count: 'exact', head: true }),
      (supabase as any).from('messages').select('*', { count: 'exact', head: true }),
      (supabase as any).from('contacts').select('*', { count: 'exact', head: true }),
      (supabase as any).from('orders').select('*', { count: 'exact', head: true }),
      (supabase as any).from('calls').select('duration_seconds').limit(20000),
      (supabase as any).from('chat_payments').select('amount_cents').eq('status', 'paid').limit(20000),
    ]).then(([co, conv, msg, contacts, orders, calls, pays]: any[]) => {
      const callMinutes = Math.round((calls.data || []).reduce((s: number, r: any) => s + (r.duration_seconds || 0), 0) / 60)
      const paymentsTotal = Math.round((pays.data || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0) / 100)
      setRealStats({ teams: co.count || 0, conversations: conv.count || 0, messages: msg.count || 0, contacts: contacts.count || 0, orders: orders.count || 0, callMinutes, paymentsTotal })
    }).catch(() => {})
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const onHeroMouse = (e: React.MouseEvent) => setMouse({ x: (e.clientX / window.innerWidth - 0.5), y: (e.clientY / window.innerHeight - 0.5) })

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
  const navScrolled = scrollY > 30
  const navBg = navScrolled ? (dark ? 'rgba(10,11,18,0.82)' : 'rgba(255,255,255,0.85)') : 'transparent'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`

  // Full-bleed feature bands (edge-to-edge colour — kills the empty sides).
  const BIG = [
    { color: CORAL, band: dark ? 'rgba(255,106,77,0.10)' : '#fff1ec', tag: 'One shared inbox', title: 'Every channel. One conversation.', body: 'WhatsApp, Instagram, Messenger, email, SMS and live chat land in a single shared inbox — each message tied to a full customer profile, so anyone on your team can pick up the thread.', bullets: ['Unified omnichannel inbox', 'Full customer profile beside every chat', 'Assign, @mention and collaborate'], href: '/inbox-crm', visual: 'demo' as const },
    { color: BLUE, band: dark ? 'rgba(43,89,255,0.10)' : '#eef2ff', tag: 'Sell inside the chat', title: 'Turn a message into money.', body: 'Look up live WooCommerce orders, take payments, recover abandoned carts and record off-Stripe sales — right where the customer is talking to you. Then see the real revenue each conversation drove.', bullets: ['Live orders, refunds & payment links', 'Record bank-transfer & cash sales', 'Revenue-per-conversation reporting'], href: '/inbox-crm#woo', visual: 'sale' as const },
    { color: PURPLE, band: dark ? 'rgba(124,92,255,0.10)' : '#f3efff', tag: 'Work less, close more', title: 'Automations that never sleep.', body: 'Auto-reply, route and follow up. Turn any conversation into an assignable task on a calendar, trigger order updates, and let AI draft the reply — you stay in control.', bullets: ['Order-status & follow-up automations', 'Tasks, calendar & reminders', 'AI-assisted replies with an undo'], href: '/inbox-crm#tasks', visual: 'flow' as const },
  ]

  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes floatY { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes popIn { 0%{opacity:0;transform:scale(0.9) translateY(10px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.25} 50%{opacity:1} }
        @keyframes wordIn { from{opacity:0;transform:translateY(0.4em)} to{opacity:1;transform:translateY(0)} }
        @keyframes hiwFill { from{width:0%} to{width:100%} }
        .cv-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 42px ${CORAL}66; }
        .cv-btn-primary,.cv-btn-ghost,.cv-card,.cv-navlink { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cv-btn-ghost:hover { border-color:${CORAL}; color:${CORAL}; }
        .cv-card:hover { transform:translateY(-6px); }
        .cv-navlink:hover { color:${CORAL} !important; }
        .cv-marquee-track { display:flex; width:max-content; animation:marquee 32s linear infinite; }
        @media (max-width:900px){ .cv-big-row{ grid-template-columns:1fr !important; } .cv-hero-grid{ grid-template-columns:1fr !important; } .cv-desktop{ display:none !important; } .cv-mobile-toggle{ display:flex !important; } .cv-bubbles{ display:none !important; } .cv-brand-huge{ font-size:64px !important; } .cv-trust{ position:static !important; margin-top:36px; bottom:auto !important; } }
        @media (prefers-reduced-motion: reduce){ .cv-marquee-track{ animation:none } [class*="cv-float"]{ animation:none !important } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} />
            <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
          </a>
          <div className="cv-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!user && [
              { label: 'Inbox & CRM', href: '/inbox-crm', hot: true }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' },
            ].map((n: any) => (<a key={n.label} href={n.href} className="cv-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: n.hot ? 800 : 600, color: n.hot ? CORAL : muted, textDecoration: 'none' }}>{n.label}</a>))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            {user ? (<button onClick={handleDashboard} className="cv-btn-primary cv-desktop" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Dashboard →</button>) : (<><a href="/signin" className="cv-desktop" style={{ fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a><a href="/signup" className="cv-btn-primary cv-desktop" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Get started free</a></>)}
            <button className="cv-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
        </div>
        {mobileOpen && (
          <div style={{ background: bg, borderTop: `1px solid ${cardBorder}`, padding: '14px 24px 22px' }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' }, { label: 'Sign in', href: '/signin' }].map(n => (<a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '13px 0', fontSize: 16, fontWeight: 600, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>{n.label}</a>))}
            <button onClick={handleDashboard} style={{ ...btnPrimary, marginTop: 16, width: '100%', justifyContent: 'center' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        )}
      </nav>

      {/* HERO — full-bleed, grid-lined, colour blobs bleeding off both edges */}
      <section onMouseMove={onHeroMouse} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '120px 24px 130px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 58%)' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-14%', left: '-8%', width: 460, height: 460, background: YELLOW, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.5, transform: `translateY(${scrollY * 0.12}px)` }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-12%', right: '-8%', width: 520, height: 520, background: BLUE, borderRadius: '58% 42% 45% 55% / 55% 48% 52% 45%', opacity: dark ? 0.16 : 0.14, transform: `translateY(${scrollY * -0.08}px)` }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
          <div className="cv-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
            {/* Left: copy */}
            <div style={{ maxWidth: 620 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 24, background: dark ? 'rgba(255,106,77,0.14)' : 'rgba(255,106,77,0.1)', border: `1px solid ${CORAL}44`, color: CORAL, fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'blink 1.6s infinite' }} /> The all-in-one customer platform
              </div>
              <h1 style={{ fontSize: 'clamp(46px, 6.8vw, 92px)', fontWeight: 900, lineHeight: 0.97, letterSpacing: '-0.035em', margin: '0 0 24px' }}>
                Turn every chat<br />into a{' '}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <RotatingWord words={HERO_WORDS} color={CORAL} />
                  <svg viewBox="0 0 320 20" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -8, width: '100%', height: 14 }}><path d="M3 14 Q 160 2 317 12" stroke={YELLOW} strokeWidth="7" fill="none" strokeLinecap="round" /></svg>
                </span>
              </h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>
                One shared inbox for WhatsApp, Instagram, email, SMS &amp; live chat — with WooCommerce, payments, media and AI built in. Talk to customers and close sales, all in one place.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                <button onClick={handleDashboard} className="cv-btn-primary" style={btnPrimary}>{user ? 'Go to dashboard' : 'Start free — no card'} <ArrowRight /></button>
                <a href="#features" className="cv-btn-ghost" style={btnGhost}>See how it works ↓</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
                <div style={{ display: 'flex' }}>{[CORAL, BLUE, GREEN, YELLOW, PURPLE].map((c, i) => (<div key={i} style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: `2.5px solid ${bg}`, marginLeft: i ? -10 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>{['SC', 'MW', 'PS', 'JK', 'AR'][i]}</div>))}</div>
                <span style={{ fontSize: 13.5, color: muted }}>Loved by <strong style={{ color: text }}>{realStats.teams > 0 ? realStats.teams.toLocaleString() + '+' : 'growing'}</strong> teams · <span style={{ color: YELLOW }}>★★★★★</span></span>
              </div>
            </div>

            {/* Right: product demo + opaque bubbles kept to this side */}
            <div style={{ position: 'relative', transform: `translateY(${scrollY * -0.04}px)` }}>
              <div className="cv-bubbles" aria-hidden style={{ position: 'absolute', inset: '-8% -4%', zIndex: 3, pointerEvents: 'none' }}>
                {BUBBLES.map((b, i) => (
                  <div key={i} className="cv-float" style={{ position: 'absolute', left: b.x, top: b.y, transform: `translate(${mouse.x * 34 * b.depth}px, ${mouse.y * 34 * b.depth}px)`, transition: 'transform 0.2s ease-out' }}>
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
              <div style={{ position: 'relative', borderRadius: 28, padding: 8, background: 'linear-gradient(150deg, #34363f, #0b0c12 62%)', boxShadow: '0 50px 120px rgba(15,17,25,0.34), 0 0 0 1px rgba(255,255,255,0.06) inset', transform: `perspective(1600px) rotateY(${-2 + mouse.x * -3}deg) rotateX(${1 + mouse.y * 2}deg) translate(${mouse.x * -8}px, ${mouse.y * -8}px)`, transition: 'transform 0.3s ease-out' }}>
                <div style={{ position: 'relative', borderRadius: 21, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}>
                  {/* subtle screen sheen */}
                  <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', background: 'linear-gradient(120deg, rgba(255,255,255,0.14), transparent 30%)' }} />
                  <OmniInboxDemo dark={dark} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip pinned to the bottom of the banner (ManyChat-style) */}
        <div className="cv-trust" style={{ position: 'absolute', left: 0, right: 0, bottom: 26, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 'clamp(16px, 4vw, 44px)', padding: '0 24px', zIndex: 2 }}>
          {TRUST.map(t => (
            <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, color: muted, whiteSpace: 'nowrap' }}>
              {t.star
                ? <span style={{ color: YELLOW, letterSpacing: 1 }}>★★★★★</span>
                : <img src={t.logo} alt="" width={18} height={18} style={{ opacity: dark ? 0.8 : 0.6, filter: dark ? 'invert(1)' : 'none' }} />}
              {t.label}
            </span>
          ))}
        </div>
      </section>

      {/* BRAND MARQUEE (full-bleed) */}
      <section style={{ padding: '30px 0 34px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}`, background: canvas, overflow: 'hidden' }}>
        <p style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, margin: '0 0 22px' }}>Connects every channel &amp; tool you already use</p>
        <div style={{ position: 'relative', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div className="cv-marquee-track">{[...BRANDS, ...BRANDS].map((b, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 30px', flexShrink: 0 }}><img src={b.logo} alt={b.name} style={{ width: 24, height: 24, opacity: dark ? 0.85 : 0.7, filter: dark ? 'invert(1)' : 'none' }} /><span style={{ fontSize: 17, fontWeight: 800, color: muted, whiteSpace: 'nowrap' }}>{b.name}</span></div>))}</div>
        </div>
      </section>

      {/* BIG BOLD COLVY BRAND BAND (full-bleed, dark, animated capability) */}
      <section style={{ position: 'relative', background: INK, color: '#fff', padding: 'clamp(64px, 9vw, 120px) 24px', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.6 }} />
        <div aria-hidden style={{ position: 'absolute', top: '-30%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: CORAL, opacity: 0.35, filter: 'blur(90px)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-30%', left: '-6%', width: 420, height: 420, borderRadius: '50%', background: PURPLE, opacity: 0.3, filter: 'blur(90px)' }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <img src="/icon-512.png" alt="Colvy" style={{ width: 'clamp(56px,8vw,88px)', height: 'clamp(56px,8vw,88px)', borderRadius: 'clamp(16px,2.4vw,24px)', boxShadow: `0 20px 50px rgba(0,0,0,0.5)` }} />
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
                      {f.visual === 'demo' && <div style={{ width: '100%', maxWidth: 520, borderRadius: 20, overflow: 'hidden', border: `1px solid ${cardBorder}`, boxShadow: '0 30px 70px rgba(15,17,25,0.18)' }}><OmniInboxDemo dark={dark} /></div>}
                      {f.visual === 'sale' && <SaleMock color={f.color} text={text} muted={muted} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                      {f.visual === 'flow' && <FlowMock color={f.color} text={text} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                    </Reveal>
                  </Parallax>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* SEE HOW IT WORKS — interactive, clickable, animated (full-bleed) */}
      <HowItWorks dark={dark} cardBorder={cardBorder} />


      {/* STATS — full-bleed bold band, auto-sliding through real metrics */}
      <StatsBand stats={realStats} />

      {/* PARALLAX PHOTO BANNER */}
      <ParallaxBanner />

      {/* TESTIMONIALS */}
      <section style={{ padding: 'clamp(64px, 9vw, 110px) 24px', background: bg }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal><h2 style={{ textAlign: 'center', fontSize: 'clamp(28px, 4.4vw, 48px)', fontWeight: 900, letterSpacing: '-0.025em', margin: '0 0 48px', color: text }}>Teams that switched, <span style={{ color: CORAL }}>and stayed</span></h2></Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {STORIES.map((t, i) => (<Reveal key={t.name} delay={i * 0.06}><div className="cv-card" style={{ padding: 28, borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, height: '100%', display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', gap: 3, marginBottom: 14, color: YELLOW }}>{[...Array(5)].map((_, j) => <svg key={j} width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>)}</div><p style={{ fontSize: 16, lineHeight: 1.65, color: text, fontWeight: 600, margin: '0 0 22px', flex: 1 }}>&ldquo;{t.quote}&rdquo;</p><div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={t.photo} alt={t.name} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} /><div><p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: text }}>{t.name}</p><p style={{ margin: 0, fontSize: 12.5, color: muted }}>{t.role} · {t.company}</p></div></div><span style={{ padding: '5px 11px', borderRadius: 999, background: t.color + '1a', color: t.color, fontSize: 12, fontWeight: 800 }}>{t.metric}</span></div></div></Reveal>))}
          </div>
        </div>
      </section>

      {/* BIG CTA (full-bleed gradient) */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 9vw, 120px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -50, left: '6%', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -70, right: '8%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(34px, 6vw, 68px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.02, margin: '0 0 16px' }}>Ready to sell through the chat?</h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px', fontWeight: 600 }}>Free forever for small teams. Upgrade as you grow.</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: '0 0 34px' }}>No credit card · Set up in 4 minutes · Cancel anytime</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
              <button onClick={handleDashboard} className="cv-btn-primary" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>{user ? 'Go to dashboard' : 'Get started — it’s free'} <ArrowRight /></button>
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
// ── See how it works: clickable step list drives an animated phone ───────────
type Step = { title: string; desc: string; href: string; channel: string; who: string; color: string; bubbles: { side: 'them' | 'me'; text: string; kind?: 'text' | 'image' | 'pill' | 'system' }[] }
const HIW_STEPS: Step[] = [
  { title: 'Every channel in one inbox', desc: 'WhatsApp, Instagram, Messenger, email & SMS — one thread.', href: '/inbox-crm', channel: 'WhatsApp', who: 'Sam Rivera', color: '#25D366',
    bubbles: [{ side: 'them', text: 'Hi! Do you still have the 4ft reef tank in stock? 🐠' }, { side: 'me', text: 'Hey Sam! Yes — 2 left in Sydney.' }] },
  { title: 'Reply with media from your gallery', desc: 'Send saved photos & videos without leaving the chat.', href: '/inbox-crm#gallery', channel: 'WhatsApp', who: 'Sam Rivera', color: '#25D366',
    bubbles: [{ side: 'them', text: 'Can you show me one?' }, { side: 'me', text: '', kind: 'image' }, { side: 'me', text: 'Here it is 📸' }] },
  { title: 'Take the payment in chat', desc: 'Send a payment link or record any method — right here.', href: '/inbox-crm#woo', channel: 'WhatsApp', who: 'Sam Rivera', color: '#25D366',
    bubbles: [{ side: 'me', text: 'Sent you a payment link 💳' }, { side: 'them', text: "I've sent the payment 🙌" }, { side: 'me', text: 'Order #123466 · Paid ✅', kind: 'pill' }] },
  { title: 'Record the sale', desc: 'Log the revenue Colvy helped you make — even off-Stripe.', href: '/inbox-crm#woo', channel: 'WhatsApp', who: 'Sam Rivera', color: '#25D366',
    bubbles: [{ side: 'me', text: 'Sale recorded · $385 · Bank transfer', kind: 'pill' }, { side: 'system', text: 'Credited to you · added to Revenue via Colvy', kind: 'system' }] },
  { title: 'Automate the follow-up', desc: 'Auto-reply, assign a task and schedule the next nudge.', href: '/inbox-crm#tasks', channel: 'WhatsApp', who: 'Sam Rivera', color: '#25D366',
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
    <section style={{ background: 'linear-gradient(155deg, #5b7cf0 0%, #6d6ef0 55%, #8b74f0 100%)', padding: 'clamp(56px, 8vw, 104px) 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ color: '#fff', fontSize: 'clamp(28px, 4.4vw, 50px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 44px' }}>See how it works</h2>
        <div className="cv-hiw" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'stretch' }}>
          {/* Left: clickable list */}
          <div style={{ background: '#fff', borderRadius: 24, padding: 'clamp(20px, 2.6vw, 34px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              {HIW_STEPS.map((s, i) => {
                const on = i === active
                return (
                  <button key={s.title} onClick={() => pick(i)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 14, padding: on ? '16px 16px' : '14px 16px', marginBottom: 6, background: on ? (dark ? '#f1f3f9' : '#f4f6fb') : 'transparent', transition: 'all 0.25s' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? BLUE : '#cbd2e0', flexShrink: 0, transition: 'background 0.25s' }} />
                      <span style={{ fontSize: 'clamp(16px, 1.8vw, 19px)', fontWeight: 800, color: INK, letterSpacing: '-0.01em' }}>{s.title}</span>
                    </span>
                    <span style={{ display: 'grid', gridTemplateRows: on ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s ease', paddingLeft: 18 }}>
                      <span style={{ overflow: 'hidden' }}>
                        <span style={{ display: 'block', fontSize: 14, color: 'rgba(15,17,25,0.6)', lineHeight: 1.5, margin: '6px 0 8px' }}>{s.desc}</span>
                        <a href={s.href} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: BLUE, textDecoration: 'none' }}>
                          Check it out
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </a>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <a href="/signup" style={{ marginTop: 14, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', borderRadius: 999, background: INK, color: '#fff', fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>Get started free</a>
          </div>

          {/* Right: animated phone */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
            <PhoneMock step={step} activeKey={active} border={cardBorder} />
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: 600, lineHeight: 1.5, borderLeft: '3px solid rgba(255,255,255,0.5)', paddingLeft: 14, margin: 0, maxWidth: 360, alignSelf: 'flex-start' }}>{step.desc}</p>
          </div>
        </div>

        {/* Progress timeline — fills as each step auto-plays; click to jump */}
        <div style={{ display: 'flex', gap: 8, maxWidth: 620, margin: '34px auto 0' }}>
          {HIW_STEPS.map((s, i) => (
            <button key={s.title} onClick={() => pick(i)} aria-label={s.title}
              style={{ flex: 1, height: 6, padding: 0, border: 'none', borderRadius: 99, background: 'rgba(255,255,255,0.28)', overflow: 'hidden', cursor: 'pointer' }}>
              <span
                key={i === active ? `run-${active}` : `seg-${i}`}
                style={{ display: 'block', height: '100%', background: '#fff', borderRadius: 99, transformOrigin: 'left', width: i < active ? '100%' : '0%', animation: i === active ? 'hiwFill 4.2s linear forwards' : 'none' }}
              />
            </button>
          ))}
        </div>
      </div>
      <style>{`@media (max-width:900px){ .cv-hiw{ grid-template-columns:1fr !important; } }`}</style>
    </section>
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
              <img src="/icon-512.png" alt="Colvy" width={24} height={24} style={{ borderRadius: 7, display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 14.5, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>Colvy</span>
              <span style={{ fontSize: 11, color: 'rgba(15,17,25,0.4)', fontWeight: 600 }}>Inbox</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '3px 9px', borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />Live</span>
            </div>
            {/* contact row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', background: '#fff', borderBottom: `1px solid ${border}` }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${CORAL}, ${PURPLE})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>SR</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>{step.who}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(15,17,25,0.5)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: step.color }} />via {step.channel}</p>
              </div>
            </div>
            {/* bubbles (re-mount on step change for the entry animation) */}
            <div key={activeKey} style={{ flex: 1, padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 9, overflow: 'hidden' }}>
              {step.bubbles.map((b, i) => {
                const anim = { animation: `popIn 0.45s cubic-bezier(0.16,1,0.3,1) ${i * 0.18}s both` }
                if (b.kind === 'system') return (<div key={i} style={{ ...anim, alignSelf: 'center', maxWidth: '92%', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'rgba(15,17,25,0.55)', background: '#eef1f6', padding: '7px 12px', borderRadius: 12 }}>{b.text}</div>)
                if (b.kind === 'pill') return (<div key={i} style={{ ...anim, alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 7, background: GREEN, color: '#fff', fontSize: 12, fontWeight: 800, padding: '9px 13px', borderRadius: 999 }}>{b.text}</div>)
                if (b.kind === 'image') return (<div key={i} style={{ ...anim, alignSelf: 'flex-end', width: 140, height: 98, borderRadius: '14px 14px 4px 14px', overflow: 'hidden', border: `1px solid ${border}` }}><img src="https://images.unsplash.com/photo-1520302630591-fd1c66edc19d?w=400&q=80&auto=format&fit=crop" alt="Reef tank" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>)
                const me = b.side === 'me'
                return (<div key={i} style={{ ...anim, alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%', padding: '10px 13px', borderRadius: me ? '15px 15px 4px 15px' : '15px 15px 15px 4px', background: me ? CORAL : '#fff', color: me ? '#fff' : INK, border: me ? 'none' : `1px solid ${border}`, fontSize: 13, fontWeight: 600, lineHeight: 1.45, boxShadow: me ? 'none' : '0 4px 14px rgba(15,17,25,0.05)' }}>{b.text}</div>)
              })}
            </div>
            {/* composer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px 14px', background: '#fff', borderTop: `1px solid ${border}` }}>
              <span style={{ flex: 1, fontSize: 12, color: 'rgba(15,17,25,0.4)', background: '#f1f3f8', padding: '9px 12px', borderRadius: 999 }}>Reply to Sam…</span>
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
  const IMG = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80&auto=format&fit=crop'
  return (
    <section ref={ref} style={{ position: 'relative', minHeight: 'clamp(400px, 66vh, 660px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '-16%', bottom: '-16%', backgroundImage: `url(${IMG})`, backgroundSize: 'cover', backgroundPosition: 'center', transform: `translateY(${off}px) scale(1.12)`, willChange: 'transform' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(120deg, rgba(15,17,25,0.78) 0%, rgba(15,17,25,0.4) 45%, ${CORAL}cc 100%)` }} />
      <div style={{ position: 'relative', maxWidth: 860, textAlign: 'center', padding: '0 24px', color: '#fff' }}>
        <Reveal>
          <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.85)', margin: '0 0 16px' }}>Everywhere your customers are</p>
          <h2 style={{ fontSize: 'clamp(34px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02, margin: '0 0 18px' }}>Be there in every chat,<br />on every channel.</h2>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 30px', fontWeight: 500 }}>From the first hello to the fifth reorder — Colvy keeps every conversation, order and sale in one lively place.</p>
          <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 32px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 16, textDecoration: 'none', boxShadow: '0 16px 40px rgba(0,0,0,0.28)' }}>Start free — no card <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg></a>
        </Reveal>
      </div>
    </section>
  )
}
