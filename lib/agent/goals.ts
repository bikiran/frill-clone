// Goals: the outcomes a business sets ("every customer message answered within
// 15 minutes"), how often they were met, and — the point — what is missing
// one RIGHT NOW, so the team only hears about the exceptions.
//
// Each goal is measured from data Colvy already keeps (messages, approvals,
// Google reviews, Operations Agent runs, payment requests). Nothing new is
// recorded; settings live in agent_policies (pilot.ts getGoals / setGoals).

import { loadBusinessHours, localNow, dayHours, type BusinessHours } from '@/lib/business-hours'

export type GoalKey = 'reply_time' | 'approval_wait' | 'review_reply' | 'order_updates' | 'quote_followup'
export type GoalSetting = { on: boolean; target: number }
export type GoalSettings = Record<GoalKey, GoalSetting>

type GoalDef = { label: string; unit: 'minutes' | 'hours' | 'days'; options: number[]; sentence: (t: number) => string; about: string }
export const GOALS: Record<GoalKey, GoalDef> = {
  reply_time: {
    label: 'Answer customers', unit: 'minutes', options: [5, 15, 30, 60, 120],
    sentence: t => `Every customer message answered within ${unitText(t, 'minutes')} during opening hours`,
    about: 'Counts messages that arrive while you’re open. An agent’s reply counts.',
  },
  approval_wait: {
    label: 'Check agent drafts', unit: 'minutes', options: [10, 30, 60, 120, 240],
    sentence: t => `Every draft from an agent approved or dismissed within ${unitText(t, 'minutes')}`,
    about: 'The replies, follow-ups and changes agents prepare for you.',
  },
  review_reply: {
    label: 'Reply to reviews', unit: 'hours', options: [4, 12, 24, 48],
    sentence: t => `Every Google review replied to within ${unitText(t, 'hours')}`,
    about: 'Google reviews, replied to by the Reputation Agent or your team.',
  },
  order_updates: {
    label: 'Keep customers updated', unit: 'days', options: [1, 2, 3, 5],
    sentence: t => `No late or stuck order left more than ${unitText(t, 'days')} without the customer hearing from you`,
    about: 'Orders the Operations Agent flags as late, stuck or waiting on stock.',
  },
  quote_followup: {
    label: 'Follow up quotes', unit: 'days', options: [2, 3, 5, 7],
    sentence: t => `Every unpaid quote or payment request followed up within ${unitText(t, 'days')}`,
    about: 'A message to the customer after the request, from an agent or your team — or them paying.',
  },
}
export const GOAL_KEYS = Object.keys(GOALS) as GoalKey[]
export const DEFAULT_GOALS: GoalSettings = {
  reply_time: { on: true, target: 15 },
  approval_wait: { on: true, target: 30 },
  review_reply: { on: true, target: 24 },
  order_updates: { on: true, target: 2 },
  quote_followup: { on: false, target: 3 },
}

export function unitText(n: number, unit: GoalDef['unit']): string {
  const word = unit === 'minutes' ? (n === 1 ? 'minute' : 'minutes') : unit === 'hours' ? (n === 1 ? 'hour' : 'hours') : (n === 1 ? 'day' : 'days')
  if (unit === 'minutes' && n >= 60 && n % 60 === 0) return `${n / 60} hour${n === 60 ? '' : 's'}`
  return `${n} ${word}`
}
const unitMs = (unit: GoalDef['unit']) => unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000
export const targetMs = (key: GoalKey, target: number) => target * unitMs(GOALS[key].unit)

export function cleanGoals(raw: any): GoalSettings {
  const out = {} as GoalSettings
  for (const k of GOAL_KEYS) {
    const r = raw?.[k] || {}
    const target = Number(r.target)
    out[k] = { on: typeof r.on === 'boolean' ? r.on : DEFAULT_GOALS[k].on, target: GOALS[k].options.includes(target) ? target : DEFAULT_GOALS[k].target }
  }
  return out
}

// ── Opening hours: is the business open at this moment? (null = no hours on file)
function mins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
export function openAt(h: BusinessHours | null, at: Date): boolean | null {
  if (!h || !h.places.length) return null
  const now = localNow(h.timezone, at)
  const t = mins(now.time)
  let known = false
  for (const p of h.places) {
    if (p.status && p.status !== 'open') continue
    const { ranges } = dayHours(p, now.date)
    if (ranges === undefined) continue
    known = true
    if (ranges.some(r => t >= mins(r.from) && (r.overnight || t < (r.to === '24:00' ? 1440 : mins(r.to))))) return true
  }
  return known ? false : null
}

async function pageAll(build: (from: number) => any, cap = 20000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export type GoalStatus = { key: GoalKey; on: boolean; target: number; label: string; sentence: string; about: string; unit: string; options: number[]; met: number; missed: number; open: number; rate: number | null }
export type Breach = { key: string; goal: GoalKey | 'handover' | 'failed'; title: string; detail: string; at: string; overdueMs: number; href: string; conversationId?: string | null; runId?: string | null }

const REPLY_SENDERS = new Set(['agent', 'ai'])
const nameOf = (c: any) => c?.contact?.name || c?.subject || c?.sms_number || 'A customer'
const ago = (ms: number) => {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'}`
}

/**
 * Measure every goal over the last `days` days and list what's missing one
 * right now. `now` is injectable for tests.
 */
export async function evaluateGoals(db: any, companyId: string, settings: GoalSettings, opts: { days?: number; now?: number } = {}): Promise<{ goals: GoalStatus[]; breaches: Breach[] }> {
  const now = opts.now ?? Date.now()
  const days = opts.days ?? 7
  const since = new Date(now - days * 86_400_000).toISOString()
  const statuses: GoalStatus[] = []
  const breaches: Breach[] = []
  const status = (key: GoalKey, met: number, missed: number, open: number) => {
    const s = settings[key]
    statuses.push({ key, on: s.on, target: s.target, label: GOALS[key].label, sentence: GOALS[key].sentence(s.target), about: GOALS[key].about, unit: GOALS[key].unit, options: GOALS[key].options, met, missed, open, rate: met + missed ? met / (met + missed) : null })
  }

  // ── Answer customers (during opening hours)
  {
    const key: GoalKey = 'reply_time'
    const limit = targetMs(key, settings[key].target)
    let met = 0, missed = 0, open = 0
    try {
      const hours = await loadBusinessHours(db, companyId, { google: false }).catch(() => null)
      const msgs = await pageAll(from => db.from('messages').select('conversation_id, sender_type, is_internal, created_at')
        .eq('company_id', companyId).gte('created_at', since).order('created_at', { ascending: true }).range(from, from + 999))
      const byConv = new Map<string, any[]>()
      for (const m of msgs) { if (!m.conversation_id || m.is_internal || m.sender_type === 'system') continue; (byConv.get(m.conversation_id) || byConv.set(m.conversation_id, []).get(m.conversation_id)!).push(m) }
      const waiting: { conv: string; at: string; ms: number }[] = []
      for (const [conv, list] of byConv) {
        list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        for (let i = 0; i < list.length; i++) {
          const m = list[i]
          if (m.sender_type !== 'visitor') continue
          if (i > 0 && list[i - 1].sender_type === 'visitor') continue          // only the first message of each customer turn
          const at = new Date(m.created_at)
          if (openAt(hours, at) === false) continue                           // arrived while closed
          const reply = list.slice(i + 1).find(x => REPLY_SENDERS.has(x.sender_type))
          if (reply) { (new Date(reply.created_at).getTime() - at.getTime() <= limit ? met++ : missed++) }
          else if (now - at.getTime() > limit) { missed++; open++; waiting.push({ conv, at: m.created_at, ms: now - at.getTime() }) }
        }
      }
      if (settings[key].on && waiting.length) {
        const ids = Array.from(new Set(waiting.map(w => w.conv))).slice(0, 200)
        const { data: convs } = await db.from('conversations').select('id, status, subject, sms_number, contact_id').in('id', ids)
        const contactIds = Array.from(new Set((convs || []).map((c: any) => c.contact_id).filter(Boolean)))
        const { data: contacts } = contactIds.length ? await db.from('contacts').select('id, name').in('id', contactIds) : { data: [] }
        const nameBy = new Map((contacts || []).map((c: any) => [c.id, c.name]))
        const live = new Map((convs || []).filter((c: any) => c.status !== 'closed' && c.status !== 'resolved').map((c: any) => [c.id, { ...c, contact: { name: nameBy.get(c.contact_id) || null } }]))
        // One per conversation: the longest wait.
        const seen = new Set<string>()
        for (const w of waiting.sort((a, b) => b.ms - a.ms)) {
          const c = live.get(w.conv)
          if (!c || seen.has(w.conv)) continue
          seen.add(w.conv)
          breaches.push({ key: `reply:${w.conv}`, goal: key, title: `${nameOf(c)} is waiting for a reply`, detail: `Waiting ${ago(w.ms)} — your goal is ${unitText(settings[key].target, 'minutes')}.`, at: w.at, overdueMs: w.ms - limit, href: `/admin/inbox?conversation=${w.conv}`, conversationId: w.conv })
        }
      }
    } catch { /* messages unavailable */ }
    status(key, met, missed, open)
  }

  // ── Check agent drafts
  {
    const key: GoalKey = 'approval_wait'
    const limit = targetMs(key, settings[key].target)
    let met = 0, missed = 0, open = 0
    try {
      const rows = await pageAll(from => db.from('agent_approvals').select('id, run_id, action_key, status, result, created_at, decided_at')
        .eq('company_id', companyId).gte('created_at', since).range(from, from + 999))
      for (const a of rows) {
        if (a.status === 'expired' && a.result?.superseded) continue
        const created = new Date(a.created_at).getTime()
        if (a.decided_at && a.status !== 'expired') { (new Date(a.decided_at).getTime() - created <= limit ? met++ : missed++) }
        else if (a.status === 'expired') missed++
        else if (a.status === 'pending' && now - created > limit) { missed++; open++ }
      }
    } catch {}
    status(key, met, missed, open)
  }

  // ── Reply to reviews
  {
    const key: GoalKey = 'review_reply'
    const limit = targetMs(key, settings[key].target)
    let met = 0, missed = 0, open = 0
    try {
      const rows = await pageAll(from => db.from('google_reviews').select('id, reviewer_name, star_rating, review_created_at, replied_at, reply_comment')
        .eq('company_id', companyId).gte('review_created_at', since).range(from, from + 999))
      for (const r of rows) {
        const created = new Date(r.review_created_at).getTime()
        if (r.replied_at || r.reply_comment) {
          const replied = r.replied_at ? new Date(r.replied_at).getTime() : null
          if (replied == null || replied - created <= limit) met++; else missed++
        } else if (now - created > limit) {
          missed++; open++
          if (settings[key].on) breaches.push({ key: `review:${r.id}`, goal: key, title: `${r.reviewer_name || 'A customer'}’s ${r.star_rating ? `${r.star_rating}-star ` : ''}review has no reply`, detail: `Posted ${ago(now - created)} ago — your goal is ${unitText(settings[key].target, 'hours')}.`, at: r.review_created_at, overdueMs: now - created - limit, href: '/admin/reviews' })
        }
      }
    } catch {}
    status(key, met, missed, open)
  }

  // ── Keep customers updated (orders the Operations Agent flagged)
  {
    const key: GoalKey = 'order_updates'
    const limit = targetMs(key, settings[key].target)
    let met = 0, missed = 0, open = 0
    try {
      const runs = await pageAll(from => db.from('agent_runs').select('id, status, outcome, summary, input, conversation_id, created_at')
        .eq('company_id', companyId).eq('role_key', 'operations').eq('mode', 'live').gte('created_at', since).range(from, from + 999))
      const ids = runs.map((r: any) => r.id)
      const updated = new Map<string, number>()
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const [{ data: steps }, { data: aps }] = await Promise.all([
          db.from('agent_steps').select('run_id, created_at').in('run_id', chunk).eq('action_key', 'send_order_update').eq('decision', 'allowed').eq('status', 'ok'),
          db.from('agent_approvals').select('run_id, decided_at, status').in('run_id', chunk).eq('action_key', 'send_order_update').in('status', ['executed', 'edited', 'approved']),
        ])
        for (const s of steps || []) updated.set(s.run_id, Math.min(updated.get(s.run_id) ?? Infinity, new Date(s.created_at).getTime()))
        for (const a of aps || []) if (a.decided_at) updated.set(a.run_id, Math.min(updated.get(a.run_id) ?? Infinity, new Date(a.decided_at).getTime()))
      }
      for (const r of runs) {
        const created = new Date(r.created_at).getTime()
        if (r.outcome === 'no_action') continue                               // turned out fine
        const u = updated.get(r.id)
        if (u != null) { (u - created <= limit ? met++ : missed++) }
        else if (now - created > limit) {
          missed++; open++
          if (settings[key].on) breaches.push({ key: `order:${r.id}`, goal: key, title: `Order ${r.input?.orderNumber ? `#${r.input.orderNumber} ` : ''}customer hasn’t heard from you`, detail: `${r.summary ? `${String(r.summary).slice(0, 140)} · ` : ''}flagged ${ago(now - created)} ago.`, at: r.created_at, overdueMs: now - created - limit, href: r.conversation_id ? `/admin/inbox?conversation=${r.conversation_id}` : '/admin/orders', conversationId: r.conversation_id || null, runId: r.id })
        }
      }
    } catch {}
    status(key, met, missed, open)
  }

  // ── Follow up quotes / payment requests
  {
    const key: GoalKey = 'quote_followup'
    const limit = targetMs(key, settings[key].target)
    let met = 0, missed = 0, open = 0
    try {
      const pays = await pageAll(from => db.from('chat_payments').select('id, conversation_id, status, amount_cents, description, created_at, paid_at, message_id')
        .eq('company_id', companyId).gte('created_at', since).range(from, from + 999))
      const convIds = Array.from(new Set(pays.map((p: any) => p.conversation_id).filter(Boolean)))
      const agentMsgs = new Map<string, number[]>()
      for (let i = 0; i < convIds.length; i += 200) {
        const { data } = await db.from('messages').select('id, conversation_id, created_at, sender_type, is_internal, message_type').in('conversation_id', convIds.slice(i, i + 200)).gte('created_at', since).in('sender_type', ['agent', 'ai'])
        for (const m of data || []) { if (m.is_internal || m.message_type === 'payment') continue; (agentMsgs.get(m.conversation_id) || agentMsgs.set(m.conversation_id, []).get(m.conversation_id)!).push(new Date(m.created_at).getTime()) }
      }
      for (const p of pays) {
        if (p.status === 'refunded' || p.status === 'cancelled') continue
        const created = new Date(p.created_at).getTime()
        const paid = p.status === 'paid' && p.paid_at ? new Date(p.paid_at).getTime() : null
        const follow = (agentMsgs.get(p.conversation_id) || []).filter(t => t > created + 60_000).sort((a, b) => a - b)[0] ?? null
        const first = [paid, follow].filter((x): x is number => x != null).sort((a, b) => a - b)[0] ?? null
        if (first != null) { (first - created <= limit ? met++ : missed++) }
        else if (now - created > limit) {
          missed++; open++
          if (settings[key].on && p.status === 'pending') breaches.push({ key: `quote:${p.id}`, goal: key, title: `Payment request of $${((p.amount_cents || 0) / 100).toFixed(2)} not followed up`, detail: `${p.description ? `${String(p.description).slice(0, 80)} · ` : ''}sent ${ago(now - created)} ago, unpaid.`, at: p.created_at, overdueMs: now - created - limit, href: p.conversation_id ? `/admin/inbox?conversation=${p.conversation_id}` : '/admin/payments', conversationId: p.conversation_id || null })
        }
      }
    } catch {}
    status(key, met, missed, open)
  }

  return { goals: statuses, breaches }
}
