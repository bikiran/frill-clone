'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { redirectToUserAdmin } from '@/lib/redirect'

function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const h = () => setOffset(window.scrollY * speed)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [speed])
  return offset
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

const NAV_ITEMS = [
  { label: 'Ideas', href: '/features/ideas' },
  { label: 'Roadmap', href: '/features/roadmap' },
  { label: 'Announcements', href: '/features/announcements' },
  { label: 'Knowledgebase', href: '/features/knowledgebase' },
  { label: 'Pricing', href: '/pricing' },
]

const FEATURES = [
  {
    icon: '💡', title: 'Ideas Board', href: '/features/ideas',
    desc: 'Capture and prioritize feedback from your customers in one beautiful board.',
    color: '#ff7a6b',
  },
  {
    icon: '🗺️', title: 'Public Roadmap', href: '/features/roadmap',
    desc: 'Show customers exactly what you\'re building and when it ships.',
    color: '#6366f1',
  },
  {
    icon: '📢', title: 'Announcements', href: '/features/announcements',
    desc: 'Keep your community updated with a beautiful, embeddable changelog.',
    color: '#10b981',
  },
  {
    icon: '📚', title: 'Knowledgebase', href: '/features/knowledgebase',
    desc: 'Answer questions before they\'re asked with a searchable help centre.',
    color: '#f59e0b',
  },
  {
    icon: '📊', title: 'Analytics', href: '/features/ideas',
    desc: 'Understand what your users care about most with deep insights.',
    color: '#8b5cf6',
  },
  {
    icon: '🔗', title: 'Integrations', href: '/features/ideas',
    desc: 'Connect with Slack, Jira, Linear, Zapier and 50+ more tools.',
    color: '#ec4899',
  },
]

const SOCIAL_PROOF = [
  { name: 'Sarah Chen', role: 'Head of Product, Stripe', avatar: 'SC', text: 'Colvy completely transformed how we collect feedback. Our NPS went up 28 points in 3 months.' },
  { name: 'Marcus Webb', role: 'CEO, Linear', avatar: 'MW', text: 'The roadmap feature alone is worth it. Our customers love seeing what we\'re working on.' },
  { name: 'Priya Sharma', role: 'CPO, Notion', avatar: 'PS', text: 'We replaced 3 tools with Colvy. The team productivity improvement was immediate.' },
]

const STATS = [
  { value: '12,000+', label: 'Product teams' },
  { value: '2.4M', label: 'Ideas collected' },
  { value: '98%', label: 'Customer satisfaction' },
  { value: '4 min', label: 'Average setup time' },
]

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [scrollY, setScrollY] = useState(0)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [dark, setDark] = useState(false)
  const heroParallax = useParallax(0.2)
  const { ref: featRef, visible: featVisible } = useInView()
  const { ref: statsRef, visible: statsVisible } = useInView()
  const { ref: socialRef, visible: socialVisible } = useInView()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_e: any, s: any) => setUser(s?.user ?? null))
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', handleScroll) }
  }, [])

  const handleGetStarted = async () => {
    if (user) {
      // Check if user has a custom domain preference
      try {
        const { data: co } = await (supabase as any)
          .from('companies').select('slug, board_domain').eq('owner_id', user.id).single()
        if (co?.board_domain) {
          window.location.href = `https://${co.board_domain}/admin`
          return
        }
        if (co?.slug) {
          window.location.href = `https://${co.slug}.colvy.com/admin`
          return
        }
      } catch {}
      await redirectToUserAdmin(user.id)
    } else {
      window.location.href = '/signup'
    }
  }

  const navBg = scrollY > 50

  return (
    <div className="landing-wrap" style={{ background: dark ? '#000' : '#fafafa', color: dark ? '#fff' : '#0a0a0a', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .landing-wrap { --bg: ${dark ? '#000' : '#fafafa'}; --text: ${dark ? '#fff' : '#0a0a0a'}; --text-muted: ${dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'}; --text-dim: ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}; --border: ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}; --glass-bg: ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}; --glass-border: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}; --card-bg: ${dark ? 'rgba(255,255,255,0.04)' : '#fff'}; --card-border: ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}; --nav-bg: ${dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)'}; --mock-bg: ${dark ? 'rgba(12,12,12,0.95)' : '#f0f0f0'}; --mock-item: ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}; --grid: ${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'}; }
      `}</style>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes glow { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .float { animation: float 6s ease-in-out infinite; }
        .glow-pulse { animation: glow 3s ease-in-out infinite; }
        .slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .slide-up-delay-1 { animation-delay: 0.1s; }
        .slide-up-delay-2 { animation-delay: 0.2s; }
        .slide-up-delay-3 { animation-delay: 0.3s; }
        .gradient-text {
          background: linear-gradient(135deg, #ff7a6b 0%, #ff9a8b 30%, #a78bfa 60%, #60a5fa 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .shimmer-text {
          background: linear-gradient(90deg, #ff7a6b, #fff, #a78bfa, #ff7a6b);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .card-hover { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .card-hover:hover { transform: translateY(-8px) scale(1.02); }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); }
        .feature-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; }
        .feature-card:hover { transform: translateY(-6px); }
        .feature-card:hover .feature-icon { transform: scale(1.15) rotate(5deg); }
        .feature-icon { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .btn-primary { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .btn-primary:hover { transform: scale(1.05); box-shadow: 0 0 40px rgba(255,122,107,0.5); }
        .btn-primary:active { transform: scale(0.98); }
        .orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
      `}</style>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{ background: navBg ? (dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)') : 'transparent', backdropFilter: navBg ? 'blur(20px)' : 'none', borderBottom: navBg ? `1px solid var(--border)` : 'none' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Colvy" className="h-7 w-auto" onError={(e: any) => e.target.style.display='none'} />
            <span className="text-xl font-bold" style={{ color: '#ff7a6b' }}>Colvy</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(n => (
              <Link key={n.label} href={n.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/10"
                style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>
                {n.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            {/* Dark/Light toggle */}
            <button onClick={() => setDark(!dark)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110 cursor-pointer"
              style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: dark ? '#fff' : '#000' }}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dark ? '☀️' : '🌙'}
            </button>
            {user ? (
              <button onClick={handleGetStarted}
                className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
                style={{ background: '#ff7a6b' }}>
                Dashboard →
              </button>
            ) : (
              <>
                <Link href="/signin" className="text-sm font-medium hidden md:block" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>Sign in</Link>
                <Link href="/signup" className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ background: '#ff7a6b' }}>
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6" style={{ paddingTop: 80 }}>
        {/* Orbs */}
        <div className="orb glow-pulse" style={{ width: 600, height: 600, background: dark ? 'radial-gradient(circle, rgba(255,122,107,0.3) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(255,122,107,0.15) 0%, transparent 70%)', top: '10%', left: '20%', transform: `translateY(${heroParallax * 0.5}px)` }} />
        <div className="orb glow-pulse" style={{ width: 500, height: 500, background: dark ? 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', top: '30%', right: '10%', transform: `translateY(${-heroParallax * 0.3}px)`, animationDelay: '1.5s' }} />
        <div className="orb" style={{ width: 300, height: 300, background: dark ? 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', bottom: '20%', left: '10%', transform: `translateY(${heroParallax * 0.2}px)` }} />

        {/* Grid overlay */}
        <div className="absolute inset-0" style={{ backgroundImage: dark ? 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)' : 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px', mask: 'radial-gradient(ellipse at center, black 40%, transparent 80%)' }} />

        <div className="relative text-center max-w-5xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 slide-up"
            style={{ background: 'rgba(255,122,107,0.15)', border: '1px solid rgba(255,122,107,0.3)', color: '#ff9a8b' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Now with AI-powered prioritization
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight slide-up slide-up-delay-1"
            style={{ letterSpacing: '-0.03em', color: dark ? '#fff' : '#0a0a0a' }}>
            Build what your
            <br />
            <span className="gradient-text">customers actually</span>
            <br />
            want
          </h1>

          <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto slide-up slide-up-delay-2"
            style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)', lineHeight: 1.7 }}>
            Colvy gives every product team a beautiful feedback board, public roadmap, 
            changelog, and help centre — all in one platform that your users will love.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 slide-up slide-up-delay-3">
            <button onClick={handleGetStarted}
              className="btn-primary w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-bold text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #ff7a6b, #ff5a4a)' }}>
              Start free — no credit card needed
            </button>
            <Link href="#features" className="w-full sm:w-auto px-8 py-4 rounded-2xl text-sm font-semibold glass text-center cursor-pointer hover:bg-white/10 transition-all"
              style={{ color: 'rgba(255,255,255,0.8)' }}>
              See how it works ↓
            </Link>
          </div>

          {/* Social proof mini */}
          <div className="flex items-center justify-center gap-2 slide-up slide-up-delay-3" style={{ animationDelay: '0.4s' }}>
            <div className="flex -space-x-2">
              {['SC', 'MW', 'PS', 'JK', 'AR'].map((init, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center text-xs font-bold"
                  style={{ background: ['#ff7a6b','#6366f1','#10b981','#f59e0b','#ec4899'][i], borderColor: '#000' }}>
                  {init}
                </div>
              ))}
            </div>
            <span className="text-sm" style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>
              Loved by <strong style={{ color: dark ? '#fff' : '#000' }}>12,000+</strong> product teams
            </span>
          </div>
        </div>

        {/* Hero browser mockup */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl px-6 pointer-events-none"
          style={{ transform: `translateX(-50%) translateY(${heroParallax * 0.15}px)` }}>
          <div className="rounded-t-2xl overflow-hidden shadow-2xl float" style={{ border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, background: dark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.95)' }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
              <div className="flex gap-1.5">
                {['#ff5f57','#ffbd2e','#28ca41'].map(c => <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
              </div>
              <div className="flex-1 mx-4 px-3 py-1 rounded-lg text-xs text-center" style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                yourcompany.colvy.com
              </div>
            </div>
            {/* Mock UI */}
            <div className="p-4 grid grid-cols-3 gap-3" style={{ minHeight: 140 }}>
              {[
                { title: 'Dark mode support', votes: 47, status: 'Planned', color: '#6366f1' },
                { title: 'Mobile app', votes: 38, status: 'In Progress', color: '#3b82f6' },
                { title: 'Export to CSV', votes: 29, status: 'Shipped', color: '#10b981' },
              ].map(i => (
                <div key={i.title} className="p-3 rounded-xl" style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold" style={{ color: dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)' }}>{i.title}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0 font-medium" style={{ background: i.color + '25', color: i.color }}>{i.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold" style={{ color: '#ff7a6b' }}>▲ {i.votes}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-24 px-6 relative" id="stats" ref={statsRef}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div key={s.label} className="text-center"
              style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? 'none' : 'translateY(30px)', transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s` }}>
              <div className="text-4xl font-black mb-1" style={{ background: "linear-gradient(90deg, #ff7a6b, #a78bfa, #ff7a6b)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 4s linear infinite" }}>{s.value}</div>
              <div className="text-sm" style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6" ref={featRef}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ opacity: featVisible ? 1 : 0, transform: featVisible ? 'none' : 'translateY(30px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', color: dark ? '#fff' : '#0a0a0a' }}>
              Everything you need to
              <br /><span className="gradient-text">build great products</span>
            </h2>
            <p style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', opacity: featVisible ? 1 : 0, transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s' }}>
              One platform. Infinite feedback.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Link key={f.title} href={f.href}
                className="feature-card p-6 rounded-2xl block"
                style={{ opacity: featVisible ? 1 : 0, transform: featVisible ? 'none' : 'translateY(40px)', transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.08}s`, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}>
                <div className="feature-icon text-4xl mb-4 inline-block">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>{f.desc}</p>
                <div className="flex items-center gap-1 mt-4 text-sm font-medium" style={{ color: f.color }}>
                  Learn more <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-24 px-6" ref={socialRef}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-16" style={{ color: dark ? '#fff' : '#0a0a0a' }}>
            Trusted by product teams <span className="gradient-text">worldwide</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {SOCIAL_PROOF.map((s, i) => (
              <div key={s.name} className="card-hover p-6 rounded-2xl"
                style={{ opacity: socialVisible ? 1 : 0, transform: socialVisible ? 'none' : 'translateY(30px)', transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.15}s`, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}>
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <span key={i} style={{ color: '#ff7a6b' }}>★</span>)}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.7)' }}>"{s.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #ff7a6b, #6366f1)' }}>
                    {s.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: dark ? '#fff' : '#0a0a0a' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{s.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-12 text-center relative overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}>
            <div className="orb" style={{ width: 400, height: 400, background: 'radial-gradient(circle, rgba(255,122,107,0.2) 0%, transparent 70%)', top: '-50%', left: '50%', transform: 'translateX(-50%)' }} />
            <div className="relative">
              <h2 className="text-4xl font-black mb-4" style={{ color: dark ? '#fff' : '#0a0a0a' }}>Start free today</h2>
              <p className="mb-2" style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)' }}>
                Free forever for small teams. Upgrade as you grow.
              </p>
              <p className="text-sm mb-8" style={{ color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                No credit card required · Setup in 4 minutes · Cancel anytime
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button onClick={handleGetStarted}
                  className="btn-primary w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-bold text-white cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #ff7a6b, #ff5a4a)' }}>
                  {user ? 'Go to Dashboard →' : 'Get started — it\'s free'}
                </button>
                <Link href="/pricing" className="text-sm font-medium" style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}>
                  See all plans →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-16 px-6 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="text-lg font-bold mb-4" style={{ color: '#ff7a6b' }}>Colvy</div>
              <p className="text-sm" style={{ color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Beautiful feedback for product teams.</p>
            </div>
            {[
              { title: 'Product', links: [{ l: 'Ideas', h: '/features/ideas' }, { l: 'Roadmap', h: '/features/roadmap' }, { l: 'Announcements', h: '/features/announcements' }, { l: 'Knowledgebase', h: '/features/knowledgebase' }] },
              { title: 'Company', links: [{ l: 'Pricing', h: '/pricing' }, { l: 'Sign up', h: '/signup' }, { l: 'Sign in', h: '/signin' }] },
              { title: 'Legal', links: [{ l: 'Privacy', h: '#' }, { l: 'Terms', h: '#' }] },
            ].map(col => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold mb-4" style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>{col.title}</h4>
                <div className="space-y-2">
                  {col.links.map(lk => (
                    <Link key={lk.l} href={lk.h} className="block text-sm hover:opacity-80 transition-all" style={{ color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)' }}>
                      {lk.l}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-8 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
            <p className="text-xs" style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)' }}>© 2026 Colvy. All rights reserved.</p>
            <p className="text-xs" style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)' }}>Built with ♥ for product teams</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
