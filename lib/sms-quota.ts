// Monthly SMS allowance — entitlement + per-month cap enforcement.
//
// The pricing page includes 3,000 SMS/month on the Inbox and Everything plans
// and none on Free/Feedback. `assertSmsAllowed` is the single gate every send
// passes through (wired into lib/sms-provider's send()), and `recordSmsSent`
// counts a successful send against the current month. Counters live in the
// sms_usage table (see migrations/COLVY_V297_SMS_USAGE.sql).

import { companyHasFeature, companyLimit } from './plan'

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

/** Count a successful send against the current month (update-then-insert). */
export async function recordSmsSent(db: any, companyId: string, n = 1): Promise<void> {
  try {
    const period = smsPeriod()
    const { data: row } = await db.from('sms_usage').select('id, sent')
      .eq('company_id', companyId).eq('period', period).maybeSingle()
    if (row) {
      await db.from('sms_usage').update({ sent: (row.sent || 0) + n, updated_at: new Date().toISOString() }).eq('id', row.id)
    } else {
      await db.from('sms_usage').insert({ company_id: companyId, period, sent: n })
    }
  } catch { /* never block a send on a counter write */ }
}
