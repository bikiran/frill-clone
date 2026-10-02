'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'
import MarketingNav from '@/components/MarketingNav'
import FeatureIcon from '@/components/FeatureIcon'

// Product overview — the feedback suite (ideas → roadmap → announcements),
// plus the help center and the tools around it. Pillars deep-link to the
// per-feature pages under /product/[feature]. Copy matches the real product.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', GREEN = '#00c48c', PURPLE = '#7c5cff', CYAN = '#0891b2', YELLOW = '#ffcb45', PINK = '#ff4d8d', INK = '#0f1119'
const ACCENT = CORAL

// The four headline pillars, each with its own deep-dive page.
const PILLARS = [
  { icon: 'idea', color: CORAL, title: 'Idea Board', desc: 'A public board where customers submit and vote on feature requests. The best ideas rise to the top on their own.', href: '/product/ideas' },
  { icon: 'map', color: BLUE, title: 'Public Roadmap', desc: 'Turn top ideas into a living roadmap — planned, in progress and shipped — so customers always know what’s coming.', href: '/product/roadmap' },
  { icon: 'megaphone', color: GREEN, title: 'Announcements', desc: 'Your own changelog. Post what shipped and auto-notify everyone who voted for it.', href: '/product/announcements' },
  { icon: 'book', color: YELLOW, title: 'Help Center', desc: 'A self-serve knowledge base that deflects tickets, with an AI writing assistant for articles.', href: '/product/knowledgebase' },
]

// The rest of the suite.
const SUITE = [
  { icon: 'vote', title: 'Polls & surveys', desc: 'Ask a quick question, measure sentiment, decide with data.' },
  { icon: 'pen', title: 'Forms', desc: 'Capture structured input — bugs, requests, applications.' },
  { icon: 'plug', title: 'Embeddable widget', desc: 'One line of code drops the whole experience into your app.' },
  { icon: 'lock', title: 'SSO & auth', desc: 'Users already logged in stay logged in — no second account.' },
  { icon: 'camera', title: 'Automated screenshots', desc: 'Keep help-center visuals fresh as your product changes.' },
  { icon: 'ai', title: 'AI writing assistant', desc: 'Polish feedback at the source and draft help articles fast.' },
]

const LOOP = [
  { icon: 'idea', title: 'Collect', desc: 'Ideas come in from the board, the widget and your inbox — all in one place.' },
  { icon: 'vote', title: 'Prioritise', desc: 'Votes and topics surface what customers actually want most.' },
  { icon: 'megaphone', title: 'Announce', desc: 'Ship it, post the update, and everyone who asked gets notified.' },
]

const BANDS = [
  { tag: 'Close the loop', title: 'Voters hear back automatically', body: 'The hardest part of feedback is following up. When an idea moves to Shipped, everyone who voted for it is notified — no lists, no manual emails.', bullets: ['Auto-notify every voter on release', 'Tag posts as feature, improvement or fix', 'Built-in changelog with an RSS feed'], icon: 'bell' },
  { tag: 'Meet users where they are', title: 'Embed the whole thing in a line', body: 'Drop a single script tag into your app and the board, roadmap and announcements appear as a lightweight widget — matched to your brand, with users already signed in.', bullets: ['One-line install', 'Matches your brand colours', 'SSO passthrough keeps users logged in'], icon: 'plug' },
]

const FAQS = [
  { q: 'Can the board and roadmap be private?', a: 'Run them fully public for transparency, private for internal use, or gated behind SSO — your choice, per board.' },
  { q: 'Do voters get notified when something ships?', a: 'Yes. When an idea moves to Shipped, everyone who voted for it is notified automatically.' },
  { q: 'Can I embed it in my own app?', a: 'A one-line widget embeds the whole experience, and SSO passthrough keeps your users logged in — no redirects or extra accounts.' },
  { q: 'Is a help center included?', a: 'Yes — a self-serve knowledge base with an AI writing assistant to draft and polish articles.' },
]

const STATS = [{ big: '3-in-1', label: 'ideas, roadmap & announcements' }, { big: '1-line', label: 'to embed anywhere' }, { big: 'Auto', label: 'voter notifications' }]

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
const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)

function Faq({ q, a, text, muted, cardBg, cardBorder }: { q: string; a: string; text: string; muted: string; cardBg: string; cardBorder: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 16, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: text, fontSize: 16, fontWeight: 800, fontFamily: 'inherit' }}>
        {q}
        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: ACCENT + '18', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </span>
      </button>
      <div style={{ maxHeight: open ? 220 : 0, transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden' }}>
        <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, lineHeight: 1.6, color: muted }}>{a}</p>
      </div>
    </div>
  )
}

export default function ProductPage() {
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
        @keyframes pdFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .pd-card,.pd-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .pd-card:hover{ transform:translateY(-6px); }
        .pd-btn:hover{ transform:translateY(-2px); }
        .pd-pillar:hover .pd-explore{ gap:10px; }
        @media (max-width:900px){ .pd-hero{ grid-template-columns:1fr !important; } .pd-band{ grid-template-columns:1fr !important; } .pd-hero-cta{ flex-wrap:nowrap !important; } .pd-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="pdFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="pd-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="idea" color={ACCENT} size={15} />The feedback loop</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.8vw, 68px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px' }}>Feedback in, <span style={{ color: ACCENT }}>shipped features</span> out</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Collect ideas, plan a public roadmap, and announce what you ship — one connected suite your customers actually enjoy using.</p>
            <div className="pd-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="pd-btn" style={btnPrimary}>{user ? 'Go to dashboard' : 'Start free — no card'} <ArrowRight /></button>
              <a href="/pricing" className="pd-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          {/* Hero photo */}
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${ACCENT} 0%, ${ACCENT}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${ACCENT}44` }}>
            <Image src="/feature/product.jpg" alt="" aria-hidden fill priority sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${ACCENT}e6 0%, ${ACCENT}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'pdFloat 6s ease-in-out infinite' }}><FeatureIcon name="idea" color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {['+147 votes', 'On the roadmap', 'Shipped ✓'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `pdFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* THE LOOP */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '10px 24px 44px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>One connected <span style={{ color: ACCENT }}>loop</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.55, textAlign: 'center' }}>Every piece feeds the next — so feedback never dead-ends in a spreadsheet.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {LOOP.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06}>
              <div style={{ position: 'relative', height: '100%', borderRadius: 20, padding: '26px 22px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ position: 'absolute', top: 20, right: 22, fontSize: 34, fontWeight: 900, color: ACCENT + '20', lineHeight: 1 }}>{i + 1}</span>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={s.icon} color={ACCENT} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{s.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PILLARS */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '10px 24px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 0.06}>
              <a href={p.href} className="pd-card pd-pillar" style={{ display: 'block', height: '100%', borderRadius: 22, padding: 28, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none', color: text }}>
                <span style={{ width: 52, height: 52, borderRadius: 15, background: p.color + '16', border: `1px solid ${p.color}33`, color: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 15 }}><FeatureIcon name={p.icon} color={p.color} size={26} /></span>
                <h3 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.01em', margin: '0 0 8px', color: text }}>{p.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: '0 0 16px' }}>{p.desc}</p>
                <span className="pd-explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: p.color, transition: 'gap 0.22s' }}>Explore <ArrowRight s={15} /></span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BAND 1 */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="pd-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <Reveal>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>{BANDS[0].tag}</span>
              <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{BANDS[0].title}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{BANDS[0].body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {BANDS[0].bullets.map(bl => (
                  <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: ACCENT + '1a', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${ACCENT}22, ${ACCENT}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'pdFloat 6s ease-in-out infinite' }}>
                <FeatureIcon name={BANDS[0].icon} color="#fff" size={44} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* SUITE — the rest */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : ACCENT + '08', padding: 'clamp(44px, 6vw, 84px) 24px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>Everything around the loop</h2>
            <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.55, textAlign: 'center' }}>The extras that make the suite a complete home for customer feedback.</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {SUITE.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.05}>
                <div className="pd-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={ACCENT} size={23} /></span>
                  <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* BAND 2 */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="pd-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: 'rtl' }}>
          <div style={{ direction: 'ltr' }}>
            <Reveal>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>{BANDS[1].tag}</span>
              <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{BANDS[1].title}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{BANDS[1].body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {BANDS[1].bullets.map(bl => (
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
                <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'pdFloat 6s ease-in-out infinite' }}>
                  <FeatureIcon name={BANDS[1].icon} color="#fff" size={44} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', color: ACCENT }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px 60px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 26px' }}>Questions, answered</h2>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={(i % 3) * 0.05}>
              <Faq q={f.q} a={f.a} text={text} muted={muted} cardBg={cardBg} cardBorder={cardBorder} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}, ${PINK} 55%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Ready to close the feedback loop?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Ship better products with your customers, not just for them. Free to start — no credit card.</p>
            <button onClick={go} className="pd-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started free <ArrowRight /></button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
