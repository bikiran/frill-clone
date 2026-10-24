// Revenue and costs for Super Admin → Intelligence (run by /api/cron/intel).
// Server only.
//
//   1. Sync: billing_subscriptions ← Stripe + Shopify (lib/intel/billing).
//   2. Snapshot: today's MRR for each paying business (company_mrr_daily) and
//      the day's totals (revenue_daily): MRR by product, paying, trials, past
//      due, cancelling, and the movements against the previous snapshot —
//      new, expansion, contraction, churn, reactivation — plus what was
//      actually paid to Colvy that day (tax invoices). Rerunning the same day
//      recounts the same day.
//   3. History, once: days before the first snapshot are rebuilt from each
//      subscription's life in Stripe (start → end, after any trial), at its
//      current price, and marked 'reconstructed'.
//   4. Costs: this month's and last month's cost of running each business
//      (tenant_cost_monthly) from usage Colvy records, at known rates.
//
// Days are UTC. Money is AUD cents.

import { PAYING, audToUsd, makeFx, syncBillingSubscriptions } from '@/lib/intel/billing'
import { estimateCost, getAiSettings } from '@/lib/ai-models'

const DAY = 86_400_000
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)
const startOfDay = (d: string) => Date.parse(`${d}T00:00:00Z`)

async function all<T = any>(make: () => any, max = 200_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

type Sub = { id: string; company_id: string | null; kind: string; plan: string | null; status: string; mrr_cents: number; provider: string; started_at: string | null; trial_end: string | null; canceled_at: string | null; ended_at: string | null; cancel_at_period_end: boolean; synced_at: string }
type CoMrr = { mrr: number; plan: number; addon: number; number: number; planName: string | null; status: string }

/** Per business MRR from the subscriptions as they are now. */
export function currentMrr(subs: Sub[]): Map<string, CoMrr> {
  const m = new Map<string, CoMrr>()
  for (const s of subs) {
    if (!s.company_id || !PAYING.has(s.status) || s.kind === 'other' || !(s.mrr_cents > 0)) continue
    const e = m.get(s.company_id) || { mrr: 0, plan: 0, addon: 0, number: 0, planName: null, status: 'active' }
    e.mrr += s.mrr_cents
    if (s.kind === 'plan') { e.plan += s.mrr_cents; e.planName = e.planName || s.plan }
    else if (s.kind === 'addon') e.addon += s.mrr_cents
    else if (s.kind === 'number') e.number += s.mrr_cents
    if (s.status === 'past_due') e.status = 'past_due'
    m.set(s.company_id, e)
  }
  return m
}

/** When a subscription was being paid for, at its current price (for rebuilding history). */
export function payingWindow(s: Sub): [number, number] | null {
  if (!s.company_id || s.kind === 'other' || !(s.mrr_cents > 0)) return null
  if (['incomplete', 'incomplete_expired'].includes(s.status)) return null
  const start = Math.max(Date.parse(s.started_at || '') || NaN, Date.parse(s.trial_end || '') || 0)
  if (!Number.isFinite(start)) return null
  const endRaw = s.ended_at || (['canceled', 'unpaid'].includes(s.status) ? (s.canceled_at || s.synced_at) : null)
  const end = endRaw ? Date.parse(endRaw) : Infinity
  if (s.status === 'trialing' && !endRaw) return null
  return end > start ? [start, end] : null
}

export type Movement = { new_cents: number; new_count: number; expansion_cents: number; contraction_cents: number; churned_cents: number; churned_count: number; reactivation_cents: number; reactivation_count: number }

/** Movements between two days' per-business MRR. `everPaid(id)` says whether a business paid before (new vs reactivation). */
export function movements(prev: Map<string, number>, cur: Map<string, number>, everPaid: (id: string) => boolean): Movement {
  const m: Movement = { new_cents: 0, new_count: 0, expansion_cents: 0, contraction_cents: 0, churned_cents: 0, churned_count: 0, reactivation_cents: 0, reactivation_count: 0 }
  for (const [id, c] of cur) {
    const p = prev.get(id) || 0
    if (p <= 0 && c > 0) { if (everPaid(id)) { m.reactivation_cents += c; m.reactivation_count++ } else { m.new_cents += c; m.new_count++ } }
    else if (c > p) m.expansion_cents += c - p
    else if (c < p) m.contraction_cents += p - c
  }
  for (const [id, p] of prev) if (p > 0 && !(cur.get(id)! > 0)) { m.churned_cents += p; m.churned_count++ }
  return m
}

async function collectedByDay(db: any, fromIso: string): Promise<{ paid: Map<string, number>; refunded: Map<string, number> }> {
  const paid = new Map<string, number>(), refunded = new Map<string, number>()
  try {
    for (const r of await all<any>(() => db.from('tax_invoices').select('paid_at, amount_paid_cents, currency').gte('paid_at', fromIso).order('paid_at'))) {
      if (!r.paid_at || String(r.currency || 'aud').toLowerCase() !== 'aud') continue
      const d = dayOf(Date.parse(r.paid_at)); paid.set(d, (paid.get(d) || 0) + Number(r.amount_paid_cents || 0))
    }
  } catch { /* before V404 */ }
  try {
    for (const r of await all<any>(() => db.from('tax_credit_notes').select('issued_at, total_cents, currency').gte('issued_at', fromIso).order('issued_at'))) {
      if (!r.issued_at || String(r.currency || 'aud').toLowerCase() !== 'aud') continue
      const d = dayOf(Date.parse(r.issued_at)); refunded.set(d, (refunded.get(d) || 0) + Number(r.total_cents || 0))
    }
  } catch { /* before V406 */ }
  return { paid, refunded }
}

export async function runRevenue(db: any, now = new Date()): Promise<{ ok: boolean; setup?: false; sync?: any; snapshot?: any; reconstructed?: number; costs?: number; error?: string }> {
  // Before V416: nothing to do.
  const probe = await db.from('revenue_daily').select('day').limit(1)
  if (probe.error) return { ok: true, setup: false }

  const sync = await syncBillingSubscriptions(db)
  if (!sync.ok) return { ok: false, sync, error: sync.error }

  const subs = await all<Sub>(() => db.from('billing_subscriptions').select('id, company_id, kind, plan, status, mrr_cents, provider, started_at, trial_end, canceled_at, ended_at, cancel_at_period_end, synced_at').order('id'))
  const today = dayOf(now.getTime())
  const cur = currentMrr(subs)
  const curMrr = new Map([...cur].map(([k, v]) => [k, v.mrr]))
  const windows = subs.map(s => ({ s, w: payingWindow(s) })).filter(x => x.w) as { s: Sub; w: [number, number] }[]
  const mrrOnDay = (t: number) => {
    const m = new Map<string, number>()
    for (const { s, w } of windows) if (w[0] <= t && t < w[1]) m.set(s.company_id!, (m.get(s.company_id!) || 0) + s.mrr_cents)
    return m
  }
  const paidBefore = (id: string, t: number) => windows.some(x => x.s.company_id === id && x.w[1] <= t)

  // ── History, once ──────────────────────────────────────────────────────────
  let reconstructed = 0
  const { data: older } = await db.from('revenue_daily').select('day').lt('day', today).limit(1)
  if (!older?.length && windows.length) {
    const first = Math.max(Math.min(...windows.map(x => x.w[0])), now.getTime() - 730 * DAY)
    const { paid, refunded } = await collectedByDay(db, new Date(first).toISOString())
    const rows: any[] = []
    let prev = mrrOnDay(startOfDay(dayOf(first)) - 1)
    for (let t = startOfDay(dayOf(first)); t < startOfDay(today); t += DAY) {
      const end = t + DAY - 1
      const m = mrrOnDay(end)
      const mv = movements(prev, m, id => paidBefore(id, t))
      const d = dayOf(t)
      let total = 0; for (const v of m.values()) total += v
      rows.push({ day: d, source: 'reconstructed', mrr_cents: total, paying: [...m.values()].filter(v => v > 0).length, ...mv, collected_cents: paid.get(d) || 0, refunded_cents: refunded.get(d) || 0, updated_at: now.toISOString() })
      prev = m
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('revenue_daily').upsert(rows.slice(i, i + 500), { onConflict: 'day', ignoreDuplicates: true })
      if (error) return { ok: false, sync, error: `history: ${error.message}` }
    }
    reconstructed = rows.length
  }

  // ── Today's snapshot ───────────────────────────────────────────────────────
  const { data: prevDay } = await db.from('company_mrr_daily').select('day').lt('day', today).order('day', { ascending: false }).limit(1)
  let prevMap: Map<string, number>
  if (prevDay?.[0]?.day) {
    const rows = await all<any>(() => db.from('company_mrr_daily').select('company_id, mrr_cents').eq('day', prevDay[0].day).order('company_id'))
    prevMap = new Map(rows.map(r => [r.company_id, Number(r.mrr_cents)]))
  } else {
    // First snapshot: compare with the rebuilt end of yesterday.
    prevMap = mrrOnDay(startOfDay(today) - 1)
  }
  // Paid before (a reactivation, not new): an earlier subscription ended, or an
  // earlier snapshot had them paying.
  const snappedBefore = new Set((await all<any>(() => db.from('company_mrr_daily').select('company_id').lt('day', today).gt('mrr_cents', 0).order('company_id'))).map(r => r.company_id))
  const mv = movements(prevMap, curMrr, id => paidBefore(id, startOfDay(today)) || snappedBefore.has(id))

  const { error: delErr } = await db.from('company_mrr_daily').delete().eq('day', today)
  if (delErr) return { ok: false, sync, error: `snapshot: ${delErr.message}` }
  const coRows = [...cur].map(([company_id, v]) => ({ company_id, day: today, mrr_cents: v.mrr, plan_cents: v.plan, addon_cents: v.addon, number_cents: v.number, plan: v.planName, status: v.status }))
  for (let i = 0; i < coRows.length; i += 500) {
    const { error } = await db.from('company_mrr_daily').upsert(coRows.slice(i, i + 500), { onConflict: 'company_id,day' })
    if (error) return { ok: false, sync, error: `snapshot: ${error.message}` }
  }

  const sum = (f: (v: CoMrr) => number) => [...cur.values()].reduce((s, v) => s + f(v), 0)
  const live = subs.filter(s => s.company_id && s.kind !== 'other')
  // Workspaces on Colvy's own free trial right now (not demos, not closed).
  const trialing = await db.from('companies').select('id', { count: 'exact', head: true })
    .eq('plan', 'trial').gt('trial_ends_at', now.toISOString()).is('closed_at', null).or('is_demo.is.null,is_demo.eq.false')
  const { paid, refunded } = await collectedByDay(db, `${today}T00:00:00Z`)
  const snap = {
    day: today, source: 'snapshot',
    mrr_cents: sum(v => v.mrr), plan_cents: sum(v => v.plan), addon_cents: sum(v => v.addon), number_cents: sum(v => v.number),
    shopify_cents: live.filter(s => s.provider === 'shopify' && PAYING.has(s.status)).reduce((s, x) => s + x.mrr_cents, 0),
    paying: cur.size,
    trialing: trialing.count ?? 0,
    past_due: live.filter(s => s.status === 'past_due').length, past_due_cents: live.filter(s => s.status === 'past_due').reduce((s, x) => s + x.mrr_cents, 0),
    cancelling: live.filter(s => PAYING.has(s.status) && s.cancel_at_period_end).length,
    cancelling_cents: live.filter(s => PAYING.has(s.status) && s.cancel_at_period_end).reduce((s, x) => s + x.mrr_cents, 0),
    ...mv,
    collected_cents: paid.get(today) || 0, refunded_cents: refunded.get(today) || 0,
    updated_at: now.toISOString(),
  }
  const { error: snapErr } = await db.from('revenue_daily').upsert(snap, { onConflict: 'day' })
  if (snapErr) return { ok: false, sync, error: `snapshot: ${snapErr.message}` }

  // ── Costs ──────────────────────────────────────────────────────────────────
  let costs = 0
  try { costs = await runTenantCosts(db, now, curMrr) } catch (e: any) { return { ok: false, sync, error: `costs: ${e?.message || e}` } }

  return { ok: true, sync, snapshot: { day: today, mrr_cents: snap.mrr_cents, paying: snap.paying, new: mv.new_count, churned: mv.churned_count }, reconstructed, costs }
}

// ── Costs per business ───────────────────────────────────────────────────────

export const costRates = () => ({
  voicePerMin: Number(process.env.INTEL_VOICE_COST_PER_MIN) > 0 ? Number(process.env.INTEL_VOICE_COST_PER_MIN) : null,
  numberMonthly: Number(process.env.INTEL_NUMBER_COST_MONTHLY) > 0 ? Number(process.env.INTEL_NUMBER_COST_MONTHLY) : null,
})

async function runTenantCosts(db: any, now: Date, mrr: Map<string, number>): Promise<number> {
  const audUsd = await audToUsd(db)
  const fx = makeFx(audUsd)
  let carrier = 0.05
  try { const { resolveSmsPricing } = await import('@/lib/sms-pricing'); carrier = Number((await resolveSmsPricing(db))?.carrier_cost) || 0.05 } catch {}
  const smsPartAud = carrier * fx('usd')
  const rates = costRates()
  const prices = (await getAiSettings(db).catch(() => null))?.prices || {}
  let written = 0
  for (const back of [1, 0]) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const to = back ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : now
    const month = from.toISOString().slice(0, 10)
    const period = month.slice(0, 7)
    const { data: usage, error } = await db.rpc('intel_tenant_usage', { p_from: from.toISOString(), p_to: to.toISOString() })
    if (error) throw new Error(error.message)
    const per = new Map<string, any>()
    const get = (id: string) => { let e = per.get(id); if (!e) per.set(id, (e = { ai_tokens: 0, ai_usd: 0, ai_unpriced: 0, calls: 0, call_seconds: 0, numbers: 0, sms_parts: 0, collected: 0 })); return e }
    for (const u of Array.isArray(usage) ? usage : []) {
      const e = get(u.company_id)
      if (u.kind === 'ai') {
        const tokens = Number(u.a) + Number(u.b), usd = estimateCost(u.key, Number(u.a), Number(u.b), prices)
        e.ai_tokens += tokens
        if (usd == null) e.ai_unpriced += tokens; else e.ai_usd += usd
      }
      else if (u.kind === 'calls') { e.calls += Number(u.a); e.call_seconds += Number(u.b) }
      else if (u.kind === 'numbers' && !back) e.numbers += Number(u.a)
    }
    try {
      const { data: sms } = await db.from('sms_usage').select('company_id, sent').eq('period', period).limit(10000)
      for (const r of sms || []) if (r.company_id) get(r.company_id).sms_parts += Number(r.sent || 0)
    } catch {}
    try {
      for (const r of await all<any>(() => db.from('tax_invoices').select('company_id, amount_paid_cents, currency').gte('paid_at', from.toISOString()).lt('paid_at', to.toISOString()).order('company_id'))) {
        if (r.company_id && String(r.currency || 'aud').toLowerCase() === 'aud') get(r.company_id).collected += Number(r.amount_paid_cents || 0)
      }
    } catch {}
    const rows = [...per].map(([company_id, e]) => {
      const ai = Math.round(e.ai_usd * fx('usd') * 100)
      const sms = Math.round(e.sms_parts * smsPartAud * 100)
      const minutes = Math.round(e.call_seconds / 60)
      const call = rates.voicePerMin != null ? Math.round(minutes * rates.voicePerMin * 100) : null
      const num = rates.numberMonthly != null ? Math.round(e.numbers * rates.numberMonthly * 100) : null
      return {
        company_id, month, ai_tokens: e.ai_tokens, ai_cost_cents: ai, ai_unpriced_tokens: e.ai_unpriced, sms_parts: e.sms_parts, sms_cost_cents: sms,
        calls: e.calls, call_minutes: minutes, call_cost_cents: call, numbers: e.numbers, number_cost_cents: num,
        total_cost_cents: ai + sms + (call || 0) + (num || 0), collected_cents: e.collected, mrr_cents: back ? 0 : mrr.get(company_id) || 0,
        updated_at: now.toISOString(),
      }
    })
    // Businesses that no longer exist can't be written (foreign key); keep the rest.
    const { data: existing } = await db.from('companies').select('id').in('id', rows.map(r => r.company_id).slice(0, 5000))
    const ok = new Set((existing || []).map((c: any) => c.id))
    const keep = rows.filter(r => ok.has(r.company_id))
    for (let i = 0; i < keep.length; i += 500) {
      const { error: upErr } = await db.from('tenant_cost_monthly').upsert(keep.slice(i, i + 500), { onConflict: 'company_id,month' })
      if (upErr) throw new Error(upErr.message)
    }
    written += keep.length
  }
  return written
}
