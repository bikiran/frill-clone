'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Careers page. Same look and animation language as the rest of the marketing
// site: photographed hero, a culture/perks grid, a "how we hire" flow, the teams
// we're growing, and a talent CTA. We deliberately do NOT list fabricated job
// posts with an apply funnel — instead we show the areas we hire into and invite
// people to introduce themselves at the customer-facing careers address.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'
const CAREERS_EMAIL = 'careers@colvy.com'

const PERKS = [
  { icon: 'globe', title: 'Remote-friendly', desc: 'Work where you do your best. We’re a distributed team, rooted in Australia 🇦🇺.', accent: CYAN },
  { icon: 'bolt', title: 'Real ownership', desc: 'Small team, wide scope. What you build ships — and customers feel it fast.', accent: CORAL },
  { icon: 'idea', title: 'Always learning', desc: 'Mentorship, room to grow and real time to sharpen your craft.', accent: PURPLE },
  { icon: 'star', title: 'Customers you can reach', desc: 'We build for real SMBs and hear from them every single day.', accent: AMBER },
  { icon: 'lock', title: 'Room to switch off', desc: 'Flexible hours and genuine time to rest. Sustainable beats heroic.', accent: BLUE },
  { icon: 'user', title: 'Low ego, high trust', desc: 'Kind, direct people and no politics. We assume the best of each other.', accent: GREEN },
]

const HIRE = [
  { t: 'Say hello', d: 'A short application or intro. A genuine note beats a perfect CV.' },
  { t: 'First chat', d: 'A relaxed call to swap questions and see if there’s a fit.' },
  { t: 'Show your craft', d: 'A practical, paid exercise close to the real work — no whiteboard gotchas.' },
  { t: 'Meet the team', d: 'Talk to the people you’d actually work alongside.' },
  { t: 'Offer', d: 'Clear, fair and fast. No drawn-out limbo.' },
]

const TEAMS = [
  { icon: 'inbox', title: 'Engineering', desc: 'Product-minded builders shipping the whole platform, end to end.', accent: BLUE },
  { icon: 'pen', title: 'Product & Design', desc: 'Shape the simple, lively experiences small businesses love.', accent: PURPLE },
  { icon: 'chat', title: 'Customer support', desc: 'The friendly Australian 🇦🇺 humans behind our support promise.', accent: GREEN },
  { icon: 'tag', title: 'Sales & success', desc: 'Help businesses switch, onboard and find value fast.', accent: CORAL },
  { icon: 'megaphone', title: 'Marketing', desc: 'Tell the Colvy story to the businesses who need it.', accent: PINK },
  { icon: 'target', title: 'Operations', desc: 'Keep the engine running smoothly as we grow.', accent: AMBER },
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

export default function CareersPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])
  const scrollToTeams = () => document.getElementById('teams')?.scrollIntoView({ behavior: 'smooth' })

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
        @keyframes crFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .cr-card,.cr-btn{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .cr-card:hover{ transform:translateY(-6px); }
        .cr-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .cr-hero{ grid-template-columns:1fr !important; } .cr-hero-cta{ flex-wrap:nowrap !important; } .cr-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="crFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="cr-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 40px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="bolt" color={CORAL} size={15} />Careers</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 68px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 18px' }}>Help small businesses<br /><span style={{ color: CORAL }}>win — and grow with us</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>We’re a small, distributed team building one lively platform for growing businesses. If you like real ownership, kind people and customers you can actually talk to, we’d love to meet you.</p>
            <div className="cr-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={scrollToTeams} className="cr-btn" style={btnPrimary}>See where we hire →</button>
              <a href={`mailto:${CAREERS_EMAIL}`} className="cr-btn" style={btnGhost}>Introduce yourself</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', boxShadow: `0 30px 70px ${CORAL}44` }}>
            <img src="/careers/hero.jpg" alt="The Colvy team celebrating together" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${CORAL}d9 0%, ${CORAL}59 40%, rgba(10,12,20,0.42) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', animation: 'crFloat 6s ease-in-out infinite' }}><FeatureIcon name="star" color="rgba(255,255,255,0.95)" size={50} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: 26 }}>
              {['Remote-friendly', 'Real ownership', 'Low ego, high trust'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '8px 15px', animation: `crFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* PERKS / CULTURE */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '46px 24px 20px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>What it’s like <span style={{ color: CORAL }}>here</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.55 }}>A small team that ships, looks after each other, and stays close to the customers we build for.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {PERKS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.05}>
              <div className="cr-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: p.accent + '16', color: p.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={p.icon} color={p.accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{p.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW WE HIRE */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : CORAL + '08', padding: 'clamp(46px, 6vw, 80px) 24px', margin: '46px 0' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>How we <span style={{ color: CORAL }}>hire</span></h2>
            <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.55 }}>Respectful, practical and quick — the way we’d want to be treated.</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {HIRE.map((s, i) => (
              <Reveal key={s.t} delay={(i % 5) * 0.05}>
                <div className="cr-card" style={{ height: '100%', borderRadius: 18, padding: 22, background: cardBg, border: `1px solid ${cardBorder}` }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: CORAL, color: '#fff', fontWeight: 900, fontSize: 15, marginBottom: 12 }}>{i + 1}</span>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 5px', color: text }}>{s.t}</h3>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: muted, margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TEAMS WE'RE GROWING */}
      <section id="teams" style={{ maxWidth: 1180, margin: '0 auto', padding: '10px 24px 20px', scrollMarginTop: 80 }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>Teams we’re <span style={{ color: CORAL }}>growing</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.55 }}>We post specific openings as they come up. These are the areas we’re building — if one is yours, reach out even before a role is listed.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {TEAMS.map((t, i) => (
            <Reveal key={t.title} delay={(i % 3) * 0.05}>
              <a href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent(t.title + ' at Colvy')}`} className="cr-card" style={{ position: 'relative', overflow: 'hidden', display: 'block', height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                <div aria-hidden style={{ position: 'absolute', top: -36, right: -36, width: 140, height: 140, borderRadius: '50%', background: t.accent + (dark ? '22' : '18'), filter: 'blur(30px)' }} />
                <span style={{ position: 'relative', width: 46, height: 46, borderRadius: 13, background: t.accent + '16', color: t.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={t.icon} color={t.accent} size={23} /></span>
                <h3 style={{ position: 'relative', fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{t.title}</h3>
                <p style={{ position: 'relative', fontSize: 14.5, lineHeight: 1.6, color: muted, margin: '0 0 14px' }}>{t.desc}</p>
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: t.accent }}>Reach out →</span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})`, marginTop: 46 }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Don’t see the right role yet?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>We’re always keen to meet great people. Tell us what you’d love to do and why Colvy.</p>
            <a href={`mailto:${CAREERS_EMAIL}`} className="cr-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Introduce yourself</a>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', margin: '16px 0 0' }}>{CAREERS_EMAIL}</p>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
