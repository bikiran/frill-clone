// Forwarded call minutes: how many a business used this month, how many its
// plan includes, and what the rest costs.
//
// A call forwarded to an outside mobile or landline (lib/call-routing) is an
// outbound call on Colvy's Twilio account, so it costs Colvy per minute. Plans
// sold for a business's phone line (the Business number plan) include a set
// number of forwarded minutes a month (PLAN_LIMITS.forwardMinutes); minutes past
// that are charged at FORWARD_MINUTE_PRICE_CENTS each, added to the next invoice
// (app/api/cron/forwarding-overage). Plans without a number (Infinity) aren't
// metered, as before.
//
// Counting: each forwarded call that a person took (calls.forwarded_seconds,
// V399, saved by the Twilio inbound-status route) counts its length rounded up
// to the whole minute, the way Twilio bills each call. Months are calendar
// months in UTC, the same as the SMS allowance (lib/sms-quota smsPeriod).
//
// Env:
//   COLVY_FORWARD_MINUTE_PRICE_CENTS   A$ cents per minute past the allowance,
//                                      GST included (default 20)

const envNum = (v: string | undefined, fallback: number) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** A$ cents (GST included) for each forwarded minute past the plan's allowance. */
export const FORWARD_MINUTE_PRICE_CENTS = Math.round(envNum(process.env.COLVY_FORWARD_MINUTE_PRICE_CENTS, 20))

/** The calendar month (UTC) as 'YYYY-MM', like lib/sms-quota smsPeriod. */
export const forwardingPeriod = (d: Date = new Date()) => d.toISOString().slice(0, 7)

/** The month before `period` ('YYYY-MM'). */
export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** A month's bounds as ISO strings: [from, to). */
export function periodBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString(),
  }
}

/** One call's billable minutes: its length rounded up to the whole minute. */
export const billableMinutes = (seconds: number | null | undefined) => {
  const s = Number(seconds) || 0
  return s > 0 ? Math.ceil(s / 60) : 0
}

/** A plan's monthly allowance, cleaned: a whole number, or Infinity (not metered). */
export function cleanAllowance(v: unknown): number {
  if (v === Infinity || v === null || v === undefined || v === '' || v === 'unlimited') return Infinity
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Infinity
}

/** Minutes past the allowance and what they cost, in A$ cents. */
export function overage(minutes: number, included: number, rateCents = FORWARD_MINUTE_PRICE_CENTS): { over: number; cents: number } {
  if (!Number.isFinite(included)) return { over: 0, cents: 0 }
  const over = Math.max(0, minutes - included)
  return { over, cents: over * rateCents }
}

/** Forwarded minutes and calls for a company in a month. */
export async function forwardedMinutes(db: any, companyId: string, period: string = forwardingPeriod()): Promise<{ minutes: number; calls: number }> {
  const { from, to } = periodBounds(period)
  let minutes = 0, calls = 0
  const page = 1000
  for (let start = 0; start < 100_000; start += page) {
    const { data, error } = await db.from('calls').select('forwarded_seconds')
      .eq('company_id', companyId).gte('created_at', from).lt('created_at', to).gt('forwarded_seconds', 0)
      .order('created_at', { ascending: true }).range(start, start + page - 1)
    if (error) throw error
    const rows = data || []
    for (const r of rows) { const m = billableMinutes(r.forwarded_seconds); if (m) { minutes += m; calls++ } }
    if (rows.length < page) break
  }
  return { minutes, calls }
}

export type ForwardingUsage = {
  period: string
  minutes: number
  calls: number
  /** Infinity when the plan doesn't meter forwarding. */
  included: number
  over: number
  overCents: number
  rateCents: number
}

/** This month's (or `period`'s) forwarded minutes against the allowance the company has now. */
export async function forwardingUsage(db: any, companyId: string, included: number, period: string = forwardingPeriod()): Promise<ForwardingUsage> {
  const { minutes, calls } = await forwardedMinutes(db, companyId, period)
  const inc = cleanAllowance(included)
  const { over, cents } = overage(minutes, inc)
  return { period, minutes, calls, included: inc, over, overCents: cents, rateCents: FORWARD_MINUTE_PRICE_CENTS }
}
