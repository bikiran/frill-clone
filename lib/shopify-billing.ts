// Colvy plans billed through Shopify (Shopify App Pricing).
//
// Shopify's App Store rules: a merchant who uses Colvy through the Shopify app
// pays for Colvy through Shopify, not Stripe. The plans (Free, Feedback, Inbox,
// Everything) are set up in the Partner Dashboard; Shopify hosts the plan page
// and charges the merchant. Colvy only reads what they're subscribed to:
//
//  • A workspace that connects a store through the app while on its trial or
//    the Free plan (and with no Stripe subscription) becomes Shopify-billed
//    (companies.billing_provider = 'shopify'); its Billing page sends people to
//    Shopify's plan page instead of Stripe checkout.
//  • After a merchant picks a plan, Shopify redirects to the plan's welcome
//    link (/api/shopify/billing/return?plan_handle&shop) and Colvy re-reads the
//    subscription from the Partner API. Shopify sends no webhooks for plan
//    changes, so the shopify-sync cron re-checks every few hours too
//    (cancellations, frozen stores).
//  • Uninstalling the app ends the Shopify subscription; the workspace drops to
//    Free and can subscribe with Stripe again.
//
// Env: SHOPIFY_PARTNER_API_TOKEN (Partner Dashboard → Settings → Partner API
// clients, "Manage apps"), SHOPIFY_PARTNER_ORG_ID and SHOPIFY_APP_GID (both from
// the Partner Dashboard URL partners.shopify.com/{org}/apps/{app}).

import { serviceFor } from '@/lib/shopify-sync'

export const PARTNER_API_VERSION = '2026-07'
const orgId = () => process.env.SHOPIFY_PARTNER_ORG_ID || '5242426'
const appGid = () => process.env.SHOPIFY_APP_GID || 'gid://shopify/App/433393926145'
const appHandle = () => process.env.SHOPIFY_APP_HANDLE || 'colvy'
export const partnerApiConfigured = () => !!process.env.SHOPIFY_PARTNER_API_TOKEN

// Shopify's hosted plan page for this store.
export const planSelectionUrl = (shop: string) =>
  `https://admin.shopify.com/store/${String(shop || '').replace(/\.myshopify\.com$/i, '')}/charges/${appHandle()}/pricing_plans`

const RECHECK_MS = 6 * 60 * 60 * 1000
const PAID_STATUSES = ['active', 'trialing', 'past_due']

export type ShopifySubscription = {
  billingPeriod: string | null
  cancelAtEndOfCycle: boolean
  trialEndsAt: string | null
  currentBillingCycle: { startTime: string; endTime: string } | null
  items: { handle: string; description?: string | null; price?: { __typename?: string; amount?: string | number | null; currency?: string | null } | null }[]
}

export class PartnerApiError extends Error {}

export async function fetchActiveSubscription(shopGid: string): Promise<ShopifySubscription | null> {
  const res = await fetch(`https://partners.shopify.com/${orgId()}/api/${PARTNER_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_PARTNER_API_TOKEN || '' },
    body: JSON.stringify({
      query: `query ($appId: ID!, $shopId: ID!) {
        activeSubscription(appId: $appId, shopId: $shopId) {
          billingPeriod cancelAtEndOfCycle trialEndsAt
          currentBillingCycle { startTime endTime }
          items { handle description price { __typename currency ... on FlatRatePrice { amount } } }
        }
      }`,
      variables: { appId: appGid(), shopId: shopGid },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  // Throttled or failing is "don't know", never "no subscription".
  if (!res.ok) throw new PartnerApiError(`Partner API ${res.status}`)
  const body = await res.json().catch(() => null)
  if (!body || body.errors?.length) throw new PartnerApiError(body?.errors?.[0]?.message || 'Partner API error')
  return body.data?.activeSubscription || null
}

// Which Colvy plan a Shopify plan is: by name first (the plan handle Shopify
// derives from the display name), else by price.
const BY_PRICE: Record<string, string> = { 39: 'feedback', 348: 'feedback', 179: 'omnichannel', 1788: 'omnichannel', 259: 'everything', 2508: 'everything' }
export function colvyPlanFor(handles: (string | null | undefined)[], amount?: number | null): string | null {
  for (const raw of handles) {
    const h = String(raw || '').toLowerCase()
    if (!h) continue
    if (h.includes('everything')) return 'everything'
    if (h.includes('inbox') || h.includes('omnichannel')) return 'omnichannel'
    if (h.includes('feedback')) return 'feedback'
    if (h.includes('free')) return 'free'
  }
  const n = Number(amount)
  if (Number.isFinite(n) && n > 0) return BY_PRICE[String(Math.round(n))] || null
  return null
}

export function summarize(sub: ShopifySubscription | null, hint?: string | null) {
  if (!sub) return { plan: null, handle: null }
  const item = sub.items?.[0]
  const amount = item?.price?.amount != null ? Number(item.price.amount) : null
  return {
    plan: colvyPlanFor([item?.handle, hint], amount),
    handle: item?.handle || hint || null,
    name: item?.description || null,
    amount, currency: item?.price?.currency || null,
    billing_period: sub.billingPeriod || null,
    trial_ends_at: sub.trialEndsAt || null,
    period_end: sub.currentBillingCycle?.endTime || null,
    cancel_at_end: !!sub.cancelAtEndOfCycle,
  }
}

async function shopGidFor(db: any, integ: any): Promise<string> {
  if (integ.shop_gid) return integ.shop_gid
  const svc: any = await serviceFor(db, integ)
  const { data } = await svc.gql(`query ShopId { shop { id } }`)
  const gid = data?.shop?.id
  if (!gid) throw new Error('Could not read the store id from Shopify')
  await db.from('shopify_integrations').update({ shop_gid: gid }).eq('id', integ.id)
  return gid
}

// Plans no Shopify subscription should overwrite.
const keepsOwnPlan = (co: any) => !!co?.is_complimentary || co?.plan === 'enterprise' || co?.plan === 'suspended'

/**
 * Make a workspace Shopify-billed when it connects a store through the app —
 * only while it's on its trial or Free with no Stripe subscription, so a
 * workspace already paying Colvy is never billed twice.
 */
export async function adoptShopifyBilling(db: any, companyId: string, integrationId: string): Promise<boolean> {
  const { data: co } = await db.from('companies').select('id, owner_id, plan, is_complimentary, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
  if (!co || keepsOwnPlan(co)) return false
  if (co.billing_provider === 'shopify') {
    // Re-point at the new store if the old one is gone.
    if (co.billing_integration_id !== integrationId) {
      const { data: cur } = co.billing_integration_id
        ? await db.from('shopify_integrations').select('id, is_active').eq('id', co.billing_integration_id).maybeSingle()
        : { data: null }
      if (!cur?.is_active) await db.from('companies').update({ billing_integration_id: integrationId }).eq('id', companyId)
    }
    return true
  }
  if (!['trial', 'free'].includes(String(co.plan || 'free'))) return false
  if (co.owner_id) {
    const { data: subs } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('user_id', co.owner_id).limit(1)
    const s = subs?.[0]
    if (s?.stripe_subscription_id && PAID_STATUSES.includes(String(s.status))) return false
  }
  await db.from('companies').update({ billing_provider: 'shopify', billing_integration_id: integrationId }).eq('id', companyId)
  return true
}

/**
 * Re-read a Shopify-billed workspace's subscription and apply it to its plan.
 * Returns the stored billing summary; throws on Partner API trouble (nothing
 * is changed then).
 */
export async function syncShopifyBilling(db: any, companyId: string, opts: { hint?: string | null } = {}) {
  const { data: co } = await db.from('companies').select('id, plan, is_complimentary, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
  if (!co || co.billing_provider !== 'shopify' || !co.billing_integration_id) return null
  const { data: integ } = await db.from('shopify_integrations').select('*').eq('id', co.billing_integration_id).maybeSingle()
  if (!integ?.is_active || !partnerApiConfigured()) return integ?.billing || null

  const sub = await fetchActiveSubscription(await shopGidFor(db, integ))
  const billing = { ...summarize(sub, opts.hint), checked_at: new Date().toISOString() }
  await db.from('shopify_integrations').update({ billing, billing_checked_at: billing.checked_at }).eq('id', integ.id)

  if (!keepsOwnPlan(co)) {
    let next: string | null = null
    if (billing.plan) next = billing.plan
    // Had a Shopify plan and it's gone (cancelled, frozen, expired) → Free.
    // Never subscribed yet → leave the trial or Free plan alone.
    else if (!sub && integ.billing?.plan && integ.billing.plan !== 'free') next = 'free'
    if (next && next !== co.plan) {
      await db.from('companies').update({ plan: next, trial_ends_at: null, plan_changed_at: new Date().toISOString() }).eq('id', companyId)
    }
  }
  return billing
}

// The cron's safety net: plan changes outside a redirect (cancellations,
// frozen stores) only show up by asking.
export async function syncDueShopifyBilling(db: any, limit = 20) {
  if (!partnerApiConfigured()) return { checked: 0 }
  const { data: cos } = await db.from('companies').select('id, billing_integration_id').eq('billing_provider', 'shopify').not('billing_integration_id', 'is', null).limit(500)
  const ids = (cos || []).map((c: any) => c.billing_integration_id)
  if (!ids.length) return { checked: 0 }
  const { data: integs } = await db.from('shopify_integrations').select('id, billing_checked_at').in('id', ids)
  const fresh = new Set((integs || []).filter((i: any) => i.billing_checked_at && Date.now() - new Date(i.billing_checked_at).getTime() < RECHECK_MS).map((i: any) => i.id))
  let checked = 0, failed = 0
  for (const c of cos || []) {
    if (checked + failed >= limit) break
    if (fresh.has(c.billing_integration_id)) continue
    try { await syncShopifyBilling(db, c.id); checked++ } catch { failed++ }
    await new Promise(r => setTimeout(r, 300))  // Partner API: 4 requests/second
  }
  return { checked, failed }
}

// The app was uninstalled: Shopify ends the subscription. The workspace drops
// to Free (if its plan came from Shopify) and can pay with Stripe again.
export async function onShopifyUninstalled(db: any, integ: any) {
  const { data: co } = await db.from('companies').select('id, plan, is_complimentary, billing_provider, billing_integration_id').eq('id', integ.company_id).maybeSingle()
  if (!co || co.billing_provider !== 'shopify' || co.billing_integration_id !== integ.id) return
  const patch: any = { billing_provider: null, billing_integration_id: null }
  if (!keepsOwnPlan(co) && integ.billing?.plan && integ.billing.plan !== 'free') {
    Object.assign(patch, { plan: 'free', trial_ends_at: null, plan_changed_at: new Date().toISOString() })
  }
  await db.from('companies').update(patch).eq('id', co.id)
  await db.from('shopify_integrations').update({ billing: null, billing_checked_at: null }).eq('id', integ.id)
}

export const needsRecheck = (integ: any, maxAgeMs: number) =>
  !integ?.billing_checked_at || Date.now() - new Date(integ.billing_checked_at).getTime() > maxAgeMs
