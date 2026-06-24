'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      setUser(data?.session?.user)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e: any, session: any) => {
      setUser(session?.user ?? null)
    })
    return () => listener?.subscription?.unsubscribe()
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
      href: '/signup',
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
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>Colvy</div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: 'var(--slate)' }}>
            <a href="#features" className="hover:opacity-70 cursor-pointer">Features</a>
            <a href="#integrations" className="hover:opacity-70 cursor-pointer">Integrations</a>
            <a href="#pricing" className="hover:opacity-70 cursor-pointer">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
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
                  Log In
                </Link>
                <Link href="/signup" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
                  Start for free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-block px-4 py-2 rounded-full text-sm font-medium mb-6" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
            ✨ Now with AI-powered insights
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight" style={{ color: 'var(--ink)' }}>
            A better way to collect
            <br />customer feedback
          </h1>
          <p className="text-lg mb-10 leading-relaxed" style={{ color: 'var(--slate)' }}>
            Capture, organize, and announce product feedback in one place. Build products your customers actually want.
          </p>
          <div className="flex gap-4 justify-center mb-8">
            <Link href={user ? '/admin' : '/signup'} className="px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:opacity-90 transition-all" style={{ background: 'var(--coral)' }}>
              Start for free →
            </Link>
            <a href="#features" className="px-8 py-3.5 rounded-xl text-base font-semibold border cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              See how it works
            </a>
          </div>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>Trusted by 2,000+ product teams worldwide</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6" style={{ background: 'white' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-6" style={{ color: 'var(--ink)' }}>
            Built for teams that want to ship
            <br />better products, faster.
          </h2>
          <p className="text-center mb-16" style={{ color: 'var(--slate)' }}>Everything you need to understand and prioritize customer feedback.</p>
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              { icon: '⚡', title: 'Inline Admin', desc: 'Manage your entire board from within the same view' },
              { icon: '🔐', title: 'SSO Authentication', desc: 'Integrate directly with your platform for a seamless user experience' },
              { icon: '🧩', title: 'Unlimited Widgets', desc: 'Create as many widgets as you like on all plans.' },
              { icon: '🌍', title: 'Full Translations', desc: 'Every word is translatable into your own language' },
              { icon: '🎨', title: 'Themes', desc: 'Update Colvy with your own brand colours.' },
              { icon: '📧', title: 'Automatic Status Updates', desc: 'Keep customers updated with automated emails.' },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold mb-2" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Capture Ideas */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--ink)' }}>Capture Ideas</h3>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Customer feedback is the lifeblood of your product. Capture ideas from your customers and let the most voted and commented on ideas surface to the top.</p>
              <div className="space-y-3">
                {[{ votes: 42, label: 'Dark mode support' }, { votes: 30, label: 'Mobile app' }, { votes: 18, label: 'API documentation' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-white" style={{ borderColor: 'var(--border)' }}>
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--coral)' }}>{item.votes}</span>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
              <div className="grid grid-cols-3 gap-3">
                {['Under Review', 'Planned', 'In Progress'].map((col, i) => (
                  <div key={i}>
                    <p className="text-xs font-bold mb-2" style={{ color: 'var(--slate)' }}>{col}</p>
                    <div className="space-y-2">
                      {[3, 2, 1].slice(0, 3 - i).map((_, j) => (
                        <div key={j} className="h-10 rounded-lg" style={{ background: 'var(--peach)' }}></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Roadmap */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
            <div className="rounded-2xl border p-6 order-2 md:order-1" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
              <div className="grid grid-cols-3 gap-3">
                {['Now', 'Next', 'Later'].map((col, i) => (
                  <div key={i} className="p-3 rounded-xl text-center" style={{ background: i === 0 ? 'var(--peach)' : 'white', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-bold mb-3" style={{ color: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{col}</p>
                    {[...Array(3 - i)].map((_, j) => (
                      <div key={j} className="h-6 rounded mb-1" style={{ background: 'var(--border)' }}></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 md:order-2">
              <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--ink)' }}>Build a public roadmap</h3>
              <p style={{ color: 'var(--slate)' }}>Turn customer ideas into a stunning product roadmap and let users know what's up next.</p>
            </div>
          </div>

          {/* Announcements */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--ink)' }}>Announce new features</h3>
              <p style={{ color: 'var(--slate)' }}>Keep your customers informed as you ship new features. Our changelog keeps everyone in the loop.</p>
            </div>
            <div className="rounded-2xl border p-6 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
              {[{ date: 'Mar 5', title: 'AI-powered insights' }, { date: 'Feb 28', title: 'New widget themes' }, { date: 'Feb 20', title: 'Jira integration v2' }].map((item, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-white rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-bold w-12" style={{ color: 'var(--coral)' }}>{item.date}</span>
                  <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{item.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="py-20 px-6" style={{ background: 'var(--canvas)' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-4" style={{ color: 'var(--ink)' }}>Integrations</h2>
          <p className="text-center mb-12" style={{ color: 'var(--slate)' }}>Connect Colvy to the tools that you already use.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Slack', icon: 'S', desc: 'Message Slack when new Ideas are created.' },
              { name: 'Jira', icon: 'J', desc: 'Send new Ideas straight to Jira.' },
              { name: 'Trello', icon: 'T', desc: 'Send new Ideas straight to Trello.' },
              { name: 'Zendesk', icon: 'Z', desc: 'Create & manage Ideas inside of Zendesk.' },
              { name: 'Intercom', icon: 'I', desc: 'Create & manage Ideas inside of Intercom.' },
              { name: 'Help Scout', icon: 'H', desc: 'Create & manage Ideas inside of Help Scout.' },
              { name: 'Zapier', icon: 'Z', desc: 'Automate your workflows with Zapier.' },
              { name: 'Linear', icon: 'L', desc: 'Send new Ideas straight to Linear.' },
            ].map((intg, i) => (
              <div key={i} className="p-5 bg-white rounded-2xl border text-center hover:shadow-md transition-all cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-3 text-sm" style={{ background: 'var(--coral)' }}>
                  {intg.icon}
                </div>
                <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>{intg.name}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{intg.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6" style={{ background: 'white' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-4" style={{ color: 'var(--ink)' }}>Simple, transparent pricing</h2>
          <p className="text-center mb-16" style={{ color: 'var(--slate)' }}>Start free. Upgrade when you grow.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {TIERS.map((tier, i) => (
              <div key={i} className="rounded-2xl border p-8 transition-all hover:shadow-lg" style={{
                borderColor: tier.highlighted ? 'var(--coral)' : 'var(--border)',
                background: tier.highlighted ? 'var(--peach)' : 'white',
                transform: tier.highlighted ? 'scale(1.03)' : 'scale(1)',
              }}>
                {tier.highlighted && (
                  <div className="text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block" style={{ background: 'var(--coral)', color: 'white' }}>
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>{tier.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-black" style={{ color: 'var(--coral)' }}>{tier.price}</span>
                  <span className="ml-1" style={{ color: 'var(--slate)' }}>/{tier.period}</span>
                </div>
                <Link href={tier.href} className="w-full block py-2.5 rounded-lg text-center text-sm font-semibold mb-8 cursor-pointer transition-all"
                  style={{ background: tier.highlighted ? 'var(--coral)' : 'var(--canvas)', color: tier.highlighted ? 'white' : 'var(--ink)' }}>
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
            Colvy for startups, charities and entrepreneurs.
          </h2>
          <p className="mb-8" style={{ color: 'var(--slate)' }}>
            Are you part of an early stage startup, educational facility, charity or open source project?
          </p>
          <Link href={user ? '/admin' : '/signup'}
            className="inline-block px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:opacity-90"
            style={{ background: 'var(--coral)' }}>
            Get started for free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-5 gap-8 mb-8">
          <div className="md:col-span-1">
            <p className="text-xl font-bold mb-3" style={{ color: 'var(--coral)' }}>Colvy</p>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>A better way to collect customer feedback.</p>
          </div>
          {[
            { title: 'Product', links: ['Features', 'Integrations', 'Pricing', 'Changelog', 'Roadmap'] },
            { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
            { title: 'Resources', links: ['Documentation', 'Help Center', 'API', 'Status'] },
            { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
          ].map((col, i) => (
            <div key={i}>
              <p className="font-bold text-sm mb-3" style={{ color: 'var(--ink)' }}>{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((link, j) => (
                  <li key={j}><a href="#" className="text-sm hover:underline" style={{ color: 'var(--slate)' }}>{link}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t pt-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
          © 2026 Colvy. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
