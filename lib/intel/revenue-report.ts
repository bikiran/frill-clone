// Super Admin → Intelligence → Revenue (and costs). Reads V416's tables,
// filled by the hourly intel job from Stripe and Shopify, plus tax invoices.
// Every figure is computed from those rows; formulas are named on the page.
// Days are UTC, money AUD cents.

import { BAND_LABEL } from '@/lib/intel/health'
import { PLAN_NAMES, normalizePlan } from '@/lib/plan'
import { costRates } from '@/lib/intel/revenue-job'
import { utc } from '@/lib/intel/business-report'

const DAY = 86_400_000

async function all<T = any>(make: () => any, max = 100_000): Promise<{ rows: T[]; missing: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) {
      if (/^(42P01|PGRST205|42703|PGRST204)$/.test(String(error.code || '')) || /does not exist|schema cache/i.test(String(error.message || ''))) return { rows, missing: true }
      throw error
    }
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { rows, missing: false }
}

const planLabel = (p: string | null) => (p ? PLAN_NAMES[normalizePlan(p)] && normalizePlan(p) !== 'free' ? PLAN_NAMES[normalizePlan(p)] : p : 'Unknown')
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0)

export async function revenueReport(db: any, p: { from: Date; to: Date; prevFrom: Date; prevTo: Date }) {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const chartFrom = new Date(Math.min(p.from.getTime(), Date.now() - 30 * DAY))
  const [days, subs, events, costsNow] = await Promise.all([
    all<any>(() => db.from('revenue_daily').select('*').gte('day', dayKey(new Date(Math.min(chartFrom.getTime(), p.prevFrom.getTime()) - DAY))).order('day')),
    all<any>(() => db.from('billing_subscriptions').select('id, provider, company_id, kind, plan, status, mrr_cents, amount_cents, currency, billing_interval, started_at, trial_end, cancel_at_period_end, canceled_at, ended_at, current_period_end').order('id')),
    all<any>(() => db.from('billing_events').select('occurred_at, company_id, kind, product, plan, mrr_before_cents, mrr_after_cents, amount_cents, currency').gte('occurred_at', p.from.toISOString()).lt('occurred_at', p.to.toISOString()).order('occurred_at', { ascending: false }), 500),
    all<any>(() => db.from('tenant_cost_monthly').select('*').eq('month', new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10)).order('company_id')),
  ])
  if (days.missing || subs.missing) return { migrated: false, stripe: !!process.env.STRIPE_SECRET_KEY }
  const rows = days.rows
  const latest = rows[rows.length - 1] || null
  if (!latest) return { migrated: true, ran: false, stripe: !!process.env.STRIPE_SECRET_KEY }

  const at = (d: Date) => [...rows].reverse().find(r => r.day <= dayKey(d)) || null
  const startRow = at(new Date(p.from.getTime() - 1)) || rows.find(r => r.day >= dayKey(p.from)) || null
  const prevStartRow = at(new Date(p.prevFrom.getTime() - 1))
  const within = (a: Date, b: Date) => rows.filter(r => r.day >= dayKey(a) && r.day < dayKey(new Date(b.getTime() + (b.getTime() % DAY ? DAY : 0))))
  const period = within(p.from, p.to)
  const prev = within(p.prevFrom, p.prevTo)
  const mv = (xs: any[]) => ({
    new: sumBy(xs, r => r.new_cents), newCount: sumBy(xs, r => r.new_count), expansion: sumBy(xs, r => r.expansion_cents),
    reactivation: sumBy(xs, r => r.reactivation_cents), contraction: sumBy(xs, r => r.contraction_cents),
    churned: sumBy(xs, r => r.churned_cents), churnedCount: sumBy(xs, r => r.churned_count),
    collected: sumBy(xs, r => r.collected_cents), refunded: sumBy(xs, r => r.refunded_cents),
  })
  const m = mv(period), mp = mv(prev)
  const startMrr = Number(startRow?.mrr_cents || 0), startPaying = Number(startRow?.paying || 0)
  const nrr = startMrr > 0 ? (startMrr + m.expansion - m.contraction - m.churned) / startMrr : null

  // Trailing 90 days for LTV: monthly logo churn = churned / average paying / 3.
  const last90 = rows.filter(r => r.day >= dayKey(new Date(Date.now() - 90 * DAY)))
  const churn90 = sumBy(last90, r => r.churned_count)
  const avgPaying90 = last90.length ? sumBy(last90, r => r.paying) / last90.length : 0
  const monthlyChurn = avgPaying90 > 0 ? churn90 / avgPaying90 / 3 : null
  const arpa = latest.paying > 0 ? latest.mrr_cents / latest.paying : null
  const ltv = arpa != null && monthlyChurn && churn90 >= 1 && latest.paying >= 5 ? arpa / monthlyChurn : null

  // Companies and names.
  const ids = [...new Set([...subs.rows.map(r => r.company_id), ...events.rows.map(r => r.company_id), ...costsNow.rows.map(r => r.company_id)].filter(Boolean))]
  const names = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('companies').select('id, name, slug, created_at, is_demo').in('id', ids.slice(i, i + 200))
    for (const c of data || []) names.set(c.id, c)
  }
  const nameOf = (id: string | null) => (id ? names.get(id)?.name || names.get(id)?.slug || 'Unnamed' : 'Not linked to a workspace')

  // Now, from the mirror.
  const paying = subs.rows.filter(s => ['active', 'past_due'].includes(s.status) && s.kind !== 'other' && s.mrr_cents > 0)
  const mrrByCo = new Map<string, number>()
  for (const s of paying) if (s.company_id) mrrByCo.set(s.company_id, (mrrByCo.get(s.company_id) || 0) + s.mrr_cents)
  const byPlan = new Map<string, { key: string; mrr: number; subs: number }>()
  for (const s of paying.filter(s => s.kind === 'plan')) {
    const k = planLabel(s.plan) + (s.provider === 'shopify' ? ' (Shopify)' : '')
    const e = byPlan.get(k) || { key: k, mrr: 0, subs: 0 }; e.mrr += s.mrr_cents; e.subs++; byPlan.set(k, e)
  }

  // Acquisition channel of paying businesses.
  const { rows: acq } = await all<any>(() => db.from('company_acquisition').select('company_id, channel').order('company_id'))
  const chanOf = new Map(acq.map(a => [a.company_id, a.channel]))
  const byChannel = new Map<string, { key: string; mrr: number; paying: number }>()
  for (const [id, v] of mrrByCo) {
    const k = chanOf.get(id) || '(unknown)'
    const e = byChannel.get(k) || { key: k, mrr: 0, paying: 0 }; e.mrr += v; e.paying++; byChannel.set(k, e)
  }

  // Signup-month cohorts (last 12 months): how many pay now and for how much.
  const { rows: cos } = await all<any>(() => db.from('companies').select('id, created_at, is_demo').gte('created_at', new Date(Date.now() - 365 * DAY).toISOString()).order('id'))
  const { rows: subscribedMs } = await all<any>(() => db.from('company_milestones').select('company_id').eq('milestone', 'subscribed').order('company_id'))
  const everPaid = new Set(subscribedMs.map(r => r.company_id))
  const cohorts = new Map<string, { month: string; workspaces: number; everPaid: number; payingNow: number; mrr: number }>()
  for (const c of cos.filter(c => !c.is_demo)) {
    const t = utc(c.created_at); if (!Number.isFinite(t)) continue
    const k = new Date(t).toISOString().slice(0, 7)
    const e = cohorts.get(k) || { month: k, workspaces: 0, everPaid: 0, payingNow: 0, mrr: 0 }
    e.workspaces++; if (everPaid.has(c.id)) e.everPaid++
    const mrr = mrrByCo.get(c.id) || 0; if (mrr > 0) { e.payingNow++; e.mrr += mrr }
    cohorts.set(k, e)
  }

  // Trial conversion: workspaces 14–104 days old that have ever paid.
  const trialPool = cos.filter(c => !c.is_demo && Date.now() - utc(c.created_at) >= 14 * DAY && Date.now() - utc(c.created_at) <= 104 * DAY)
  const trialConversion = trialPool.length ? trialPool.filter(c => everPaid.has(c.id)).length / trialPool.length : null

  // Latest health band per business, for the top customers list.
  const { data: hDay } = await db.from('company_health_daily').select('day').order('day', { ascending: false }).limit(1)
  const bandOf = new Map<string, string>()
  if (hDay?.[0]?.day && mrrByCo.size) {
    const { data: hs } = await db.from('company_health_daily').select('company_id, band').eq('day', hDay[0].day).in('company_id', [...mrrByCo.keys()].slice(0, 1000))
    for (const h of hs || []) bandOf.set(h.company_id, BAND_LABEL[h.band as keyof typeof BAND_LABEL] || h.band)
  }

  const sinceOf = (id: string) => subs.rows.filter(s => s.company_id === id && s.started_at).map(s => s.started_at).sort()[0] || null
  const top = [...mrrByCo].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, mrr]) => ({
    id, name: nameOf(id), mrr, plan: planLabel(paying.find(s => s.company_id === id && s.kind === 'plan')?.plan || null), since: sinceOf(id), health: bandOf.get(id) || null,
  }))
  const atRisk = subs.rows.filter(s => s.status === 'past_due' || s.status === 'unpaid' || (['active', 'past_due'].includes(s.status) && s.cancel_at_period_end))
    .map(s => ({ id: s.company_id, name: nameOf(s.company_id), product: s.kind, plan: planLabel(s.plan), mrr: s.mrr_cents, why: s.status === 'past_due' || s.status === 'unpaid' ? 'Payment failing' : 'Cancels at period end', periodEnd: s.current_period_end }))
    .sort((a, b) => b.mrr - a.mrr)

  // Movements in buckets: daily for ≤ 31 days, else weekly.
  const span = (p.to.getTime() - p.from.getTime()) / DAY
  const bucketOf = (d: string) => {
    if (span <= 31) return d
    const t = Date.parse(`${d}T00:00:00Z`); const wd = (new Date(t).getUTCDay() + 6) % 7
    return new Date(t - wd * DAY).toISOString().slice(0, 10)
  }
  const buckets = new Map<string, any>()
  for (const r of period) {
    const k = bucketOf(r.day)
    const e = buckets.get(k) || { bucket: k, new: 0, expansion: 0, reactivation: 0, contraction: 0, churned: 0 }
    e.new += r.new_cents; e.expansion += r.expansion_cents; e.reactivation += r.reactivation_cents; e.contraction += r.contraction_cents; e.churned += r.churned_cents
    buckets.set(k, e)
  }

  // Costs this month.
  const c = costsNow.rows
  const rates = costRates()
  const costRows = c.map(r => ({
    id: r.company_id, name: nameOf(r.company_id), mrr: mrrByCo.get(r.company_id) || 0, collected: Number(r.collected_cents || 0),
    cost: Number(r.total_cost_cents || 0), ai: Number(r.ai_cost_cents || 0), sms: Number(r.sms_cost_cents || 0), smsParts: Number(r.sms_parts || 0),
    callMinutes: Number(r.call_minutes || 0), numbers: Number(r.numbers || 0),
  })).sort((a, b) => b.cost - a.cost)

  const series = rows.filter(r => r.day >= dayKey(chartFrom)).map(r => ({ day: r.day, mrr: Number(r.mrr_cents), paying: Number(r.paying), collected: Number(r.collected_cents), source: r.source }))

  return {
    migrated: true, ran: true, stripe: !!process.env.STRIPE_SECRET_KEY,
    asOf: latest.updated_at, latestDay: latest.day,
    kpis: {
      mrr: Number(latest.mrr_cents), arr: Number(latest.mrr_cents) * 12, startMrr, prevStartMrr: Number(prevStartRow?.mrr_cents || 0),
      paying: Number(latest.paying), startPaying, arpa, trialing: Number(latest.trialing), trialConversion,
      netNew: m.new + m.expansion + m.reactivation - m.contraction - m.churned,
      netNewPrev: mp.new + mp.expansion + mp.reactivation - mp.contraction - mp.churned,
      revenueChurn: startMrr > 0 ? m.churned / startMrr : null, logoChurn: startPaying > 0 ? m.churnedCount / startPaying : null,
      nrr, ltv, monthlyChurn,
      collected: m.collected, collectedPrev: mp.collected, refunded: m.refunded,
      pastDue: Number(latest.past_due), pastDueCents: Number(latest.past_due_cents), cancelling: Number(latest.cancelling), cancellingCents: Number(latest.cancelling_cents),
    },
    movement: m,
    buckets: [...buckets.values()],
    bucketSize: span <= 31 ? 'day' : 'week',
    series,
    reconstructedUntil: rows.filter(r => r.source === 'reconstructed').map(r => r.day).pop() || null,
    byProduct: [
      { key: 'Plans', mrr: Number(latest.plan_cents) }, { key: 'Phone numbers', mrr: Number(latest.number_cents) }, { key: 'Add-ons', mrr: Number(latest.addon_cents) },
    ].filter(x => x.mrr > 0),
    shopifyCents: Number(latest.shopify_cents),
    byPlan: [...byPlan.values()].sort((a, b) => b.mrr - a.mrr),
    byChannel: [...byChannel.values()].sort((a, b) => b.mrr - a.mrr),
    cohorts: [...cohorts.values()].sort((a, b) => a.month.localeCompare(b.month)),
    top, atRisk,
    events: events.rows.slice(0, 50).map(e => ({ at: e.occurred_at, name: nameOf(e.company_id), id: e.company_id, kind: e.kind, product: e.product, plan: planLabel(e.plan), before: e.mrr_before_cents, after: e.mrr_after_cents, amount: e.amount_cents })),
    costs: {
      month: new Date().toISOString().slice(0, 7),
      total: sumBy(costRows, r => r.cost), ai: sumBy(costRows, r => r.ai), sms: sumBy(costRows, r => r.sms),
      aiUnpricedTokens: sumBy(c, r => Number(r.ai_unpriced_tokens || 0)),
      smsParts: sumBy(costRows, r => r.smsParts), callMinutes: sumBy(costRows, r => r.callMinutes), numbers: sumBy(costRows, r => r.numbers),
      collected: sumBy(costRows, r => r.collected),
      rates: { voicePerMin: rates.voicePerMin, numberMonthly: rates.numberMonthly },
      rows: costRows.slice(0, 50),
    },
  }
}

export async function systemReport(db: any) {
  const { gatherSystem } = await import('@/lib/intel/system')
  const [sys, alerts] = await Promise.all([
    gatherSystem(db),
    db.from('intel_alerts').select('*').or(`resolved_at.is.null,resolved_at.gte.${new Date(Date.now() - 7 * DAY).toISOString()}`).order('last_seen_at', { ascending: false }).limit(200),
  ])
  const migrated = !alerts.error
  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const list = (alerts.data || []) as any[]
  return {
    migrated,
    ...sys,
    alerts: {
      open: list.filter(a => !a.resolved_at).sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)),
      resolved: list.filter(a => a.resolved_at).slice(0, 30),
    },
  }
}
