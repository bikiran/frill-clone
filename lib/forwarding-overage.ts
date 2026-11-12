// Last month's call minutes (forwarded, and made from Colvy) past each plan's allowance
// (lib/forwarding-usage) go on the business's next Colvy invoice, as a Stripe
// invoice item on its plan subscription. Run daily by
// app/api/cron/forwarding-overage.
//
// Once per business per month: the month is claimed in platform_settings under
// `fwd-overage:<companyId>:<YYYY-MM>` before Stripe is called (and the claim is
// removed again if Stripe refuses, so it's retried), and the Stripe call
// carries the same key as its idempotency key. A claim left half-way (the run
// died between the two) is never charged again by itself: the Colvy team is
// told to check it. Running daily (not only on the 1st) means a day Stripe or
// the database was down is caught up the next day.
//
// Metered: companies on the Business number plan (`phone`), plus any company a
// super admin gave a forwarded-minutes allowance (company_entitlements
// limits.forwardMinutes). Inbox and up aren't metered. A business that changed
// plan since isn't charged for last month's extra minutes (in its favour).
//
// No Stripe key, customer or subscription: nothing is charged, the month is
// left unrecorded (so it's tried again tomorrow), and the Colvy team gets one
// alert a day listing who's owed.

import { companyLimit } from './plan'
import { cleanAllowance, forwardingUsage } from './forwarding-usage'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (period: string) => { const [y, m] = period.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
export const overageKey = (companyId: string, period: string) => `fwd-overage:${companyId}:${period}`

export type OverageDeps = {
  /** A Stripe client (only invoiceItems.create is used), or null when Stripe isn't set up. */
  stripe: any | null
  /** The once-a-day Colvy team alert (lib/billing-alert alertColvyTeamOncePerDay). */
  alert: (db: any, a: { key: string; subject: string; message: string }) => Promise<unknown>
  /** The company's forwarded-minutes allowance now; defaults to lib/plan companyLimit. */
  limitOf?: (db: any, companyId: string) => Promise<unknown>
}

export type OverageRun = {
  period: string
  considered: number
  charged: { companyId: string; over: number; cents: number; invoiceItem: string | null }[]
  owed: string[]
  failed: string[]
}

export async function chargeForwardingOverage(db: any, period: string, deps: OverageDeps): Promise<OverageRun> {
  const run: OverageRun = { period, considered: 0, charged: [], owed: [], failed: [] }
  const limitOf = deps.limitOf || ((d: any, id: string) => companyLimit(d, id, 'forwardMinutes'))

  // Who's metered: the Business number plan, and anyone given an allowance by hand.
  const ids = new Set<string>()
  const { data: onPlan } = await db.from('companies').select('id').eq('plan', 'phone')
  for (const c of onPlan || []) ids.add(c.id)
  try {
    const { data: ents } = await db.from('company_entitlements').select('company_id, limits')
    for (const e of ents || []) {
      const v = e?.limits?.forwardMinutes
      if (v !== undefined && v !== null && Number.isFinite(cleanAllowance(v))) ids.add(e.company_id)
    }
  } catch {}

  const now = () => new Date().toISOString()
  for (const companyId of ids) {
    run.considered++
    const key = overageKey(companyId, period)
    const { data: done } = await db.from('platform_settings').select('value').eq('key', key).maybeSingle()
    if (done) {
      if (done.value?.state === 'charging') run.failed.push(`${companyId}: the ${period} charge was started but not confirmed; check Stripe for an invoice item with the idempotency key ${key}`)
      continue
    }
    const included = cleanAllowance(await limitOf(db, companyId))
    if (!Number.isFinite(included)) continue // now on a plan that isn't metered
    const u = await forwardingUsage(db, companyId, included, period)
    const base = { period, minutes: u.minutes, calls: u.calls, included, over: u.over, cents: u.overCents, rateCents: u.rateCents }
    if (u.over <= 0 || u.overCents <= 0) {
      await db.from('platform_settings').upsert({ key, value: { ...base, state: 'nothing', charged: false }, updated_by: 'forwarding-overage', updated_at: now() }, { onConflict: 'key' })
      continue
    }
    // The plan's Stripe customer and subscription are on the owner's subscriptions row (the Stripe webhook).
    const { data: co } = await db.from('companies').select('name, owner_id').eq('id', companyId).maybeSingle()
    const { data: sub } = co?.owner_id
      ? await db.from('subscriptions').select('stripe_customer_id, stripe_subscription_id, status').eq('user_id', co.owner_id).maybeSingle()
      : { data: null }
    const customer = sub?.stripe_customer_id ? String(sub.stripe_customer_id) : ''
    const subscription = sub?.stripe_subscription_id && sub.status !== 'canceled' ? String(sub.stripe_subscription_id) : ''
    const who = co?.name || companyId
    if (!deps.stripe || !customer) { run.owed.push(`${who}: ${u.over} min (A$${(u.overCents / 100).toFixed(2)})`); continue }
    const { error: claimErr } = await db.from('platform_settings').insert({ key, value: { ...base, state: 'charging' }, updated_by: 'forwarding-overage', updated_at: now() })
    if (claimErr) continue // another run claimed it first
    try {
      const item = await deps.stripe.invoiceItems.create({
        customer,
        ...(subscription ? { subscription } : {}),
        amount: u.overCents,
        currency: 'aud',
        description: `Call minutes (forwarded and made from Colvy), ${monthName(period)}: ${u.over} past the ${included} included, at ${u.rateCents}c a minute`,
        metadata: { colvy_kind: 'forward_overage', company_id: companyId, period, minutes: String(u.minutes), over: String(u.over) },
      }, { idempotencyKey: key })
      await db.from('platform_settings').update({ value: { ...base, state: 'charged', charged: true, invoiceItem: item?.id || null }, updated_at: now() }).eq('key', key)
      run.charged.push({ companyId, over: u.over, cents: u.overCents, invoiceItem: item?.id || null })
    } catch (e: any) {
      await db.from('platform_settings').delete().eq('key', key) // not charged: try again tomorrow
      run.failed.push(`${who}: ${e?.message || 'Stripe refused the charge'}`)
    }
  }

  const problems = [...run.owed, ...run.failed]
  if (problems.length) {
    await deps.alert(db, {
      key: 'alert:forwarding-overage',
      subject: 'Call minutes couldn’t be charged',
      message: `Extra call minutes for ${monthName(period)} couldn’t be added to these businesses’ next invoice: ${problems.join('; ')}. ${!deps.stripe ? 'STRIPE_SECRET_KEY isn’t set. ' : ''}It’s tried again every day.`,
    })
  }
  return run
}
