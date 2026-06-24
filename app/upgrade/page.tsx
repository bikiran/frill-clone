'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    annualPrice: 0,
    color: '#6b7280',
    features: ['Up to 5 team members','Unlimited ideas','Public feedback board','Basic roadmap','Announcements','Help Centre','Email support'],
    limits: ['No white labeling','No API access','No SSO'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99,
    annualPrice: 79,
    color: 'var(--coral)',
    highlighted: true,
    features: ['Unlimited team members','White labeling & custom domain','Guest voting control','REST API access','Advanced analytics','Priority support','Webhooks & Slack','Custom fields'],
    limits: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    annualPrice: null,
    color: '#1a1a1a',
    features: ['Everything in Pro','SSO (Google, GitHub, SAML)','Custom integrations','Dedicated support manager','SLA guarantee','On-premise option'],
    limits: [],
  },
]

const FAQS = [
  { q: 'Can I cancel anytime?', a: "Yes. Cancel from Settings → Billing. You'll keep access until the billing period ends." },
  { q: 'What happens to my data if I downgrade?', a: "Your data is safe. Features above your plan limit become read-only but are never deleted." },
  { q: 'Do you offer annual billing?', a: "Yes! Annual billing saves 20%. Toggle above to see annual prices." },
  { q: 'Is there a free trial?', a: "The Free plan is free forever. Pro plans include a 14-day free trial — no credit card required." },
  { q: 'How do I get a receipt?', a: "Receipts are emailed automatically after each payment. You can also download them from Settings → Billing." },
]

export default function UpgradePage() {
  const [user, setUser] = useState<any>(null)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [setupNeeded, setSetupNeeded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
  }, [])

  const handleUpgrade = async (tier: any) => {
    if (tier.id === 'free' || tier.id === currentPlan) return
    if (tier.id === 'enterprise') {
      window.location.href = 'mailto:bishalstha76@gmail.com?subject=Enterprise Plan Inquiry'
      return
    }
    if (!user) {
      window.location.href = '/signin?next=/upgrade'
      return
    }

    setLoading(tier.id)
    setSetupNeeded(false)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, tier: tier.id, billing, email: user.email }),
      })
      const data = await res.json()

      if (data.setup) {
        setSetupNeeded(true)
        setLoading(null)
        return
      }
      if (data.error) throw new Error(data.error)
      if (data.url) window.location.href = data.url
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
    setLoading(null)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm mb-6 hover:opacity-70" style={{ color: 'var(--slate)' }}>
            ← Back to Admin
          </Link>
          <h1 className="text-4xl font-black mb-3" style={{ color: 'var(--ink)' }}>Simple, transparent pricing</h1>
          <p className="text-lg mb-6" style={{ color: 'var(--slate)' }}>Start free. Upgrade when you grow.</p>

          {/* Stripe setup notice */}
          {setupNeeded && (
            <div className="max-w-2xl mx-auto mb-6 p-4 rounded-xl border text-sm text-left" style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
              <p className="font-bold mb-1">⚙️ Stripe Not Configured Yet</p>
              <p>To enable payments, add these to your Vercel environment variables:</p>
              <pre className="mt-2 text-xs p-3 rounded-lg overflow-x-auto" style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
{`STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...`}
              </pre>
              <p className="mt-2">Create products and prices at <a href="https://dashboard.stripe.com/products" target="_blank" className="underline font-semibold">dashboard.stripe.com</a></p>
            </div>
          )}

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--border)' }}>
            <button onClick={() => setBilling('monthly')}
              className="px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
              style={{ background: billing === 'monthly' ? 'white' : 'transparent', color: billing === 'monthly' ? 'var(--ink)' : 'var(--slate)' }}>
              Monthly
            </button>
            <button onClick={() => setBilling('annual')}
              className="px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all flex items-center gap-2"
              style={{ background: billing === 'annual' ? 'white' : 'transparent', color: billing === 'annual' ? 'var(--ink)' : 'var(--slate)' }}>
              Annual
              <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#dcfce7', color: '#16a34a' }}>Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {TIERS.map(tier => {
            const p = billing === 'annual' ? tier.annualPrice : tier.price
            const isCurrent = tier.id === currentPlan
            const isLoading = loading === tier.id
            return (
              <div key={tier.id} className="rounded-2xl border p-8 flex flex-col relative transition-all hover:shadow-lg"
                style={{
                  borderColor: tier.highlighted ? 'var(--coral)' : 'var(--border)',
                  background: tier.highlighted ? 'var(--peach)' : 'white',
                  transform: tier.highlighted ? 'scale(1.03)' : 'scale(1)',
                }}>
                {tier.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-md" style={{ background: 'var(--coral)' }}>
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-black mb-3" style={{ color: 'var(--ink)' }}>{tier.name}</h2>
                  {p !== null ? (
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black" style={{ color: tier.color }}>${p}</span>
                      <span className="text-sm mb-1.5" style={{ color: 'var(--slate)' }}>
                        /{billing === 'annual' ? 'mo · billed annually' : 'month'}
                      </span>
                    </div>
                  ) : p === 0 ? (
                    <div className="text-4xl font-black" style={{ color: tier.color }}>Free</div>
                  ) : (
                    <div className="text-2xl font-black" style={{ color: tier.color }}>Custom pricing</div>
                  )}
                  {billing === 'annual' && tier.price && tier.annualPrice && (
                    <p className="text-xs mt-1" style={{ color: '#16a34a' }}>
                      Save ${(tier.price - tier.annualPrice) * 12}/year
                    </p>
                  )}
                </div>

                <button onClick={() => handleUpgrade(tier)} disabled={isCurrent || isLoading}
                  className="w-full py-3 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-70 mb-6 transition-all active:scale-95"
                  style={{
                    background: isCurrent ? 'var(--border)' : tier.highlighted ? 'var(--coral)' : tier.id === 'enterprise' ? 'var(--ink)' : 'var(--canvas)',
                    color: isCurrent ? 'var(--slate)' : tier.id === 'free' ? 'var(--ink)' : 'white',
                    border: tier.id === 'free' ? '1px solid var(--border)' : 'none',
                  }}>
                  {isCurrent ? '✓ Current Plan' : isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Processing...
                    </span>
                  ) : tier.id === 'enterprise' ? 'Contact Sales' : tier.id === 'free' ? 'Current Plan' : `Get ${tier.name}`}
                </button>

                <ul className="space-y-2.5 flex-1">
                  {tier.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 mt-0.5" style={{ color: 'var(--coral)' }}><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                  {tier.limits.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: '#9ca3af' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5" style={{ color: '#d1d5db' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-8 mb-16 text-sm" style={{ color: 'var(--slate)' }}>
          {['🔒 SSL encrypted', '🏦 Stripe payments', '↩️ 14-day refund', '🌍 Trusted by 2000+ teams'].map(b => (
            <span key={b}>{b}</span>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--ink)' }}>Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-all">
                  <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{faq.q}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'var(--slate)', transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--slate)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
