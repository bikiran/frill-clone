'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const { supabase } = require('@/lib/supabase')
    supabase.auth.getSession().then(({ data }: any) => {
      setUser(data.session?.user)
    })
  }, [])

  const TIERS = [
    {
      name: 'Free',
      price: '$0',
      period: 'Forever',
      features: ['Ideas board', 'Public feedback', '5 team members', 'Basic analytics'],
      cta: user ? 'Get Started' : 'Sign Up Free',
      href: user ? '/admin' : '/signup',
    },
    {
      name: 'Pro',
      price: '$99',
      period: 'per month',
      features: ['Everything in Free', 'White labeling', 'Guest voting control', 'API access', 'Advanced analytics'],
      cta: 'Start Free Trial',
      href: '/pricing',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: 'contact us',
      features: ['Everything in Pro', 'SSO (Google, GitHub, SAML)', 'Priority support', 'Custom integration'],
      cta: 'Contact Sales',
      href: 'mailto:bishalstha76@gmail.com',
    },
  ]

  return (
    <div style={{ background: 'var(--canvas)' }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>FrillClone</div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link href="/admin" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--slate)' }}>
                  Dashboard
                </Link>
                <Link href="/admin" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
                  Go to App
                </Link>
              </>
            ) : (
              <>
                <Link href="/signin" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--slate)' }}>
                  Sign in
                </Link>
                <Link href="/signup" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight" style={{ color: 'var(--ink)' }}>
            Gather feedback.
            <br />
            <span style={{ color: 'var(--coral)' }}>Build better products.</span>
          </h1>
          <p className="text-lg mb-8 leading-relaxed" style={{ color: 'var(--slate)' }}>
            The customer feedback platform your team will actually use. Collect ideas, manage roadmaps, and keep your customers in the loop.
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <Link href={user ? '/admin' : '/signup'} className="px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:shadow-lg transition-all" style={{ background: 'var(--coral)' }}>
              Start Free →
            </Link>
            <Link href="#pricing" className="px-8 py-3.5 rounded-xl text-base font-semibold border cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              View Pricing
            </Link>
          </div>
          <div className="inline-block px-4 py-2 rounded-full text-sm" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
            ✨ Free forever for small teams
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-16" style={{ color: 'var(--ink)' }}>
            Everything you need
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '💡', title: 'Idea Board', desc: 'Collect and organize customer feedback in one place' },
              { icon: '🗺️', title: 'Public Roadmap', desc: 'Share your vision and build trust with your community' },
              { icon: '📢', title: 'Announcements', desc: 'Keep customers updated on new features and improvements' },
              { icon: '🔗', title: 'Polls & Surveys', desc: 'Gather quick feedback with polls and detailed surveys' },
              { icon: '👥', title: 'Team Management', desc: 'Invite team members and control access levels' },
              { icon: '📊', title: 'Analytics', desc: 'Track trends and measure what matters to your users' },
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                <p style={{ color: 'var(--slate)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-16" style={{ color: 'var(--ink)' }}>
            Simple, transparent pricing
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {TIERS.map((tier, i) => (
              <div
                key={i}
                className="rounded-2xl border p-8 transition-all hover:shadow-lg"
                style={{
                  borderColor: tier.highlighted ? 'var(--coral)' : 'var(--border)',
                  background: tier.highlighted ? 'var(--peach)' : 'white',
                  transform: tier.highlighted ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {tier.highlighted && (
                  <div className="text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block" style={{ background: 'var(--coral)', color: 'white' }}>
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>{tier.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-black" style={{ color: 'var(--coral)' }}>{tier.price}</span>
                  <span style={{ color: 'var(--slate)' }}>/{tier.period}</span>
                </div>
                <Link href={tier.href}
                  className="w-full block py-2.5 rounded-lg text-center text-sm font-semibold mb-8 cursor-pointer transition-all"
                  style={{
                    background: tier.highlighted ? 'var(--coral)' : 'var(--canvas)',
                    color: tier.highlighted ? 'white' : 'var(--ink)',
                  }}
                >
                  {tier.cta}
                </Link>
                <ul className="space-y-3">
                  {tier.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--coral)' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center rounded-3xl p-12" style={{ background: 'var(--peach)' }}>
          <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--ink)' }}>
            Ready to collect better feedback?
          </h2>
          <p className="mb-8" style={{ color: 'var(--slate)' }}>
            Join hundreds of companies building with FrillClone. Start free, upgrade when you grow.
          </p>
          <Link href={user ? '/admin' : '/signup'}
            className="inline-block px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:shadow-lg transition-all"
            style={{ background: 'var(--coral)' }}
          >
            Get Started Now →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6 text-center" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
        <p>© 2024 FrillClone. Built for feedback-driven teams.</p>
      </footer>
    </div>
  )
}
