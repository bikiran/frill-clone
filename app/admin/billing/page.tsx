'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import { trialLeft, trialEndsPhrase } from '@/lib/trial'
import { alertDialog } from '@/components/ConfirmDialog'
import { showBillingUnavailable } from '@/components/BillingUnavailable'
import SmsCreditsCard from '@/components/billing/SmsCreditsCard'
import BillingDetailsCard from '@/components/billing/BillingDetailsCard'
import { fmtAud } from '@/lib/tax-invoice-core'
import { noteLabel } from '@/lib/tax-credit-note-core'
import { soonLabel } from '@/lib/feature-availability'
import { AdminPage, Panel } from '@/components/ui/AdminKit'

// Mirrors the modular plans on /pricing and /upgrade. Each id is a Stripe checkout
// tier (see lib/billing-config.ts). Prices are the Australian dollar amounts
// the Stripe prices are set to (GST inclusive), shown as-is: no conversion, so
// what this page says is what Stripe charges. Annual is billed yearly; the
// per-month figure is the yearly price / 12.
const PLANS = [
  {
    id: 'feedback', name: 'Feedback', monthly: 39, annual: 348, color: '#7c5cff',
    desc: 'For product & feedback teams',
    features: ['Unlimited ideas & voting', 'Polls, surveys & forms', 'Private + public roadmaps', 'Unlimited help articles', 'Remove Colvy branding', 'Unlimited team members'],
  },
  {
    id: 'omnichannel', name: 'Inbox', monthly: 179, annual: 1788, color: '#2b59ff',
    desc: 'For sales & support teams',
    features: ['Live chat inbox', 'Contacts & CRM', 'SMS & voice calls', soonLabel('WhatsApp', 'whatsapp'), '3,000 SMS / month included', 'WooCommerce sync', 'Unlimited team members'],
  },
  {
    id: 'everything', name: 'Everything', monthly: 259, annual: 2508, color: 'var(--coral)', highlighted: true,
    desc: 'The full Colvy platform',
    features: ['Feedback suite + Inbox', 'White-label & custom domain', 'Advanced analytics', 'AI writing assistant', 'Unlimited team members', 'Priority support'],
  },
]

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)

const ShopifyBagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
)

const PLAN_LABEL: Record<string, string> = { free: 'Free', trial: '14-day trial', feedback: 'Feedback', omnichannel: 'Inbox', everything: 'Everything', pro: 'Everything', enterprise: 'Enterprise' }
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// A workspace using Colvy through the Shopify app is billed by Shopify (App
// Store rule): plans are picked on Shopify's own plan page, never Stripe.
function ShopifyBilling({ info }: { info: any }) {
  const sub = info.subscription
  const plan = info.plan || 'free'
  const returned = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('shopify_plan') : null
  const period = sub?.billing_period === 'ANNUAL' || /year|annual/i.test(String(sub?.billing_period || '')) ? 'year' : 'month'
  const price = sub?.amount ? `${Number(sub.amount).toLocaleString(undefined, { style: 'currency', currency: sub.currency || 'USD' })}/${period}` : ''
  // Complimentary (given free by Colvy): nothing to choose or pay in Shopify.
  // If they'd already picked a paid Shopify plan, say so, since Shopify still
  // charges for it until it's changed to Free there.
  // Complimentary or set up by the Colvy team (Enterprise): nothing to choose
  // or pay in Shopify.
  const managed = !!info.managed && !info.complimentary
  const comp = !!info.complimentary || managed
  const paidInShopify = comp && !!sub?.plan && sub.plan !== 'free'
  // Plans the Colvy team manages are sorted out by the team, not here.
  const [card, setCard] = useState<any>(managed ? null : info.cardSubscription || null)
  const [cancelling, setCancelling] = useState(false)
  const [cardMsg, setCardMsg] = useState('')
  const cancelCard = async () => {
    setCancelling(true); setCardMsg('')
    try {
      const r = await authFetch('/api/stripe/cancel-card-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: info.companyId }) })
      const d = await r.json()
      if (!r.ok || d.error) setCardMsg(d.error || 'Couldn’t cancel it. Try again.')
      else { setCard(null); setCardMsg(d.endsAt ? `Your card subscription ends on ${fmtDate(d.endsAt)} and won’t renew.` : 'Your card subscription won’t renew.') }
    } catch { setCardMsg('Couldn’t reach Colvy. Try again.') } finally { setCancelling(false) }
  }
  const status = managed
    ? (paidInShopify
      ? `Your ${PLAN_LABEL[plan] || plan} plan is managed by the Colvy team, but you also have a paid ${sub.name || PLAN_LABEL[sub.plan] || 'Colvy'} plan in Shopify${price ? ` (${price})` : ''}. Choose the Free plan in Shopify so you’re not charged twice.`
      : `Your ${PLAN_LABEL[plan] || plan} plan is set up and managed by the Colvy team. Contact us for any billing changes.`)
    : comp
    ? (paidInShopify
      ? `Your ${PLAN_LABEL[plan] || plan} plan is complimentary, but you also have a paid ${sub.name || PLAN_LABEL[sub.plan] || 'Colvy'} plan in Shopify${price ? ` (${price})` : ''}. Choose the Free plan in Shopify so you’re not charged.`
      : `Your ${PLAN_LABEL[plan] || plan} plan is complimentary. You won’t be charged.`)
    : !sub?.plan
    ? (plan === 'trial'
      ? `You’re on the 14-day trial${info.trialEndsAt ? ` until ${fmtDate(info.trialEndsAt)}` : ''}. Choose a plan in Shopify to keep your features after it ends.`
      : 'You’re on the Free plan. Choose a plan in Shopify to unlock more.')
    : sub.trial_ends_at ? `Free trial until ${fmtDate(sub.trial_ends_at)}${price ? `, then ${price}` : ''}.`
    : sub.cancel_at_end ? `Ends on ${fmtDate(sub.period_end)}.`
    : `${price ? `${price}. ` : ''}${sub.period_end ? `Renews ${fmtDate(sub.period_end)}.` : ''}`
  const currentShop = comp ? plan : sub?.plan || plan
  return (
    <AdminPage width="md" title="Billing" sub={<>You’re on the <b style={{ color: 'var(--ink)' }}>{PLAN_LABEL[plan] || plan}</b> plan.</>}>
      {returned === 'updated' && <p role="status" className="ak-note good">Your plan is updated.</p>}
      {returned === 'pending' && <p role="status" className="ak-note">Shopify is still confirming your plan. It shows here within a few minutes.</p>}
      {info.note && <p className="ak-note">{info.note}</p>}

      <section className="bl-hero">
        <div className="bl-hero-top">
          <span className="bl-hero-ic shop" aria-hidden><ShopifyBagIcon /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="bl-eyebrow">{managed ? 'Managed by Colvy' : comp ? 'Complimentary, no charge' : 'Billed through Shopify'}</p>
            <h2>{comp ? (PLAN_LABEL[plan] || plan) : (sub?.name || PLAN_LABEL[sub?.plan || plan] || plan)}</h2>
            <p className={paidInShopify ? 'bad' : ''}>{status}</p>
          </div>
        </div>
        <p className="bl-hero-sub">
          {managed
            ? <>Your plan is arranged with the Colvy team. Anything you add through the app is charged on {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill.</>
            : comp
            ? <>Colvy has given this workspace its plan free of charge. Nothing is added to {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill.</>
            : <>Your Colvy plan is charged on {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill.</>}
        </p>
        {comp && !paidInShopify ? null : info.planUrl && info.store?.active ? (
          <a href={info.planUrl} target="_top" rel="noopener" className="ak-btn bl-shopify">
            {paidInShopify ? 'Change to Free in Shopify' : sub?.plan ? 'Change plan in Shopify' : 'Choose a plan in Shopify'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
        ) : (
          <p className="ak-hint">Reconnect your Shopify store under Integrations → Shopify to change your plan.</p>
        )}
        {(card || cardMsg) && (
          <div className="ak-note warn" style={{ margin: '16px 0 0', display: 'block' }}>
            {card ? (
              <>
                <p style={{ margin: 0 }}>You still have a Colvy card subscription{card.tier ? ` (${PLAN_LABEL[card.tier] || card.tier})` : ''} from before you connected Shopify. Once your plan in Shopify has started, stop the card subscription so you aren’t charged twice. It runs to the end of the period you’ve paid for.</p>
                <button type="button" onClick={cancelCard} disabled={cancelling} className="ak-btn sm" style={{ marginTop: 10 }}>
                  {cancelling ? 'Stopping…' : 'Stop card subscription'}
                </button>
              </>
            ) : null}
            {cardMsg && <p style={{ margin: card ? '8px 0 0' : 0 }}>{cardMsg}</p>}
          </div>
        )}
        {!comp && (
          <p className="ak-hint" style={{ marginTop: 14 }}>
            Plans, invoices and your payment method are in your Shopify admin under Settings → Billing. To cancel, choose the Free plan in Shopify or uninstall Colvy from your store.
          </p>
        )}
      </section>

      <div className="bl-plans">
        {PLANS.map(p => (
          <div key={p.id} className={`bl-plan${currentShop === p.id ? ' current' : ''}`} style={{ '--pc': p.color } as React.CSSProperties}>
            <div className="bl-plan-h">
              <h3>{p.name}</h3>
              {currentShop === p.id && <span className="ak-tag green">Current</span>}
            </div>
            <p className="bl-plan-desc">{p.desc}</p>
            <ul className="bl-feats">
              {p.features.map(f => <li key={f}><span aria-hidden><CheckIcon /></span>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <style>{BL_CSS}</style>
    </AdminPage>
  )
}

const ReceiptIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>
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
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [shopifyBilling, setShopifyBilling] = useState<any>(null)
  // The $5 branding add-on (lib/branding-addon): granted as a removeBranding
  // override in company_entitlements once Stripe confirms the payment.
  const [brandingAddon, setBrandingAddon] = useState(false)
  const [addonPending, setAddonPending] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)
      // The subscription belongs to the person, not the company: start reading
      // it now rather than after the company and add-on lookups.
      const subP = Promise.resolve((supabase as any).from('subscriptions').select('*').eq('user_id', u.id).maybeSingle()).catch(() => ({ data: null }))

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
      const readAddon = async () => {
        if (!co?.id) return false
        const { data: ent } = await (supabase as any).from('company_entitlements').select('features').eq('company_id', co.id).maybeSingle()
        const on = !!(ent?.features?.brandingAddon && ent?.features?.removeBranding)
        setBrandingAddon(on)
        return on
      }
      // The add-on check and (for Shopify billing) the Shopify plan, side by side.
      const back = new URLSearchParams(window.location.search).get('shopify_plan')
      // Asked for every workspace: one with a store connected through the
      // Shopify app is billed through Shopify (adopted server-side).
      const shopP = co?.id
        ? authFetch(`/api/shopify/billing?companyId=${co.id}${back ? '&refresh=1' : ''}`).then(async r => ({ ok: r.ok, d: await r.json() })).catch(() => null)
        : null
      const addonOn = await readAddon()
      // Back from the add-on checkout: Stripe's webhook can land a few seconds
      // after the redirect, so check again for up to ~30s.
      if (!addonOn && new URLSearchParams(window.location.search).get('addon') === 'branding') {
        setAddonPending(true)
        let tries = 0
        const t = setInterval(async () => {
          tries++
          if ((await readAddon()) || tries >= 10) { clearInterval(t); setAddonPending(false) }
        }, 3000)
      }

      // Billed through Shopify? (lib/shopify-billing)
      if (shopP) {
        const res = await shopP
        if (res?.ok && res.d?.provider === 'shopify') { setShopifyBilling({ ...res.d, companyId: co.id }); setPageLoading(false); return }
      }

      // Load subscription (already on its way)
      const { data: sub } = await subP
      setSubscription(sub)

      // Billing history: the workspace's payments to Colvy (plans, SMS credit,
      // numbers, porting), each with its Colvy tax invoice.
      if (co?.id || sub?.stripe_customer_id) {
        try {
          const res = await authFetch(co?.id ? `/api/stripe/billing-history?companyId=${co.id}` : '/api/stripe/billing-history')
          const data = await res.json()
          setBillingHistory(data.invoices || [])
        } catch {}
      }

      // Funnel: distinguish a return from Stripe checkout (?success=1) from an
      // ordinary visit to the plans page.
      try {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === '1') {
          track('checkout_completed', { tier: sub?.tier || co?.plan || null })
        } else {
          track('pricing_viewed', { plan: co?.plan || null })
        }
      } catch {}

      setPageLoading(false)
    })
  }, [router])

  // Australian dollars, as the Stripe prices are: "A$39", "A$1,788".
  const formatPrice = (aud: number) => `A$${aud.toLocaleString('en-AU')}`
  const formatMoney = (amount: number, code?: string) => {
    const c = String(code || 'aud').toUpperCase()
    return c === 'AUD' ? `A$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${c}`
  }

  const handleUpgrade = async (planId: string) => {
    if (!user) return
    track('checkout_started', { tier: planId, billing })
    setLoading(planId)
    try {
      // Plans take the card now and, while the workspace is still in its Colvy
      // trial, first charge when that trial ends (create-checkout works out the
      // date). The branding add-on is a straight charge, not a trial.
      const trial = planId !== 'branding_removal'
      const res = await authFetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, companyId: company?.id, tier: planId, billing, email: user.email, currency: 'AUD', trial }),
      })
      const data = await res.json()
      if (data.setup) {
        // Billing isn't set up on Colvy's side: a plain message (the server has
        // already told the Colvy team), never env var names.
        setLoading(null)
        const plan = PLANS.find(p => p.id === planId)
        await showBillingUnavailable({
          what: planId === 'branding_removal' ? 'the Remove “Powered by Colvy” add-on' : `the ${plan?.name || planId} plan (${billing})`,
          workspace: company?.name || null,
        })
        return
      }
      if (data.url) { window.location.href = data.url; return }
      // Uses Colvy through the Shopify app: reload into the Shopify plan view.
      if (data.shopify) { window.location.reload(); return }
      await alertDialog({ title: 'Couldn’t start the checkout', message: data.error || 'Please try again in a minute.' })
    } catch (err: any) { await alertDialog({ title: 'Couldn’t start the checkout', message: err?.message || 'Please try again in a minute.' }) }
    setLoading(null)
  }

  const handleManageBilling = async () => {
    if (!subscription?.stripe_customer_id) return
    setPortalLoading(true)
    try {
      const res = await authFetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription.stripe_customer_id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else await alertDialog({ title: 'Couldn’t open billing', message: data.error || 'Please try again in a minute.' })
    } catch (err: any) { await alertDialog({ title: 'Couldn’t open billing', message: err?.message || 'Please try again in a minute.' }) }
    setPortalLoading(false)
  }

  if (pageLoading) return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (shopifyBilling) return <ShopifyBilling info={shopifyBilling} />

  // A 'free' subscription row can exist just to hold the Stripe customer for
  // the branding add-on; the company's own plan (e.g. a trial) wins then.
  const currentPlanId = (subscription?.tier && subscription.tier !== 'free' ? subscription.tier : null) || company?.plan || 'free'
  const isOnPlan = (id: string) => currentPlanId === id
  const isPaid = ['feedback', 'omnichannel', 'everything', 'startup', 'business', 'growth', 'pro', 'enterprise'].includes(currentPlanId)
  const planLabel = PLAN_LABEL[currentPlanId] || currentPlanId.charAt(0).toUpperCase() + currentPlanId.slice(1)
  // Plans set up by the Colvy team (Enterprise, complimentary) have no Stripe
  // customer, so there's no billing portal to open.
  const hasStripe = !!subscription?.stripe_customer_id
  const brandingIncluded = ['feedback', 'omnichannel', 'everything', 'business', 'growth', 'enterprise', 'pro'].includes(currentPlanId)

  const trialInfo = (() => {
    // The trial's own end date (what the banner counts to, and what an
    // extension moves); 14 days from sign-up only for a workspace that has none.
    const ends = company?.trial_ends_at || (company?.created_at ? new Date(new Date(company.created_at).getTime() + 14 * 86400000) : null)
    const t = trialLeft(ends)
    if (!t) return null
    if (t.ended) return { line: 'Your trial has ended', pct: 100 }
    const on = t.ends.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    return { line: t.days < 2 ? `Ends ${trialEndsPhrase(t)}` : `${t.days} days left · ends ${on}`, pct: Math.max(4, Math.min(100, ((14 - t.days) / 14) * 100)) }
  })()
  const onTrial = currentPlanId === 'trial' || currentPlanId === 'free'

  return (
    <AdminPage width="md" title="Billing"
      sub={<>You’re on the <b style={{ color: 'var(--ink)' }}>{planLabel}</b> plan. Prices are in Australian dollars and include GST.</>}
      actions={isPaid && hasStripe ? (
        <button type="button" className="ak-btn" onClick={handleManageBilling} disabled={portalLoading}>
          <CreditCardIcon /> {portalLoading ? 'Opening…' : 'Manage billing'}
        </button>
      ) : undefined}>

      {/* Where you are now */}
      {(isPaid || onTrial) && (
        <section className="bl-hero">
          {onTrial ? (
            <>
              <div className="bl-hero-top">
                <span className="bl-hero-ic" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="bl-eyebrow">14-day free trial</p>
                  <h2>{trialInfo?.line || 'Try everything free'}</h2>
                  <p>Your trial includes unlimited surveys, white labelling and the Privacy add-on.</p>
                </div>
                <span className="ak-tag" style={{ background: 'color-mix(in srgb,var(--coral) 14%,var(--card,#fff))', color: 'var(--coral)' }}>Trial</span>
              </div>
              {trialInfo && <div className="bl-trial" role="img" aria-label={trialInfo.line}><i style={{ width: `${trialInfo.pct}%` }} /></div>}
              <div className="bl-incl">
                {['Unlimited ideas', 'Unlimited surveys', 'Unlimited polls', 'Unlimited help articles'].map(x => (
                  <span key={x}><CheckIcon />{x}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="bl-hero-top">
              <span className="bl-hero-ic good" aria-hidden><CheckIcon /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="bl-eyebrow">Your plan</p>
                <h2>{planLabel}</h2>
                <p>
                  {!hasStripe
                    ? 'Set up and managed by the Colvy team. Contact us for any billing changes.'
                    : subscription?.status === 'active' ? 'Your subscription is active.' : 'Manage your subscription below.'}
                  {hasStripe && subscription?.current_period_end && ` Renews ${new Date(subscription.current_period_end * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
                </p>
              </div>
              {hasStripe
                ? <button type="button" className="ak-btn go" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage'}</button>
                : <span className="ak-tag">Managed by Colvy</span>}
            </div>
          )}
        </section>
      )}

      {/* Plans */}
      <div className="bl-plans-h">
        <h2>Plans</h2>
        <div className="ak-seg" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={billing === 'monthly'} className={billing === 'monthly' ? 'on' : ''} onClick={() => setBilling('monthly')}>Monthly</button>
          <button type="button" role="radio" aria-checked={billing === 'annual'} className={billing === 'annual' ? 'on' : ''} onClick={() => setBilling('annual')}>Yearly <span className="ak-tag green" style={{ height: 20 }}>Save 20%</span></button>
        </div>
      </div>
      <div className="bl-plans">
        {PLANS.map(plan => {
          const price = billing === 'monthly' ? plan.monthly : Math.round(plan.annual / 12)
          const active = isOnPlan(plan.id)
          const best = !!(plan as any).highlighted
          return (
            <div key={plan.id} className={`bl-plan${best ? ' best' : ''}${active ? ' current' : ''}`} style={{ '--pc': plan.color } as React.CSSProperties}>
              <div className="bl-plan-h">
                <h3>{plan.name}</h3>
                {active ? <span className="ak-tag green">Current</span> : best ? <span className="bl-best">Best value</span> : null}
              </div>
              <p className="bl-plan-desc">{plan.desc}</p>
              <p className="bl-price"><b>{formatPrice(price)}</b><span>/month</span></p>
              <p className="bl-price-sub">{billing === 'annual' ? `${formatPrice(plan.annual)} billed yearly` : 'Billed monthly'}</p>
              <button type="button" onClick={() => handleUpgrade(plan.id)} disabled={active || loading === plan.id}
                className={`ak-btn${active ? ' ghost' : best ? ' go' : ' dark'}`} style={{ width: '100%' }}>
                {loading === plan.id ? 'Opening checkout…' : active ? 'Your plan' : `Choose ${plan.name}`}
              </button>
              <ul className="bl-feats">
                {plan.features.map(f => <li key={f}><span aria-hidden><CheckIcon /></span>{f}</li>)}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Remove branding add-on */}
      <Panel title={<>Remove “Powered by Colvy” <span className="ak-tag amber" style={{ marginLeft: 6, verticalAlign: 2 }}>Add-on</span></>}
        sub="Hide the Colvy footer from your board, help centre, forms and booking pages. Available on any plan."
        right={
          brandingIncluded ? <span className="ak-tag green"><CheckIcon />Included</span>
          : brandingAddon ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="ak-tag green"><CheckIcon />On</span>
              {hasStripe && <button type="button" className="ak-btn sm" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage'}</button>}
            </span>
          ) : addonPending ? (
            <span className="ak-tag"><span className="bl-spin" aria-hidden />Turning on…</span>
          ) : (
            <button type="button" className="ak-btn go" onClick={() => handleUpgrade('branding_removal')} disabled={loading === 'branding_removal'}>
              {loading === 'branding_removal' ? 'Opening checkout…' : 'Add for A$5/month'}
            </button>
          )
        }>
        {brandingIncluded
          ? <p className="ak-note good" style={{ margin: 0 }}><CheckIcon /> Branding removal is included free on your {planLabel} plan.</p>
          : brandingAddon ? <p className="ak-note good" style={{ margin: 0 }}><CheckIcon /> Colvy branding is hidden on your board, help centre, forms and booking pages.</p>
          : null}
      </Panel>

      {/* Prepaid SMS credits for texts beyond the monthly allowance */}
      {company?.id && <SmsCreditsCard companyId={company.id} companyName={company.name} />}

      {/* Payment method */}
      <Panel title="Payment method"
        right={isPaid && hasStripe ? <button type="button" className="ak-btn sm" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Update'}</button> : undefined}>
        {isPaid && hasStripe ? (
          <div className="bl-card">
            {/* We don't know the card brand here, so a neutral card. */}
            <span className="bl-card-ic" aria-hidden><CreditCardIcon /></span>
            <span className="ak-row-t"><b>Card on file</b><small>Update it in the billing portal (Manage billing)</small></span>
          </div>
        ) : (
          <div className="bl-card muted">
            <span className="bl-card-ic" aria-hidden><CreditCardIcon /></span>
            <span className="ak-row-t"><b>No card on file</b><small>{isPaid ? 'Your plan is managed by the Colvy team, so no card is needed.' : 'Choose a plan above to add a card.'}</small></span>
          </div>
        )}
      </Panel>

      {/* Business details on Colvy's tax invoices */}
      {company?.id && <BillingDetailsCard companyId={company.id} />}

      {/* Billing history */}
      <Panel title="Billing history" sub="Every payment to Colvy, with a tax invoice you can print or save as a PDF. Refunds come with an adjustment note." flush>
        {billingHistory.length === 0 ? (
          <div className="ak-empty">
            <span style={{ opacity: .5 }}><ReceiptIcon /></span>
            <b>No payments yet</b>
            Invoices show up here after your first payment.
          </div>
        ) : (() => {
          const docLink = (inv: any) => {
            const paid = (inv.status === 'paid' || inv.status === 'refunded') && (inv.amount_paid > 0 || inv.taxInvoice)
            if (!paid || !company?.id) return null
            const label = inv.taxInvoice?.docType === 'receipt' ? 'Receipt' : 'Tax invoice'
            return (
              <Link href={`/admin/billing/tax-invoice?ref=${encodeURIComponent(inv.taxInvoice?.id || inv.ref || inv.id)}&company=${encodeURIComponent(company.id)}`} className="ak-btn sm">
                {label}{inv.taxInvoice?.number ? ` ${inv.taxInvoice.number}` : ''}
              </Link>
            )
          }
          const stripePdf = (inv: any) => inv.invoice_pdf ? (
            <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" className="bl-pdf">Stripe PDF</a>
          ) : null
          const badge = (inv: any) => (
            <span className={`ak-tag ${inv.status === 'paid' ? 'green' : inv.status === 'refunded' ? '' : 'red'}`} style={{ textTransform: 'capitalize' }}>{inv.status}</span>
          )
          // Refunded (or credited by a credit note) on this payment.
          const liveNotes = (inv: any) => (Array.isArray(inv.notes) ? inv.notes : []).filter((n: any) => n.status !== 'void')
          const refundBadge = (inv: any) => {
            const refunded = Number(inv.refundedCents) || 0
            const credited = liveNotes(inv).reduce((sum: number, n: any) => sum + (Number(n.amountCents) || 0), 0)
            if (refunded <= 0 && credited <= 0) return null
            return <span className="ak-tag amber">{refunded > 0 ? `Refunded ${fmtAud(Math.max(refunded, credited))}` : `Credited ${fmtAud(credited)}`}</span>
          }
          // Its adjustment notes (credit notes), each opening the printable note.
          const noteLinks = (inv: any) => {
            const notes: any[] = Array.isArray(inv.notes) ? inv.notes : []
            if (!notes.length || !company?.id) return null
            return (
              <div className="bl-notes">
                {notes.map((n: any) => (
                  <Link key={n.id} href={`/admin/billing/tax-invoice?note=${encodeURIComponent(n.id)}&company=${encodeURIComponent(company.id)}`} className={n.status === 'void' ? 'void' : ''}>
                    {noteLabel(n.kind)} {n.number} · {n.status === 'void' ? 'void' : `−${fmtAud(n.amountCents)}`}
                  </Link>
                ))}
              </div>
            )
          }
          const when = (inv: any) => new Date(inv.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          return (
            <>
              <ul className="bl-hist-m">
                {billingHistory.map((inv: any) => (
                  <li key={inv.id}>
                    <div className="bl-hist-top">
                      <span className="ak-row-t"><b style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{inv.description || 'Subscription'}</b><small>{when(inv)}</small></span>
                      <span className="bl-amt">{formatMoney(inv.amount_paid / 100, inv.currency)}</span>
                    </div>
                    <div className="bl-hist-tags">{badge(inv)}{refundBadge(inv)}</div>
                    <div className="bl-hist-acts">{docLink(inv)}{stripePdf(inv)}</div>
                    {noteLinks(inv)}
                  </li>
                ))}
              </ul>
              <div className="bl-hist-d" style={{ overflowX: 'auto' }}>
                <table className="ak-table">
                  <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {billingHistory.map((inv: any) => (
                      <tr key={inv.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{when(inv)}</td>
                        <td>{inv.description || 'Subscription'}{noteLinks(inv)}</td>
                        <td className="bl-amt">{formatMoney(inv.amount_paid / 100, inv.currency)}</td>
                        <td><span className="bl-hist-tags">{badge(inv)}{refundBadge(inv)}</span></td>
                        <td><div className="bl-hist-acts" style={{ justifyContent: 'flex-end' }}>{docLink(inv)}{stripePdf(inv)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}
      </Panel>
      <style>{BL_CSS}</style>
    </AdminPage>
  )
}

const BL_CSS = `
.bl-hero{margin-bottom:22px;padding:20px 22px;border-radius:24px;background:linear-gradient(160deg,color-mix(in srgb,var(--coral) 7%,var(--card,#fff)),var(--card,#fff) 65%);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.bl-hero-top{display:flex;align-items:flex-start;gap:14px}
.bl-hero-ic{width:44px;height:44px;flex-shrink:0;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 14%,var(--card,#fff));color:var(--coral)}
.bl-hero-ic.good{background:#dcfce7;color:#15803d}
.bl-hero-ic.shop{background:#e3f1ec;color:#008060}
.bl-eyebrow{margin:0;font-size:12.5px;font-weight:650;color:var(--mut)}
.bl-hero h2{margin:2px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.bl-hero-top p:not(.bl-eyebrow){margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--mut)}
.bl-hero-top p.bad{color:#b42318}
.bl-hero-sub{margin:14px 0 0;font-size:14px;line-height:1.55;color:var(--mut)}
.bl-hero-sub b{color:var(--ink)}
.bl-trial{height:8px;margin:16px 0 0;border-radius:999px;background:var(--f);overflow:hidden}
.bl-trial i{display:block;height:100%;border-radius:999px;background:var(--coral)}
.bl-incl{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.bl-incl span{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);font-size:13px;font-weight:600;color:var(--ink)}
.bl-incl svg{color:#16a34a}
.ak-btn.bl-shopify{margin-top:16px;background:#008060;color:#fff;box-shadow:none}
.ak-btn.bl-shopify:hover{background:#008060;filter:brightness(.95)}
.bl-plans-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 12px}
.bl-plans-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.bl-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
@media (max-width:900px){.bl-plans{grid-template-columns:minmax(0,1fr)}}
.bl-plan{display:flex;flex-direction:column;padding:20px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.bl-plan.best{box-shadow:0 0 0 2px var(--coral),0 16px 36px -20px color-mix(in srgb,var(--coral) 60%,transparent)}
.bl-plan.current{box-shadow:0 0 0 2px #22c55e}
.bl-plan-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bl-plan-h h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.bl-best{height:22px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;background:var(--coral);color:#fff;font-size:11.5px;font-weight:700}
.bl-plan-desc{margin:3px 0 0;font-size:13px;color:var(--mut)}
.bl-price{display:flex;align-items:baseline;gap:4px;margin:16px 0 0}
.bl-price b{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:38px;font-weight:700;letter-spacing:-.045em;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}
.bl-price span{font-size:14px;color:var(--mut)}
.bl-price-sub{margin:6px 0 16px;font-size:12.5px;color:var(--soft)}
.bl-feats{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.bl-feats li{display:flex;align-items:flex-start;gap:9px;font-size:13.5px;line-height:1.4;color:var(--ink)}
.bl-feats li span{flex-shrink:0;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--pc) 14%,var(--card,#fff));color:var(--pc)}
.bl-feats li span svg{width:12px;height:12px}
.bl-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--f)}
.bl-card-ic{width:44px;height:32px;flex-shrink:0;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:var(--mut);box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.bl-card.muted .ak-row-t b{color:var(--mut)}
.bl-spin{width:12px;height:12px;border-radius:50%;border:2px solid var(--coral);border-top-color:transparent;animation:blSpin .8s linear infinite}
@keyframes blSpin{to{transform:rotate(360deg)}}
.bl-amt{font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.bl-hist-tags{display:inline-flex;flex-wrap:wrap;gap:5px}
.bl-hist-acts{display:flex;align-items:center;gap:10px}
.bl-pdf{font-size:12.5px;font-weight:600;color:var(--mut);text-decoration:none;white-space:nowrap}
.bl-pdf:hover{color:var(--ink);text-decoration:underline}
.bl-notes{display:flex;flex-direction:column;gap:3px;margin-top:5px}
.bl-notes a{font-size:12.5px;font-weight:600;color:var(--coral);text-decoration:none;overflow-wrap:anywhere}
.bl-notes a.void{color:var(--mut)}
.bl-hist-m{display:none;list-style:none;margin:0;padding:0 8px 8px}
.bl-hist-m li{padding:12px;border-radius:14px}
.bl-hist-m li+li{box-shadow:0 -1px 0 var(--line)}
.bl-hist-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.bl-hist-m .bl-hist-tags,.bl-hist-m .bl-hist-acts{margin-top:8px}
@media (max-width:760px){.bl-hist-m{display:block}.bl-hist-d{display:none}}
`
