'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { redirectToUserAdmin } from '@/lib/redirect'

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}

// SVG Icons
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const IdeaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
)
const RoadmapIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const AnnouncementIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
  </svg>
)
const KnowledgeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)
const AnalyticsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
)
const IntegrationsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>
  </svg>
)
const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const FEATURES = [
  { Icon: IdeaIcon, title: 'Ideas Board', href: '/features/ideas', color: '#ff7a6b', desc: 'Capture and prioritize feedback from customers in one beautiful board.' },
  { Icon: RoadmapIcon, title: 'Public Roadmap', href: '/features/roadmap', color: '#6366f1', desc: 'Show customers exactly what you\'re building and when it ships.' },
  { Icon: AnnouncementIcon, title: 'Announcements', href: '/features/announcements', color: '#10b981', desc: 'Keep your community updated with a beautiful, embeddable changelog.' },
  { Icon: KnowledgeIcon, title: 'Knowledgebase', href: '/features/knowledgebase', color: '#f59e0b', desc: 'Answer questions before they\'re asked with a searchable help centre.' },
  { Icon: AnalyticsIcon, title: 'Analytics', href: '/features/ideas', color: '#8b5cf6', desc: 'Understand what your users care about most with deep insights.' },
  { Icon: IntegrationsIcon, title: 'Integrations', href: '/features/ideas', color: '#ec4899', desc: 'Connect with Slack, Jira, Linear, Zapier and 50+ more tools.' },
]

const SOCIAL_PROOF = [
  { name: 'Sarah Chen', role: 'Head of Product, Stripe', init: 'SC', text: 'Colvy completely transformed how we collect feedback. Our NPS went up 28 points in 3 months.' },
  { name: 'Marcus Webb', role: 'CEO, Linear', init: 'MW', text: 'The roadmap feature alone is worth it. Our customers love seeing what we\'re working on.' },
  { name: 'Priya Sharma', role: 'CPO, Notion', init: 'PS', text: 'We replaced 3 tools with Colvy. The team productivity improvement was immediate.' },
]

const STATS = [
  { value: '12,000+', label: 'Product teams' },
  { value: '2.4M', label: 'Ideas collected' },
  { value: '98%', label: 'Satisfaction' },
  { value: '4 min', label: 'Setup time' },
]

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { ref: featRef, v: featV } = useInView()
  const { ref: statsRef, v: statsV } = useInView()
  const { ref: socialRef, v: socialV } = useInView()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll) }
  }, [])

  const handleDashboard = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).single()
      if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`
      else await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  // Theme colors
  const bg = dark ? '#080808' : '#ffffff'
  const text = dark ? '#f0f0f0' : '#0d0d0d'
  const textMuted = dark ? 'rgba(240,240,240,0.55)' : 'rgba(13,13,13,0.55)'
  const textDim = dark ? 'rgba(240,240,240,0.3)' : 'rgba(13,13,13,0.35)'
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : '#f8f8f8'
  const cardBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const navBg = scrollY > 40 ? (dark ? 'rgba(8,8,8,0.9)' : 'rgba(255,255,255,0.92)') : 'transparent'
  const navBorder = scrollY > 40 ? (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)') : 'transparent'

  return (
    <div style={{ background: bg, color: text, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif', transition: 'background 0.3s,color 0.3s', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .hero-float { animation: float 6s ease-in-out infinite; }
        .slide-up { opacity:0; animation:slideUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .d1{animation-delay:.05s} .d2{animation-delay:.15s} .d3{animation-delay:.25s} .d4{animation-delay:.35s}
        .grad-text { background:linear-gradient(135deg,#ff7a6b,#a78bfa,#60a5fa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .shimmer-val { background:linear-gradient(90deg,#ff7a6b,#a78bfa,#ff7a6b); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:shimmer 3s linear infinite; }
        .feat-card { transition:all 0.35s cubic-bezier(0.16,1,0.3,1); }
        .feat-card:hover { transform:translateY(-6px); }
        .feat-card:hover .feat-icon { transform:scale(1.2) rotate(6deg); }
        .feat-icon { transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1); display:inline-flex; }
        .card-hover { transition:all 0.3s cubic-bezier(0.16,1,0.3,1); }
        .card-hover:hover { transform:translateY(-4px); }
        .btn-main { transition:all 0.25s; }
        .btn-main:hover { transform:scale(1.04); box-shadow:0 0 36px rgba(255,122,107,0.45); }
        .btn-main:active { transform:scale(0.97); }
        .orb { position:absolute; border-radius:50%; filter:blur(70px); pointer-events:none; }
      `}</style>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: navBg, borderBottom: `1px solid ${navBorder}`, backdropFilter: scrollY > 40 ? 'blur(20px)' : 'none', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link href="/landing" style={{ fontWeight: 800, fontSize: 20, color: '#ff7a6b', textDecoration: 'none' }}>Colvy</Link>

          {/* Desktop Nav — hide Features/Pricing for logged-in users */}
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 4 }}>
            {!user && [
              { label: 'Ideas', href: '/features/ideas' },
              { label: 'Roadmap', href: '/features/roadmap' },
              { label: 'Announcements', href: '/features/announcements' },
              { label: 'Knowledgebase', href: '/features/knowledgebase' },
              { label: 'Pricing', href: '/pricing' },
            ].map(n => (
              <Link key={n.label} href={n.href} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14, fontWeight: 500, color: textMuted, textDecoration: 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {n.label}
              </Link>
            ))}
            {user && (
              <span style={{ fontSize: 14, color: textMuted }}>Welcome back!</span>
            )}
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Theme toggle */}
            <button onClick={() => setDark(!dark)}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text, transition: 'all 0.2s' }}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>

            {user ? (
              <button onClick={handleDashboard}
                className="btn-main"
                style={{ padding: '9px 20px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: 'none' }}>
                Dashboard →
              </button>
            ) : (
              <>
                <Link href="/signin" className="hidden md:block" style={{ fontSize: 14, fontWeight: 500, color: textMuted, textDecoration: 'none' }}>Sign in</Link>
                <Link href="/signup"
                  className="btn-main"
                  style={{ padding: '9px 20px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
                  Get started free
                </Link>
              </>
            )}

            {/* Mobile menu button */}
            <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>
              {mobileOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{ background: dark ? '#0f0f0f' : '#fff', borderTop: `1px solid ${cardBorder}`, padding: '16px 24px 24px' }}>
            {!user && [
              { label: 'Ideas', href: '/features/ideas' },
              { label: 'Roadmap', href: '/features/roadmap' },
              { label: 'Announcements', href: '/features/announcements' },
              { label: 'Knowledgebase', href: '/features/knowledgebase' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Sign in', href: '/signin' },
            ].map(n => (
              <Link key={n.label} href={n.href} onClick={() => setMobileOpen(false)}
                style={{ display: 'block', padding: '12px 0', fontSize: 16, fontWeight: 500, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>
                {n.label}
              </Link>
            ))}
            <button onClick={handleDashboard} style={{ marginTop: 16, width: '100%', padding: '14px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', border: 'none' }}>
              {user ? 'Dashboard →' : 'Get started free'}
            </button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 60px', overflow: 'hidden' }}>
        <div className="orb" style={{ width: 600, height: 600, background: 'radial-gradient(circle,rgba(255,122,107,0.18) 0%,transparent 65%)', top: '5%', left: '5%' }} />
        <div className="orb" style={{ width: 500, height: 500, background: 'radial-gradient(circle,rgba(99,102,241,0.14) 0%,transparent 65%)', top: '20%', right: '5%' }} />
        <div className="orb" style={{ width: 400, height: 400, background: 'radial-gradient(circle,rgba(16,185,129,0.1) 0%,transparent 65%)', bottom: '10%', left: '30%' }} />

        {/* Grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'} 1px,transparent 1px)`, backgroundSize: '60px 60px', WebkitMaskImage: 'radial-gradient(ellipse at center,black 40%,transparent 75%)', maskImage: 'radial-gradient(ellipse at center,black 40%,transparent 75%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 700, textAlign: 'center' }}>
          {/* Badge */}
          <div className="slide-up d1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, marginBottom: 32, background: 'rgba(255,122,107,0.1)', border: '1px solid rgba(255,122,107,0.25)', color: '#ff7a6b', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'none' }} />
            Now with AI-powered prioritization
          </div>

          <h1 className="slide-up d2" style={{ fontSize: 'clamp(40px,8vw,76px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 24, color: text }}>
            Build what your<br />
            <span className="grad-text">customers actually</span><br />
            want
          </h1>

          <p className="slide-up d3" style={{ fontSize: 'clamp(16px,2vw,20px)', color: textMuted, lineHeight: 1.7, marginBottom: 40, maxWidth: 540, margin: '0 auto 40px' }}>
            One platform for feedback, roadmap, changelog, and help centre. Your users will love it.
          </p>

          <div className="slide-up d4" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleDashboard} className="btn-main"
                style={{ padding: '14px 32px', borderRadius: 16, background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none' }}>
                {user ? 'Go to Dashboard →' : 'Start free — no credit card'}
              </button>
              {!user && (
                <Link href="#features" style={{ padding: '14px 28px', borderRadius: 16, border: `1px solid ${cardBorder}`, background: cardBg, color: text, fontWeight: 600, fontSize: 15, textDecoration: 'none', transition: 'all 0.2s' }}>
                  See how it works ↓
                </Link>
              )}
            </div>

            {/* Social proof */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ display: 'flex' }}>
                {['#ff7a6b','#6366f1','#10b981','#f59e0b','#ec4899'].map((c, i) => (
                  <div key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: `2px solid ${bg}`, marginLeft: i ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {['SC','MW','PS','JK','AR'][i]}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: textMuted }}>
                Loved by <strong style={{ color: text }}>12,000+</strong> product teams
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section ref={statsRef as any} style={{ padding: '60px 24px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 32 }} className="md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} style={{ textAlign: 'center', opacity: statsV ? 1 : 0, transform: statsV ? 'none' : 'translateY(20px)', transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s` }}>
              <div className="shimmer-val" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" ref={featRef as any} style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(32px,5vw,52px)', fontWeight: 900, letterSpacing: '-0.02em', color: text, marginBottom: 12, opacity: featV ? 1 : 0, transform: featV ? 'none' : 'translateY(20px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)' }}>
              Everything you need to<br /><span className="grad-text">build great products</span>
            </h2>
            <p style={{ fontSize: 18, color: textMuted, opacity: featV ? 1 : 0, transition: 'all 0.6s 0.1s' }}>One platform. Infinite feedback.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
            {FEATURES.map(({ Icon, title, href, color, desc }, i) => (
              <Link key={title} href={href} className="feat-card" style={{ padding: 28, borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none', display: 'block', opacity: featV ? 1 : 0, transform: featV ? 'none' : 'translateY(30px)', transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${0.05 * i}s` }}>
                <div className="feat-icon" style={{ width: 48, height: 48, borderRadius: 14, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color }}>
                  <Icon />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: text }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: textMuted, marginBottom: 16 }}>{desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color }}>
                  Learn more <ArrowRightIcon />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section ref={socialRef as any} style={{ padding: '80px 24px', borderTop: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, textAlign: 'center', marginBottom: 56, color: text }}>
            Trusted by teams <span className="grad-text">worldwide</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
            {SOCIAL_PROOF.map((s, i) => (
              <div key={s.name} className="card-hover" style={{ padding: 28, borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, opacity: socialV ? 1 : 0, transform: socialV ? 'none' : 'translateY(20px)', transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.12}s` }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 16, color: '#ff7a6b' }}>
                  {[...Array(5)].map((_, j) => <StarIcon key={j} />)}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 20, color: textMuted }}>"{s.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#ff7a6b,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{s.init}</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: text }}>{s.name}</p>
                    <p style={{ fontSize: 12, color: textMuted }}>{s.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', padding: '64px 40px', borderRadius: 28, background: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 style={{ fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, marginBottom: 12, color: text }}>Start free today</h2>
          <p style={{ fontSize: 17, color: textMuted, marginBottom: 8 }}>Free forever for small teams. Upgrade as you grow.</p>
          <p style={{ fontSize: 13, color: textDim, marginBottom: 36 }}>No credit card · Setup in 4 min · Cancel anytime</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button onClick={handleDashboard} className="btn-main"
              style={{ padding: '14px 36px', borderRadius: 16, background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none' }}>
              {user ? 'Go to Dashboard →' : "Get started — it's free"}
            </button>
            {!user && <Link href="/pricing" style={{ padding: '14px 24px', borderRadius: 16, border: `1px solid ${cardBorder}`, background: 'transparent', color: textMuted, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              See all plans →
            </Link>}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '48px 24px 32px', borderTop: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 32, marginBottom: 48 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#ff7a6b', marginBottom: 12 }}>Colvy</div>
              <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>Beautiful feedback for product teams.</p>
            </div>
            {[
              { title: 'Product', links: [{ l: 'Ideas', h: '/features/ideas' }, { l: 'Roadmap', h: '/features/roadmap' }, { l: 'Announcements', h: '/features/announcements' }, { l: 'Knowledgebase', h: '/features/knowledgebase' }] },
              { title: 'Company', links: [{ l: 'Pricing', h: '/pricing' }, { l: 'Sign up', h: '/signup' }, { l: 'Sign in', h: '/signin' }] },
              { title: 'Legal', links: [{ l: 'Privacy', h: '#' }, { l: 'Terms', h: '#' }] },
            ].map(col => (
              <div key={col.title}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.title}</h4>
                {col.links.map(lk => (
                  <Link key={lk.l} href={lk.h} style={{ display: 'block', fontSize: 14, color: textMuted, textDecoration: 'none', marginBottom: 8 }}>{lk.l}</Link>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTop: `1px solid ${cardBorder}`, flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 13, color: textDim }}>© 2026 Colvy. All rights reserved.</p>
            <p style={{ fontSize: 13, color: textDim }}>Built with ♥ for product teams</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
