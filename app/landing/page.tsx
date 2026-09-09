'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import OmniInboxDemo from '@/components/OmniInboxDemo'
import MarketingFooter from '@/components/MarketingFooter'

// ─────────────────────────────────────────────────────────────────────────────
// Colvy landing — bright, bold and kinetic (ManyChat-energy): oversized type,
// scroll + mouse parallax, floating chat bubbles, big colour-block feature rows,
// a video showcase (slots ready for real product/user videos) and the live
// omnichannel inbox demo as the centrepiece. Light-first with a dark toggle.
// ─────────────────────────────────────────────────────────────────────────────

// Brand + playful accent palette.
const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const PURPLE = '#7c5cff'
const PINK = '#ff4d8d'

// ── Video slots ──────────────────────────────────────────────────────────────
// Drop real URLs in here later (MP4 or YouTube) and they play in the modal with
// zero other changes. Empty url ⇒ the card shows a tasteful "coming soon" state.
const HERO_VIDEO = { url: '', poster: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80&auto=format&fit=crop', label: 'Watch the 2-minute tour' }
const USER_STORIES: { name: string; role: string; company: string; poster: string; url: string; quote: string; metric: string; color: string }[] = [
  { name: 'Sam Rivera', role: 'CEO', company: 'Roxy Aquarium', color: CORAL, url: '',
    poster: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80&auto=format&fit=crop',
    quote: 'A WhatsApp message becomes a paid sale without leaving the thread.', metric: '4 min setup' },
  { name: 'Aiko Tanaka', role: 'Product Lead', company: 'nePlay', color: BLUE, url: '',
    poster: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&q=80&auto=format&fit=crop',
    quote: 'One shared inbox for every channel. Our team finally moves fast.', metric: '2× replies' },
  { name: 'Jordan Mills', role: 'Founder', company: 'Prexty', color: GREEN, url: '',
    poster: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&q=80&auto=format&fit=crop',
    quote: 'We see the real revenue every conversation generates. Game changer.', metric: '+28 NPS' },
]

// Floating chat bubbles for the hero — Colvy is conversations, so the hero is
// made of them.
const BUBBLES = [
  { text: "I've sent the payment 🙌", color: GREEN, x: '6%', y: '20%', depth: 1.4, delay: 0 },
  { text: 'Order #123466 · Paid ✅', color: BLUE, x: '80%', y: '16%', depth: 1.1, delay: 0.6 },
  { text: 'Can I get 2 more? ', color: CORAL, x: '10%', y: '68%', depth: 0.8, delay: 1.2 },
  { text: '★★★★★ thank you!', color: YELLOW, x: '82%', y: '66%', depth: 1.25, delay: 0.9 },
  { text: 'Sale recorded · $385', color: PURPLE, x: '68%', y: '84%', depth: 0.6, delay: 1.5 },
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

// ── Small hooks / helpers ────────────────────────────────────────────────────
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
  return (
    <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>
      {children}
    </div>
  )
}

const ArrowRight = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
)
const PlayIcon = ({ s = 22 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4" /></svg>
)
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

// ── Video modal (YouTube / MP4 / graceful "coming soon") ─────────────────────
function VideoModal({ open, url, poster, title, onClose }: { open: boolean; url: string; poster?: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(6,8,20,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 0.25s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(960px, 96vw)', aspectRatio: '16 / 9', borderRadius: 20, overflow: 'hidden', background: '#000', boxShadow: '0 40px 120px rgba(0,0,0,0.5)', position: 'relative' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, width: 40, height: 40, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CloseIcon /></button>
        {yt ? (
          <iframe src={`https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`} title={title || 'Video'} allow="autoplay; encrypted-media; fullscreen" allowFullScreen style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : url ? (
          <video src={url} poster={poster} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        ) : (
          // Placeholder state — no video wired yet.
          <div style={{ position: 'absolute', inset: 0, backgroundImage: poster ? `linear-gradient(rgba(10,12,24,0.55),rgba(10,12,24,0.72)), url(${poster})` : `linear-gradient(135deg, ${CORAL}, ${PINK})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32, color: '#fff' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><PlayIcon s={26} /></div>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{title || 'Video coming soon'}</p>
            <p style={{ margin: '8px 0 20px', fontSize: 15, opacity: 0.85, maxWidth: 420 }}>We&rsquo;re finishing this one. Want the real thing right now? Start free and see it live in your own inbox.</p>
            <a href="/signup" style={{ padding: '12px 26px', borderRadius: 999, background: '#fff', color: '#111', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>Start free →</a>
          </div>
        )}
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
  const [video, setVideo] = useState<{ url: string; poster?: string; title?: string } | null>(null)

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

  const onHeroMouse = (e: React.MouseEvent) => {
    const w = window.innerWidth, h = window.innerHeight
    setMouse({ x: (e.clientX / w - 0.5), y: (e.clientY / h - 0.5) })
  }

  const handleDashboard = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`
      else await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  // Theme tokens.
  const bg = dark ? '#0a0b12' : '#ffffff'
  const canvas = dark ? '#0e0f18' : '#fff6f2'
  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const dim = dark ? 'rgba(244,245,251,0.34)' : 'rgba(15,17,25,0.4)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const navScrolled = scrollY > 30
  const navBg = navScrolled ? (dark ? 'rgba(10,11,18,0.82)' : 'rgba(255,255,255,0.85)') : 'transparent'

  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'

  // Big alternating feature rows (ManyChat-style colour blocks).
  const BIG = [
    { color: CORAL, tag: 'One shared inbox', title: 'Every channel. One conversation.', body: 'WhatsApp, Instagram, Messenger, email, SMS and live chat land in a single shared inbox — each message tied to a full customer profile, so anyone on your team can pick up the thread.', bullets: ['Unified omnichannel inbox', 'Full customer profile beside every chat', 'Assign, @mention and collaborate'], href: '/inbox-crm', visual: 'demo' as const },
    { color: BLUE, tag: 'Sell inside the chat', title: 'Turn a message into money.', body: 'Look up live WooCommerce orders, take payments, recover abandoned carts and record off-Stripe sales — right where the customer is talking to you. Then see the real revenue each conversation drove.', bullets: ['Live orders, refunds & payment links', 'Record bank-transfer & cash sales', 'Revenue-per-conversation reporting'], href: '/inbox-crm#woo', visual: 'sale' as const },
    { color: PURPLE, tag: 'Work less, close more', title: 'Automations that never sleep.', body: 'Auto-reply, route and follow up. Turn any conversation into an assignable task on a calendar, trigger order updates, and let AI draft the reply — you stay in control.', bullets: ['Order-status & follow-up automations', 'Tasks, calendar & reminders', 'AI-assisted replies with an undo'], href: '/inbox-crm#tasks', visual: 'flow' as const },
  ]

  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes floatY { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-16px)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes popIn { 0%{opacity:0;transform:scale(0.9) translateY(10px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.25} 50%{opacity:1} }
        .cv-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 42px ${CORAL}66; }
        .cv-btn-primary, .cv-btn-ghost, .cv-card, .cv-play, .cv-navlink { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cv-btn-ghost:hover { border-color:${CORAL}; color:${CORAL}; }
        .cv-card:hover { transform:translateY(-6px); }
        .cv-play:hover { transform:scale(1.08); }
        .cv-navlink:hover { color:${CORAL} !important; }
        .cv-marquee-track { display:flex; width:max-content; animation:marquee 32s linear infinite; }
        .cv-story:hover .cv-story-media { transform:scale(1.04); }
        .cv-story-media { transition:transform 0.5s cubic-bezier(0.16,1,0.3,1); }
        @media (max-width:860px){ .cv-big-row{ grid-template-columns:1fr !important; } .cv-hero-grid{ grid-template-columns:1fr !important; } .cv-desktop{ display:none !important; } .cv-mobile-toggle{ display:flex !important; } }
        @media (prefers-reduced-motion: reduce){ .cv-marquee-track{ animation:none } [class*="cv-float"]{ animation:none !important } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1220, margin: '0 auto', padding: '0 22px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 17 }}>C</span>
            <span style={{ fontWeight: 900, fontSize: 21, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
          </a>
          <div className="cv-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!user && [
              { label: 'Inbox & CRM', href: '/inbox-crm', hot: true },
              { label: 'Ideas', href: '/features/ideas' },
              { label: 'Roadmap', href: '/features/roadmap' },
              { label: 'Announcements', href: '/features/announcements' },
              { label: 'Pricing', href: '/pricing' },
            ].map((n: any) => (
              <a key={n.label} href={n.href} className="cv-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: n.hot ? 800 : 600, color: n.hot ? CORAL : muted, textDecoration: 'none' }}>{n.label}</a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            {user ? (
              <button onClick={handleDashboard} className="cv-btn-primary" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Dashboard →</button>
            ) : (
              <>
                <a href="/signin" className="cv-desktop" style={{ fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a>
                <a href="/signup" className="cv-btn-primary" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>Get started free</a>
              </>
            )}
            <button className="cv-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
        </div>
        {mobileOpen && (
          <div style={{ background: bg, borderTop: `1px solid ${cardBorder}`, padding: '14px 22px 22px' }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/features/ideas' }, { label: 'Roadmap', href: '/features/roadmap' }, { label: 'Announcements', href: '/features/announcements' }, { label: 'Pricing', href: '/pricing' }, { label: 'Sign in', href: '/signin' }].map(n => (
              <a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '13px 0', fontSize: 16, fontWeight: 600, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>{n.label}</a>
            ))}
            <button onClick={handleDashboard} style={{ ...btnPrimary, marginTop: 16, width: '100%', justifyContent: 'center' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section onMouseMove={onHeroMouse} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '120px 22px 70px', overflow: 'hidden', background: `radial-gradient(1100px 620px at 50% -8%, ${dark ? 'rgba(255,106,77,0.16)' : 'rgba(255,106,77,0.14)'}, transparent 60%)` }}>
        {/* Big soft colour blobs (flat, not blurry-orb cliché) */}
        <div aria-hidden style={{ position: 'absolute', top: '-8%', left: '-6%', width: 320, height: 320, background: YELLOW, borderRadius: '42% 58% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.35, transform: `translateY(${scrollY * 0.12}px)`, filter: 'blur(2px)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '4%', right: '-5%', width: 380, height: 380, background: BLUE, borderRadius: '58% 42% 45% 55% / 55% 48% 52% 45%', opacity: dark ? 0.16 : 0.16, transform: `translateY(${scrollY * -0.08}px)` }} />

        {/* Floating chat bubbles (mouse + scroll parallax) */}
        {BUBBLES.map((b, i) => (
          <div key={i} className="cv-float" aria-hidden style={{
            position: 'absolute', left: b.x, top: b.y, zIndex: 1,
            transform: `translate(${mouse.x * 40 * b.depth}px, ${mouse.y * 40 * b.depth + scrollY * (0.05 * b.depth)}px)`,
            transition: 'transform 0.2s ease-out',
          }}>
            <div style={{ animation: `floatY ${5 + i * 0.6}s ease-in-out ${b.delay}s infinite` }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderRadius: '16px 16px 16px 4px', background: dark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${cardBorder}`, boxShadow: dark ? 'none' : '0 14px 34px rgba(15,17,25,0.10)', fontSize: 13.5, fontWeight: 700, color: text, whiteSpace: 'nowrap' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                {b.text}
              </div>
            </div>
          </div>
        ))}

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
          <div className="cv-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center' }}>
            {/* Left: copy */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 22, background: dark ? 'rgba(255,106,77,0.14)' : 'rgba(255,106,77,0.1)', border: `1px solid ${CORAL}44`, color: CORAL, fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'blink 1.6s infinite' }} /> The all-in-one customer platform
              </div>
              <h1 style={{ fontSize: 'clamp(44px, 6.6vw, 88px)', fontWeight: 900, lineHeight: 0.98, letterSpacing: '-0.035em', margin: '0 0 22px' }}>
                Turn every chat<br />into a <span style={{ color: CORAL }}>customer.</span><br />
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  And every sale.
                  <svg viewBox="0 0 300 20" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 14 }}><path d="M3 14 Q 150 2 297 12" stroke={YELLOW} strokeWidth="7" fill="none" strokeLinecap="round" /></svg>
                </span>
              </h1>
              <p style={{ fontSize: 'clamp(16px, 1.8vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 540, margin: '0 0 32px' }}>
                One shared inbox for WhatsApp, Instagram, email, SMS &amp; live chat — with WooCommerce, payments, media and AI built in. Talk to customers and close sales, all in one place.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                <button onClick={handleDashboard} className="cv-btn-primary" style={btnPrimary}>{user ? 'Go to dashboard' : 'Start free — no card'} <ArrowRight /></button>
                <button onClick={() => setVideo({ url: HERO_VIDEO.url, poster: HERO_VIDEO.poster, title: HERO_VIDEO.label })} className="cv-btn-ghost" style={btnGhost}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: CORAL, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><PlayIcon s={13} /></span>
                  Watch demo
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
                <div style={{ display: 'flex' }}>
                  {[CORAL, BLUE, GREEN, YELLOW, PURPLE].map((c, i) => (
                    <div key={i} style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: `2.5px solid ${bg}`, marginLeft: i ? -10 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>{['SC', 'MW', 'PS', 'JK', 'AR'][i]}</div>
                  ))}
                </div>
                <span style={{ fontSize: 13.5, color: muted }}>Loved by <strong style={{ color: text }}>{realStats.teams > 0 ? realStats.teams.toLocaleString() + '+' : 'growing'}</strong> teams · <span style={{ color: YELLOW }}>★★★★★</span></span>
              </div>
            </div>

            {/* Right: live product demo in a floating device frame */}
            <div style={{ position: 'relative', transform: `translateY(${scrollY * -0.04}px)` }}>
              <div aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: 34, background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, opacity: dark ? 0.4 : 0.28, filter: 'blur(6px)' }} />
              <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', border: `1px solid ${cardBorder}`, background: cardBg, boxShadow: '0 40px 100px rgba(15,17,25,0.22)', transform: `rotate(-1.2deg) translate(${mouse.x * -10}px, ${mouse.y * -10}px)`, transition: 'transform 0.25s ease-out' }}>
                <OmniInboxDemo dark={dark} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BRAND MARQUEE */}
      <section style={{ padding: '30px 0 34px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}`, background: canvas, overflow: 'hidden' }}>
        <p style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: dim, margin: '0 0 22px' }}>Connects every channel &amp; tool you already use</p>
        <div style={{ position: 'relative', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div className="cv-marquee-track">
            {[...BRANDS, ...BRANDS].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 30px', flexShrink: 0 }}>
                <img src={b.logo} alt={b.name} style={{ width: 24, height: 24, opacity: dark ? 0.85 : 0.7, filter: dark ? 'invert(1)' : 'none' }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: muted, whiteSpace: 'nowrap' }}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BIG ALTERNATING FEATURE ROWS */}
      <section style={{ padding: '90px 22px 30px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 68px' }}>
              <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 16px' }}>Everything happens in <span style={{ color: CORAL }}>one place</span></h2>
              <p style={{ fontSize: 19, color: muted, lineHeight: 1.6, margin: 0 }}>No more juggling five apps. Colvy is your inbox, your CRM, your storefront helpdesk and your sales tracker — talking to each other.</p>
            </div>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {BIG.map((f, i) => {
              const flip = i % 2 === 1
              return (
                <Reveal key={f.title}>
                  <div className="cv-big-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'stretch', borderRadius: 30, overflow: 'hidden', border: `1px solid ${cardBorder}`, background: cardBg }}>
                    {/* Copy panel */}
                    <div style={{ order: flip ? 2 : 1, padding: 'clamp(28px, 4vw, 52px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <span style={{ display: 'inline-flex', width: 'fit-content', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 999, background: f.color + '1a', color: f.color, fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>{f.tag}</span>
                      <h3 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '0 0 14px' }}>{f.title}</h3>
                      <p style={{ fontSize: 16.5, color: muted, lineHeight: 1.65, margin: '0 0 20px' }}>{f.body}</p>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {f.bullets.map(b => (
                          <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: text }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: f.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                            {b}
                          </li>
                        ))}
                      </ul>
                      <a href={f.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15.5, fontWeight: 800, color: f.color, textDecoration: 'none' }}>Explore <ArrowRight s={15} /></a>
                    </div>
                    {/* Visual panel */}
                    <div style={{ order: flip ? 1 : 2, position: 'relative', background: `linear-gradient(150deg, ${f.color}22, ${f.color}0a)`, padding: 'clamp(22px, 3vw, 40px)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
                      {f.visual === 'demo' && <div style={{ width: '100%', maxWidth: 460, borderRadius: 18, overflow: 'hidden', border: `1px solid ${cardBorder}`, boxShadow: '0 24px 60px rgba(15,17,25,0.18)' }}><OmniInboxDemo dark={dark} /></div>}
                      {f.visual === 'sale' && <SaleMock color={f.color} text={text} muted={muted} cardBg={dark ? 'rgba(255,255,255,0.06)' : '#fff'} border={cardBorder} />}
                      {f.visual === 'flow' && <FlowMock color={f.color} text={text} muted={muted} cardBg={dark ? 'rgba(255,255,255,0.06)' : '#fff'} border={cardBorder} />}
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* VIDEO SHOWCASE */}
      <section style={{ padding: '80px 22px', background: canvas, borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CORAL, margin: '0 0 12px' }}>See it in action</p>
              <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>Watch a chat become a sale</h2>
            </div>
          </Reveal>
          {/* Main video */}
          <Reveal>
            <button onClick={() => setVideo({ url: HERO_VIDEO.url, poster: HERO_VIDEO.poster, title: HERO_VIDEO.label })} className="cv-play"
              style={{ position: 'relative', width: '100%', aspectRatio: '16 / 8', borderRadius: 26, overflow: 'hidden', border: 'none', cursor: 'pointer', padding: 0, display: 'block', boxShadow: '0 30px 80px rgba(15,17,25,0.22)', backgroundImage: `linear-gradient(120deg, rgba(15,17,25,0.35), rgba(15,17,25,0.12)), url(${HERO_VIDEO.poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <span style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '2px solid rgba(255,255,255,0.5)' }}><PlayIcon s={30} /></span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{HERO_VIDEO.label}</span>
              </div>
            </button>
          </Reveal>
          {/* User story videos */}
          <Reveal>
            <div style={{ marginTop: 44 }}>
              <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: muted, margin: '0 0 22px' }}>Hear it from the teams who switched</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                {USER_STORIES.map(s => (
                  <button key={s.name} onClick={() => setVideo({ url: s.url, poster: s.poster, title: `${s.name} · ${s.company}` })} className="cv-story cv-card"
                    style={{ textAlign: 'left', border: `1px solid ${cardBorder}`, borderRadius: 22, overflow: 'hidden', background: cardBg, cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden' }}>
                      <img className="cv-story-media" src={s.poster} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(15,17,25,0.55))' }} />
                      <span className="cv-play" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlayIcon s={20} /></span>
                      <span style={{ position: 'absolute', left: 14, bottom: 12, color: '#fff' }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{s.name}</span>
                        <span style={{ display: 'block', fontSize: 12.5, opacity: 0.85 }}>{s.role} · {s.company}</span>
                      </span>
                      <span style={{ position: 'absolute', right: 12, top: 12, padding: '5px 11px', borderRadius: 999, background: s.color, color: '#fff', fontSize: 12, fontWeight: 800 }}>{s.metric}</span>
                    </div>
                    <p style={{ margin: 0, padding: '16px 18px', fontSize: 14.5, lineHeight: 1.55, color: text, fontWeight: 600 }}>&ldquo;{s.quote}&rdquo;</p>
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* STATS — oversized */}
      <section style={{ padding: '84px 22px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 28 }}>
          {[
            { value: realStats.teams > 0 ? realStats.teams.toLocaleString() + '+' : '12,000+', label: 'Teams on Colvy', color: CORAL },
            { value: realStats.ideas > 1000 ? (realStats.ideas / 1000).toFixed(1) + 'K' : (realStats.ideas > 0 ? realStats.ideas.toLocaleString() : '2.4M'), label: 'Conversations handled', color: BLUE },
            { value: '98%', label: 'Customer satisfaction', color: GREEN },
            { value: '4 min', label: 'To get set up', color: PURPLE },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(36px, 5vw, 58px)', fontWeight: 900, letterSpacing: '-0.03em', color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 14.5, color: muted, marginTop: 8, fontWeight: 600 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL QUOTES */}
      <section style={{ padding: '30px 22px 90px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {USER_STORIES.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.06}>
              <div className="cv-card" style={{ padding: 28, borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 14, color: YELLOW }}>
                  {[...Array(5)].map((_, j) => <svg key={j} width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>)}
                </div>
                <p style={{ fontSize: 16, lineHeight: 1.65, color: text, fontWeight: 600, margin: '0 0 22px', flex: 1 }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={t.poster} alt={t.name} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: text }}>{t.name}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: muted }}>{t.role} · {t.company}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BIG CTA */}
      <section style={{ padding: '30px 22px 100px' }}>
        <Reveal>
          <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', borderRadius: 34, overflow: 'hidden', padding: 'clamp(48px, 7vw, 84px) 32px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
            <div aria-hidden style={{ position: 'absolute', top: -40, left: -20, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
            <div aria-hidden style={{ position: 'absolute', bottom: -60, right: -10, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ fontSize: 'clamp(32px, 5.4vw, 60px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.04, margin: '0 0 16px' }}>Ready to sell through the chat?</h2>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px', fontWeight: 600 }}>Free forever for small teams. Upgrade as you grow.</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: '0 0 34px' }}>No credit card · Set up in 4 minutes · Cancel anytime</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
                <button onClick={handleDashboard} className="cv-play" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: '#111', fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{user ? 'Go to dashboard' : 'Get started — it’s free'} <ArrowRight /></button>
                {!user && <a href="/pricing" style={{ padding: '16px 30px', borderRadius: 999, border: '2px solid rgba(255,255,255,0.6)', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>See all plans</a>}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />

      <VideoModal open={!!video} url={video?.url || ''} poster={video?.poster} title={video?.title} onClose={() => setVideo(null)} />
    </div>
  )
}

// ── Lightweight animated product mocks (so feature rows aren't static stock) ──
function SaleMock({ color, text, muted, cardBg, border }: { color: string; text: string; muted: string; cardBg: string; border: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '11px 15px', borderRadius: '16px 16px 16px 4px', background: cardBg, border: `1px solid ${border}`, fontSize: 14, fontWeight: 600, color: text, animation: 'popIn 0.5s both' }}>I&rsquo;ve just sent the payment 🙌</div>
      <div style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, background: color, color: '#fff', fontSize: 13.5, fontWeight: 800, animation: 'popIn 0.5s 0.3s both', boxShadow: `0 12px 30px ${color}55` }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        Sale recorded · $385 · Bank transfer
      </div>
      <div style={{ alignSelf: 'flex-start', width: '100%', padding: 14, borderRadius: 16, background: cardBg, border: `1px solid ${border}`, animation: 'popIn 0.5s 0.55s both' }}>
        <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>Revenue via Colvy · 30d</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: text, letterSpacing: '-0.02em' }}>$18,240</p>
        <div style={{ display: 'flex', gap: 4, marginTop: 10, height: 34, alignItems: 'flex-end' }}>
          {[40, 62, 48, 78, 90, 68, 100].map((h, i) => <span key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: color, opacity: 0.35 + (h / 100) * 0.65 }} />)}
        </div>
      </div>
    </div>
  )
}

function FlowMock({ color, text, muted, cardBg, border }: { color: string; text: string; muted: string; cardBg: string; border: string }) {
  const steps = [
    { t: 'New message arrives', c: color },
    { t: 'Auto-reply sent', c: GREEN },
    { t: 'Task created & assigned', c: BLUE },
    { t: 'Follow-up scheduled', c: YELLOW },
  ]
  return (
    <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((s, i) => (
        <div key={s.t} style={{ animation: `popIn 0.5s ${i * 0.18}s both` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderRadius: 14, background: cardBg, border: `1px solid ${border}` }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: s.c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: text }}>{s.t}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={s.c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          {i < steps.length - 1 && <div style={{ width: 2, height: 14, background: border, margin: '0 0 0 30px' }} />}
        </div>
      ))}
    </div>
  )
}
