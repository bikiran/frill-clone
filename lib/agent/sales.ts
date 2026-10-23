// Phase 8: abandoned carts start the Sales Agent.
//
// Runs from the cart-recovery cron. For businesses that switched the Sales
// Agent on (and aren't paused): each cart abandoned a while ago (the cart
// message delay, default an hour), within the last 24 hours and after the
// agent was switched on, gets ONE Sales run — claimed first so it's never
// followed up twice, and only within sending hours. Carts that were bought
// since, or whose customer opted out, are skipped. Colvy's template cart
// message stands down while the Sales Agent is on (lib/cart-recovery.ts).

import { enqueueRun } from './engine'
import { agentsPaused } from './pilot'
import { agentsOnPlan } from './access'
import { cartPrecheck } from '@/lib/cart-recovery'
import { resolveCartRecovery, cartItemsText } from '@/lib/cart-recovery-shared'
import { isWithinSendingHours } from '@/lib/campaign-sender'

const MAX_AGE_MS = 24 * 3600 * 1000

export async function queueCartFollowups(db: any, now = new Date()): Promise<{ companies: number; queued: number; skipped: number }> {
  const out = { companies: 0, queued: 0, skipped: 0 }
  const { data: roles } = await db.from('agent_roles').select('company_id, updated_at').eq('role_key', 'sales').eq('enabled', true).limit(500).then((r: any) => r, () => ({ data: [] }))
  for (const role of roles || []) {
    const companyId = role.company_id
    if ((await agentsPaused(db, companyId)).paused) continue
    if (!(await agentsOnPlan(db, companyId))) continue
    const { data: co } = await db.from('companies').select('order_chat_automation').eq('id', companyId).maybeSingle()
    const s = resolveCartRecovery(co?.order_chat_automation?.cart_recovery)
    if (!isWithinSendingHours(now, s.timezone)) continue
    out.companies++
    const dueBefore = new Date(now.getTime() - s.delay_minutes * 60000).toISOString()
    // Switching the agent on never follows up old carts.
    const floor = Math.max(now.getTime() - MAX_AGE_MS, role.updated_at ? Date.parse(role.updated_at) || 0 : 0)
    const { data: carts } = await db.from('abandoned_carts').select('id, name, email, phone, items, total, currency, cart_url, conversation_id, created_at, updated_at')
      .eq('company_id', companyId).eq('status', 'abandoned').is('recovery_sent_at', null)
      .lte('updated_at', dueBefore).gte('updated_at', new Date(floor).toISOString())
      .order('updated_at', { ascending: true }).limit(25)
    for (const cart of carts || []) {
      const { data: claimed } = await db.from('abandoned_carts').update({ recovery_sent_at: now.toISOString(), recovery_channel: 'agent' })
        .eq('id', cart.id).is('recovery_sent_at', null).eq('status', 'abandoned').select('id')
      if (!claimed?.length) continue
      const pre = await cartPrecheck(db, companyId, cart)
      if (!pre.ok) { await db.from('abandoned_carts').update({ recovery_error: pre.reason, recovery_channel: 'none' }).eq('id', cart.id); out.skipped++; continue }
      try {
        await enqueueRun(db, {
          type: 'event', mode: 'live', companyId, roleKey: 'sales', ref: cart.id, dedupeKey: `cart:${cart.id}`,
          conversationId: cart.conversation_id, contactId: pre.conv?.contact_id || null,
          input: { kind: 'cart', cartId: cart.id, name: cart.name || null, message: `Left ${cartItemsText(cart.items)}${cart.total != null ? ` ($${Number(cart.total).toFixed(2)})` : ''} in their cart.` },
        })
        out.queued++
      } catch { out.skipped++ }
    }
  }
  return out
}
