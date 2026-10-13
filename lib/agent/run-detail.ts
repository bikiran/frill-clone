// One agent run with every step and approval, in order — what the AI Agents
// page shows when a run is opened.

import { activityName } from '@/lib/agent/record'

const STEP_COLS = 'id, seq, kind, action_key, input, output, reason, decision, decision_reason, autonomy, status, entity_type, entity_id, duration_ms, tokens_in, tokens_out, created_at'

/**
 * A company's run with its steps and approvals, read in one round (the steps
 * are only returned when the run turns out to be this company's). Null when
 * there's no such run.
 */
export async function runDetail(db: any, companyId: string, runId: string) {
  const [{ data: run }, { data: steps }, { data: approvals }] = await Promise.all([
    db.from('agent_runs').select('*').eq('company_id', companyId).eq('id', runId).maybeSingle(),
    db.from('agent_steps').select(STEP_COLS).eq('run_id', runId).order('seq', { ascending: true }),
    db.from('agent_approvals').select('id, action_key, args, status, result, created_at, expires_at').eq('run_id', runId).order('created_at', { ascending: true }),
  ])
  if (!run) return null
  return { run: { ...run, actor: activityName(run.role_key, run.input) }, steps: steps || [], approvals: approvals || [] }
}
