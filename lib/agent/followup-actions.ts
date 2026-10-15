// Sales Agent actions for quotes and leads: read the opportunity this run is
// about, and follow it up once.
//
//   quote — a quote or unpaid order sent from chat (with its pay link), or a
//           Stripe payment request, that's had no reply and isn't paid
//   lead  — a customer who asked about a product, stock or price, went quiet
//           and hasn't ordered since
//
// The follow-up goes into their conversation and reaches them the way they can
// actually be reached days later: by email in the email thread, by text on an
// SMS thread, otherwise SMS (else email) to the number or address on file —
// website chat is long closed by then, and Meta doesn't allow automated
// messages after 24 hours.

import { sendAgentMessage } from './send'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { isWithinSendingHours } from '@/lib/campaign-sender'
import { businessTimezone } from './ops-actions'
import type { ActionContext, ActionDef, JsonSchema, PolicyLimits } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const daysSince = (iso?: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null)
const money = (n: any, cur = 'AUD') => (n != null && n !== '' ? `$${Number(n).toFixed(2)} ${String(cur || 'AUD').toUpperCase()}` : null)

/** What the opportunity is, and whether it's still open. Shared with the sweep and approvals. */
export async function loadOpportunity(db: any, companyId: string, input: any) {
  if (!input?.conversationId) return null
  const { data: conv } = await db.from('conversations').select('id, channel, contact_id, sms_number, subject').eq('company_id', companyId).eq('id', input.conversationId).maybeSingle()
  if (!conv) return null
  let since = input.since || null, what = '', total: string | null = null, link: string | null = null, items: any[] = []
  if (input.kind === 'quote' && input.paymentId) {
    const { data: p } = await db.from('chat_payments').select('id, amount_cents, currency, description, status, checkout_url, created_at').eq('company_id', companyId).eq('id', input.paymentId).maybeSingle()
    if (!p) return null
    since = p.created_at; what = `Payment request${p.description ? ` — ${p.description}` : ''}`; total = money(p.amount_cents / 100, p.currency); link = p.checkout_url || null
    if (p.status !== 'pending') return { conv, kind: 'quote', since, what, total, link, items, closed: `the payment is ${p.status}` }
  } else if (input.kind === 'quote' && input.messageId) {
    const { data: m } = await db.from('messages').select('id, message_payload, created_at').eq('id', input.messageId).maybeSingle()
    const pl = m?.message_payload || {}
    if (!m) return null
    since = m.created_at; what = `${pl.is_quote ? 'Quote' : 'Order'} #${pl.order_number || pl.order_id || ''}`.trim(); total = money(pl.total, pl.currency); link = pl.pay_link || null
    if (pl.order_id != null) {
      const { data: o } = await db.from('orders').select('id, status, payment_status').eq('company_id', companyId).eq('external_order_id', String(pl.order_id)).limit(1)
      const order = o?.[0]
      if (order && (order.payment_status === 'paid' || ['shipped', 'cancelled', 'refunded'].includes(String(order.status)))) {
        return { conv, kind: 'quote', since, what, total, link, items, closed: order.payment_status === 'paid' ? 'it has been paid' : `the order is ${order.status}` }
      }
      if (order) {
        const { data: it } = await db.from('order_items').select('product_name, quantity').eq('order_id', order.id).limit(12)
        items = (it || []).map((i: any) => ({ name: i.product_name, qty: i.quantity || 1 }))
      }
    }
  } else if (input.kind === 'lead') {
    what = 'Asked about a product'
  } else return null

  // Still open? The customer hasn't been back, nobody followed up, and they haven't bought since.
  const { data: later } = await db.from('messages').select('sender_type, is_ai, is_internal, message_type, created_at').eq('conversation_id', conv.id).gt('created_at', since || '1970-01-01').limit(30)
  const after = (later || []).filter((x: any) => !x.is_internal)
  if (after.some((x: any) => x.sender_type === 'visitor')) return { conv, kind: input.kind, since, what, total, link, items, closed: 'the customer has been in touch since' }
  if (after.some((x: any) => x.sender_type === 'agent' && x.message_type !== 'order' && x.message_type !== 'payment')) return { conv, kind: input.kind, since, what, total, link, items, closed: 'someone already followed up' }
  if (conv.contact_id) {
    const { data: bought } = await db.from('orders').select('id').eq('company_id', companyId).eq('contact_id', conv.contact_id).gte('order_date', since || '1970-01-01').eq('payment_status', 'paid').limit(1)
    if (bought?.length) return { conv, kind: input.kind, since, what, total, link, items, closed: 'they have ordered since' }
  }
  return { conv, kind: input.kind, since, what, total, link, items, closed: null as string | null }
}

/** Who to send to, and how. */
async function reach(db: any, companyId: string, conv: any): Promise<{ ok: boolean; why?: string; contact?: any; via?: 'thread' | 'fallback' }> {
  let contact: any = null
  if (conv.contact_id) {
    const { data } = await db.from('contacts').select('id, name, phone, email, is_blocked, unsubscribed_at').eq('company_id', companyId).eq('id', conv.contact_id).maybeSingle()
    contact = data
  }
  if (contact?.is_blocked || contact?.unsubscribed_at) return { ok: false, why: 'the customer opted out' }
  const ch = String(conv.channel || 'chat')
  if (ch === 'email' && contact?.email) return { ok: true, contact, via: 'thread' }
  if (ch === 'sms' && (conv.sms_number || contact?.phone)) return { ok: true, contact, via: 'thread' }
  if (contact?.phone || contact?.email) return { ok: true, contact, via: 'fallback' }
  return { ok: false, why: 'no phone or email on file' }
}

export const getOpportunity: ActionDef = {
  key: 'get_opportunity',
  description: 'The quote, payment request or enquiry you are following up: what it was for, the total, how many days ago, the recent conversation, whether it is still open (not paid, no reply, not ordered since) and whether the customer can be messaged.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx) {
    const input = ctx.scratch.runInput || {}
    const opp = await loadOpportunity(ctx.db, ctx.companyId, { ...input, conversationId: input.conversationId || ctx.conversationId })
    if (!opp) return { ok: false, error: 'This run has nothing to follow up.' }
    ctx.scratch.opp = opp
    const r = await reach(ctx.db, ctx.companyId, opp.conv)
    ctx.scratch.oppOk = !opp.closed && r.ok
    const { data: msgs } = await ctx.db.from('messages').select('sender_type, is_ai, is_internal, content, created_at').eq('conversation_id', opp.conv.id).order('created_at', { ascending: false }).limit(8)
    const recent = (msgs || []).filter((m: any) => !m.is_internal).reverse().map((m: any) => ({ from: m.sender_type === 'visitor' ? 'customer' : m.sender_type === 'agent' ? 'business' : 'system', text: String(m.content || '').slice(0, 400) }))
    return {
      ok: true,
      data: {
        kind: opp.kind, what: opp.what, total: opp.total, items: opp.items, daysAgo: daysSince(opp.since),
        askedAbout: opp.kind === 'lead' ? String(input.message || '').slice(0, 600) : undefined,
        hasPayLink: !!opp.link, firstName: String(r.contact?.name || '').trim().split(/\s+/)[0] || null,
        stillOpen: !opp.closed, ...(opp.closed ? { closedBecause: opp.closed } : {}),
        canMessage: r.ok, ...(r.ok ? { sendsBy: r.via === 'thread' ? String(opp.conv.channel) : 'SMS, else email' } : { whyNot: r.why }),
        recentConversation: recent,
      },
      entityType: 'conversation', entityId: opp.conv.id,
      summary: `${opp.what}${opp.total ? ` · ${opp.total}` : ''}${opp.closed ? ` — ${opp.closed}` : ''}`,
    }
  },
}

const DEAL = /\d{1,2}\s?%|\b(discount|coupon|promo|voucher|free (shipping|delivery|postage)|price match)/i

async function followupOnItsOwn(ctx: ActionContext, args: any, _limits: PolicyLimits): Promise<string | null> {
  if (!ctx.scratch.opp) return 'It didn’t read the quote or enquiry first, so a person approves the message.'
  if (!ctx.scratch.oppOk) return 'It isn’t open any more or the customer can’t be messaged — a person decides.'
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the message.'
  if (DEAL.test(String(args?.text || ''))) return 'The message offers a discount or deal, so a person approves it.'
  if (!isWithinSendingHours(new Date(), await businessTimezone(ctx.db, ctx.companyId))) return 'It’s outside sending hours, so a person sends it later.'
  return null
}

export const sendSalesFollowup: ActionDef = {
  key: 'send_sales_followup',
  description: 'Send the customer your one follow-up about their quote, payment request or enquiry. Plain text, 1–3 short sentences. For a quote with a pay link, put {link} where it should go. Never offer discounts unless the business’s rules say you may.',
  input: obj({
    text: { type: 'string', description: 'The follow-up, with {link} for the pay link if there is one.' },
    knowledge_gap: { type: 'boolean', description: 'Enquiries only: true when the follow-up doesn’t answer what they asked because the business’s knowledge doesn’t cover it (you offer to find out instead).' },
  }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: followupOnItsOwn,
  async run(ctx, args) {
    const input = ctx.scratch.runInput || {}
    return sendFollowup(ctx.db, ctx.companyId, { ...input, conversationId: input.conversationId || ctx.conversationId }, String(args?.text || ''), { runId: ctx.runId })
  },
}

/** Re-check the opportunity, fill {link}, and deliver. Shared with approvals. */
export async function sendFollowup(db: any, companyId: string, input: any, raw: string, o: { runId: string; approvedBy?: { id: string | null; name: string | null } | null }) {
  const body = raw.trim().slice(0, 900)
  if (!body) return { ok: false, error: 'Nothing to send.' }
  const opp = await loadOpportunity(db, companyId, input)
  if (!opp) return { ok: false, error: 'There’s nothing to follow up any more.' }
  if (opp.closed) return { ok: false, error: `Not sent: ${opp.closed}.` }
  const r = await reach(db, companyId, opp.conv)
  if (!r.ok) return { ok: false, error: `Not sent: ${r.why}.` }
  const text = body.includes('{link}') ? body.replace(/\{link\}/g, opp.link || '') : body
  const meta = { agent_run_id: o.runId, agent_name: 'Sales Agent', sales_followup: opp.kind, approved_by: o.approvedBy?.name || null, approved_by_id: o.approvedBy?.id || null }

  if (r.via === 'thread') {
    const s = await sendAgentMessage(db, { companyId, conversationId: opp.conv.id, text, runId: o.runId, approvedBy: o.approvedBy || null, agentName: 'Sales Agent' })
    return s.ok ? { ok: true, data: { sent: true, channel: s.channel }, entityType: 'conversation', entityId: opp.conv.id, summary: `Followed up by ${s.channel}` } : { ok: false, error: s.error }
  }
  // Chat or Meta thread: reach them by SMS, else email, and keep the message on the thread.
  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const business = co?.name || 'us'
  const d = await deliverAutomatedMessage({
    companyId, conversationId: opp.conv.id, text, phone: r.contact?.phone || null, email: r.contact?.email || null,
    preferChannel: r.contact?.phone ? 'sms' : 'email', senderName: business, subject: `Following up from ${business}`,
    origin: (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, ''), force: true, db,
  })
  if (!d.sent) return { ok: false, error: d.error || 'Not delivered.' }
  await db.from('messages').insert({ conversation_id: opp.conv.id, company_id: companyId, sender_type: 'agent', sender_name: business, content: text, message_type: 'text', is_ai: true, is_read: true, delivery_channel: d.channel, metadata: meta })
  await db.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString() }).eq('id', opp.conv.id)
  return { ok: true, data: { sent: true, channel: d.channel }, entityType: 'conversation', entityId: opp.conv.id, summary: `Followed up by ${d.channel}` }
}

/** For approvals: a person approved (or edited) the follow-up. */
export async function sendApprovedSalesFollowup(db: any, companyId: string, run: any, text: string, user: { id: string | null; name: string | null }) {
  const r = await sendFollowup(db, companyId, { ...(run?.input || {}), conversationId: run?.input?.conversationId || run?.conversation_id }, text, { runId: run.id, approvedBy: user })
  return r.ok ? { ok: true, channel: (r as any).data?.channel } : { ok: false, error: r.error }
}
