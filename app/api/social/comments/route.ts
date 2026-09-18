import { NextRequest, NextResponse } from 'next/server'
import { admin, getFacebookChannel, replyToComment, setCommentHidden, privateReply, replyToIgComment, setIgCommentHidden } from '@/lib/social-sync'
import { isIgLoginChannel, replyInstagramComment, hideInstagramComment, sendInstagramCommentPrivateReply } from '@/lib/instagram-login'

export const dynamic = 'force-dynamic'

// POST { companyId, action, commentId, ... }
// actions: reply | ai_reply | hide | unhide | archive | unarchive | dm
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action, commentId } = body
    if (!companyId || !action || !commentId) return NextResponse.json({ error: 'companyId, action and commentId required' }, { status: 400 })
    const db = admin()

    const { data: comment } = await db.from('social_comments').select('*').eq('id', commentId).eq('company_id', companyId).maybeSingle()
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    // Archive doesn't touch Facebook/Instagram — it's a local "dealt with" state.
    if (action === 'archive' || action === 'unarchive') {
      await db.from('social_comments').update({ is_archived: action === 'archive' }).eq('id', commentId)
      return NextResponse.json({ ok: true })
    }

    // Everything else needs the channel that owns this comment. Resolve it by the
    // comment's own meta_channel_id (a comment may be Facebook, page-linked
    // Instagram, or Instagram-Login), falling back to the company's Facebook page
    // for older comments that predate the column.
    let channel: any = null
    if (comment.meta_channel_id) {
      const { data } = await db.from('meta_channels').select('*').eq('id', comment.meta_channel_id).maybeSingle()
      channel = data
    }
    if (!channel) channel = await getFacebookChannel(db, companyId)
    if (!channel?.page_access_token) return NextResponse.json({ error: 'The channel for this comment is no longer connected — reconnect it under Channels.' }, { status: 400 })
    const token = channel.page_access_token

    // Which flavour of comment are we acting on?
    const isIg = comment.platform === 'instagram'
    const igLogin = isIgLoginChannel(channel)

    if (action === 'ai_reply') {
      // Draft a reply with the category's guidelines — the agent edits before posting.
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) return NextResponse.json({ error: 'AI is not configured (ANTHROPIC_API_KEY missing).' }, { status: 500 })
      const { data: company } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
      let guidelines = ''
      if (comment.category) {
        const { data: cat } = await db.from('social_comment_categories').select('reply_guidelines').eq('company_id', companyId).eq('name', comment.category).maybeSingle()
        guidelines = cat?.reply_guidelines || ''
      }
      const network = isIg ? 'Instagram' : 'Facebook'
      const prompt = `You are replying, as ${company?.name || 'the business'}, to a comment on our ${network} post.

Commenter: ${comment.author_name || 'A customer'}
Category: ${comment.category || 'general'}
Comment: "${comment.message || ''}"
${guidelines ? `\nFollow these guidelines for this category:\n${guidelines}` : ''}

Write a short, warm, human reply (1-2 sentences). Don't invent facts or offers. Reply with ONLY the reply text.`
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'AI request failed' }, { status: 502 })
      const text = (data.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim()
      return NextResponse.json({ ok: true, reply: text })
    }

    if (action === 'reply') {
      const { message, byAi } = body
      if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })
      const msg = message.trim()
      if (isIg && igLogin) {
        const r = await replyInstagramComment(token, comment.external_comment_id, msg)
        if (r.error) throw new Error(r.error)
      } else if (isIg) {
        await replyToIgComment(comment.external_comment_id, token, msg)
      } else {
        await replyToComment(comment.external_comment_id, token, msg)
      }
      await db.from('social_comments').update({ is_replied: true, replied_by_ai: !!byAi, reply_text: msg }).eq('id', commentId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'hide' || action === 'unhide') {
      const hidden = action === 'hide'
      if (isIg && igLogin) {
        const r = await hideInstagramComment(token, comment.external_comment_id, hidden)
        if (r.error) throw new Error(r.error)
      } else if (isIg) {
        await setIgCommentHidden(comment.external_comment_id, token, hidden)
      } else {
        await setCommentHidden(comment.external_comment_id, token, hidden)
      }
      await db.from('social_comments').update({ is_hidden: hidden }).eq('id', commentId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'dm') {
      const { message } = body
      if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })
      const msg = message.trim()
      if (isIg && igLogin) {
        const r = await sendInstagramCommentPrivateReply(token, comment.external_comment_id, msg)
        if (r.error) throw new Error(r.error)
      } else {
        // Facebook and page-linked Instagram both use the Graph private-reply edge.
        await privateReply(comment.external_comment_id, token, msg)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
