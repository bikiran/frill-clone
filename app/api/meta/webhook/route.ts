import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { META_VERIFY_TOKEN, META_APP_SECRET, fetchMetaProfile } from '@/lib/meta'
import { linkContactIdentity } from '@/lib/identity'

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
function validSignature(raw: string, sig: string | null): boolean {
  if (!sig || !META_APP_SECRET) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}

// ── POST: inbound messages ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const db = admin()

  // `object` tells us the platform: 'page' = Messenger, 'instagram' = IG DM.
  const platform: 'facebook' | 'instagram' = body.object === 'instagram' ? 'instagram' : 'facebook'

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
          const prof = await fetchMetaProfile(senderId, channel.page_access_token, platform)
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
          const prof = await fetchMetaProfile(senderId, channel.page_access_token, platform)
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
          await db.from('conversations').update({
            status: 'open', is_unread: true,
            unread_count: (conv.unread_count || 0) + 1,
            meta_channel_id: channel.id,
            last_message: preview.slice(0, 200), last_message_at: new Date().toISOString(), last_customer_activity_at: new Date().toISOString(),
          }).eq('id', conv.id)
        }
        if (!conv) continue

        await db.from('messages').insert({
          conversation_id: conv.id, company_id: companyId,
          sender_type: 'visitor',
          sender_name: contact?.name || null,
          content: text,
          delivery_channel: platform,
          meta_message_id: event.message?.mid || null,
          attachments: attachments.length ? attachments : [],
          metadata: storyReply ? { story_reply: storyReply } : {},
        })
      } catch (e) {
        console.error('[meta webhook] event failed', e)
      }
    }
  }

  // Meta requires a fast 200 or it retries and eventually disables the webhook.
  return NextResponse.json({ ok: true })
}
