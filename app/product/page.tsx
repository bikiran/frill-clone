'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const PURPLE = '#7c5cff'
const PINK = '#ff4d8d'
const CYAN = '#0891b2'
const INK = '#0f1119'
const ACCENTS = [CORAL, BLUE, GREEN, PURPLE, CYAN, YELLOW, PINK, CORAL]

const FEATURES = [
  { icon: 'idea', title: 'Idea Board', subtitle: 'Capture what customers actually want', description: 'A beautiful public board where anyone can submit, vote, and comment on feature requests. The best ideas surface naturally — no spreadsheets, no survey fatigue.', bullets: ['Anonymous or authenticated submissions', 'Upvote system — best ideas rise to the top', 'Rich descriptions with images and links', 'Sort by votes, recency, or status'] },
  { icon: 'map', title: 'Public Roadmap', subtitle: 'Show customers what’s coming', description: 'Turn your top ideas into a living roadmap. Customers can see what’s planned, what’s in progress, and what just shipped — building trust with every update.', bullets: ['Planned / In Progress / Shipped columns', 'Drag ideas between stages', 'Link ideas directly to roadmap items', 'Embeddable anywhere'] },
  { icon: 'megaphone', title: 'Announcements', subtitle: 'Close the loop, every time', description: 'Your own changelog. Post updates about new features, improvements, and fixes — and automatically notify everyone who voted for that idea.', bullets: ['Tag posts as New Feature, Improvement, or Bug Fix', 'Auto-notify voters when their idea ships', 'Beautiful announcement cards', 'RSS feed included'] },
  { icon: 'plug', title: 'Embeddable Widget', subtitle: 'Meet users where they are', description: 'Drop a single script tag into your app and the full feedback experience appears as a lightweight widget. No redirects, no context switching.', bullets: ['One-line install — copy, paste, done', 'Matches your brand colors', 'SSO passthrough — users stay logged in', 'Works on web, React, Vue, plain HTML'] },
  { icon: 'lock', title: 'SSO & Authentication', subtitle: 'Seamless for your users', description: 'Users who are already logged into your product don’t need to create yet another account. Single sign-on passes their identity straight through.', bullets: ['JWT-based SSO integration', 'Magic link sign-in', 'Email + password', 'Control who can post and who can only vote'] },
  { icon: 'bolt', title: 'Integrations', subtitle: 'Plugs into your existing workflow', description: 'Connect your feedback loop to the tools your team already uses. New idea in? Slack pings your channel. Status changes? Jira ticket updates automatically.', bullets: ['Slack — instant notifications', 'Jira — sync ideas as issues', 'Zapier — connect anything', 'REST API for custom workflows'] },
  { icon: 'camera', title: 'Automated Screenshots', subtitle: 'Always up-to-date visuals in your Help Center', description: 'Your product changes every week. Colvy captures and refreshes screenshots of your app automatically, so your Help Center always matches what users actually see.', bullets: ['Schedule captures on any URL', 'Annotate with arrows, rectangles, and callouts', 'Auto-embed into help articles', 'Before/after diff view to spot stale screenshots instantly'] },
  { icon: 'ai', title: 'AI Writing Assistant', subtitle: 'Better feedback and help articles, faster', description: 'Built-in AI improves feedback quality at the source and helps your team write clear help articles in minutes.', bullets: ['Improve writing on submitted feedback before it posts', 'Auto-generate help article first drafts', 'Suggest related articles as users type', 'Tone and grammar polish in one click'] },
]

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 30 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}
const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)

export default function FeaturesIndex() {
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])
  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try { const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(); if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`; else await redirectToUserAdmin(user.id) } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const canvas = dark ? '#0e0f18' : '#fff6f2'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const navScrolled = scrollY > 30
  const navBg = navScrolled ? (dark ? 'rgba(10,11,18,0.82)' : 'rgba(255,255,255,0.85)') : 'transparent'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`.fx-card,.fx-navlink,.fx-btn{transition:all 0.22s cubic-bezier(0.16,1,0.3,1)} .fx-card:hover{transform:translateY(-6px)} .fx-navlink:hover{color:${CORAL} !important} .fx-btn:hover{transform:translateY(-2px)} @media(max-width:760px){.fx-desktop{display:none !important} .fx-hero-cta{flex-wrap:nowrap !important;align-items:stretch !important} .fx-hero-cta > *{flex:1 1 0 !important;min-width:0 !important;justify-content:center !important;text-align:center !important;padding-left:14px !important;padding-right:14px !important}}`}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}><img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} /><span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span></a>
          <div className="fx-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' }].map((n) => (<a key={n.label} href={n.href} className="fx-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none' }}>{n.label}</a>))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            <button onClick={go} className="fx-btn" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', padding: '150px 24px 80px', textAlign: 'center', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 70%)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-16%', left: '-6%', width: 420, height: 420, background: YELLOW, borderRadius: '50%', opacity: dark ? 0.14 : 0.4, filter: 'blur(20px)', transform: `translateY(${scrollY * 0.1}px)` }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-20%', right: '-6%', width: 460, height: 460, background: BLUE, borderRadius: '50%', opacity: dark ? 0.14 : 0.12, filter: 'blur(30px)' }} />
        <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          <Reveal>
            <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: CORAL, margin: '0 0 16px' }}>Everything you need</p>
            <h1 style={{ fontSize: 'clamp(42px, 6.2vw, 82px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 0.98, margin: '0 0 22px' }}>Customer feedback,<br />into <span style={{ color: CORAL }}>shipped features.</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 620, margin: '0 auto 32px' }}>One platform. Collect ideas, plan your roadmap, and announce what you ship — all in a single, beautiful tool your customers will love using.</p>
            <div className="fx-hero-cta" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <button onClick={go} className="fx-btn" style={btnPrimary}>{user ? 'Go to dashboard' : 'Start for free'} <ArrowRight /></button>
              <a href="/pricing" className="fx-btn" style={btnGhost}>See pricing</a>
            </div>
            <p style={{ fontSize: 13.5, color: muted, marginTop: 16 }}>14-day free trial · No credit card required</p>
          </Reveal>
        </div>
      </section>

      {/* GRID */}
      <section style={{ padding: 'clamp(56px, 8vw, 100px) 24px', background: canvas, borderTop: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 22 }}>
          {FEATURES.map((f, i) => {
            const c = ACCENTS[i % ACCENTS.length]
            return (
              <Reveal key={f.title} delay={(i % 2) * 0.06}>
                <div className="fx-card" style={{ padding: 30, borderRadius: 22, background: cardBg, border: `1px solid ${cardBorder}`, height: '100%' }}>
                  <div style={{ width: 54, height: 54, borderRadius: 16, background: c + '18', border: `1px solid ${c}33`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><FeatureIcon name={f.icon} color={c} size={26} /></div>
                  <p style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: c, margin: '0 0 6px' }}>{f.subtitle}</p>
                  <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: text, margin: '0 0 10px' }}>{f.title}</h2>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: muted, margin: '0 0 18px' }}>{f.description}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {f.bullets.map(b => (<li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: text }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{b}</li>))}
                  </ul>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 9vw, 120px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -50, left: '8%', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -70, right: '8%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(30px, 5vw, 58px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.04, margin: '0 0 14px' }}>Ready to close the feedback loop?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Ship better products with your customers, not just for them.</p>
            <button onClick={go} className="fx-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started free <ArrowRight /></button>
          </Reveal>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
