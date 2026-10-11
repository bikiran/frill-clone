// One record of everything the AI does (Phase 7).
//
// The Support Agent runs inside the engine, so its runs and steps are recorded
// as it works. Colvy's older AI paths — the Colvy AI auto-reply, the in-app
// assistant, and connected apps acting over MCP — have their own loops. They
// record what they did here, in the same agent_runs / agent_steps, so the AI
// Agents page shows all of it, "Why?" works on their messages and tasks, and
// one pause switch covers everything that acts without a person.
//
// Recording never gets in the way: if it fails, the action still happened and
// the caller carries on.

export const ACTIVITY_ROLES: Record<string, string> = {
  support: 'Colvy Support Agent',
  reputation: 'Colvy Reputation Agent',
  colvy_ai: 'Colvy AI auto-reply',
  assistant: 'Colvy AI assistant',
  connected_app: 'Connected app',
}

/** The name to show for a run: a connected app's own name, the assistant's user. */
export function activityName(roleKey: string, input?: any): string {
  if (roleKey === 'connected_app' && input?.app) return String(input.app)
  if (roleKey === 'assistant' && input?.for) return `Colvy AI assistant (for ${input.for})`
  return ACTIVITY_ROLES[roleKey] || roleKey
}

export type ActivityStep = {
  action_key: string
  kind?: 'action'
  input?: any
  output?: any
  reason?: string | null
  decision?: 'allowed' | 'denied' | 'needs_approval'
  decision_reason?: string | null
  status?: 'ok' | 'error' | 'skipped'
  entity_type?: string | null
  entity_id?: string | null
}

export type Activity = {
  companyId: string
  roleKey: 'colvy_ai' | 'assistant' | 'connected_app'
  trigger: string                       // inbound_message | assistant | mcp
  conversationId?: string | null
  contactId?: string | null
  input?: Record<string, any>
  summary?: string | null
  outcome?: string | null               // replied | escalated | no_action
  intent?: string | null
  model?: string | null
  contextRefs?: { type: string; id: string; label: string }[]
}

const now = () => new Date().toISOString()

/** Open a run (so its id can be stamped on a message before it's sent). Null if recording isn't possible. */
export async function startActivity(db: any, a: Activity): Promise<string | null> {
  try {
    const { data, error } = await db.from('agent_runs').insert({
      company_id: a.companyId, role_key: a.roleKey, mode: 'live', trigger_type: a.trigger,
      // Not 'running': the agent worker resumes running runs, and these aren't its to run.
      status: 'completed', conversation_id: a.conversationId || null, contact_id: a.contactId || null,
      input: a.input || {}, summary: a.summary || null, intent: a.intent || null, model: a.model || null,
      context_refs: a.contextRefs || [], started_at: now(), updated_at: now(),
    }).select('id').maybeSingle()
    return error ? null : data?.id || null
  } catch { return null }
}

/** Add the steps and close the run. */
export async function finishActivity(db: any, runId: string | null, companyId: string, steps: ActivityStep[], end: { status?: string; outcome?: string | null; summary?: string | null; intent?: string | null } = {}) {
  if (!runId) return
  try {
    const rows = steps.map((s, i) => ({
      run_id: runId, company_id: companyId, seq: i + 1, kind: s.kind || 'action', action_key: s.action_key,
      input: s.input ?? {}, output: s.output ?? null, reason: s.reason ?? null,
      decision: s.decision || 'allowed', decision_reason: s.decision_reason ?? null,
      // 'external': done outside the engine — never counted towards the Support Agent's limits.
      autonomy: 'external',
      status: s.status || 'ok', entity_type: s.entity_type ?? null, entity_id: s.entity_id ?? null,
    }))
    if (rows.length) await db.from('agent_steps').insert(rows)
    const patch: any = { status: end.status || 'completed', step_count: rows.length, finished_at: now(), updated_at: now() }
    if (end.outcome !== undefined) patch.outcome = end.outcome
    if (end.summary !== undefined) patch.summary = end.summary
    if (end.intent !== undefined) patch.intent = end.intent
    await db.from('agent_runs').update(patch).eq('id', runId)
  } catch {}
}

/** Record something already done, in one go. */
export async function recordActivity(db: any, a: Activity, steps: ActivityStep[], end: { status?: string; outcome?: string | null } = {}): Promise<string | null> {
  const id = await startActivity(db, a)
  await finishActivity(db, id, a.companyId, steps, { outcome: a.outcome ?? null, ...end })
  return id
}

/** A change the in-app assistant made for a team member (they asked, and approved it if it needed approval). */
export async function recordAssistantAction(db: any, ctx: { companyId: string; userName?: string | null; role?: string | null; conversationId?: string | null; contactId?: string | null }, tool: string, args: any, r: { ok: boolean; error?: string; card?: any; entityType?: string; entityId?: string }, approved: boolean) {
  const who = ctx.userName || 'a team member'
  const what = r?.card?.title || tool.replace(/_/g, ' ')
  return recordActivity(db, {
    companyId: ctx.companyId, roleKey: 'assistant', trigger: 'assistant',
    conversationId: ctx.conversationId || null, contactId: ctx.contactId || null,
    input: { for: ctx.userName || null, tool },
    summary: `${r?.ok ? 'Did' : 'Tried'} “${what}” for ${who}${approved ? ' after they approved it' : ' when they asked'}.`,
  }, [{
    action_key: tool, input: args || {}, output: r?.ok ? (r.card || { ok: true }) : { error: r?.error || 'Failed' }, status: r?.ok ? 'ok' : 'error',
    decision_reason: approved ? `${who} reviewed the preview and approved it.` : `${who} asked for it; it’s a reversible change inside Colvy.`,
    entity_type: r?.entityType || null, entity_id: r?.entityId || null,
  }], { status: r?.ok ? 'completed' : 'failed' })
}
