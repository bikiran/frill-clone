'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Solutions hub — Colvy grouped by the job you're trying to do (support, sales,
// marketing, reviews, feedback, payments), cross-cutting the channel / feature /
// industry sections. Mirrors the look of the other marketing hubs.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#d97706', INK = '#0f1119'

// The six use-case solutions. `metric` is a small capability pill, not a claim.
const SOLUTIONS = [
  { slug: 'customer-support', icon: 'inbox', title: 'Customer support', tag: 'Every question in one shared inbox, with AI drafts and full history.', metric: 'Shared inbox', accent: BLUE },
  { slug: 'sales', icon: 'tag', title: 'Sales & conversions', tag: 'Capture leads, follow up automatically and sell right in the chat.', metric: 'Sell in-chat', accent: GREEN },
  { slug: 'marketing', icon: 'megaphone', title: 'Marketing & campaigns', tag: 'Targeted SMS, WhatsApp and email — and every reply in one inbox.', metric: 'Broadcasts', accent: PURPLE },
  { slug: 'reviews', icon: 'star', title: 'Reviews & reputation', tag: 'Automate Google review requests and reply without leaving Colvy.', metric: 'Google reviews', accent: AMBER },
  { slug: 'feedback', icon: 'idea', title: 'Product feedback', tag: 'Ideas board, public roadmap and changelog — the loop, closed.', metric: 'Idea → ship', accent: CORAL },
  { slug: 'payments', icon: 'link', title: 'Payments & orders', tag: 'Payment links, live orders and delivery tracking, all in the thread.', metric: 'Get paid in-chat', accent: CYAN },
]

// Why one platform for all of it.
const WHY = [
  { icon: 'bolt', title: 'One platform', desc: 'Support, sales, marketing and feedback share the same inbox and CRM.' },
  { icon: 'user', title: 'Full context everywhere', desc: 'Every conversation carries the customer’s history, orders and notes.' },
  { icon: 'ai', title: 'AI across the board', desc: 'The same assistant drafts replies, answers WISMO and summarises threads.' },
  { icon: 'tag', title: 'SMB pricing', desc: 'One fair, flat plan — not a separate subscription per job.' },
]

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 26 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function SolutionsHub() {
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
        @keyframes solFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .sol-card,.sol-btn{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .sol-card:hover{ transform:translateY(-6px); }
        .sol-card .sol-arrow{ transition:transform .22s cubic-bezier(0.16,1,0.3,1); }
        .sol-card:hover .sol-arrow{ transform:translateX(4px); }
        .sol-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .sol-hero{ grid-template-columns:1fr !important; } .sol-hero-cta{ flex-wrap:nowrap !important; } .sol-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="solFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="sol-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 40px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="target" color={CORAL} size={15} />Solutions</span>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 74px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px' }}>Whatever the job,<br /><span style={{ color: CORAL }}>one place to do it</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Support, sales, marketing, reviews, feedback and payments — all in the same inbox, sharing the same customer history. Pick where you want to start.</p>
            <div className="sol-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="sol-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="sol-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', boxShadow: `0 30px 70px ${CORAL}44` }}>
            <img src="/solutions/hub.jpg" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${CORAL}e6 0%, ${CORAL}73 42%, rgba(10,12,20,0.55) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', animation: 'solFloat 6s ease-in-out infinite' }}><FeatureIcon name="target" color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {['Support', 'Sales', 'Marketing', 'Feedback'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '9px 16px', animation: `solFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* WHY grid */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 30px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {WHY.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.05}>
              <div className="sol-card" style={{ height: '100%', borderRadius: 18, padding: 22, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><FeatureIcon name={f.icon} color={CORAL} size={21} /></span>
                <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: '0 0 5px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SOLUTION CARDS */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>Start with a <span style={{ color: CORAL }}>solution</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.55 }}>Each one runs on the same platform — so you can add the next whenever you’re ready, with nothing to re-migrate.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {SOLUTIONS.map((s, i) => (
            <Reveal key={s.slug} delay={(i % 3) * 0.05}>
              <a href={`/solutions/${s.slug}`} className="sol-card" style={{ position: 'relative', overflow: 'hidden', display: 'block', height: '100%', borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, padding: '24px 24px 22px', textDecoration: 'none', boxShadow: '0 1px 2px rgba(15,17,25,0.04)' }}>
                <div aria-hidden style={{ position: 'absolute', top: -36, right: -36, width: 150, height: 150, borderRadius: '50%', background: s.accent + (dark ? '22' : '18'), filter: 'blur(30px)' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: s.accent + '18', color: s.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FeatureIcon name={s.icon} color={s.accent} size={23} /></span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: s.accent, background: s.accent + '14', borderRadius: 999, padding: '5px 12px' }}>{s.metric}</span>
                </div>
                <h3 style={{ position: 'relative', fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em', margin: '0 0 5px', color: text }}>{s.title}</h3>
                <p style={{ position: 'relative', fontSize: 14, color: muted, lineHeight: 1.5, margin: '0 0 18px' }}>{s.tag}</p>
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: s.accent }}>Explore<span className="sol-arrow" style={{ display: 'inline-flex' }}>→</span></span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>One platform for all of it</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Start with one job and grow into the rest — no new tools, no re-migrating.</p>
            <button onClick={go} className="sol-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free — no card</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
