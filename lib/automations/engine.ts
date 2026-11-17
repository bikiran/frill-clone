// Colvy Automations: running a flow for real. Called from the inbound hooks
// (every channel's customer message, and missed calls) and from the
// once-a-minute cron that picks up runs after a Wait. The flow itself, checks
// and the dry run are pure, in ./graph. docs/plans/automations.md has the plan.
//
// Rules:
//  - A run starts in one locked step in the database (automation_start_run):
//    switched on, the same message or call never twice, the trigger's
//    cool-down per conversation, and a daily limit per flow.
//  - One automated reply per customer message, however many flows match.
//  - Replies are saved as Colvy's own (is_ai), so Colvy AI and the Support
//    Agent don't answer the same message again, unless a flow says "Hand to
//    Colvy AI".
//  - Spam, blocked senders and businesses without automations on their plan
//    never run anything. Nothing here throws into the caller.

import {
  cleanGraph, triggerOf, triggerFires, nextOf, isCheck, check, fill, describe, problems, waitLabel, normChannel, LIMITS,
  type Graph, type GNode, type Facts, type TriggerType,
} from './graph'
import { sendAgentMessage } from '@/lib/agent/send'
import { sendAiReply } from '@/lib/ai-live-reply'
import { quietVerdict } from '@/lib/conversation-protection'
import { planAllows } from '@/lib/plan-gate'
import { textOptOut } from '@/lib/sms-consent'
import { staffUserIds } from '@/lib/company-access'
import { notifyCompany } from '@/lib/notify'
import { upsertTask } from '@/lib/task-dedupe'
import { loadBusinessHours, hoursOutlook, localNow, addDays } from '@/lib/business-hours'
import { internalHeaders } from '@/lib/internal-call'

export const DAILY_CAP = 500                // runs per flow per 24 hours
const STALE_MS = 20 * 60_000                // a customer message older than this doesn't start anything
const MAX_FLOWS = 25                        // live flows looked at per event
const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

export type RunStep = { node: string; kind: string; at: string; result?: 'yes' | 'no'; ok?: boolean; note?: string }
export type RunContext = {
  trigger: TriggerType
  channel: string            // the channel it arrived on (raw: widget, sms, email, facebook…)
  since: string              // when the customer wrote / the call came in
  messageId?: string | null
  callId?: string | null
  phone?: string | null
  text?: string
}
type Flow = { id: string; name: string; graph: any }
type Ev = { replied: boolean; handToAi: boolean; paused: boolean }
type Run = {
  id: string; companyId: string; flow: Flow; graph: Graph; conv: any | null; ctx: RunContext
  steps: RunStep[]; ev: Ev; resumed: boolean; memo: Record<string, any>
}
export type EventResult = { ran: number; replied: boolean; handToAi: boolean; paused: boolean; skipped?: string }

/** Why Colvy AI and the agents should stay out of this message, or null when they carry on as usual. */
export function aiStandsDown(r: EventResult | null | undefined): string | null {
  if (!r) return null
  if (r.paused) return 'An automation paused Colvy AI on this conversation, so the team takes it.'
  if (r.replied && !r.handToAi) return 'An automation already replied to this message.'
  return null
}

const now = () => new Date().toISOString()
const isMissingTable = (e: any) => /^(42P01|PGRST205|PGRST202|42883)$/.test(String(e?.code || '')) || /does not exist|could not find|schema cache/i.test(String(e?.message || ''))

async function liveFlows(db: any, companyId: string, type: TriggerType): Promise<Flow[]> {
  try {
    const { data, error } = await db.from('automations').select('id, name, graph')
      .eq('company_id', companyId).eq('enabled', true).eq('trigger_type', type)
      .order('created_at', { ascending: true }).limit(MAX_FLOWS)
    if (error) { if (!isMissingTable(error)) console.warn('[automations] flows', error.message); return [] }
    return data || []
  } catch { return [] }
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * A customer's message arrived. Runs every live "message" flow whose trigger
 * fits, once per message. opts.channel: the channel it ARRIVED on when that
 * isn't the conversation's own (an email threaded onto a chat).
 */
export async function runMessageAutomations(db: any, conversationId: string, opts: { channel?: string | null } = {}): Promise<EventResult> {
  const out: EventResult = { ran: 0, replied: false, handToAi: false, paused: false }
  try {
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv?.company_id) return { ...out, skipped: 'no conversation' }
    const flows = await liveFlows(db, conv.company_id, 'message')
    if (!flows.length) return { ...out, skipped: 'none' }
    if (await quietVerdict(db, conversationId)) return { ...out, skipped: 'protection' }
    if (!(await planAllows(db, conv.company_id, 'aiAutomation'))) return { ...out, skipped: 'plan' }

    const { data: msgs } = await db.from('messages').select('id, sender_type, is_internal, content, created_at, metadata')
      .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(15)
    const list = (msgs || []).filter((m: any) => !m.is_internal)
    const last = list.find((m: any) => m.sender_type === 'visitor')
    if (!last) return { ...out, skipped: 'no customer message' }
    if (Date.now() - Date.parse(last.created_at) > STALE_MS) return { ...out, skipped: 'stale' }
    const burst: string[] = []
    for (const m of list) { if (m.sender_type !== 'visitor') break; burst.unshift(String(m.content || '').trim()) }
    const { count } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversationId).eq('sender_type', 'visitor')
    const firstMessage = (typeof count === 'number' ? count : burst.length) <= burst.length

    const arrived = String(opts.channel || conv.channel || 'chat')
    const ctx: RunContext = { trigger: 'message', channel: arrived, since: last.created_at, messageId: last.id, text: burst.filter(Boolean).join('\n').slice(0, 2000) }
    const ev: Ev = { replied: false, handToAi: false, paused: false }
    const memo: Record<string, any> = {}
    for (const flow of flows) {
      const graph = cleanGraph(flow.graph)
      const t = triggerOf(graph)
      if (!t || problems(graph).length) continue
      if (triggerFires(t, { type: 'message', channel: arrived, firstMessage })) continue
      const runId = await startRun(db, conv.company_id, flow.id, `msg:${last.id}`, conv.id, t, ctx)
      if (!runId) continue
      out.ran++
      await execute(db, { id: runId, companyId: conv.company_id, flow, graph, conv, ctx, steps: [{ node: t.id, kind: 'trigger', at: now(), note: describe(t) }], ev, resumed: false, memo }, nextOf(graph, t.id, 'out'))
    }
    return { ...out, replied: ev.replied, handToAi: ev.handToAi, paused: ev.paused }
  } catch (e: any) {
    console.warn('[automations] message', e?.message || e)
    return { ...out, skipped: 'error' }
  }
}

/** A call came in and nobody answered. Runs every live "missed call" flow, once per call. */
export async function runMissedCallAutomations(db: any, companyId: string, callId: string): Promise<EventResult> {
  const out: EventResult = { ran: 0, replied: false, handToAi: false, paused: false }
  try {
    if (!companyId || !callId) return { ...out, skipped: 'no call' }
    const flows = await liveFlows(db, companyId, 'missed_call')
    if (!flows.length) return { ...out, skipped: 'none' }
    const { data: call } = await db.from('calls').select('*').eq('id', callId).eq('company_id', companyId).maybeSingle()
    if (!call || String(call.direction || '').toLowerCase() !== 'inbound') return { ...out, skipped: 'not inbound' }
    const { wasAnswered } = await import('@/lib/missed-call-text')
    if (wasAnswered(call)) return { ...out, skipped: 'answered' }
    if (!(await planAllows(db, companyId, 'aiAutomation'))) return { ...out, skipped: 'plan' }
    let conv: any = null
    if (call.conversation_id) {
      const { data } = await db.from('conversations').select('*').eq('id', call.conversation_id).eq('company_id', companyId).maybeSingle()
      conv = data || null
    }
    if (conv && await quietVerdict(db, conv.id)) return { ...out, skipped: 'protection' }

    const ctx: RunContext = { trigger: 'missed_call', channel: 'phone', since: call.started_at || call.created_at || now(), callId, phone: call.from_number || null }
    const ev: Ev = { replied: false, handToAi: false, paused: false }
    const memo: Record<string, any> = {}
    for (const flow of flows) {
      const graph = cleanGraph(flow.graph)
      const t = triggerOf(graph)
      if (!t || problems(graph).length) continue
      if (triggerFires(t, { type: 'missed_call', channel: 'phone', firstMessage: false })) continue
      const runId = await startRun(db, companyId, flow.id, `call:${callId}`, conv?.id || null, t, ctx)
      if (!runId) continue
      out.ran++
      await execute(db, { id: runId, companyId, flow, graph, conv, ctx, steps: [{ node: t.id, kind: 'trigger', at: now(), note: describe(t) }], ev, resumed: false, memo }, nextOf(graph, t.id, 'out'))
    }
    return { ...out, replied: ev.replied }
  } catch (e: any) {
    console.warn('[automations] missed call', e?.message || e)
    return { ...out, skipped: 'error' }
  }
}

async function startRun(db: any, companyId: string, flowId: string, event: string, conversationId: string | null, t: GNode, ctx: RunContext): Promise<string | null> {
  const { data, error } = await db.rpc('automation_start_run', {
    p_company: companyId, p_automation: flowId, p_event: event, p_conversation: conversationId,
    p_cooldown_min: Math.round(Number(t.config.cooldownHours || 0) * 60), p_daily_cap: DAILY_CAP, p_context: ctx,
  })
  if (error) { if (!isMissingTable(error)) console.warn('[automations] start', error.message); return null }
  return data?.ok ? String(data.run_id) : null
}

// ── Waits ────────────────────────────────────────────────────────────────────

/** Carry on runs whose Wait is over (the cron, once a minute). */
export async function resumeDue(db: any, opts: { limit?: number; deadline?: number } = {}): Promise<{ resumed: number; skipped: number }> {
  const res = { resumed: 0, skipped: 0 }
  const { data: runs, error } = await db.rpc('automation_claim_due', { p_limit: opts.limit ?? 50 })
  if (error) { if (isMissingTable(error)) return res; throw error }
  for (const row of runs || []) {
    if (opts.deadline && Date.now() > opts.deadline) {
      // Out of time: hand it back for the next minute.
      await db.from('automation_runs').update({ status: 'waiting', updated_at: now() }).eq('id', row.id)
      continue
    }
    try {
      const steps: RunStep[] = Array.isArray(row.steps) ? row.steps : []
      const stop = async (why: string) => {
        res.skipped++
        await db.from('automation_runs').update({ status: 'skipped', steps: [...steps, { node: row.resume_node || '', kind: 'stop', at: now(), note: why }].slice(-LIMITS.steps * 2), resume_at: null, resume_node: null, updated_at: now() }).eq('id', row.id)
      }
      const { data: flow } = await db.from('automations').select('id, name, graph, enabled, company_id').eq('id', row.automation_id).maybeSingle()
      if (!flow || flow.company_id !== row.company_id) { await stop('The automation was deleted.'); continue }
      if (!flow.enabled) { await stop('The automation was switched off while this was waiting.'); continue }
      if (!(await planAllows(db, row.company_id, 'aiAutomation'))) { await stop('Automations aren’t on this plan any more.'); continue }
      let conv: any = null
      if (row.conversation_id) {
        const { data } = await db.from('conversations').select('*').eq('id', row.conversation_id).eq('company_id', row.company_id).maybeSingle()
        conv = data || null
        if (!conv) { await stop('The conversation was deleted.'); continue }
        if (await quietVerdict(db, conv.id)) { await stop('The conversation was marked as spam or blocked.'); continue }
      }
      const { graph: snap, ...ctx } = (row.context || {}) as RunContext & { graph?: Graph }
      // The flow as it was when the run started, so an edit mid-wait can't send it somewhere odd.
      const graph = cleanGraph(snap || flow.graph)
      res.resumed++
      await execute(db, { id: row.id, companyId: row.company_id, flow, graph, conv, ctx: ctx as RunContext, steps, ev: { replied: false, handToAi: false, paused: false }, resumed: true, memo: {} }, row.resume_node)
    } catch (e: any) {
      console.warn('[automations] resume', row.id, e?.message || e)
      await db.from('automation_runs').update({ status: 'failed', error: String(e?.message || e).slice(0, 300), updated_at: now() }).eq('id', row.id)
    }
  }
  return res
}

// ── Walking the flow ─────────────────────────────────────────────────────────

async function execute(db: any, r: Run, from: string | null): Promise<void> {
  let id = from
  let error: string | null = null
  let guard = 0
  const seen = new Set<string>()
  try {
    while (id && !seen.has(id) && guard++ < LIMITS.steps) {
      seen.add(id)
      const n = r.graph.nodes.find(x => x.id === id)
      if (!n) break
      if (isCheck(n.kind)) {
        const yes = check(n, await factsFor(db, r, n))
        r.steps.push({ node: n.id, kind: n.kind, at: now(), result: yes ? 'yes' : 'no' })
        id = nextOf(r.graph, n.id, yes ? 'yes' : 'no')
        continue
      }
      if (n.kind === 'wait') {
        const next = nextOf(r.graph, n.id, 'out')
        const minutes = Number(n.config.minutes) || 15
        r.steps.push({ node: n.id, kind: n.kind, at: now(), note: `Waiting ${waitLabel(minutes)}` })
        if (!next) break
        await db.from('automation_runs').update({
          status: 'waiting', resume_at: new Date(Date.now() + minutes * 60_000).toISOString(), resume_node: next,
          steps: r.steps, context: { ...r.ctx, graph: r.graph }, error, updated_at: now(),
        }).eq('id', r.id)
        return
      }
      let res: { ok: boolean; note: string }
      try { res = await act(db, r, n) } catch (e: any) { res = { ok: false, note: String(e?.message || e).slice(0, 200) } }
      r.steps.push({ node: n.id, kind: n.kind, at: now(), ok: res.ok, note: res.note })
      if (!res.ok && !error) error = res.note
      id = nextOf(r.graph, n.id, 'out')
    }
    await db.from('automation_runs').update({ status: error ? 'failed' : 'done', steps: r.steps, error, resume_at: null, resume_node: null, context: r.ctx, updated_at: now() }).eq('id', r.id)
  } catch (e: any) {
    await db.from('automation_runs').update({ status: 'failed', steps: r.steps, error: String(e?.message || e).slice(0, 300), updated_at: now() }).eq('id', r.id).then(() => {}, () => {})
  }
}

// What a check needs to know, looked up only when a check asks (and once per event).
async function factsFor(db: any, r: Run, n: GNode): Promise<Facts> {
  const f: Facts = { trigger: r.ctx.trigger, text: r.ctx.text || '', channel: normChannel(r.ctx.channel), openNow: null, tags: [], isNew: false, unanswered: false }
  const conv = r.conv
  if (n.kind === 'if_hours') f.openNow = await memo(r, 'open', () => openNow(db, r.companyId))
  if (n.kind === 'if_tag') f.tags = await memo(r, 'tags', async () => {
    if (!conv?.contact_id) return []
    const { data } = await db.from('contacts').select('tags').eq('id', conv.contact_id).maybeSingle()
    return Array.isArray(data?.tags) ? data.tags.map(String) : []
  })
  if (n.kind === 'if_new') f.isNew = await memo(r, 'new', async () => {
    if (!conv) return true
    if (!conv.contact_id) return true
    const { data } = await db.from('conversations').select('id').eq('company_id', r.companyId).eq('contact_id', conv.contact_id).neq('id', conv.id).lt('created_at', conv.created_at || now()).limit(1)
    return !(data || []).length
  })
  // Asked fresh every time: it's usually checked after a Wait.
  if (n.kind === 'if_unanswered') f.unanswered = await unanswered(db, r)
  return f
}
async function memo<T>(r: Run, key: string, fn: () => Promise<T>): Promise<T> {
  if (!(key in r.memo)) r.memo[key] = await fn().catch(() => null)
  return r.memo[key]
}

/** Is any of the business's places open right now? null when its hours aren't known. */
async function openNow(db: any, companyId: string): Promise<boolean | null> {
  try {
    const hours = await loadBusinessHours(db, companyId)
    const places = hoursOutlook(hours, { days: 1 }).places
    if (places.some((p: any) => p.openNow === true)) return true
    if (places.some((p: any) => p.openNow === false)) return false
    return null
  } catch { return null }
}

/** Nobody (a person or Colvy AI) has answered since the customer last wrote or called. Automatic acknowledgements don't count. */
async function unanswered(db: any, r: Run): Promise<boolean> {
  const conv = r.conv
  if (!conv) return true
  let since = r.ctx.since
  if (r.ctx.trigger === 'message') {
    const { data: lastIn } = await db.from('messages').select('created_at').eq('conversation_id', conv.id).eq('sender_type', 'visitor')
      .order('created_at', { ascending: false }).limit(1)
    if (lastIn?.[0]?.created_at && lastIn[0].created_at > since) since = lastIn[0].created_at
  }
  const { data: replies } = await db.from('messages').select('id, metadata, is_internal').eq('conversation_id', conv.id).eq('sender_type', 'agent').gt('created_at', since).limit(30)
  const real = (replies || []).filter((m: any) => !m.is_internal && !m.metadata?.automation_id && !m.metadata?.missed_call_text)
  if (real.length) return false
  if (r.ctx.trigger === 'missed_call') {
    const { data: calls } = await db.from('calls').select('id, direction, status, answered_at, answered_by_user_id').eq('company_id', r.companyId).eq('conversation_id', conv.id).gt('created_at', since).limit(20)
    if ((calls || []).some((c: any) => c.id !== r.ctx.callId && (String(c.direction).toLowerCase() === 'outbound' || c.answered_at || c.answered_by_user_id))) return false
  }
  return true
}

async function names(db: any, r: Run): Promise<{ firstName: string | null; name: string | null; business: string | null }> {
  return memo(r, 'names', async () => {
    const [{ data: co }, ct] = await Promise.all([
      db.from('companies').select('name').eq('id', r.companyId).maybeSingle(),
      r.conv?.contact_id ? db.from('contacts').select('name').eq('id', r.conv.contact_id).maybeSingle().then((x: any) => x.data, () => null) : Promise.resolve(null),
    ])
    const name = String(ct?.name || '').trim() || null
    const looksLikeName = !!name && !/[@\d]/.test(name)
    return { firstName: looksLikeName ? name!.split(/\s+/)[0] : null, name: looksLikeName ? name : null, business: co?.name || null }
  })
}
const staff = (db: any, r: Run) => memo(r, 'staff', () => staffUserIds(db, r.companyId)) as Promise<Set<string>>
const who = (r: Run) => `Automation “${r.flow.name}”`

// ── Doing each step ──────────────────────────────────────────────────────────

async function act(db: any, r: Run, n: GNode): Promise<{ ok: boolean; note: string }> {
  const c = n.config
  const conv = r.conv
  const needConv = () => ({ ok: false, note: r.ctx.trigger === 'missed_call' ? 'This call has no conversation to act on.' : 'The conversation is gone.' })
  const event = (event_type: string, detail: string) => db.from('conversation_events').insert({
    conversation_id: conv.id, company_id: r.companyId, event_type, actor_name: who(r), detail, metadata: { automation_id: r.flow.id, automation_run_id: r.id },
  }).then(() => {}, () => {})

  switch (n.kind) {
    case 'reply': {
      if (!conv) return needConv()
      if (r.ev.replied) return { ok: true, note: 'Skipped: another automation already replied to this message.' }
      const nm = await names(db, r)
      const text = fill(c.text, nm).trim()
      if (!text) return { ok: false, note: 'The reply is empty.' }
      const meta = { automation_id: r.flow.id, automation_run_id: r.id, automation_name: r.flow.name, agent_name: 'Automation', ai: true }
      const viaText = conv.channel === 'phone' || (conv.channel === 'sms' && r.ctx.channel !== 'email')
      if (viaText) {
        const phone = conv.sms_number || r.ctx.phone || null
        const { state } = await textOptOut(db, r.companyId, phone, conv.contact_id || null)
        if (state !== 'ok') return { ok: false, note: state === 'opted_out' ? 'Not sent: the customer opted out of texts.' : 'Not sent: couldn’t check whether the customer opted out of texts.' }
      }
      const sent = conv.channel === 'phone'
        ? await sendAiReply(db, { conv: { ...conv, channel: 'sms', sms_number: conv.sms_number || r.ctx.phone }, companyId: r.companyId, businessName: nm.business || 'Us', text, meta })
        : await sendAgentMessage(db, { companyId: r.companyId, conversationId: conv.id, text, runId: '', agentName: 'Automation', channel: r.ctx.channel === 'email' ? 'email' : null, meta })
      if (!sent.ok) return { ok: false, note: `Not sent: ${sent.error || 'the reply couldn’t be sent.'}` }
      r.ev.replied = true
      return { ok: true, note: describe({ ...n, config: { text } }) }
    }
    case 'assign': {
      if (!conv) return needConv()
      if (!(await staff(db, r)).has(c.userId)) return { ok: false, note: 'That person isn’t on the team any more. Pick someone else.' }
      let name = c.name
      if (!name) {
        const { data } = await db.from('team_members').select('name').eq('company_id', r.companyId).eq('user_id', c.userId).maybeSingle().then((x: any) => x, () => ({ data: null }))
        name = data?.name || 'a teammate'
      }
      await db.from('conversations').update({ assigned_to: c.userId, assigned_name: name, status: 'assigned' }).eq('id', conv.id).eq('company_id', r.companyId)
      conv.assigned_to = c.userId
      await event('assigned', `${who(r)} assigned this conversation to ${name}`)
      const nm = await names(db, r)
      const customer = nm.name || 'a customer'
      await db.from('notifications').insert({
        user_id: c.userId, company_id: r.companyId, type: 'conversation_assigned', message: `${who(r)} assigned you the conversation with ${customer}`,
        actor_name: 'Automation', conversation_id: conv.id, is_read: false,
      }).then(() => {}, () => {})
      await fetch(`${origin()}/api/push/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ companyId: r.companyId, userIds: [c.userId], title: 'A conversation was assigned to you', body: `With ${customer}`, conversationId: conv.id }),
      }).catch(() => null)
      return { ok: true, note: `Assigned to ${name}` }
    }
    case 'tag': {
      if (!conv?.contact_id) return { ok: false, note: 'There’s no customer profile to tag.' }
      const { data: ct } = await db.from('contacts').select('tags').eq('id', conv.contact_id).eq('company_id', r.companyId).maybeSingle()
      if (!ct) return { ok: false, note: 'There’s no customer profile to tag.' }
      const tags: string[] = Array.isArray(ct.tags) ? ct.tags.map(String) : []
      if (tags.some(t => t.toLowerCase() === String(c.tag).toLowerCase())) return { ok: true, note: `Already tagged “${c.tag}”` }
      const { error } = await db.from('contacts').update({ tags: [...tags, c.tag] }).eq('id', conv.contact_id).eq('company_id', r.companyId)
      if (error) return { ok: false, note: 'The tag couldn’t be saved.' }
      if (r.memo.tags) r.memo.tags = [...r.memo.tags, c.tag]
      return { ok: true, note: `Tagged “${c.tag}”` }
    }
    case 'task': {
      const nm = await names(db, r)
      const title = fill(c.title, nm).trim()
      if (!title) return { ok: false, note: 'The task has no title.' }
      let assignees: { id: string; name: string }[] = []
      if (c.assigneeId && (await staff(db, r)).has(c.assigneeId)) assignees = [{ id: c.assigneeId, name: c.assigneeName || 'Teammate' }]
      let dueDate: string | null = null
      if (Number(c.dueDays) >= 0) {
        const tz = await memo(r, 'tz', async () => (await loadBusinessHours(db, r.companyId)).timezone || 'Australia/Melbourne')
        dueDate = addDays(localNow(tz || 'Australia/Melbourne').date, Number(c.dueDays))
      }
      const res = await upsertTask(db, {
        companyId: r.companyId, conversationId: conv?.id || null, contactId: conv?.contact_id || null, title,
        details: r.ctx.trigger === 'missed_call' && r.ctx.phone ? `Missed call from ${r.ctx.phone}` : (r.ctx.text ? `Customer wrote: “${r.ctx.text.slice(0, 300)}”` : null),
        assignees, dueDate, source: 'automation', createdBy: 'Automation', actorName: who(r), sourceLabel: 'automation', mode: 'auto',
      })
      if (!res.ok) return { ok: false, note: res.error || 'The task couldn’t be created.' }
      return { ok: true, note: res.action === 'created' ? `Task created: ${title}` : res.action === 'held' ? `Task held back: ${res.reason || 'too many today'}` : `Added to the open task “${res.title}”` }
    }
    case 'note': {
      if (!conv) return needConv()
      const text = fill(c.text, await names(db, r)).trim()
      if (!text) return { ok: false, note: 'The note is empty.' }
      const { error } = await db.from('messages').insert({
        conversation_id: conv.id, company_id: r.companyId, sender_type: 'agent', sender_name: who(r), content: text, is_internal: true,
        metadata: { automation_id: r.flow.id, automation_run_id: r.id },
      })
      return error ? { ok: false, note: 'The note couldn’t be saved.' } : { ok: true, note: 'Note added' }
    }
    case 'notify': {
      const nm = await names(db, r)
      const customer = nm.name || r.ctx.phone || 'a customer'
      const body = fill(c.text, nm).trim() || (r.ctx.trigger === 'missed_call' ? `Missed call from ${customer}` : `${customer} needs attention`)
      const message = `${who(r)}: ${body}${c.text ? ` · ${customer}` : ''}`.slice(0, 300)
      const team = await staff(db, r)
      const ids: string[] = (c.userIds || []).filter((id: string) => team.has(id))
      if (c.userIds?.length && !ids.length) return { ok: false, note: 'None of the people picked are on the team any more.' }
      if (ids.length) {
        const { error } = await db.from('notifications').insert(ids.map(user_id => ({ user_id, company_id: r.companyId, type: 'automation', message, actor_name: 'Automation', conversation_id: conv?.id || null, is_read: false })))
        if (error) return { ok: false, note: 'The notification couldn’t be sent.' }
        return { ok: true, note: `Notified ${ids.length} ${ids.length === 1 ? 'person' : 'people'}` }
      }
      await notifyCompany({ db, companyId: r.companyId, type: 'automation', message, actorName: 'Automation', conversationId: conv?.id || undefined })
      return { ok: true, note: 'Notified the team' }
    }
    case 'ai': {
      if (!conv) return needConv()
      if (conv.ai_enabled === false) return { ok: true, note: 'Colvy AI is paused on this conversation, so it won’t answer.' }
      if (!r.resumed) {
        r.ev.handToAi = true
        return { ok: true, note: 'Handed to Colvy AI (it answers when it’s switched on for this channel).' }
      }
      // After a Wait: ask Colvy AI to answer the customer's latest message now.
      const res = await fetch(`${origin()}/api/ai/reply`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ conversationId: conv.id, fromAutomation: true }),
      }).then(x => x.json()).catch(() => null)
      return { ok: true, note: res?.replied ? 'Colvy AI answered.' : `Handed to Colvy AI${res?.reason ? `: ${String(res.reason).slice(0, 140)}` : ''}` }
    }
    case 'pause_ai': {
      if (!conv) return needConv()
      await db.from('conversations').update({ ai_enabled: false }).eq('id', conv.id).eq('company_id', r.companyId)
      conv.ai_enabled = false
      r.ev.paused = true
      await event('ai_update', `${who(r)} paused Colvy AI here. The team takes it from here.`)
      return { ok: true, note: 'Colvy AI paused here' }
    }
    case 'close': {
      if (!conv) return needConv()
      await db.from('conversations').update({ status: 'closed' }).eq('id', conv.id).eq('company_id', r.companyId)
      conv.status = 'closed'
      await event('closed', `Closed by ${who(r).replace('Automation', 'automation')}.`)
      return { ok: true, note: 'Conversation closed' }
    }
    default:
      return { ok: true, note: describe(n) }
  }
}
