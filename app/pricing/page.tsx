'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import { track } from '@/lib/analytics'
import MarketingFooter from '@/components/MarketingFooter'

const CORAL = '#ff6a4d'
const PINK = '#ff4d8d'
const PURPLE = '#7c5cff'
const GREEN = '#00c48c'
const BLUE = '#2b59ff'
const INK = '#0f1119'

// Modular, product-based pricing. Customers pick the product they actually use:
// the Feedback suite (ideas / roadmap / announcements / polls / surveys / help
// center) is deliberately cheap; the Inbox product (live chat / CRM / voice
// calls / SMS) carries the messaging costs and is priced higher — still well
// under call-first competitors like Coax ($349 AUD/mo entry). Everything bundles
// both. `smsNote` marks the plans whose SMS line references the fair-use footnote.
const TIERS = [
  { id: 'free', name: 'Free', tagline: 'Try the feedback suite', accent: '#6b7280', monthly: 0, annual: 0, badge: null, cta: 'Get started free', smsNote: false, features: ['Ideas & feedback board', 'Public roadmap', 'Announcements / changelog', '1 poll & 1 survey', 'Help center (10 articles)', 'Feedback widget', '2 team members', 'Community support'] },
  { id: 'feedback', name: 'Feedback', tagline: 'For product & feedback teams', accent: PURPLE, monthly: 39, annual: 29, badge: null, cta: 'Start free trial', smsNote: false, features: ['Everything in Free', 'Unlimited ideas & voting', 'Unlimited polls, surveys & forms', 'Private + public roadmaps', 'Unlimited help center articles', 'Customisable widget', 'Remove Colvy branding', '5 team members', 'Email support'] },
  { id: 'omnichannel', name: 'Inbox', tagline: 'For sales & support teams', accent: BLUE, monthly: 179, annual: 149, badge: null, cta: 'Start free trial', smsNote: true, features: ['Live chat inbox', 'Contacts & CRM', 'WhatsApp, SMS & voice calls', '3,000 SMS / month included*', 'WooCommerce sync', 'Broadcast & scheduled campaigns', 'AI flow automation', 'Review dashboard', '10 team members', 'Priority support'] },
  { id: 'everything', name: 'Everything', tagline: 'The full Colvy platform', accent: CORAL, monthly: 259, annual: 209, badge: 'Best value', cta: 'Start free trial', smsNote: true, features: ['Feedback suite + Inbox', '3,000 SMS / month included*', 'White-label branding', 'Custom domain', 'Advanced analytics', 'AI writing assistant', 'Unlimited team members', 'Priority support'] },
]

const FAQS = [
  { q: 'How does the pricing work?', a: 'Pick the product you actually use. The Feedback plan covers ideas, roadmaps, announcements, polls, surveys and your help center. Inbox covers live chat, CRM, SMS and voice calls. Everything bundles both. For white-label, SSO/SAML, SLAs and custom contracts, talk to sales. Start on Free and upgrade whenever you need more.' },
  { q: 'Is there a free plan?', a: 'Yes — the Free plan is free forever with no credit card required. It includes an ideas board, a public roadmap, announcements, a help center and the feedback widget.' },
  { q: 'How is SMS and calling billed?', a: 'The Inbox and Everything plans include 3,000 SMS per month. Beyond that, usage is metered and varies by volume — most Australian SMBs can expect roughly 5c per standard SMS. SMS marketing campaigns and international messaging are billed separately. See the note below the plans for details.' },
  { q: 'Can I change plans later?', a: 'Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of your billing cycle.' },
  { q: 'What is the 14-day trial?', a: 'Every paid plan comes with a 14-day free trial. No credit card required. Cancel anytime before the trial ends and you won’t be charged.' },
  { q: 'Is my data safe?', a: 'Yes. All data is encrypted in transit and at rest. We’re hosted on Supabase (PostgreSQL) with daily backups and SOC 2 Type II certified infrastructure.' },
  { q: 'Do you offer discounts for nonprofits or startups?', a: 'Yes — email us at support@colvy.com with your details and we’ll set you up with a special rate.' },
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
    track('pricing_viewed')
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // A pricing CTA. `tier` is omitted for the generic nav / footer buttons.
  //  • Logged out → /signup, carrying the chosen plan + billing period so the
  //    account they create knows what they came for.
  //  • Logged in, paid tier → their board's upgrade/checkout page.
  //  • Logged in, free / generic → their board dashboard.
  // boardUrl() handles the reserved-slug case (the super-admin's "admin" workspace)
  // so a logged-in owner never lands on admin.colvy.com/admin (a 404).
  const go = async (tier?: typeof TIERS[number]) => {
    const billing = annual ? 'annual' : 'monthly'
    const paid = !!tier && tier.monthly > 0
    if (paid) track('checkout_started', { tier: tier!.id, billing })

    if (!user) {
      window.location.href = tier ? `/signup?plan=${tier.id}&billing=${billing}` : '/signup'
      return
    }
    // Paid → the board's upgrade page (checkout runs on the tenant origin where the
    // session lives), carrying the chosen plan + billing so it's preselected.
    const path = paid ? `/upgrade?plan=${tier!.id}&billing=${billing}` : '/admin'
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = path; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, path); return }
      await redirectToUserAdmin(user.id, path)
    } catch { await redirectToUserAdmin(user.id, path) }
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
            <button onClick={() => go()} className="pr-btn" style={{ padding: '10px 22px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 14.5, border: 'none', cursor: 'pointer' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        </div>
      </nav>

      {/* HEADER */}
      <section style={{ position: 'relative', padding: '150px 24px 40px', textAlign: 'center', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 70%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 80%)' }}>
        <Reveal>
          <h1 style={{ fontSize: 'clamp(42px, 6vw, 78px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.0, margin: '0 0 16px' }}>Simple, <span style={{ color: CORAL }}>honest</span> pricing</h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.6 }}>Start free. Upgrade as your business grows. Software is predictable; communication usage is billed separately.</p>
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
      <section style={{ padding: '20px 24px 24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))', gap: 20, alignItems: 'start' }}>
          {TIERS.map((tier, i) => {
            const hi = !!tier.badge
            const price = annual ? tier.annual : tier.monthly
            const accent = tier.accent
            return (
              <Reveal key={tier.id} delay={i * 0.06}>
                <div className="pr-card" style={{ borderRadius: 24, padding: '30px 24px', border: hi ? `2px solid ${accent}` : `1px solid ${cardBorder}`, background: hi ? (dark ? 'rgba(255,106,77,0.08)' : '#fff7f4') : cardBg, position: 'relative', boxShadow: hi ? `0 24px 60px ${accent}30` : '0 10px 30px rgba(15,17,25,0.05)', transform: hi ? 'scale(1.02)' : 'none' }}>
                  {tier.badge && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, fontWeight: 800, background: accent, color: '#fff', padding: '5px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>{tier.badge}</div>}
                  <h3 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 3px', color: text }}>{tier.name}</h3>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: accent, margin: 0, minHeight: 18 }}>{tier.tagline}</p>
                  <div style={{ margin: '14px 0 20px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    {price === 0 ? <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', color: text }}>Free</span> : <><span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', color: text }}>${price}</span><span style={{ fontSize: 13.5, color: muted }}>/mo{annual ? ', billed yearly' : ''}</span></>}
                  </div>
                  <button onClick={() => go(tier)} className="pr-btn" style={{ display: 'block', width: '100%', padding: '13px 0', borderRadius: 12, textAlign: 'center', background: hi ? accent : 'transparent', color: hi ? '#fff' : text, border: hi ? 'none' : `2px solid ${cardBorder}`, fontWeight: 800, fontSize: 14.5, cursor: 'pointer', marginBottom: 22 }}>{tier.cta}</button>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tier.features.map((f, j) => (<li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: text }}><span style={{ width: 19, height: 19, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{f}</li>))}
                  </ul>
                </div>
              </Reveal>
            )
          })}
        </div>

        {/* Fair-use footnote */}
        <Reveal>
          <p style={{ maxWidth: 900, margin: '26px auto 0', fontSize: 12.5, lineHeight: 1.65, color: muted, textAlign: 'center' }}>
            *SMS fair use policy applies. The base package includes up to 3,000 SMS per month. Usage charges apply beyond this allowance and vary based on volume — most Australian 🇦🇺 SMBs can expect approximately 5c per standard SMS. SMS marketing campaigns and international messaging are billed separately. Voice call minutes are metered — <a href="mailto:support@colvy.com" style={{ color: CORAL, textDecoration: 'none', fontWeight: 600 }}>contact us</a> for high-volume call rates.
          </p>
        </Reveal>
      </section>

      {/* ENTERPRISE — quiet "contact sales" strip */}
      <section style={{ padding: '20px 24px 70px' }}>
        <Reveal>
          <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 18, background: cardBg, border: `1px solid ${cardBorder}`, padding: 'clamp(24px, 3vw, 34px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.01em', color: text, margin: 0 }}>Enterprise</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, color: muted, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '2px 10px' }}>Contact sales</span>
                </div>
                <p style={{ fontSize: 14, color: muted, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.55 }}>For teams that need compliance, control and scale beyond the plans above.</p>
              </div>
              <a href="mailto:support@colvy.com?subject=Colvy%20Enterprise%20enquiry" className="pr-btn" style={{ padding: '11px 24px', borderRadius: 999, background: 'transparent', color: text, fontWeight: 800, fontSize: 14, textDecoration: 'none', border: `1.5px solid ${cardBorder}`, flexShrink: 0 }}>Contact sales →</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['White-label branding', 'SSO / SAML', 'SLA guarantee', 'Dedicated onboarding', 'Dedicated support', 'Custom contracts', 'High-volume usage & rates'].map(f => (
                <span key={f} style={{ fontSize: 12.5, fontWeight: 600, color: muted, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.03)', border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '5px 12px' }}>{f}</span>
              ))}
            </div>
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
            <button onClick={() => go()} className="pr-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>{user ? 'Go to dashboard' : 'Get started — it’s free'}</button>
          </Reveal>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
