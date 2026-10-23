import { internalHeaders } from '@/lib/internal-call'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { META_VERIFY_TOKEN, META_APP_SECRET, fetchMetaProfile, fetchPageComment, PLACEHOLDER_META_NAMES } from '@/lib/meta'
import { isIgLoginChannel, fetchInstagramUserProfile, fetchInstagramComment, INSTAGRAM_APP_SECRET } from '@/lib/instagram-login'
import { linkContactIdentity } from '@/lib/identity'
import { rehostRemoteMedia } from '@/lib/media-rehost'
import { scheduleMessageThumbs } from '@/lib/image-thumb'
import { detectContactInfo, emailKey, phoneKey } from '@/lib/phone'
import { logWebhookEvent } from '@/lib/webhook-log'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { logEnquiryReopened } from '@/lib/conversation-timeline'
import { classifyOne } from '@/lib/social-sync'
import { emitInboundEvent } from '@/lib/integration-hooks'

// Room for the Support Agent to answer after the response (after()).
export const maxDuration = 300

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
            story_type: null as string | null,
          }
          // The story's media URL is a short-lived Instagram CDN link that 403s
          // within hours, so it renders as a broken thumbnail by the time an
          // agent opens the thread. Rehost a durable copy now, while it's fresh,
          // and record whether it's an image or a video so the inbox can show it
          // full-size and play it (like Coax does).
          if (storyReply.story_url) {
            const rehosted = await rehostRemoteMedia(db, storyReply.story_url, 'ig-story')
            if (rehosted) { storyReply.story_url = rehosted.url; storyReply.story_type = rehosted.kind }
          }
        }

        // Nothing usable? (e.g. a delivery receipt, a reaction with no content)
        if (!text && attachments.length === 0 && !storyReply) continue

        // Already have this message? Meta delivers at least once and retries, and
        // an account connected two ways can get each message twice, sometimes at
        // the same moment. Checked first so a repeat changes nothing; the unique
        // index on meta_message_id (V413) catches two copies racing each other.
        const mid: string | null = event.message?.mid || null
        if (mid) {
          const { data: seen } = await db.from('messages').select('id').eq('meta_message_id', mid).limit(1).maybeSingle()
          if (seen) continue
        }

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
        const lookUp = () => isIgLoginChannel(channel)
          ? fetchInstagramUserProfile(senderId, channel.page_access_token)
          : fetchMetaProfile(senderId, channel.page_access_token, platform, channel.page_id)
        if (!contact) {
          const prof: any = await lookUp()
          const { data: created, error: createErr } = await db.from('contacts').insert({
            company_id: companyId,
            name: prof.name || (platform === 'instagram' ? 'Instagram user' : 'Messenger user'),
            avatar_url: prof.avatar || null,
            meta_user_id: senderId,
            source: platform,
          }).select().maybeSingle()
          if (createErr) console.warn('[meta] contact not created', createErr.message)
          contact = created
        } else if (!contact.name || PLACEHOLDER_META_NAMES.has(contact.name) || !contact.avatar_url) {
          // No real name (Meta refused it last time) or no photo yet: ask again,
          // and only fill what's missing; a name someone typed in is kept.
          const prof: any = await lookUp()
          const patch: Record<string, any> = {}
          if (prof.name && (!contact.name || PLACEHOLDER_META_NAMES.has(contact.name))) patch.name = prof.name
          if (prof.avatar && !contact.avatar_url) patch.avatar_url = prof.avatar
          if (Object.keys(patch).length) {
            await db.from('contacts').update(patch).eq('id', contact.id)
            Object.assign(contact, patch)
            if (patch.name) await db.from('conversations').update({ subject: `${platform === 'instagram' ? 'Instagram' : 'Messenger'} — ${patch.name}` }).eq('company_id', companyId).eq('meta_user_id', senderId).then(() => {}, () => {})
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
        // Match on meta_user_id, NOT on channel. Pinning the lookup to
        // .eq('channel', platform) meant that once an SMS had flipped the row's
        // channel, this webhook stopped recognising its own conversation and
        // opened a duplicate beside it. meta_user_id already identifies the
        // thread precisely, and it is per-platform.
        const { data: recent } = await db.from('conversations').select('*')
          .eq('company_id', companyId).eq('meta_user_id', senderId)
          .order('last_message_at', { ascending: false }).limit(1)
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
          conv = newConv ? { ...newConv, __created: true } : null
        }
        // An existing conversation is marked unread / reopened only once its
        // message is actually saved (a duplicate must not bump the count).
        const touchConversation = conv && !conv.__created ? async () => {
          // Customer DM'd a closed enquiry — log the reopen before we flip it.
          await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status, actorName: contact?.name || null, via: platform === 'instagram' ? 'Instagram message' : 'Messenger message' })
          await db.from('conversations').update({
            status: 'open', is_unread: true,
            unread_count: (conv.unread_count || 0) + 1,
            meta_channel_id: channel.id,
            // Inbound DM ⇒ this is a Messenger/Instagram conversation now,
            // whatever it started as. The SMS webhook has always claimed the
            // conversation this way ("this is an SMS conversation now"), and
            // Meta never did — so a single text permanently relabelled a thread
            // that has been on Instagram ever since, and the inbox list kept
            // showing an SMS badge on it. Symmetry: whoever the customer last
            // used owns the label.
            channel: platform,
            last_message: preview.slice(0, 200), last_message_at: new Date().toISOString(), last_customer_activity_at: new Date().toISOString(),
          }).eq('id', conv.id)
        } : null
        if (!conv) continue

        const { data: insertedMsg, error: insertErr } = await db.from('messages').insert({
          conversation_id: conv.id, company_id: companyId,
          sender_type: 'visitor',
          sender_name: contact?.name || null,
          content: text,
          delivery_channel: platform,
          meta_message_id: mid,
          attachments: attachments.length ? attachments : [],
          metadata: storyReply ? { story_reply: storyReply } : {},
        }).select('id').maybeSingle()
        // The other copy won the race (unique meta_message_id): nothing more to do.
        if (insertErr && (insertErr.code === '23505' || /duplicate key/i.test(insertErr.message || ''))) continue
        if (touchConversation) await touchConversation()
        // Small copies of any photos for the inbox tiles (after the response;
        // the payload is signed, and Meta's links expire, so do it now).
        scheduleMessageThumbs(db, insertedMsg?.id, attachments, { trusted: true })
        await emitInboundEvent(db, { companyId, conversationId: conv.id, text, channel: platform, name: contact?.name || null, messageId: insertedMsg?.id || null })

        // The Support / Reception Agent, if the business switched it on for this
        // channel (lib/agent/inbound.ts decides; a burst of messages is one run).
        if (text) {
          const convId = conv.id
          after(async () => {
            try { const { startSupportAgentForConversation } = await import('@/lib/agent/inbound'); await startSupportAgentForConversation(db, convId) } catch (e) { console.warn('[agent] meta inbound', e) }
          })
        }

        // Detect language + translate to English (fire-and-forget) for the inbox
        // "Translated · English / View original" toggle.
        if (text && insertedMsg?.id) {
          const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
          fetch(`${base}/api/inbox/translate-message`, { method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ messageId: insertedMsg.id }) }).catch(() => {})
        }

        // Customer-matching: if they shared an email/phone (e.g. in reply to a
        // "Request customer details" ask), capture it so the match engine can
        // find their orders. Only FILL an empty field — never overwrite verified
        // data silently; record it as a suggested identity + an audit either way,
        // and (re)link the identity group so orders resolve across channels.
        if (text && contact?.id) {
          try {
            const info = detectContactInfo(text)
            if (info.email || info.phone) {
              const patch: any = {}
              if (info.email && !contact.email) patch.email = info.email.raw
              if (info.phone && !contact.phone) patch.phone = info.phone.raw
              if (Object.keys(patch).length) {
                await db.from('contacts').update(patch).eq('id', contact.id)
                await db.from('customer_identity_audit').insert({
                  company_id: companyId, contact_id: contact.id, action: 'field_changed',
                  detail: `Captured ${Object.keys(patch).join(' & ')} from the ${platform} conversation`,
                  before: { email: contact.email || null, phone: contact.phone || null }, after: patch,
                  evidence: { source: `${platform} conversation`, conversationId: conv.id },
                }).then(() => {}, () => {})
                Object.assign(contact, patch)
              }
              const idRows: any[] = []
              if (info.email) idRows.push({ company_id: companyId, contact_id: contact.id, kind: 'email', value: emailKey(info.email.raw), display: info.email.raw, status: 'suggested', source: `${platform} conversation` })
              if (info.phone) idRows.push({ company_id: companyId, contact_id: contact.id, kind: 'phone', value: phoneKey(info.phone.raw), display: info.phone.raw, status: 'suggested', source: `${platform} conversation` })
              if (idRows.length) await db.from('customer_identities').insert(idRows).then(() => {}, () => {})
              await linkContactIdentity(db, companyId, contact.id, { email: contact.email, phone: contact.phone, channel: platform }).catch(() => {})
            }
          } catch {}
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
        let fromName = v.from?.username || v.from?.name || null
        let fromPhoto: string | null = v.from?.picture?.data?.url || null
        let text: string = v.text || v.message || ''
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

        // The webhook payload usually omits the commenter's name (and never
        // carries their photo), so a live comment would show as "Facebook user"
        // until the next manual sync. Hydrate the author (name + photo) and text
        // from the Graph API with the channel's own token, like DMs do.
        if (!fromName || !fromPhoto || !text) {
          const hydrated = isIgLoginChannel(channel)
            ? await fetchInstagramComment(commentId, channel.page_access_token)
            : await fetchPageComment(commentId, channel.page_access_token)
          if (hydrated) {
            fromName = fromName || hydrated.name || null
            fromPhoto = fromPhoto || (hydrated as any).photo || null
            text = text || hydrated.message || ''
          }
        }

        // Link the comment to a CRM contact when the commenter is someone we
        // already know — their platform user id (author_id) is the same id DMs
        // are keyed on (contacts.meta_user_id). This lets a customer's public
        // comment surface in the inbox (pill / timeline / thread) like their DMs.
        let commentContactId: string | null = null
        if (fromId) {
          try {
            const { data: cc } = await db.from('contacts').select('id').eq('company_id', companyId).eq('meta_user_id', fromId).limit(1)
            commentContactId = cc?.[0]?.id || null
          } catch { /* contact_id column may not exist yet (pre-V313) — ignore */ }
        }

        const baseRow: any = {
          company_id: companyId, post_id: postDbId, meta_channel_id: channel.id, platform,
          external_comment_id: commentId, external_post_id: mediaId,
          author_name: fromName || (platform === 'instagram' ? 'Instagram user' : 'Facebook user'),
          author_id: fromId, author_photo: fromPhoto, message: text || null,
          commented_at: commentedAt, raw: change,
        }
        let { data: ins, error: insErr } = await db.from('social_comments')
          .insert({ ...baseRow, ...(commentContactId ? { contact_id: commentContactId } : {}) })
          .select('id').maybeSingle()
        // If contact_id isn't a column yet (migration V313 not run), retry without
        // it so the comment is never dropped.
        if (insErr && commentContactId && /contact_id|column|schema cache/i.test(insErr.message || '')) {
          ;({ data: ins } = await db.from('social_comments').insert(baseRow).select('id').maybeSingle())
        }

        // Classify (risk / category / sentiment) so the Engagement filters work.
        if (ins?.id && text.trim()) {
          try { await classifyOne(db, companyId, ins.id, text) } catch {}
        }
        // The Reputation Agent drafts a reply, if it's on for comments (queued
        // for the agent worker; it reads the classification just saved).
        if (ins?.id && text.trim()) {
          try { const { queueCommentReplies } = await import('@/lib/agent/reputation'); await queueCommentReplies(db, companyId, [ins.id]) } catch (e) { console.warn('[agent] comment', e) }
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
