'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'

const CORAL = '#ff6a4d'
const PINK = '#ff4d8d'
const PURPLE = '#7c5cff'
const GREEN = '#00c48c'
const INK = '#0f1119'

const TIERS = [
  { id: 'starter', name: 'Starter', monthly: 0, annual: 0, badge: null, cta: 'Get started free', features: ['Unlimited ideas board', 'Public roadmap', 'Changelog / announcements', 'Help Center (10 articles)', 'Widget (all tabs)', '3 team members', 'Guest voting', 'Community support'] },
  { id: 'growth', name: 'Growth', monthly: 49, annual: 39, badge: 'Most popular', cta: 'Start free trial', features: ['Everything in Starter', 'Unlimited help articles', 'Live chat inbox', 'Contacts & CRM', 'WooCommerce sync', 'Review dashboard', 'Scheduled messages', 'AI flow automation', '10 team members', 'Priority support'] },
  { id: 'business', name: 'Business', monthly: 149, annual: 119, badge: null, cta: 'Start free trial', features: ['Everything in Growth', 'Unlimited team members', 'White-label branding', 'Custom domain', 'SSO / SAML', 'Advanced analytics', 'AI writing assistant', 'Priority phone support', 'Dedicated onboarding', 'SLA guarantee'] },
]

const FAQS = [
  { q: 'Is there a free plan?', a: 'Yes — the Starter plan is free forever with no credit card required. It includes unlimited ideas, a public roadmap, help center, and widget.' },
  { q: 'Can I change plans later?', a: 'Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of your billing cycle.' },
  { q: 'What is the 14-day trial?', a: 'Growth and Business plans come with a 14-day free trial. No credit card required. Cancel anytime before the trial ends and you won’t be charged.' },
  { q: 'Is my data safe?', a: 'Yes. All data is encrypted in transit and at rest. We’re hosted on Supabase (PostgreSQL) with daily backups and SOC 2 Type II certified infrastructure.' },
  { q: 'Do you offer discounts for nonprofits or startups?', a: 'Yes — email us at bishalstha76@gmail.com with your details and we’ll set you up with a special rate.' },
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
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)

export default function PricingPage() {
  const [annual, setAnnual] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
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

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`.pr-card,.pr-navlink,.pr-btn{transition:all 0.22s cubic-bezier(0.16,1,0.3,1)} .pr-btn:hover{transform:translateY(-2px)} .pr-navlink:hover{color:${CORAL} !important} @media(max-width:760px){.pr-desktop{display:none !important}}`}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}><img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} /><span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span></a>
          <div className="pr-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Pricing', href: '/pricing', hot: true }].map((n: any) => (<a key={n.label} href={n.href} className="pr-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: n.hot ? 800 : 600, color: n.hot ? CORAL : muted, textDecoration: 'none' }}>{n.label}</a>))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            <button onClick={go} className="pr-btn" style={{ padding: '10px 22px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 14.5, border: 'none', cursor: 'pointer' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        </div>
      </nav>

      {/* HEADER */}
      <section style={{ position: 'relative', padding: '150px 24px 40px', textAlign: 'center', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 70%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 80%)' }}>
        <Reveal>
          <h1 style={{ fontSize: 'clamp(42px, 6vw, 78px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.0, margin: '0 0 16px' }}>Simple, <span style={{ color: CORAL }}>honest</span> pricing</h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.6 }}>Start free. Upgrade when you need more. No hidden fees, no per-seat tricks.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: cardBg, borderRadius: 999, padding: '8px 16px', border: `1px solid ${cardBorder}` }}>
            <span style={{ fontSize: 14, fontWeight: annual ? 500 : 800, color: annual ? muted : text }}>Monthly</span>
            <button type="button" onClick={() => setAnnual(v => !v)} style={{ width: 46, height: 26, borderRadius: 999, background: annual ? CORAL : (dark ? 'rgba(255,255,255,0.2)' : '#d1d5db'), border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: annual ? 23 : 3, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
            </button>
            <span style={{ fontSize: 14, fontWeight: annual ? 800 : 500, color: annual ? text : muted }}>Annual <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, background: GREEN + '22', color: GREEN, padding: '2px 8px', borderRadius: 999 }}>Save 20%</span></span>
          </div>
        </Reveal>
      </section>

      {/* TIERS */}
      <section style={{ padding: '20px 24px 40px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22, alignItems: 'start' }}>
          {TIERS.map((tier, i) => {
            const isGrowth = tier.id === 'growth'
            const price = annual ? tier.annual : tier.monthly
            return (
              <Reveal key={tier.id} delay={i * 0.06}>
                <div className="pr-card" style={{ borderRadius: 24, padding: '34px 28px', border: isGrowth ? `2px solid ${CORAL}` : `1px solid ${cardBorder}`, background: isGrowth ? (dark ? 'rgba(255,106,77,0.08)' : '#fff7f4') : cardBg, position: 'relative', boxShadow: isGrowth ? `0 24px 60px ${CORAL}30` : '0 10px 30px rgba(15,17,25,0.05)', transform: isGrowth ? 'scale(1.02)' : 'none' }}>
                  {tier.badge && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, fontWeight: 800, background: CORAL, color: '#fff', padding: '5px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>{tier.badge}</div>}
                  <h3 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px', color: text }}>{tier.name}</h3>
                  <div style={{ margin: '14px 0 22px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    {price === 0 ? <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.03em', color: text }}>Free</span> : <><span style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.03em', color: text }}>${price}</span><span style={{ fontSize: 14, color: muted }}>/mo{annual ? ', billed yearly' : ''}</span></>}
                  </div>
                  <button onClick={go} className="pr-btn" style={{ display: 'block', width: '100%', padding: '14px 0', borderRadius: 12, textAlign: 'center', background: isGrowth ? CORAL : 'transparent', color: isGrowth ? '#fff' : text, border: isGrowth ? 'none' : `2px solid ${cardBorder}`, fontWeight: 800, fontSize: 14.5, cursor: 'pointer', marginBottom: 24 }}>{tier.cta}</button>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {tier.features.map((f, j) => (<li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: text }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: (isGrowth ? CORAL : GREEN) + '1a', color: isGrowth ? CORAL : GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{f}</li>))}
                  </ul>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ENTERPRISE */}
      <section style={{ padding: '30px 24px 70px' }}>
        <Reveal>
          <div style={{ maxWidth: 1120, margin: '0 auto', borderRadius: 24, background: `linear-gradient(135deg, ${INK}, #1a1c2e)`, padding: 'clamp(32px, 5vw, 52px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', margin: '0 0 8px' }}>Need something custom?</h2>
              <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Enterprise plans with SSO, custom integrations, SLAs, and dedicated support.</p>
            </div>
            <a href="mailto:bishalstha76@gmail.com" className="pr-btn" style={{ padding: '14px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', flexShrink: 0 }}>Talk to sales →</a>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ padding: '10px 24px 90px', background: bg }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Reveal><h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.02em', color: text, textAlign: 'center', margin: '0 0 36px' }}>Frequently asked questions</h2></Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderRadius: 16, border: `1px solid ${cardBorder}`, background: cardBg, overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '18px 22px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15.5, fontWeight: 700, color: text, textAlign: 'left', gap: 12 }}>
                  {faq.q}
                  <svg style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: CORAL }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {openFaq === i && <div style={{ padding: '0 22px 18px', fontSize: 14.5, color: muted, lineHeight: 1.65 }}>{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', padding: 'clamp(56px, 8vw, 100px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.04, margin: '0 0 14px' }}>Start free today</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>No credit card · set up in 4 minutes · cancel anytime</p>
            <button onClick={go} className="pr-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>{user ? 'Go to dashboard' : 'Get started — it’s free'}</button>
          </Reveal>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
