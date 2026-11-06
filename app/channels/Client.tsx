'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { SellioStyles, SPill, SGhost, STrust, SLinkCards, SCta } from '@/components/marketing/Sellio'
import { soonLabel } from '@/lib/feature-availability'

// Channels hub — overview linking to every channel page. Phone calls point to
// the dedicated /phones page (its own top-level product area).

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#f59e0b', WA = '#25d366', INK = '#0f1119'

const CARDS = [
  { icon: 'reaction', title: 'Meta DMs', desc: 'Instagram & Messenger DMs in one inbox.', href: '/channels/meta', accent: PURPLE },
  { icon: 'chat', title: soonLabel('WhatsApp', 'whatsapp'), desc: 'A shared WhatsApp inbox your whole team can answer.', href: '/channels/whatsapp', accent: WA },
  { icon: 'chat', title: 'Two-way SMS', desc: 'Text customers back and forth from a shared number.', href: '/channels/sms', accent: CYAN },
  { icon: 'mail', title: 'Email', desc: 'Gmail or any forwarded mailbox, beside chat.', href: '/channels/email', accent: CORAL },
  { icon: 'chat', title: 'Live chat widget', desc: 'Turn website visitors into conversations.', href: '/channels/chat-widget', accent: BLUE },
  { icon: 'star', title: 'Google Reviews', desc: 'Grow your rating and reply from one place.', href: '/channels/google-reviews', accent: AMBER },
  { icon: 'pen', title: 'Contact forms', desc: 'Branded enquiry forms, straight to your inbox.', href: '/channels/forms', accent: PINK },
  { icon: 'megaphone', title: 'Broadcasts', desc: 'Reach a whole segment at once, by SMS or email.', href: '/channels/broadcasts', accent: '#f97316' },
  { icon: 'phone', title: 'Phone calls', desc: 'A full phone system inside your inbox.', href: '/phones', accent: GREEN },
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
const ArrowRight = ({ s = 15 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)

export default function ChannelsHub() {
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)
  const ACCENT = BLUE

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
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${ACCENT}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .hub-card{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .hub-card:hover{ transform:translateY(-6px); }
        .hub-card:hover .hub-explore{ gap:10px; }
        .hub-btn{ transition:transform 0.18s; } .hub-btn:hover{ transform:translateY(-2px); }
      `}</style>

      <SellioStyles />

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', maxWidth: 900, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 40px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="inbox" color={ACCENT} size={15} />Channels</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 16px' }}>Every channel, <span style={{ color: ACCENT }}>one inbox</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 600, lineHeight: 1.6, margin: '0 auto 28px' }}>Your customers reach out however they like. Colvy brings every channel into one shared thread per customer — with full context beside each message.</p>
          <div className="sl-ctas" style={{ justifyContent: 'center' }}>
            <SPill accent={ACCENT} onClick={go} cta="hub_hero_start">Start free — no card</SPill>
            <SGhost href="/pricing">See pricing</SGhost>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><STrust accent={ACCENT} /></div>
        </Reveal>
      </section>

      {/* CARDS — colourful link cards */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px clamp(64px, 9vw, 110px)' }}>
        <SLinkCards items={CARDS.map(c => ({ ...c, color: c.accent }))} dark={dark} />
      </section>

      <SCta title="One inbox for every channel" sub="Free forever for small teams. Upgrade as you grow." accent={ACCENT} onGo={go} user={user} />

      <MarketingFooter dark={dark} />
    </div>
  )
}
