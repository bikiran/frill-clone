import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserRole, canEdit, canAccessBilling } from '@/lib/permissions'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { logAiEvent } from '@/lib/ai-assistant/audit'
import { mapWooStatus, mapWooPayment, statusMeta } from '@/lib/orders'
import { WooCommerceService } from '@/lib/woocommerce-service'

// ─────────────────────────────────────────────────────────────────────────────
// Colvy AI assistant — controlled tool layer.
//
// SECURITY: the model can only REQUEST one of these named tools with typed args.
// It never runs SQL or hits arbitrary APIs. Every handler runs server-side under
// the service-role client, and every write re-checks the caller's company
// membership and role here — the prompt is never the security boundary.
//
// Safety levels:
//   'read'      — lookups, run inline during the tool loop, fed back to the model
//   'immediate' — reversible internal writes (task/reminder/event); execute now
//   'confirm'   — external/sensitive (send_message); the loop STOPS and returns a
//                 preview; nothing happens until the user confirms via /execute
// ─────────────────────────────────────────────────────────────────────────────

export type AssistantContext = {
  companyId: string
  userId: string
  userName: string
  role: string
  companyName: string
  siteOrigin: string
  currentRoute?: string | null
  contactId?: string | null
  conversationId?: string | null
  orderId?: string | null
  callId?: string | null
  outletId?: string | null
}

export type ToolSafety = 'read' | 'immediate' | 'confirm'

type ToolDef = { name: string; description: string; safety: ToolSafety; input_schema: any }

// The tool registry exposed to the model. Descriptions are terse and action-
// oriented — this is a command interface, not a chatbot.
export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    name: 'search_contacts', safety: 'read',
    description: "Find contacts (customers/suppliers) by name, email or phone. Use this to resolve a person the user names, e.g. 'Lacey Evans'. Returns matches; if more than one, ask the user which one.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'name, email or phone fragment' }, limit: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'get_contact', safety: 'read',
    description: 'Get one contact by id (name, email, phone, relationship, outlet).',
    input_schema: { type: 'object', properties: { contactId: { type: 'string' } }, required: ['contactId'] },
  },
  {
    name: 'search_outlets', safety: 'read',
    description: "Find the company's outlets/stores by name or suburb (e.g. 'Oakleigh'). Returns matching outlets with ids.",
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'get_outlet_members', safety: 'read',
    description: "Get the team members whose home outlet is the given outlet — use to 'assign to all <outlet> team members'.",
    input_schema: { type: 'object', properties: { outletId: { type: 'string' } }, required: ['outletId'] },
  },
  {
    name: 'search_team_members', safety: 'read',
    description: 'Find team members by name or email, to resolve an assignee the user names.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'search_orders', safety: 'read',
    description: "Find orders by number, customer name/email, or status. Use to answer 'show pending orders', 'orders for Lacey', 'find order RA-10284'. Returns matches with ids — resolve the exact order before acting on it.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'order number, customer name or email' },
        status: { type: 'string', description: "operational status: awaiting_shipment | packed | on_hold | shipped | cancelled | refunded" },
        paymentStatus: { type: 'string', enum: ['paid', 'pending', 'refunded', 'failed'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_order', safety: 'read',
    description: 'Get one order in full — status, payment, totals and line items. Accepts the order id or the human order number.',
    input_schema: { type: 'object', properties: { orderId: { type: 'string', description: 'order id or order number' } }, required: ['orderId'] },
  },
  {
    name: 'search_conversations', safety: 'read',
    description: "Find inbox conversations/enquiries by customer name or subject. Returns ids so you can act on one (e.g. reply).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        status: { type: 'string', enum: ['open', 'assigned', 'resolved', 'closed'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'search_calls', safety: 'read',
    description: "Find recent calls, optionally by customer, agent, or direction. Use to answer 'my last call with X' or 'calls today'. Returns ids for get_call_summary.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'customer name or phone number' },
        direction: { type: 'string', enum: ['inbound', 'outbound'] },
        contactId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_call_summary', safety: 'read',
    description: 'Get a call\'s AI summary, action items, sentiment, who handled it and how long it ran.',
    input_schema: { type: 'object', properties: { callId: { type: 'string' } }, required: ['callId'] },
  },
  {
    name: 'search_tasks', safety: 'read',
    description: "Find tasks to act on (e.g. before marking one done or reassigning it). Filter to the user's own tasks with mineOnly.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        mineOnly: { type: 'boolean', description: 'only tasks assigned to the current user' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_report', safety: 'read',
    description: "Business performance for a period — order count, revenue, average order value, units, fulfilment rate, top products and channel split. Use for 'how did we do this week', 'sales this month', 'today's numbers'.",
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string', enum: ['today', 'yesterday', '7d', '30d', '90d', 'month', 'all'], description: 'defaults to 7d' },
      },
    },
  },
  {
    name: 'check_stock', safety: 'read',
    description: "Check a product's live stock level and price in the store (WooCommerce), by name or SKU.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'product name or SKU' } }, required: ['query'] },
  },
  {
    name: 'list_out_of_stock', safety: 'read',
    description: "List items currently flagged out of stock (open stock alerts) across orders, optionally for one outlet.",
    input_schema: { type: 'object', properties: { outletId: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'create_task', safety: 'immediate',
    description: 'Create a task. Reversible. Optionally due-dated, assigned to specific team members and/or an outlet, and linked to an order or conversation.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueDate: { type: 'string', description: 'ISO 8601 date/time, or omit' },
        assigneeUserIds: { type: 'array', items: { type: 'string' }, description: 'team member user ids' },
        outletId: { type: 'string', description: 'link to an outlet' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        linkOrderId: { type: 'string' },
        linkConversationId: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_reminder', safety: 'immediate',
    description: "Create a personal reminder for the current user (a task due at the given time, assigned to them). Use for 'remind me to …'.",
    input_schema: { type: 'object', properties: { title: { type: 'string' }, remindAt: { type: 'string', description: 'ISO 8601 date/time' } }, required: ['title', 'remindAt'] },
  },
  {
    name: 'create_calendar_event', safety: 'immediate',
    description: 'Create a calendar event. Reversible.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startsAt: { type: 'string', description: 'ISO 8601 date/time' },
        endsAt: { type: 'string' },
        allDay: { type: 'boolean' },
        outletId: { type: 'string' },
        contactId: { type: 'string' },
      },
      required: ['title', 'startsAt'],
    },
  },
  {
    name: 'update_task', safety: 'immediate',
    description: "Update an existing task: mark it done or reopen it, change its priority or due date, reassign it, or edit its title. Reversible. Resolve the task first with search_tasks — pass its id.",
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        done: { type: 'boolean', description: 'true = mark done, false = reopen' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        dueDate: { type: 'string', description: 'ISO 8601, or use clearDueDate to remove' },
        clearDueDate: { type: 'boolean' },
        assigneeUserIds: { type: 'array', items: { type: 'string' } },
        title: { type: 'string' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'start_call', safety: 'immediate',
    description: "Place an outbound call to a contact from the user's browser softphone. Use for 'call Lacey' / 'ring this customer'. Resolve the contact first; the dialer opens and rings them.",
    input_schema: { type: 'object', properties: { contactId: { type: 'string' }, phone: { type: 'string' } } },
  },
  {
    name: 'send_message', safety: 'confirm',
    description: "Send a message to a customer. REQUIRES user confirmation — never sends without it. If the user NAMES a specific recipient (not the open conversation), resolve them with search_contacts and pass their contactId — do NOT rely on the open conversation, or the message will go to the wrong person. Pass phone (and name) only for someone who isn't a saved contact. Channel is chosen automatically (live chat / SMS / email).",
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'the resolved recipient — required when the user names someone specific' },
        conversationId: { type: 'string' },
        phone: { type: 'string', description: 'raw phone, only if the recipient is not a saved contact' },
        name: { type: 'string', description: 'display name to go with phone' },
        text: { type: 'string' },
        channel: { type: 'string', enum: ['auto', 'sms', 'email'] },
      },
      required: ['text'],
    },
  },
  {
    name: 'update_order_status', safety: 'confirm',
    description: "Change an order's status in the store (WooCommerce). REQUIRES confirmation. Use for 'mark this order completed / on hold / processing'. To cancel use cancel_order; to refund use refund_order.",
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'order id or order number' },
        status: { type: 'string', enum: ['processing', 'completed', 'on-hold'], description: 'the WooCommerce status to set' },
      },
      required: ['orderId', 'status'],
    },
  },
  {
    name: 'cancel_order', safety: 'confirm',
    description: 'Cancel an order in the store. REQUIRES confirmation. Does not refund money — use refund_order for that.',
    input_schema: { type: 'object', properties: { orderId: { type: 'string' }, reason: { type: 'string' } }, required: ['orderId'] },
  },
  {
    name: 'refund_order', safety: 'confirm',
    description: 'Refund an order through the store — this MOVES REAL MONEY and always requires confirmation. Omit amount for a full refund, or give a dollar amount for a partial refund.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        amount: { type: 'number', description: 'dollars to refund; omit for full' },
        reason: { type: 'string' },
      },
      required: ['orderId'],
    },
  },
]

export const TOOL_SAFETY: Record<string, ToolSafety> = Object.fromEntries(ASSISTANT_TOOLS.map(t => [t.name, t.safety]))

// ── helpers ──────────────────────────────────────────────────────────────────
const norm9 = (p: string) => String(p || '').replace(/\D/g, '').slice(-9)
const outletName = (l: any) => l?.label || l?.suburb || 'Outlet'

async function resolveNames(db: any, userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return out
  // team_members.name first (cheap), then auth metadata for the rest.
  try {
    const { data } = await db.from('team_members').select('user_id, name, email').in('user_id', ids)
    for (const m of data || []) if (m.user_id) out[m.user_id] = m.name || (m.email ? String(m.email).split('@')[0] : '')
  } catch {}
  await Promise.all(ids.filter(id => !out[id]).map(async (id) => {
    try {
      const { data } = await db.auth.admin.getUserById(id)
      const u = data?.user
      out[id] = (u?.user_metadata?.display_name as string) || (u?.email ? String(u.email).split('@')[0] : 'Team member')
    } catch { out[id] = 'Team member' }
  }))
  return out
}

const money = (n: any, ccy = 'AUD') => {
  const v = Number(n)
  if (!isFinite(v)) return ''
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: ccy || 'AUD' }).format(v) } catch { return `$${v.toFixed(2)}` }
}

// Melbourne-local calendar windows, so "today" means the business's today, not
// UTC's. The offset is read at `now` (handles current DST); a boundary-day DST
// edge is immaterial for a summary.
const TZ = 'Australia/Melbourne'
function tzOffsetMs(at: Date): number {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const loc = new Date(at.toLocaleString('en-US', { timeZone: TZ }))
  return loc.getTime() - utc.getTime()
}
// Start of the local day, `daysAgo` days back, as a real UTC ISO instant.
function localDayStartISO(daysAgo = 0): string {
  const off = tzOffsetMs(new Date())
  const local = new Date(Date.now() + off)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysAgo)
  return new Date(local.getTime() - off).toISOString()
}
// Resolve a report range keyword to an inclusive-start / exclusive-end window.
function reportWindow(range: string): { start: string | null; end: string | null; label: string } {
  const r = String(range || '7d')
  const off = tzOffsetMs(new Date())
  const startOfMonth = () => { const l = new Date(Date.now() + off); l.setUTCDate(1); l.setUTCHours(0, 0, 0, 0); return new Date(l.getTime() - off).toISOString() }
  switch (r) {
    case 'today': return { start: localDayStartISO(0), end: null, label: 'Today' }
    case 'yesterday': return { start: localDayStartISO(1), end: localDayStartISO(0), label: 'Yesterday' }
    case '30d': return { start: new Date(Date.now() - 30 * 864e5).toISOString(), end: null, label: 'Last 30 days' }
    case '90d': return { start: new Date(Date.now() - 90 * 864e5).toISOString(), end: null, label: 'Last 90 days' }
    case 'month': return { start: startOfMonth(), end: null, label: 'This month' }
    case 'all': return { start: null, end: null, label: 'All time' }
    case '7d':
    default: return { start: new Date(Date.now() - 7 * 864e5).toISOString(), end: null, label: 'Last 7 days' }
  }
}

// Resolve an order the user names — by our local id, or by the human order
// number (RA-10284). Scoped to the caller's company.
async function resolveOrder(db: any, companyId: string, ref: string): Promise<any | null> {
  const r = String(ref || '').trim()
  if (!r) return null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)
  if (isUuid) {
    const { data } = await db.from('orders').select('*').eq('company_id', companyId).eq('id', r).maybeSingle()
    if (data) return data
  }
  // Order number — exact first, then a loose match (people drop the prefix).
  const { data: exact } = await db.from('orders').select('*').eq('company_id', companyId).eq('order_number', r).limit(1)
  if (exact?.[0]) return exact[0]
  const { data: loose } = await db.from('orders').select('*').eq('company_id', companyId).ilike('order_number', `%${r}%`).limit(2)
  return loose?.length === 1 ? loose[0] : null
}

// Resolve who a message is for. A recipient the user NAMES (an explicit
// contactId / conversationId / phone the model passes) always wins over the
// ambient open conversation — otherwise "text Bikiran" while Diana's chat is
// open would message Diana. Ambient context is only used when the model passed
// no explicit recipient at all.
async function resolveMessageRecipient(db: any, ctx: AssistantContext, args: any): Promise<{ contact: any; conversationId: string | null; phone: string; name: string; error?: string }> {
  const loadContact = async (id: string) => { const { data } = await db.from('contacts').select('*').eq('company_id', ctx.companyId).eq('id', id).maybeSingle(); return data }
  const loadConv = async (id: string) => { const { data } = await db.from('conversations').select('id, contact_id').eq('company_id', ctx.companyId).eq('id', id).maybeSingle(); return data }
  let contact: any = null
  let conversationId: string | null = null
  if (args?.contactId) { contact = await loadContact(args.contactId) }
  else if (args?.conversationId) { const c = await loadConv(args.conversationId); conversationId = c?.id || null; if (c?.contact_id) contact = await loadContact(c.contact_id) }
  else if (args?.phone) { /* raw phone handled below — explicit, so no ambient fallback */ }
  else if (ctx.contactId) { contact = await loadContact(ctx.contactId) }
  else if (ctx.conversationId) { const c = await loadConv(ctx.conversationId); conversationId = c?.id || null; if (c?.contact_id) contact = await loadContact(c.contact_id) }
  const rawPhone = (!contact && args?.phone) ? String(args.phone).trim() : ''
  if (!contact && !rawPhone) return { contact: null, conversationId: null, phone: '', name: '', error: 'Tell me who to send this to — a name, a phone number, or open their conversation.' }
  const phone = contact?.phone || rawPhone || ''
  const name = contact?.name || args?.name || phone || contact?.email || 'customer'
  return { contact, conversationId, phone, name }
}

// The active WooCommerce store for a company (first active integration).
async function activeWooStore(db: any, companyId: string): Promise<any | null> {
  const { data } = await db.from('woocommerce_integrations').select('*')
    .eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
  return data?.[0] || null
}

// ── READ tools: return plain data for the model ──────────────────────────────
export async function runReadTool(db: SupabaseClient, ctx: AssistantContext, name: string, args: any): Promise<any> {
  const D = db as any
  if (name === 'search_contacts') {
    const q = String(args?.query || '').trim()
    if (!q) return { matches: [] }
    const words = q.split(/\s+/).filter(Boolean)
    const conds: string[] = [`name.ilike.%${q}%`, `email.ilike.%${q}%`]
    for (const w of words) conds.push(`name.ilike.%${w}%`)
    const d9 = norm9(q)
    if (d9.length >= 4) conds.push(`phone.ilike.%${d9}`)
    const { data } = await D.from('contacts').select('id, name, email, phone, relationship_type, location_id')
      .eq('company_id', ctx.companyId).or(conds.join(',')).limit(Math.min(args?.limit || 8, 20))
    return { matches: (data || []).map((c: any) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, relationship: c.relationship_type || 'customer', outletId: c.location_id })) }
  }
  if (name === 'get_contact') {
    const { data } = await D.from('contacts').select('id, name, email, phone, relationship_type, location_id, address, city, state, postcode')
      .eq('company_id', ctx.companyId).eq('id', args?.contactId).maybeSingle()
    return data ? { contact: data } : { error: 'Contact not found' }
  }
  if (name === 'search_outlets') {
    const q = String(args?.query || '').trim()
    let query = D.from('company_locations').select('id, label, suburb, is_primary').eq('company_id', ctx.companyId)
    if (q) query = query.or(`label.ilike.%${q}%,suburb.ilike.%${q}%`)
    const { data } = await query.limit(20)
    return { outlets: (data || []).map((l: any) => ({ id: l.id, name: outletName(l), suburb: l.suburb })) }
  }
  if (name === 'get_outlet_members') {
    const { data } = await D.from('team_members').select('user_id, name, email').eq('company_id', ctx.companyId).eq('default_location_id', args?.outletId)
    const rows = (data || []).filter((m: any) => m.user_id)
    const names = await resolveNames(D, rows.map((m: any) => m.user_id))
    return { members: rows.map((m: any) => ({ userId: m.user_id, name: names[m.user_id] || m.name || m.email })) }
  }
  if (name === 'search_team_members') {
    const q = String(args?.query || '').trim()
    let query = D.from('team_members').select('user_id, name, email').eq('company_id', ctx.companyId)
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    const { data } = await query.limit(20)
    const rows = (data || []).filter((m: any) => m.user_id)
    const names = await resolveNames(D, rows.map((m: any) => m.user_id))
    return { members: rows.map((m: any) => ({ userId: m.user_id, name: names[m.user_id] || m.name || m.email, email: m.email })) }
  }

  if (name === 'search_orders') {
    const q = String(args?.query || '').trim()
    let query = D.from('orders')
      .select('id, order_number, external_order_id, status, payment_status, total, currency, customer_name, customer_email, item_count, order_date, sales_channel')
      .eq('company_id', ctx.companyId)
    if (args?.status) query = query.eq('status', args.status)
    if (args?.paymentStatus) query = query.eq('payment_status', args.paymentStatus)
    if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`)
    const { data } = await query.order('order_date', { ascending: false }).limit(Math.min(args?.limit || 10, 25))
    return {
      orders: (data || []).map((o: any) => ({
        id: o.id, orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status,
        total: money(o.total, o.currency), customer: o.customer_name, items: o.item_count,
        placed: fmtDate(o.order_date), channel: o.sales_channel, canWriteBack: !!o.external_order_id,
      })),
    }
  }
  if (name === 'get_order') {
    const o = await resolveOrder(D, ctx.companyId, args?.orderId || ctx.orderId)
    if (!o) return { error: 'Order not found (try the exact order number).' }
    const { data: items } = await D.from('order_items').select('product_name, sku, quantity, unit_price, total_price').eq('order_id', o.id).limit(50)
    return {
      order: {
        id: o.id, orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status,
        fulfilment: o.fulfilment_status, channel: o.sales_channel,
        customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
        subtotal: money(o.subtotal, o.currency), shipping: money(o.shipping_total, o.currency),
        discount: money(o.discount_total, o.currency), tax: money(o.tax_total, o.currency), total: money(o.total, o.currency),
        placed: fmtDateTime(o.order_date), tracking: o.tracking_number || null, carrier: o.carrier || null,
        canWriteBack: !!o.external_order_id, contactId: o.contact_id, conversationId: o.conversation_id,
        items: (items || []).map((i: any) => ({ name: i.product_name, sku: i.sku, qty: i.quantity, price: money(i.unit_price, o.currency) })),
      },
    }
  }
  if (name === 'search_conversations') {
    const q = String(args?.query || '').trim()
    let query = D.from('conversations')
      .select('id, subject, status, channel, last_message, last_message_at, contact_id, assigned_name, is_unread')
      .eq('company_id', ctx.companyId)
    if (args?.status) query = query.eq('status', args.status)
    if (q) query = query.ilike('subject', `%${q}%`)
    const { data } = await query.order('last_message_at', { ascending: false }).limit(Math.min(args?.limit || 10, 25))
    return {
      conversations: (data || []).map((c: any) => ({
        id: c.id, subject: c.subject, status: c.status, channel: c.channel,
        lastMessage: String(c.last_message || '').slice(0, 120), when: fmtDateTime(c.last_message_at),
        contactId: c.contact_id, assignedTo: c.assigned_name, unread: c.is_unread,
      })),
    }
  }
  if (name === 'search_calls') {
    const q = String(args?.query || '').trim()
    let query = D.from('calls')
      .select('id, direction, from_number, to_number, status, duration_seconds, agent_name, answered_by, caller_name, contact_name, contact_id, ai_summary, sentiment, created_at')
      .eq('company_id', ctx.companyId)
    if (args?.direction) query = query.eq('direction', args.direction)
    if (args?.contactId) query = query.eq('contact_id', args.contactId)
    if (q) {
      const d9 = norm9(q)
      const conds = [`caller_name.ilike.%${q}%`, `contact_name.ilike.%${q}%`]
      if (d9.length >= 4) { conds.push(`from_number.ilike.%${d9}`); conds.push(`to_number.ilike.%${d9}`) }
      query = query.or(conds.join(','))
    }
    const { data } = await query.order('created_at', { ascending: false }).limit(Math.min(args?.limit || 10, 25))
    return {
      calls: (data || []).map((c: any) => ({
        id: c.id, direction: c.direction, status: c.status,
        who: c.contact_name || c.caller_name || (c.direction === 'inbound' ? c.from_number : c.to_number),
        agent: c.agent_name || c.answered_by || null, duration: fmtDuration(c.duration_seconds),
        when: fmtDateTime(c.created_at), hasSummary: !!c.ai_summary, sentiment: c.sentiment || null,
      })),
    }
  }
  if (name === 'get_call_summary') {
    const { data: c } = await D.from('calls')
      .select('id, direction, from_number, to_number, status, duration_seconds, agent_name, answered_by, caller_name, contact_name, ai_summary, ai_todos, sentiment, transcript_en, transcription, created_at')
      .eq('company_id', ctx.companyId).eq('id', args?.callId).maybeSingle()
    if (!c) return { error: 'Call not found' }
    const todos = Array.isArray(c.ai_todos) ? c.ai_todos : []
    return {
      call: {
        direction: c.direction, status: c.status, duration: fmtDuration(c.duration_seconds),
        who: c.contact_name || c.caller_name || (c.direction === 'inbound' ? c.from_number : c.to_number),
        handledBy: c.agent_name || c.answered_by || null, when: fmtDateTime(c.created_at),
        summary: c.ai_summary || null, todos, sentiment: c.sentiment || null,
        hasTranscript: !!(c.transcript_en || c.transcription),
      },
    }
  }
  if (name === 'search_tasks') {
    let query = D.from('conversation_tasks')
      .select('id, title, text, done, status, priority, due_date, assigned_to_id, assignees')
      .eq('company_id', ctx.companyId)
    if (args?.status) query = query.eq('status', args.status)
    const q = String(args?.query || '').trim()
    if (q) query = query.or(`title.ilike.%${q}%,text.ilike.%${q}%`)
    const { data } = await query.order('due_date', { ascending: true, nullsFirst: false }).limit(Math.min(args?.limit || 15, 40))
    let rows = data || []
    if (args?.mineOnly) rows = rows.filter((t: any) => t.assigned_to_id === ctx.userId || (Array.isArray(t.assignees) && t.assignees.some((a: any) => a?.id === ctx.userId)))
    return {
      tasks: rows.map((t: any) => ({
        id: t.id, title: t.title || t.text, done: t.done || t.status === 'done',
        status: t.status, priority: t.priority, due: t.due_date ? fmtDate(t.due_date) : null,
        assignees: Array.isArray(t.assignees) ? t.assignees.map((a: any) => a?.name).filter(Boolean) : [],
      })),
    }
  }

  if (name === 'get_report') {
    const win = reportWindow(args?.range || '7d')
    let q = D.from('orders')
      .select('status, total, item_count, sales_channel, primary_sku, order_date')
      .eq('company_id', ctx.companyId)
    if (win.start) q = q.gte('order_date', win.start)
    if (win.end) q = q.lt('order_date', win.end)
    const { data } = await q.limit(5000)
    const rows = data || []
    const isCancelled = (s: string) => ['cancelled', 'refunded'].includes(String(s))
    const live = rows.filter((o: any) => !isCancelled(o.status))
    const revenue = live.reduce((a: number, o: any) => a + (Number(o.total) || 0), 0)
    const units = live.reduce((a: number, o: any) => a + (Number(o.item_count) || 0), 0)
    const shipped = rows.filter((o: any) => o.status === 'shipped').length
    const cancelled = rows.filter((o: any) => o.status === 'cancelled').length
    const denom = rows.length - cancelled
    const skuCount: Record<string, number> = {}
    const chanCount: Record<string, number> = {}
    for (const o of live) {
      if (o.primary_sku) skuCount[o.primary_sku] = (skuCount[o.primary_sku] || 0) + 1
      const ch = o.sales_channel || 'manual'; chanCount[ch] = (chanCount[ch] || 0) + 1
    }
    const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ key: k, count: v }))
    return {
      report: {
        period: win.label,
        orders: live.length,
        revenue: money(revenue), aov: money(live.length ? revenue / live.length : 0), units,
        shipped, cancelled, fulfilmentRate: denom > 0 ? `${Math.round((shipped / denom) * 100)}%` : 'n/a',
        topProducts: top(skuCount), channels: top(chanCount),
        note: rows.length >= 5000 ? 'Showing the most recent 5000 orders in range.' : undefined,
      },
    }
  }
  if (name === 'check_stock') {
    const q = String(args?.query || '').trim()
    if (!q) return { error: 'Give a product name or SKU.' }
    const store = await activeWooStore(D, ctx.companyId)
    if (!store?.store_url) return { error: 'No store is connected, so I can\'t check live stock.' }
    try {
      const woo = new WooCommerceService({ storeUrl: store.store_url, consumerKey: store.consumer_key, consumerSecret: store.consumer_secret, companyId: ctx.companyId })
      const products = await woo.searchProducts(q, 8)
      return {
        products: products.map((p: any) => ({
          name: p.name, sku: p.sku || null,
          stockStatus: p.stock_status, stockQty: p.manage_stock ? p.stock_quantity : null,
          price: money(p.price), hasVariations: p.has_variations,
        })),
      }
    } catch (e: any) { return { error: e?.message || 'Could not reach the store.' } }
  }
  if (name === 'list_out_of_stock') {
    let q = D.from('order_stock_alerts')
      .select('product_name, sku, quantity, order_number, customer_name, store_location_id, updated_at')
      .eq('company_id', ctx.companyId).eq('status', 'pending')
    if (args?.outletId) q = q.eq('store_location_id', args.outletId)
    const { data } = await q.order('updated_at', { ascending: false }).limit(Math.min(args?.limit || 25, 60))
    return {
      count: (data || []).length,
      items: (data || []).map((r: any) => ({
        product: r.product_name, sku: r.sku || null, qty: r.quantity,
        order: r.order_number, customer: r.customer_name, flagged: fmtDate(r.updated_at),
      })),
    }
  }
  return { error: `Unknown read tool: ${name}` }
}

export type ActionResult = {
  ok: boolean
  error?: string
  entityType?: string
  entityId?: string
  card?: any        // compact card for the UI
  // undo: with `restore` present the client updates the row back to those
  // values; without it, the client deletes the created row.
  undo?: { entityType: string; entityId: string; restore?: Record<string, any> } | null
  // A directive for the client to run in the browser (e.g. open the softphone
  // and dial). The server can't place a WebRTC call — the browser does.
  clientAction?: { type: string; [k: string]: any } | null
}

// ── WRITE tools: execute a validated action. Used for 'immediate' inline and for
// 'confirm' tools after the user confirms (via the /execute route). ────────────
export async function executeAction(db: SupabaseClient, ctx: AssistantContext, name: string, args: any): Promise<ActionResult> {
  const D = db as any
  // Every write requires edit rights (viewers are read-only in Colvy).
  if (!canEdit(ctx.role as any)) return { ok: false, error: "You don't have permission to make changes." }

  if (name === 'create_task') {
    const title = String(args?.title || '').trim()
    if (!title) return { ok: false, error: 'A task needs a title.' }
    const assigneeIds: string[] = Array.isArray(args?.assigneeUserIds) ? args.assigneeUserIds.filter(Boolean) : []
    const names = await resolveNames(D, assigneeIds)
    const assignees = assigneeIds.map(id => ({ id, name: names[id] || 'Team member' }))
    let outlet: any = null
    if (args?.outletId) { const { data } = await D.from('company_locations').select('id, label, suburb').eq('company_id', ctx.companyId).eq('id', args.outletId).maybeSingle(); outlet = data }
    const row: any = {
      company_id: ctx.companyId, title, text: title, done: false, status: 'todo',
      priority: ['low', 'high'].includes(args?.priority) ? args.priority : 'normal',
      due_date: args?.dueDate || null,
      assigned_to_id: assignees[0]?.id || null, assigned_to: assignees[0]?.name || null,
      assignees, mentions: [],
      location_id: outlet?.id || ctx.outletId || null,
      location_ids: outlet?.id ? [outlet.id] : [],
      order_id: args?.linkOrderId || ctx.orderId || null,
      conversation_id: args?.linkConversationId || ctx.conversationId || null,
      created_by: ctx.userName, created_by_id: ctx.userId, source: 'colvy_ai',
    }
    const ins = await insertResilient(D, 'conversation_tasks', row, ['title', 'status', 'priority', 'assignees', 'location_ids', 'source', 'created_by_id', 'created_by', 'order_id', 'conversation_id'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the task.' }
    const card = {
      kind: 'task', title,
      lines: [outlet ? outletName(outlet) : null, args?.dueDate ? `Due ${fmtDate(args.dueDate)}` : null, assignees.length ? `${assignees.length} assignee${assignees.length === 1 ? '' : 's'}` : null].filter(Boolean),
      href: '/admin/tasks',
    }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created task', tool: name, entityType: 'task', entityId: ins.id, input: row, result: { title } })
    return { ok: true, entityType: 'task', entityId: ins.id, card, undo: { entityType: 'task', entityId: ins.id } }
  }

  if (name === 'create_reminder') {
    const title = String(args?.title || '').trim()
    if (!title || !args?.remindAt) return { ok: false, error: 'A reminder needs a title and a time.' }
    const row: any = {
      company_id: ctx.companyId, title, text: title, done: false, status: 'todo', priority: 'normal',
      due_date: args.remindAt, assigned_to_id: ctx.userId, assigned_to: ctx.userName,
      assignees: [{ id: ctx.userId, name: ctx.userName }], mentions: [],
      created_by: ctx.userName, created_by_id: ctx.userId, source: 'colvy_ai_reminder',
    }
    const ins = await insertResilient(D, 'conversation_tasks', row, ['title', 'status', 'priority', 'assignees', 'source', 'created_by_id', 'created_by'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the reminder.' }
    const card = { kind: 'reminder', title, lines: [`Reminder · ${fmtDate(args.remindAt)}`], href: '/admin/tasks' }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created reminder', tool: name, entityType: 'reminder', entityId: ins.id, input: row, result: { title } })
    return { ok: true, entityType: 'reminder', entityId: ins.id, card, undo: { entityType: 'reminder', entityId: ins.id } }
  }

  if (name === 'create_calendar_event') {
    const title = String(args?.title || '').trim()
    if (!title || !args?.startsAt) return { ok: false, error: 'An event needs a title and a start time.' }
    const row: any = {
      company_id: ctx.companyId, event_type: 'appointment', title, starts_at: args.startsAt,
      ends_at: args?.endsAt || null, is_all_day: !!args?.allDay, status: 'scheduled',
      location_id: args?.outletId || ctx.outletId || null, contact_id: args?.contactId || ctx.contactId || null,
      assigned_to_id: ctx.userId, assigned_to_name: ctx.userName, created_by: ctx.userName,
    }
    const ins = await insertResilient(D, 'calendar_events', row, ['assigned_to_id', 'assigned_to_name', 'is_all_day', 'contact_id', 'location_id'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the event.' }
    const when = args?.allDay ? `${fmtDate(args.startsAt)} · All day` : fmtDateTime(args.startsAt) + (args?.endsAt ? `–${fmtTime(args.endsAt)}` : '')
    const card = { kind: 'calendar_event', title, lines: [when], href: '/admin/calendar' }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created calendar event', tool: name, entityType: 'calendar_event', entityId: ins.id, input: row, result: { title } })
    return { ok: true, entityType: 'calendar_event', entityId: ins.id, card, undo: { entityType: 'calendar_event', entityId: ins.id } }
  }

  if (name === 'send_message') {
    const text = String(args?.text || '').trim()
    if (!text) return { ok: false, error: 'The message is empty.' }
    const r = await resolveMessageRecipient(D, ctx, args)
    if (r.error) return { ok: false, error: r.error }
    let { contact, conversationId, phone, name: toName } = r

    if (!conversationId) {
      if (contact?.id) {
        const { data: existing } = await D.from('conversations').select('id').eq('company_id', ctx.companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
        conversationId = existing?.[0]?.id || null
      }
      if (!conversationId) {
        const { data: created } = await D.from('conversations').insert({
          company_id: ctx.companyId, contact_id: contact?.id || null, channel: 'chat', status: 'open',
          subject: toName || 'Conversation',
          sms_number: phone || null, sms_enabled: !!phone,
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        conversationId = created?.id || null
      }
    }
    if (!conversationId) return { ok: false, error: 'Could not open a conversation to send into.' }
    const delivery = await deliverAutomatedMessage({
      companyId: ctx.companyId, conversationId, text,
      phone: phone || undefined, email: (contact?.email) || undefined,
      senderName: ctx.companyName, origin: ctx.siteOrigin,
      preferChannel: args?.channel === 'email' ? 'email' : undefined,
      force: true, db: D,
    })
    const channelLabel = delivery.channel === 'sms' ? 'SMS' : delivery.channel === 'email' ? 'Email' : delivery.channel === 'live_chat' ? 'Live chat' : 'message'
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Sent message', tool: name, entityType: 'message', entityId: conversationId, input: { contactId: contact?.id || null, phone: phone || null, text, channel: delivery.channel }, result: { sent: delivery.sent, channel: delivery.channel } })
    if (!delivery.sent) return { ok: false, error: delivery.error || `Could not deliver the ${channelLabel}.` }
    const card = { kind: 'message', title: `Message sent · ${channelLabel}`, lines: [`To ${toName}`, `“${text.length > 90 ? text.slice(0, 90) + '…' : text}”`], href: `/admin/inbox?conversation=${conversationId}` }
    return { ok: true, entityType: 'message', entityId: conversationId, card, undo: null }
  }

  if (name === 'update_task') {
    const { data: task } = await D.from('conversation_tasks')
      .select('id, title, text, done, status, priority, due_date, assigned_to_id, assigned_to, assignees')
      .eq('company_id', ctx.companyId).eq('id', args?.taskId).maybeSingle()
    if (!task) return { ok: false, error: 'I couldn\'t find that task.' }

    const patch: any = {}
    const restore: any = {}
    const changed: string[] = []
    const remember = (col: string) => { if (!(col in restore)) restore[col] = (task as any)[col] ?? null }

    // done / status kept consistent with each other.
    let status: string | undefined = typeof args?.status === 'string' ? args.status : undefined
    if (typeof args?.done === 'boolean') status = args.done ? 'done' : 'todo'
    if (status) {
      remember('status'); remember('done'); remember('completed_at')
      patch.status = status; patch.done = status === 'done'
      patch.completed_at = status === 'done' ? new Date().toISOString() : null
      changed.push(status === 'done' ? 'marked done' : 'reopened')
    }
    if (typeof args?.priority === 'string' && ['low', 'normal', 'high'].includes(args.priority)) {
      remember('priority'); patch.priority = args.priority; changed.push(`priority ${args.priority}`)
    }
    if (args?.clearDueDate) { remember('due_date'); patch.due_date = null; changed.push('cleared due date') }
    else if (args?.dueDate) { remember('due_date'); patch.due_date = args.dueDate; changed.push(`due ${fmtDate(args.dueDate)}`) }
    if (typeof args?.title === 'string' && args.title.trim()) { remember('title'); remember('text'); patch.title = args.title.trim(); patch.text = args.title.trim(); changed.push('renamed') }
    if (Array.isArray(args?.assigneeUserIds)) {
      const ids = args.assigneeUserIds.filter(Boolean)
      const names = await resolveNames(D, ids)
      const assignees = ids.map((id: string) => ({ id, name: names[id] || 'Team member' }))
      remember('assignees'); remember('assigned_to_id'); remember('assigned_to')
      patch.assignees = assignees; patch.assigned_to_id = assignees[0]?.id || null; patch.assigned_to = assignees[0]?.name || null
      changed.push(assignees.length ? `assigned to ${assignees.map((a: any) => a.name).join(', ')}` : 'unassigned')
    }
    if (!Object.keys(patch).length) return { ok: false, error: 'Tell me what to change on the task.' }

    const upd = await updateResilient(D, 'conversation_tasks', task.id, patch, ['status', 'done', 'completed_at', 'priority', 'title', 'assignees', 'assigned_to_id', 'assigned_to', 'due_date'])
    if (!upd.ok) return { ok: false, error: upd.error || 'Could not update the task.' }
    const title = task.title || task.text || 'Task'
    const card = { kind: 'task', title, lines: [changed.join(' · ')], href: '/admin/tasks' }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Updated task', tool: name, entityType: 'task', entityId: task.id, input: patch, result: { changed } })
    return { ok: true, entityType: 'task', entityId: task.id, card, undo: { entityType: 'task_update', entityId: task.id, restore } }
  }

  if (name === 'update_order_status' || name === 'cancel_order') {
    const wooStatus = name === 'cancel_order' ? 'cancelled' : String(args?.status || '')
    if (!['processing', 'completed', 'on-hold', 'cancelled'].includes(wooStatus)) return { ok: false, error: 'Unsupported status.' }
    const order = await resolveOrder(D, ctx.companyId, args?.orderId || ctx.orderId)
    if (!order) return { ok: false, error: 'Order not found.' }
    if (!order.external_order_id) return { ok: false, error: 'That\'s a manual order — change its status on the Orders page.' }

    const base = ctx.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    let ok = false, err = ''
    try {
      const res = await fetch(`${base}/api/orders/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: ctx.companyId, orderId: order.external_order_id, status: wooStatus, conversationId: order.conversation_id || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      ok = res.ok && data?.ok !== false
      if (!ok) err = data?.error || `Update failed (${res.status})`
    } catch (e: any) { err = e?.message || 'Store update failed' }
    if (!ok) return { ok: false, error: err }

    // Reflect it locally straight away (the Woo webhook will also sync back).
    try { await D.from('orders').update({ status: mapWooStatus(wooStatus), payment_status: ['processing', 'completed'].includes(wooStatus) ? 'paid' : order.payment_status, updated_at: new Date().toISOString() }).eq('id', order.id) } catch {}

    const label = wooStatus === 'cancelled' ? 'cancelled' : wooStatus === 'completed' ? 'marked paid & completed' : wooStatus === 'processing' ? 'set to processing' : 'put on hold'
    const card = { kind: 'order', title: `Order ${order.order_number || ''} ${label}`.trim(), lines: [order.customer_name, money(order.total, order.currency)].filter(Boolean), href: '/admin/orders' }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: name === 'cancel_order' ? 'Cancelled order' : 'Updated order status', tool: name, entityType: 'order', entityId: order.id, input: { orderNumber: order.order_number, status: wooStatus }, result: { ok: true } })
    return { ok: true, entityType: 'order', entityId: order.id, card, undo: null }
  }

  if (name === 'start_call') {
    let contact: any = null
    if (args?.contactId || ctx.contactId) {
      const { data } = await D.from('contacts').select('id, name, phone').eq('company_id', ctx.companyId).eq('id', args?.contactId || ctx.contactId).maybeSingle()
      contact = data
    }
    const phone = (contact?.phone || args?.phone || '').trim()
    if (!phone) return { ok: false, error: 'I don\'t have a phone number to call — tell me who, or open their contact.' }
    const name2 = contact?.name || 'Contact'
    const card = { kind: 'call', title: `Calling ${name2}…`, lines: [phone], href: null }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Started call', tool: name, entityType: 'call', entityId: contact?.id || null, input: { phone, contactId: contact?.id || null }, result: { dialed: true } })
    // The browser places the WebRTC call — return a directive it will run.
    return { ok: true, entityType: 'call', entityId: contact?.id || undefined, card, undo: null, clientAction: { type: 'dial', number: phone, name: name2, contactId: contact?.id || undefined } }
  }

  if (name === 'refund_order') {
    // Refunds move real money — owner/admin only, on top of the confirmation.
    if (!canAccessBilling(ctx.role as any)) return { ok: false, error: 'Only an owner or admin can issue a refund.' }
    const order = await resolveOrder(D, ctx.companyId, args?.orderId || ctx.orderId)
    if (!order) return { ok: false, error: 'Order not found.' }
    if (!order.external_order_id) return { ok: false, error: 'That\'s a manual order — it can\'t be refunded through the store.' }
    const amount = args?.amount != null ? Number(args.amount) : undefined
    if (amount != null && (!isFinite(amount) || amount <= 0)) return { ok: false, error: 'The refund amount looks wrong.' }

    const base = ctx.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    let ok = false, err = ''
    try {
      const res = await fetch(`${base}/api/orders/refund`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: ctx.companyId, orderId: order.external_order_id, amount: amount != null ? String(amount) : undefined, reason: args?.reason || undefined, conversationId: order.conversation_id || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      ok = res.ok && data?.ok !== false
      if (!ok) err = data?.error || `Refund failed (${res.status})`
    } catch (e: any) { err = e?.message || 'Refund failed' }
    if (!ok) return { ok: false, error: err }

    const full = amount == null || amount >= Number(order.total || 0)
    try { await D.from('orders').update({ payment_status: 'refunded', ...(full ? { status: 'refunded' } : {}), updated_at: new Date().toISOString() }).eq('id', order.id) } catch {}

    const refunded = amount != null ? money(amount, order.currency) : money(order.total, order.currency)
    const card = { kind: 'order', title: `Refunded ${refunded}`, lines: [`Order ${order.order_number || ''}`.trim(), order.customer_name].filter(Boolean), href: '/admin/orders' }
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Refunded order', tool: name, entityType: 'order', entityId: order.id, input: { orderNumber: order.order_number, amount: amount ?? 'full' }, result: { ok: true } })
    return { ok: true, entityType: 'order', entityId: order.id, card, undo: null }
  }

  return { ok: false, error: `Unknown action: ${name}` }
}

// Build the preview shown for a 'confirm' tool before it runs. Resolves the
// recipient + likely channel so the user sees exactly what will happen.
export async function buildConfirmPreview(db: SupabaseClient, ctx: AssistantContext, name: string, args: any): Promise<{ ok: boolean; error?: string; preview?: any }> {
  const D = db as any
  if (name === 'send_message') {
    if (!canEdit(ctx.role as any)) return { ok: false, error: "You don't have permission to send messages." }
    const text = String(args?.text || '').trim()
    if (!text) return { ok: false, error: 'The message is empty.' }
    const r = await resolveMessageRecipient(D, ctx, args)
    if (r.error) return { ok: false, error: r.error }
    const channel = args?.channel === 'email' ? 'Email' : (r.phone ? 'SMS' : (r.contact?.email ? 'Email' : 'message'))
    // Pin the resolved recipient into the confirm args so /execute sends to
    // exactly who the preview showed — never drifting to the open conversation.
    const pinned = r.contact?.id
      ? { text, channel: args?.channel, contactId: r.contact.id }
      : { text, channel: args?.channel, phone: r.phone, name: r.name }
    return { ok: true, preview: { kind: 'send_message', to: r.name, via: channel, text, args: pinned } }
  }

  if (name === 'update_order_status' || name === 'cancel_order' || name === 'refund_order') {
    const financial = name === 'refund_order'
    if (financial ? !canAccessBilling(ctx.role as any) : !canEdit(ctx.role as any)) {
      return { ok: false, error: financial ? 'Only an owner or admin can issue a refund.' : "You don't have permission to change orders." }
    }
    const order = await resolveOrder(D, ctx.companyId, args?.orderId || ctx.orderId)
    if (!order) return { ok: false, error: 'Tell me which order — the order number.' }
    if (!order.external_order_id) return { ok: false, error: financial ? "That's a manual order — it can't be refunded through the store." : "That's a manual order — change its status on the Orders page." }
    const orderLabel = `Order ${order.order_number || ''}`.trim()
    const total = money(order.total, order.currency)
    if (name === 'refund_order') {
      const amt = args?.amount != null ? Number(args.amount) : undefined
      const refundStr = amt != null ? money(amt, order.currency) : `${total} (full)`
      return { ok: true, preview: { kind: 'refund_order', orderLabel, to: order.customer_name, amount: refundStr, warn: 'This refunds money to the customer through the store.', args: { orderId: order.id, amount: amt, reason: args?.reason } } }
    }
    const wooStatus = name === 'cancel_order' ? 'cancelled' : String(args?.status || '')
    const action = name === 'cancel_order' ? 'Cancel this order' : `Set status to “${wooStatus}”`
    return { ok: true, preview: { kind: 'order_status', orderLabel, to: order.customer_name, action, current: statusMeta(order.status).label, amount: total, args: { orderId: order.id, ...(name === 'cancel_order' ? { reason: args?.reason } : { status: wooStatus }) } } }
  }
  return { ok: false, error: `No preview for ${name}` }
}

// ── small utils ──────────────────────────────────────────────────────────────
async function insertResilient(db: any, table: string, row: any, droppable: string[]): Promise<{ id?: string; error?: string }> {
  // Some optional columns may not exist on older schemas — drop them and retry
  // rather than failing the whole insert.
  let cur = { ...row }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await db.from(table).insert(cur).select('id').maybeSingle()
    if (!error) return { id: data?.id }
    const m = /column "?([a-z_]+)"? .* does not exist/i.exec(error.message || '') || /Could not find the '([a-z_]+)' column/i.exec(error.message || '')
    const col = m?.[1]
    if (col && (droppable.includes(col) || col in cur)) { const c = { ...cur }; delete c[col]; cur = c; continue }
    return { error: error.message }
  }
  return { error: 'insert failed' }
}

// Like insertResilient, for updates — drop unknown columns and retry.
async function updateResilient(db: any, table: string, id: string, patch: any, droppable: string[]): Promise<{ ok: boolean; error?: string }> {
  let cur = { ...patch }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await db.from(table).update(cur).eq('id', id)
    if (!error) return { ok: true }
    const m = /column "?([a-z_]+)"? .* does not exist/i.exec(error.message || '') || /Could not find the '([a-z_]+)' column/i.exec(error.message || '')
    const col = m?.[1]
    if (col && (droppable.includes(col) || col in cur)) { const c = { ...cur }; delete c[col]; cur = c; continue }
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'update failed' }
}

const fmtDuration = (secs: any) => {
  const s = Math.max(0, Math.round(Number(secs) || 0))
  if (!s) return '0s'
  const m = Math.floor(s / 60), r = s % 60
  return m ? `${m}m ${r}s` : `${r}s`
}

const fmtDate = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }
const fmtTime = (v: string) => { const d = new Date(v); return isNaN(+d) ? '' : d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) }
const fmtDateTime = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : `${fmtDate(v)} · ${fmtTime(v)}` }
