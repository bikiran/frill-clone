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
export const PAID_STATUSES = ['active', 'trialing', 'past_due']

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
 * Make a workspace Shopify-billed when it connects a store through the app.
 * App Store rule 1.2.1: a merchant using Colvy through the Shopify app is never
 * charged by Colvy off Shopify, whatever plan they're on. A workspace already
 * paying by card keeps that subscription until they move to a Shopify plan
 * (their Billing page says so and links to cancel it); plans set by the Colvy
 * team (Enterprise, complimentary, suspended) are never overwritten by the
 * sync, but still can't buy anything by card.
 */
export async function adoptShopifyBilling(db: any, companyId: string, integrationId: string): Promise<boolean> {
  const { data: co } = await db.from('companies').select('id, owner_id, plan, is_complimentary, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
  if (!co) return false
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
  await db.from('companies').update({ billing_provider: 'shopify', billing_integration_id: integrationId }).eq('id', companyId)
  return true
}

/**
 * The Shopify store a workspace uses Colvy through, if any: the one it's
 * billed through, else any store connected through the public app and still
 * active.
 * Workspaces connected before the rule above are adopted here on first look.
 */
export async function shopifyBillingStore(db: any, companyId: string | null | undefined): Promise<{ id: string; store_domain: string; store_name?: string | null } | null> {
  if (!companyId) return null
  try {
    const { data: co } = await db.from('companies').select('billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
    if (co?.billing_provider === 'shopify' && co.billing_integration_id) {
      const { data: integ } = await db.from('shopify_integrations').select('id, store_domain, store_name, is_active').eq('id', co.billing_integration_id).maybeSingle()
      if (integ?.is_active) return integ
    }
    // Stores on the privately shared app (app_client_id set) can't be billed
    // through Shopify — custom apps have no Shopify billing — so they don't
    // count. '*' because app_client_id may not exist before migration V422.
    const { data: rows } = await db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('is_active', true)
    const row = (rows || []).find((r: any) => !r.app_client_id)
    const integ = row ? { id: row.id, store_domain: row.store_domain, store_name: row.store_name, is_active: row.is_active } : null
    if (!integ) return co?.billing_provider === 'shopify' ? { id: co.billing_integration_id, store_domain: '' } : null
    if (co?.billing_provider !== 'shopify' || co?.billing_integration_id !== integ.id) await adoptShopifyBilling(db, companyId, integ.id).catch(() => {})
    return integ
  } catch { return null }
}

/**
 * Refuse a card (Stripe) charge for a workspace that uses Colvy through the
 * Shopify app. Returns the response body to send, or null when card billing
 * is fine. `what` names the purchase for the message.
 */
export async function shopifyChargeBlock(db: any, companyId: string | null | undefined, what: 'plan' | 'addon' | 'sms' | 'number' | 'porting'): Promise<{ error: string; shopify: true; planUrl: string | null } | null> {
  const store = await shopifyBillingStore(db, companyId)
  if (!store) return null
  const planUrl = store.store_domain ? planSelectionUrl(store.store_domain) : null
  const error = what === 'plan'
    ? 'This workspace uses Colvy through the Shopify app, so your Colvy plan is billed through Shopify. Choose or change it from Billing → Choose a plan in Shopify.'
    : what === 'addon'
    ? 'This workspace uses Colvy through the Shopify app, so add-ons can’t be bought by card. The Inbox and Everything plans in Shopify already remove Colvy branding.'
    : what === 'sms'
    ? 'This workspace uses Colvy through the Shopify app, so SMS credit is billed through your Shopify plan rather than by card.'
    : `This workspace uses Colvy through the Shopify app, so ${what === 'number' ? 'phone numbers' : 'moving a number'} can’t be paid for by card here. Contact Colvy support and we’ll set it up for you.`
  return { error, shopify: true, planUrl }
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

  const shopGid = await shopGidFor(db, integ)
  const sub = await fetchActiveSubscription(shopGid)
  const billing: Record<string, any> = { ...summarize(sub, opts.hint), checked_at: new Date().toISOString() }
  // Whether SMS credit can be billed through this plan (lib/shopify-usage). Its
  // own query: trouble reading it keeps the last answer and never stops the
  // plan sync.
  const usage = await import('@/lib/shopify-usage')
  if (usage.smsMeterHandle()) {
    try { billing.sms_meter = sub ? await usage.fetchSmsMeter(shopGid) : { metered: false, handle: null, usage: null, checked_at: billing.checked_at } }
    catch { if (integ.billing?.sms_meter) billing.sms_meter = integ.billing.sms_meter }
  }
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
