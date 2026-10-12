// Phase 8: new Google reviews start the Reputation Agent.
//
// Called after a review sync with the reviews it just saved. Only for
// businesses that switched the Reputation Agent on, never while agents are
// paused, and only for recent reviews without a reply — the first sync
// imports years of history, which nobody wants answered now. One run per
// review (dedupe); the agent worker picks them up within a minute.

import { enqueueRun } from './engine'
import { agentsPaused } from './pilot'

const RECENT_MS = 3 * 86_400_000
const MAX_PER_SYNC = 20

export async function startReputationAgentForReviews(db: any, companyId: string, reviews: any[]): Promise<{ queued: number; reason?: string }> {
  const fresh = (reviews || []).filter(r => r?.review_id && !r.reply_comment && r.review_created_at && Date.now() - Date.parse(r.review_created_at) < RECENT_MS).slice(0, MAX_PER_SYNC)
  if (!fresh.length) return { queued: 0, reason: 'nothing new' }
  const { data: role } = await db.from('agent_roles').select('enabled').eq('company_id', companyId).eq('role_key', 'reputation').maybeSingle().then((r: any) => r, () => ({ data: null }))
  if (!role?.enabled) return { queued: 0, reason: 'off' }
  if ((await agentsPaused(db, companyId)).paused) return { queued: 0, reason: 'paused' }

  let queued = 0
  for (const r of fresh) {
    try {
      // Already has a run (an earlier sync)? The unique dedupe key would refuse it anyway.
      const { data: existing } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('dedupe_key', `review:${r.review_id}`).maybeSingle()
      if (existing) continue
      const { deduped } = await enqueueRun(db, {
        type: 'event', mode: 'live', companyId, roleKey: 'reputation', ref: r.review_id, dedupeKey: `review:${r.review_id}`,
        contactId: r.contact_id || null,
        input: { kind: 'review', reviewId: r.review_id, rating: r.star_rating ?? null, reviewer: r.reviewer_name || null, message: r.comment || `(${r.star_rating ?? '?'}★ with no written comment)` },
      })
      if (!deduped) queued++
    } catch {}
  }
  return { queued }
}

// Facebook / Instagram comments start the Reputation Agent too — when the
// business switched it on for comments. Called from the Meta webhook (one live
// comment) and after a manual sync (any recent unanswered ones). Only comments
// from the last 3 days that nobody answered, hid or archived; one run each.
export async function queueCommentReplies(db: any, companyId: string, commentIds?: string[]): Promise<{ queued: number; reason?: string }> {
  const { data: role } = await db.from('agent_roles').select('enabled').eq('company_id', companyId).eq('role_key', 'reputation').maybeSingle().then((r: any) => r, () => ({ data: null }))
  if (!role?.enabled) return { queued: 0, reason: 'off' }
  const { getCommentAuto } = await import('./pilot')
  if (!(await getCommentAuto(db, companyId)).on) return { queued: 0, reason: 'comments off' }
  if ((await agentsPaused(db, companyId)).paused) return { queued: 0, reason: 'paused' }

  let q = db.from('social_comments').select('id, platform, author_name, message, contact_id, commented_at, is_replied, is_hidden, is_archived')
    .eq('company_id', companyId).eq('is_replied', false).gte('commented_at', new Date(Date.now() - RECENT_MS).toISOString())
  if (commentIds?.length) q = q.in('id', commentIds)
  const { data: rows } = await q.limit(MAX_PER_SYNC)
  let queued = 0
  for (const c of rows || []) {
    if (c.is_hidden || c.is_archived || !String(c.message || '').trim()) continue
    try {
      const { data: existing } = await db.from('agent_runs').select('id').eq('company_id', companyId).eq('dedupe_key', `comment:${c.id}`).maybeSingle()
      if (existing) continue
      const { deduped } = await enqueueRun(db, {
        type: 'event', mode: 'live', companyId, roleKey: 'reputation', ref: c.id, dedupeKey: `comment:${c.id}`, contactId: c.contact_id || null,
        input: { kind: 'comment', commentId: c.id, platform: c.platform, author: c.author_name || null, message: c.message },
      })
      if (!deduped) queued++
    } catch {}
  }
  return { queued }
}
