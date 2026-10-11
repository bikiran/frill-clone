// Phase 3: incoming customer messages start the Support Agent.
//
// Called (in after()) for every inbound SMS / website chat that reaches
// /api/ai/reply. Only for businesses that switched the Support Agent on
// (agent_roles.enabled). Waits a few seconds so a burst of messages becomes one
// run, keyed on the latest customer message (dedupe), and stays out of it if a
// person has already replied.
//
// What the agent may do is decided by its policies: by default send_message
// is "prepare", so its reply becomes a suggestion for the team. A business can
// let it send some replies on its own (Phase 4, lib/agent/pilot.ts). Nothing
// starts while agents are paused.

import { enqueueRun, runAgent } from './engine'
import { agentsPaused } from './pilot'

export const AGENT_CHANNELS = new Set(['sms', 'widget', 'chat'])
export const DEBOUNCE_MS = 6000

export async function startSupportAgentForConversation(db: any, conversationId: string, opts: { debounceMs?: number; deadlineMs?: number } = {}) {
  const { data: conv } = await db.from('conversations').select('id, company_id, channel, contact_id').eq('id', conversationId).maybeSingle()
  if (!conv?.company_id || !AGENT_CHANNELS.has(String(conv.channel || 'chat'))) return { started: false, reason: 'channel' }
  const { data: role } = await db.from('agent_roles').select('enabled').eq('company_id', conv.company_id).eq('role_key', 'support').maybeSingle().then((r: any) => r, () => ({ data: null }))
  if (!role?.enabled) return { started: false, reason: 'off' }
  if ((await agentsPaused(db, conv.company_id)).paused) return { started: false, reason: 'paused' }

  await new Promise(r => setTimeout(r, opts.debounceMs ?? DEBOUNCE_MS))

  const { data: msgs } = await db.from('messages').select('id, sender_type, is_ai, is_internal, content, created_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(15)
  const list = (msgs || []).filter((m: any) => !m.is_internal)
  const lastCustomer = list.find((m: any) => m.sender_type === 'visitor')
  if (!lastCustomer) return { started: false, reason: 'no customer message' }
  if (Date.now() - new Date(lastCustomer.created_at).getTime() > 15 * 60_000) return { started: false, reason: 'stale' }
  // A person already answered after the customer — they're handling it.
  const humanSince = list.some((m: any) => m.sender_type === 'agent' && !m.is_ai && new Date(m.created_at) > new Date(lastCustomer.created_at))
  if (humanSince) return { started: false, reason: 'human replied' }
  // Colvy AI's older auto-reply (or a keyword reply) already answered it.
  const aiSince = list.some((m: any) => m.sender_type === 'agent' && m.is_ai && new Date(m.created_at) > new Date(lastCustomer.created_at))
  if (aiSince) return { started: false, reason: 'already answered' }
  // Collect the customer's latest burst (their messages since anyone else spoke).
  const burst: string[] = []
  for (const m of list) { if (m.sender_type !== 'visitor') break; burst.unshift(String(m.content || '').trim()) }

  const { runId, deduped } = await enqueueRun(db, {
    type: 'inbound_message', mode: 'live', companyId: conv.company_id, roleKey: 'support',
    conversationId, contactId: conv.contact_id || null, ref: lastCustomer.id, dedupeKey: `msg:${lastCustomer.id}`,
    input: { message: burst.filter(Boolean).join('\n').slice(0, 4000), messageId: lastCustomer.id, channel: conv.channel },
  })
  if (deduped) return { started: false, reason: 'already running', runId }
  await runAgent(db, runId, Date.now() + (opts.deadlineMs ?? 200_000))
  return { started: true, runId }
}
