'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', INK = '#0f1119'

const CARDS = [
  { slug: 'podium', name: 'Colvy vs Podium', tag: 'More channels, deeper AI, no lock-in', metric: 'No contracts', accent: GREEN },
  { slug: 'gorgias', name: 'Colvy vs Gorgias', tag: 'Full comms platform, not just a helpdesk', metric: 'AI', accent: PURPLE },
  { slug: 'gladly', name: 'Colvy vs Gladly', tag: 'SMB pricing, not enterprise', metric: 'SMB', accent: PINK },
  { slug: 'intercom', name: 'Colvy vs Intercom', tag: 'True omnichannel, not just chat', metric: 'Calls', accent: CORAL },
  { slug: 'zendesk', name: 'Colvy vs Zendesk', tag: 'Threads not tickets, 45-min setup', metric: '45 min', accent: BLUE },
  { slug: 'freshdesk', name: 'Colvy vs Freshdesk', tag: 'All-in-one, no add-on fees', metric: '$0', accent: CYAN },
]

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
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

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`.ch-card{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); } .ch-card:hover{ transform:translateY(-6px); box-shadow:0 24px 50px rgba(15,17,25,0.12); }`}</style>
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      <section style={{ textAlign: 'center', padding: '150px 24px 20px', background: dark ? 'linear-gradient(180deg,#10111b,#0a0b12 80%)' : 'linear-gradient(180deg,#fff4ef,#ffffff 80%)' }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: CORAL, background: CORAL + '16', padding: '6px 14px', borderRadius: 999, marginBottom: 18 }}>Compare</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 68px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 auto 16px', maxWidth: 820 }}>See how Colvy <span style={{ color: CORAL }}>compares</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 600, margin: '0 auto 8px', lineHeight: 1.6 }}>More channels, smarter AI, Australian 🇦🇺 support and a 45-minute migration — see how Colvy stacks up against the biggest names in customer communication.</p>
        </Reveal>
      </section>

      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '30px 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {CARDS.map((card, i) => (
            <Reveal key={card.slug} delay={(i % 3) * 0.06}>
              <a href={`/compare/${card.slug}`} className="ch-card" style={{ display: 'block', height: '100%', borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, borderTop: `4px solid ${card.accent}`, padding: '26px 26px 24px', textDecoration: 'none' }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px', color: card.accent }}>{card.name}</h2>
                <p style={{ fontSize: 15, color: muted, lineHeight: 1.55, margin: '0 0 22px' }}>{card.tag}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: text, letterSpacing: '-0.02em' }}>{card.metric}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: card.accent }}>Compare →</span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Switch in 45 minutes</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Our team handles the migration. Keep your number, your reviews and your customers.</p>
            <button onClick={go} style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free — no card</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
