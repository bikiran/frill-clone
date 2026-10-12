// Posting a public reply to a Facebook / Instagram comment — the one path,
// shared by the Social Engagement page and the Reputation Agent.

import { getFacebookChannel, replyToComment, replyToIgComment } from '@/lib/social-sync'
import { isIgLoginChannel, replyInstagramComment } from '@/lib/instagram-login'

/** The connected channel that owns this comment (Facebook, page-linked Instagram or Instagram-Login). */
export async function commentChannel(db: any, companyId: string, comment: any) {
  let channel: any = null
  if (comment.meta_channel_id) {
    const { data } = await db.from('meta_channels').select('*').eq('id', comment.meta_channel_id).maybeSingle()
    channel = data
  }
  // Older comments predate the column: fall back to the company's Facebook page.
  if (!channel) channel = await getFacebookChannel(db, companyId)
  return channel?.page_access_token ? channel : null
}

export async function postCommentReply(db: any, companyId: string, comment: any, message: string, opts: { byAi?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const msg = String(message || '').trim()
  if (!msg) return { ok: false, error: 'Nothing to post.' }
  const channel = await commentChannel(db, companyId, comment)
  if (!channel) return { ok: false, error: 'The channel for this comment is no longer connected — reconnect it under Channels.' }
  const token = channel.page_access_token
  try {
    if (comment.platform === 'instagram' && isIgLoginChannel(channel)) {
      const r = await replyInstagramComment(token, comment.external_comment_id, msg)
      if (r.error) return { ok: false, error: r.error }
    } else if (comment.platform === 'instagram') {
      await replyToIgComment(comment.external_comment_id, token, msg)
    } else {
      await replyToComment(comment.external_comment_id, token, msg)
    }
  } catch (e: any) { return { ok: false, error: e?.message || 'Couldn’t post the reply.' } }
  await db.from('social_comments').update({ is_replied: true, replied_by_ai: !!opts.byAi, reply_text: msg }).eq('id', comment.id)
  return { ok: true }
}
