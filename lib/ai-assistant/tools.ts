import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserRole, canEdit } from '@/lib/permissions'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { logAiEvent } from '@/lib/ai-assistant/audit'

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
    name: 'send_message', safety: 'confirm',
    description: 'Send a message to a customer. REQUIRES user confirmation — never sends without it. Provide contactId (or use the current conversation) and the message text. Channel is chosen automatically (live chat / SMS / email).',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        conversationId: { type: 'string' },
        text: { type: 'string' },
        channel: { type: 'string', enum: ['auto', 'sms', 'email'] },
      },
      required: ['text'],
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
  return { error: `Unknown read tool: ${name}` }
}

export type ActionResult = {
  ok: boolean
  error?: string
  entityType?: string
  entityId?: string
  card?: any        // compact card for the UI
  undo?: { entityType: string; entityId: string } | null
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
    // Resolve the recipient contact + a conversation to thread into.
    let contact: any = null
    let conversationId: string | null = args?.conversationId || ctx.conversationId || null
    if (conversationId) {
      const { data: conv } = await D.from('conversations').select('id, contact_id').eq('company_id', ctx.companyId).eq('id', conversationId).maybeSingle()
      if (conv?.contact_id) { const { data } = await D.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle(); contact = data }
    }
    if (!contact && (args?.contactId || ctx.contactId)) {
      const { data } = await D.from('contacts').select('*').eq('company_id', ctx.companyId).eq('id', args?.contactId || ctx.contactId).maybeSingle()
      contact = data
    }
    if (!contact) return { ok: false, error: 'I could not work out who to send this to.' }
    if (!conversationId) {
      const { data: existing } = await D.from('conversations').select('id').eq('company_id', ctx.companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
      conversationId = existing?.[0]?.id || null
      if (!conversationId) {
        const { data: created } = await D.from('conversations').insert({
          company_id: ctx.companyId, contact_id: contact.id, channel: 'chat', status: 'open',
          subject: contact.name || contact.phone || contact.email || 'Conversation',
          sms_number: contact.phone || null, sms_enabled: !!contact.phone,
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        conversationId = created?.id || null
      }
    }
    if (!conversationId) return { ok: false, error: 'Could not open a conversation to send into.' }
    const delivery = await deliverAutomatedMessage({
      companyId: ctx.companyId, conversationId, text,
      phone: contact.phone || undefined, email: contact.email || undefined,
      senderName: ctx.companyName, origin: ctx.siteOrigin,
      preferChannel: args?.channel === 'email' ? 'email' : undefined,
      force: true, db: D,
    })
    const channelLabel = delivery.channel === 'sms' ? 'SMS' : delivery.channel === 'email' ? 'Email' : delivery.channel === 'live_chat' ? 'Live chat' : 'message'
    await logAiEvent(D, { companyId: ctx.companyId, userId: ctx.userId, action: 'Sent message', tool: name, entityType: 'message', entityId: conversationId, input: { contactId: contact.id, text, channel: delivery.channel }, result: { sent: delivery.sent, channel: delivery.channel } })
    if (!delivery.sent) return { ok: false, error: delivery.error || `Could not deliver the ${channelLabel}.` }
    const card = { kind: 'message', title: `Message sent · ${channelLabel}`, lines: [`To ${contact.name || contact.phone || contact.email}`, `“${text.length > 90 ? text.slice(0, 90) + '…' : text}”`], href: `/admin/inbox?conversation=${conversationId}` }
    return { ok: true, entityType: 'message', entityId: conversationId, card, undo: null }
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
    let contact: any = null
    if (args?.conversationId || ctx.conversationId) {
      const { data: conv } = await D.from('conversations').select('contact_id').eq('company_id', ctx.companyId).eq('id', args?.conversationId || ctx.conversationId).maybeSingle()
      if (conv?.contact_id) { const { data } = await D.from('contacts').select('id, name, phone, email').eq('id', conv.contact_id).maybeSingle(); contact = data }
    }
    if (!contact && (args?.contactId || ctx.contactId)) {
      const { data } = await D.from('contacts').select('id, name, phone, email').eq('company_id', ctx.companyId).eq('id', args?.contactId || ctx.contactId).maybeSingle()
      contact = data
    }
    if (!contact) return { ok: false, error: 'Tell me who to send this to — a name or open their conversation.' }
    const channel = args?.channel === 'email' ? 'Email' : (contact.phone ? 'SMS' : (contact.email ? 'Email' : 'message'))
    return { ok: true, preview: { kind: 'send_message', to: contact.name || contact.phone || contact.email, via: channel, text, args: { ...args, contactId: contact.id } } }
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

const fmtDate = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }
const fmtTime = (v: string) => { const d = new Date(v); return isNaN(+d) ? '' : d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) }
const fmtDateTime = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : `${fmtDate(v)} · ${fmtTime(v)}` }
