'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Currency rates relative to USD
const CURRENCY_RATES: Record<string, { rate: number; symbol: string; label: string }> = {
  USD: { rate: 1,      symbol: '$',  label: 'USD – US Dollar' },
  AUD: { rate: 1.55,   symbol: 'A$', label: 'AUD – Australian Dollar' },
  EUR: { rate: 0.92,   symbol: '€',  label: 'EUR – Euro' },
  GBP: { rate: 0.79,   symbol: '£',  label: 'GBP – British Pound' },
  CAD: { rate: 1.36,   symbol: 'C$', label: 'CAD – Canadian Dollar' },
  NZD: { rate: 1.63,   symbol: 'NZ$',label: 'NZD – New Zealand Dollar' },
  SGD: { rate: 1.34,   symbol: 'S$', label: 'SGD – Singapore Dollar' },
  JPY: { rate: 157,    symbol: '¥',  label: 'JPY – Japanese Yen' },
  INR: { rate: 83.5,   symbol: '₹',  label: 'INR – Indian Rupee' },
}

const PLANS = [
  {
    id: 'startup', name: 'Startup', usdMonthly: 25, usdAnnual: 240, color: '#6b7280',
    desc: 'For small teams getting started',
    features: ['50 active ideas', 'Public roadmap', 'Announcements', 'Help centre', '1 team member'],
  },
  {
    id: 'business', name: 'Business', usdMonthly: 49, usdAnnual: 470, color: '#2563eb',
    desc: 'For growing product teams',
    features: ['Unlimited ideas', 'All Startup features', '5 team members', 'Priority support', 'Basic analytics'],
  },
  {
    id: 'growth', name: 'Growth', usdMonthly: 149, usdAnnual: 1430, color: 'var(--coral)', highlighted: true,
    desc: 'For serious product teams',
    features: ['Unlimited ideas', 'White labeling', 'Custom domains', 'Unlimited team', 'Advanced analytics', 'API access', 'Priority support'],
  },
]

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)

const CreditCardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
)

export default function BillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [billingHistory, setBillingHistory] = useState<any[]>([])
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)

      // Load company — slug-first for reliability
      let co: any = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const slug = h.replace('.colvy.com', '')
          const { data: coBySlug } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
          co = coBySlug
          if (co && !co.owner_id) {
            await (supabase as any).from('companies').update({ owner_id: u.id }).eq('id', co.id)
            co = { ...co, owner_id: u.id }
          }
        }
      }
      if (!co) {
        const { data: coByOwner } = await (supabase as any).from('companies').select('*').eq('owner_id', u.id).maybeSingle()
        co = coByOwner
      }
      setCompany(co)

      // Load subscription
      const { data: sub } = await (supabase as any).from('subscriptions').select('*').eq('user_id', u.id).maybeSingle()
      setSubscription(sub)

      // Load billing history from Stripe via API
      if (sub?.stripe_customer_id) {
        try {
          const res = await fetch(`/api/stripe/billing-history?customerId=${sub.stripe_customer_id}`)
          const data = await res.json()
          setBillingHistory(data.invoices || [])
        } catch {}
      }

      // Detect currency from timezone
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (tz.includes('Australia')) setCurrency('AUD')
        else if (tz.includes('Europe')) setCurrency('EUR')
        else if (tz.includes('London')) setCurrency('GBP')
        else if (tz.includes('Asia/Tokyo')) setCurrency('JPY')
        else if (tz.includes('Asia/Kolkata')) setCurrency('INR')
        else if (tz.includes('Asia/Singapore')) setCurrency('SGD')
        else if (tz.includes('Pacific/Auckland')) setCurrency('NZD')
        else if (tz.includes('Canada') || tz.includes('America/Toronto') || tz.includes('America/Vancouver')) setCurrency('CAD')
      } catch {}

      setPageLoading(false)
    })
  }, [router])

  const cur = CURRENCY_RATES[currency] || CURRENCY_RATES.USD

  const formatPrice = (usd: number) => {
    const converted = Math.round(usd * cur.rate)
    if (currency === 'JPY') return `${cur.symbol}${converted.toLocaleString()}`
    return `${cur.symbol}${converted}`
  }

  const handleUpgrade = async (planId: string) => {
    if (!user) return
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, tier: planId, billing, email: user.email, currency }),
      })
      const data = await res.json()
      if (data.setup) {
        alert('Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to your Vercel environment variables.')
        return
      }
      if (data.url) window.location.href = data.url
      else alert(data.error || 'Checkout failed')
    } catch (err: any) { alert(err.message) }
    setLoading(null)
  }

  const handleManageBilling = async () => {
    if (!subscription?.stripe_customer_id) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription.stripe_customer_id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err: any) { alert(err.message) }
    setPortalLoading(false)
  }

  if (pageLoading) return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  const currentPlanId = subscription?.tier || company?.plan || 'free'
  const isOnPlan = (id: string) => currentPlanId === id
  const isPaid = ['startup', 'business', 'growth', 'pro', 'enterprise'].includes(currentPlanId)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Billing</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            Current plan: <span className="font-semibold capitalize" style={{ color: 'var(--coral)' }}>{currentPlanId}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency selector */}
          <div className="relative">
            <button onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              {cur.symbol} {currency}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showCurrencyMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCurrencyMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border z-20 py-1 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  {Object.entries(CURRENCY_RATES).map(([code, info]) => (
                    <button key={code} onClick={() => { setCurrency(code); setShowCurrencyMenu(false) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 text-left"
                      style={{ background: currency === code ? 'var(--peach)' : 'white', color: currency === code ? 'var(--coral)' : 'var(--ink)', fontWeight: currency === code ? 600 : 400 }}>
                      <span className="font-mono w-6">{info.symbol}</span>
                      <span>{code}</span>
                      <span className="text-xs ml-auto" style={{ color: 'var(--slate)' }}>{info.label.split(' – ')[1]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Manage billing portal */}
          {isPaid && subscription?.stripe_customer_id && (
            <button onClick={handleManageBilling} disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              <CreditCardIcon />
              {portalLoading ? 'Loading...' : 'Manage Billing'}
            </button>
          )}
        </div>
      </div>

      {/* Trial / Current plan banner */}
      {(isPaid || currentPlanId === 'free' || currentPlanId === 'trial') && (
        <div className="mb-8 p-5 rounded-2xl border" style={{ background: 'var(--peach)', borderColor: 'var(--coral)30' }}>
          {currentPlanId === 'trial' || currentPlanId === 'free' ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold" style={{ color: 'var(--coral)' }}>
                    14 Day Free Trial
                    {company?.created_at && (() => {
                      const daysUsed = Math.floor((Date.now() - new Date(company.created_at).getTime()) / 86400000)
                      const daysLeft = Math.max(0, 14 - daysUsed)
                      return daysLeft > 0 ? ` — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining` : ' — Trial ended'
                    })()}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                    Your trial includes Unlimited Surveys, White Labelling & Privacy Add-ons.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--coral)', color: '#fff' }}>Trial</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--coral)20' }}>
                {[
                  { label: 'Ideas', value: '∞', sub: 'Unlimited' },
                  { label: 'Surveys', value: '∞', sub: 'Unlimited' },
                  { label: 'Polls', value: '∞', sub: 'Poll unlimited' },
                  { label: 'Help Articles', value: '∞', sub: 'Unlimited' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-black" style={{ color: 'var(--coral)' }}>{s.value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>{s.label}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>{s.sub}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold" style={{ color: 'var(--coral)' }}>
                  ✓ You&apos;re on the <span className="capitalize">{currentPlanId}</span> plan
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                  {subscription?.status === 'active' ? 'Your subscription is active.' : 'Manage your subscription below.'}
                  {subscription?.current_period_end && ` Renews ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}.`}
                </p>
              </div>
              <button onClick={handleManageBilling} disabled={portalLoading || !subscription?.stripe_customer_id}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {portalLoading ? 'Loading...' : 'Manage →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className="text-sm font-medium" style={{ color: billing === 'monthly' ? 'var(--ink)' : 'var(--slate)' }}>Monthly</span>
        <button onClick={() => setBilling(billing === 'monthly' ? 'annual' : 'monthly')}
          className="relative inline-flex h-6 w-12 items-center rounded-full cursor-pointer transition-all"
          style={{ background: billing === 'annual' ? 'var(--coral)' : '#d1d5db' }}>
          <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            style={{ transform: billing === 'annual' ? 'translateX(28px)' : 'translateX(4px)' }} />
        </button>
        <span className="text-sm font-medium" style={{ color: billing === 'annual' ? 'var(--ink)' : 'var(--slate)' }}>
          Annual
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: '#dcfce7', color: '#16a34a' }}>Save 20%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-5 mb-10">
        {PLANS.map(plan => {
          const price = billing === 'monthly' ? plan.usdMonthly : Math.round(plan.usdAnnual / 12)
          const active = isOnPlan(plan.id)
          return (
            <div key={plan.id} className="rounded-2xl border overflow-hidden"
              style={{ borderColor: (plan as any).highlighted ? 'var(--coral)' : active ? plan.color : 'var(--border)', boxShadow: (plan as any).highlighted ? '0 0 0 2px var(--coral)20' : 'none' }}>
              {(plan as any).highlighted && (
                <div className="py-1.5 text-center text-xs font-bold text-white" style={{ background: 'var(--coral)' }}>
                  MOST POPULAR
                </div>
              )}
              <div className="p-6 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{plan.name}</h3>
                  {active && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>Current</span>}
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>{plan.desc}</p>
                <div className="mb-1">
                  <span className="text-4xl font-black" style={{ color: 'var(--ink)' }}>{formatPrice(price)}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--slate)' }}>/{currency}/mo</span>
                </div>
                {billing === 'annual' && (
                  <p className="text-xs mb-4" style={{ color: '#16a34a' }}>
                    {formatPrice(plan.usdAnnual * cur.rate > 99 ? plan.usdAnnual : plan.usdAnnual)} billed annually
                  </p>
                )}
                <div className="space-y-2.5 mb-6 mt-4">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                      <span style={{ color: plan.color, flexShrink: 0 }}><CheckIcon /></span>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => handleUpgrade(plan.id)} disabled={active || loading === plan.id}
                  className="w-full py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60 transition-all hover:opacity-90"
                  style={{ background: active ? '#f3f4f6' : (plan as any).highlighted ? 'var(--coral)' : plan.color, color: active ? 'var(--slate)' : '#fff' }}>
                  {loading === plan.id ? 'Redirecting...' : active ? 'Current Plan' : 'Upgrade →'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Remove Branding Add-on */}
      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Remove "Powered by Colvy" branding</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#ca8a04' }}>Add-on</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              Available on any plan. Hide the Colvy footer from your public board.
            </p>
          </div>
          <div className="text-right shrink-0 ml-6">
            <div className="text-xl font-black mb-1" style={{ color: 'var(--ink)' }}>
              {formatPrice(5)}<span className="text-sm font-normal" style={{ color: 'var(--slate)' }}>/mo</span>
            </div>
            <button
              onClick={() => handleUpgrade('branding_removal')}
              disabled={company?.remove_branding || loading === 'branding_removal'}
              className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60 transition-all hover:opacity-90"
              style={{ background: company?.remove_branding ? '#f3f4f6' : 'var(--coral)', color: company?.remove_branding ? 'var(--slate)' : '#fff' }}>
              {loading === 'branding_removal' ? 'Redirecting...' : company?.remove_branding ? '✓ Active' : 'Add for +$5/mo'}
            </button>
          </div>
        </div>
        {(currentPlanId === 'business' || currentPlanId === 'growth' || currentPlanId === 'enterprise') && (
          <div className="mt-3 p-3 rounded-xl text-sm" style={{ background: '#dcfce7', color: '#16a34a' }}>
            ✓ Branding removal is included free on your {currentPlanId} plan.
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Payment Method</h2>
          {isPaid && subscription?.stripe_customer_id && (
            <button onClick={handleManageBilling} disabled={portalLoading}
              className="text-sm font-medium cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>
              {portalLoading ? 'Loading...' : 'Manage →'}
            </button>
          )}
        </div>
        {isPaid && subscription?.stripe_customer_id ? (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--canvas)' }}>
            <div className="w-10 h-7 rounded-md flex items-center justify-center" style={{ background: '#1a1a2e' }}>
              <svg width="20" height="14" viewBox="0 0 38 24" fill="none"><rect width="38" height="24" rx="3" fill="#1a1a2e"/><circle cx="15" cy="12" r="7" fill="#EB001B" opacity=".9"/><circle cx="23" cy="12" r="7" fill="#F79E1B" opacity=".9"/><path d="M19 6.8A7 7 0 0 1 22.2 12 7 7 0 0 1 19 17.2 7 7 0 0 1 15.8 12 7 7 0 0 1 19 6.8z" fill="#FF5F00"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Card on file</p>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>Click "Manage Billing" to update payment details</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="flex justify-center mb-3" style={{ color: 'var(--slate)', opacity: 0.4 }}><CreditCardIcon /></div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--slate)' }}>No payment method on file</p>
            <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>Subscribe to a plan above to add a payment method</p>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Billing History</h2>
        {billingHistory.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3 opacity-30">🧾</div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>No billing history yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Invoices will appear here after your first payment</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  {['Date', 'Description', 'Amount', 'Status', ''].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold uppercase" style={{ color: 'var(--slate)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((inv: any) => (
                  <tr key={inv.id} className="border-b last:border-b-0 hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-3" style={{ color: 'var(--ink)' }}>
                      {new Date(inv.created * 1000).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3" style={{ color: 'var(--ink)' }}>
                      {inv.description || 'Subscription'}
                    </td>
                    <td className="py-3 px-3 font-medium" style={{ color: 'var(--ink)' }}>
                      {cur.symbol}{((inv.amount_paid / 100) * cur.rate).toFixed(2)} {currency}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                        style={{ background: inv.status === 'paid' ? '#dcfce7' : '#fee2e2', color: inv.status === 'paid' ? '#16a34a' : '#dc2626' }}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {inv.invoice_pdf && (
                        <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-medium hover:underline cursor-pointer" style={{ color: 'var(--coral)' }}>
                          Download PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
