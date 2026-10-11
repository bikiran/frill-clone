// Approvals: actions an agent prepared that wait for a person ("prepare").
// The arguments were frozen when the agent asked; approving runs exactly those
// (or the person's edit of them), never something re-generated.

import { sendAgentMessage } from './send'

export async function pendingApprovals(db: any, companyId: string, opts: { conversationId?: string | null; limit?: number } = {}) {
  let q = db.from('agent_approvals').select('id, run_id, action_key, args, status, created_at, expires_at').eq('company_id', companyId).eq('status', 'pending')
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 50)
  if (error) throw error
  let rows = (data || []).filter((a: any) => !a.expires_at || new Date(a.expires_at).getTime() > Date.now())
  if (!rows.length) return []
  const runIds = Array.from(new Set(rows.map((a: any) => a.run_id)))
  const { data: runs } = await db.from('agent_runs').select('id, role_key, conversation_id, summary, intent, created_at').in('id', runIds)
  const byId = new Map((runs || []).map((r: any) => [r.id, r]))
  rows = rows.map((a: any) => ({ ...a, run: byId.get(a.run_id) || null }))
  if (opts.conversationId) rows = rows.filter((a: any) => a.run?.conversation_id === opts.conversationId)
  else if (rows.length) {
    // The list across conversations: who each one is for, and on which channel.
    const convIds = Array.from(new Set(rows.map((a: any) => a.run?.conversation_id).filter(Boolean)))
    const { data: convs } = convIds.length ? await db.from('conversations').select('id, channel, contact_id').in('id', convIds) : { data: [] }
    const contactIds = Array.from(new Set((convs || []).map((c: any) => c.contact_id).filter(Boolean)))
    const { data: contacts } = contactIds.length ? await db.from('contacts').select('id, name, phone, email').in('id', contactIds) : { data: [] }
    const cById = new Map((contacts || []).map((c: any) => [c.id, c]))
    const convById = new Map((convs || []).map((c: any) => [c.id, c]))
    rows = rows.map((a: any) => {
      const conv: any = convById.get(a.run?.conversation_id)
      const ct: any = conv ? cById.get(conv.contact_id) : null
      return { ...a, conversation: conv ? { id: conv.id, channel: conv.channel, customer: ct?.name || ct?.phone || ct?.email || null } : null }
    })
  }
  return rows
}

/** Suggestions nobody acted on in time. Their run is finished; the reply is not sent. */
export async function expireApprovals(db: any): Promise<number> {
  const now = new Date().toISOString()
  const { data } = await db.from('agent_approvals').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', now).select('id, run_id')
  const runIds = Array.from(new Set((data || []).map((a: any) => a.run_id)))
  for (const id of runIds) {
    const { data: run } = await db.from('agent_runs').select('*').eq('id', id).maybeSingle()
    if (run) await settleRun(db, run)
  }
  return (data || []).length
}

async function logStep(db: any, run: any, step: Record<string, any>) {
  const { data: fresh } = await db.from('agent_runs').select('step_count').eq('id', run.id).maybeSingle()
  const seq = (Number(fresh?.step_count) || 0) + 1
  await db.from('agent_steps').insert({ run_id: run.id, company_id: run.company_id, seq, ...step }).then(() => {}, () => {})
  await db.from('agent_runs').update({ step_count: seq, updated_at: new Date().toISOString() }).eq('id', run.id)
}

/** Once nothing is waiting any more, the run is finished. */
async function settleRun(db: any, run: any) {
  const { data: left } = await db.from('agent_approvals').select('id').eq('run_id', run.id).eq('status', 'pending').limit(1)
  if (!left?.length && run.status === 'awaiting_approval') {
    await db.from('agent_runs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', run.id)
  }
}

export async function decideApproval(db: any, opts: {
  companyId: string
  approvalId: string
  action: 'approve' | 'reject'
  user: { id: string | null; name: string | null }
  text?: string | null
}): Promise<{ ok: boolean; error?: string; status?: string }> {
  // Claim it: only one person can decide, once.
  const { data: ap } = await db.from('agent_approvals')
    .update({ status: opts.action === 'approve' ? 'approved' : 'rejected', decided_by: opts.user.id, decided_at: new Date().toISOString() })
    .eq('id', opts.approvalId).eq('company_id', opts.companyId).eq('status', 'pending')
    .select('*').maybeSingle()
  if (!ap) return { ok: false, error: 'This suggestion was already handled.' }
  const { data: run } = await db.from('agent_runs').select('*').eq('id', ap.run_id).maybeSingle()
  if (!run) return { ok: false, error: 'Run not found.' }

  const who = opts.user.name || 'A team member'
  if (opts.action === 'reject') {
    await logStep(db, run, { kind: 'approval', action_key: ap.action_key, decision: 'denied', decision_reason: `${who} dismissed it.`, status: 'skipped', input: ap.args })
    await settleRun(db, run)
    return { ok: true, status: 'rejected' }
  }

  if (ap.action_key !== 'send_message') {
    await db.from('agent_approvals').update({ status: 'failed', result: { error: 'Not supported yet' } }).eq('id', ap.id)
    return { ok: false, error: 'Approving this kind of action isn’t supported yet.' }
  }
  const original = String(ap.args?.text || '')
  const text = String(opts.text ?? original).trim()
  const edited = text !== original.trim()
  const sent = await sendAgentMessage(db, { companyId: opts.companyId, conversationId: run.conversation_id, text, runId: run.id, approvedBy: opts.user, edited })
  await db.from('agent_approvals').update({ status: sent.ok ? (edited ? 'edited' : 'executed') : 'failed', result: sent.ok ? { channel: sent.channel, text, edited } : { error: sent.error } }).eq('id', ap.id)
  await logStep(db, run, {
    kind: 'approval', action_key: 'send_message', decision: 'allowed',
    decision_reason: sent.ok ? `${who} ${edited ? 'edited and sent' : 'approved and sent'} it.` : `${who} approved it, but sending failed: ${sent.error}`,
    status: sent.ok ? 'ok' : 'error', input: { text, edited }, output: sent.ok ? { channel: sent.channel } : { error: sent.error },
    entity_type: 'conversation', entity_id: run.conversation_id,
  })
  await settleRun(db, run)
  return sent.ok ? { ok: true, status: edited ? 'edited' : 'executed' } : { ok: false, error: sent.error }
}
