'use client'

import { useState } from 'react'
import Link from 'next/link'

const plans = [
  {
    name: 'Startup',
    monthly: 25,
    annual: 19,
    description: 'Everything you need to start collecting feedback.',
    highlight: false,
    cta: 'Start free trial',
    features: [
      '1 feedback board',
      'Up to 50 tracked users',
      'Public roadmap',
      'Announcements / changelog',
      'Embeddable widget',
      'Custom domain',
      'Unlimited team members',
      'Email support',
    ],
    missing: [
      'SSO passthrough',
      'Jira & Slack integrations',
      'White-label (remove branding)',
      'Priority support',
    ],
  },
  {
    name: 'Growth',
    monthly: 49,
    annual: 39,
    description: 'For growing teams who need deeper integrations.',
    highlight: true,
    cta: 'Start free trial',
    features: [
      'Unlimited feedback boards',
      'Up to 500 tracked users',
      'Public roadmap',
      'Announcements / changelog',
      'Embeddable widget',
      'Custom domain',
      'Unlimited team members',
      'SSO passthrough',
      'Jira, Slack & Zapier integrations',
      'REST API access',
      'Priority email support',
    ],
    missing: [
      'White-label (remove branding)',
      'Dedicated success manager',
    ],
  },
  {
    name: 'Enterprise',
    monthly: null,
    annual: null,
    description: 'Custom setup for large teams with advanced needs.',
    highlight: false,
    cta: 'Talk to us',
    features: [
      'Everything in Growth',
      'Unlimited tracked users',
      'White-label — remove all branding',
      'Custom email domain',
      'SSO with SAML / OIDC',
      'Dedicated success manager',
      'Custom contract & invoicing',
      'SLA guarantee',
    ],
    missing: [],
  },
]

const faqs = [
  {
    q: 'What counts as a tracked user?',
    a: 'A tracked user is anyone who signs in and interacts with your board — submitting ideas, voting, or commenting. Public visitors who only view the board are not counted.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. Upgrade or downgrade at any time. If you upgrade mid-cycle you\'re only charged the difference for the remaining days.',
  },
  {
    q: 'What happens after my 14-day trial?',
    a: 'Your board stays live but is locked to read-only until you choose a plan. No charges happen without your explicit action — no card is required to start the trial.',
  },
  {
    q: 'Do you offer discounts for startups or non-profits?',
    a: 'Yes. If you\'re an early-stage startup, educational institution, open-source project, or registered charity, reach out and we\'ll sort you out.',
  },
  {
    q: 'Is my data safe?',
    a: 'All data is encrypted at rest and in transit. We\'re GDPR-compliant and never sell your data or your customers\' data to third parties.',
  },
]

export default function Pricing() {
  const [annual, setAnnual] = useState(true)

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>

      {/* Hero */}
      <div className="text-center pt-20 pb-12 px-4" style={{ background: 'var(--peach)' }}>
        <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--coral)' }}>
          Simple, transparent pricing
        </p>
        <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--ink)' }}>
          Pay for what you use
        </h1>
        <p className="text-xl max-w-lg mx-auto mb-8" style={{ color: 'var(--slate)' }}>
          No hidden fees. No per-seat charges. No gotchas. Start with a 14-day free trial on any plan.
        </p>

        {/* Monthly / Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-white rounded-full px-2 py-1 border border-gray-200">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              !annual ? 'text-white shadow' : 'text-gray-500'
            }`}
            style={!annual ? { background: 'var(--coral)' } : {}}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              annual ? 'text-white shadow' : 'text-gray-500'
            }`}
            style={annual ? { background: 'var(--coral)' } : {}}
          >
            Annual
            <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--coral-hover)' }}>
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'text-white shadow-xl scale-105'
                  : 'bg-white border border-gray-100'
              }`}
              style={plan.highlight ? { background: 'var(--coral)' } : {}}
            >
              <div className="mb-6">
                <h2 className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-white' : ''}`} style={!plan.highlight ? { color: 'var(--ink)' } : {}}>
                  {plan.name}
                </h2>
                <p className={`text-sm mb-6 ${plan.highlight ? 'text-white/80' : ''}`} style={!plan.highlight ? { color: 'var(--slate)' } : {}}>
                  {plan.description}
                </p>

                {plan.monthly !== null ? (
                  <div className="flex items-end gap-1">
                    <span className={`text-5xl font-bold ${plan.highlight ? 'text-white' : ''}`} style={!plan.highlight ? { color: 'var(--ink)' } : {}}>
                      ${annual ? plan.annual : plan.monthly}
                    </span>
                    <span className={`text-sm mb-2 ${plan.highlight ? 'text-white/80' : ''}`} style={!plan.highlight ? { color: 'var(--slate)' } : {}}>
                      / month
                    </span>
                  </div>
                ) : (
                  <div className="text-5xl font-bold mb-2" style={{ color: plan.highlight ? 'white' : 'var(--ink)' }}>
                    Custom
                  </div>
                )}
                {plan.monthly !== null && annual && (
                  <p className={`text-xs mt-1 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                    Billed annually · ${(annual ? plan.annual! : plan.monthly!) * 12}/yr
                  </p>
                )}
              </div>

              <Link
                href={plan.name === 'Enterprise' ? 'mailto:hello@yourapp.com' : '/signup'}
                className={`block text-center py-2.5 rounded-xl font-semibold mb-8 transition ${
                  plan.highlight
                    ? 'bg-white hover:bg-gray-50'
                    : 'text-white hover:opacity-90'
                }`}
                style={{
                  color: plan.highlight ? 'var(--coral)' : 'white',
                  background: plan.highlight ? 'white' : 'var(--coral)',
                }}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 font-bold ${plan.highlight ? 'text-white' : ''}`} style={!plan.highlight ? { color: 'var(--coral)' } : {}}>
                      ✓
                    </span>
                    <span className={plan.highlight ? 'text-white' : ''} style={!plan.highlight ? { color: 'var(--ink)' } : {}}>
                      {f}
                    </span>
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm opacity-40">
                    <span className="mt-0.5">✗</span>
                    <span className={plan.highlight ? 'text-white' : ''} style={!plan.highlight ? { color: 'var(--slate)' } : {}}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: 'var(--slate)' }}>
          All plans include a 14-day free trial · No credit card required
        </p>
      </div>

      {/* Feature comparison note */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--peach)' }}>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Not sure which plan?</h3>
          <p className="mb-6" style={{ color: 'var(--slate)' }}>
            Start with Startup. You can upgrade in seconds when you're ready — no data migration, no downtime.
          </p>
          <Link
            href="/features"
            className="text-sm font-semibold"
            style={{ color: 'var(--coral)' }}
          >
            Compare all features →
          </Link>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto px-4 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12" style={{ color: 'var(--ink)' }}>
          Frequently asked
        </h2>
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div key={faq.q} className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>{faq.q}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--slate)' }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
