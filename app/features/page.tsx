'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Features — the inbox/CRM platform overview. One page covering the core
// platform capabilities, each with an id anchor so the mega-menu can deep-link
// (/features#inbox, /features#orders, …). Grounded in the real product.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', PINK = '#ff4d8d', TEAL = '#0d9488', INK = '#0f1119'
const ACCENT = TEAL

type Cap = { id: string; icon: string; title: string; desc: string }
const CAPS: Cap[] = [
  { id: 'inbox', icon: 'inbox', title: 'Shared Inbox', desc: 'Every channel threads into one place your whole team can work from.' },
  { id: 'crm', icon: 'user', title: 'Contacts & CRM', desc: 'A full profile, history and lifetime value beside every conversation.' },
  { id: 'gallery', icon: 'folder', title: 'Media Gallery', desc: 'Every photo and file a customer sends, organised and searchable.' },
  { id: 'notes', icon: 'pen', title: 'Notes', desc: 'Internal notes and @mentions on any thread — visible only to your team.' },
  { id: 'orders', icon: 'tag', title: 'Orders', desc: 'Live WooCommerce & Shopify orders and tracking, right in the chat.' },
  { id: 'payments', icon: 'bolt', title: 'Payments', desc: 'Send a payment link or invoice and record the sale on the thread.' },
  { id: 'links', icon: 'link', title: 'Link Reports', desc: 'See who opened and clicked the links you sent, per conversation.' },
  { id: 'insights', icon: 'chart', title: 'Insights', desc: 'Analytics on conversations, response times and the revenue they drive.' },
  { id: 'calendar', icon: 'calendar', title: 'Calendar', desc: 'Bookings, events and reminders, connected to your conversations.' },
  { id: 'tasks', icon: 'kanban', title: 'Tasks', desc: 'Turn any chat into a to-do, assign it, and never let it slip.' },
  { id: 'broadcasts', icon: 'megaphone', title: 'Broadcasts', desc: 'Reach every opted-in customer at once, across SMS, email and WhatsApp.' },
  { id: 'automation', icon: 'target', title: 'Automation', desc: 'Auto-route, follow up and trigger actions on the events that matter.' },
]

const BANDS = [
  { tag: 'One place', title: 'The whole customer, on one screen', body: 'Messages, orders, payments, notes and history sit together — so anyone on your team can pick up any conversation already knowing the full story.', bullets: ['Every channel in one thread', 'Full profile & order history', 'Notes and tasks attached'], icon: 'inbox' },
  { tag: 'Runs itself', title: 'Automate the busywork', body: 'Route conversations, send follow-ups, request reviews and turn chats into tasks automatically — the platform keeps things moving so your team can focus on people.', bullets: ['Auto-routing & follow-ups', 'Chats become tasks', 'Triggers on any event'], icon: 'target' },
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

export default function FeaturesPage() {
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
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${ACCENT}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes ftFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ft-card,.ft-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ft-card:hover{ transform:translateY(-6px); }
        .ft-btn:hover{ transform:translateY(-2px); }
        .ft-cap{ scroll-margin-top:90px; }
        @media (max-width:900px){ .ft-band{ grid-template-columns:1fr !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="ftFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', maxWidth: 900, margin: '0 auto', padding: '150px 24px 30px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="inbox" color={ACCENT} size={15} />Features</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 16px' }}>Everything in <span style={{ color: ACCENT }}>one inbox</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 620, lineHeight: 1.6, margin: '0 auto 28px' }}>Messages, contacts, orders, payments, notes, tasks and insights — the whole customer relationship on one screen.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={go} className="ft-btn" style={btnPrimary}>Start free — no card →</button>
            <a href="/pricing" className="ft-btn" style={btnGhost}>See pricing</a>
          </div>
        </Reveal>
      </section>

      {/* CAPABILITY GRID */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {CAPS.map((c, i) => (
            <Reveal key={c.id} delay={(i % 3) * 0.05}>
              <a id={c.id} href={`/features/${c.id}`} className="ft-card ft-cap" style={{ display: 'block', height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={c.icon} color={ACCENT} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{c.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: '0 0 12px' }}>{c.desc}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: ACCENT }}>Learn more <ArrowRight s={13} /></span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {BANDS.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : ACCENT + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="ft-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <Reveal>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>{b.tag}</span>
                <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{b.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{b.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {b.bullets.map(bl => (
                    <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: ACCENT + '1a', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div style={{ direction: 'ltr' }}>
              <Reveal delay={0.1}>
                <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${ACCENT}22, ${ACCENT}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'ftFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={b.icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}, ${BLUE} 55%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>One platform for every conversation</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ft-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
