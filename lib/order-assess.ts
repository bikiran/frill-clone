// Is this order's situation normal, or does a person need to look?
//
// Decided in code, not by the model: the agent explains the result to the
// customer, but whether an order is late, stuck or in trouble comes from these
// rules and the business's own thresholds (business_memory kind 'rule',
// key 'order_status_thresholds': { processing_days, transit_days, stale_days }).

import type { OrderTracking } from './tracking'

export type Thresholds = { processing_days: number; transit_days: number; stale_days: number }
export const DEFAULT_THRESHOLDS: Thresholds = { processing_days: 3, transit_days: 8, stale_days: 4 }

export type Assessment = {
  verdict: 'normal' | 'needs_attention' | 'escalate'
  reasons: string[]
  facts: { daysSinceOrder: number | null; daysSinceShipped: number | null; daysSinceLastEvent: number | null }
}

const days = (from: string | null | undefined, now: number) => {
  if (!from) return null
  const t = new Date(from).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null
}

export async function loadThresholds(db: any, companyId: string): Promise<Thresholds> {
  try {
    const { data } = await db.from('business_memory').select('content').eq('company_id', companyId).eq('kind', 'rule').eq('key', 'order_status_thresholds').eq('status', 'active').maybeSingle()
    const c = data?.content || {}
    const n = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
    return { processing_days: n(c.processing_days, DEFAULT_THRESHOLDS.processing_days), transit_days: n(c.transit_days, DEFAULT_THRESHOLDS.transit_days), stale_days: n(c.stale_days, DEFAULT_THRESHOLDS.stale_days) }
  } catch { return DEFAULT_THRESHOLDS }
}

export function assessOrder(t: OrderTracking, th: Thresholds = DEFAULT_THRESHOLDS, now = Date.now()): Assessment {
  const shippedAt = t.shipments.map(s => s.shippedAt).filter(Boolean).sort()[0] || null
  const lastEventAt = t.shipments.map(s => s.lastEvent?.at).filter(Boolean).sort().reverse()[0] || null
  const facts = { daysSinceOrder: days(t.placedAt, now), daysSinceShipped: days(shippedAt, now), daysSinceLastEvent: days(lastEventAt, now) }
  const reasons: string[] = []
  let verdict: Assessment['verdict'] = 'normal'
  const escalate = (r: string) => { verdict = 'escalate'; reasons.push(r) }
  const attention = (r: string) => { if (verdict === 'normal') verdict = 'needs_attention'; reasons.push(r) }

  switch (t.stage) {
    case 'cancelled': escalate('The order was cancelled — a person should explain what happened.'); break
    case 'refunded': escalate('The order was refunded — a person should confirm the details.'); break
    case 'on_hold': escalate('The order is on hold — it needs a person to sort out.'); break
    case 'exception': escalate(`The carrier reported a problem${t.shipments.find(s => s.status === 'exception')?.statusText ? `: ${t.shipments.find(s => s.status === 'exception')!.statusText}` : ''}.`); break
    case 'processing':
      if (facts.daysSinceOrder != null && facts.daysSinceOrder > th.processing_days) attention(`Not shipped yet after ${facts.daysSinceOrder} days (usually within ${th.processing_days}).`)
      break
    case 'shipped': case 'in_transit': case 'out_for_delivery':
      if (facts.daysSinceShipped != null && facts.daysSinceShipped > th.transit_days) attention(`In transit for ${facts.daysSinceShipped} days (usually within ${th.transit_days}).`)
      if (facts.daysSinceLastEvent != null && facts.daysSinceLastEvent > th.stale_days) attention(`Tracking hasn’t updated for ${facts.daysSinceLastEvent} days.`)
      if (t.stage === 'shipped' && !t.shipments.some(s => s.trackingNumber)) attention('Marked shipped but there is no tracking number on file.')
      // A label made days ago that the carrier has never scanned.
      if (t.shipments.length && t.shipments.every(s => s.status === 'label_created') && facts.daysSinceShipped != null && facts.daysSinceShipped > th.stale_days)
        attention(`Label made ${facts.daysSinceShipped} days ago but the carrier hasn’t scanned it yet.`)
      break
    case 'delivered':
      reasons.push('The carrier says it was delivered. If the customer says it hasn’t arrived, escalate.')
      break
    default:
      attention('Couldn’t work out where this order is.')
  }
  return { verdict, reasons, facts }
}
