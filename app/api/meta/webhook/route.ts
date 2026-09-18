import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { META_VERIFY_TOKEN, META_APP_SECRET, fetchMetaProfile } from '@/lib/meta'
import { isIgLoginChannel, fetchInstagramUserProfile, INSTAGRAM_APP_SECRET } from '@/lib/instagram-login'
import { linkContactIdentity } from '@/lib/identity'
import { logWebhookEvent } from '@/lib/webhook-log'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { logEnquiryReopened } from '@/lib/conversation-timeline'
import { classifyOne } from '@/lib/social-sync'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── GET: Meta's webhook verification handshake ──────────────────────────────
// When you register the webhook in the Meta dashboard, Meta calls this with a
// challenge; echo it back if the verify token matches.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return NextResponse.json({ error: 'verification failed' }, { status: 403 })
}

// Verify the payload really came from Meta (signed with the app secret).
// Instagram-Login (`object: 'instagram'`) events are signed with the INSTAGRAM
// app secret, while Facebook/Page events use the Meta app secret — accept
// either, since this one endpoint serves both products.
function validSignature(raw: string, sig: string | null): boolean {
  if (!sig) return false
  for (const secret of [META_APP_SECRET, INSTAGRAM_APP_SECRET]) {
    if (!secret) continue
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    try { if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true } catch {}
  }
  return false
}

// ── POST: inbound messages ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    await logWebhookEvent({ source: 'meta', status: 'rejected', error: 'bad signature' })
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const db = admin()

  // `object` tells us the platform: 'page' = Messenger, 'instagram' = IG DM.
  const platform: 'facebook' | 'instagram' = body.object === 'instagram' ? 'instagram' : 'facebook'

  // Record the event for the Super Admin webhook explorer (best-effort).
  logWebhookEvent({ source: 'meta', eventType: body.object || platform, payload: body })

  for (const entry of body.entry || []) {
    // The recipient of the webhook is the Page (Messenger) or IG account (IG).
    const recipientId = String(entry.id)

    for (const event of entry.messaging || []) {
      try {
        const senderId = event.sender?.id
        const isEcho = event.message?.is_echo   // our own outgoing message echoed back
        if (!senderId || isEcho) continue

        const text: string = event.message?.text || ''

        // Attachments: photos, videos, audio, files, and shares. Meta gives us
        // a URL for each. (The old code read only .text, so every media message
        // — and every story reply — was silently dropped.)
        const rawAtts = event.message?.attachments || []
        const attachments = rawAtts
          .map((a: any) => {
            const url = a?.payload?.url
            if (!url) return null
            const type = a.type === 'image' ? 'image'
              : a.type === 'video' ? 'video'
              : a.type === 'audio' ? 'audio'
              : 'file'
            return { url, kind: type, type, name: type }
          })
          .filter(Boolean)

        // Instagram story reply / mention: the customer replied to one of the
        // business's stories. Coax shows the story thumbnail alongside their
        // message — capture the story media so we can too.
        let storyReply: any = null
        const replyTo = event.message?.reply_to
        if (replyTo?.story) {
          storyReply = {
            kind: 'story_reply',
            story_url: replyTo.story.url || null,
            story_id: replyTo.story.id || null,
          }
        }

        // Nothing usable? (e.g. a delivery receipt, a reaction with no content)
        if (!text && attachments.length === 0 && !storyReply) continue

        // Preview text for the conversation list.
        const preview = text
          || (storyReply ? 'Replied to your story' : null)
          || (attachments[0]?.kind === 'image' ? 'Sent a photo'
            : attachments[0]?.kind === 'video' ? 'Sent a video'
            : attachments[0]?.kind === 'audio' ? 'Sent a voice message'
            : attachments.length ? 'Sent a file' : 'New message')

        // Which connected channel owns this? Messenger keys on page_id; IG on
        // ig_account_id. This is what routes the DM to the right OUTLET.
        let channel: any = null
        if (platform === 'instagram') {
          const { data } = await db.from('meta_channels').select('*')
            .eq('platform', 'instagram').eq('ig_account_id', recipientId).eq('is_active', true).maybeSingle()
          channel = data
        } else {
          const { data } = await db.from('meta_channels').select('*')
            .eq('platform', 'facebook').eq('page_id', recipientId).eq('is_active', true).maybeSingle()
          channel = data
        }
        if (!channel) continue   // a Page/IG we don't manage

        const companyId = channel.company_id

        // Find-or-create the contact by their Meta user id.
        let contact: any = null
        const { data: existing } = await db.from('contacts').select('*')
          .eq('company_id', companyId).eq('meta_user_id', senderId).maybeSingle()
        contact = existing
        if (!contact) {
          const prof = isIgLoginChannel(channel)
            ? await fetchInstagramUserProfile(senderId, channel.page_access_token)
            : await fetchMetaProfile(senderId, channel.page_access_token, platform)
          const { data: created } = await db.from('contacts').insert({
            company_id: companyId,
            name: prof.name || (platform === 'instagram' ? 'Instagram user' : 'Messenger user'),
            avatar_url: prof.avatar || null,
            meta_user_id: senderId,
            source: platform,
          }).select().maybeSingle()
          contact = created
        } else if (!contact.avatar_url) {
          // Backfill the photo for an existing contact that doesn't have one.
          const prof = isIgLoginChannel(channel)
            ? await fetchInstagramUserProfile(senderId, channel.page_access_token)
            : await fetchMetaProfile(senderId, channel.page_access_token, platform)
          if (prof.avatar) {
            await db.from('contacts').update({ avatar_url: prof.avatar }).eq('id', contact.id)
            contact.avatar_url = prof.avatar
          }
        }

        // Link this contact to any existing profile (same email/phone) and note
        // the channel, so their profile shows every channel they've used.
        if (contact?.id) {
          await linkContactIdentity(db, companyId, contact.id, {
            email: contact.email, phone: contact.phone, channel: platform,
          })
        }

        // Thread into an existing open conversation on this channel, else open one.
        let conv: any = null
        const { data: recent } = await db.from('conversations').select('*')
          .eq('company_id', companyId).eq('meta_user_id', senderId)
          .eq('channel', platform).order('last_message_at', { ascending: false }).limit(1)
        conv = recent?.[0] || null

        if (!conv) {
          const { data: newConv } = await db.from('conversations').insert({
            company_id: companyId, channel: platform,
            subject: `${platform === 'instagram' ? 'Instagram' : 'Messenger'} — ${contact?.name || 'DM'}`,
            contact_id: contact?.id || null,
            meta_channel_id: channel.id,
            meta_user_id: senderId,
            // Route to the outlet this connection is mapped to.
            assigned_location_id: channel.location_id || null,
            status: 'open', is_unread: true, unread_count: 1,
            last_message: preview.slice(0, 200), last_message_at: new Date().toISOString(), last_customer_activity_at: new Date().toISOString(),
          }).select().maybeSingle()
          conv = newConv
        } else {
          // Customer DM'd a closed enquiry — log the reopen before we flip it.
          await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: contact?.name || null, via: platform === 'instagram' ? 'Instagram message' : 'Messenger message' })
          await db.from('conversations').update({
            status: 'open', is_unread: true,
            unread_count: (conv.unread_count || 0) + 1,
            meta_channel_id: channel.id,
            last_message: preview.slice(0, 200), last_message_at: new Date().toISOString(), last_customer_activity_at: new Date().toISOString(),
          }).eq('id', conv.id)
        }
        if (!conv) continue

        // Idempotency: Meta redelivers webhook events (retries + at-least-once
        // delivery), which would insert the same message twice and fire a second
        // push. Skip if we've already ingested this message id.
        if (event.message?.mid) {
          const { data: dupe } = await db.from('messages').select('id')
            .eq('conversation_id', conv.id).eq('meta_message_id', event.message.mid).limit(1).maybeSingle()
          if (dupe) continue
        }

        const { data: insertedMsg } = await db.from('messages').insert({
          conversation_id: conv.id, company_id: companyId,
          sender_type: 'visitor',
          sender_name: contact?.name || null,
          content: text,
          delivery_channel: platform,
          meta_message_id: event.message?.mid || null,
          attachments: attachments.length ? attachments : [],
          metadata: storyReply ? { story_reply: storyReply } : {},
        }).select('id').maybeSingle()

        // Detect language + translate to English (fire-and-forget) for the inbox
        // "Translated · English / View original" toggle.
        if (text && insertedMsg?.id) {
          const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
          fetch(`${base}/api/inbox/translate-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: insertedMsg.id }) }).catch(() => {})
        }

        // Alert the team: in-app bell + a phone push carrying conversationId, so
        // the notification gets the Reply / Mark-read quick actions.
        const who = contact?.name || (platform === 'instagram' ? 'an Instagram user' : 'a Facebook user')
        const channelName = platform === 'instagram' ? 'Instagram' : 'Facebook'
        try {
          await notifyCompany({
            db, companyId, type: platform,
            message: `New ${channelName} message from ${who}: ${String(preview).slice(0, 80)}`,
            actorName: who, conversationId: conv.id,
          })
        } catch {}
        try {
          await pushInboundMessage({
            companyId, conversationId: conv.id,
            title: `New ${channelName} message from ${who}`,
            body: String(preview),
          })
        } catch {}
      } catch (e) {
        console.error('[meta webhook] event failed', e)
      }
    }

    // ── Comments (Social Engagement) ──────────────────────────────────────────
    // Real-time comment threads arrive as `changes`, not `messaging`: Instagram
    // (`object: 'instagram'`) sends field `comments`; a Facebook Page
    // (`object: 'page'`) sends field `feed` with `item: 'comment'`. Both land in
    // social_comments so the Engagement inbox shows and can reply to them live,
    // instead of only when someone runs a manual sync.
    for (const change of entry.changes || []) {
      try {
        const field = change.field
        if (field !== 'comments' && field !== 'feed') continue
        const v = change.value || {}
        // Facebook's `feed` carries every page-object change; keep added comments.
        if (field === 'feed') {
          if (v.item !== 'comment') continue
          if (v.verb && v.verb !== 'add') continue
        }

        // Which connected channel owns this? IG keys on ig_account_id, a Page on page_id.
        let channel: any = null
        if (platform === 'instagram') {
          const { data } = await db.from('meta_channels').select('*')
            .eq('platform', 'instagram').eq('ig_account_id', recipientId).eq('is_active', true).maybeSingle()
          channel = data
        } else {
          const { data } = await db.from('meta_channels').select('*')
            .eq('platform', 'facebook').eq('page_id', recipientId).eq('is_active', true).maybeSingle()
          channel = data
        }
        if (!channel) continue

        const companyId = channel.company_id
        const commentId = field === 'comments' ? v.id : (v.comment_id || v.id)
        if (!commentId) continue
        const fromId = v.from?.id ? String(v.from.id) : null
        const fromName = v.from?.username || v.from?.name || null
        const text: string = v.text || v.message || ''
        const mediaId = field === 'comments' ? (v.media?.id || null) : (v.post_id || null)

        // Skip the business's own comments/replies (they echo back as webhooks).
        if (fromId && (fromId === recipientId || fromId === String(channel.ig_account_id || '') || fromId === String(channel.page_id || ''))) continue

        // Idempotency: Meta redelivers events; don't double-insert the same comment.
        const { data: dupe } = await db.from('social_comments').select('id')
          .eq('company_id', companyId).eq('external_comment_id', commentId).maybeSingle()
        if (dupe) continue

        // Link to the post/media if we already have it locally.
        let postDbId: string | null = null
        if (mediaId) {
          const { data: post } = await db.from('social_posts').select('id')
            .eq('company_id', companyId).eq('external_post_id', mediaId).maybeSingle()
          postDbId = post?.id || null
        }

        const commentedAt = v.created_time
          ? new Date(typeof v.created_time === 'number' ? v.created_time * 1000 : v.created_time).toISOString()
          : new Date().toISOString()

        const { data: ins } = await db.from('social_comments').insert({
          company_id: companyId, post_id: postDbId, meta_channel_id: channel.id, platform,
          external_comment_id: commentId, external_post_id: mediaId,
          author_name: fromName || (platform === 'instagram' ? 'Instagram user' : 'Facebook user'),
          author_id: fromId, message: text || null,
          commented_at: commentedAt, raw: change,
        }).select('id').maybeSingle()

        // Classify (risk / category / sentiment) so the Engagement filters work.
        if (ins?.id && text.trim()) {
          try { await classifyOne(db, companyId, ins.id, text) } catch {}
        }

        // Alert the team (in-app bell). No conversationId — comments live in the
        // Social Engagement manager, not the DM inbox.
        try {
          const who = fromName || 'someone'
          const channelName = platform === 'instagram' ? 'Instagram' : 'Facebook'
          await notifyCompany({
            db, companyId, type: platform,
            message: `New ${channelName} comment from ${who}: ${String(text).slice(0, 80)}`,
            actorName: who,
          })
        } catch {}
      } catch (e) {
        console.error('[meta webhook] comment failed', e)
      }
    }
  }

  // Meta requires a fast 200 or it retries and eventually disables the webhook.
  return NextResponse.json({ ok: true })
}
