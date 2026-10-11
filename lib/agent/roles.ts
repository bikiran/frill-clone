// Agent roles: configurations of the one shared engine.
//
// A role is a goal, instructions, the actions it may use and its default
// autonomy per action. A business can override any of it (agent_roles,
// agent_policies); the platform ceilings on each action always win.

import type { RoleDef } from './types'

const SUPPORT: RoleDef = {
  key: 'support',
  name: 'Colvy Support Agent',
  goal: 'Resolve customer problems and order questions where you can, and bring the team the exceptions.',
  instructions: [
    'You work for the business, talking to one of its customers.',
    'Find out what the customer needs, look up the facts with your actions, then either answer or hand it to the team.',
    'Never guess or invent anything — order details, prices, stock, policies, dates. If you can’t confirm it with an action, say you’ll check with the team and escalate.',
    'Only discuss an order with the customer it belongs to. Use find_customer_orders, then check_order_status — never guess an order.',
    'For “where is my order?”: give the status in plain words, the tracking link if there is one, and the delivery estimate if known. Follow the guidance check_order_status gives: if it says escalate or the team should check, do that.',
    'Escalate when the customer is upset, something looks wrong (late, lost, damaged, refused payment), it needs a decision or money, or you are not sure.',
    'Keep replies short, warm and plain — like a helpful person at the counter. No markdown, no emojis.',
    'Talk to the customer only with send_message. End every run with finish.',
  ].join('\n'),
  customerFacing: true,
  actions: ['get_conversation', 'get_contact', 'find_customer_orders', 'check_order_status', 'ask_knowledge', 'check_stock', 'create_task', 'send_message', 'escalate_to_human', 'finish'],
  defaultAutonomy: {
    send_message: { autonomy: 'prepare' },                  // Phase 3 pilot moves this to act_within_limits
    create_task: { autonomy: 'act_within_limits', limits: { max_per_day: 50 } },
    escalate_to_human: { autonomy: 'autonomous' },
  },
  modelTier: 'smart',
  maxSteps: 8,
}

export const ROLES: Record<string, RoleDef> = { support: SUPPORT }

/** The role with this business's overrides applied (agent_roles row). */
export async function loadRole(db: any, companyId: string, roleKey: string): Promise<(RoleDef & { enabled: boolean }) | null> {
  const base = ROLES[roleKey]
  if (!base) return null
  let row: any = null
  try {
    const { data } = await db.from('agent_roles').select('*').eq('company_id', companyId).eq('role_key', roleKey).maybeSingle()
    row = data
  } catch {}
  const allowed = Array.isArray(row?.allowed_actions) && row.allowed_actions.length
    // A business can narrow the list, never widen it past the template.
    ? base.actions.filter(a => row.allowed_actions.includes(a) || a === 'finish' || a === 'escalate_to_human')
    : base.actions
  return {
    ...base,
    name: row?.name || base.name,
    goal: row?.goal || base.goal,
    instructions: row?.instructions ? `${base.instructions}\n\nThe business adds:\n${row.instructions}` : base.instructions,
    actions: allowed,
    enabled: !!row?.enabled,
  }
}
