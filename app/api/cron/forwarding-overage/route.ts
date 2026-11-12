import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { logJobRun } from '@/lib/job-log'
import { companyLimit } from '@/lib/plan'
import { colvyStripe } from '@/lib/tax-invoices'
import { alertColvyTeamOncePerDay } from '@/lib/billing-alert'
import { forwardingPeriod, forwardingUsage, previousPeriod, cleanAllowance } from '@/lib/forwarding-usage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily (Vercel Cron): last month's forwarded call minutes past each plan's
// allowance (lib/forwarding-usage) go on the business's next Colvy invoice, as
// a Stripe invoice item on its plan subscription. Once per business per month:
// the month is claimed in platform_settings under
// `fwd-overage:<companyId>:<YYYY-MM>` before Stripe is called (and the claim
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

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (period: string) => { const [y, m] = period.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
const recordKey = (companyId: string, period: string) => `fwd-overage:${companyId}:${period}`

export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const t0 = Date.now(), startedAt = new Date().toISOString()
  const db: any = admin()
  const period = previousPeriod(forwardingPeriod())
  const charged: any[] = [], owed: string[] = [], failed: string[] = []
  let considered = 0
  try {
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

    const stripe = await colvyStripe()
    for (const companyId of ids) {
      considered++
      const key = recordKey(companyId, period)
      const { data: done } = await db.from('platform_settings').select('value').eq('key', key).maybeSingle()
      if (done) {
        if (done.value?.state === 'charging') failed.push(`${companyId}: the ${period} charge was started but not confirmed; check Stripe for an invoice item with this key (${key})`)
        continue
      }
      const included = cleanAllowance(await companyLimit(db, companyId, 'forwardMinutes'))
      if (!Number.isFinite(included)) continue // moved to a plan that isn't metered
      const u = await forwardingUsage(db, companyId, included, period)
      const base = { period, minutes: u.minutes, calls: u.calls, included, over: u.over, cents: u.overCents, rateCents: u.rateCents }
      if (u.over <= 0 || u.overCents <= 0) {
        await db.from('platform_settings').upsert({ key, value: { ...base, charged: false }, updated_by: 'forwarding-overage', updated_at: new Date().toISOString() }, { onConflict: 'key' })
        continue
      }
      // The plan's Stripe customer and subscription are on the owner's subscriptions row (the Stripe webhook).
      const { data: co } = await db.from('companies').select('name, owner_id').eq('id', companyId).maybeSingle()
      const { data: sub } = co?.owner_id
        ? await db.from('subscriptions').select('stripe_customer_id, stripe_subscription_id, status').eq('user_id', co.owner_id).maybeSingle()
        : { data: null }
      const customer = sub?.stripe_customer_id ? String(sub.stripe_customer_id) : ''
      const subscription = sub?.stripe_subscription_id && sub.status !== 'canceled' ? String(sub.stripe_subscription_id) : ''
      if (!stripe || !customer) { owed.push(`${co?.name || companyId}: ${u.over} min (A$${(u.overCents / 100).toFixed(2)})`); continue }
      const claim = { key, value: { ...base, state: 'charging' }, updated_by: 'forwarding-overage', updated_at: new Date().toISOString() }
      const { error: claimErr } = await db.from('platform_settings').insert(claim)
      if (claimErr) continue // another run claimed it first
      try {
        const item = await stripe.invoiceItems.create({
          customer,
          ...(subscription ? { subscription } : {}),
          amount: u.overCents,
          currency: 'aud',
          description: `Forwarded call minutes, ${monthName(period)}: ${u.over} past the ${included} included, at ${u.rateCents}c a minute`,
          metadata: { colvy_kind: 'forward_overage', company_id: companyId, period, minutes: String(u.minutes), over: String(u.over) },
        }, { idempotencyKey: key })
        await db.from('platform_settings').update({ value: { ...base, state: 'charged', charged: true, invoiceItem: item?.id || null }, updated_at: new Date().toISOString() }).eq('key', key)
        charged.push({ companyId, over: u.over, cents: u.overCents })
      } catch (e: any) {
        await db.from('platform_settings').delete().eq('key', key) // not charged: try again tomorrow
        failed.push(`${co?.name || companyId}: ${e?.message || 'Stripe refused the charge'}`)
      }
    }

    const problems = [...owed, ...failed]
    if (problems.length) {
      await alertColvyTeamOncePerDay(db, {
        key: 'alert:forwarding-overage',
        subject: 'Forwarded minutes couldn’t be charged',
        message: `Extra forwarded call minutes for ${monthName(period)} couldn’t be added to these businesses’ next invoice: ${problems.join('; ')}. ${!stripe ? 'STRIPE_SECRET_KEY isn’t set. ' : ''}It’s tried again every day.`,
      })
    }
  } catch (e: any) {
    await logJobRun({ job: 'forwarding-overage', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
  await logJobRun({ job: 'forwarding-overage', startedAt, durationMs: Date.now() - t0, status: charged.length ? 'success' : 'idle', detail: { period, considered, charged, owed, failed } })
  return NextResponse.json({ ok: true, period, considered, charged: charged.length, owed: owed.length, failed: failed.length })
}
