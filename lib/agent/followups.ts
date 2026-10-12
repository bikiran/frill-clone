// Sales Agent: quotes and leads that went quiet.
//
// Runs from the cart-recovery cron. For businesses that switched the Sales
// Agent on AND turned on "Quotes and leads", within sending hours, it finds:
//   • quotes / unpaid orders sent from chat (an "order" message with a pay
//     link) and Stripe payment requests still pending
//   • leads — a Support Agent run about a product, stock or price — where the
//     customer hasn't been back since
// that are older than the business's "follow up after" days (and no older than
// three weeks), still open (not paid, no reply, not bought since — see
// loadOpportunity), and queues ONE Sales run for each. Never more than one
// follow-up per conversation a month.

import { enqueueRun } from './engine'
import { agentsPaused, getSalesFollowup } from './pilot'
import { loadOpportunity } from './followup-actions'
import { businessTimezone } from './ops-actions'
import { isWithinSendingHours } from '@/lib/campaign-sender'

const DAY = 86_400_000
const OLDEST = 21 * DAY
const PER_COMPANY = 15
const LEADISH = /product|stock|price|pric|availab|quote|recommend/i

export async function queueSalesFollowups(db: any, now = new Date()): Promise<{ companies: number; queued: number }> {
  const out = { companies: 0, queued: 0 }
  const { data: roles } = await db.from('agent_roles').select('company_id').eq('role_key', 'sales').eq('enabled', true).limit(500).then((r: any) => r, () => ({ data: [] }))
  for (const role of roles || []) {
    const companyId = role.company_id
    const cfg = await getSalesFollowup(db, companyId)
    if (!cfg.on) continue
    if ((await agentsPaused(db, companyId)).paused) continue
    if (!isWithinSendingHours(now, await businessTimezone(db, companyId))) continue
    out.companies++
    const dueBefore = new Date(now.getTime() - cfg.after_days * DAY).toISOString()
    const oldest = new Date(now.getTime() - OLDEST).toISOString()
    let queued = 0

    const recentlyFollowed = async (conversationId: string) => {
      const { data } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('role_key', 'sales').eq('conversation_id', conversationId).gte('created_at', new Date(now.getTime() - 30 * DAY).toISOString()).limit(1)
      return !!data?.length
    }
    const queue = async (dedupeKey: string, input: Record<string, any>, contactId: string | null) => {
      if (queued >= PER_COMPANY) return
      const { data: existing } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('dedupe_key', dedupeKey).maybeSingle()
      if (existing || (await recentlyFollowed(input.conversationId))) return
      const opp = await loadOpportunity(db, companyId, input)
      if (!opp || opp.closed) return
      try {
        const { deduped } = await enqueueRun(db, { type: 'event', mode: 'live', companyId, roleKey: 'sales', ref: input.messageId || input.paymentId || input.runId, dedupeKey, conversationId: input.conversationId, contactId, input })
        if (!deduped) { queued++; out.queued++ }
      } catch {}
    }

    // Quotes and unpaid orders sent from chat.
    const { data: quotes } = await db.from('messages').select('id, conversation_id, message_payload, created_at').eq('company_id', companyId).eq('message_type', 'order')
      .lte('created_at', dueBefore).gte('created_at', oldest).limit(60)
    for (const m of quotes || []) {
      const pl = m.message_payload || {}
      if (!pl.pay_link || !(pl.is_quote || pl.draft || ['pending', 'draft', 'on-hold'].includes(String(pl.status)))) continue
      const { data: conv } = await db.from('conversations').select('contact_id').eq('id', m.conversation_id).maybeSingle()
      await queue(`quote:${m.id}`, { kind: 'quote', messageId: m.id, conversationId: m.conversation_id, message: `${pl.is_quote ? 'Quote' : 'Order'} #${pl.order_number || ''} sent ${m.created_at.slice(0, 10)}, not paid yet.` }, conv?.contact_id || null)
    }
    // Stripe payment requests still waiting.
    const { data: pays } = await db.from('chat_payments').select('id, conversation_id, amount_cents, description, created_at').eq('company_id', companyId).eq('status', 'pending')
      .lte('created_at', dueBefore).gte('created_at', oldest).limit(60)
    for (const p of pays || []) {
      if (!p.conversation_id) continue
      const { data: conv } = await db.from('conversations').select('contact_id').eq('id', p.conversation_id).maybeSingle()
      await queue(`payment:${p.id}`, { kind: 'quote', paymentId: p.id, conversationId: p.conversation_id, message: `Payment request of $${(p.amount_cents / 100).toFixed(2)}${p.description ? ` for ${p.description}` : ''}, not paid yet.` }, conv?.contact_id || null)
    }
    // Leads: product, stock or price questions the customer never came back from.
    const { data: asked } = await db.from('agent_runs').select('id, conversation_id, contact_id, intent, input, created_at').eq('company_id', companyId).eq('role_key', 'support').eq('mode', 'live')
      .lte('created_at', dueBefore).gte('created_at', oldest).limit(80)
    const seenConv = new Set<string>()
    for (const r of (asked || []).filter((x: any) => x.conversation_id && LEADISH.test(String(x.intent || '')))) {
      if (seenConv.has(r.conversation_id)) continue
      seenConv.add(r.conversation_id)
      // Since = the last thing said in the conversation; it must be ours (the customer went quiet).
      const { data: last } = await db.from('messages').select('sender_type, is_internal, created_at').eq('conversation_id', r.conversation_id).order('created_at', { ascending: false }).limit(10)
      const lastMsg = (last || []).filter((x: any) => !x.is_internal).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      if (!lastMsg || lastMsg.sender_type === 'visitor' || lastMsg.created_at > dueBefore) continue
      await queue(`lead:${r.conversation_id}:${r.id}`, { kind: 'lead', runId: r.id, conversationId: r.conversation_id, since: lastMsg.created_at, message: String(r.input?.message || 'Asked about a product').slice(0, 600) }, r.contact_id || null)
    }
  }
  return out
}
