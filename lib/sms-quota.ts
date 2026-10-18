// Monthly SMS allowance — entitlement + per-month cap enforcement.
//
// Usage is counted in message parts (segments): a 2-part text uses 2.
//
// The pricing page includes 3,000 SMS/month on the Inbox and Everything plans
// and none on Free/Feedback. `assertSmsAllowed` is the single gate every send
// passes through (wired into lib/sms-provider's send()), and `recordSmsSent`
// counts a successful send against the current month. Counters live in the
// sms_usage table (see migrations/COLVY_V297_SMS_USAGE.sql).

import { companyHasFeature, companyLimit } from './plan'
import type { SmsAllowanceSummary } from './sms-allowance'

export { allowanceProblem } from './sms-allowance'
export type { SmsAllowanceSummary } from './sms-allowance'

// Current calendar month as 'YYYY-MM' (UTC).
export function smsPeriod(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7)
}

// Distinguishes a plan/quota block from a carrier failure, so the API layer can
// answer 402 (payment required) rather than a generic 500.
export class SmsQuotaError extends Error {
  reason: 'plan' | 'limit'
  limit: number
  used: number
  constructor(reason: 'plan' | 'limit', message: string, limit = 0, used = 0) {
    super(message)
    this.name = 'SmsQuotaError'
    this.reason = reason
    this.limit = limit
    this.used = used
  }
}

export async function smsUsageThisMonth(db: any, companyId: string): Promise<number> {
  try {
    const { data } = await db.from('sms_usage').select('sent')
      .eq('company_id', companyId).eq('period', smsPeriod()).maybeSingle()
    return data?.sent || 0
  } catch { return 0 }
}

export interface SmsAllowance { allowed: boolean; reason?: 'plan' | 'limit'; limit: number; used: number }

/**
 * Whether this company may send an SMS right now: the plan must include SMS
 * channels, and the monthly allowance must not be used up. Reads the effective
 * plan (honouring trial expiry and per-company overrides).
 */
export async function checkSmsAllowance(db: any, companyId: string): Promise<SmsAllowance> {
  const entitled = await companyHasFeature(db, companyId, 'channels')
  const limitRaw = await companyLimit(db, companyId, 'smsPerMonth')
  const limit = typeof limitRaw === 'number' ? limitRaw : 0
  if (!entitled || limit <= 0) return { allowed: false, reason: 'plan', limit: 0, used: 0 }
  const used = await smsUsageThisMonth(db, companyId)
  if (Number.isFinite(limit) && used >= limit) return { allowed: false, reason: 'limit', limit, used }
  return { allowed: true, limit, used }
}

/** Throws SmsQuotaError when a send is not allowed. */
export async function assertSmsAllowed(db: any, companyId: string): Promise<void> {
  const a = await checkSmsAllowance(db, companyId)
  if (a.allowed) return
  if (a.reason === 'plan') {
    throw new SmsQuotaError('plan', 'SMS is not included in this plan. Upgrade to the Inbox or Everything plan to send text messages.', a.limit, a.used)
  }
  throw new SmsQuotaError('limit', `Monthly SMS allowance reached (${a.limit}). It resets at the start of next month — or upgrade for a higher allowance.`, a.limit, a.used)
}

// Is this the "function doesn't exist (yet)" answer from PostgREST? The
// atomic counters below come with migration V394; before it runs, they fall
// back to read-then-write.
export function isMissingRpc(error: any): boolean {
  const m = String(error?.message || error || '')
  return error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function|function .* does not exist/i.test(m)
}

/**
 * Add `n` parts (positive or negative) to this month's usage, atomically.
 *
 * With `cap`, the increment only happens if the new total stays within it;
 * otherwise nothing is added and `ok` is false. That's how a campaign reserves
 * the parts for a text before sending it, so two batches running at once can't
 * both squeeze under the allowance. Usage counts message PARTS (segments), not
 * messages — a 2-part text uses two of the allowance, as the carrier bills.
 *
 * Uses sms_usage_add() from V394 (one UPDATE … SET sent = sent + n RETURNING);
 * before that runs, it falls back to the old read-then-write.
 */
export async function addSmsUsage(db: any, companyId: string, n: number, cap?: number | null): Promise<{ ok: boolean; used: number | null }> {
  const period = smsPeriod()
  const capped = cap != null && Number.isFinite(cap)
  if (typeof db?.rpc === 'function') {
    try {
      const { data, error } = await db.rpc('sms_usage_add', { p_company: companyId, p_period: period, p_n: n, p_cap: capped ? cap : null })
      if (!error) {
        const used = data == null ? null : Number(Array.isArray(data) ? data[0] : data)
        return { ok: data != null, used: Number.isFinite(used as number) ? used : null }
      }
      if (!isMissingRpc(error)) throw error
    } catch (e) {
      if (!isMissingRpc(e)) {
        // A real failure: refuse a capped reservation (safer than sending past
        // the allowance); never block an uncapped count.
        return { ok: !capped, used: null }
      }
    }
  }
  // Pre-V394 fallback (not atomic).
  try {
    const { data: row } = await db.from('sms_usage').select('id, sent')
      .eq('company_id', companyId).eq('period', period).maybeSingle()
    const cur = Number(row?.sent) || 0
    const next = Math.max(0, cur + n)
    if (capped && n > 0 && next > (cap as number)) return { ok: false, used: cur }
    if (row) {
      await db.from('sms_usage').update({ sent: next, updated_at: new Date().toISOString() }).eq('id', row.id)
    } else {
      await db.from('sms_usage').insert({ company_id: companyId, period, sent: next })
    }
    return { ok: true, used: next }
  } catch {
    return { ok: !capped, used: null }
  }
}

/** Count a successful send against the current month: `n` message parts. */
export async function recordSmsSent(db: any, companyId: string, n = 1): Promise<void> {
  try { await addSmsUsage(db, companyId, Math.max(1, Math.round(n || 1))) }
  catch { /* never block a send on a counter write */ }
}

/** The month's allowance in a JSON-safe shape (Infinity doesn't serialise). */
export async function smsAllowanceSummary(db: any, companyId: string): Promise<SmsAllowanceSummary> {
  const [entitled, limitRaw, used] = await Promise.all([
    companyHasFeature(db, companyId, 'channels'),
    companyLimit(db, companyId, 'smsPerMonth'),
    smsUsageThisMonth(db, companyId),
  ])
  const limit = typeof limitRaw === 'number' ? limitRaw : 0
  if (!entitled || limit <= 0) return { entitled: false, unlimited: false, limit: 0, used, remaining: 0 }
  if (!Number.isFinite(limit)) return { entitled: true, unlimited: true, limit: null, used, remaining: null }
  return { entitled: true, unlimited: false, limit, used, remaining: Math.max(0, limit - used) }
}

