import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/contacts/timeline?contactId=…
//
// Every message this person has exchanged, across EVERY channel — live chat,
// SMS, email, Messenger, Instagram — merged into one time-ordered stream. The
// person may be several linked contacts (identity_group_id); we gather all
// their conversations and interleave the messages, tagging each with its
// channel and which conversation it belongs to.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db = admin()

  // All contacts that are the same person (falls back to just this one).
  const linked = await linkedContacts(db, contactId)
  const contactIds = linked.length ? linked.map((c: any) => c.id) : [contactId]

  // Their conversations.
  const { data: convs } = await db.from('conversations')
    .select('id, channel, subject').in('contact_id', contactIds)
  const convById: Record<string, any> = {}
  for (const c of convs || []) convById[c.id] = c
  const convIds = Object.keys(convById)
  if (convIds.length === 0) return NextResponse.json({ messages: [], conversations: [] })

  // Messages across all of them, oldest first.
  const { data: msgs } = await db.from('messages')
    .select('id, conversation_id, sender_type, sender_name, content, delivery_channel, created_at, attachments')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })
    .limit(500)

  const messages = (msgs || []).map((m: any) => {
    const conv = convById[m.conversation_id] || {}
    return {
      ...m,
      // Prefer the message's own delivery_channel, else the conversation's.
      channel: String(m.delivery_channel || conv.channel || 'chat').toLowerCase(),
      conversation_subject: conv.subject || null,
    }
  })

  return NextResponse.json({
    messages,
    conversations: Object.values(convById),
    linkedCount: linked.length,
  })
}
