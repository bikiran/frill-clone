// What the agents achieved over a period — the numbers on Agents → Results and
// in the weekly email. Live runs only (sandbox tries don't count).
//
// Read from the audit trail the engine already keeps:
//   agent_runs      — one per piece of work (role, status, input)
//   agent_steps     — every action and whether it ran on its own
//   agent_approvals — what waited for a person and what they did with it
// plus abandoned_carts / chat_payments for money won back after a follow-up.

export const SEND_ACTIONS = ['send_message', 'reply_to_review', 'reply_to_comment', 'send_cart_followup', 'send_order_update', 'send_sales_followup']
export const ROLE_NAMES: Record<string, string> = { support: 'Support', reception: 'Reception', reputation: 'Reputation', sales: 'Sales', operations: 'Operations' }

// Minutes a person would have spent: writing a reply themselves vs checking a draft.
export const MINUTES_PER_SENT = 3
export const MINUTES_PER_APPROVED = 2
export const MINUTES_PER_EDITED = 1

export type Totals = {
  runs: number
  sentOnOwn: number          // replies / messages / public replies sent without a person
  otherDone: number          // other work done on its own (outside tools that change something, booking links…)
  approvedAsIs: number       // drafts a person sent unchanged
  edited: number             // drafts a person changed before sending
  dismissed: number          // drafts a person rejected
  unanswered: number         // drafts nobody looked at before they expired
  escalated: number          // handed to the team
  tasks: number              // tasks created for the team
  failed: number             // runs that went wrong
  failedDeliveries: number   // approved but didn't go out
  reviewsAnswered: number
  commentsAnswered: number
  ordersFlagged: number      // Operations Agent runs
  ordersCaught: number       // …that led to a task or a customer update
  customersUpdated: number   // order updates that went out
  cartsWon: number; cartsWonValue: number
  quotesPaid: number; quotesPaidValue: number
  minutesSaved: number
  medianApprovalMinutes: number | null
}

export type RoleRow = { role: string; name: string; runs: number; sentOnOwn: number; approvedAsIs: number; edited: number; dismissed: number; escalated: number; failed: number }
export type Exception = { runId: string; role: string; summary: string; at: string; kind: 'escalated' | 'failed' }
export type Results = { days: number; since: string; current: Totals; previous: Totals; roles: RoleRow[]; exceptions: Exception[] }

const blank = (): Totals => ({
  runs: 0, sentOnOwn: 0, otherDone: 0, approvedAsIs: 0, edited: 0, dismissed: 0, unanswered: 0, escalated: 0, tasks: 0, failed: 0, failedDeliveries: 0,
  reviewsAnswered: 0, commentsAnswered: 0, ordersFlagged: 0, ordersCaught: 0, customersUpdated: 0,
  cartsWon: 0, cartsWonValue: 0, quotesPaid: 0, quotesPaidValue: 0, minutesSaved: 0, medianApprovalMinutes: null,
})

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

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Results for the last `days` days, with the same span before it for comparison. */
export async function agentResults(db: any, companyId: string, days = 7, now = Date.now()): Promise<Results> {
  const span = days * 86_400_000
  const since = new Date(now - span).toISOString()
  const before = new Date(now - 2 * span).toISOString()

  // Independent reads, side by side.
  const [runs, steps, approvals] = await Promise.all([
    pageAll(from => db.from('agent_runs').select('id, role_key, status, outcome, summary, input, created_at, mode')
      .eq('company_id', companyId).eq('mode', 'live').gte('created_at', before).order('created_at', { ascending: false }).range(from, from + 999)).catch(() => []),
    pageAll(from => db.from('agent_steps').select('run_id, action_key, kind, decision, status, autonomy, created_at')
      .eq('company_id', companyId).gte('created_at', before).in('kind', ['action', 'approval']).range(from, from + 999)).catch(() => []),
    pageAll(from => db.from('agent_approvals').select('id, run_id, action_key, status, result, created_at, decided_at')
      .eq('company_id', companyId).gte('created_at', before).range(from, from + 999)).catch(() => []),
  ])
  const runById = new Map(runs.map((r: any) => [r.id, r]))

  const cur = blank(), prev = blank()
  const pick = (iso: string) => (iso >= since ? cur : prev)
  const roles = new Map<string, RoleRow>()
  const role = (key: string) => {
    if (!roles.has(key)) roles.set(key, { role: key, name: ROLE_NAMES[key] || key, runs: 0, sentOnOwn: 0, approvedAsIs: 0, edited: 0, dismissed: 0, escalated: 0, failed: 0 })
    return roles.get(key)!
  }
  const exceptions: Exception[] = []
  const caughtRuns = { cur: new Set<string>(), prev: new Set<string>() }
  const sentFollowupRuns = new Set<string>()   // sales runs whose follow-up went out

  for (const r of runs) {
    const t = pick(r.created_at)
    t.runs++
    if (r.status === 'failed') t.failed++
    if (r.role_key === 'operations') t.ordersFlagged++
    if (r.created_at >= since) {
      const row = role(r.role_key); row.runs++
      if (r.status === 'failed') { row.failed++; exceptions.push({ runId: r.id, role: r.role_key, summary: r.summary || 'Something went wrong.', at: r.created_at, kind: 'failed' }) }
    }
  }

  for (const s of steps) {
    const run = runById.get(s.run_id)
    if (!run) continue                     // sandbox or outside the window
    const t = pick(s.created_at)
    const inCur = s.created_at >= since
    if (s.kind === 'action' && s.decision === 'allowed' && s.status === 'ok') {
      const key = String(s.action_key || '')
      if (SEND_ACTIONS.includes(key)) {
        t.sentOnOwn++
        if (inCur) role(run.role_key).sentOnOwn++
        if (key === 'reply_to_review') t.reviewsAnswered++
        if (key === 'reply_to_comment') t.commentsAnswered++
        if (key === 'send_order_update') { t.customersUpdated++; (inCur ? caughtRuns.cur : caughtRuns.prev).add(run.id) }
        if (key === 'send_cart_followup' || key === 'send_sales_followup') sentFollowupRuns.add(run.id)
      } else if (key === 'escalate_to_human') {
        t.escalated++
        if (inCur) { role(run.role_key).escalated++; exceptions.push({ runId: run.id, role: run.role_key, summary: run.summary || 'Handed to the team.', at: s.created_at, kind: 'escalated' }) }
      } else if (key === 'create_task') {
        t.tasks++
        if (run.role_key === 'operations') (inCur ? caughtRuns.cur : caughtRuns.prev).add(run.id)
      } else if (key === 'booking_link' || (key.startsWith('x_') && s.autonomy === 'act_within_limits')) {
        // Outside tools: only what changes something (look-ups run 'autonomous').
        t.otherDone++
      }
    }
  }

  const waits: number[] = []
  for (const a of approvals) {
    const run = runById.get(a.run_id)
    if (!run) continue
    const t = pick(a.created_at)
    const inCur = a.created_at >= since
    const sent = a.status === 'executed' || a.status === 'edited' || a.status === 'approved'
    if (a.status === 'executed' || a.status === 'approved') { t.approvedAsIs++; if (inCur) role(run.role_key).approvedAsIs++ }
    else if (a.status === 'edited') { t.edited++; if (inCur) role(run.role_key).edited++ }
    else if (a.status === 'rejected') { t.dismissed++; if (inCur) role(run.role_key).dismissed++ }
    else if (a.status === 'expired' && !a.result?.superseded) t.unanswered++
    else if (a.status === 'failed') t.failedDeliveries++
    if (sent) {
      if (a.action_key === 'reply_to_review') t.reviewsAnswered++
      if (a.action_key === 'reply_to_comment') t.commentsAnswered++
      if (a.action_key === 'send_order_update') { t.customersUpdated++; (inCur ? caughtRuns.cur : caughtRuns.prev).add(run.id) }
      if (a.action_key === 'send_cart_followup' || a.action_key === 'send_sales_followup') sentFollowupRuns.add(run.id)
    }
    if (inCur && a.decided_at && a.status !== 'expired') {
      const mins = (new Date(a.decided_at).getTime() - new Date(a.created_at).getTime()) / 60000
      if (mins >= 0) waits.push(mins)
    }
  }
  cur.ordersCaught = caughtRuns.cur.size
  prev.ordersCaught = caughtRuns.prev.size
  cur.medianApprovalMinutes = median(waits)

  // ── Money won back after a follow-up went out
  const cartRuns = new Map<string, any>(), payRuns = new Map<string, any>()
  for (const id of sentFollowupRuns) {
    const run = runById.get(id)
    if (run?.input?.kind === 'cart' && run.input.cartId) cartRuns.set(String(run.input.cartId), run)
    if (run?.input?.kind === 'quote' && run.input.paymentId) payRuns.set(String(run.input.paymentId), run)
  }
  await Promise.all([
    cartRuns.size ? (async () => {
      try {
        const { data } = await db.from('abandoned_carts').select('id, status, total').eq('company_id', companyId).in('id', Array.from(cartRuns.keys()))
        for (const c of data || []) {
          if (c.status !== 'recovered') continue
          const t = pick(cartRuns.get(String(c.id)).created_at)
          t.cartsWon++; t.cartsWonValue += Number(c.total) || 0
        }
      } catch {}
    })() : null,
    payRuns.size ? (async () => {
      try {
        const { data } = await db.from('chat_payments').select('id, status, amount_cents').eq('company_id', companyId).in('id', Array.from(payRuns.keys()))
        for (const p of data || []) {
          if (p.status !== 'paid') continue
          const t = pick(payRuns.get(String(p.id)).created_at)
          t.quotesPaid++; t.quotesPaidValue += (Number(p.amount_cents) || 0) / 100
        }
      } catch {}
    })() : null,
  ])

  for (const t of [cur, prev]) t.minutesSaved = t.sentOnOwn * MINUTES_PER_SENT + t.approvedAsIs * MINUTES_PER_APPROVED + t.edited * MINUTES_PER_EDITED

  return {
    days, since, current: cur, previous: prev,
    roles: Array.from(roles.values()).sort((a, b) => b.runs - a.runs),
    exceptions: exceptions.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8),
  }
}
