'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Security / trust page. Marketing-styled (nav, footer, dark mode) like the rest
// of the site. IMPORTANT: describes real practices only — no fabricated
// certifications, audits, or uptime figures. Card data is handled by Stripe, so
// those claims are accurate; everything else is phrased as practice, not badge.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'
const SECURITY_EMAIL = 'security@colvy.com'

const PRACTICES = [
  { icon: 'lock', title: 'Encryption everywhere', desc: 'Traffic is encrypted in transit with TLS, and your data is encrypted at rest on managed cloud infrastructure.', accent: BLUE },
  { icon: 'user', title: 'Least-privilege access', desc: 'Internal access to customer data is limited, role-based and granted only when it’s genuinely needed.', accent: PURPLE },
  { icon: 'folder', title: 'Your data is yours', desc: 'Export your contacts and conversations anytime, and ask us to delete your data when you leave.', accent: GREEN },
  { icon: 'tag', title: 'Payments handled by Stripe', desc: 'Card details go straight to Stripe (a PCI DSS Level 1 provider). Colvy never sees or stores card numbers.', accent: CORAL },
  { icon: 'bolt', title: 'Reliable infrastructure', desc: 'Hosted on established managed cloud infrastructure with automated, regular backups.', accent: AMBER },
  { icon: 'bell', title: 'Monitoring & alerts', desc: 'Systems are continuously monitored so unusual activity is caught and acted on quickly.', accent: CYAN },
]

const HANDLING = [
  { t: 'We collect what we need', d: 'Colvy stores the conversations, contacts and content you bring in to run your business — not more than that.' },
  { t: 'You stay in control', d: 'You decide who on your team can see what, and you can export or delete your data on request.' },
  { t: 'We’re transparent', d: 'Our Privacy Policy explains what we hold and why, in plain language — no fine-print surprises.' },
]

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 26 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function SecurityPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])

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
        @keyframes seFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        .se-card{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .se-card:hover{ transform:translateY(-6px); }
        @media (max-width:900px){ .se-hero-cta{ flex-wrap:nowrap !important; } .se-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="seFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', padding: 'clamp(100px, 13vw, 150px) 24px 26px', maxWidth: 860, margin: '0 auto' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 74, height: 74, borderRadius: 22, background: `linear-gradient(150deg, ${CORAL}, ${CORAL}bb)`, color: '#fff', marginBottom: 22, boxShadow: `0 18px 44px ${CORAL}55`, animation: 'seFloat 6s ease-in-out infinite' }}><FeatureIcon name="lock" color="#fff" size={34} /></span>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 16 }}>Security &amp; trust</span>
          </div>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 16px' }}>Your data, <span style={{ color: CORAL }}>protected</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 620, margin: '0 auto 28px', lineHeight: 1.6 }}>Colvy holds some of your most important business relationships. We take that seriously — here’s how we keep your conversations and customer data safe.</p>
          <div className="se-hero-cta" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <a href="/signup" style={btnPrimary}>Start free — no card →</a>
            <a href={`mailto:${SECURITY_EMAIL}`} style={btnGhost}>Contact security</a>
          </div>
        </Reveal>
      </section>

      {/* PRACTICES */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 24px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {PRACTICES.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.05}>
              <div className="se-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: p.accent + '16', color: p.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={p.icon} color={p.accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{p.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW WE HANDLE YOUR DATA */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : CORAL + '08', padding: 'clamp(46px, 6vw, 80px) 24px', margin: '46px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 42px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>How we handle <span style={{ color: CORAL }}>your data</span></h2>
            <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.55 }}>The short version — the full detail lives in our <a href="/privacy" style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>Privacy Policy</a>.</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {HANDLING.map((h, i) => (
              <Reveal key={h.t} delay={(i % 3) * 0.05}>
                <div className="se-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: CORAL, color: '#fff', fontWeight: 900, fontSize: 15, marginBottom: 12 }}>{i + 1}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: text }}>{h.t}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{h.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* RESPONSIBLE DISCLOSURE */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 20px' }}>
        <Reveal>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 'clamp(28px, 4vw, 44px)', background: `linear-gradient(150deg, ${BLUE}12, ${PURPLE}0a)`, border: `1px solid ${cardBorder}` }}>
            <div aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 200, height: 200, borderRadius: '50%', background: BLUE + '1c', filter: 'blur(40px)' }} />
            <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ width: 52, height: 52, borderRadius: 15, background: BLUE + '18', color: BLUE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name="help" color={BLUE} size={26} /></span>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <h2 style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px', color: text }}>Found a vulnerability?</h2>
                <p style={{ fontSize: 15.5, lineHeight: 1.6, color: muted, margin: '0 0 14px', maxWidth: 640 }}>We welcome responsible disclosure. If you believe you’ve found a security issue, email us with the details and steps to reproduce, and we’ll investigate and respond quickly. Please give us a reasonable chance to fix it before sharing it publicly.</p>
                <a href={`mailto:${SECURITY_EMAIL}?subject=${encodeURIComponent('Security disclosure')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: BLUE, textDecoration: 'none' }}>{SECURITY_EMAIL} →</a>
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: muted, margin: '22px auto 0', maxWidth: 640, lineHeight: 1.55 }}>Need specific security or compliance information for your procurement process? <a href={`mailto:${SECURITY_EMAIL}`} style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>Get in touch</a> and we’ll help. See also our <a href="/privacy" style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>Privacy Policy</a> and <a href="/terms" style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>Terms</a>.</p>
        </Reveal>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})`, marginTop: 46 }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Built on trust</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Bring your customer conversations somewhere they’re looked after. Start free — no card.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
