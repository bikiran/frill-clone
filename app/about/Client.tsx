'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// About / company page. Same look and animation language as the rest of the
// marketing site: photographed split hero, a "why we built it" story, a values
// grid, a mission belief band, a safe capability strip and a CTA. Company copy is
// values-based — no invented founding dates, headcounts or customer numbers.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'

const VALUES = [
  { icon: 'bolt', title: 'One platform, not five', desc: 'Feedback, inbox, CRM and calling belong together — one login, one bill, one shared context.', accent: CORAL },
  { icon: 'tag', title: 'Honest, SMB pricing', desc: 'Flat, published pricing and no per-seat traps. Software is predictable; usage is billed fairly.', accent: GREEN },
  { icon: 'star', title: 'Real human support', desc: 'Talk to real people in Australia 🇦🇺 who actually help — not a ticket queue and a bot.', accent: AMBER },
  { icon: 'idea', title: 'We listen, then ship', desc: 'A public roadmap and changelog. The features customers ask for are the ones we build next.', accent: PURPLE },
  { icon: 'lock', title: 'Your data is yours', desc: 'Export anytime. Encrypted in transit and at rest. No lock-in, cancel whenever you like.', accent: BLUE },
  { icon: 'globe', title: 'Built for local business', desc: 'Local numbers, AUD pricing and a team that understands how growing SMBs actually work.', accent: CYAN },
]

const STATS = [
  { big: '5→1', label: 'tools replaced' },
  { big: '45 min', label: 'to go live' },
  { big: '🇦🇺', label: 'Australian support' },
  { big: '$0', label: 'to get started' },
]

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

export default function AboutPage() {
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
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes abFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ab-card,.ab-btn{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .ab-card:hover{ transform:translateY(-6px); }
        .ab-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ab-hero{ grid-template-columns:1fr !important; } .ab-hero-cta{ flex-wrap:nowrap !important; } .ab-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } .ab-story{ grid-template-columns:1fr !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="abFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ab-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 40px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="star" color={CORAL} size={15} />About Colvy</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 68px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 18px' }}>The whole customer conversation,<br /><span style={{ color: CORAL }}>in one place</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Colvy started with a simple frustration: growing businesses were paying for five tools that didn’t talk to each other. So we built one that does — feedback, inbox, CRM and calls, priced for SMBs, not enterprise.</p>
            <div className="ab-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ab-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ab-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', boxShadow: `0 30px 70px ${CORAL}44` }}>
            <Image src="/about/hero.jpg" alt="The Colvy team working together" fill priority sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${CORAL}d9 0%, ${CORAL}59 40%, rgba(10,12,20,0.42) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', animation: 'abFloat 6s ease-in-out infinite' }}><FeatureIcon name="bolt" color="rgba(255,255,255,0.95)" size={50} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: 26 }}>
              {['Built for SMBs', 'One platform', 'Australian 🇦🇺 team'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '8px 15px', animation: `abFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* STORY */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 20px' }}>
        <div className="ab-story" style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'start' }}>
          <Reveal>
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: CORAL }}>Why we built Colvy</span>
            <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 0' }}>Small businesses deserve better than a stack of disconnected apps</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <div style={{ fontSize: 16.5, lineHeight: 1.7, color: muted, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0 }}>Run a growing business and you end up living in a dozen tabs: a helpdesk for tickets, a CRM for contacts, a separate calling app, a survey tool, a changelog, a reviews dashboard. None of them share context, each one sends its own bill, and the customer feels the seams.</p>
              <p style={{ margin: 0 }}>We thought conversations should be simpler than that. Every message a customer sends — SMS, WhatsApp, email, chat, a call, a review — is part of one relationship, so it should live in one thread with the full history beside it.</p>
              <p style={{ margin: 0 }}>Colvy brings feedback, inbox, CRM and calling into that one place, priced fairly for the businesses that need it most. We’d rather earn your renewal every month than lock you into a contract — so everything is published pricing, month to month, your data always yours to export.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* VALUES */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '46px 24px 20px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>What we <span style={{ color: CORAL }}>stand for</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.55 }}>The principles that shape every decision — from how we price to how we answer the phone.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={(i % 3) * 0.05}>
              <div className="ab-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: v.accent + '16', color: v.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={v.icon} color={v.accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{v.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{v.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BELIEF BAND */}
      <section style={{ padding: 'clamp(44px, 6vw, 76px) 24px', margin: '30px 0' }}>
        <Reveal>
          <div style={{ position: 'relative', overflow: 'hidden', maxWidth: 1000, margin: '0 auto', borderRadius: 28, padding: 'clamp(32px, 5vw, 60px)', background: `linear-gradient(150deg, ${CORAL}14, ${PURPLE}0d)`, border: `1px solid ${cardBorder}` }}>
            <div aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 220, height: 220, borderRadius: '50%', background: CORAL + '1e', filter: 'blur(40px)' }} />
            <p style={{ position: 'relative', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: CORAL, margin: '0 0 14px' }}>What we believe</p>
            <p style={{ position: 'relative', fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.35, color: text, margin: 0, maxWidth: 760 }}>Great customer relationships shouldn’t be a luxury reserved for enterprises with big budgets and bigger tool stacks. Give a small team one lively place to talk, sell and listen — and they’ll out-care anyone.</p>
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 18 }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 16px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(28px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: CORAL }}>{s.big}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Come grow with us</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Bring every conversation into one place — and see what a lighter stack feels like.</p>
            <button onClick={go} className="ab-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free — no card</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
