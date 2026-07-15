import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMetaMessage, sendMetaAttachment } from '@/lib/meta'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Sends an agent's reply out over Messenger / Instagram DM.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, content, agentName, attachmentUrl, attachmentKind, skipChatMessage } = await req.json()
    if (!conversationId || (!content && !attachmentUrl)) {
      return NextResponse.json({ error: 'conversationId and content (or attachment) are required' }, { status: 400 })
    }

    const db = admin()
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (!['instagram', 'facebook'].includes(conv.channel)) {
      return NextResponse.json({ error: 'Not a Meta conversation' }, { status: 400 })
    }

    const recipientId = conv.meta_user_id
    if (!recipientId) return NextResponse.json({ error: 'No recipient id on this conversation' }, { status: 400 })

    const { data: channel } = await db.from('meta_channels').select('*').eq('id', conv.meta_channel_id).maybeSingle()
    if (!channel) return NextResponse.json({ error: 'This conversation\'s Meta channel is no longer connected.' }, { status: 400 })

    // Meta's 24-hour rule: outside 24h since the customer's last message, a
    // standard message is REJECTED (you'd need an approved message tag). Check
    // and give a clear reason rather than a raw Graph API error.
    const { data: lastInbound } = await db.from('messages')
      .select('created_at').eq('conversation_id', conversationId).eq('sender_type', 'visitor')
      .order('created_at', { ascending: false }).limit(1)
    const lastAt = lastInbound?.[0]?.created_at ? new Date(lastInbound[0].created_at).getTime() : 0
    if (lastAt && (Date.now() - lastAt) > 24 * 3600 * 1000) {
      return NextResponse.json({
        error: 'Meta only allows a free-form reply within 24 hours of the customer\'s last message. This conversation is outside that window.',
      }, { status: 400 })
    }

    const out = attachmentUrl
      ? await sendMetaAttachment(channel.page_id, channel.page_access_token, recipientId, attachmentUrl, attachmentKind || 'file')
      : await sendMetaMessage(channel.page_id, channel.page_access_token, recipientId, content)
    if (out.error) {
      await db.from('meta_channels').update({ last_error: out.error }).eq('id', channel.id)
      return NextResponse.json({ error: out.error }, { status: 502 })
    }

    // The inbox inserts its own richer message for attachments; skip the plain
    // one here to avoid a duplicate.
    if (!skipChatMessage) {
      await db.from('messages').insert({
        conversation_id: conversationId, company_id: conv.company_id,
        sender_type: 'agent',
        sender_name: agentName || 'Agent',
        content,
        delivery_channel: conv.channel,
        meta_message_id: out.id || null,
      })
    }
    await db.from('conversations').update({
      last_message: (content || 'Attachment').slice(0, 200), last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, id: out.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
