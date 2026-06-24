'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const PLANS = [
  {
    id: 'startup', name: 'Startup', price: 25, color: '#6b7280',
    features: ['50 active ideas', { label: 'Privacy', addon: true }, { label: 'White Labelling', addon: true }, { label: 'Unlimited Surveys', addon: true }],
  },
  {
    id: 'business', name: 'Business', price: 49, color: '#2563eb',
    features: [{ label: 'Unlimited Ideas', included: true }, { label: 'Privacy', addon: true }, { label: 'White Labelling', addon: true }, { label: 'Unlimited Surveys', addon: true }],
  },
  {
    id: 'growth', name: 'Growth', price: 149, color: 'var(--coral)', highlighted: true,
    features: [{ label: 'Unlimited Ideas', included: true }, { label: 'Privacy', included: true }, { label: 'White Labelling', included: true }, { label: 'Unlimited Surveys', included: true }],
  },
]

const ADDONS = [
  { id: 'surveys', name: 'Unlimited Surveys', price: 25, desc: 'Unlimited Surveys', included: true },
  { id: 'whitelabel', name: 'White Labelling', price: 100, features: ['No \'Powered by\'', 'Email White Labelling'], included: false },
  { id: 'privacy', name: 'Privacy', price: 25, features: ['Private Board', 'Pre-Approve Ideas', 'Invite Only', 'Pre-Approve Users'], included: false },
]

const CURRENCIES = ['USD', 'AUD', 'EUR', 'GBP', 'CAD']

export default function BillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState<string | null>(null)
  const [currentPlan] = useState('trial')
  const [daysLeft] = useState(8)
  const [emailUsed] = useState(8)
  const [emailTotal] = useState(20)

  const TRIAL_INFO = {
    name: '14 Day Trial',
    daysLeft,
    desc: "You're on the 14 Day Trial plan. Your subscription includes the Unlimited Surveys, White Labelling & Privacy Add-ons.",
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== ADMIN_EMAIL) { router.push('/'); return }
      setUser(u)
    })
  }, [router])

  const handleUpgrade = async (planId: string) => {
    if (!user) return
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, tier: planId, billing, email: user.email }),
      })
      const data = await res.json()
      if (data.setup) { alert('Add STRIPE_SECRET_KEY to Vercel env vars to enable payments.'); return }
      if (data.url) window.location.href = data.url
      else alert(data.error || 'Checkout failed')
    } catch (err: any) { alert(err.message) }
    setLoading(null)
  }

  if (!user) return <div className="p-8">Loading...</div>

  const emailPct = (emailUsed / emailTotal) * 100

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Billing</h1>
        <p className="text-sm" style={{ color: 'var(--slate)' }}>An overview of your account.</p>
      </div>

      {/* Current Plan Card */}
      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Your plan</h2>
          <Link href="/admin/upgrade" className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Change plan</Link>
        </div>

        <div className="flex items-start justify-between p-4 rounded-xl mb-4" style={{ background: 'var(--peach)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{TRIAL_INFO.name}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: 'var(--coral)' }}>
                {daysLeft} days remaining
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>{TRIAL_INFO.desc}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Ideas */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Ideas</p>
              <span className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>Unlimited</span>
            </div>
            <p className="text-2xl font-black" style={{ color: 'var(--coral)' }}>∞</p>
          </div>
          {/* Surveys */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Surveys</p>
              <span className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>Unlimited</span>
            </div>
            <p className="text-2xl font-black" style={{ color: 'var(--coral)' }}>∞</p>
          </div>
          {/* Emails */}
          <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Emails</p>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>{Math.round(emailPct)}% used / {emailTotal - emailUsed} remaining</span>
            </div>
            <div className="h-2 rounded-full mb-1" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full" style={{ width: `${emailPct}%`, background: emailPct > 80 ? '#ef4444' : 'var(--coral)' }} />
            </div>
            <div className="flex justify-between text-xs" style={{ color: 'var(--slate)' }}>
              <span>{emailUsed} / {emailTotal}</span>
              <span>Usage resets in 39 days</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>$0.002 / extra email</p>
          </div>
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--slate)' }}>
          You can <Link href="/admin/upgrade" className="underline" style={{ color: 'var(--coral)' }}>upgrade your plan</Link> at any time.
        </p>
      </div>

      {/* Available Plans */}
      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Available plans</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setBilling(billing === 'annual' ? 'monthly' : 'annual')}
              className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer"
              style={{ background: billing === 'annual' ? 'var(--coral)' : '#d1d5db' }}>
              <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: billing === 'annual' ? 'translateX(24px)' : 'translateX(4px)' }} />
            </button>
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Pay annually <span style={{ color: 'var(--coral)' }}>(1 month free)</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {PLANS.map(plan => {
            const price = billing === 'annual' ? Math.round(plan.price * 0.917) : plan.price
            return (
              <div key={plan.id} className="rounded-2xl border p-5 flex flex-col"
                style={{ borderColor: plan.highlighted ? 'var(--coral)' : 'var(--border)', background: plan.highlighted ? 'var(--peach)' : 'white' }}>
                <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black" style={{ color: plan.color }}>${price}</span>
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>per month</span>
                </div>
                <ul className="space-y-2 flex-1 mb-4">
                  {plan.features.map((f: any, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 mt-0.5"
                        style={{ color: typeof f === 'string' ? 'var(--ink)' : f.included ? 'var(--coral)' : '#9ca3af' }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ color: 'var(--ink)' }}>
                        {typeof f === 'string' ? f : f.label}
                        {typeof f !== 'string' && !f.included && <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: '#fef9c3', color: '#ca8a04' }}>Add-on</span>}
                        {typeof f !== 'string' && f.included && <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: '#dcfce7', color: '#16a34a' }}>Included</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleUpgrade(plan.id)} disabled={!!loading}
                  className="w-full py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 transition-all"
                  style={{ background: plan.highlighted ? 'var(--coral)' : 'var(--ink)', color: 'white' }}>
                  {loading === plan.id ? 'Processing...' : 'Upgrade'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Currency */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--slate)' }}>Change currency</span>
          <div className="flex gap-1">
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                style={{ background: currency === c ? 'var(--coral)' : 'var(--border)', color: currency === c ? 'white' : 'var(--slate)' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add-ons */}
      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Power up your plan with these Add-ons</h2>
        <div className="space-y-3">
          {ADDONS.map(addon => (
            <div key={addon.id} className="flex items-start justify-between p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{addon.name}</p>
                  <span className="text-sm font-bold" style={{ color: 'var(--slate)' }}>${addon.price}/mo</span>
                </div>
                {addon.features && (
                  <ul className="space-y-0.5">
                    {addon.features.map(f => (
                      <li key={f} className="text-xs flex items-center gap-1" style={{ color: 'var(--slate)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: addon.included ? '#dcfce7' : 'var(--border)', color: addon.included ? '#16a34a' : 'var(--slate)' }}>
                {addon.included ? 'Included' : 'Add'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Enterprise */}
      <div className="p-5 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
        <p className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Enterprise — Starting from $349 per month</p>
        <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>Dedicated account manager, custom feature development, audit logs, IP address whitelisting, SOC2 compliance, Dedicated hosted instances and more!</p>
        <a href="mailto:support@frill.co" className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Get in contact →</a>
      </div>

      {/* Payment Details */}
      <div className="bg-white rounded-2xl border p-6 mt-6" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Payment details</h2>
        <button className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>+ Add a card</button>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-2xl border p-6 mt-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Billing history</h2>
          <button className="text-sm font-medium cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>Update details</button>
        </div>
        <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>There's nothing to see just yet.</p>
      </div>
    </div>
  )
}
