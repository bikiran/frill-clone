// Colvy's own billing, for Super Admin → Intelligence → Revenue. Server only.
//
//   subscriptionRow()       a Stripe subscription → a billing_subscriptions row:
//                           what it is (plan, add-on, phone number), its status
//                           and its monthly value in AUD cents after discounts.
//   syncBillingSubscriptions()  copies every Colvy subscription from Stripe
//                           (all statuses) and Shopify App Pricing into
//                           billing_subscriptions (V416). Stripe stays the
//                           source of truth; this mirror is what reports read.
//   recordBillingEvent()    called by the Stripe webhook for Colvy's own
//                           subscription and invoice events: what changed
//                           (started, plan changed, payment failing /
//                           recovered, cancellation scheduled, cancelled),
//                           one row per Stripe event.
//
// Never stores card details or anything a customer typed: ids, amounts,
// statuses and dates only. Connected accounts (a business's own customers
// paying it) are never read.

import { BRANDING_ADDON } from '@/lib/branding-addon'
import { captureServer } from '@/lib/analytics-server'

export type BillingKind = 'plan' | 'addon' | 'number' | 'other'

/** AUD per unit of `currency`. USD uses Colvy's own carrier-cost rate (sms_pricing.fx_rate, AUD→USD). */
export type Fx = (currency: string) => number
export function makeFx(audToUsd: number): Fx {
  const usd = audToUsd > 0 ? 1 / audToUsd : 1 / 0.65
  return (c: string) => {
    const k = String(c || 'aud').toLowerCase()
    return k === 'aud' ? 1 : k === 'usd' ? usd : NaN
  }
}

/** A price per billing period → per month. */
export function monthly(amountCents: number, interval: string | null | undefined, count = 1): number {
  const n = Math.max(1, Number(count) || 1)
  switch (String(interval || 'month').toLowerCase()) {
    case 'year': case 'annual': case 'annually': return amountCents / (12 * n)
    case 'week': return (amountCents * 52) / (12 * n)
    case 'day': return (amountCents * 365) / (12 * n)
    case 'every_30_days': return amountCents
    default: return amountCents / n
  }
}

const ts = (s: any): string | null => (typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null)

/** A coupon's effect on one period's amount. */
function discounted(cents: number, sub: any): number {
  const coupons = [sub?.discount?.coupon, ...(Array.isArray(sub?.discounts) ? sub.discounts.map((d: any) => (typeof d === 'object' ? d?.coupon : null)) : [])].filter(Boolean)
  let out = cents
  for (const c of coupons) {
    if (c.valid === false) continue
    if (c.percent_off) out = out * (1 - Number(c.percent_off) / 100)
    else if (c.amount_off) out = Math.max(0, out - Number(c.amount_off))
  }
  return out
}

export type Lookup = {
  /** stripe subscription id → { user_id } from the subscriptions table */
  subUser: Map<string, string>
  /** stripe customer id → user_id */
  customerUser: Map<string, string>
  /** owner user id → company id */
  ownerCompany: Map<string, string>
  /** stripe subscription id → company id, for phone numbers */
  numberSub: Map<string, string>
}

export function subscriptionRow(sub: any, look: Lookup, fx: Fx) {
  const meta = sub?.metadata || {}
  const items: any[] = sub?.items?.data || []
  const first = items[0]?.price || items[0]?.plan || {}
  const currency = String(first.currency || sub?.currency || 'aud').toLowerCase()
  const interval = first.recurring?.interval || first.interval || 'month'
  const count = first.recurring?.interval_count || first.interval_count || 1
  const perPeriod = items.reduce((s, it) => s + (Number(it?.price?.unit_amount ?? it?.plan?.amount ?? 0) * (Number(it?.quantity) || 1)), 0)
  const afterDiscount = discounted(perPeriod, sub)
  const rate = fx(currency)
  const mrr = Number.isFinite(rate) ? Math.round(monthly(afterDiscount, interval, count) * rate) : 0
  const customer = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id || null

  const kind: BillingKind = meta.addon === BRANDING_ADDON || meta.tier === BRANDING_ADDON ? 'addon'
    : meta.kind === 'phone_number' || meta.kind === 'ported_number' || look.numberSub.has(sub.id) ? 'number'
    : meta.tier || look.subUser.has(sub.id) ? 'plan' : 'other'
  const userId = meta.userId || look.subUser.get(sub.id) || (customer ? look.customerUser.get(customer) : undefined) || null
  const companyId = meta.companyId || look.numberSub.get(sub.id) || (userId ? look.ownerCompany.get(userId) : undefined) || null

  return {
    id: String(sub.id), provider: 'stripe', company_id: companyId, user_id: userId, customer_id: customer,
    kind, plan: kind === 'plan' ? (meta.tier || null) : kind === 'addon' ? BRANDING_ADDON : kind === 'number' ? (meta.kind || 'phone_number') : null,
    status: String(sub.status || 'unknown'),
    mrr_cents: mrr, amount_cents: Math.round(afterDiscount), currency,
    billing_interval: interval, interval_count: count,
    started_at: ts(sub.start_date) || ts(sub.created), trial_end: ts(sub.trial_end),
    cancel_at_period_end: !!sub.cancel_at_period_end, canceled_at: ts(sub.canceled_at), ended_at: ts(sub.ended_at),
    current_period_end: ts(sub.current_period_end ?? items[0]?.current_period_end),
    synced_at: new Date().toISOString(),
  }
}

/** Counts towards MRR: being paid for (or owed), not a trial or a dead subscription. */
export const PAYING = new Set(['active', 'past_due'])

async function buildLookup(db: any): Promise<Lookup> {
  const look: Lookup = { subUser: new Map(), customerUser: new Map(), ownerCompany: new Map(), numberSub: new Map() }
  const page = async (make: () => any, each: (r: any) => void) => {
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await make().range(from, from + 999)
      if (error || !data?.length) break
      data.forEach(each)
      if (data.length < 1000) break
    }
  }
  await Promise.all([
    page(() => db.from('subscriptions').select('user_id, stripe_subscription_id, stripe_customer_id').order('user_id'), r => {
      if (r.stripe_subscription_id) look.subUser.set(r.stripe_subscription_id, r.user_id)
      if (r.stripe_customer_id) look.customerUser.set(r.stripe_customer_id, r.user_id)
    }),
    page(() => db.from('companies').select('id, owner_id').not('owner_id', 'is', null).order('id'), r => { if (!look.ownerCompany.has(r.owner_id)) look.ownerCompany.set(r.owner_id, r.id) }),
    ...['phone_numbers', 'twilio_integrations', 'telnyx_integrations'].map(t =>
      page(() => db.from(t).select('company_id, stripe_subscription_id').not('stripe_subscription_id', 'is', null).order('company_id'), r => { if (r.stripe_subscription_id && r.company_id) look.numberSub.set(r.stripe_subscription_id, r.company_id) })),
  ])
  return look
}

/** sms_pricing's AUD→USD rate (Colvy's own figure for carrier costs). */
export async function audToUsd(db: any): Promise<number> {
  try {
    const { resolveSmsPricing } = await import('@/lib/sms-pricing')
    const p = await resolveSmsPricing(db)
    return Number(p?.fx_rate) > 0 ? Number(p.fx_rate) : 0.65
  } catch { return 0.65 }
}

export async function syncBillingSubscriptions(db: any): Promise<{ ok: boolean; stripe: number; shopify: number; skipped?: string; error?: string }> {
  const fx = makeFx(await audToUsd(db))
  const rows: any[] = []
  let stripeCount = 0
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any })
      const look = await buildLookup(db)
      let startingAfter: string | undefined
      for (let i = 0; i < 100; i++) {
        const page: any = await stripe.subscriptions.list({ status: 'all', limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) } as any)
        for (const sub of page.data) { rows.push(subscriptionRow(sub, look, fx)); stripeCount++ }
        if (!page.has_more || !page.data.length) break
        startingAfter = page.data[page.data.length - 1].id
      }
    } catch (e: any) { return { ok: false, stripe: 0, shopify: 0, error: `stripe: ${e?.message || e}` } }
  }

  // Shopify App Pricing: the plan Shopify bills (shopify_integrations.billing,
  // kept by lib/shopify-billing), for workspaces Shopify bills.
  let shopifyCount = 0
  try {
    const { data: cos } = await db.from('companies').select('id, owner_id, billing_integration_id').eq('billing_provider', 'shopify').not('billing_integration_id', 'is', null).limit(5000)
    const ids = (cos || []).map((c: any) => c.billing_integration_id)
    if (ids.length) {
      const { data: integ } = await db.from('shopify_integrations').select('id, company_id, is_active, uninstalled_at, billing, created_at').in('id', ids)
      for (const x of integ || []) {
        const b = x.billing || {}
        const co = (cos || []).find((c: any) => c.billing_integration_id === x.id)
        const amount = Math.round(Number(b.amount || 0) * 100)
        const rate = fx(b.currency || 'usd')
        const annual = String(b.billing_period || '').toUpperCase() === 'ANNUAL'
        const live = x.is_active !== false && !x.uninstalled_at && !!b.plan && b.plan !== 'free' && amount > 0
        const trialing = b.trial_ends_at && Date.parse(b.trial_ends_at) > Date.now()
        rows.push({
          id: `shopify:${x.id}`, provider: 'shopify', company_id: co?.id || x.company_id, user_id: co?.owner_id || null, customer_id: null,
          kind: 'plan', plan: b.plan || null,
          status: !live ? 'canceled' : trialing ? 'trialing' : 'active',
          mrr_cents: live && Number.isFinite(rate) ? Math.round(monthly(amount, annual ? 'year' : 'month') * rate) : 0,
          amount_cents: amount, currency: String(b.currency || 'usd').toLowerCase(),
          billing_interval: annual ? 'year' : 'month', interval_count: 1,
          started_at: x.created_at || null, trial_end: b.trial_ends_at || null,
          cancel_at_period_end: !!b.cancel_at_end, canceled_at: null, ended_at: x.uninstalled_at || null,
          current_period_end: b.period_end || null, synced_at: new Date().toISOString(),
        })
        shopifyCount++
      }
    }
  } catch { /* Shopify billing is optional */ }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('billing_subscriptions').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) return { ok: false, stripe: stripeCount, shopify: shopifyCount, error: error.message }
  }
  return { ok: true, stripe: stripeCount, shopify: shopifyCount, ...(process.env.STRIPE_SECRET_KEY?.startsWith('sk_') ? {} : { skipped: 'STRIPE_SECRET_KEY not set' }) }
}

// ── Webhook events ───────────────────────────────────────────────────────────

const HANDLED = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed'])

/** What a Stripe event means for billing, or null when it's not worth a row (renewals, unrelated changes). */
export function classifyEvent(event: any, mrrOf: (sub: any) => number): { kind: string; before: number | null; after: number | null; amount?: number | null } | null {
  const obj = event?.data?.object || {}
  const prev = event?.data?.previous_attributes || {}
  switch (event?.type) {
    case 'customer.subscription.created':
      return { kind: obj.status === 'trialing' ? 'trial_started' : 'started', before: 0, after: obj.status === 'trialing' ? 0 : mrrOf(obj) }
    case 'customer.subscription.deleted':
      return { kind: 'canceled', before: mrrOf(obj), after: 0 }
    case 'invoice.payment_failed':
      return { kind: 'payment_failed', before: null, after: null, amount: Number(obj.amount_due || 0) }
    case 'customer.subscription.updated': {
      const after = mrrOf(obj)
      if ('status' in prev && prev.status !== obj.status) {
        if (obj.status === 'past_due' || obj.status === 'unpaid') return { kind: 'payment_failing', before: after, after }
        if (prev.status === 'past_due' || prev.status === 'unpaid') return { kind: 'payment_recovered', before: after, after }
        if (prev.status === 'trialing' && obj.status === 'active') return { kind: 'trial_converted', before: 0, after }
      }
      if (prev.items || 'quantity' in prev || 'discount' in prev || 'discounts' in prev) {
        const before = prev.items ? mrrOf({ ...obj, items: prev.items, discount: prev.discount ?? obj.discount, discounts: prev.discounts ?? obj.discounts }) : null
        if (before == null || before !== after) return { kind: 'plan_changed', before, after }
      }
      if ('cancel_at_period_end' in prev && prev.cancel_at_period_end !== obj.cancel_at_period_end) {
        return { kind: obj.cancel_at_period_end ? 'cancel_scheduled' : 'cancel_withdrawn', before: after, after }
      }
      return null
    }
  }
  return null
}

/**
 * Record a Colvy billing event from the Stripe webhook. Best effort: never
 * throws, never slows the webhook much (two small queries). Before V416 runs
 * it does nothing.
 */
export async function recordBillingEvent(db: any, event: any): Promise<void> {
  try {
    if (!event?.id || event.account || !HANDLED.has(event.type)) return
    const obj = event.data?.object || {}
    const subId = event.type === 'invoice.payment_failed' ? (typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id) : obj.id
    if (event.type === 'invoice.payment_failed' && !subId) return
    const fx = makeFx(await audToUsd(db))
    const look: Lookup = { subUser: new Map(), customerUser: new Map(), ownerCompany: new Map(), numberSub: new Map() }
    // The subscription row the webhook already keeps tells whose it is.
    if (subId) {
      const { data: s } = await db.from('subscriptions').select('user_id').eq('stripe_subscription_id', subId).maybeSingle()
      if (s?.user_id) {
        look.subUser.set(subId, s.user_id)
        const { data: co } = await db.from('companies').select('id').eq('owner_id', s.user_id).limit(1)
        if (co?.[0]) look.ownerCompany.set(s.user_id, co[0].id)
      }
    }
    const mrrOf = (sub: any) => subscriptionRow({ ...sub, id: sub.id || subId }, look, fx).mrr_cents
    const c = classifyEvent(event, mrrOf)
    if (!c) return
    const subject = event.type === 'invoice.payment_failed' ? { id: subId, metadata: obj.subscription_details?.metadata || {}, customer: obj.customer, status: 'past_due', items: { data: [] } } : obj
    const row = subscriptionRow(subject, look, fx)
    const { error } = await db.from('billing_events').upsert({
      event_id: event.id, source: 'stripe', occurred_at: ts(event.created) || new Date().toISOString(),
      company_id: row.company_id, subscription_id: subId || null, kind: c.kind, product: row.kind, plan: row.plan, status: obj.status || null,
      mrr_before_cents: c.before, mrr_after_cents: c.after, amount_cents: c.amount ?? null, currency: obj.currency || row.currency,
    }, { onConflict: 'event_id', ignoreDuplicates: true })
    if (error) return
    if (row.user_id) {
      await captureServer('billing_event', row.user_id, {
        kind: c.kind, product: row.kind, plan: row.plan, mrr_after: c.after, mrr_before: c.before,
        ...(row.company_id ? { company_id: row.company_id, $groups: { company: row.company_id } } : {}),
      }, `billing:${event.id}`)
    }
  } catch (e: any) { console.warn('[billing-events]', e?.message || e) }
}
