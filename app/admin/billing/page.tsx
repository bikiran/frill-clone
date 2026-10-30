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
import ContactSalesModal from '@/components/ContactSalesModal'

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
    id: 'everything', name: 'Everything', monthly: 259, annual: 2508, color: '#ff6a4d', highlighted: true,
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

// Each plan's mark: a glossy tile in its colour, like Sellio's plan icons.
const MARKS: Record<string, { from: string; to: string; d: React.ReactNode }> = {
  feedback: { from: '#a78bfa', to: '#6d28d9', d: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></> },
  omnichannel: { from: '#60a5fa', to: '#1d4ed8', d: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.6-4.7A8.4 8.4 0 1 1 21 11.5z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></> },
  everything: { from: '#ffb37a', to: '#ff5a3c', d: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" /> },
  enterprise: { from: '#52525b', to: '#18181b', d: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></> },
  trial: { from: '#ffa68a', to: '#ff6a4d', d: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6" /></> },
  free: { from: '#6ee7b7', to: '#059669', d: <><path d="M12 20v-8" /><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z" /><path d="M12 14c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z" /></> },
}
const PlanMark = ({ id, size = 48 }: { id: string; size?: number }) => {
  const m = MARKS[id] || MARKS[id === 'pro' ? 'everything' : 'free']
  return (
    <span className="bl-mark" style={{ width: size, height: size, '--a': m.from, '--b': m.to } as React.CSSProperties} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{m.d}</svg>
    </span>
  )
}
// One line of what a plan gives you, under its name in the summary.
const FACTS: Record<string, string> = {
  feedback: 'Ideas & voting · Roadmaps · Help centre · Unlimited team',
  omnichannel: 'Live chat · SMS & calls · 3,000 SMS a month · Unlimited team',
  everything: 'Feedback + Inbox · White-label · AI assistant · Unlimited team',
  pro: 'Feedback + Inbox · White-label · AI assistant · Unlimited team',
  enterprise: 'All of Colvy · Set up with the Colvy team · Unlimited team',
  trial: 'Everything unlocked while you try Colvy',
  free: 'Feedback board · Roadmap · Changelog · 2 team members',
}
const ENTERPRISE_FEATS = ['White-label branding', 'Roles & permissions', 'Audit logs', 'Dedicated onboarding', 'Dedicated support', 'Custom contracts', 'High-volume usage & rates']
// The little "+ ◇ +" rule between a plan's button and its features.
const Rule = () => (
  <div className="bl-rule" aria-hidden><i /><svg width="34" height="12" viewBox="0 0 34 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 6h6M5 3v6M26 6h6M29 3v6" /><path d="M17 1.5 21.5 6 17 10.5 12.5 6z" /></svg><i /></div>
)
const BuildingIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>

/** The Enterprise strip under the plan cards. */
function EnterpriseCard({ current, onContact }: { current: boolean; onContact: () => void }) {
  return (
    <section className={`bl-ent${current ? ' current' : ''}`}>
      <div className="bl-ent-l">
        <PlanMark id="enterprise" size={44} />
        <div>
          <h3>Enterprise {current && <span className="ak-tag green">Your plan</span>}</h3>
          <p>For teams that need compliance, control and scale beyond the plans above.</p>
        </div>
      </div>
      <ul className="bl-ent-f">
        {ENTERPRISE_FEATS.map(f => <li key={f}><BuildingIcon />{f}</li>)}
      </ul>
      <button type="button" className="ak-btn bl-ent-go" onClick={onContact}>{current ? 'Talk to us' : 'Contact us'}</button>
    </section>
  )
}

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
  const [contact, setContact] = useState(false)
  const shownPlan = comp ? plan : sub?.plan || plan
  return (
    <AdminPage width="md" title="Billing" sub={<>You’re on the <b style={{ color: 'var(--ink)' }}>{PLAN_LABEL[plan] || plan}</b> plan.</>}>
      {returned === 'updated' && <p role="status" className="ak-note good">Your plan is updated.</p>}
      {returned === 'pending' && <p role="status" className="ak-note">Shopify is still confirming your plan. It shows here within a few minutes.</p>}
      {info.note && <p className="ak-note">{info.note}</p>}

      <section className="bl-sum">
        <div className="bl-sum-top">
          <PlanMark id={shownPlan} />
          <div className="bl-sum-t">
            <h2>{comp ? (PLAN_LABEL[plan] || plan) : (sub?.name || PLAN_LABEL[sub?.plan || plan] || plan)} <span className="bl-chip">Your plan</span></h2>
            <p>{FACTS[shownPlan] || FACTS.free}</p>
          </div>
          {!(comp && !paidInShopify) && info.planUrl && info.store?.active && (
            <a href={info.planUrl} target="_top" rel="noopener" className="ak-btn bl-shopify cv-shine">
              <span>{paidInShopify ? 'Change to Free in Shopify' : sub?.plan ? 'Change plan' : 'Choose a plan'}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9"/></svg>
            </a>
          )}
        </div>
        <div className="bl-sum-row">
          <span className="bl-row-ic shop" aria-hidden><ShopifyBagIcon /></span>
          <div className="bl-sum-rt">
            <b>{managed ? 'Managed by Colvy' : comp ? 'Complimentary, no charge' : 'Billed through Shopify'}</b>
            <p className={paidInShopify ? 'bad' : ''}>{status}</p>
            <small>
              {managed
                ? <>Anything you add through the app is charged on {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill.</>
                : comp
                ? <>Nothing is added to {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill.</>
                : <>Charged on {info.store?.name ? <b>{info.store.name}</b> : 'your store'}’s Shopify bill. Invoices and your payment method are in Shopify under Settings → Billing.</>}
            </small>
          </div>
          {managed && <button type="button" className="ak-btn sm" onClick={() => setContact(true)}>Contact us</button>}
        </div>
        {!(comp && !paidInShopify) && !(info.planUrl && info.store?.active) && (
          <p className="ak-hint bl-sum-hint">Reconnect your Shopify store under Integrations → Shopify to change your plan.</p>
        )}
        {(card || cardMsg) && (
          <div className="ak-note warn bl-sum-note">
            {card ? (
              <span>
                You still have a Colvy card subscription{card.tier ? ` (${PLAN_LABEL[card.tier] || card.tier})` : ''} from before you connected Shopify. Once your plan in Shopify has started, stop the card subscription so you aren’t charged twice. It runs to the end of the period you’ve paid for.
                <br />
                <button type="button" onClick={cancelCard} disabled={cancelling} className="ak-btn sm" style={{ marginTop: 10 }}>
                  {cancelling ? 'Stopping…' : 'Stop card subscription'}
                </button>
              </span>
            ) : null}
            {cardMsg && <span style={{ display: 'block', marginTop: card ? 8 : 0 }}>{cardMsg}</span>}
          </div>
        )}
        {!comp && (
          <p className="ak-hint bl-sum-hint">To cancel, choose the Free plan in Shopify or uninstall Colvy from your store.</p>
        )}
      </section>

      <div className="bl-plans-h"><h2>{comp ? 'What each plan includes' : 'Plans'}</h2></div>
      <div className="bl-plans">
        {PLANS.map(p => {
          const current = currentShop === p.id
          return (
            <div key={p.id} className={`bl-plan${current ? ' current' : ''}`} style={{ '--pc': p.color } as React.CSSProperties}>
              <PlanMark id={p.id} size={46} />
              <div className="bl-plan-h">
                <h3>{p.name}</h3>
                {current && <span className="ak-tag green">Current</span>}
              </div>
              <p className="bl-plan-desc">{p.desc}</p>
              <Rule />
              <p className="bl-incl-l">Includes</p>
              <ul className="bl-feats">
                {p.features.map(f => <li key={f}><span aria-hidden><CheckIcon /></span>{f}</li>)}
              </ul>
            </div>
          )
        })}
      </div>
      <EnterpriseCard current={plan === 'enterprise'} onContact={() => setContact(true)} />
      <p className="bl-foot">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        Plans for Shopify stores are billed by Shopify · Change or cancel any time
      </p>
      <ContactSalesModal open={contact} onClose={() => setContact(false)} plan="Enterprise" source="billing" />
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
  const [contact, setContact] = useState(false)

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
      >

      {/* Where you are now: the plan, then the things you can do about it. */}
      <section className="bl-sum">
        <div className="bl-sum-top">
          <PlanMark id={onTrial ? (currentPlanId === 'trial' ? 'trial' : 'free') : currentPlanId} />
          <div className="bl-sum-t">
            <h2>{onTrial && currentPlanId === 'trial' ? '14-day trial' : planLabel} <span className="bl-chip">Your plan</span></h2>
            <p>{FACTS[currentPlanId] || FACTS.free}</p>
          </div>
          {isPaid
            ? (hasStripe
              ? <button type="button" className="ak-btn" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage'}</button>
              : <span className="ak-tag">Managed by Colvy</span>)
            : <a href="#plans" className="ak-btn">See plans</a>}
        </div>

        {onTrial && trialInfo && (
          <div className="bl-meter">
            <div className="bl-meter-l"><span className="bl-meter-ic" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg></span>Free trial</div>
            <div className="bl-meter-v">{trialInfo.line}</div>
            <div className="bl-bar" role="img" aria-label={trialInfo.line}><i style={{ width: `${trialInfo.pct}%` }} /></div>
          </div>
        )}
        {isPaid && hasStripe && subscription?.current_period_end && (
          <div className="bl-meter">
            <div className="bl-meter-l"><span className="bl-meter-ic good" aria-hidden><CheckIcon /></span>{subscription?.status === 'active' ? 'Active' : 'Subscription'}</div>
            <div className="bl-meter-v">Renews {new Date(subscription.current_period_end * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
        )}

        {/* Remove branding add-on */}
        <div className="bl-sum-row">
          <span className="bl-row-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg></span>
          <div className="bl-sum-rt">
            <b>Remove “Powered by Colvy” <span className="ak-tag amber">Add-on</span></b>
            <p>{brandingIncluded ? `Included free on your ${planLabel} plan.` : brandingAddon ? 'Colvy branding is hidden on your board, help centre, forms and booking pages.' : 'Hide the Colvy footer from your board, help centre, forms and booking pages.'}</p>
          </div>
          {brandingIncluded ? <span className="ak-tag green"><CheckIcon />Included</span>
            : brandingAddon ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="ak-tag green"><CheckIcon />On</span>
                {hasStripe && <button type="button" className="ak-btn sm" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage'}</button>}
              </span>
            ) : addonPending ? (
              <span className="ak-tag"><span className="bl-spin" aria-hidden />Turning on…</span>
            ) : (
              <button type="button" className="ak-btn bl-buy cv-shine" onClick={() => handleUpgrade('branding_removal')} disabled={loading === 'branding_removal'}>
                <span>{loading === 'branding_removal' ? 'Opening checkout…' : 'Add for A$5/month'}</span>
              </button>
            )}
        </div>

        {/* Manage billing */}
        <div className="bl-sum-row">
          <span className="bl-row-ic" aria-hidden><CreditCardIcon /></span>
          <div className="bl-sum-rt">
            <b>Manage billing</b>
            <p>{hasStripe ? 'Invoices, payment method and cancellation.' : isPaid ? 'Your plan is set up by the Colvy team. Talk to us about any change.' : 'Choose a plan below to add a card.'}</p>
          </div>
          {hasStripe
            ? <button type="button" className="ak-btn sm" onClick={handleManageBilling} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage subscription'}</button>
            : isPaid ? <button type="button" className="ak-btn sm" onClick={() => setContact(true)}>Contact us</button>
            : <button type="button" className="ak-btn sm" disabled>Manage subscription</button>}
        </div>
      </section>

      {/* Plans */}
      <div className="bl-plans-h" id="plans">
        <h2>{isPaid ? 'Plans' : 'Upgrade your plan'}</h2>
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
              <PlanMark id={plan.id} size={46} />
              <div className="bl-plan-h">
                <h3>{plan.name}</h3>
                {active ? <span className="ak-tag green">Current</span> : best ? <span className="bl-best">Best value</span> : null}
              </div>
              <p className="bl-plan-desc">{plan.desc}</p>
              <p className="bl-price"><b>{formatPrice(price)}</b><span>per month</span></p>
              <p className="bl-price-sub">{billing === 'annual' ? `${formatPrice(plan.annual)} billed yearly` : 'Billed monthly'}</p>
              <button type="button" onClick={() => handleUpgrade(plan.id)} disabled={active || loading === plan.id}
                className={`bl-sub${active ? ' on' : ` ${plan.id} cv-shine`}`}>
                <span>{loading === plan.id ? 'Opening checkout…' : active ? 'Your plan' : 'Subscribe'}</span>
              </button>
              <Rule />
              <p className="bl-incl-l">Includes</p>
              <ul className="bl-feats">
                {plan.features.map(f => <li key={f}><span aria-hidden><CheckIcon /></span>{f}</li>)}
              </ul>
            </div>
          )
        })}
      </div>
      <EnterpriseCard current={currentPlanId === 'enterprise'} onContact={() => setContact(true)} />
      <p className="bl-foot">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        Australian dollars, GST included · Cancel any time
      </p>

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
      <ContactSalesModal open={contact} onClose={() => setContact(false)} plan="Enterprise" source="billing" />
      <style>{BL_CSS}</style>
    </AdminPage>
  )
}

const BL_CSS = `
.bl-sum{margin-bottom:26px;border-radius:24px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);overflow:hidden}
.bl-sum-top{display:flex;align-items:center;gap:14px;padding:20px 22px}
.bl-sum-t{flex:1;min-width:0}
.bl-sum-t h2{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.bl-sum-t p{margin:4px 0 0;font-size:13.5px;color:var(--mut)}
.bl-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--f);font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0;color:var(--mut)}
.bl-mark{position:relative;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:30%;color:#fff;background:linear-gradient(145deg,var(--a),var(--b));box-shadow:inset 0 1.5px 0 rgba(255,255,255,.45),inset 0 -2px 0 rgba(0,0,0,.12),0 10px 22px -10px var(--b);overflow:hidden}
.bl-mark::after{content:'';position:absolute;left:8%;right:8%;top:5%;height:42%;border-radius:40% 40% 50% 50%;background:linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,0))}
.bl-mark svg{position:relative;z-index:1;width:50%;height:50%;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}
.bl-meter{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px 12px;padding:14px 22px;box-shadow:0 -1px 0 var(--line)}
.bl-meter-l{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--ink)}
.bl-meter-ic{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 14%,var(--card,#fff));color:var(--coral)}
.bl-meter-ic.good{background:#dcfce7;color:#15803d}
.bl-meter-ic svg{width:13px;height:13px}
.bl-meter-v{justify-self:end;font-size:13.5px;font-weight:600;color:var(--mut);font-variant-numeric:tabular-nums}
.bl-bar{grid-column:1/-1;height:6px;border-radius:999px;background:var(--f);overflow:hidden}
.bl-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffa68a,var(--coral))}
.bl-sum-row{display:flex;align-items:center;gap:14px;padding:16px 22px;box-shadow:0 -1px 0 var(--line)}
.bl-row-ic{width:36px;height:36px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--f);color:var(--mut)}
.bl-row-ic.shop{background:#e3f1ec;color:#008060}
.bl-sum-rt{flex:1;min-width:0}
.bl-sum-rt b{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:14.5px;font-weight:650;color:var(--ink)}
.bl-sum-rt p{margin:2px 0 0;font-size:13px;line-height:1.5;color:var(--mut)}
.bl-sum-rt p.bad{color:#b42318}
.bl-sum-rt small{display:block;margin-top:4px;font-size:12.5px;line-height:1.5;color:var(--soft)}
.bl-sum-rt small b{display:inline;color:var(--ink)}
.bl-sum-hint{margin:0!important;padding:0 22px 16px}
.bl-sum-note{display:block!important;margin:0 22px 16px!important}
@media (max-width:640px){.bl-sum-top,.bl-sum-row{flex-wrap:wrap}.bl-sum-row>.ak-btn,.bl-sum-row>.ak-tag,.bl-sum-row>span:last-child{margin-left:50px}.bl-sum-top>.ak-btn,.bl-sum-top>.ak-tag{width:100%}}
.ak-btn.bl-shopify{background:#008060;color:#fff;box-shadow:none}
.ak-btn.bl-shopify:hover{background:#008060;filter:brightness(.95)}
.ak-btn.bl-buy{background:linear-gradient(180deg,#ff8a5c,#ff5a2c);color:#fff;box-shadow:0 8px 20px -10px #ff5a2c,inset 0 1px 0 rgba(255,255,255,.3)}
.ak-btn.bl-buy:hover{background:linear-gradient(180deg,#ff8a5c,#ff5a2c);filter:brightness(1.04)}
.bl-plans-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:8px 0 14px;scroll-margin-top:90px}
.bl-plans-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.bl-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:14px}
@media (max-width:900px){.bl-plans{grid-template-columns:minmax(0,1fr)}}
.bl-plan{display:flex;flex-direction:column;padding:22px;border-radius:26px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}
.bl-plan:hover{transform:translateY(-3px);box-shadow:0 0 0 1px rgba(0,0,0,.07),0 22px 44px -24px rgba(16,24,40,.28)}
.bl-plan.best{box-shadow:0 0 0 2px #ff6a4d,0 22px 44px -24px rgba(255,106,77,.7)}
.bl-plan.current{box-shadow:0 0 0 2px #22c55e}
.bl-plan-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:16px}
.bl-plan-h h3{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1.1;color:var(--ink)}
.bl-best{height:24px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;background:#ff6a4d;color:#fff;font-size:11.5px;font-weight:700}
.bl-plan-desc{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.bl-price{display:flex;align-items:baseline;gap:6px;margin:20px 0 0}
.bl-price b{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:44px;font-weight:700;letter-spacing:-.05em;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}
.bl-price span{font-size:14px;color:var(--mut)}
.bl-price-sub{margin:8px 0 18px;font-size:12.5px;color:var(--soft)}
.bl-sub{width:100%;height:50px;border:none;border-radius:999px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:transform .15s,filter .2s,box-shadow .2s}
.bl-sub::before{display:none!important}
.bl-sub:active{transform:scale(.98)}
.bl-sub:disabled{cursor:default}
.bl-sub.feedback{background:var(--card,#fff);color:var(--ink);box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.12),0 2px 6px -2px rgba(16,24,40,.12);--shine-c:139,92,246}
.bl-sub.feedback::after{opacity:.4}
.bl-sub.omnichannel{color:#fff;background:linear-gradient(180deg,#5b8cff,#2b59ff);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 12px 26px -12px #2b59ff}
.bl-sub.everything{color:#fff;background:linear-gradient(180deg,#ff8f5e,#ff5a2c);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 12px 26px -12px #ff5a2c}
.bl-sub:not(.on):hover{filter:brightness(1.05)}
.bl-sub.on{background:var(--f);color:var(--mut)}
.bl-rule{display:flex;align-items:center;gap:6px;margin:20px 0 14px;color:#d4d4d8}
.bl-rule i{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--line) 30%,var(--line) 70%,transparent)}
.bl-incl-l{margin:0 0 10px;font-size:12.5px;font-weight:650;color:var(--soft)}
.bl-feats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.bl-feats li{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.4;color:var(--ink)}
.bl-feats li span{flex-shrink:0;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--pc) 14%,var(--card,#fff));color:var(--pc)}
.bl-feats li span svg{width:12px;height:12px}
.bl-ent{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.5fr) auto;align-items:center;gap:20px;margin-bottom:14px;padding:22px;border-radius:26px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.bl-ent.current{box-shadow:0 0 0 2px #22c55e}
.bl-ent-l{display:flex;align-items:flex-start;gap:14px;min-width:0}
.bl-ent h3{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.bl-ent-l p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.bl-ent-f{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;margin:0;padding:0;list-style:none}
.bl-ent-f li{display:flex;align-items:center;gap:7px;font-size:13.5px;color:var(--ink)}
.bl-ent-f svg{flex-shrink:0;color:#16a34a}
.ak-btn.bl-ent-go{height:46px;padding:0 24px}
@media (max-width:980px){.bl-ent{grid-template-columns:minmax(0,1fr)}.ak-btn.bl-ent-go{justify-self:start}}
@media (max-width:480px){.bl-ent-f{grid-template-columns:minmax(0,1fr)}}
.bl-foot{display:flex;align-items:center;justify-content:center;gap:7px;margin:4px 0 28px;font-size:13px;color:var(--soft)}
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
