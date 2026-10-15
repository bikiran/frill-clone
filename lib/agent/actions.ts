// The Universal Action Layer.
//
// Agents never touch the database or an integration directly. They request a
// named action; the engine checks it against the role and the policy engine,
// then runs it here. Actions are provider-agnostic: "get_order" doesn't care
// whether the order came from Shopify, WooCommerce or Prexty.
//
// Phase 1 wraps the Colvy AI assistant's proven read tools (same queries the
// staff assistant and the MCP server use) and adds the engine's own actions.
// Later phases add provider-backed actions (check_order_status, book_appointment…).

import { runReadTool, type AssistantContext } from '@/lib/ai-assistant/tools'
import { notifyCompany } from '@/lib/notify'
import type { ActionContext, ActionDef, ActionResult, JsonSchema, PolicyLimits } from './types'
import { AUTO_TOPICS } from './pilot'
import { findCustomerOrders, checkOrderStatus } from './order-actions'
import { getBusinessHours } from './business-actions'
import { getReview, replyToReviewAction } from './review-actions'
import { getComment, replyToCommentAction } from './comment-actions'
import { getCart, sendCartFollowup } from './sales-actions'
import { getException, checkOrderTracking, sendOrderUpdate } from './ops-actions'
import { getOpportunity, sendSalesFollowup } from './followup-actions'
import { listServices, checkAvailability, findMyBookings, bookingLink, rescheduleBookingAction, cancelBookingAction } from './booking-actions'
import { sendAgentMessage } from './send'
import { logUnanswered, isRealQuestion } from '@/lib/ai-unanswered'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

// Read tools borrowed from the assistant. They take an AssistantContext; the
// agent is a system actor, so there's no signed-in user behind it.
function assistantCtx(ctx: ActionContext): AssistantContext {
  return {
    companyId: ctx.companyId, userId: '', userName: ctx.roleName, role: 'viewer',
    companyName: ctx.companyName, siteOrigin: ctx.siteOrigin,
    conversationId: ctx.conversationId, contactId: ctx.contactId,
  }
}

function readTool(key: string, description: string, input: JsonSchema, customerSafe: boolean): ActionDef {
  return {
    key, description, input, category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe,
    async run(ctx, args) {
      const data = await runReadTool(ctx.db, assistantCtx(ctx), key, args)
      if (data?.error) return { ok: false, error: String(data.error), data }
      return { ok: true, data }
    },
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

const getConversation: ActionDef = {
  key: 'get_conversation',
  description: 'The current conversation: channel, linked customer and the latest messages (oldest first).',
  input: obj({ limit: { type: 'integer', description: 'How many recent messages (default 20, max 40).' } }),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    if (!ctx.conversationId) return { ok: true, data: { conversation: null, note: 'This run has no conversation.' } }
    const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 40)
    const [{ data: conv }, { data: msgs }] = await Promise.all([
      ctx.db.from('conversations').select('id, channel, status, contact_id, assigned_name, sms_number, created_at').eq('company_id', ctx.companyId).eq('id', ctx.conversationId).maybeSingle(),
      ctx.db.from('messages').select('sender_type, sender_name, content, is_internal, is_ai, created_at').eq('conversation_id', ctx.conversationId).order('created_at', { ascending: false }).limit(limit),
    ])
    if (!conv) return { ok: false, error: 'Conversation not found' }
    const messages = (msgs || []).reverse().filter((m: any) => !m.is_internal).map((m: any) => ({
      from: m.sender_type === 'visitor' ? 'customer' : m.sender_type === 'agent' ? (m.is_ai ? 'ai' : 'staff') : 'system',
      text: String(m.content || '').slice(0, 1500), at: m.created_at,
    }))
    return { ok: true, data: { conversation: { id: conv.id, channel: conv.channel, status: conv.status, assignedTo: conv.assigned_name || null }, messages } }
  },
}

// ── Knowledge gaps ───────────────────────────────────────────────────────────
// A question the business's knowledge couldn't answer goes on AI Knowledge →
// Unanswered (source 'agent'), so the owner can fill the gap once. At most once
// per run, and only for live runs: a sandbox test isn't a customer asking.

async function logKnowledgeGap(ctx: ActionContext) {
  if (ctx.mode !== 'live' || ctx.scratch.gapLogged) return
  ctx.scratch.gapLogged = true
  // The customer's own words when they read as a question, else what the agent searched for.
  const candidates = [String(ctx.scratch.runInput?.message || ''), ...((ctx.scratch.knowledgeGaps || []) as string[])]
  const text = candidates.find(t => t && isRealQuestion(t))
  if (text) await logUnanswered(ctx.db, ctx.companyId, text, { source: 'agent', conversationId: ctx.conversationId })
}

/** End of a run: every knowledge search came up empty → log the gap. */
export async function flushKnowledgeGaps(ctx: ActionContext) {
  if (ctx.scratch.knowledgeGaps?.length && !ctx.scratch.knowledgeFound) await logKnowledgeGap(ctx)
}

const askKnowledgeBase = readTool('ask_knowledge', 'Search the business’s own knowledge (help articles, facts, files, website). Use before answering any question about policies, products or services.', obj({ question: { type: 'string' } }, ['question']), true)
const askKnowledge: ActionDef = {
  ...askKnowledgeBase,
  async run(ctx, args) {
    const r = await askKnowledgeBase.run(ctx, args)
    // Logged at the end of the run (flushKnowledgeGaps), so a later search that
    // does find the answer means it was never a gap.
    if (r.ok && r.data?.found === false) (ctx.scratch.knowledgeGaps ||= []).push(String(args?.question || '').slice(0, 300))
    if (r.ok && r.data?.found === true) ctx.scratch.knowledgeFound = true
    return r
  },
}

const READS: ActionDef[] = [
  getConversation,
  readTool('get_contact', 'A customer’s saved details by contact id.', obj({ contactId: { type: 'string' } }, ['contactId']), true),
  askKnowledge,
  readTool('check_stock', 'Live stock for a product by name or SKU.', obj({ query: { type: 'string' } }, ['query']), true),
  // Staff-only lookups: they search across ALL customers, so a customer-facing
  // role must not use them in live mode (customer roles use
  // find_customer_orders / check_order_status instead).
  readTool('search_contacts', 'Find customers by name, email or phone (searches all customers — staff use).', obj({ query: { type: 'string' }, limit: { type: 'integer' } }, ['query']), false),
  readTool('search_orders', 'Find orders by number, customer name, email or phone (searches all orders — staff use).', obj({ query: { type: 'string' }, limit: { type: 'integer' } }, ['query']), false),
  readTool('get_order', 'One order’s details, status, items and tracking, by order number or id.', obj({ orderId: { type: 'string', description: 'Order number or id' } }, ['orderId']), false),
  readTool('search_conversations', 'Find recent conversations (staff use).', obj({ query: { type: 'string' }, limit: { type: 'integer' } }), false),
  readTool('search_tasks', 'Find open tasks (staff use).', obj({ query: { type: 'string' }, limit: { type: 'integer' } }), false),
]

// ── Writes ───────────────────────────────────────────────────────────────────

const createTask: ActionDef = {
  key: 'create_task',
  description: 'Create a task for the team (e.g. a follow-up or something that needs a person). Linked to this conversation automatically.',
  input: obj({
    title: { type: 'string', description: 'What needs doing, in one line.' },
    details: { type: 'string', description: 'Context a team member needs.' },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    dueDate: { type: 'string', description: 'YYYY-MM-DD (optional).' },
    orderId: { type: 'string', description: 'Related order id (optional).' },
  }, ['title']),
  category: 'internal_write', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const title = String(args?.title || '').trim().slice(0, 200)
    if (!title) return { ok: false, error: 'A task needs a title.' }
    const details = String(args?.details || '').trim().slice(0, 2000)
    // The outlet the work belongs to: the conversation's outlet, else (an
    // Operations Agent order task) the order's store.
    let locationId: string | null = null
    if (ctx.conversationId) {
      const { data: conv } = await ctx.db.from('conversations').select('assigned_location_id').eq('company_id', ctx.companyId).eq('id', ctx.conversationId).maybeSingle()
      locationId = conv?.assigned_location_id || null
    }
    if (!locationId && ctx.scratch.opsOrder?.id) {
      const { data: o } = await ctx.db.from('orders').select('store_location_id').eq('company_id', ctx.companyId).eq('id', ctx.scratch.opsOrder.id).maybeSingle()
      locationId = o?.store_location_id || null
    }
    const row: any = {
      company_id: ctx.companyId, title, text: details ? `${title}\n\n${details}` : title, done: false, status: 'todo',
      priority: ['low', 'high'].includes(args?.priority) ? args.priority : 'normal',
      due_date: args?.dueDate || null, assignees: [], mentions: [],
      // The Operations Agent's tasks link to the order it's looking at.
      order_id: ctx.scratch.opsOrder?.id || (/^[0-9a-f-]{36}$/i.test(String(args?.orderId || '')) ? args.orderId : null), conversation_id: ctx.conversationId,
      created_by: ctx.roleName, source: 'agent',
      ...(locationId ? { location_id: locationId, location_ids: [locationId] } : {}),
    }
    let { data, error } = await ctx.db.from('conversation_tasks').insert(row).select('id').single()
    // An older database without the outlet columns: still create the task.
    if (error && locationId && /location/i.test(error.message || '')) {
      const { location_id, location_ids, ...rest } = row
      ;({ data, error } = await ctx.db.from('conversation_tasks').insert(rest).select('id').single())
    }
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { taskId: data.id, ...(locationId ? { outletId: locationId } : {}) }, entityType: 'task', entityId: data.id, summary: `Created task “${title}”` }
  },
}

const TOPICS = ['opening_hours', 'order_status', 'stock', 'store_info', 'booking', 'other']

// Before the agent sends a reply on its own: is it a topic the business
// allowed, is it backed by a live lookup made in this run, and is nobody else
// handling the conversation? Otherwise a person approves it.
async function sendOnItsOwn(ctx: ActionContext, args: any, limits: PolicyLimits): Promise<string | null> {
  const topic = TOPICS.includes(args?.topic) ? String(args.topic) : 'other'
  const allowed = Array.isArray(limits.topics) ? limits.topics : []
  if (topic === 'other') return 'Not one of the topics it may answer on its own, so a person approves it.'
  if (!allowed.includes(topic)) return `Replies about ${AUTO_TOPICS[topic]?.label.toLowerCase() || topic} aren’t switched on to send on their own, so a person approves it.`

  const done = ctx.scratch.done || {}
  const grounded =
    topic === 'opening_hours' ? (done.get_business_hours?.places?.length || 0) > 0
      : topic === 'order_status' ? (ctx.scratch.orderVerdicts?.length || 0) > 0 && ctx.scratch.orderVerdicts.every((v: string) => v === 'normal')
        : topic === 'stock' ? (done.check_stock?.products?.length || 0) > 0
          : topic === 'store_info' ? done.ask_knowledge?.found === true
            : topic === 'booking' ? !!(done.check_availability || done.find_my_bookings || done.list_services || done.booking_link)
              : false
  if (!grounded) {
    return topic === 'order_status' && ctx.scratch.orderVerdicts?.length
      ? 'The order needs a look, so a person approves the reply.'
      : `It didn’t check ${AUTO_TOPICS[topic].needs.replace(/_/g, ' ')} in this run, so a person approves it.`
  }
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the reply.'
  if (!ctx.conversationId) return null

  const [{ data: conv }, { data: human }, { data: lastIn }] = await Promise.all([
    ctx.db.from('conversations').select('ai_enabled, channel').eq('company_id', ctx.companyId).eq('id', ctx.conversationId).maybeSingle(),
    ctx.scratch.startedAt
      ? ctx.db.from('messages').select('id, metadata').eq('conversation_id', ctx.conversationId).eq('sender_type', 'agent').eq('is_ai', false).gt('created_at', ctx.scratch.startedAt).limit(5)
      : Promise.resolve({ data: [] }),
    ctx.db.from('messages').select('created_at').eq('conversation_id', ctx.conversationId).eq('sender_type', 'visitor').order('created_at', { ascending: false }).limit(1),
  ])
  // Meta allows automated replies only within 24 hours of the customer's last message.
  if (['facebook', 'instagram'].includes(String(conv?.channel || '')) && lastIn?.[0]?.created_at && Date.now() - new Date(lastIn[0].created_at).getTime() > 23 * 3600_000) {
    return 'Meta only allows automatic replies within 24 hours of the customer’s message, so a person sends it.'
  }
  if (conv?.ai_enabled === false) return 'AI replies are switched off for this conversation, so a person approves it.'
  // The automatic missed-call text (lib/missed-call-text) isn't anyone replying.
  if (human?.some((m: any) => !m.metadata?.missed_call_text)) return 'Someone on the team replied meanwhile, so a person approves it.'

  const perHour = limits.max_per_conversation_per_hour
  if (perHour) {
    const { count } = await ctx.db.from('agent_steps').select('id', { count: 'exact', head: true })
      .eq('company_id', ctx.companyId).eq('action_key', 'send_message').eq('decision', 'allowed').neq('autonomy', 'external').eq('entity_id', ctx.conversationId)
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
    if ((count || 0) >= perHour) return `Already sent ${perHour} repl${perHour === 1 ? 'y' : 'ies'} on its own in this conversation this hour, so a person approves it.`
  }
  return null
}

const sendMessage: ActionDef = {
  key: 'send_message',
  description: 'Reply to the customer in this conversation. Plain text, no markdown. This is the ONLY way to talk to the customer. Say what the reply is about in topic.',
  input: obj({
    text: { type: 'string', description: 'The message to send.' },
    topic: { type: 'string', enum: TOPICS, description: 'What the reply answers: opening_hours, order_status, stock, store_info (from the business’s knowledge), booking (services, times, their bookings), or other.' },
  }, ['text', 'topic']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: sendOnItsOwn,
  async run(ctx, args) {
    if (!ctx.conversationId) return { ok: false, error: 'No conversation to reply in.' }
    const r = await sendAgentMessage(ctx.db, { companyId: ctx.companyId, conversationId: ctx.conversationId, text: String(args?.text || ''), runId: ctx.runId, agentName: ctx.roleName.replace(/^Colvy /, '') })
    return r.ok ? { ok: true, data: { sent: true, channel: r.channel }, entityType: 'conversation', entityId: ctx.conversationId, summary: 'Replied to the customer' } : { ok: false, error: r.error }
  },
}

const escalateToHuman: ActionDef = {
  key: 'escalate_to_human',
  description: 'Hand this to the team when you are unsure, the customer is upset, it needs a decision or anything looks wrong. Always allowed.',
  // Not called "reason": the engine adds a "reason" field to every action
  // (the model's own explanation for the audit trail) and strips it out.
  input: obj({
    message_for_team: { type: 'string', description: 'Why a person is needed, in one or two sentences the team will read.' },
    urgency: { type: 'string', enum: ['normal', 'high'] },
    knowledge_gap: { type: 'boolean', description: 'true when you are handing over because the business’s knowledge doesn’t answer the customer’s question.' },
  }, ['message_for_team']),
  category: 'communicate', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const why = String(args?.message_for_team || '').trim().slice(0, 500) || 'Needs a person.'
    if (ctx.conversationId) {
      await ctx.db.from('conversation_events').insert({
        conversation_id: ctx.conversationId, company_id: ctx.companyId, event_type: 'ai_update',
        actor_name: ctx.roleName, detail: `Handed to the team — ${why}`, metadata: { agent_run_id: ctx.runId, urgency: args?.urgency || 'normal' },
      }).then(() => {}, () => {})
      await ctx.db.from('conversations').update({ ai_enabled: false }).eq('company_id', ctx.companyId).eq('id', ctx.conversationId).then(() => {}, () => {})
    }
    await notifyCompany({ db: ctx.db, companyId: ctx.companyId, type: 'agent_escalation', message: `${ctx.roleName} needs a person: ${why}`, actorName: ctx.roleName, conversationId: ctx.conversationId || undefined })
    // Handed over for want of an answer → the owner's unanswered-questions list.
    if (args?.knowledge_gap === true) await logKnowledgeGap(ctx)
    return { ok: true, data: { escalated: true }, entityType: ctx.conversationId ? 'conversation' : undefined, entityId: ctx.conversationId || undefined, summary: `Escalated: ${why}` }
  },
}

// Ends the run. Handled by the engine itself; never reaches run().
export const FINISH_ACTION: ActionDef = {
  key: 'finish',
  description: 'Call this last, once you are done. Summarise what you did and why, for the business owner.',
  input: obj({
    outcome: { type: 'string', enum: ['replied', 'escalated', 'needs_info', 'no_action'] },
    intent: { type: 'string', description: 'What the customer wanted, e.g. order_status, product_question, booking, complaint, other.' },
    summary: { type: 'string', description: 'Two or three plain sentences: what was asked, what you found, what you did and why.' },
  }, ['outcome', 'summary']),
  category: 'control', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run() { return { ok: true } },
}

const ALL: ActionDef[] = [...READS, findCustomerOrders, checkOrderStatus, getBusinessHours, getReview, replyToReviewAction, getComment, replyToCommentAction, listServices, checkAvailability, findMyBookings, bookingLink, rescheduleBookingAction, cancelBookingAction, getCart, sendCartFollowup, getOpportunity, sendSalesFollowup, getException, checkOrderTracking, sendOrderUpdate, createTask, sendMessage, escalateToHuman, FINISH_ACTION]
export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(ALL.map(a => [a.key, a]))

export function getAction(key: string): ActionDef | null {
  return ACTIONS[key] || null
}

/** Light check of model-supplied input against the action's schema. */
export function validateInput(action: ActionDef, input: any): string | null {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return 'Input must be an object.'
  for (const req of action.input.required || []) {
    const v = input[req]
    if (v == null || (typeof v === 'string' && !v.trim())) return `Missing “${req}”.`
  }
  for (const [k, v] of Object.entries(input)) {
    const spec = action.input.properties[k]
    if (!spec) continue
    if (spec.type === 'string' && typeof v !== 'string') return `“${k}” must be text.`
    if (spec.type === 'integer' && !Number.isInteger(v)) return `“${k}” must be a whole number.`
    if (spec.enum && !spec.enum.includes(v)) return `“${k}” must be one of ${spec.enum.join(', ')}.`
  }
  return null
}

export type { ActionResult }
