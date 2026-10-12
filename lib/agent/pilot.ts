// Live pilot controls (Phase 4).
//
//   • Kill switch — "Pause all agents". Stored as an agent_policies row that
//     turns every action off (role null, action '*', autonomy 'off'). Queued
//     runs are cancelled, running ones stop at their next step, and incoming
//     messages don't start new ones. AGENTS_DISABLED=1 pauses every business.
//   • Auto-send — the Support Agent may send some replies on its own. It's the
//     send_message policy at "act_within_limits", with limits: which topics,
//     how many a day, how many per conversation an hour, verified customers
//     only. The engine also insists the reply is grounded in a live lookup made
//     in the same run (see send_message's autoCheck).

import type { PolicyLimits } from './types'

export const PAUSE_ACTION = '*'

export const AUTO_TOPICS: Record<string, { label: string; needs: string }> = {
  opening_hours: { label: 'Opening hours', needs: 'get_business_hours' },
  order_status: { label: 'Order status, when tracking looks normal', needs: 'check_order_status' },
  stock: { label: 'Stock questions', needs: 'check_stock' },
  store_info: { label: 'Questions your knowledge answers', needs: 'ask_knowledge' },
  booking: { label: 'Booking questions (services, free times, their bookings)', needs: 'check_availability' },
}

export type AutoSend = {
  enabled: boolean
  topics: string[]
  max_per_day: number
  max_per_conversation_per_hour: number
  require_verified_customer: boolean
}

export const DEFAULT_AUTO_SEND: AutoSend = {
  enabled: false, topics: ['opening_hours', 'order_status'], max_per_day: 30, max_per_conversation_per_hour: 2, require_verified_customer: false,
}

export type PauseState = { paused: boolean; byName?: string | null; at?: string | null; platform?: boolean }

/** From already-loaded policy rows (the engine has them). */
export function pauseFrom(policies: { role_key: string | null; action_key: string; autonomy: string; limits?: any }[]): PauseState {
  if (process.env.AGENTS_DISABLED === '1') return { paused: true, byName: 'Colvy', platform: true }
  const row = policies.find(p => p.role_key == null && p.action_key === PAUSE_ACTION && p.autonomy === 'off')
  return row ? { paused: true, byName: row.limits?.by_name || null, at: row.limits?.at || null } : { paused: false }
}

export async function agentsPaused(db: any, companyId: string): Promise<PauseState> {
  if (process.env.AGENTS_DISABLED === '1') return pauseFrom([])
  try {
    const { data } = await db.from('agent_policies').select('role_key, action_key, autonomy, limits').eq('company_id', companyId).eq('action_key', PAUSE_ACTION)
    return pauseFrom(data || [])
  } catch { return { paused: false } }
}

/** Upsert a policy row by (company, role, action) — the unique index is on an expression, so no onConflict. */
async function putPolicy(db: any, row: { company_id: string; role_key: string | null; action_key: string; autonomy: string; limits: any; updated_by?: string | null }) {
  let q = db.from('agent_policies').select('id').eq('company_id', row.company_id).eq('action_key', row.action_key)
  q = row.role_key == null ? q.is('role_key', null) : q.eq('role_key', row.role_key)
  const { data: existing } = await q.limit(1)
  const now = new Date().toISOString()
  if (existing?.[0]) {
    const { error } = await db.from('agent_policies').update({ autonomy: row.autonomy, limits: row.limits, updated_by: row.updated_by || null, updated_at: now }).eq('id', existing[0].id)
    if (error) throw error
  } else {
    const { error } = await db.from('agent_policies').insert({ ...row, updated_by: row.updated_by || null, updated_at: now })
    if (error) throw error
  }
}

export async function setPaused(db: any, companyId: string, paused: boolean, user: { id: string | null; name: string | null }) {
  if (paused) {
    const at = new Date().toISOString()
    await putPolicy(db, { company_id: companyId, role_key: null, action_key: PAUSE_ACTION, autonomy: 'off', limits: { by_name: user.name || 'A team member', at }, updated_by: user.id })
    // Nothing queued starts; running runs stop at their next step (engine).
    await db.from('agent_runs').update({ status: 'cancelled', summary: `Agents were paused by ${user.name || 'a team member'}.`, finished_at: at, updated_at: at })
      .eq('company_id', companyId).eq('status', 'queued')
  } else {
    const { error } = await db.from('agent_policies').delete().eq('company_id', companyId).eq('action_key', PAUSE_ACTION).is('role_key', null)
    if (error) throw error
  }
  return agentsPaused(db, companyId)
}

const clampInt = (v: any, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export function cleanAutoSend(raw: any): AutoSend {
  const topics = Array.isArray(raw?.topics) ? raw.topics.filter((t: any) => typeof t === 'string' && AUTO_TOPICS[t]) : DEFAULT_AUTO_SEND.topics
  return {
    enabled: !!raw?.enabled,
    topics: Array.from(new Set<string>(topics)),
    max_per_day: clampInt(raw?.max_per_day, 1, 500, DEFAULT_AUTO_SEND.max_per_day),
    max_per_conversation_per_hour: clampInt(raw?.max_per_conversation_per_hour, 1, 10, DEFAULT_AUTO_SEND.max_per_conversation_per_hour),
    require_verified_customer: !!raw?.require_verified_customer,
  }
}

const defaultsFor = (roleKey: string): AutoSend => roleKey === 'reception' ? { ...DEFAULT_AUTO_SEND, topics: ['booking', 'opening_hours'] } : { ...DEFAULT_AUTO_SEND }

/** An agent's "reply on its own" settings (its send_message policy). */
export async function getAutoSend(db: any, companyId: string, roleKey = 'support'): Promise<AutoSend> {
  const def = defaultsFor(roleKey)
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', roleKey).eq('action_key', 'send_message').limit(1)
    const row = data?.[0]
    if (!row) return def
    return cleanAutoSend({ ...def, ...(row.limits || {}), enabled: row.autonomy === 'act_within_limits' })
  } catch { return def }
}

export async function setAutoSend(db: any, companyId: string, raw: any, userId: string | null, roleKey = 'support'): Promise<AutoSend> {
  const s = cleanAutoSend(raw)
  const limits: PolicyLimits = { topics: s.topics, max_per_day: s.max_per_day, max_per_conversation_per_hour: s.max_per_conversation_per_hour, require_verified_customer: s.require_verified_customer }
  // Off = back to suggestions ("prepare"); the limits are kept for next time.
  await putPolicy(db, { company_id: companyId, role_key: roleKey, action_key: 'send_message', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits, updated_by: userId })
  return s
}

/** Is an agent (Support or Reception) sending replies on its own right now? (Colvy AI's older auto-reply stands down if so.) */
export async function supportAutoSends(db: any, companyId: string): Promise<boolean> {
  try {
    const { data: roles } = await db.from('agent_roles').select('role_key, enabled').eq('company_id', companyId).in('role_key', ['support', 'reception'])
    const on = (roles || []).filter((r: any) => r.enabled).map((r: any) => r.role_key)
    if (!on.length) return false
    if ((await agentsPaused(db, companyId)).paused) return false
    for (const k of on) if ((await getAutoSend(db, companyId, k)).enabled) return true
    return false
  } catch { return false }
}

/** Replies the agent sent on its own in the last 24 hours. */
export async function autoSentToday(db: any, companyId: string): Promise<number> {
  try {
    const { count } = await db.from('agent_steps').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('action_key', 'send_message').eq('kind', 'action').eq('decision', 'allowed').eq('status', 'ok').neq('autonomy', 'external')
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
    return count || 0
  } catch { return 0 }
}

// ── Reputation Agent: reply to good reviews on its own ───────────────────────

export type ReviewAuto = { enabled: boolean; min_rating: number; max_per_day: number }
export const DEFAULT_REVIEW_AUTO: ReviewAuto = { enabled: false, min_rating: 4, max_per_day: 20 }

export function cleanReviewAuto(raw: any): ReviewAuto {
  return {
    enabled: !!raw?.enabled,
    min_rating: Number(raw?.min_rating) === 5 ? 5 : 4,
    max_per_day: clampInt(raw?.max_per_day, 1, 200, DEFAULT_REVIEW_AUTO.max_per_day),
  }
}

export async function getReviewAuto(db: any, companyId: string): Promise<ReviewAuto> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'reputation').eq('action_key', 'reply_to_review').limit(1)
    const row = data?.[0]
    return row ? cleanReviewAuto({ ...DEFAULT_REVIEW_AUTO, ...(row.limits || {}), enabled: row.autonomy === 'act_within_limits' }) : { ...DEFAULT_REVIEW_AUTO }
  } catch { return { ...DEFAULT_REVIEW_AUTO } }
}

export async function setReviewAuto(db: any, companyId: string, raw: any, userId: string | null): Promise<ReviewAuto> {
  const s = cleanReviewAuto(raw)
  await putPolicy(db, { company_id: companyId, role_key: 'reputation', action_key: 'reply_to_review', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits: { min_rating: s.min_rating, max_per_day: s.max_per_day }, updated_by: userId })
  return s
}

// ── Sales Agent: send cart follow-ups on its own ─────────────────────────────

export type SalesAuto = { enabled: boolean; max_per_day: number }
export const DEFAULT_SALES_AUTO: SalesAuto = { enabled: false, max_per_day: 30 }

export async function getSalesAuto(db: any, companyId: string): Promise<SalesAuto> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'sales').eq('action_key', 'send_cart_followup').limit(1)
    const row = data?.[0]
    return row ? { enabled: row.autonomy === 'act_within_limits', max_per_day: clampInt(row.limits?.max_per_day, 1, 500, DEFAULT_SALES_AUTO.max_per_day) } : { ...DEFAULT_SALES_AUTO }
  } catch { return { ...DEFAULT_SALES_AUTO } }
}

export async function setSalesAuto(db: any, companyId: string, raw: any, userId: string | null): Promise<SalesAuto> {
  const s: SalesAuto = { enabled: !!raw?.enabled, max_per_day: clampInt(raw?.max_per_day, 1, 500, DEFAULT_SALES_AUTO.max_per_day) }
  await putPolicy(db, { company_id: companyId, role_key: 'sales', action_key: 'send_cart_followup', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits: { max_per_day: s.max_per_day }, updated_by: userId })
  return s
}

// ── Operations Agent: send order updates on its own ──────────────────────────

export type OpsAuto = { enabled: boolean; max_per_day: number }
export const DEFAULT_OPS_AUTO: OpsAuto = { enabled: false, max_per_day: 20 }

export async function getOpsAuto(db: any, companyId: string): Promise<OpsAuto> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'operations').eq('action_key', 'send_order_update').limit(1)
    const row = data?.[0]
    return row ? { enabled: row.autonomy === 'act_within_limits', max_per_day: clampInt(row.limits?.max_per_day, 1, 500, DEFAULT_OPS_AUTO.max_per_day) } : { ...DEFAULT_OPS_AUTO }
  } catch { return { ...DEFAULT_OPS_AUTO } }
}

export async function setOpsAuto(db: any, companyId: string, raw: any, userId: string | null): Promise<OpsAuto> {
  const s: OpsAuto = { enabled: !!raw?.enabled, max_per_day: clampInt(raw?.max_per_day, 1, 500, DEFAULT_OPS_AUTO.max_per_day) }
  await putPolicy(db, { company_id: companyId, role_key: 'operations', action_key: 'send_order_update', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits: { max_per_day: s.max_per_day }, updated_by: userId })
  return s
}

// ── Which channels Support and Reception answer ──────────────────────────────
// SMS and website chat from the start; email, Facebook and Instagram once the
// business switches them on. Stored as a company-wide (role-less) policy row
// whose action key matches no action, so the policy engine ignores it.

export const AGENT_CHANNEL_OPTIONS: { key: string; label: string }[] = [
  { key: 'sms', label: 'SMS' }, { key: 'chat', label: 'Website chat' }, { key: 'email', label: 'Email' },
  { key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' },
]
export const DEFAULT_AGENT_CHANNELS = ['sms', 'chat']
const CHANNELS_ACTION = 'inbound_channels'

/** A conversation's channel as a switch key: widget and chat are both "chat". */
export function channelKey(channel: string | null | undefined): string | null {
  const c = String(channel || 'chat').toLowerCase()
  if (c === 'widget' || c === 'chat') return 'chat'
  if (c === 'messenger') return 'facebook'
  return AGENT_CHANNEL_OPTIONS.some(o => o.key === c) ? c : null
}

export async function getAgentChannels(db: any, companyId: string): Promise<string[]> {
  try {
    const { data } = await db.from('agent_policies').select('limits').eq('company_id', companyId).is('role_key', null).eq('action_key', CHANNELS_ACTION).limit(1)
    const list = data?.[0]?.limits?.channels
    return Array.isArray(list) ? list.filter((k: any) => AGENT_CHANNEL_OPTIONS.some(o => o.key === k)) : [...DEFAULT_AGENT_CHANNELS]
  } catch { return [...DEFAULT_AGENT_CHANNELS] }
}

export async function setAgentChannels(db: any, companyId: string, raw: any, userId: string | null): Promise<string[]> {
  const list = (Array.isArray(raw) ? raw : []).filter((k: any) => AGENT_CHANNEL_OPTIONS.some(o => o.key === k))
  const channels = AGENT_CHANNEL_OPTIONS.map(o => o.key).filter(k => list.includes(k))
  await putPolicy(db, { company_id: companyId, role_key: null, action_key: CHANNELS_ACTION, autonomy: 'prepare', limits: { channels }, updated_by: userId })
  return channels
}

// ── Reputation Agent: Facebook / Instagram comments ──────────────────────────
// on: whether it handles comments at all; enabled: whether friendly ones get a
// reply on their own. One policy row for reply_to_comment holds both.

export type CommentAuto = { on: boolean; enabled: boolean; max_per_day: number }
export const DEFAULT_COMMENT_AUTO: CommentAuto = { on: false, enabled: false, max_per_day: 30 }

export async function getCommentAuto(db: any, companyId: string): Promise<CommentAuto> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'reputation').eq('action_key', 'reply_to_comment').limit(1)
    const row = data?.[0]
    return row ? { on: !!row.limits?.on, enabled: row.autonomy === 'act_within_limits', max_per_day: clampInt(row.limits?.max_per_day, 1, 500, DEFAULT_COMMENT_AUTO.max_per_day) } : { ...DEFAULT_COMMENT_AUTO }
  } catch { return { ...DEFAULT_COMMENT_AUTO } }
}

export async function setCommentAuto(db: any, companyId: string, raw: any, userId: string | null): Promise<CommentAuto> {
  const s: CommentAuto = { on: !!raw?.on, enabled: !!raw?.on && !!raw?.enabled, max_per_day: clampInt(raw?.max_per_day, 1, 500, DEFAULT_COMMENT_AUTO.max_per_day) }
  await putPolicy(db, { company_id: companyId, role_key: 'reputation', action_key: 'reply_to_comment', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits: { on: s.on, max_per_day: s.max_per_day }, updated_by: userId })
  return s
}

// ── Sales Agent: quotes and leads ────────────────────────────────────────────
// on: follow up quotes and leads at all; enabled: send on its own; after_days:
// how long they've been quiet first. One policy row for send_sales_followup.

export type SalesFollowup = { on: boolean; enabled: boolean; max_per_day: number; after_days: number }
export const FOLLOWUP_DAYS = [2, 3, 5, 7]
export const DEFAULT_SALES_FOLLOWUP: SalesFollowup = { on: false, enabled: false, max_per_day: 20, after_days: 3 }

export async function getSalesFollowup(db: any, companyId: string): Promise<SalesFollowup> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'sales').eq('action_key', 'send_sales_followup').limit(1)
    const row = data?.[0]
    if (!row) return { ...DEFAULT_SALES_FOLLOWUP }
    const days = Number(row.limits?.after_days)
    return { on: !!row.limits?.on, enabled: row.autonomy === 'act_within_limits', max_per_day: clampInt(row.limits?.max_per_day, 1, 500, DEFAULT_SALES_FOLLOWUP.max_per_day), after_days: FOLLOWUP_DAYS.includes(days) ? days : DEFAULT_SALES_FOLLOWUP.after_days }
  } catch { return { ...DEFAULT_SALES_FOLLOWUP } }
}

export async function setSalesFollowup(db: any, companyId: string, raw: any, userId: string | null): Promise<SalesFollowup> {
  const days = Number(raw?.after_days)
  const s: SalesFollowup = { on: !!raw?.on, enabled: !!raw?.on && !!raw?.enabled, max_per_day: clampInt(raw?.max_per_day, 1, 500, DEFAULT_SALES_FOLLOWUP.max_per_day), after_days: FOLLOWUP_DAYS.includes(days) ? days : DEFAULT_SALES_FOLLOWUP.after_days }
  await putPolicy(db, { company_id: companyId, role_key: 'sales', action_key: 'send_sales_followup', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits: { on: s.on, max_per_day: s.max_per_day, after_days: s.after_days }, updated_by: userId })
  return s
}

// ── Earned trust + weekly summary ────────────────────────────────────────────
// Role-less settings rows: suggestions the business said "not now" to (hidden
// for a while), and the weekly summary email (on unless switched off).

const TRUST_ACTION = 'trust_dismissed'
const DIGEST_ACTION = 'weekly_digest'
export const TRUST_SNOOZE_DAYS = 60

export async function getTrustDismissed(db: any, companyId: string): Promise<Record<string, string>> {
  try {
    const { data } = await db.from('agent_policies').select('limits').eq('company_id', companyId).is('role_key', null).eq('action_key', TRUST_ACTION).limit(1)
    const m = data?.[0]?.limits?.dismissed
    return m && typeof m === 'object' ? m : {}
  } catch { return {} }
}

export async function dismissTrust(db: any, companyId: string, key: string, userId: string | null): Promise<void> {
  const cur = await getTrustDismissed(db, companyId)
  const cutoff = Date.now() - TRUST_SNOOZE_DAYS * 86_400_000
  const kept = Object.fromEntries(Object.entries(cur).filter(([, at]) => new Date(at).getTime() > cutoff))
  await putPolicy(db, { company_id: companyId, role_key: null, action_key: TRUST_ACTION, autonomy: 'prepare', limits: { dismissed: { ...kept, [String(key).slice(0, 120)]: new Date().toISOString() } }, updated_by: userId })
}

export type DigestSettings = { enabled: boolean; last_week?: string | null }

export async function getDigest(db: any, companyId: string): Promise<DigestSettings> {
  try {
    const { data } = await db.from('agent_policies').select('limits').eq('company_id', companyId).is('role_key', null).eq('action_key', DIGEST_ACTION).limit(1)
    const l = data?.[0]?.limits
    return { enabled: l?.enabled !== false, last_week: l?.last_week || null }
  } catch { return { enabled: true, last_week: null } }
}

export async function setDigest(db: any, companyId: string, patch: Partial<DigestSettings>, userId: string | null): Promise<DigestSettings> {
  const cur = await getDigest(db, companyId)
  const next = { enabled: patch.enabled ?? cur.enabled, last_week: patch.last_week !== undefined ? patch.last_week : (cur.last_week || null) }
  await putPolicy(db, { company_id: companyId, role_key: null, action_key: DIGEST_ACTION, autonomy: 'prepare', limits: next, updated_by: userId })
  return next
}

// ── Goals + "Needs you" phone alerts (Phase 10) ─────────────────────────────

const GOALS_ACTION = 'goals'
const ALERTS_ACTION = 'needs_you_alerts'

export async function getGoalSettings(db: any, companyId: string): Promise<any> {
  try {
    const { data } = await db.from('agent_policies').select('limits').eq('company_id', companyId).is('role_key', null).eq('action_key', GOALS_ACTION).limit(1)
    return data?.[0]?.limits?.goals || {}
  } catch { return {} }
}

export async function setGoalSettings(db: any, companyId: string, goals: any, userId: string | null): Promise<void> {
  await putPolicy(db, { company_id: companyId, role_key: null, action_key: GOALS_ACTION, autonomy: 'prepare', limits: { goals }, updated_by: userId })
}

export type AlertSettings = { enabled: boolean; notified: Record<string, string> }

export async function getAlertSettings(db: any, companyId: string): Promise<AlertSettings> {
  try {
    const { data } = await db.from('agent_policies').select('limits').eq('company_id', companyId).is('role_key', null).eq('action_key', ALERTS_ACTION).limit(1)
    const l = data?.[0]?.limits || {}
    return { enabled: l.enabled !== false, notified: l.notified && typeof l.notified === 'object' ? l.notified : {} }
  } catch { return { enabled: true, notified: {} } }
}

export async function setAlertSettings(db: any, companyId: string, patch: Partial<AlertSettings>, userId: string | null): Promise<AlertSettings> {
  const cur = await getAlertSettings(db, companyId)
  const cutoff = Date.now() - 7 * 86_400_000
  const notified = Object.fromEntries(Object.entries({ ...cur.notified, ...(patch.notified || {}) }).filter(([, at]) => new Date(at).getTime() > cutoff))
  const next = { enabled: patch.enabled ?? cur.enabled, notified }
  await putPolicy(db, { company_id: companyId, role_key: null, action_key: ALERTS_ACTION, autonomy: 'prepare', limits: next, updated_by: userId })
  return next
}
