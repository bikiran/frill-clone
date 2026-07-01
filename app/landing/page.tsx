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
const ImportIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
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
  { Icon: ImportIcon, title: 'Import from Anywhere', href: '/features/import', color: '#0891b2', desc: 'Migrate from Canny, Frill, Zendesk, Intercom and 10+ platforms in minutes.' },
]

const SOCIAL_PROOF = [
  { name: 'Jordan Mills', role: 'Founder, Prexty', init: 'JM', color: '#6366f1', text: 'Colvy replaced our messy spreadsheet and Notion doc overnight. Customers finally feel heard.' },
  { name: 'Aiko Tanaka', role: 'Product Lead, nePlay', init: 'AT', color: '#10b981', text: 'The public roadmap alone doubled our trial-to-paid conversion. Our users love the transparency.' },
  { name: 'Sam Rivera', role: 'CEO, Roxy Aquarium', init: 'SR', color: '#f59e0b', text: "Setup took 4 minutes. We migrated from Canny in one click and have not looked back since." },
]

const STATS = [
  { value: '12,000+', label: 'Product teams', key: 'teams' },
  { value: '2.4M', label: 'Ideas collected', key: 'ideas' },
  { value: '98%', label: 'Satisfaction', key: null },
  { value: '4 min', label: 'Setup time', key: null },
]

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [realStats, setRealStats] = useState({ teams: 0, ideas: 0 })
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { ref: featRef, v: featV } = useInView()
  const { ref: statsRef, v: statsV } = useInView()
  const { ref: socialRef, v: socialV } = useInView()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    // Fetch real platform stats
    Promise.all([
      (supabase as any).from('companies').select('*', { count: 'exact', head: true }),
      (supabase as any).from('ideas').select('*', { count: 'exact', head: true }),
    ]).then(([coRes, ideaRes]) => {
      setRealStats({
        teams: coRes.count || 0,
        ideas: ideaRes.count || 0,
      })
    }).catch(() => {})
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
        .slide-up { opacity:0; animation:slideUp 0.8s cubic-bezier(0.16,1,0.3,1) both; }
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
              { label: 'Import', href: '/features/import' },
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
              { label: 'Import', href: '/features/import' },
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

        <div style={{ position: 'relative', maxWidth: 700, textAlign: 'center', margin: '0 auto', width: '100%' }}>
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
                Loved by <strong style={{ color: text }}>{realStats.teams > 0 ? realStats.teams.toLocaleString() + '+' : 'growing'}</strong> product teams
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
              <div className="shimmer-val" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, marginBottom: 4 }}>
                {s.key === 'teams' && realStats.teams > 0
                  ? realStats.teams.toLocaleString() + '+'
                  : s.key === 'ideas' && realStats.ideas > 0
                  ? realStats.ideas > 1000 ? (realStats.ideas / 1000).toFixed(1) + 'K' : realStats.ideas.toLocaleString()
                  : s.value}
              </div>
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



      {/* IMPORT DEMO */}
      <section style={{ padding: '80px 24px', background: dark ? '#050505' : '#f8f8f8', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="import-grid-wrapper" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <style>{`
              @media (max-width: 768px) {
                .import-grid-wrapper { grid-template-columns: 1fr !important; gap: 32px !important; }
              }
            `}</style>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, background: '#0891b218', border: '1px solid #0891b230', color: '#0891b2', fontSize: 12, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                One-click migration
              </div>
              <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: dark ? '#fff' : '#0d0d0d', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 16 }}>
                Already on another<br />platform? <span className="grad-text">Switch free.</span>
              </h2>
              <p style={{ fontSize: 16, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)', lineHeight: 1.7, marginBottom: 20 }}>
                Paste your board URL and we migrate everything — ideas, votes, comments, roadmap, help articles — in minutes. <strong style={{ color: dark ? '#fff' : '#0d0d0d' }}>No data loss. No manual work.</strong>
              </p>
              <p style={{ fontSize: 14, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', lineHeight: 1.65, marginBottom: 24, padding: '12px 16px', borderRadius: 12, background: dark ? 'rgba(8,145,178,0.08)' : '#e0f2fe', borderLeft: '3px solid #0891b2' }}>
                💳 <strong>Already paying elsewhere?</strong> We carry over your remaining subscription period. Switch to Colvy and we'll match your current plan duration — no double-paying.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 28 }}>
                {['Canny', 'Frill', 'Featurebase', 'Zendesk', 'Intercom', 'Notion', 'Confluence', '+ more'].map(p => (
                  <span key={p} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, color: dark ? 'rgba(255,255,255,0.7)' : '#374151', fontWeight: 500 }}>{p}</span>
                ))}
              </div>
              <a href="/admin/import" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 14, background: '#0891b2', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none', transition: 'opacity 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Try the migration tool
              </a>
            </div>
            {/* Demo mockup */}
            <div style={{ background: dark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: 20, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
              {/* URL input mock */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.05)' : '#f8f8f8', border: `1px solid ${'#0891b2'}`, marginBottom: 16, boxShadow: '0 0 0 3px rgba(8,145,178,0.12)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.6)' : '#374151', flex: 1 }}>yourcompany.canny.io</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#0891b215', color: '#0891b2', fontWeight: 700 }}>Canny detected</span>
              </div>
              {/* Found items */}
              <p style={{ fontSize: 12, fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : '#9ca3af', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Found 142 items</p>
              {[
                { label: 'Ideas / Posts', count: 89, checked: true },
                { label: 'Statuses', count: 5, checked: true },
                { label: 'Topics / Tags', count: 12, checked: true },
                { label: 'Changelog Posts', count: 23, checked: true },
                { label: 'Votes', count: 1847, checked: false },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: item.checked ? (dark ? 'rgba(8,145,178,0.08)' : '#e0f2fe10') : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${item.checked ? '#0891b2' : dark ? 'rgba(255,255,255,0.2)' : '#d1d5db'}`, background: item.checked ? '#0891b2' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.8)' : '#374151' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: item.checked ? '#0891b2' : (dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6'), color: item.checked ? '#fff' : dark ? 'rgba(255,255,255,0.4)' : '#9ca3af' }}>{item.count.toLocaleString()}</span>
                </div>
              ))}
              <button style={{ width: '100%', marginTop: 14, padding: '11px', borderRadius: 12, background: '#0891b2', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                Start Import →
              </button>
            </div>
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

      {/* HOW IT WORKS */}
      <section style={{ padding: '100px 24px', background: dark ? '#0a0a0a' : '#f8f8f8', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff7a6b', marginBottom: 12 }}>How it works</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: dark ? '#fff' : '#0d0d0d', letterSpacing: '-0.02em' }}>
              Set up in 4 minutes
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 32 }}>
            {[
              { step: '01', title: 'Sign up', desc: 'Create your free account and get your board at yourcompany.colvy.com instantly.', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff7a6b" strokeWidth="1.8" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> },
              { step: '02', title: 'Share your board', desc: 'Send the link to your customers. They start submitting ideas and voting immediately.', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
              { step: '03', title: 'Prioritize', desc: 'See what users want most. Use RICE scoring and priority matrix to make data-driven decisions.', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
              { step: '04', title: 'Ship and announce', desc: 'Mark ideas as shipped and post an announcement. Users who voted get notified automatically.', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> },
            ].map((s, i) => (
              <div key={s.step} style={{ position: 'relative' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  {s.icon}
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#ff7a6b', marginBottom: 6 }}>{s.step}</p>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: dark ? '#fff' : '#0d0d0d', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REAL PEOPLE / SOCIAL PROOF with photos */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff7a6b', marginBottom: 12 }}>Customer stories</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: dark ? '#fff' : '#0d0d0d', letterSpacing: '-0.02em' }}>
              Teams shipping faster
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 24 }}>
            {[
              {
                quote: "Colvy replaced our messy spreadsheet overnight. Customers finally feel heard and our NPS jumped 28 points.",
                name: 'Jordan Mills', role: 'Founder', company: 'Prexty',
                photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&h=80&fit=crop&crop=face',
                metric: '+28 NPS',
              },
              {
                quote: "The public roadmap doubled our trial-to-paid conversion. Customers love knowing what we are building next.",
                name: 'Aiko Tanaka', role: 'Product Lead', company: 'nePlay',
                photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face',
                metric: '2× conversions',
              },
              {
                quote: "We migrated from Canny in one click and were live in 4 minutes. Best product decision we made this year.",
                name: 'Sam Rivera', role: 'CEO', company: 'Roxy Aquarium',
                photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
                metric: '4 min setup',
              },
            ].map((t, i) => (
              <div key={t.name} style={{ padding: 28, borderRadius: 20, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`, display: 'flex', flexDirection: 'column' as const }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 16, color: '#ff7a6b' }}>
                  {[...Array(5)].map((_, j) => <svg key={j} width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>)}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)', marginBottom: 24, flex: 1 }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={t.photo} alt={t.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}` }} />
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: dark ? '#fff' : '#0d0d0d' }}>{t.name}</p>
                      <p style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{t.role} · {t.company}</p>
                    </div>
                  </div>
                  <div style={{ padding: '6px 12px', borderRadius: 999, background: '#ff7a6b18', color: '#ff7a6b', fontSize: 13, fontWeight: 700 }}>{t.metric}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS STRIP */}
      <section style={{ padding: '60px 24px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, background: dark ? '#050505' : '#fafafa' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', marginBottom: 28 }}>Connects with your favourite tools</p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 12, justifyContent: 'center', alignItems: 'center' }}>
            {[
              { name: 'Slack', color: '#4A154B', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg' },
              { name: 'GitHub', color: '#181717', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg' },
              { name: 'Jira', color: '#0052CC', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/jira.svg' },
              { name: 'Zapier', color: '#FF4A00', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zapier.svg' },
              { name: 'Linear', color: '#5E6AD2', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linear.svg' },
              { name: 'Notion', color: '#000000', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg' },
              { name: 'Intercom', color: '#1F8DEE', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/intercom.svg' },
              { name: 'HubSpot', color: '#FF7A59', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/hubspot.svg' },
            ].map(int => (
              <div key={int.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)', fontSize: 14, fontWeight: 500 }}>
                <img src={int.logo} alt={int.name} style={{ width: 20, height: 20, filter: dark ? 'invert(1)' : `none`, opacity: 0.8 }} />
                {int.name}
              </div>
            ))}
            <div style={{ padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#ff7a6b' }}>+50 more →</div>
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