'use client'

import { useRef, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import ContactSalesModal from '@/components/ContactSalesModal'

// Public "live demo" landing. Explains the interactive Harbour & Bean café
// showcase, then launches it on click: mints a demo session server-side (the
// password never touches the client) and drops the visitor into the workspace.
// Cross-subdomain uses /auth/handoff; same-origin sets the session directly.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'

const EXPLORE = [
  { icon: 'inbox', title: 'Shared inbox', desc: 'Every channel threaded into one conversation per customer.', accent: BLUE },
  { icon: 'tag', title: 'Live orders', desc: 'Real café orders, tracking and refunds right in the chat.', accent: CORAL },
  { icon: 'ai', title: 'AI assistant', desc: 'Watch it draft replies and answer “where’s my order?”.', accent: PURPLE },
  { icon: 'link', title: 'Payments', desc: 'See payment links and sales recorded on the thread.', accent: GREEN },
  { icon: 'star', title: 'Reviews', desc: 'Review requests and replies, managed in one place.', accent: AMBER },
  { icon: 'phone', title: 'Calls', desc: 'Call logs, recordings and AI summaries on the timeline.', accent: CYAN },
]

const SANDBOX = [
  'A fully loaded workspace — real conversations, orders and contacts to click through.',
  'Nothing you do reaches a real customer; external sends are blocked in the demo.',
  'It resets regularly, so poke around and try anything.',
  'No sign-up and no credit card — just launch and look.',
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

export default function DemoLanding() {
  const [dark, setDark] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [status, setStatus] = useState('')

  const launchDemo = async () => {
    if (launching) return
    setLaunching(true)
    setStatus('Warming up the Harbour & Bean workspace…')
    try {
      const res = await fetch('/api/demo/session', { method: 'POST' })
      const d = await res.json()
      if (!res.ok || !d.access_token) {
        setStatus(d.error || 'The demo is warming up — please try again in a moment.')
        setLaunching(false)
        return
      }
      const slug = d.slug || 'demo'
      const host = typeof window !== 'undefined' ? window.location.hostname : ''
      const onDemoSub = host === `${slug}.colvy.com`
      if (host.endsWith('colvy.com') && !onDemoSub) {
        window.location.href = `https://${slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(d.access_token)}&refresh_token=${encodeURIComponent(d.refresh_token)}&next=${encodeURIComponent('/admin')}`
      } else {
        await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token })
        window.location.href = '/admin'
      }
    } catch {
      setStatus('Something went wrong starting the demo. Please try again.')
      setLaunching(false)
    }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: launching ? 'default' : 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55`, opacity: launching ? 0.85 : 1 }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes dmFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes dmSpin { to { transform: rotate(360deg) } }
        .dm-card,.dm-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .dm-card:hover{ transform:translateY(-6px); }
        .dm-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .dm-hero{ grid-template-columns:1fr !important; } .dm-band{ grid-template-columns:1fr !important; } .dm-hero-cta{ flex-wrap:nowrap !important; } .dm-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="dmFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="dm-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 50px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="bolt" color={CORAL} size={15} />Live demo</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 18px' }}>Take Colvy for a spin,<br /><span style={{ color: CORAL }}>no sign-up</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Step into <strong style={{ color: text, fontWeight: 800 }}>Harbour &amp; Bean</strong> — a fully loaded Colvy workspace for a fictional café. Real conversations, orders, AI and calls, ready to click through.</p>
            <div className="dm-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={launchDemo} disabled={launching} className="dm-btn" style={btnPrimary}>
                {launching
                  ? <><span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', display: 'inline-block', animation: 'dmSpin 0.8s linear infinite' }} />Launching…</>
                  : <>Launch the live demo →</>}
              </button>
              <button onClick={() => setContactOpen(true)} className="dm-btn" style={btnGhost}>Book a guided demo</button>
            </div>
            <div style={{ minHeight: 20, marginTop: 12 }}>
              {status && <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>{status}</p>}
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 360, overflow: 'hidden', boxShadow: `0 30px 70px ${CORAL}44` }}>
            <img src="/demo/hero.jpg" alt="A cosy café interior, like the Harbour & Bean demo workspace" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${CORAL}d9 0%, ${CORAL}59 40%, rgba(10,12,20,0.42) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'dmFloat 6s ease-in-out infinite' }}><FeatureIcon name="inbox" color="rgba(255,255,255,0.95)" size={50} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: 26 }}>
              {['Real workspace', 'Live data', 'Nothing sent for real'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '8px 15px', animation: `dmFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* WHAT YOU CAN EXPLORE */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 24px 20px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>What you can <span style={{ color: CORAL }}>explore</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.55 }}>Everything a real café runs on Colvy — already set up and full of activity.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {EXPLORE.map((e, i) => (
            <Reveal key={e.title} delay={(i % 3) * 0.05}>
              <div className="dm-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: e.accent + '16', color: e.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={e.icon} color={e.accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{e.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{e.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SAFE SANDBOX */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : CORAL + '08', padding: 'clamp(46px, 6vw, 80px) 24px', margin: '46px 0' }}>
        <div className="dm-band" style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <Reveal>
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: CORAL }}>Explore freely</span>
            <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>A real workspace, a safe sandbox</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
              {SANDBOX.map(s => (
                <li key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15.5, fontWeight: 600, color: text, lineHeight: 1.5 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: CORAL + '1a', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{s}
                </li>
              ))}
            </ul>
            <button onClick={launchDemo} disabled={launching} className="dm-btn" style={{ ...btnPrimary, marginTop: 26 }}>
              {launching ? 'Launching…' : 'Launch the live demo →'}
            </button>
          </Reveal>
          <Reveal delay={0.1}>
            <div style={{ position: 'relative', borderRadius: 24, minHeight: 260, overflow: 'hidden', background: `linear-gradient(140deg, ${CORAL}1f, ${PURPLE}0d)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: CORAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${CORAL}55`, animation: 'dmFloat 6s ease-in-out infinite' }}>
                <FeatureIcon name="lock" color="#fff" size={44} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Ready to make it yours?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Spin up your own Colvy in about 45 minutes — start free, no credit card.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <ContactSalesModal open={contactOpen} onClose={() => setContactOpen(false)} dark={dark} source="demo" title="Book a guided demo" />

      <MarketingFooter dark={dark} />
    </div>
  )
}
