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
