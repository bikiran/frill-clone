import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ASSISTANT_TOOLS, TOOL_SAFETY,
  runReadTool, executeAction, buildConfirmPreview, readToolCard,
  type AssistantContext,
} from '@/lib/ai-assistant/tools'

// ─────────────────────────────────────────────────────────────────────────────
// Colvy AI assistant — the tool-use loop.
//
// This is a COMMAND interface, not a chatbot. The model's job is to turn a
// natural-language instruction into one of our named, typed tools. It can only
// REQUEST a tool; every read/write is executed here, server-side, under the
// service-role client, and re-validated against the caller's company + role in
// tools.ts. The prompt is never the security boundary.
//
// Flow per user turn:
//   • 'read'      tools run inline and their data is fed back to the model
//   • 'immediate' tools (task/reminder/event) execute now — reversible, so we
//                 just do them and show an action card with Undo
//   • 'confirm'   tools (send_message) STOP the loop and return a preview; the
//                 client shows a confirm card and calls /execute only if the
//                 user approves. Nothing external happens without that.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6'
const MAX_STEPS = 6

export type AssistantTurn = { role: 'user' | 'assistant'; text: string }

export type AssistantResponse = {
  text: string
  cards: any[]
  // Present when the model wants to run a 'confirm' tool. The client must show a
  // confirmation and POST to /api/ai/assistant/execute to actually run it.
  confirm?: { tool: string; args: any; preview: any } | null
  // Directives for the browser to run (e.g. open the softphone and dial).
  clientActions?: any[]
  error?: string
}

function routeHint(route?: string | null): string {
  if (!route) return ''
  if (route.includes('/inbox')) return "The user is in the Inbox. A bare 'reply' / 'message them' means the customer in the open conversation — but if they NAME a different person or give a phone number, that named recipient is the target: resolve them with search_contacts and pass the contactId (never send to the open conversation's contact instead)."
  if (route.includes('/contacts')) return 'The user is on Contacts. A named person is most likely a contact here.'
  if (route.includes('/orders')) return 'The user is on Orders. An action about "this order" refers to the open order.'
  if (route.includes('/calendar')) return 'The user is on the Calendar. Bookings/appointments are calendar events.'
  if (route.includes('/tasks')) return 'The user is on Tasks.'
  if (route.includes('/calls')) return 'The user is on Call Logs.'
  return ''
}

function buildSystem(ctx: AssistantContext): string {
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const ctxLines: string[] = []
  if (ctx.currentRoute) ctxLines.push(`Current page: ${ctx.currentRoute}`)
  if (ctx.conversationId) ctxLines.push(`Open conversation id: ${ctx.conversationId}`)
  if (ctx.contactId) ctxLines.push(`Open contact id: ${ctx.contactId}`)
  if (ctx.orderId) ctxLines.push(`Open order id: ${ctx.orderId}`)
  if (ctx.outletId) ctxLines.push(`Current outlet id: ${ctx.outletId}`)
  const hint = routeHint(ctx.currentRoute)

  return `You are Colvy, the in-app assistant for ${ctx.companyName}. You help ${ctx.userName} (role: ${ctx.role}) get things done by turning plain instructions into actions.

Today is ${today}. Timezone Australia/Melbourne. Australian English, AUD.

WORKING CONTEXT
${ctxLines.length ? ctxLines.join('\n') : '(no specific record open)'}
${hint ? '\n' + hint : ''}

HOW YOU WORK
- You are a command interface, not a chatbot. Prefer DOING over discussing. When the user asks for something you have a tool for, use the tool.
- Resolve people/outlets/assignees with the search tools BEFORE acting. Never invent an id.
- If a search returns MORE THAN ONE plausible match, do NOT guess — ask the user which one, listing the options briefly. If it returns none, say so.
- Only ask a follow-up question when a required detail is genuinely missing (e.g. a reminder with no time). Don't interrogate — make sensible assumptions for optional fields and act.
- Interpret relative dates/times against today, in the local timezone, and pass them as ISO 8601.
- Keep replies short — one or two sentences. The UI shows a compact card for every action and for data results (reports, stock lists), so DON'T repeat the figures or rebuild them as a table in your text. For a report, give a single-sentence takeaway (e.g. what stands out), not the numbers again.
- Plain text only. Never use markdown tables, and avoid heavy formatting — a short sentence, or a few plain bullet points at most.
- Never claim you did something you didn't. If a tool fails, say briefly what went wrong.

WHAT YOU CAN DO
- Contacts, outlets, team members: look them up.
- Tasks & reminders: create them, and update an existing one (mark done/reopen, reprioritise, change due date, reassign) — resolve it with search_tasks first.
- Calendar: create events.
- Orders: search and read them (status, payment, totals, line items). You can also change an order's status, cancel it, or refund it in the store — these are confirmed actions (see SAFETY).
- Reports: get_report gives sales, order count, average order value, units, fulfilment rate and top products for a period (today, this week, this month, etc). Answer performance questions from it — never invent numbers.
- Stock: check_stock reads a product's live stock and price from the store; list_out_of_stock shows items currently flagged out of stock.
- Calls: find recent calls, read their AI summary/action items/sentiment, and place an outbound call to a contact (start_call opens the user's softphone and rings them).
- Messaging: draft and send a message to a customer (confirmed).

SAFETY
- Creating/updating tasks, reminders and calendar events is immediate and reversible — just do it; the user gets an Undo.
- These need explicit confirmation and must go through their tool (the app shows a preview and only proceeds if the user approves): send_message; update_order_status; cancel_order; refund_order. Never state one of these as done until it's confirmed — calling the tool only proposes it.
- A refund moves real money — be especially careful, confirm the order and amount, and only ever refund what the user asked.
- You cannot delete records or take a new payment. If asked, say it's not something you can do yet.`
}

// Fast-path: a plain "how did we do this week?" needs no reasoning — resolve
// the range, run the report, and return the card with a computed one-liner.
// This skips BOTH model round-trips (decide-tool + summarise), so a report
// answer is effectively instant. Returns null when the message isn't an
// unambiguous report ask, so anything else falls through to the full loop.
const REPORT_RANGES: [RegExp, string][] = [
  [/\b(today|so far today)\b/, 'today'],
  [/\byesterday\b/, 'yesterday'],
  [/\b(this month|the month|month to date|mtd)\b/, 'month'],
  [/\b(last|past)\s*30\b|\b30\s*days?\b/, '30d'],
  [/\b(last|past)?\s*90\b|\b90\s*days?\b|\bquarter\b/, '90d'],
  [/\ball[\s-]?time\b|\bever\b|\ball\s+orders?\b/, 'all'],
  [/\b(this|last|past)\s*week\b|\b7\s*days?\b|\bweekly\b/, '7d'],
]

export async function reportFastPath(db: SupabaseClient, ctx: AssistantContext, message: string): Promise<AssistantResponse | null> {
  const m = String(message || '').toLowerCase().trim()
  if (!m) return null
  // Only when it clearly asks for figures AND names no other kind of work.
  const isReport = /(how'?d?\s+(did|are|is|was|have)?\s*we\s+do)|how'?s?\s+business|how\s+are\s+(we|things|sales)|our\s+(sales|numbers|figures|revenue|takings|performance)|\b(sales|revenue|numbers|figures|takings|performance)\b.*\b(this|last|today|yesterday|week|month|quarter|report)|\breport\b|\bhow\s+much\s+(did\s+we\s+)?(make|sell|take)/i.test(m)
  const excluded = /\b(send|message|text|email|call|ring|dial|task|remind|reminder|book|appointment|event|refund|cancel|status|stock|contact|order\s*#?\d)\b/i.test(m)
  if (!isReport || excluded) return null
  const range = (REPORT_RANGES.find(([re]) => re.test(m))?.[1]) || '7d'

  const out: any = await runReadTool(db, ctx, 'get_report', { range })
  const r = out?.report
  if (!r) return null   // couldn't build a report — let the model try
  const card = readToolCard('get_report', out)
  const rate = parseInt(String(r.fulfilmentRate), 10)
  const bits = [`${r.period}: ${r.orders} order${r.orders === 1 ? '' : 's'}, ${r.revenue}.`]
  if (!isNaN(rate) && rate < 80) bits.push(`Fulfilment ${r.fulfilmentRate}${r.cancelled ? ` — ${r.cancelled} cancelled` : ''} is worth a look.`)
  else if (r.orders > 0) bits.push('Looking healthy.')
  return { text: bits.join(' '), cards: card ? [card] : [], confirm: null, clientActions: [] }
}

export async function runAssistant(opts: {
  db: SupabaseClient
  ctx: AssistantContext
  apiKey: string
  history: AssistantTurn[]
  message: string
  // Names of tools relevant to the current page — nudges, not restrictions.
  suggested?: string[]
}): Promise<AssistantResponse> {
  const { db, ctx, apiKey, history, message } = opts
  const cards: any[] = []
  const clientActions: any[] = []

  // Prior turns as plain text, then the new instruction. Tool traffic lives only
  // inside this call — the client replays user/assistant text, never tool blocks.
  const messages: any[] = []
  for (const t of (history || []).slice(-12)) {
    const text = String(t.text || '').trim()
    if (!text) continue
    const role = t.role === 'assistant' ? 'assistant' : 'user'
    const prev = messages[messages.length - 1]
    if (prev && prev.role === role && typeof prev.content === 'string') prev.content += `\n${text}`
    else messages.push({ role, content: text })
  }
  while (messages.length && messages[0].role !== 'user') messages.shift()
  messages.push({ role: 'user', content: String(message || '').trim() })

  const system = buildSystem(ctx)

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 640, system, tools: ASSISTANT_TOOLS.map(({ safety, ...t }) => t), messages }),
      })
      const data = await res.json()
      if (!res.ok) return { text: '', cards, error: data?.error?.message || 'Assistant request failed' }

      const content: any[] = data.content || []
      const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
      const toolUses = content.filter((c: any) => c.type === 'tool_use')

      if (!toolUses.length) {
        // Model is done — a plain answer / question / confirmation of work.
        return { text: text || 'Done.', cards, confirm: null, clientActions }
      }

      // Record the assistant turn (text + tool_use blocks) for the next round.
      messages.push({ role: 'assistant', content })

      const toolResults: any[] = []
      for (const tu of toolUses) {
        const safety = TOOL_SAFETY[tu.name] || 'read'

        if (safety === 'confirm') {
          // STOP — do not execute. Return a preview for the user to approve.
          const prev = await buildConfirmPreview(db, ctx, tu.name, tu.input)
          if (!prev.ok) {
            // Missing recipient etc. — let the model ask a follow-up next round.
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: prev.error }), is_error: true })
            continue
          }
          return {
            text: text || 'Ready to send — please review.',
            cards, clientActions,
            confirm: { tool: tu.name, args: prev.preview.args || tu.input, preview: prev.preview },
          }
        }

        if (safety === 'read') {
          const out = await runReadTool(db, ctx, tu.name, tu.input)
          // Data tools (reports, stock) render as a rich card, so the model
          // doesn't need to re-type the figures as a table.
          const card = readToolCard(tu.name, out)
          if (card) cards.push(card)
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
          continue
        }

        // 'immediate' — reversible internal write; do it now.
        const r = await executeAction(db, ctx, tu.name, tu.input)
        if (r.ok && r.card) cards.push({ ...r.card, undo: r.undo || null })
        if (r.ok && r.clientAction) clientActions.push(r.clientAction)
        toolResults.push({
          type: 'tool_result', tool_use_id: tu.id,
          content: JSON.stringify(r.ok ? { ok: true, entityType: r.entityType, entityId: r.entityId } : { ok: false, error: r.error }),
          ...(r.ok ? {} : { is_error: true }),
        })
      }

      // If every tool this round produced a confirm we'd have returned already.
      messages.push({ role: 'user', content: toolResults })
    }

    // Ran out of steps — return whatever we did.
    return { text: cards.length ? 'Done.' : "I couldn't complete that — try rephrasing.", cards, confirm: null, clientActions }
  } catch (e: any) {
    return { text: '', cards, clientActions, error: e?.message || 'Assistant error' }
  }
}
