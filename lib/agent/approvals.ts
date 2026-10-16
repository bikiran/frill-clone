// Approvals: actions an agent prepared that wait for a person ("prepare").
// The arguments were frozen when the agent asked; approving runs exactly those
// (or the person's edit of them), never something re-generated.

import { sendAgentMessage } from './send'
import { postApprovedReviewReply } from './review-actions'
import { postApprovedCommentReply } from './comment-actions'
import { runApprovedBookingAction } from './booking-actions'
import { sendApprovedCartFollowup } from './sales-actions'
import { sendApprovedOrderUpdate } from './ops-actions'
import { sendApprovedSalesFollowup } from './followup-actions'
import { isExternalKey, runApprovedExternalAction } from './external-tools'

// Suggested replies in a conversation. Only one should ever be waiting: a new
// customer message makes earlier ones out of date, and so does a reply from the
// team. Out-of-date ones are expired (result.superseded) instead of piling up.
const REPLY_ACTIONS = ['send_message', 'send_sales_followup']

/**
 * Expire this conversation's waiting reply suggestions except those from
 * keepRunId (the run that just drafted one), plus any older than a reply a
 * person sent since.
 */
export async function retireStaleSuggestions(db: any, companyId: string, conversationId: string, opts: { keepRunId?: string | null } = {}): Promise<number> {
  try {
    const { data: runs } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50)
    const runIds = (runs || []).map((r: any) => r.id)
    if (!runIds.length) return 0
    const { data: waiting } = await db.from('agent_approvals').select('id, run_id, created_at').eq('company_id', companyId).eq('status', 'pending').in('action_key', REPLY_ACTIONS).in('run_id', runIds)
    if (!waiting?.length) return 0
    const { data: human } = await db.from('messages').select('created_at, metadata').eq('conversation_id', conversationId).eq('sender_type', 'agent').eq('is_ai', false).order('created_at', { ascending: false }).limit(5)
    // The automatic missed-call text (lib/missed-call-text) isn't anyone replying.
    const lastHuman = (human || []).find((m: any) => !m.metadata?.missed_call_text)
    const humanAt = lastHuman?.created_at ? new Date(lastHuman.created_at).getTime() : 0
    const stale = waiting.filter((a: any) => a.run_id !== opts.keepRunId || new Date(a.created_at).getTime() < humanAt)
    return await expireAsSuperseded(db, stale)
  } catch { return 0 }
}

async function expireAsSuperseded(db: any, rows: any[]): Promise<number> {
  if (!rows.length) return 0
  await db.from('agent_approvals').update({ status: 'expired', result: { superseded: true } }).in('id', rows.map(r => r.id)).eq('status', 'pending')
  for (const runId of Array.from(new Set(rows.map(r => r.run_id)))) {
    const { data: run } = await db.from('agent_runs').select('*').eq('id', runId).maybeSingle()
    if (run) await settleRun(db, run)
  }
  return rows.length
}

export async function pendingApprovals(db: any, companyId: string, opts: { conversationId?: string | null; limit?: number } = {}) {
  let q = db.from('agent_approvals').select('id, run_id, action_key, args, status, created_at, expires_at').eq('company_id', companyId).eq('status', 'pending')
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit || 50)
  if (error) throw error
  let rows = (data || []).filter((a: any) => !a.expires_at || new Date(a.expires_at).getTime() > Date.now())
  if (!rows.length) return []
  const runIds = Array.from(new Set(rows.map((a: any) => a.run_id)))
  const { data: runs } = await db.from('agent_runs').select('id, role_key, conversation_id, summary, intent, created_at, input').in('id', runIds)
  const byId = new Map((runs || []).map((r: any) => [r.id, r]))
  rows = rows.map((a: any) => ({ ...a, run: byId.get(a.run_id) || null }))
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
  // Never more than one suggested reply per conversation: keep the newest
  // (rows are newest first) and clear the rest — tidies up any backlog too.
  const seen = new Set<string>(), older: any[] = []
  rows = rows.filter((a: any) => {
    const conv = a.run?.conversation_id
    if (!REPLY_ACTIONS.includes(a.action_key) || !conv) return true
    if (seen.has(conv)) { older.push(a); return false }
    seen.add(conv); return true
  })
  if (older.length) await expireAsSuperseded(db, older).catch(() => 0)
  if (opts.conversationId) {
    rows = rows.filter((a: any) => a.run?.conversation_id === opts.conversationId)
    // Someone on the team already answered after it was drafted? Then it's out of date.
    const reply = rows.find((a: any) => REPLY_ACTIONS.includes(a.action_key))
    if (reply && (await retireStaleSuggestions(db, companyId, opts.conversationId, { keepRunId: reply.run_id }))) {
      const { data: still } = await db.from('agent_approvals').select('id').in('id', rows.map((a: any) => a.id)).eq('status', 'pending')
      const ids = new Set((still || []).map((x: any) => x.id))
      rows = rows.filter((a: any) => ids.has(a.id))
    }
  }
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

  // Booking changes (Reception Agent): approve runs exactly what was prepared.
  if (ap.action_key === 'reschedule_booking' || ap.action_key === 'cancel_booking') {
    const { _preview, ...args } = ap.args || {}
    const r = await runApprovedBookingAction(db, opts.companyId, ap.action_key, args, process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
    await db.from('agent_approvals').update({ status: r.ok ? 'executed' : 'failed', result: r.ok ? { done: r.detail } : { error: r.error } }).eq('id', ap.id)
    await logStep(db, run, {
      kind: 'approval', action_key: ap.action_key, decision: 'allowed',
      decision_reason: r.ok ? `${who} approved it — ${_preview || ap.action_key.replace(/_/g, ' ')} (${r.detail}).` : `${who} approved it, but it didn’t go through: ${r.error}`,
      status: r.ok ? 'ok' : 'error', input: args, output: r.ok ? { done: r.detail } : { error: r.error },
      entity_type: 'booking', entity_id: args.bookingId || null,
    })
    await settleRun(db, run)
    return r.ok ? { ok: true, status: 'executed' } : { ok: false, error: r.error }
  }

  // Outside tools (MCP connections): approve runs exactly what was prepared.
  if (isExternalKey(ap.action_key)) {
    const { _preview, ...args } = ap.args || {}
    const r = await runApprovedExternalAction(db, opts.companyId, ap.action_key, args)
    await db.from('agent_approvals').update({ status: r.ok ? 'executed' : 'failed', result: r.ok ? { done: r.detail } : { error: r.error } }).eq('id', ap.id)
    await logStep(db, run, {
      kind: 'approval', action_key: ap.action_key, decision: 'allowed',
      decision_reason: r.ok ? `${who} approved it — ${_preview || 'outside tool'}.` : `${who} approved it, but it didn’t go through: ${r.error}`,
      status: r.ok ? 'ok' : 'error', input: args, output: r.ok ? { done: r.detail } : { error: r.error },
    })
    await settleRun(db, run)
    return r.ok ? { ok: true, status: 'executed' } : { ok: false, error: r.error }
  }

  // A task an agent held back (over the daily cap for AI-made tasks): approving
  // makes it now, still adding to an open task if one has since appeared.
  if (ap.action_key === 'create_task') {
    const { _preview, ...args } = ap.args || {}
    const { getAction } = await import('./actions')
    const { ROLES } = await import('./roles')
    const action = getAction('create_task')
    const ctx: any = {
      db, companyId: opts.companyId, companyName: '', siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com',
      runId: run.id, roleKey: run.role_key, roleName: ROLES[run.role_key]?.name || 'Colvy AI agent', mode: 'live',
      conversationId: run.conversation_id || null, contactId: run.contact_id || null,
      scratch: { taskCapExempt: true, offeredTaskIds: [], ...(run.input?.orderId ? { opsOrder: { id: run.input.orderId } } : {}) },
    }
    let r: any
    try { r = await action!.run(ctx, { ...args, existingTaskId: undefined }) } catch (e: any) { r = { ok: false, error: e?.message || 'Failed' } }
    await db.from('agent_approvals').update({ status: r.ok ? 'executed' : 'failed', result: r.ok ? { done: r.summary } : { error: r.error } }).eq('id', ap.id)
    await logStep(db, run, {
      kind: 'approval', action_key: ap.action_key, decision: 'allowed',
      decision_reason: r.ok ? `${who} approved it — ${r.summary}.` : `${who} approved it, but it didn’t go through: ${r.error}`,
      status: r.ok ? 'ok' : 'error', input: args, output: r.ok ? (r.data ?? { done: r.summary }) : { error: r.error },
      entity_type: r.entityType || null, entity_id: r.entityId || null,
    })
    await settleRun(db, run)
    return r.ok ? { ok: true, status: 'executed' } : { ok: false, error: r.error }
  }

  if (!['send_message', 'reply_to_review', 'reply_to_comment', 'send_cart_followup', 'send_order_update', 'send_sales_followup'].includes(ap.action_key)) {
    await db.from('agent_approvals').update({ status: 'failed', result: { error: 'Not supported yet' } }).eq('id', ap.id)
    return { ok: false, error: 'Approving this kind of action isn’t supported yet.' }
  }
  const original = String(ap.args?.text || '')
  const text = String(opts.text ?? original).trim()
  const edited = text !== original.trim()
  const isComment = ap.action_key === 'reply_to_comment'
  const isReview = ap.action_key === 'reply_to_review' || isComment   // public replies: "posted"
  const sent: { ok: boolean; error?: string; channel?: string } = isComment
    ? await postApprovedCommentReply(db, opts.companyId, run, text).then(r => ({ ...r, channel: r.ok ? (run.input?.platform || 'social') : undefined }))
    : isReview
    ? await postApprovedReviewReply(db, opts.companyId, run, text).then(r => ({ ...r, channel: r.ok ? 'google' : undefined }))
    : ap.action_key === 'send_cart_followup'
    ? await sendApprovedCartFollowup(db, opts.companyId, run, text, opts.user)
    : ap.action_key === 'send_order_update'
    ? await sendApprovedOrderUpdate(db, opts.companyId, run, text, opts.user)
    : ap.action_key === 'send_sales_followup'
    ? await sendApprovedSalesFollowup(db, opts.companyId, run, text, opts.user)
    : await sendAgentMessage(db, { companyId: opts.companyId, conversationId: run.conversation_id, text, runId: run.id, approvedBy: opts.user, edited, agentName: run.role_key === 'reception' ? 'Reception Agent' : 'Support Agent' })
  await db.from('agent_approvals').update({ status: sent.ok ? (edited ? 'edited' : 'executed') : 'failed', result: sent.ok ? { channel: sent.channel, text, edited } : { error: sent.error } }).eq('id', ap.id)
  const verb = isReview ? (edited ? 'edited and posted' : 'approved and posted') : (edited ? 'edited and sent' : 'approved and sent')
  await logStep(db, run, {
    kind: 'approval', action_key: ap.action_key, decision: 'allowed',
    decision_reason: sent.ok ? `${who} ${verb} it.` : `${who} approved it, but ${isReview ? 'posting' : 'sending'} failed: ${sent.error}`,
    status: sent.ok ? 'ok' : 'error', input: { text, edited }, output: sent.ok ? { channel: sent.channel } : { error: sent.error },
    entity_type: isComment ? 'comment' : isReview ? 'review' : 'conversation', entity_id: isComment ? (run.input?.commentId || null) : isReview ? (run.input?.reviewId || null) : run.conversation_id,
  })
  await settleRun(db, run)
  return sent.ok ? { ok: true, status: edited ? 'edited' : 'executed' } : { ok: false, error: sent.error }
}
