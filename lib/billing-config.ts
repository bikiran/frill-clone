// Colvy's own Stripe billing (plans and add-ons a workspace buys from Colvy):
// which settings it needs, whether they're there, and what a customer is told
// when they aren't.
//
// Pure: every function takes the environment as an argument, so the super
// admin status card, the checkout route and the tests share one definition.
// Env var NAMES are for the super admin only. A customer only ever sees
// billingUnavailableCopy().

import { COLVY_CONTACT } from '@/lib/colvy-contact'

type Env = Record<string, string | undefined>

export type Billing = 'monthly' | 'annual'

// One Stripe price per plan and billing period, plus the add-on (one price
// for both periods). Legacy tiers fall back to Growth, as before.
const PRICE_ENV: Record<string, Record<Billing, string[]>> = {
  feedback:         { monthly: ['STRIPE_FEEDBACK_MONTHLY_PRICE_ID'], annual: ['STRIPE_FEEDBACK_ANNUAL_PRICE_ID'] },
  omnichannel:      { monthly: ['STRIPE_OMNICHANNEL_MONTHLY_PRICE_ID'], annual: ['STRIPE_OMNICHANNEL_ANNUAL_PRICE_ID'] },
  everything:       { monthly: ['STRIPE_EVERYTHING_MONTHLY_PRICE_ID'], annual: ['STRIPE_EVERYTHING_ANNUAL_PRICE_ID'] },
  branding_removal: { monthly: ['STRIPE_BRANDING_REMOVAL_PRICE_ID'], annual: ['STRIPE_BRANDING_REMOVAL_PRICE_ID'] },
  startup:          { monthly: ['STRIPE_STARTUP_MONTHLY_PRICE_ID'], annual: ['STRIPE_STARTUP_ANNUAL_PRICE_ID'] },
  business:         { monthly: ['STRIPE_BUSINESS_MONTHLY_PRICE_ID'], annual: ['STRIPE_BUSINESS_ANNUAL_PRICE_ID'] },
  growth:           { monthly: ['STRIPE_GROWTH_MONTHLY_PRICE_ID'], annual: ['STRIPE_GROWTH_ANNUAL_PRICE_ID'] },
  pro:              { monthly: ['STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_GROWTH_MONTHLY_PRICE_ID'], annual: ['STRIPE_PRO_ANNUAL_PRICE_ID', 'STRIPE_GROWTH_ANNUAL_PRICE_ID'] },
}

/** A plan or add-on the checkout knows about. */
export const isKnownTier = (tier: string) => Object.prototype.hasOwnProperty.call(PRICE_ENV, String(tier || ''))

const clean = (v: string | undefined) => String(v || '').trim()

export const secretKeyOk = (env: Env) => /^sk_(live|test)_\w+/.test(clean(env.STRIPE_SECRET_KEY))

/** The configured Stripe price for a plan/add-on and period, or '' if none. */
export function priceIdFor(tier: string, billing: string, env: Env): string {
  const names = PRICE_ENV[tier]?.[billing === 'annual' ? 'annual' : 'monthly'] || []
  for (const n of names) { const v = clean(env[n]); if (v) return v }
  return ''
}

/** The env var a plan/add-on's price lives in (the first, preferred name). */
export function priceEnvName(tier: string, billing: string): string {
  return PRICE_ENV[tier]?.[billing === 'annual' ? 'annual' : 'monthly']?.[0] || `STRIPE_${String(tier).toUpperCase()}_${String(billing).toUpperCase()}_PRICE_ID`
}

/**
 * What stops this one purchase from reaching Stripe Checkout (env var names,
 * for the admin alert). Empty when it can go ahead.
 */
export function checkoutBlockers(tier: string, billing: string, env: Env): string[] {
  const out: string[] = []
  if (!secretKeyOk(env)) out.push('STRIPE_SECRET_KEY')
  const price = priceIdFor(tier, billing, env)
  if (!price || !price.startsWith('price_')) out.push(priceEnvName(tier, billing))
  return out
}

export type CheckState = 'ok' | 'missing' | 'invalid' | 'warn'

export type BillingCheck = {
  envVar: string
  label: string
  group: 'keys' | 'plans' | 'addons'
  required: boolean
  state: CheckState
  problem: string
  where: string
}

export type BillingStatus = {
  checks: BillingCheck[]
  /** 'live' / 'test' from the secret key, or null when there's no valid key. */
  mode: 'live' | 'test' | null
  /** Every plan and add-on on the Billing page can reach Stripe Checkout. */
  checkoutReady: boolean
  /** Stripe can tell Colvy a payment went through (so the plan switches on). */
  webhookReady: boolean
  /** Env var names of required settings that are missing or wrong. */
  missing: string[]
}

const WHERE_PRICE = 'Stripe → Product catalogue → the product → Pricing → the price → copy its ID (price_…).'

// The plans and add-on a customer can buy today (app/admin/billing, /upgrade).
const SOLD: { tier: string; name: string; group: 'plans' | 'addons'; periods: Billing[] }[] = [
  { tier: 'feedback', name: 'Feedback', group: 'plans', periods: ['monthly', 'annual'] },
  { tier: 'omnichannel', name: 'Inbox', group: 'plans', periods: ['monthly', 'annual'] },
  { tier: 'everything', name: 'Everything', group: 'plans', periods: ['monthly', 'annual'] },
  { tier: 'branding_removal', name: 'Remove “Powered by Colvy” add-on', group: 'addons', periods: ['monthly'] },
]

/** Everything Colvy's own billing needs, checked. For super admin → Billing. */
export function billingConfigStatus(env: Env): BillingStatus {
  const checks: BillingCheck[] = []
  const sk = clean(env.STRIPE_SECRET_KEY)
  const mode: 'live' | 'test' | null = /^sk_live_/.test(sk) ? 'live' : /^sk_test_/.test(sk) ? 'test' : null
  checks.push({
    envVar: 'STRIPE_SECRET_KEY', label: 'Secret key', group: 'keys', required: true,
    state: !sk ? 'missing' : !mode ? 'invalid' : mode === 'test' ? 'warn' : 'ok',
    problem: !sk ? 'Not set.'
      : !mode ? (sk.startsWith('pk_') ? 'This is the publishable key; use the secret key (sk_live_…).' : sk.startsWith('rk_') ? 'Restricted keys (rk_…) aren’t accepted; use the secret key (sk_live_…).' : 'Must start with sk_live_ (or sk_test_ for testing).')
      : mode === 'test' ? 'Test mode: checkouts work but no real card is charged.' : '',
    where: 'Stripe → Developers → API keys → Secret key → Reveal.',
  })
  const wh = clean(env.STRIPE_WEBHOOK_SECRET)
  checks.push({
    envVar: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', group: 'keys', required: true,
    state: !wh ? 'missing' : wh.startsWith('whsec_') ? 'ok' : 'invalid',
    problem: !wh ? 'Not set: customers would pay but their plan wouldn’t switch on.' : wh.startsWith('whsec_') ? '' : 'Must start with whsec_.',
    where: 'Stripe → Developers → Webhooks → endpoint https://colvy.com/api/stripe/webhook → Signing secret → Reveal.',
  })
  const pk = clean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  checks.push({
    envVar: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', label: 'Publishable key (optional)', group: 'keys', required: false,
    state: !pk ? 'warn' : /^pk_(live|test)_/.test(pk) ? 'ok' : 'invalid',
    problem: !pk ? 'Not needed today: upgrades use Stripe’s hosted checkout.' : /^pk_(live|test)_/.test(pk) ? '' : 'Must start with pk_live_.',
    where: 'Stripe → Developers → API keys → Publishable key.',
  })
  for (const p of SOLD) {
    for (const period of p.periods) {
      const envVar = priceEnvName(p.tier, period)
      const v = priceIdFor(p.tier, period, env)
      const state: CheckState = !v ? 'missing' : v.startsWith('price_') ? 'ok' : 'invalid'
      checks.push({
        envVar,
        label: p.group === 'addons' ? p.name : `${p.name} · ${period}`,
        group: p.group, required: true, state,
        problem: !v ? 'Not set.' : v.startsWith('prod_') ? 'This is a product ID; use the price ID (price_…).' : v.startsWith('price_') ? '' : 'Must start with price_.',
        where: WHERE_PRICE,
      })
    }
  }
  const bad = (c: BillingCheck) => c.required && (c.state === 'missing' || c.state === 'invalid')
  const missing = checks.filter(bad).map(c => c.envVar)
  const checkoutReady = !checks.some(c => bad(c) && c.envVar !== 'STRIPE_WEBHOOK_SECRET')
  return { checks, mode, checkoutReady, webhookReady: !checks.some(c => c.envVar === 'STRIPE_WEBHOOK_SECRET' && bad(c)), missing }
}

/** What a CUSTOMER is told when online upgrades can't start. No env var names. */
export function billingUnavailableCopy(contact: { email: string; phoneDisplay: string } = COLVY_CONTACT) {
  return {
    title: 'Online upgrades aren’t available just yet',
    message: `We’ve let the Colvy team know. Contact us at ${contact.email} or ${contact.phoneDisplay} and we’ll set it up for you.`,
  }
}
