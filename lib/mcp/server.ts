// Colvy MCP — the Model Context Protocol server (server only).
//
// Speaks JSON-RPC 2.0 over Streamable HTTP (POST /api/mcp, JSON replies).
// The tools are Colvy AI's own tool layer (lib/ai-assistant/tools.ts), so an
// outside assistant can do what Colvy AI can, with the same checks: every
// call runs as the person who connected, in their business, with their role.
//
//   read tools      → always available
//   write tools     → need a token with "write" access and an editor role
//   send / money    → two steps: the first call returns a preview to show the
//                     person; it only happens when called again with
//                     confirmed: true

import {
  ASSISTANT_TOOLS, TOOL_SAFETY, runReadTool, executeAction, buildConfirmPreview, type AssistantContext,
} from '@/lib/ai-assistant/tools'
import type { McpAuth } from '@/lib/mcp/auth'
import { canWrite } from '@/lib/mcp/auth'

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
export const SERVER_INFO = { name: 'colvy', title: 'Colvy', version: '1.0.0' }

// Not useful outside the Colvy app (opens the in-browser phone).
const HIDDEN = new Set(['start_call'])

const INSTRUCTIONS = `Colvy runs a small business's customer conversations (website chat, SMS, email, Facebook/Instagram), orders, bookings, payments, tasks, support tickets and Google reviews.
- Look things up with the search_/get_/list_ tools before acting; never guess an id.
- Tools that message a customer or move money return a preview first. Show it to the user, and only call the tool again with confirmed: true after they say yes.
- To make a form, poll or survey, write the questions yourself from what the user describes, create it, and give them the link it returns.
- Write to customers in the business's voice: warm, short, Australian English, no emojis.
- Times are in Australia/Melbourne.`

type Tool = { name: string; title?: string; description: string; inputSchema: any; annotations?: any }

// Extra read tools that make sense for an outside assistant.
const EXTRA: Tool[] = [
  {
    name: 'whoami',
    description: 'Which Colvy business and person this connection acts as, and whether it can make changes.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_conversation',
    description: 'Read one inbox conversation: the customer, channel, status and its latest messages (oldest first). Use after search_conversations to see what was said before replying.',
    inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, limit: { type: 'number', description: 'messages to return, default 30, max 80' } }, required: ['conversationId'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_bookings',
    description: 'Bookings (appointments) for a period: today, tomorrow, the next 7 days, or past 7 days. Includes service, time, customer, staff, status and payment.',
    inputSchema: { type: 'object', properties: { range: { type: 'string', enum: ['today', 'tomorrow', 'next_7_days', 'past_7_days'] }, status: { type: 'string', enum: ['confirmed', 'pending', 'cancelled', 'completed'] } } },
    annotations: { readOnlyHint: true },
  },
]

const TITLES: Record<string, string> = {}
const titleOf = (name: string) => TITLES[name] || name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/** The tools this connection may see. */
export function listTools(auth: McpAuth, role: string | null): Tool[] {
  const write = auth.scope === 'write' && canWrite(role)
  const tools: Tool[] = []
  for (const t of ASSISTANT_TOOLS) {
    if (HIDDEN.has(t.name)) continue
    const safety = TOOL_SAFETY[t.name]
    if (safety !== 'read' && !write) continue
    const schema = JSON.parse(JSON.stringify(t.input_schema || { type: 'object', properties: {} }))
    let description = t.description
      .replace(/REQUIRES confirmation\.?/gi, '')
      .replace(/check[- ]before[- ]sending card/gi, 'preview')
    if (safety === 'confirm') {
      schema.properties = { ...(schema.properties || {}), confirmed: { type: 'boolean', description: 'Leave out (or false) to get a preview. Set true only after the user has approved that preview.' } }
      description += ' Two steps: call without confirmed to get a preview, show it to the user, then call again with the same details and confirmed: true.'
    }
    const money = ['refund_order', 'send_payment_link'].includes(t.name)
    tools.push({
      name: t.name, title: titleOf(t.name), description: description.replace(/\s+/g, ' ').trim(), inputSchema: schema,
      annotations: safety === 'read'
        ? { readOnlyHint: true }
        : { readOnlyHint: false, destructiveHint: ['cancel_order', 'refund_order'].includes(t.name) || money, openWorldHint: safety === 'confirm' },
    })
  }
  return [...EXTRA.map(t => ({ ...t, title: titleOf(t.name) })), ...tools]
}

const text = (v: any) => ({ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) })
const fail = (message: string) => ({ content: [text(message)], isError: true })
const okResult = (data: any) => ({ content: [text(data)], ...(data && typeof data === 'object' && !Array.isArray(data) ? { structuredContent: data } : {}) })

function previewText(name: string, p: any) {
  const lines = Object.entries(p || {}).filter(([k, v]) => k !== 'args' && k !== 'kind' && v != null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  return `PREVIEW — nothing has been sent or changed yet.\n\n${lines.join('\n')}\n\nShow this to the user. If they approve, call ${name} again with the same details and confirmed: true.`
}

/** Run one tools/call. */
export async function callTool(db: any, ctx: AssistantContext, auth: McpAuth, name: string, args: any) {
  args = args && typeof args === 'object' ? args : {}
  const write = auth.scope === 'write' && canWrite(ctx.role)

  if (name === 'whoami') {
    return okResult({ business: ctx.companyName, person: ctx.userName, role: ctx.role, access: write ? 'read and act' : 'read only', connection: auth.name || auth.kind })
  }
  if (name === 'get_conversation') return okResult(await getConversation(db, ctx, String(args.conversationId || ''), Number(args.limit) || 30))
  if (name === 'list_bookings') return okResult(await listBookings(db, ctx, String(args.range || 'next_7_days'), args.status ? String(args.status) : null))

  const safety = TOOL_SAFETY[name]
  if (!safety || HIDDEN.has(name)) return fail(`Unknown tool: ${name}`)
  if (safety === 'read') return okResult(await runReadTool(db, ctx, name, args))
  if (!write) return fail(auth.scope !== 'write' ? 'This connection is read only. Reconnect with "Read and act" access to make changes.' : "Your role in this business can't make changes.")

  if (safety === 'confirm') {
    const { confirmed, ...rest } = args
    const prev = await buildConfirmPreview(db, ctx, name, rest)
    if (!prev.ok) return fail(prev.error || 'Could not prepare that.')
    if (confirmed !== true) return { content: [text(previewText(name, prev.preview))], structuredContent: { status: 'preview', preview: Object.fromEntries(Object.entries(prev.preview || {}).filter(([k]) => k !== 'args')) } }
    const r = await executeAction(db, ctx, name, prev.preview?.args || rest)
    return r.ok ? okResult({ status: 'done', ...(r.card ? { result: r.card } : {}) }) : fail(r.error || 'Could not complete that.')
  }

  const r = await executeAction(db, ctx, name, args)
  return r.ok ? okResult({ status: 'done', ...(r.card ? { result: r.card } : {}), ...(r.entityId ? { id: r.entityId } : {}) }) : fail(r.error || 'Could not complete that.')
}

const TZ = 'Australia/Melbourne'
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null

async function getConversation(db: any, ctx: AssistantContext, id: string, limit: number) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Give a conversationId from search_conversations.' }
  const { data: c } = await db.from('conversations').select('id, subject, channel, status, contact_id, assigned_name, last_message_at, sms_number')
    .eq('company_id', ctx.companyId).eq('id', id).maybeSingle()
  if (!c) return { error: 'Conversation not found.' }
  let contact = null
  if (c.contact_id) {
    const { data } = await db.from('contacts').select('id, name, email, phone').eq('company_id', ctx.companyId).eq('id', c.contact_id).maybeSingle()
    contact = data
  }
  const { data: msgs } = await db.from('messages').select('sender_type, sender_name, content, is_internal, is_ai, delivery_channel, created_at')
    .eq('conversation_id', id).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 80))
  return {
    conversation: { id: c.id, subject: c.subject, channel: c.channel, status: c.status, assigned_to: c.assigned_name || null, last_activity: when(c.last_message_at) },
    customer: contact || (c.sms_number ? { phone: c.sms_number } : null),
    messages: (msgs || []).reverse().map((m: any) => ({
      from: m.sender_type === 'visitor' ? 'customer' : m.sender_type === 'system' ? 'system' : m.is_internal ? 'team (internal note)' : m.is_ai ? 'Colvy AI' : 'team',
      name: m.sender_name || null, text: String(m.content || '').slice(0, 2000), channel: m.delivery_channel || null, at: when(m.created_at),
    })),
  }
}

async function listBookings(db: any, ctx: AssistantContext, range: string, status: string | null) {
  const dayStart = (offset: number) => {
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
    const off = local.getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    local.setHours(0, 0, 0, 0); local.setDate(local.getDate() + offset)
    return new Date(local.getTime() - off)
  }
  const win = range === 'today' ? [dayStart(0), dayStart(1)] : range === 'tomorrow' ? [dayStart(1), dayStart(2)]
    : range === 'past_7_days' ? [dayStart(-7), dayStart(1)] : [dayStart(0), dayStart(8)]
  let q = db.from('bookings').select('id, service_name, staff_name, customer_name, customer_email, customer_phone, starts_at, ends_at, status, payment_status, amount_due_cents, currency')
    .eq('company_id', ctx.companyId).gte('starts_at', win[0].toISOString()).lt('starts_at', win[1].toISOString())
    .order('starts_at', { ascending: true }).limit(100)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return { error: 'Bookings aren’t set up for this business yet.' }
  return {
    range, count: (data || []).length,
    bookings: (data || []).map((b: any) => ({
      id: b.id, service: b.service_name, when: when(b.starts_at), ends: when(b.ends_at), staff: b.staff_name || null, status: b.status,
      customer: { name: b.customer_name, email: b.customer_email || null, phone: b.customer_phone || null },
      payment: b.payment_status || null, amount: b.amount_due_cents ? `$${(b.amount_due_cents / 100).toFixed(2)}` : null,
    })),
  }
}

/** Handle one JSON-RPC message. Returns null for notifications (no reply). */
export async function handleRpc(msg: any, env: { db: any; ctx: AssistantContext; auth: McpAuth }): Promise<any | null> {
  const id = msg?.id
  const isNotification = id === undefined || id === null
  const reply = (result: any) => ({ jsonrpc: '2.0', id, result })
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'Invalid request')

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion || '')
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: `${INSTRUCTIONS}\nYou are connected to ${env.ctx.companyName} as ${env.ctx.userName}.`,
      })
    }
    case 'ping': return isNotification ? null : reply({})
    case 'tools/list': return reply({ tools: listTools(env.auth, env.ctx.role) })
    case 'tools/call': {
      const name = String(msg.params?.name || '')
      try { return reply(await callTool(env.db, env.ctx, env.auth, name, msg.params?.arguments)) }
      catch (e: any) { return reply(fail(e?.message || 'Something went wrong.')) }
    }
    case 'resources/list': return reply({ resources: [] })
    case 'prompts/list': return reply({ prompts: [] })
    default:
      if (isNotification) return null       // notifications/initialized, cancelled…
      return error(-32601, `Method not found: ${msg.method}`)
  }
}
