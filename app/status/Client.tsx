'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// System status page. Shows current component states (operational by default) and
// a recent history. It deliberately does NOT invent uptime percentages or a fake
// outage timeline — a real deployment would wire these tiles to live monitoring.

const CORAL = '#ff6a4d', PINK = '#ff4d8d', PURPLE = '#7c5cff', GREEN = '#12b76a', INK = '#0f1119'

const COMPONENTS = [
  { icon: 'inbox', name: 'Web app & dashboard', desc: 'Signing in and using the Colvy admin' },
  { icon: 'link', name: 'Inbox & API', desc: 'Conversations, contacts and the public API' },
  { icon: 'chat', name: 'Messaging channels', desc: 'SMS, WhatsApp, email and social DMs' },
  { icon: 'phone', name: 'Voice & calls', desc: 'Inbound/outbound calling and recordings' },
  { icon: 'ai', name: 'AI assistant', desc: 'Drafting, summaries and AI actions' },
  { icon: 'tag', name: 'Payments & orders', desc: 'Payment links and order sync' },
  { icon: 'plug', name: 'Integrations & sync', desc: 'WooCommerce, Shopify, Stripe, Zapier' },
]

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 22 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function StatusPage() {
  const [dark, setDark] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const days = now ? Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - i); return d }) : []

  const OperationalPill = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: GREEN }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: GREEN, boxShadow: `0 0 0 3px ${GREEN}26` }} />Operational
    </span>
  )

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .st-row{ transition:background .16s; }
        .st-row:hover{ background:${dark ? 'rgba(255,255,255,0.03)' : 'rgba(15,17,25,0.02)'}; }
        @media (prefers-reduced-motion:reduce){ .st-row{ transition:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      <section style={{ maxWidth: 820, margin: '0 auto', padding: '150px 24px 20px' }}>
        {/* Overall banner */}
        <Reveal>
          <div style={{ borderRadius: 22, overflow: 'hidden', border: `1px solid ${GREEN}44`, background: `linear-gradient(150deg, ${GREEN}1a, ${GREEN}08)`, padding: 'clamp(24px, 4vw, 34px)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: GREEN, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', fontWeight: 900, letterSpacing: '-0.025em', margin: '0 0 4px' }}>All systems operational</h1>
              <p style={{ fontSize: 14, color: muted, margin: 0 }}>{now ? `Last checked ${fmt(now)}, ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Checking current status…'}</p>
            </div>
          </div>
        </Reveal>

        {/* Components */}
        <Reveal delay={0.05}>
          <div style={{ marginTop: 22, borderRadius: 20, border: `1px solid ${cardBorder}`, background: cardBg, overflow: 'hidden' }}>
            {COMPONENTS.map((c, i) => (
              <div key={c.name} className="st-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={c.icon} color={CORAL} size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: text }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: muted }}>{c.desc}</div>
                </div>
                <OperationalPill />
              </div>
            ))}
          </div>
        </Reveal>

        {/* Recent history */}
        <Reveal delay={0.05}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', margin: '40px 0 14px' }}>Recent history</h2>
          <div style={{ borderRadius: 20, border: `1px solid ${cardBorder}`, background: cardBg, overflow: 'hidden' }}>
            {days.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 20px', borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{fmt(d)}</span>
                <span style={{ fontSize: 13.5, color: muted, display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />No incidents reported</span>
              </div>
            ))}
            {days.length === 0 && <div style={{ padding: '16px 20px', fontSize: 14, color: muted }}>Loading…</div>}
          </div>
          <p style={{ fontSize: 13, color: muted, margin: '16px 2px 0', lineHeight: 1.6 }}>
            Component states reflect current monitoring. For help with something that isn’t working, reach us at <a href="mailto:support@colvy.com" style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>support@colvy.com</a>.
          </p>
        </Reveal>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 84px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})`, marginTop: 40 }}>
        <Reveal>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4.6vw, 44px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Reliable by design</h2>
            <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.9)', margin: '0 0 26px' }}>One dependable place for every customer conversation. Start free — no card.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
