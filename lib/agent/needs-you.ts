// "Needs you": everything that is waiting on a person, in one list, most
// urgent first — drafts to approve, goals being missed right now, hand-overs
// nobody has picked up, and agent runs that went wrong. The point of the
// agents is that the team only hears about the exceptions; this is that list.
//
// sweepNeedsYou() (cron every 15 min) sends a phone alert for anything newly
// urgent, once per item.

import { pendingApprovals } from './approvals'
import { evaluateGoals, cleanGoals, targetMs, unitText, type Breach, type GoalStatus, GOALS } from './goals'
import { getGoalSettings, getAlertSettings, setAlertSettings } from './pilot'
import { internalHeaders } from '@/lib/internal-call'

export type Urgency = 'now' | 'soon' | 'fyi'
export type NeedItem = {
  key: string
  kind: 'approval' | 'reply' | 'review' | 'order' | 'quote' | 'handover' | 'failed'
  urgency: Urgency
  title: string
  detail: string
  at: string
  href: string
  conversationId?: string | null
  runId?: string | null
  approval?: any            // the pending approval, for approve / edit / dismiss in place
}

const AGENT: Record<string, string> = { support: 'Support Agent', reception: 'Reception Agent', reputation: 'Reputation Agent', sales: 'Sales Agent', operations: 'Operations Agent' }
const KIND_OF: Record<string, NeedItem['kind']> = { reply_time: 'reply', review_reply: 'review', order_updates: 'order', quote_followup: 'quote' }
const ago = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)); if (m < 60) return `${m} min`; const h = Math.round(m / 60); if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`; const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'}` }

function approvalTitle(a: any): string {
  const who = AGENT[a.run?.role_key] || 'An agent'
  const k = a.action_key
  if (k === 'send_message') return `${who} drafted a reply${a.conversation?.customer ? ` to ${a.conversation.customer}` : ''}`
  if (k === 'reply_to_review') return 'Reputation Agent drafted a review reply'
  if (k === 'reply_to_comment') return 'Reputation Agent drafted a comment reply'
  if (k === 'send_cart_followup') return 'Sales Agent wrote a cart follow-up'
  if (k === 'send_sales_followup') return 'Sales Agent wrote a follow-up'
  if (k === 'send_order_update') return 'Operations Agent wrote an order update'
  if (k === 'reschedule_booking' || k === 'cancel_booking') return `Reception Agent wants to ${k === 'cancel_booking' ? 'cancel' : 'move'} a booking`
  if (String(k).startsWith('x_')) return `${who} wants to use an outside tool`
  return `${who} needs your approval`
}

/** Hand-overs and failed runs from the last two days, plus when the team last wrote in each conversation — in four queries, not one per hand-over. */
async function recentExceptions(db: any, companyId: string, since: string) {
  const [{ data: steps }, { data: failed }] = await Promise.all([
    db.from('agent_steps').select('run_id, created_at').eq('company_id', companyId).eq('action_key', 'escalate_to_human').eq('decision', 'allowed').eq('status', 'ok').gte('created_at', since).limit(200),
    db.from('agent_runs').select('id, role_key, summary, created_at, conversation_id, mode').eq('company_id', companyId).eq('status', 'failed').eq('mode', 'live').gte('created_at', since).limit(50),
  ])
  const runIds = Array.from(new Set((steps || []).map((s: any) => s.run_id)))
  const { data: runs } = runIds.length ? await db.from('agent_runs').select('id, role_key, summary, conversation_id, mode').in('id', runIds) : { data: [] }
  const runBy = new Map<string, any>((runs || []).filter((r: any) => r.mode === 'live').map((r: any) => [r.id, r]))
  const convIds = Array.from(new Set(Array.from(runBy.values()).map((r: any) => r.conversation_id).filter(Boolean))) as string[]
  const teamReplies = new Map<string, string[]>()
  if (convIds.length) {
    const { data: msgs } = await db.from('messages').select('conversation_id, created_at, metadata').in('conversation_id', convIds).eq('sender_type', 'agent').gte('created_at', since).limit(2000)
    for (const m of msgs || []) {
      if (m.metadata?.auto || m.metadata?.agent_name || m.metadata?.paylink_capture) continue
      ;(teamReplies.get(m.conversation_id) || teamReplies.set(m.conversation_id, []).get(m.conversation_id)!).push(m.created_at)
    }
  }
  return { steps: steps || [], failed: failed || [], runBy, teamReplies }
}

export async function needsYou(db: any, companyId: string, now = Date.now()): Promise<{ items: NeedItem[]; counts: Record<Urgency, number>; goals: GoalStatus[] }> {
  const items: NeedItem[] = []

  // Goals, drafts and recent hand-overs don't depend on each other: fetch them
  // together (the goal settings are read first only for the goals).
  const since = new Date(now - 48 * 3_600_000).toISOString()
  const settingsP = getGoalSettings(db, companyId).then(cleanGoals)
  const [settings, { goals, breaches }, approvals, recent] = await Promise.all([
    settingsP,
    settingsP.then(st => evaluateGoals(db, companyId, st, { days: 14, now })).catch(() => ({ goals: [] as GoalStatus[], breaches: [] as Breach[] })),
    pendingApprovals(db, companyId, { limit: 50 }).catch(() => [] as any[]),
    recentExceptions(db, companyId, since).catch(() => null),
  ])
  const approvalLimit = settings.approval_wait.on ? targetMs('approval_wait', settings.approval_wait.target) : Infinity
  const waitingConvs = new Map(breaches.filter(b => b.goal === 'reply_time' && b.conversationId).map(b => [b.conversationId!, b]))
  for (const a of approvals) {
    const age = now - new Date(a.created_at).getTime()
    const customerWaiting = a.run?.conversation_id ? waitingConvs.get(a.run.conversation_id) : null
    items.push({
      key: `approval:${a.id}`, kind: 'approval',
      urgency: customerWaiting || age > approvalLimit ? 'now' : 'soon',
      title: approvalTitle(a),
      detail: customerWaiting ? `The customer has been waiting ${ago(now - new Date(customerWaiting.at).getTime())}. Drafted ${ago(age)} ago.`
        : age > approvalLimit ? `Waiting ${ago(age)} — your goal is ${unitText(settings.approval_wait.target, 'minutes')}.` : `Drafted ${ago(age)} ago.`,
      at: a.created_at,
      href: a.run?.conversation_id ? `/admin/inbox?conversation=${a.run.conversation_id}` : '/admin/agents',
      conversationId: a.run?.conversation_id || null, runId: a.run_id, approval: a,
    })
  }
  // A customer waiting whose reply is already drafted shows once, as the draft.
  for (const b of breaches) {
    if (b.goal === 'reply_time' && b.conversationId && approvals.some(a => a.run?.conversation_id === b.conversationId)) continue
    items.push({ key: b.key, kind: KIND_OF[b.goal as string] || 'reply', urgency: 'now', title: b.title, detail: b.detail, at: b.at, href: b.href, conversationId: b.conversationId || null, runId: b.runId || null })
  }

  // ── Hand-overs nobody has picked up, and runs that went wrong (last 2 days)
  if (recent) {
    const { steps, failed, runBy, teamReplies } = recent
    for (const s of steps) {
      const run: any = runBy.get(s.run_id)
      if (!run || items.some(i => i.key === `handover:${run.id}`)) continue
      // Picked up = a person on the team has written in the conversation since.
      if (run.conversation_id && (teamReplies.get(run.conversation_id) || []).some(t => t > s.created_at)) continue
      items.push({
        key: `handover:${run.id}`, kind: 'handover', urgency: run.conversation_id ? 'now' : 'soon',
        title: `${AGENT[run.role_key] || 'An agent'} handed this to you`,
        detail: `${String(run.summary || 'It needs a person.').slice(0, 180)} · ${ago(now - new Date(s.created_at).getTime())} ago`,
        at: s.created_at, href: run.conversation_id ? `/admin/inbox?conversation=${run.conversation_id}` : `/admin/agents?run=${run.id}`,
        conversationId: run.conversation_id || null, runId: run.id,
      })
    }
    for (const r of failed) {
      items.push({ key: `failed:${r.id}`, kind: 'failed', urgency: 'fyi', title: `${AGENT[r.role_key] || 'An agent'} ran into a problem`, detail: String(r.summary || 'Something went wrong.').slice(0, 180), at: r.created_at, href: `/admin/agents?run=${r.id}`, conversationId: r.conversation_id || null, runId: r.id })
    }
  }

  const rank: Record<Urgency, number> = { now: 0, soon: 1, fyi: 2 }
  items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.at < b.at ? -1 : 1))   // oldest first within each level
  const counts = { now: 0, soon: 0, fyi: 0 } as Record<Urgency, number>
  for (const i of items) counts[i.urgency]++
  return { items, counts, goals }
}

type Push = (m: { companyId: string; title: string; body: string; route: string; conversationId?: string | null; feature: string }) => Promise<void>

const defaultPush: Push = async m => {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  await fetch(`${base}/api/push/send`, {
    method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ companyId: m.companyId, title: m.title, body: m.body, route: m.route, feature: m.feature, ...(m.conversationId ? { conversationId: m.conversationId } : {}) }),
  }).catch(() => null)
}

export const ALERTS_PER_SWEEP = 3

/** Phone alerts for anything newly urgent — once per item, at most a few per sweep per business. */
export async function sweepNeedsYou(db: any, opts: { now?: number; push?: Push } = {}): Promise<{ companies: number; alerts: number }> {
  const now = opts.now ?? Date.now()
  const push = opts.push || defaultPush
  const { data: roles } = await db.from('agent_roles').select('company_id').eq('enabled', true).limit(5000)
  const ids = Array.from(new Set((roles || []).map((r: any) => r.company_id).filter(Boolean))) as string[]
  let alerts = 0
  for (const companyId of ids) {
    try {
      const alertSettings = await getAlertSettings(db, companyId)
      if (!alertSettings.enabled) continue
      const { items } = await needsYou(db, companyId, now)
      const fresh = items.filter(i => i.urgency === 'now' && !alertSettings.notified[i.key])
      if (!fresh.length) continue
      const send = fresh.slice(0, ALERTS_PER_SWEEP)
      const notified: Record<string, string> = {}
      // Mark them all (including any not sent this time) so nothing is alerted twice.
      for (const i of fresh) notified[i.key] = new Date(now).toISOString()
      await setAlertSettings(db, companyId, { notified }, null)
      for (const [n, i] of send.entries()) {
        const more = n === send.length - 1 && fresh.length > send.length ? ` (+${fresh.length - send.length} more)` : ''
        await push({
          companyId, title: `Needs you: ${i.title}`, body: `${i.detail}${more}`,
          route: i.conversationId ? `/conversation/${i.conversationId}` : '/(tabs)/inbox',
          conversationId: i.conversationId || null, feature: i.conversationId ? 'inbox' : 'agents',
        })
        alerts++
      }
    } catch { /* one business failing never stops the rest */ }
  }
  return { companies: ids.length, alerts }
}

export { GOALS }
