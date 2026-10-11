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
import type { ActionContext, ActionDef, ActionResult, JsonSchema } from './types'
import { findCustomerOrders, checkOrderStatus } from './order-actions'

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

const READS: ActionDef[] = [
  getConversation,
  readTool('get_contact', 'A customer’s saved details by contact id.', obj({ contactId: { type: 'string' } }, ['contactId']), true),
  readTool('ask_knowledge', 'Search the business’s own knowledge (help articles, facts, files, website). Use before answering any question about policies, products or services.', obj({ question: { type: 'string' } }, ['question']), true),
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
    const row: any = {
      company_id: ctx.companyId, title, text: details ? `${title}\n\n${details}` : title, done: false, status: 'todo',
      priority: ['low', 'high'].includes(args?.priority) ? args.priority : 'normal',
      due_date: args?.dueDate || null, assignees: [], mentions: [],
      order_id: args?.orderId || null, conversation_id: ctx.conversationId,
      created_by: ctx.roleName, source: 'agent',
    }
    const { data, error } = await ctx.db.from('conversation_tasks').insert(row).select('id').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { taskId: data.id }, entityType: 'task', entityId: data.id, summary: `Created task “${title}”` }
  },
}

const sendMessage: ActionDef = {
  key: 'send_message',
  description: 'Reply to the customer in this conversation. Plain text, no markdown. This is the ONLY way to talk to the customer.',
  input: obj({ text: { type: 'string', description: 'The message to send.' } }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  async run(ctx, args) {
    // Live delivery is wired in Phase 3, through the existing countdown / claim
    // flow (lib/ai-live-reply). Until then nothing can reach a customer.
    return { ok: false, error: `Live sending isn’t switched on yet. Text was: ${String(args?.text || '').slice(0, 200)}` }
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

const ALL: ActionDef[] = [...READS, findCustomerOrders, checkOrderStatus, createTask, sendMessage, escalateToHuman, FINISH_ACTION]
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
