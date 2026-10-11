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

export async function getAutoSend(db: any, companyId: string): Promise<AutoSend> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits').eq('company_id', companyId).eq('role_key', 'support').eq('action_key', 'send_message').limit(1)
    const row = data?.[0]
    if (!row) return { ...DEFAULT_AUTO_SEND }
    return cleanAutoSend({ ...DEFAULT_AUTO_SEND, ...(row.limits || {}), enabled: row.autonomy === 'act_within_limits' })
  } catch { return { ...DEFAULT_AUTO_SEND } }
}

export async function setAutoSend(db: any, companyId: string, raw: any, userId: string | null): Promise<AutoSend> {
  const s = cleanAutoSend(raw)
  const limits: PolicyLimits = { topics: s.topics, max_per_day: s.max_per_day, max_per_conversation_per_hour: s.max_per_conversation_per_hour, require_verified_customer: s.require_verified_customer }
  // Off = back to suggestions ("prepare"); the limits are kept for next time.
  await putPolicy(db, { company_id: companyId, role_key: 'support', action_key: 'send_message', autonomy: s.enabled ? 'act_within_limits' : 'prepare', limits, updated_by: userId })
  return s
}

/** Is the Support Agent sending replies on its own right now? (Colvy AI's older auto-reply stands down if so.) */
export async function supportAutoSends(db: any, companyId: string): Promise<boolean> {
  try {
    const { data: role } = await db.from('agent_roles').select('enabled').eq('company_id', companyId).eq('role_key', 'support').maybeSingle()
    if (!role?.enabled) return false
    if ((await agentsPaused(db, companyId)).paused) return false
    return (await getAutoSend(db, companyId)).enabled
  } catch { return false }
}

/** Replies the agent sent on its own in the last 24 hours. */
export async function autoSentToday(db: any, companyId: string): Promise<number> {
  try {
    const { count } = await db.from('agent_steps').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('action_key', 'send_message').eq('kind', 'action').eq('decision', 'allowed').eq('status', 'ok')
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
    return count || 0
  } catch { return 0 }
}
