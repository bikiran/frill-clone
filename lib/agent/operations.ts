// Phase 8: the Operations Agent's sweep.
//
// Runs from the operations cron (every few hours). For businesses that switched
// the Operations Agent on (and aren't paused), it looks for orders from the
// last 30 days that may be in trouble:
//   • not shipped after the business's usual processing time
//   • shipped, not delivered, and quiet for a while
//   • waiting on an item flagged out of stock for over a day
// Whether an order is really late or stuck is decided in code (live tracking +
// the business's thresholds, lib/order-assess.ts), not by the model — only real
// problems start a run. One run per order per problem (dedupe), never for an
// order a person already has an open task on.

import { enqueueRun } from './engine'
import { agentsPaused } from './pilot'
import { OPS_ORDER_COLS } from './ops-actions'
import { getOrderTracking } from '@/lib/tracking'
import { assessOrder, loadThresholds } from '@/lib/order-assess'
import { isAwaitingPayment } from '@/lib/orders'

const DAY = 86_400_000
const WINDOW_MS = 30 * DAY

export async function queueOpsChecks(db: any, now = new Date(), opts: { checks?: number; queue?: number } = {}): Promise<{ companies: number; checked: number; queued: number }> {
  const maxChecks = opts.checks ?? 15, maxQueue = opts.queue ?? 10
  const out = { companies: 0, checked: 0, queued: 0 }
  const { data: roles } = await db.from('agent_roles').select('company_id').eq('role_key', 'operations').eq('enabled', true).limit(500).then((r: any) => r, () => ({ data: [] }))
  for (const role of roles || []) {
    const companyId = role.company_id
    if ((await agentsPaused(db, companyId)).paused) continue
    out.companies++
    let queued = 0
    const th = await loadThresholds(db, companyId)
    const since = new Date(now.getTime() - WINDOW_MS).toISOString()
    const age = (iso: string | null | undefined) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : 0)

    const enqueue = async (dedupeKey: string, order: any, input: Record<string, any>) => {
      const { data: existing } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('dedupe_key', dedupeKey).maybeSingle()
      if (existing) return
      try {
        const { deduped } = await enqueueRun(db, { type: 'event', mode: 'live', companyId, roleKey: 'operations', ref: order.id, dedupeKey, conversationId: order.conversation_id || null, contactId: order.contact_id || null, input })
        if (!deduped) { queued++; out.queued++ }
      } catch {}
    }

    // A person already on it? Leave it with them.
    const busy = async (orderIds: string[]) => {
      if (!orderIds.length) return new Set<string>()
      const { data } = await db.from('conversation_tasks').select('order_id').eq('company_id', companyId).eq('done', false).in('order_id', orderIds)
      return new Set<string>((data || []).map((t: any) => t.order_id))
    }

    // ── Orders that may be late or stuck
    const { data: open } = await db.from('orders').select(OPS_ORDER_COLS).eq('company_id', companyId)
      .in('status', ['awaiting_shipment', 'packed', 'shipped']).is('delivered_at', null).gte('order_date', since).limit(300)
    const candidates = (open || []).filter((o: any) => {
      if (o.sales_channel === 'pos') return false
      const shipped = o.status === 'shipped' || !!o.shipped_at
      if (!shipped) return !isAwaitingPayment(o) && age(o.order_date) > th.processing_days
      return age(o.shipped_at || o.order_date) > Math.min(th.stale_days, th.transit_days)
    })
    const taken = await busy(candidates.map((o: any) => o.id))
    // Least recently checked first, so every order gets its turn.
    const queue = candidates.filter((o: any) => !taken.has(o.id))
      .sort((a: any, b: any) => String(a.metadata?.ops_checked_at || '').localeCompare(String(b.metadata?.ops_checked_at || '')) || String(a.order_date).localeCompare(String(b.order_date)))
      .slice(0, maxChecks)
    for (const o of queue) {
      if (queued >= maxQueue) break
      let tracking: any
      try { tracking = await getOrderTracking(db, companyId, o, { live: true, save: true }) } catch { continue }
      out.checked++
      await db.from('orders').update({ metadata: { ...(o.metadata || {}), ops_checked_at: now.toISOString() } }).eq('id', o.id).eq('company_id', companyId)
      const a = assessOrder(tracking, th, now.getTime())
      if (a.verdict === 'normal') continue
      const issue = tracking.stage === 'exception' ? 'carrier' : tracking.stage === 'processing' ? 'unshipped' : 'transit'
      await enqueue(`ops:order:${o.id}:${issue}`, o, {
        kind: 'order', orderId: o.id, orderNumber: o.order_number, issue, verdict: a.verdict, reasons: a.reasons,
        message: `Order #${o.order_number} — ${a.reasons[0] || 'needs a look'}`,
      })
    }

    // ── Orders waiting on an out-of-stock item
    if (queued < maxQueue) {
      const { data: alerts } = await db.from('order_stock_alerts').select('id, order_id, order_number, product_name, sku, quantity, updated_at')
        .eq('company_id', companyId).eq('status', 'pending').lte('updated_at', new Date(now.getTime() - DAY).toISOString()).gte('updated_at', since)
        .order('updated_at', { ascending: true }).limit(50)
      const held = await busy(Array.from(new Set((alerts || []).map((x: any) => x.order_id))))
      for (const al of alerts || []) {
        if (queued >= maxQueue) break
        if (held.has(al.order_id)) continue
        const { data: order } = await db.from('orders').select('id, order_number, status, conversation_id, contact_id').eq('company_id', companyId).eq('id', al.order_id).maybeSingle()
        if (!order || ['shipped', 'cancelled', 'refunded'].includes(String(order.status))) continue
        await enqueue(`ops:stock:${al.id}`, order, {
          kind: 'stock', orderId: order.id, orderNumber: order.order_number || al.order_number, alertId: al.id, product: al.product_name,
          message: `Order #${order.order_number || al.order_number} is waiting on ${al.product_name || 'an item'} (out of stock)`,
        })
      }
    }
  }
  return out
}
