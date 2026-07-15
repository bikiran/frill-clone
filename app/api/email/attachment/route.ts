import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailToken } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Streams a Gmail attachment back to the agent's browser. Gmail attachments
// aren't public URLs — they're fetched through the API with the mailbox's
// token — so we proxy them here rather than exposing anything.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const messageId = url.searchParams.get('messageId')
    const attachmentId = url.searchParams.get('attachmentId')
    const name = url.searchParams.get('name') || 'attachment'
    const conversationId = url.searchParams.get('conversationId')
    if (!messageId || !attachmentId || !conversationId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const db = admin()

    // Resolve the mailbox from the conversation, so we use the right token.
    const { data: conv } = await db.from('conversations')
      .select('email_channel_id, company_id').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    let channel: any = null
    if (conv.email_channel_id) {
      const { data } = await db.from('email_channels').select('*').eq('id', conv.email_channel_id).maybeSingle()
      channel = data
    }
    if (!channel) {
      const { data: channels } = await db.from('email_channels').select('*')
        .eq('company_id', conv.company_id).eq('is_active', true).limit(1)
      channel = channels?.[0]
    }
    if (!channel) return NextResponse.json({ error: 'No mailbox for this conversation' }, { status: 400 })

    const token = await getGmailToken(channel)
    if (!token) return NextResponse.json({ error: 'Google connection expired' }, { status: 401 })

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return NextResponse.json({ error: 'Could not fetch attachment' }, { status: 502 })
    const data = await res.json()

    // Gmail returns URL-safe base64.
    const b64 = String(data.data || '').replace(/-/g, '+').replace(/_/g, '/')
    const buf = Buffer.from(b64, 'base64')

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
