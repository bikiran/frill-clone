'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { SellioStyles, SPill, SGhost, STrust, SBento, SCta } from '@/components/marketing/Sellio'
import { VsLogos } from '@/components/marketing/CompareLogos'

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', TEAL = '#12b5a5', INDIGO = '#4f46e5', AMBER = '#d97706', INK = '#0f1119'

// Why-Colvy hero feature grid (mirrors the old solutions/compare header the user liked).
const WHY = [
  { icon: 'bolt', title: 'One platform', desc: 'Feedback, inbox, CRM and calls — not four subscriptions.' },
  { icon: 'tag', title: 'Fair pricing', desc: 'Fair, flat pricing. Calls priced well under the pack.' },
  { icon: 'target', title: '45-min setup', desc: 'Live the same afternoon, not next quarter.' },
  { icon: 'user', title: 'No per-seat tricks', desc: 'Add your team without watching the bill explode.' },
  { icon: 'star', title: 'Real support', desc: 'Talk to humans in Australia 🇦🇺 who actually help.' },
  { icon: 'lock', title: 'Own your data', desc: 'Export anytime. Encrypted in transit and at rest.' },
]

// Comparison cards: Colvy's logo and the competitor's, then accents used tastefully (metric pill, arrow) so
// the cards blend with the rest of the site instead of the loud coloured borders.
const CARDS = [
  { slug: 'podium', comp: 'Podium', tag: 'More channels, deeper AI, no lock-in', metric: 'No contracts', accent: GREEN },
  { slug: 'gorgias', comp: 'Gorgias', tag: 'Full comms platform, not just a helpdesk', metric: 'AI', accent: PURPLE },
  { slug: 'gladly', comp: 'Gladly', tag: 'Enterprise features, fair pricing', metric: 'Fair', accent: PINK },
  { slug: 'intercom', comp: 'Intercom', tag: 'True omnichannel, not just chat', metric: 'Calls', accent: CORAL },
  { slug: 'zendesk', comp: 'Zendesk', tag: 'Threads not tickets, 45-min setup', metric: '45 min', accent: BLUE },
  { slug: 'freshdesk', comp: 'Freshdesk', tag: 'All-in-one, no add-on fees', metric: '$0', accent: CYAN },
  { slug: 'coax', comp: 'Coax', tag: 'Comms + a built-in feedback loop', metric: 'Feedback', accent: TEAL },
  { slug: 'highlevel', comp: 'HighLevel', tag: 'Built for your business, not an agency', metric: 'AUD', accent: BLUE },
  { slug: 'salesforce', comp: 'Salesforce', tag: 'One price for the team, not per seat', metric: 'Flat', accent: CYAN },
  { slug: 'aircall', comp: 'Aircall', tag: 'Calls plus texts, chat and email', metric: '1 price', accent: GREEN },
  { slug: 'dialpad', comp: 'Dialpad', tag: 'Phone, chat and email in one inbox', metric: '3,000 SMS', accent: PURPLE },
  { slug: 'ringcentral', comp: 'RingCentral', tag: 'One AUD price, GST included', metric: 'AUD', accent: CORAL },
  { slug: 'manychat', comp: 'ManyChat', tag: 'A real inbox, not just flows', metric: 'Inbox', accent: INDIGO },
  { slug: 'birdeye', comp: 'Birdeye', tag: 'Reviews, calls & feedback — fairly priced', metric: 'All-in-1', accent: AMBER },
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

export default function CompareHub() {
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
        @keyframes chFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ch-card{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .ch-card:hover{ transform:translateY(-6px); }
        .ch-card .ch-arrow{ transition:transform .22s cubic-bezier(0.16,1,0.3,1); }
        .ch-card:hover .ch-arrow{ transform:translateX(4px); }
        .sol-card,.sol-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .sol-card:hover{ transform:translateY(-6px); }
        .sol-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ch-hero{ grid-template-columns:1fr !important; } .ch-hero-cta{ flex-wrap:nowrap !important; } .ch-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="chFloat"]{ animation:none !important } }
      `}</style>

      <SellioStyles />

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* WHY-COLVY HERO (kept from the compare page you liked) */}
      <section className="ch-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 40px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="bolt" color={CORAL} size={15} />Why Colvy</span>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 74px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px' }}>All of it,<br /><span style={{ color: CORAL }}>without the add-on fees</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Feedback, inbox, CRM and calling in one lively platform — for teams of every size, without enterprise lock-in.</p>
            <div className="sl-ctas">
              <SPill accent={CORAL} onClick={go} cta="hub_hero_start">Start free — no card</SPill>
              <SGhost href="/pricing">See pricing</SGhost>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}><STrust accent={CORAL} /></div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', boxShadow: `0 30px 70px ${CORAL}44` }}>
            <img src="/compare/hero.jpg" alt="A team bringing their hands together" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${CORAL}e6 0%, ${CORAL}73 42%, rgba(10,12,20,0.55) 118%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', animation: 'chFloat 6s ease-in-out infinite' }}><FeatureIcon name="bolt" color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {['One platform', 'Fair pricing', 'No per-seat tricks', '45-min setup'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '9px 16px', animation: `chFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* WHY — bento */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px 30px' }}>
        <SBento items={WHY} accent={CORAL} dark={dark} />
      </section>

      {/* COMPARISON CARDS */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, letterSpacing: '-0.025em', textAlign: 'center', margin: '0 0 6px' }}>See how Colvy <span style={{ color: CORAL }}>compares</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16.5, color: muted, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.55 }}>More channels, smarter AI, Australian 🇦🇺 support and a 45-minute set-up — against the biggest names in customer communication.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
          {CARDS.map((card, i) => (
            <Reveal key={card.slug} delay={(i % 3) * 0.05}>
              <a href={`/compare/${card.slug}`} className="ch-card" style={{ position: 'relative', overflow: 'hidden', display: 'block', height: '100%', borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, padding: '24px 24px 22px', textDecoration: 'none', boxShadow: '0 1px 2px rgba(15,17,25,0.04)' }}>
                <div aria-hidden style={{ position: 'absolute', top: -36, right: -36, width: 150, height: 150, borderRadius: '50%', background: card.accent + (dark ? '22' : '18'), filter: 'blur(30px)' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <VsLogos slug={card.slug} name={card.comp} accent={card.accent} size={42} ring={cardBg} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: card.accent, background: card.accent + '14', borderRadius: 999, padding: '5px 12px' }}>{card.metric}</span>
                </div>
                <h3 style={{ position: 'relative', fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em', margin: '0 0 5px', color: text }}>Colvy <span style={{ color: muted, fontWeight: 700 }}>vs</span> {card.comp}</h3>
                <p style={{ position: 'relative', fontSize: 14, color: muted, lineHeight: 1.5, margin: '0 0 18px' }}>{card.tag}</p>
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: card.accent }}>Compare<span className="ch-arrow" style={{ display: 'inline-flex' }}>→</span></span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <SCta title="Switch in 45 minutes" sub="Our team helps you switch. Keep your reviews and your customers." accent={CORAL} onGo={go} user={user} />

      <MarketingFooter dark={dark} />
    </div>
  )
}
