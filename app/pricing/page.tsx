'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    annual: 0,
    period: 'Free forever',
    badge: null,
    features: [
      'Unlimited ideas board',
      'Public roadmap',
      'Changelog / announcements',
      'Help Center (10 articles)',
      'Widget (all tabs)',
      '3 team members',
      'Guest voting',
      'Community support',
    ],
    cta: 'Get started free',
    ctaHref: '/signup',
  },
  {
    id: 'growth',
    name: 'Growth',
    monthly: 49,
    annual: 39,
    badge: 'Most popular',
    features: [
      'Everything in Starter',
      'Unlimited help articles',
      'Live chat inbox',
      'Contacts & CRM',
      'WooCommerce sync',
      'Review dashboard',
      'Scheduled messages',
      'AI flow automation',
      '10 team members',
      'Priority support',
    ],
    cta: 'Start free trial',
    ctaHref: '/signup',
  },
  {
    id: 'business',
    name: 'Business',
    monthly: 149,
    annual: 119,
    badge: null,
    features: [
      'Everything in Growth',
      'Unlimited team members',
      'White-label branding',
      'Custom domain',
      'SSO / SAML',
      'Advanced analytics',
      'AI writing assistant',
      'Priority phone support',
      'Dedicated onboarding',
      'SLA guarantee',
    ],
    cta: 'Start free trial',
    ctaHref: '/signup',
  },
]

const FAQS = [
  { q: 'Is there a free plan?', a: 'Yes — the Starter plan is free forever with no credit card required. It includes unlimited ideas, a public roadmap, help center, and widget.' },
  { q: 'Can I change plans later?', a: 'Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of your billing cycle.' },
  { q: "What is the 14-day trial?", a: "Growth and Business plans come with a 14-day free trial. No credit card required. Cancel anytime before the trial ends and you won't be charged." },
  { q: "Is my data safe?", a: "Yes. All data is encrypted in transit and at rest. We're hosted on Supabase (PostgreSQL) with daily backups and SOC 2 Type II certified infrastructure." },
  { q: "Do you offer discounts for nonprofits or startups?", a: "Yes — email us at bishalstha76@gmail.com with your details and we'll set you up with a special rate." },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
  }, [])

  const coral = '#ff7a6b'

  return (
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #f0f0f0', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: coral, textDecoration: 'none' }}>Colvy</Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/features" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>Features</Link>
          {user ? (
            <Link href="/admin" style={{ padding: '8px 18px', borderRadius: 10, background: coral, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/signin" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>Sign in</Link>
              <Link href="/signup" style={{ padding: '8px 18px', borderRadius: 10, background: coral, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                Get started free
              </Link>
            </>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 80px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 48, fontWeight: 800, color: '#0d0d0d', margin: '0 0 14px', lineHeight: 1.1 }}>
            Simple, honest pricing
          </h1>
          <p style={{ fontSize: 18, color: '#6b7280', maxWidth: 480, margin: '0 auto 28px' }}>
            Start free. Upgrade when you need more. No hidden fees, no per-seat tricks.
          </p>

          {/* Annual toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#f9f9f9', borderRadius: 12, padding: '8px 16px', border: '1px solid #e5e5e5' }}>
            <span style={{ fontSize: 14, fontWeight: annual ? 500 : 700, color: annual ? '#9ca3af' : '#0d0d0d' }}>Monthly</span>
            <button type="button" onClick={() => setAnnual(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 12, background: annual ? coral : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: annual ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
            <span style={{ fontSize: 14, fontWeight: annual ? 700 : 500, color: annual ? '#0d0d0d' : '#9ca3af' }}>
              Annual
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '2px 8px', borderRadius: 20 }}>Save 20%</span>
            </span>
          </div>
        </div>

        {/* Tiers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 72 }}>
          {TIERS.map((tier, idx) => {
            const isGrowth = tier.id === 'growth'
            const price = annual ? tier.annual : tier.monthly
            return (
              <div key={tier.id} style={{
                borderRadius: 20, padding: '32px 28px',
                border: isGrowth ? `2px solid ${coral}` : '1.5px solid #e5e5e5',
                background: isGrowth ? '#fff9f8' : '#fff',
                position: 'relative', overflow: 'hidden',
                boxShadow: isGrowth ? '0 8px 40px rgba(255,122,107,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                transform: isGrowth ? 'scale(1.02)' : 'scale(1)',
              }}>
                {tier.badge && (
                  <div style={{ position: 'absolute', top: 18, right: 18, fontSize: 11, fontWeight: 700, background: coral, color: '#fff', padding: '3px 12px', borderRadius: 20 }}>
                    {tier.badge}
                  </div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#0d0d0d' }}>{tier.name}</h3>
                <div style={{ margin: '12px 0 20px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  {price === 0 ? (
                    <span style={{ fontSize: 40, fontWeight: 800, color: '#0d0d0d' }}>Free</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 40, fontWeight: 800, color: '#0d0d0d' }}>${price}</span>
                      <span style={{ fontSize: 14, color: '#9ca3af' }}>/mo{annual ? ' billed annually' : ''}</span>
                    </>
                  )}
                </div>
                <Link href={tier.ctaHref}
                  style={{
                    display: 'block', width: '100%', padding: '13px 0', borderRadius: 12, textAlign: 'center',
                    background: isGrowth ? coral : 'transparent',
                    color: isGrowth ? '#fff' : '#0d0d0d',
                    border: isGrowth ? 'none' : '1.5px solid #e5e5e5',
                    fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 24,
                    transition: 'all 0.15s',
                  }}>
                  {tier.cta}
                </Link>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tier.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#374151' }}>
                      <svg style={{ flexShrink: 0, marginTop: 2 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={coral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Enterprise banner */}
        <div style={{ borderRadius: 20, background: 'linear-gradient(135deg, #0d0d0d, #1a1a2e)', padding: '40px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 72 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Need something custom?</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Enterprise plans with SSO, custom integrations, SLAs, and dedicated support.</p>
          </div>
          <a href="mailto:bishalstha76@gmail.com"
            style={{ padding: '13px 28px', borderRadius: 12, background: coral, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', flexShrink: 0 }}>
            Talk to sales →
          </a>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: '#0d0d0d', textAlign: 'center', margin: '0 0 32px' }}>Frequently asked questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderRadius: 12, border: '1.5px solid #e5e5e5', overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#0d0d0d', textAlign: 'left', gap: 12 }}>
                  {faq.q}
                  <svg style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 20px 16px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
