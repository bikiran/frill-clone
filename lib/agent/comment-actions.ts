// Reputation Agent actions for Facebook / Instagram comments: read the comment
// this run is about, and reply to it publicly.
//
// A run is tied to ONE comment (run.input.commentId, a social_comments id).
// Replies are public, so one only goes out on its own for a friendly, safe
// comment that hasn't been answered, and never with anything private in it.

import { postCommentReply } from '@/lib/social-reply'
import type { ActionContext, ActionDef, JsonSchema, PolicyLimits } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const COLS = 'id, platform, post_id, meta_channel_id, external_comment_id, author_name, author_id, message, sentiment, risk_level, category, is_replied, reply_text, is_hidden, is_archived, commented_at, contact_id'

async function theComment(ctx: ActionContext) {
  const input = ctx.scratch.runInput || {}
  if (input.commentId) {
    const { data } = await ctx.db.from('social_comments').select(COLS).eq('company_id', ctx.companyId).eq('id', input.commentId).maybeSingle()
    if (data) return data
  }
  // A sandbox try-out: the comment typed on the AI Agents page.
  if (ctx.mode === 'sandbox' && input.message) {
    return { id: null, platform: input.platform || 'instagram', post_id: null, author_name: input.author || 'A follower', message: input.message, sentiment: null, risk_level: null, category: null, is_replied: false, reply_text: null }
  }
  return null
}

export const getComment: ActionDef = {
  key: 'get_comment',
  description: 'The Facebook or Instagram comment you are replying to: who wrote it, what they said, the post it’s on, how Colvy classified it (sentiment, risk, category) and the business’s guidelines for that category. Also a few replies the business wrote before, to match its voice.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx) {
    const c = await theComment(ctx)
    if (!c) return { ok: false, error: 'This run has no comment.' }
    ctx.scratch.comment = c
    const [{ data: post }, { data: cat }, { data: past }] = await Promise.all([
      c.post_id ? ctx.db.from('social_posts').select('message, post_type, posted_at').eq('id', c.post_id).maybeSingle() : Promise.resolve({ data: null }),
      c.category ? ctx.db.from('social_comment_categories').select('reply_guidelines').eq('company_id', ctx.companyId).eq('name', c.category).maybeSingle() : Promise.resolve({ data: null }),
      ctx.db.from('social_comments').select('message, reply_text').eq('company_id', ctx.companyId).eq('is_replied', true).not('reply_text', 'is', null).order('commented_at', { ascending: false }).limit(4),
    ])
    const network = c.platform === 'instagram' ? 'Instagram' : 'Facebook'
    return {
      ok: true,
      data: {
        network, author: c.author_name, wrote: c.message || '(no text — a photo or sticker)',
        post: post ? { caption: String(post.message || '').slice(0, 500) || null, type: post.post_type || 'post' } : null,
        sentiment: c.sentiment || null, risk: c.risk_level || null, category: c.category || null,
        guidelines: (cat as any)?.reply_guidelines || null,
        alreadyReplied: !!c.is_replied, existingReply: c.reply_text || null, hidden: !!c.is_hidden,
        isKnownCustomer: !!c.contact_id,
        repliesWeWroteBefore: (past || []).map((p: any) => ({ comment: String(p.message || '').slice(0, 200), reply: String(p.reply_text).slice(0, 300) })),
      },
      entityType: 'comment', entityId: c.id || undefined,
      summary: `${network} comment from ${c.author_name || 'someone'}`,
    }
  },
}

// Anything that looks private: order numbers, phone numbers, emails, street addresses.
const PRIVATE = /(#\s?\d{4,}|\border\s*(no\.?|number|#)?\s*\d{4,}|\+?\d[\d\s-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{1,5}\s+[A-Za-z]+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|court|ct|parade)\b)/i

async function replyOnItsOwn(ctx: ActionContext, args: any, _limits: PolicyLimits): Promise<string | null> {
  const c = ctx.scratch.comment || await theComment(ctx)
  if (!c) return 'There’s no comment to reply to.'
  if (c.is_replied) return 'This comment already has a reply, so a person decides whether to add another.'
  if (c.risk_level === 'critical') return 'Colvy flagged this comment as sensitive, so a person replies.'
  if (c.sentiment !== 'positive') return `${c.sentiment === 'negative' ? 'An unhappy' : 'A neutral or unclear'} comment — only friendly ones get a reply on their own.`
  if (PRIVATE.test(String(args?.text || ''))) return 'The reply mentions something that looks private (an order number, phone, email or address), so a person checks it first.'
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the reply.'
  return null
}

export const replyToCommentAction: ActionDef = {
  key: 'reply_to_comment',
  description: 'Post a public reply to this Facebook or Instagram comment. Plain text, 1–2 short sentences. Never include order numbers, phone numbers, emails or anything private.',
  input: obj({
    text: { type: 'string', description: 'The public reply.' },
    knowledge_gap: { type: 'boolean', description: 'true when the reply doesn’t answer a question they asked because the business’s knowledge doesn’t cover it (you invite them to get in touch instead).' },
  }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: replyOnItsOwn,
  async run(ctx, args) {
    const c = ctx.scratch.comment || await theComment(ctx)
    if (!c?.id) return { ok: false, error: 'This run has no comment to reply to.' }
    const r = await postCommentReply(ctx.db, ctx.companyId, c, String(args?.text || '').slice(0, 2000), { byAi: true })
    return r.ok
      ? { ok: true, data: { posted: true }, entityType: 'comment', entityId: c.id, summary: `Replied to ${c.author_name || 'the'}’s ${c.platform === 'instagram' ? 'Instagram' : 'Facebook'} comment` }
      : { ok: false, error: r.error }
  },
}

/** For approvals: post a reply a person approved (or edited) for the run's comment. */
export async function postApprovedCommentReply(db: any, companyId: string, run: any, text: string): Promise<{ ok: boolean; error?: string }> {
  const { data: c } = await db.from('social_comments').select(COLS).eq('company_id', companyId).eq('id', run?.input?.commentId || '').maybeSingle()
  if (!c) return { ok: false, error: 'This comment no longer exists.' }
  return postCommentReply(db, companyId, c, text, { byAi: true })
}
