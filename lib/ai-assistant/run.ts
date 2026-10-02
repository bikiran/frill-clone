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

const MODEL = 'claude-opus-5-5'
const TOOLS_FOR_MODEL = ASSISTANT_TOOLS.map(({ safety, ...t }) => t)
const MAX_STEPS = 8

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
  if (route.includes('/tickets')) return "The user is in Support tickets. 'Reply to this ticket' means the open ticket — use reply_ticket (it defaults to the open ticket)."
  if (route.includes('/reviews')) return 'The user is on Google reviews.'
  if (route.includes('/social')) return 'The user is on social comments (Facebook/Instagram).'
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
  if (ctx.ticketId) ctxLines.push(`Open ticket id: ${ctx.ticketId}`)
  const hint = routeHint(ctx.currentRoute)

  return `You are Colvy, the in-app assistant for ${ctx.companyName}. You help ${ctx.userName} (role: ${ctx.role}) get things done by turning plain instructions into actions.

Today is ${today}. Timezone Australia/Melbourne. Australian English, AUD.

WORKING CONTEXT
${ctxLines.length ? ctxLines.join('\n') : '(no specific record open)'}
${hint ? '\n' + hint : ''}

HOW YOU WORK
- You are a command interface that gets things done. Do the work; don't discuss it. When there's a tool for it, use it — and when one request needs several steps ("reply to Ramesh and add a follow-up task"), do all of them.
- Don't ask the user to confirm in chat. Anything that goes to a customer or moves money automatically shows a "check before sending" card with your draft, which the user can edit and send in one tap — so just call the tool with your best version.
- Resolve people, tickets, reviews, comments, outlets and assignees with the search tools before acting. Never invent an id.
- Be decisive with matches: if one result clearly fits (an exact name, the only one, or the one with the most recent activity), use it. Ask only when two or more are genuinely plausible — list them in one short line. If nothing matches, say so.
- Only ask a follow-up when something required is truly missing (e.g. a payment amount). Assume sensible defaults for everything optional.
- Writing to customers: write the complete message yourself in the business's voice — warm, plain, short, Australian English, no emojis, no placeholders like [name]. Use the customer's first name. When a reply states a policy, price, time or process, check ask_knowledge first and stick to what it says.
- "AI reply" / "reply to X's review / comment / ticket" means: read it, then write the reply yourself and call the reply tool.
- Interpret relative dates/times against today, in the local timezone, and pass them as ISO 8601. "By tomorrow" on a task means due tomorrow at 5pm unless a time is given.
- Keep your chat replies to one short sentence. The UI shows a card for every action and data result, so don't repeat what's on the card or rebuild figures as a table.
- Plain text only: no markdown tables or heavy formatting.
- Never claim you did something you didn't. If a tool fails, say briefly what went wrong and what would fix it.

WHAT YOU CAN DO
- Look up contacts, outlets, team members, orders, conversations, calls, tasks, tickets, Google reviews and Facebook/Instagram comments.
- Tasks & reminders: create (with assignees, an outlet, a due date, a link to an order/conversation) and update them (done/reopen, priority, due date, reassign).
- Calendar events; place a call from the softphone; record a sale.
- Reports (sales, orders, fulfilment, top products) and stock (live stock and price, out-of-stock list) — never invent numbers.
- Messaging a customer (send_message), replying to a support ticket (reply_ticket), replying to a Google review (reply_review), replying to a Facebook/Instagram comment (reply_social_comment).
- Sending a payment link for an amount (send_payment_link), asking a customer to upload photos/videos (request_media), sending an online booking link (send_booking_link).
- Orders: change status, cancel, refund.
- Knowledge: look things up in the business's own knowledge (ask_knowledge) and teach Colvy AI new facts for customer answers (add_fact, e.g. "remember we're closed Christmas Day").

SAFETY
- Tasks, reminders, events, sales and facts are internal — just do them.
- These always go through the check-before-sending card and only happen when the user taps it: send_message, reply_ticket, reply_review, reply_social_comment, send_payment_link, request_media, send_booking_link, update_order_status, cancel_order, refund_order. Calling the tool only prepares it — never say it was sent or done until the user confirms.
- A refund or payment link involves real money — only ever use the amount the user gave.
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
        headers: {
          'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
          // If a safety classifier declines, the API retries on a fallback model in the same call.
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: MODEL,
          // Thinking is always on for this model; low effort keeps a command snappy.
          max_tokens: 8000,
          output_config: { effort: 'low' },
          fallbacks: 'default',
          // Tools + instructions are identical every step and every turn — cache them.
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS_FOR_MODEL,
          messages,
        }),
      })
      const data = await res.json()
      if (!res.ok) return { text: '', cards, error: data?.error?.message || 'Assistant request failed' }

      if (data.stop_reason === 'refusal') return { text: "I can't help with that one.", cards, confirm: null, clientActions }
      const content: any[] = data.content || []
      const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
      // Internal work (lookups, tasks) first, so "reply to X and add a task" still
      // creates the task before the reply stops the loop for the user to check.
      const toolUses = content.filter((c: any) => c.type === 'tool_use')
        .sort((a: any, b: any) => Number(TOOL_SAFETY[a.name] === 'confirm') - Number(TOOL_SAFETY[b.name] === 'confirm'))

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
            text: text || 'Here it is. Check it and send when it looks right.',
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
