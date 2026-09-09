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

// Placeholder "animated photos" for the demo band — swap these for real product
// shots / GIFs later; they crossfade with a slow Ken-Burns zoom.
const DEMO_PHOTOS = [
  { src: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1400&q=80&auto=format&fit=crop', cap: 'Reply across every channel from one inbox' },
  { src: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&q=80&auto=format&fit=crop', cap: 'Take the sale without leaving the chat' },
  { src: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=1400&q=80&auto=format&fit=crop', cap: 'Orders, payments & history side by side' },
  { src: 'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=1400&q=80&auto=format&fit=crop', cap: 'Every conversation, one customer profile' },
]

// Opaque floating chat bubbles — positioned to the RIGHT half + corners so they
// never sit on the headline or body copy.
const BUBBLES = [
  { text: "I've sent the payment 🙌", color: GREEN, x: '2%', y: '6%', depth: 1.2, delay: 0 },
  { text: 'Order #123466 · Paid ✅', color: BLUE, x: '60%', y: '-2%', depth: 1.0, delay: 0.5 },
  { text: '★★★★★ thank you!', color: YELLOW, x: '88%', y: '40%', depth: 1.3, delay: 0.9 },
  { text: 'Sale recorded · $385', color: PURPLE, x: '54%', y: '86%', depth: 0.7, delay: 1.3 },
  { text: 'Can I get 2 more?', color: CORAL, x: '90%', y: '80%', depth: 0.9, delay: 1.1 },
]

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
function useCycle(len: number, ms: number) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % len), ms); return () => clearInterval(t) }, [len, ms])
  return i
}
function RotatingWord({ words, color, ms = 2100 }: { words: string[]; color?: string; ms?: number }) {
  const i = useCycle(words.length, ms)
  return <span key={i} style={{ color, display: 'inline-block', animation: 'wordIn 0.55s cubic-bezier(0.16,1,0.3,1)' }}>{words[i]}</span>
}

const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

// ── Animated demo photos (crossfade + slow zoom) ─────────────────────────────
function AnimatedPhotos({ border }: { border: string }) {
  const i = useCycle(DEMO_PHOTOS.length, 3200)
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 24, overflow: 'hidden', border: `1px solid ${border}`, boxShadow: '0 40px 100px rgba(15,17,25,0.22)', background: '#000' }}>
      {DEMO_PHOTOS.map((p, idx) => (
        <img key={p.src} src={p.src} alt={p.cap} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: idx === i ? 1 : 0, transform: idx === i ? 'scale(1.08)' : 'scale(1)', transition: 'opacity 1s ease, transform 3.6s ease', willChange: 'opacity, transform' }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(15,17,25,0.72))' }} />
      <div style={{ position: 'absolute', left: 20, bottom: 18, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span key={i} style={{ color: '#fff', fontSize: 'clamp(15px, 2vw, 20px)', fontWeight: 800, animation: 'wordIn 0.5s ease', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>{DEMO_PHOTOS[i].cap}</span>
        <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
          {DEMO_PHOTOS.map((_, idx) => <span key={idx} style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 99, background: idx === i ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width 0.4s ease' }} />)}
        </span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [realStats, setRealStats] = useState({ teams: 0, ideas: 0 })
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    Promise.all([
      (supabase as any).from('companies').select('*', { count: 'exact', head: true }),
      (supabase as any).from('ideas').select('*', { count: 'exact', head: true }),
    ]).then(([coRes, ideaRes]) => setRealStats({ teams: coRes.count || 0, ideas: ideaRes.count || 0 })).catch(() => {})
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
        .cv-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 42px ${CORAL}66; }
        .cv-btn-primary,.cv-btn-ghost,.cv-card,.cv-navlink { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cv-btn-ghost:hover { border-color:${CORAL}; color:${CORAL}; }
        .cv-card:hover { transform:translateY(-6px); }
        .cv-navlink:hover { color:${CORAL} !important; }
        .cv-marquee-track { display:flex; width:max-content; animation:marquee 32s linear infinite; }
        @media (max-width:900px){ .cv-big-row{ grid-template-columns:1fr !important; } .cv-hero-grid{ grid-template-columns:1fr !important; } .cv-desktop{ display:none !important; } .cv-mobile-toggle{ display:flex !important; } .cv-bubbles{ display:none !important; } .cv-brand-huge{ font-size:64px !important; } }
        @media (prefers-reduced-motion: reduce){ .cv-marquee-track{ animation:none } [class*="cv-float"]{ animation:none !important } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18 }}>C</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
          </a>
          <div className="cv-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!user && [
              { label: 'Inbox & CRM', href: '/inbox-crm', hot: true }, { label: 'Ideas', href: '/features/ideas' }, { label: 'Roadmap', href: '/features/roadmap' }, { label: 'Announcements', href: '/features/announcements' }, { label: 'Pricing', href: '/pricing' },
            ].map((n: any) => (<a key={n.label} href={n.href} className="cv-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: n.hot ? 800 : 600, color: n.hot ? CORAL : muted, textDecoration: 'none' }}>{n.label}</a>))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            {user ? (<button onClick={handleDashboard} className="cv-btn-primary" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Dashboard →</button>) : (<><a href="/signin" className="cv-desktop" style={{ fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a><a href="/signup" className="cv-btn-primary" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Get started free</a></>)}
            <button className="cv-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
        </div>
        {mobileOpen && (
          <div style={{ background: bg, borderTop: `1px solid ${cardBorder}`, padding: '14px 24px 22px' }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/features/ideas' }, { label: 'Roadmap', href: '/features/roadmap' }, { label: 'Announcements', href: '/features/announcements' }, { label: 'Pricing', href: '/pricing' }, { label: 'Sign in', href: '/signin' }].map(n => (<a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '13px 0', fontSize: 16, fontWeight: 600, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>{n.label}</a>))}
            <button onClick={handleDashboard} style={{ ...btnPrimary, marginTop: 16, width: '100%', justifyContent: 'center' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        )}
      </nav>

      {/* HERO — full-bleed, grid-lined, colour blobs bleeding off both edges */}
      <section onMouseMove={onHeroMouse} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '120px 24px 70px', overflow: 'hidden' }}>
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
              <div aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: 34, background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, opacity: dark ? 0.4 : 0.26, filter: 'blur(6px)' }} />
              <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', border: `1px solid ${cardBorder}`, background: cardBg, boxShadow: '0 40px 100px rgba(15,17,25,0.22)', transform: `rotate(-1.2deg) translate(${mouse.x * -10}px, ${mouse.y * -10}px)`, transition: 'transform 0.25s ease-out' }}>
                <OmniInboxDemo dark={dark} />
              </div>
            </div>
          </div>
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
              <span style={{ width: 'clamp(56px,8vw,88px)', height: 'clamp(56px,8vw,88px)', borderRadius: 'clamp(16px,2.4vw,24px)', background: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 'clamp(34px,5vw,56px)', boxShadow: `0 20px 50px ${CORAL}66` }}>C</span>
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
                    <h3 style={{ fontSize: 'clamp(30px, 4.4vw, 52px)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.04, margin: '0 0 16px', color: text }}>{f.title}</h3>
                    <p style={{ fontSize: 17.5, color: muted, lineHeight: 1.65, margin: '0 0 22px', maxWidth: 520 }}>{f.body}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {f.bullets.map(b => (<li key={b} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 15.5, fontWeight: 600, color: text }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: f.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{b}</li>))}
                    </ul>
                    <a href={f.href} className="cv-btn-primary" style={{ ...btnPrimary, background: f.color, boxShadow: `0 10px 30px ${f.color}55` }}>Explore <ArrowRight s={15} /></a>
                  </Reveal>
                </div>
                <div style={{ order: flip ? 1 : 2, display: 'flex', justifyContent: 'center' }}>
                  <Reveal>
                    {f.visual === 'demo' && <div style={{ width: '100%', maxWidth: 520, borderRadius: 20, overflow: 'hidden', border: `1px solid ${cardBorder}`, boxShadow: '0 30px 70px rgba(15,17,25,0.18)' }}><OmniInboxDemo dark={dark} /></div>}
                    {f.visual === 'sale' && <SaleMock color={f.color} text={text} muted={muted} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                    {f.visual === 'flow' && <FlowMock color={f.color} text={text} cardBg={dark ? '#171826' : '#fff'} border={cardBorder} />}
                  </Reveal>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* ANIMATED DEMO PHOTOS (short, crossfading) */}
      <section style={{ background: canvas, padding: 'clamp(64px, 9vw, 110px) 24px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CORAL, margin: '0 0 12px' }}>See it in action</p>
              <h2 style={{ fontSize: 'clamp(30px, 4.8vw, 54px)', fontWeight: 900, letterSpacing: '-0.025em', margin: 0, color: text }}>A chat becomes a sale</h2>
            </div>
          </Reveal>
          <Reveal><AnimatedPhotos border={cardBorder} /></Reveal>
        </div>
      </section>

      {/* STATS — full-bleed bold band */}
      <section style={{ background: CORAL, color: '#fff', padding: 'clamp(56px, 8vw, 92px) 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 28 }}>
          {[
            { value: realStats.teams > 0 ? realStats.teams.toLocaleString() + '+' : '12,000+', label: 'Teams on Colvy' },
            { value: realStats.ideas > 1000 ? (realStats.ideas / 1000).toFixed(1) + 'K' : (realStats.ideas > 0 ? realStats.ideas.toLocaleString() : '2.4M'), label: 'Conversations handled' },
            { value: '98%', label: 'Customer satisfaction' },
            { value: '4 min', label: 'To get set up' },
          ].map((s, i) => (<Reveal key={s.label} delay={i * 0.06}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 'clamp(38px, 5.5vw, 64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div><div style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.85)', marginTop: 8, fontWeight: 600 }}>{s.label}</div></div></Reveal>))}
        </div>
      </section>

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
