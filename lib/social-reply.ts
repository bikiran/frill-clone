// Posting a public reply to a Facebook / Instagram comment — the one path,
// shared by the Social Engagement page and the Reputation Agent.

import { getFacebookChannel, replyToComment, replyToIgComment } from '@/lib/social-sync'
import { isIgLoginChannel, replyInstagramComment } from '@/lib/instagram-login'

// Meta's "(#100) Missing Permission" / "(#10) … permission" for an action the
// token wasn't granted.
export const isMissingPermission = (msg: unknown) => /missing permission|\(#(10|100|200)\)[^.]*permission|does not have permission|requires? .*permission/i.test(String(msg || ''))

export const IG_COMMENTS_PERMISSION = 'Instagram didn’t allow this: Colvy’s Facebook connection doesn’t have the “instagram_manage_comments” permission yet. Reconnect Facebook & Instagram under Settings → Channels and allow comment access, or connect Instagram directly there. Until Meta approves the permission in App Review, it only works for people with a role on Colvy’s Meta app.'

/** An Instagram-Login connection for the same Instagram account, if the business made one. */
export async function igLoginTwin(db: any, companyId: string, channel: any) {
  const { data } = await db.from('meta_channels').select('*').eq('company_id', companyId).eq('platform', 'instagram').eq('is_active', true).like('page_id', 'iglogin:%')
  const rows = (data || []).filter((c: any) => c.page_access_token)
  const same = rows.find((c: any) => channel?.ig_username && c.ig_username && c.ig_username.toLowerCase() === String(channel.ig_username).toLowerCase())
  return same || (rows.length === 1 ? rows[0] : null)
}

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
      try {
        await replyToIgComment(comment.external_comment_id, token, msg)
      } catch (e: any) {
        if (!isMissingPermission(e?.message)) throw e
        // The Facebook connection lacks instagram_manage_comments. If the same
        // account is also connected with Instagram Login (which includes comment
        // access), reply through that instead.
        const ig = await igLoginTwin(db, companyId, channel)
        if (!ig) return { ok: false, error: IG_COMMENTS_PERMISSION }
        const r = await replyInstagramComment(ig.page_access_token, comment.external_comment_id, msg)
        if (r.error) return { ok: false, error: isMissingPermission(r.error) ? IG_COMMENTS_PERMISSION : r.error }
      }
    } else {
      await replyToComment(comment.external_comment_id, token, msg)
    }
  } catch (e: any) { return { ok: false, error: e?.message || 'Couldn’t post the reply.' } }
  await db.from('social_comments').update({ is_replied: true, replied_by_ai: !!opts.byAi, reply_text: msg }).eq('id', comment.id)
  return { ok: true }
}
