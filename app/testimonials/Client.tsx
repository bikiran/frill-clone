'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

// Testimonials wall. NOTE: these are illustrative placeholder quotes (the same
// first-party demo brands the landing page uses, plus a few more in the same
// style) — swap them for real customer quotes before launch. Monogram avatars
// are used deliberately so no real person's photo is attached to a placeholder.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', GREEN = '#00c48c', PURPLE = '#7c5cff', PINK = '#ff4d8d', CYAN = '#0891b2', YELLOW = '#ffcb45', INK = '#0f1119'
const ACCENT = CORAL

type Story = { name: string; role: string; company: string; color: string; quote: string; metric: string }

const STORIES: Story[] = [
  { name: 'Sam Rivera', role: 'CEO', company: 'Roxy Aquarium', color: CORAL, quote: 'A WhatsApp message becomes a paid sale without leaving the thread.', metric: 'Sell in chat' },
  { name: 'Aiko Tanaka', role: 'Product Lead', company: 'nePlay', color: BLUE, quote: 'One shared inbox for every channel. Our team finally moves fast.', metric: '2× replies' },
  { name: 'Jordan Mills', role: 'Founder', company: 'Prexty', color: GREEN, quote: 'We see the real revenue every conversation generates. Game changer.', metric: '+28 NPS' },
  { name: 'Ava Thompson', role: 'Marketing Lead', company: 'Lumen Digital', color: PURPLE, quote: 'Every client’s channels in one branded workspace — reporting takes minutes, not a whole afternoon.', metric: 'White-label' },
  { name: 'Dan O’Brien', role: 'Owner', company: 'Copperleaf Café', color: PINK, quote: 'Bookings, WhatsApp and reviews finally live in one place. Nothing slips between shifts anymore.', metric: '5★ reviews' },
  { name: 'Sarah Kim', role: 'Support Lead', company: 'Northwind', color: CYAN, quote: 'The assistant drafts most replies from our own docs. The team just reads and approves.', metric: '24/7 AI' },
  { name: 'Leah Brooks', role: 'Store Manager', company: 'Willow & Pine', color: YELLOW, quote: 'Customers ask “where’s my order?” and the AI answers with live tracking before we even see it.', metric: 'WISMO handled' },
  { name: 'Mia Nguyen', role: 'Practice Manager', company: 'Harbourside Dental', color: GREEN, quote: 'Two-way reminders cut our no-shows and took a load off the front desk.', metric: 'Fewer no-shows' },
  { name: 'Tom Fletcher', role: 'Principal', company: 'Fletcher & Co Property', color: BLUE, quote: 'We reply to every lead in seconds now — even after hours. The first to respond usually wins.', metric: 'Instant reply' },
]

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

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
const Stars = () => (<div style={{ display: 'flex', gap: 3, marginBottom: 14, color: YELLOW }}>{[...Array(5)].map((_, j) => <svg key={j} width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>)}</div>)

export default function TestimonialsPage() {
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
        .tm-card{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); break-inside:avoid; }
        .tm-card:hover{ transform:translateY(-6px); }
        .tm-btn{ transition:transform 0.18s; } .tm-btn:hover{ transform:translateY(-2px); }
        .tm-wall{ column-count:3; column-gap:18px; }
        @media (max-width:900px){ .tm-wall{ column-count:2; } }
        @media (max-width:560px){ .tm-wall{ column-count:1; } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', maxWidth: 860, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 30px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 60% 60% at 50% 35%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}>Testimonials</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 16px' }}>Loved by teams that <span style={{ color: ACCENT }}>talk all day</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 600, lineHeight: 1.6, margin: '0 auto 28px' }}>From cafés to clinics to SaaS teams — here’s what it feels like when every customer conversation lives in one place.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={go} className="tm-btn" style={btnPrimary}>Start free — no card →</button>
            <a href="/pricing" className="tm-btn" style={btnGhost}>See pricing</a>
          </div>
        </Reveal>
      </section>

      {/* WALL */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 40px' }}>
        <div className="tm-wall">
          {STORIES.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 0.05}>
              <div className="tm-card" style={{ marginBottom: 18, padding: 26, borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <Stars />
                <p style={{ fontSize: 16, lineHeight: 1.65, color: text, fontWeight: 600, margin: '0 0 22px' }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 46, height: 46, borderRadius: '50%', background: t.color + '1a', color: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{initials(t.name)}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: text }}>{t.name}</p>
                      <p style={{ margin: 0, fontSize: 12.5, color: muted }}>{t.role} · {t.company}</p>
                    </div>
                  </div>
                  <span style={{ padding: '5px 11px', borderRadius: 999, background: t.color + '1a', color: t.color, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{t.metric}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}, ${PINK} 55%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>See what it feels like</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="tm-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
