// Phase 3: incoming customer messages start the Support Agent — or, for
// booking talk when it's switched on, the Reception Agent (Phase 8).
//
// Called (in after()) for every inbound SMS / website chat that reaches
// /api/ai/reply, every Facebook / Instagram message (Meta webhook) and every
// inbound email (forwarding webhook, Gmail sync). Only for businesses that
// switched the Support Agent on (agent_roles.enabled), and only on the channels
// they chose (SMS and chat by default; email and Meta when switched on). Waits a few seconds so a burst of messages becomes one
// run, keyed on the latest customer message (dedupe), and stays out of it if a
// person has already replied.
//
// What the agent may do is decided by its policies: by default send_message
// is "prepare", so its reply becomes a suggestion for the team. A business can
// let it send some replies on its own (Phase 4, lib/agent/pilot.ts). Nothing
// starts while agents are paused.

import { enqueueRun, runAgent } from './engine'
import { agentsPaused, getAgentChannels, channelKey } from './pilot'
import { agentsOnPlan } from './access'
import { retireStaleSuggestions } from './approvals'

// Where Colvy AI's older auto-reply also runs — it stands down here once the
// Support Agent replies on its own (app/api/ai/reply).
export const AGENT_CHANNELS = new Set(['sms', 'widget', 'chat'])

// Emails nobody should answer: bounces, newsletters, notifications.
const AUTOMATED_SENDER = /(^|[.+_-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|newsletter|marketing|alerts?)([.+_-]|@)/i
export const DEBOUNCE_MS = 6000

// Booking talk goes to the Reception Agent; everything else (orders, products,
// opening hours…) to the Support Agent. Deterministic and recorded on the run,
// so "why did Reception answer this?" has an answer. One run per message
// either way (same dedupe key).
const BOOKING = /\b(book(ing|ed)?|appointment|appt|reschedul\w*|re-schedul\w*|availability|any (times|spots|slots)|free (time|slot)s?|slot|session|lesson|class(es)?|consult(ation)?|move my|change my (time|booking|appointment)|cancel my (booking|appointment|session|lesson|class))\b/i
const ORDERISH = /\b(order|parcel|delivery|deliver|shipping|shipped|tracking|refund my order)\b/i

export function pickRole(enabled: Set<string>, text: string): { roleKey: string; why: string } {
  if (enabled.size === 1) return { roleKey: [...enabled][0], why: 'only agent switched on' }
  if (enabled.has('reception') && BOOKING.test(text) && !ORDERISH.test(text)) return { roleKey: 'reception', why: 'about a booking' }
  return { roleKey: enabled.has('support') ? 'support' : 'reception', why: 'not about a booking' }
}

/**
 * opts.run = false only queues the run (the agent worker picks it up within a
 * minute) — for callers that can't wait, like the Gmail sync cron.
 */
// opts.channel: the channel the customer's message ARRIVED on, when it isn't
// the conversation's own. An email reply can thread onto an order (chat) or SMS
// conversation; the agent must then follow the email settings and answer by
// email, not by text or in a widget nobody is watching.
export async function startSupportAgentForConversation(db: any, conversationId: string, opts: { debounceMs?: number; deadlineMs?: number; run?: boolean; channel?: string | null } = {}) {
  const { data: conv } = await db.from('conversations').select('id, company_id, channel, contact_id').eq('id', conversationId).maybeSingle()
  const arrivedOn = opts.channel || conv?.channel
  const key = channelKey(arrivedOn)
  if (!conv?.company_id || !key) return { started: false, reason: 'channel' }
  const { data: roleRows } = await db.from('agent_roles').select('role_key, enabled').eq('company_id', conv.company_id).in('role_key', ['support', 'reception']).then((r: any) => r, () => ({ data: [] }))
  const enabled = new Set<string>((roleRows || []).filter((r: any) => r.enabled).map((r: any) => r.role_key))
  if (!enabled.size) return { started: false, reason: 'off' }
  // Suppliers (customer profile → Relationship) aren't customers: the agent leaves them to the team.
  if (conv.contact_id) {
    const { data: ct } = await db.from('contacts').select('relationship_type').eq('id', conv.contact_id).maybeSingle().then((r: any) => r, () => ({ data: null }))
    if (ct?.relationship_type === 'supplier') return { started: false, reason: 'supplier' }
  }
  if (!(await getAgentChannels(db, conv.company_id)).includes(key)) return { started: false, reason: 'channel off' }
  if ((await agentsPaused(db, conv.company_id)).paused) return { started: false, reason: 'paused' }
  if (!(await agentsOnPlan(db, conv.company_id))) return { started: false, reason: 'plan' }

  await new Promise(r => setTimeout(r, opts.debounceMs ?? DEBOUNCE_MS))

  const { data: msgs } = await db.from('messages').select('id, sender_type, is_ai, is_internal, content, created_at, sender_email, metadata')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(15)
  // The automatic missed-call text (lib/missed-call-text) isn't anyone answering
  // the customer, so it neither stops the agent nor ends their latest burst.
  const list = (msgs || []).filter((m: any) => !m.is_internal && !m.metadata?.missed_call_text)
  const lastCustomer = list.find((m: any) => m.sender_type === 'visitor')
  if (!lastCustomer) return { started: false, reason: 'no customer message' }
  if (Date.now() - new Date(lastCustomer.created_at).getTime() > 15 * 60_000) return { started: false, reason: 'stale' }
  if (key === 'email' && AUTOMATED_SENDER.test(String(lastCustomer.sender_email || ''))) return { started: false, reason: 'automated email' }
  // A person already answered after the customer — they're handling it.
  const humanSince = list.some((m: any) => m.sender_type === 'agent' && !m.is_ai && new Date(m.created_at) > new Date(lastCustomer.created_at))
  if (humanSince) return { started: false, reason: 'human replied' }
  // Colvy AI's older auto-reply (or a keyword reply) already answered it.
  const aiSince = list.some((m: any) => m.sender_type === 'agent' && m.is_ai && new Date(m.created_at) > new Date(lastCustomer.created_at))
  if (aiSince) return { started: false, reason: 'already answered' }
  // Collect the customer's latest burst (their messages since anyone else spoke).
  const burst: string[] = []
  for (const m of list) { if (m.sender_type !== 'visitor') break; burst.unshift(String(m.content || '').trim()) }

  const text = burst.filter(Boolean).join('\n')
  if (!text.trim()) return { started: false, reason: 'no text' }   // a photo or sticker on its own
  const { roleKey, why } = pickRole(enabled, text)
  const { runId, deduped } = await enqueueRun(db, {
    type: 'inbound_message', mode: 'live', companyId: conv.company_id, roleKey,
    conversationId, contactId: conv.contact_id || null, ref: lastCustomer.id, dedupeKey: `msg:${lastCustomer.id}`,
    input: { message: text.slice(0, 4000), messageId: lastCustomer.id, channel: arrivedOn, routed: why },
  })
  if (deduped) return { started: false, reason: 'already running', runId }
  // Suggestions drafted for earlier messages are out of date now — this run answers the lot.
  await retireStaleSuggestions(db, conv.company_id, conversationId, { keepRunId: runId })
  if (opts.run === false) return { started: true, queued: true, runId }
  await runAgent(db, runId, Date.now() + (opts.deadlineMs ?? 200_000))
  return { started: true, runId }
}
