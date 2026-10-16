// "Why did Colvy do this?" (Phase 6)
//
// Anything an agent did — a reply in the inbox, a hand-off to the team, a task
// — can be traced back to its run. This turns a run into a short, readable
// account: what the customer asked, what the agent checked and found, what it
// did and which permission allowed it, and who approved it. The full trail
// stays on the AI Agents page.

import { activityName } from './record'

const LABEL: Record<string, string> = {
  get_conversation: 'Read the conversation', get_contact: 'Looked up the customer', ask_knowledge: 'Searched your knowledge',
  check_stock: 'Checked stock', find_customer_orders: 'Found the customer’s orders', check_order_status: 'Checked order tracking',
  get_business_hours: 'Checked opening hours', create_task: 'Created a task', send_message: 'Replied to the customer',
  escalate_to_human: 'Handed it to the team', search_orders: 'Searched orders', get_order: 'Looked up an order',
  get_review: 'Read the review', reply_to_review: 'Replied to the review',
  get_comment: 'Read the comment', reply_to_comment: 'Replied to the comment',
  get_cart: 'Read the cart', send_cart_followup: 'Followed up the cart',
  get_opportunity: 'Read the quote or enquiry', send_sales_followup: 'Followed up the customer',
  get_exception: 'Looked at the flagged order', check_order_tracking: 'Checked live tracking', send_order_update: 'Updated the customer',
  list_services: 'Looked at your services', check_availability: 'Checked free times', find_my_bookings: 'Found the customer’s bookings', booking_link: 'Made a booking link', reschedule_booking: 'Move a booking', cancel_booking: 'Cancel a booking',
  auto_reply: 'Replied to the customer', issue_coupon: 'Issued a coupon', start_doa_claim: 'Started a dead-on-arrival claim', create_draft_order: 'Created a draft order',
}

export type ExplainStep = {
  kind: string
  action: string | null
  label: string
  /** allowed | suggested | needs_approval | denied | sent_alone */
  decision: string | null
  decisionReason: string | null
  why: string | null
  status: string | null
  /** One plain line about what it found or said. */
  detail: string | null
}

export type Explanation = {
  run: { id: string; role: string; mode: string; status: string; outcome: string | null; intent: string | null; summary: string | null; message: string | null; createdAt: string; conversationId: string | null }
  steps: ExplainStep[]
  knew: string[]
}

const clip = (s: any, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

function detailFor(action: string | null, input: any, output: any): string | null {
  if (!action) return null
  const o = output || {}
  if (o.error) return clip(o.error)
  // A task it added to (an open one already covered the job) or skipped (daily cap): say so, not "Created".
  if (action === 'create_task' && o.updated) return clip(`Added to the open task “${o.task}”${Array.isArray(o.addedSteps) && o.addedSteps.length ? `: ${o.addedSteps.join('; ')}` : ' — nothing new to add'}`, 260)
  if (action === 'create_task' && o.skipped) return clip(`No task made: ${o.reason || 'skipped'}`, 220)
  switch (action) {
    case 'send_message': case 'auto_reply': case 'reply_to_review': case 'reply_to_comment': case 'send_cart_followup': case 'send_order_update': case 'send_sales_followup': return input?.text ? clip(input.text, 400) : null
    case 'get_cart': return o.summary ? clip(`${o.summary}${o.total ? ` · ${o.total}` : ''}${o.canMessage === false ? ` — not messaged: ${o.whyNot || 'not allowed'}` : ''}`, 220) : null
    case 'get_opportunity': return o.what ? clip(`${o.what}${o.total ? ` · ${o.total}` : ''}${o.daysAgo != null ? ` · ${o.daysAgo} days ago` : ''}${o.stillOpen === false ? ` — ${o.closedBecause}` : ''}`, 220) : null
    case 'get_exception': return o.order?.orderNumber ? clip(`Order #${o.order.orderNumber}: ${o.issue || ''}`, 220) : null
    case 'check_availability': return Array.isArray(o.free) ? (o.free.length ? clip(`${o.service}: ${o.free.slice(0, 3).map((d: any) => `${d.day} ${d.times.slice(0, 3).join(', ')}`).join(' · ')}`, 220) : clip(o.note || 'Nothing free')) : null
    case 'find_my_bookings': return Array.isArray(o.bookings) ? (o.bookings.length ? clip(o.bookings.map((b: any) => `${b.service} ${b.when}`).join(' · '), 220) : clip(o.note || o.needs || 'No bookings')) : null
    case 'booking_link': return o.link ? `Link${o.service ? ` for ${o.service}` : ''}: ${o.link}` : null
    case 'reschedule_booking': case 'cancel_booking': return o.preview || null
    case 'get_comment': return o.wrote ? clip(`${o.network || 'Comment'} — ${o.author || 'someone'}: “${o.wrote}”`, 260) : null
    case 'get_review': return o.stars != null || o.wrote ? clip(`${o.stars ?? '?'}★ from ${o.reviewer || 'a customer'}: “${o.wrote || ''}”`, 260) : null
    case 'escalate_to_human': return input?.message_for_team ? clip(input.message_for_team) : null
    case 'create_task': return input?.title ? clip(input.title) : null
    case 'check_order_status': case 'check_order_tracking': {
      const v = o.assessment?.verdict
      const verdict = v === 'normal' ? 'looks normal' : v === 'needs_attention' ? 'needs a look' : v === 'escalate' ? 'needs a person' : null
      return o.orderNumber ? clip(`Order #${o.orderNumber}: ${String(o.stage || 'unknown').replace(/_/g, ' ')}${verdict ? ` — ${verdict}` : ''}${o.assessment?.reasons?.[0] ? `. ${o.assessment.reasons[0]}` : ''}`, 220) : null
    }
    case 'find_customer_orders': {
      if (Array.isArray(o.orders)) return o.orders.length ? `Found ${o.orders.length} order${o.orders.length === 1 ? '' : 's'}${o.orders[0]?.orderNumber ? ` (latest #${o.orders[0].orderNumber})` : ''}` : clip(o.note || o.needs || 'No orders found')
      return null
    }
    case 'get_business_hours': {
      const places = Array.isArray(o.places) ? o.places : []
      if (!places.length) return 'No opening hours on file'
      return clip(places.map((p: any) => { const t = (p.days || []).find((d: any) => d.label === 'tomorrow') || (p.days || [])[0]; return `${p.store}: ${t ? `${t.label || t.day} ${t.hours}` : 'hours found'}` }).join(' · '), 220)
    }
    case 'ask_knowledge':
      return o.found === false ? 'Nothing in your knowledge covers it' : Array.isArray(o.sources) ? clip(`Found: ${o.sources.slice(0, 3).map((s: any) => s.title).filter(Boolean).join(', ')}`) : null
    case 'check_stock':
      return Array.isArray(o.products) ? (o.products.length ? clip(o.products.slice(0, 3).map((p: any) => `${p.name}: ${String(p.stockStatus || '').replace(/_/g, ' ')}`).join(' · ')) : 'No matching products') : null
    default: return null
  }
}

/** Which run made this? By run id, or by what it created (a task, a conversation…). */
export async function findRunId(db: any, companyId: string, ref: { runId?: string | null; entityType?: string | null; entityId?: string | null }): Promise<string | null> {
  if (ref.runId) return ref.runId
  if (!ref.entityType || !ref.entityId) return null
  const { data } = await db.from('agent_steps').select('run_id, created_at').eq('company_id', companyId).eq('entity_type', ref.entityType).eq('entity_id', ref.entityId)
    .order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.run_id || null
}

export async function explainRun(db: any, companyId: string, runId: string): Promise<Explanation | null> {
  const { data: run } = await db.from('agent_runs').select('id, role_key, mode, status, outcome, intent, summary, input, created_at, conversation_id, context_refs')
    .eq('company_id', companyId).eq('id', runId).maybeSingle()
  if (!run) return null
  const { data: rows } = await db.from('agent_steps').select('seq, kind, action_key, input, output, reason, decision, decision_reason, status')
    .eq('run_id', run.id).order('seq', { ascending: true }).limit(200)

  const steps: ExplainStep[] = []
  for (const s of (rows || []) as any[]) {
    if (s.kind === 'model' || s.kind === 'context' || s.kind === 'finish') continue
    if (s.kind === 'action' && ['get_conversation', 'get_contact'].includes(s.action_key) && s.status === 'ok') continue  // routine reads
    const sentAlone = s.kind === 'action' && ['send_message', 'auto_reply', 'reply_to_review', 'reply_to_comment', 'send_cart_followup', 'send_order_update', 'send_sales_followup'].includes(s.action_key) && s.decision === 'allowed' && s.status === 'ok'
    steps.push({
      kind: s.kind,
      action: s.action_key || null,
      label: s.kind === 'approval'
        ? (s.decision === 'denied' ? 'Dismissed by the team' : String(s.decision_reason || '').includes('edited') ? `Edited and ${['reply_to_review', 'reply_to_comment'].includes(s.action_key) ? 'posted' : 'sent'} by the team` : `Approved and ${['reply_to_review', 'reply_to_comment'].includes(s.action_key) ? 'posted' : 'sent'} by the team`)
        : s.kind === 'error' ? 'Stopped' : (LABEL[s.action_key] || String(s.action_key || s.kind).replace(/_/g, ' ')),
      decision: sentAlone ? 'sent_alone' : s.decision || null,
      decisionReason: s.decision_reason || null,
      why: s.reason || null,
      status: s.status || null,
      detail: detailFor(s.action_key, s.input, s.output),
    })
    if (s.kind === 'action' && s.action_key === 'create_task' && (s.output?.updated || s.output?.skipped)) steps[steps.length - 1].label = s.output.updated ? 'Added to an open task' : 'Didn’t make a task'
  }

  return {
    run: {
      id: run.id, role: activityName(run.role_key, run.input), mode: run.mode, status: run.status, outcome: run.outcome || null, intent: run.intent || null,
      summary: run.summary || null, message: run.input?.message ? clip(run.input.message, 500) : null, createdAt: run.created_at, conversationId: run.conversation_id || null,
    },
    steps,
    knew: (Array.isArray(run.context_refs) ? run.context_refs : []).map((r: any) => String(r.label || '')).filter(Boolean).slice(0, 20),
  }
}
