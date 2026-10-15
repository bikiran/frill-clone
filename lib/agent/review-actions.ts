// Reputation Agent actions (Phase 8): read the review this run is about, and
// reply to it on Google.
//
// A run is tied to ONE review (run.input.reviewId) — the agent can't pick a
// different one. Replies are public, so before one goes out on its own the
// engine checks the rating, that it isn't already answered, and that it gives
// nothing private away (order numbers, phone numbers, emails).

import { replyToReview } from '@/lib/google-business'
import type { ActionContext, ActionDef, JsonSchema, PolicyLimits } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

async function theReview(ctx: ActionContext) {
  const input = ctx.scratch.runInput || {}
  if (input.reviewId) {
    const { data } = await ctx.db.from('google_reviews').select('id, review_id, reviewer_name, star_rating, comment, reply_comment, review_created_at, contact_id, contact_name')
      .eq('company_id', ctx.companyId).eq('review_id', input.reviewId).maybeSingle()
    if (data) return data
  }
  // A sandbox try-out: the review typed on the AI Agents page.
  if (ctx.mode === 'sandbox' && (input.message || input.rating)) {
    return { id: null, review_id: null, reviewer_name: input.reviewer || 'A customer', star_rating: Number(input.rating) || null, comment: input.message || null, reply_comment: null, review_created_at: new Date().toISOString(), contact_id: null, contact_name: null }
  }
  return null
}

export const getReview: ActionDef = {
  key: 'get_review',
  description: 'The Google review you are replying to: who left it, the stars, what they wrote, and whether it already has a reply. Also a few replies the business wrote before, to match its voice.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx) {
    const r = await theReview(ctx)
    if (!r) return { ok: false, error: 'This run has no review.' }
    ctx.scratch.review = r
    const { data: past } = await ctx.db.from('google_reviews').select('star_rating, reply_comment').eq('company_id', ctx.companyId)
      .not('reply_comment', 'is', null).order('replied_at', { ascending: false }).limit(4)
    return {
      ok: true,
      data: {
        reviewer: r.reviewer_name, stars: r.star_rating, wrote: r.comment || '(no written comment — just the stars)',
        left: (r.review_created_at || '').slice(0, 10), alreadyReplied: !!r.reply_comment, existingReply: r.reply_comment || null,
        isKnownCustomer: !!r.contact_id,
        repliesWeWroteBefore: (past || []).filter((p: any) => p.reply_comment).map((p: any) => ({ stars: p.star_rating, reply: String(p.reply_comment).slice(0, 400) })),
      },
      summary: `${r.star_rating ?? '?'}★ from ${r.reviewer_name || 'a customer'}`,
    }
  },
}

// Anything that looks private: order numbers, phone numbers, emails, street addresses.
const PRIVATE = /(#\s?\d{4,}|\border\s*(no\.?|number|#)?\s*\d{4,}|\+?\d[\d\s-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{1,5}\s+[A-Za-z]+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|court|ct|parade)\b)/i

async function replyOnItsOwn(ctx: ActionContext, args: any, limits: PolicyLimits & { min_rating?: number }): Promise<string | null> {
  const r = ctx.scratch.review || await theReview(ctx)
  if (!r) return 'There’s no review to reply to.'
  const min = Number(limits.min_rating) || 4
  if (!r.star_rating || r.star_rating < min) return `${r.star_rating ?? 'No'}★ review — replies to reviews under ${min}★ wait for a person.`
  if (r.reply_comment) return 'This review already has a reply, so a person decides whether to change it.'
  if (PRIVATE.test(String(args?.text || ''))) return 'The reply mentions something that looks private (an order number, phone, email or address), so a person checks it first.'
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the reply.'
  return null
}

export const replyToReviewAction: ActionDef = {
  key: 'reply_to_review',
  description: 'Post a public reply to this Google review. Plain text, 1–4 sentences. Never include order numbers, phone numbers, emails or anything private.',
  input: obj({
    text: { type: 'string', description: 'The public reply.' },
    knowledge_gap: { type: 'boolean', description: 'true when the reply doesn’t answer a question they asked because the business’s knowledge doesn’t cover it (you invite them to get in touch instead).' },
  }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: replyOnItsOwn,
  async run(ctx, args) {
    const r = ctx.scratch.review || await theReview(ctx)
    if (!r?.review_id) return { ok: false, error: 'This run has no review to reply to.' }
    const text = String(args?.text || '').trim().slice(0, 4000)
    if (!text) return { ok: false, error: 'Nothing to post.' }
    try {
      await replyToReview(ctx.companyId, r.review_id, text)
      return { ok: true, data: { posted: true }, entityType: 'review', entityId: r.id, summary: `Replied to ${r.reviewer_name || 'the'}’s ${r.star_rating}★ review` }
    } catch (e: any) { return { ok: false, error: e?.message || 'Couldn’t post the reply to Google.' } }
  },
}

/** For approvals: post a reply a person approved (or edited) for the run's review. */
export async function postApprovedReviewReply(db: any, companyId: string, run: any, text: string): Promise<{ ok: boolean; error?: string }> {
  const reviewId = run?.input?.reviewId
  if (!reviewId) return { ok: false, error: 'This suggestion isn’t linked to a review.' }
  try { await replyToReview(companyId, reviewId, text); return { ok: true } }
  catch (e: any) { return { ok: false, error: e?.message || 'Couldn’t post the reply to Google.' } }
}
