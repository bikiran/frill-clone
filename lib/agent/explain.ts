// "Why did Colvy do this?" (Phase 6)
//
// Anything an agent did — a reply in the inbox, a hand-off to the team, a task
// — can be traced back to its run. This turns a run into a short, readable
// account: what the customer asked, what the agent checked and found, what it
// did and which permission allowed it, and who approved it. The full trail
// stays on the AI Agents page.

import { ROLES } from './roles'

const LABEL: Record<string, string> = {
  get_conversation: 'Read the conversation', get_contact: 'Looked up the customer', ask_knowledge: 'Searched your knowledge',
  check_stock: 'Checked stock', find_customer_orders: 'Found the customer’s orders', check_order_status: 'Checked order tracking',
  get_business_hours: 'Checked opening hours', create_task: 'Created a task', send_message: 'Replied to the customer',
  escalate_to_human: 'Handed it to the team', search_orders: 'Searched orders', get_order: 'Looked up an order',
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
  switch (action) {
    case 'send_message': return input?.text ? clip(input.text, 400) : null
    case 'escalate_to_human': return input?.message_for_team ? clip(input.message_for_team) : null
    case 'create_task': return input?.title ? clip(input.title) : null
    case 'check_order_status': {
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
    const sentAlone = s.kind === 'action' && s.action_key === 'send_message' && s.decision === 'allowed' && s.status === 'ok'
    steps.push({
      kind: s.kind,
      action: s.action_key || null,
      label: s.kind === 'approval'
        ? (s.decision === 'denied' ? 'Dismissed by the team' : String(s.decision_reason || '').includes('edited') ? 'Edited and sent by the team' : 'Approved and sent by the team')
        : s.kind === 'error' ? 'Stopped' : (LABEL[s.action_key] || String(s.action_key || s.kind).replace(/_/g, ' ')),
      decision: sentAlone ? 'sent_alone' : s.decision || null,
      decisionReason: s.decision_reason || null,
      why: s.reason || null,
      status: s.status || null,
      detail: detailFor(s.action_key, s.input, s.output),
    })
  }

  return {
    run: {
      id: run.id, role: ROLES[run.role_key]?.name || run.role_key, mode: run.mode, status: run.status, outcome: run.outcome || null, intent: run.intent || null,
      summary: run.summary || null, message: run.input?.message ? clip(run.input.message, 500) : null, createdAt: run.created_at, conversationId: run.conversation_id || null,
    },
    steps,
    knew: (Array.isArray(run.context_refs) ? run.context_refs : []).map((r: any) => String(r.label || '')).filter(Boolean).slice(0, 20),
  }
}
