// The policy engine. Every action an agent requests passes through decide();
// there is no other path to run an action, so a model can't talk its way past
// it. The final autonomy is the LOWEST of:
//
//   platform ceiling (action.maxAutonomy)
//   ∩ the role allowing the action at all
//   ∩ the business's policy (role+action > any-role+action > role default)
//   ∩ the limits (amount, per-day count, verified customer, channel)
//   ∩ sandbox mode (nothing with side effects runs — it's recorded as a suggestion)
//
// and maps to a verdict: off → denied, suggest → suggested, prepare →
// needs_approval, act_within_limits / autonomous → allowed.

import type { ActionContext, ActionDef, Autonomy, Decision, PolicyLimits, RoleDef } from './types'
import { minAutonomy } from './types'
import { pauseFrom } from './pilot'

type PolicyRow = { id: string; role_key: string | null; action_key: string; autonomy: Autonomy; limits: PolicyLimits }

export async function loadPolicies(db: any, companyId: string): Promise<PolicyRow[]> {
  // Includes the kill-switch row (action '*'), which pauseFrom() reads.
  try {
    const { data } = await db.from('agent_policies').select('id, role_key, action_key, autonomy, limits').eq('company_id', companyId)
    return (data || []) as PolicyRow[]
  } catch { return [] }
}

function tenantPolicy(policies: PolicyRow[], role: RoleDef, action: ActionDef): { autonomy: Autonomy; limits: PolicyLimits; policyId: string | null; source: string } {
  const exact = policies.find(p => p.role_key === role.key && p.action_key === action.key)
  if (exact) return { autonomy: exact.autonomy, limits: exact.limits || {}, policyId: exact.id, source: `your ${role.name} setting for ${action.key}` }
  const any = policies.find(p => p.role_key == null && p.action_key === action.key)
  if (any) return { autonomy: any.autonomy, limits: any.limits || {}, policyId: any.id, source: `your setting for ${action.key}` }
  const def = role.defaultAutonomy[action.key]
  if (def) return { autonomy: def.autonomy, limits: def.limits || {}, policyId: null, source: `the ${role.name} default` }
  // Reads are always fine for a role that lists them; anything else defaults
  // to asking a person.
  return { autonomy: action.category === 'read' || action.category === 'control' ? 'autonomous' : 'prepare', limits: {}, policyId: null, source: 'the platform default' }
}

// "Per day" is the last 24 hours — the server's midnight isn't the business's.
async function countToday(db: any, companyId: string, actionKey: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000)
  try {
    const { count } = await db.from('agent_steps').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('action_key', actionKey).eq('decision', 'allowed').eq('kind', 'action').gte('created_at', since.toISOString())
    return count || 0
  } catch { return 0 }
}

const VERDICT: Record<Autonomy, Decision['verdict']> = {
  off: 'denied', suggest: 'suggested', prepare: 'needs_approval', act_within_limits: 'allowed', autonomous: 'allowed',
}

export async function decide(
  ctx: ActionContext,
  role: RoleDef,
  action: ActionDef,
  input: any,
  policies: PolicyRow[],
): Promise<Decision> {
  // Kill switch: every agent is paused for this business.
  const pause = pauseFrom(policies)
  if (pause.paused && ctx.mode === 'live' && action.category !== 'read' && action.category !== 'control') {
    return { verdict: 'denied', autonomy: 'off', reason: `Agents are paused${pause.byName ? ` (by ${pause.byName})` : ''}.` }
  }
  if (!role.actions.includes(action.key)) {
    return { verdict: 'denied', autonomy: 'off', reason: `${role.name} isn’t allowed to use ${action.key}.` }
  }
  if (role.customerFacing && !action.customerSafe && ctx.mode === 'live') {
    return { verdict: 'denied', autonomy: 'off', reason: `${action.key} searches every customer’s data, so a customer-facing agent can’t use it.` }
  }

  const tenant = tenantPolicy(policies, role, action)
  let level = minAutonomy(action.maxAutonomy, tenant.autonomy)
  let reason = level === tenant.autonomy
    ? `Allowed level “${level}” from ${tenant.source}.`
    : `Capped at “${level}” — the most Colvy allows for ${action.key}.`

  // Limits only matter where the agent would act on its own.
  if (level === 'act_within_limits') {
    const limits = tenant.limits || {}
    const amount = action.amountCents ? await action.amountCents(input, ctx) : null
    if (limits.max_amount_cents != null && amount != null && amount > limits.max_amount_cents) {
      level = 'prepare'; reason = `Over the limit ($${(amount / 100).toFixed(2)} > $${(limits.max_amount_cents / 100).toFixed(2)}), so a person approves it.`
    } else if (limits.require_verified_customer && ctx.customerVerification !== 'verified') {
      level = 'prepare'; reason = 'The customer isn’t verified yet, so a person approves it.'
    } else if (limits.max_per_day != null && (await countToday(ctx.db, ctx.companyId, action.key)) >= limits.max_per_day) {
      level = 'prepare'; reason = `Daily limit of ${limits.max_per_day} reached, so a person approves it.`
    } else {
      const why = action.autoCheck ? await action.autoCheck(ctx, input, limits) : null
      if (why) { level = 'prepare'; reason = why }
      else reason = `Within the limits set by ${tenant.source}.`
    }
  }

  // Sandbox: anything with side effects is only recorded.
  if (ctx.mode === 'sandbox' && action.category !== 'read' && action.category !== 'control' && level !== 'off') {
    return { verdict: 'suggested', autonomy: level, reason: `Sandbox run — recorded, not done. (Live, this would be: ${VERDICT[level].replace('_', ' ')}.)`, policyId: tenant.policyId }
  }

  return { verdict: VERDICT[level], autonomy: level, reason, policyId: tenant.policyId }
}
