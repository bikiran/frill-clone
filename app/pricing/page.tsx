'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getUserSubscription, TIER_FEATURES } from '@/lib/stripe'
import Link from 'next/link'

export default function PricingPage() {
  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      setUser(u)
      const sub = await getUserSubscription(u.id)
      setSubscription(sub)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!user) return null

  const currentTier = subscription?.tier || 'free'
  const TIERS = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'Forever',
      features: Object.values(TIER_FEATURES.free.features),
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$99',
      period: 'per month',
      features: Object.values(TIER_FEATURES.pro.features),
      highlighted: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: 'contact us',
      features: Object.values(TIER_FEATURES.enterprise.features),
    },
  ]

  return (
    <div style={{ background: 'var(--canvas)' }}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <Link href="/admin" className="text-sm font-medium mb-6 inline-block" style={{ color: 'var(--slate)' }}>
          ← Back to dashboard
        </Link>
        
        <h1 className="text-4xl font-black mb-8" style={{ color: 'var(--ink)' }}>
          Billing & Subscription
        </h1>

        {subscription?.tier && subscription.tier !== 'free' && (
          <div className="mb-8 p-6 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>Current Plan</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>You're on the</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>{TIER_FEATURES[subscription.tier as keyof typeof TIER_FEATURES]?.name || 'Free'} plan</p>
                {subscription.current_period_end && (
                  <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>
                    Renews on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button 
                onClick={() => alert('Cancel subscription feature coming soon')}
                className="px-4 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}
              >
                Cancel Plan
              </button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className="rounded-2xl border p-8 transition-all"
              style={{
                borderColor: tier.id === currentTier ? 'var(--coral)' : tier.highlighted ? 'var(--coral)' : 'var(--border)',
                background: tier.id === currentTier ? 'var(--peach)' : tier.highlighted ? 'var(--peach)' : 'white',
              }}
            >
              {tier.id === currentTier && (
                <div className="text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block" style={{ background: 'var(--coral)', color: 'white' }}>
                  CURRENT PLAN
                </div>
              )}
              {tier.highlighted && tier.id !== currentTier && (
                <div className="text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block" style={{ background: 'var(--coral)', color: 'white' }}>
                  POPULAR
                </div>
              )}
              <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>{tier.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-black" style={{ color: 'var(--coral)' }}>{tier.price}</span>
                <span style={{ color: 'var(--slate)' }}>/{tier.period}</span>
              </div>
              
              {tier.id === currentTier ? (
                <button className="w-full py-2.5 rounded-lg text-sm font-semibold mb-8 cursor-not-allowed opacity-50" style={{ background: 'var(--canvas)' }}>
                  Current Plan
                </button>
              ) : (
                <button 
                  onClick={() => alert(`Upgrade to ${tier.name} feature coming soon`)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold mb-8 text-white cursor-pointer hover:opacity-90"
                  style={{ background: 'var(--coral)' }}
                >
                  {tier.id === 'free' ? 'Downgrade' : 'Upgrade'}
                </button>
              )}

              <ul className="space-y-3">
                {tier.features.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--coral)' }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>Need custom pricing?</h2>
          <p className="mb-4" style={{ color: 'var(--slate)' }}>Contact our sales team for enterprise plans with SSO, custom integrations, and dedicated support.</p>
          <a href="mailto:bishalstha76@gmail.com" className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
            Contact Sales →
          </a>
        </div>
      </div>
    </div>
  )
}
