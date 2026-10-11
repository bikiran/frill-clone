// Shared types for the Colvy Agent Engine (lib/agent/*).
//
// One engine runs every AI role. A role is configuration — a goal,
// instructions, the actions it may use and default autonomy — never a separate
// code path. The model only ever *requests* actions; every request goes through
// the policy engine, and every step is recorded in agent_steps.

export type Autonomy = 'off' | 'suggest' | 'prepare' | 'act_within_limits' | 'autonomous'
export const AUTONOMY_ORDER: Autonomy[] = ['off', 'suggest', 'prepare', 'act_within_limits', 'autonomous']
export const autonomyRank = (a: Autonomy) => AUTONOMY_ORDER.indexOf(a)
export const minAutonomy = (...levels: Autonomy[]): Autonomy =>
  levels.reduce((lo, a) => (autonomyRank(a) < autonomyRank(lo) ? a : lo), 'autonomous' as Autonomy)

export type RunMode = 'live' | 'sandbox'
export type TriggerType = 'inbound_message' | 'event' | 'schedule' | 'staff_request' | 'sandbox' | 'mcp' | 'approval_decision'

export type AgentTrigger = {
  type: TriggerType
  companyId: string
  roleKey: string
  mode: RunMode
  ref?: string | null                // e.g. the inbound message id
  dedupeKey?: string | null          // one run per key per company
  conversationId?: string | null
  contactId?: string | null
  actorUserId?: string | null        // who started it (staff / sandbox)
  goal?: string | null
  input?: Record<string, any>        // e.g. { message: 'Where is my order?' }
}

export type RunStatus = 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'escalated' | 'failed' | 'cancelled'

// ── Actions ──────────────────────────────────────────────────────────────────

export type ActionCategory = 'read' | 'internal_write' | 'communicate' | 'money' | 'external_write' | 'control'

/** What every action handler receives. Company-scoped; never trust input for
 *  the company. */
export type ActionContext = {
  db: any
  companyId: string
  companyName: string
  siteOrigin: string
  runId: string
  roleKey: string
  roleName: string
  mode: RunMode
  conversationId: string | null
  contactId: string | null
  /** How sure we are the person in the conversation is this contact. */
  customerVerification: 'verified' | 'probable' | 'unknown'
  /** Run-scoped state actions can share (e.g. orders the customer proved are theirs). */
  scratch: Record<string, any>
}

export type ActionResult = {
  ok: boolean
  data?: any                          // fed back to the model
  error?: string
  entityType?: string                 // what it created/changed, for "Why?" links
  entityId?: string
  summary?: string                    // one line for the audit trail
}

export type JsonSchema = { type: 'object'; properties: Record<string, any>; required?: string[]; additionalProperties?: boolean }

export interface ActionDef {
  key: string
  description: string                 // for the model
  input: JsonSchema
  category: ActionCategory
  risk: 'low' | 'medium' | 'high'
  /** Platform ceiling — no tenant policy can raise an action above this. */
  maxAutonomy: Autonomy
  /** Safe for a role that talks to customers? (false = staff-only data, e.g.
   *  searching all orders by name). */
  customerSafe: boolean
  /** Money involved, for policy limits. */
  amountCents?(input: any, ctx: ActionContext): Promise<number | null> | number | null
  run(ctx: ActionContext, input: any): Promise<ActionResult>
}

// ── Policy ───────────────────────────────────────────────────────────────────

export type PolicyLimits = {
  max_amount_cents?: number
  max_per_day?: number
  require_verified_customer?: boolean
  channels?: string[]
}

export type Decision = {
  verdict: 'allowed' | 'suggested' | 'needs_approval' | 'denied'
  autonomy: Autonomy                  // the level the verdict came from
  reason: string                      // plain English, shown in the audit trail
  policyId?: string | null
}

// ── Roles ────────────────────────────────────────────────────────────────────

export interface RoleDef {
  key: string
  name: string
  goal: string
  instructions: string
  customerFacing: boolean
  actions: string[]
  defaultAutonomy: Record<string, { autonomy: Autonomy; limits?: PolicyLimits }>
  modelTier: 'fast' | 'smart'
  maxSteps: number
}
