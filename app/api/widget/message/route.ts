import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const uuid = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

const MAX_LENGTH = 4000
/** A person types a handful of messages a minute; a script types hundreds. */
const MESSAGES_PER_MINUTE = 12

/**
 * POST /api/widget/message
 *
 * A visitor sending a message from the public chat widget.
 *
 * This used to be an INSERT straight from the browser using the anon key, which
 * meant three things:
 *   • the messages table had to be writable by anyone, so it couldn't be locked
 *   • anyone could post into any conversation, in any company, by id
 *   • there was no limit, so a script could flood an inbox
 *
 * Running it here lets the server check that the conversation genuinely belongs
 * to the company, cap the rate, bound the length, and keep the table itself
 * closed to direct writes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const companyId = uuid(body.companyId)
    const conversationId = uuid(body.conversationId)
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : []
    // A visitor may only post as themselves or as a system event (e.g. "started
    // a chat"). Anything else — notably 'agent' — is refused, so nobody can
    // impersonate staff in a customer's thread.
    const requested = typeof body.senderType === 'string' ? body.senderType : 'visitor'
    const senderType = requested === 'system' ? 'system' : 'visitor'

    if (!companyId || !conversationId) {
      return NextResponse.json({ error: 'companyId and conversationId are required' }, { status: 400 })
    }
    if (!content && attachments.length === 0) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
    }
    if (content.length > MAX_LENGTH) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 413 })
    }

    // Rate limit per visitor per conversation.
    if (!checkBurst(`widget:${callerKey(req, conversationId)}`, MESSAGES_PER_MINUTE)) {
      return NextResponse.json(
        { error: 'You are sending messages very quickly. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': '30' } },
      )
    }

    const db = admin()

    // The conversation must exist AND belong to the company being claimed —
    // otherwise a caller could post into another business's inbox by guessing.
    const { data: conv } = await db.from('conversations')
      .select('id, company_id, status')
      .eq('id', conversationId).maybeSingle()
    if (!conv || conv.company_id !== companyId) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: message, error } = await db.from('messages').insert({
      conversation_id: conversationId,
      company_id: companyId,
      sender_type: senderType,
      sender_name: (body.senderName || '').toString().slice(0, 120) || null,
      sender_email: (body.senderEmail || '').toString().slice(0, 200) || null,
      content,
      attachments,
      reply_to: uuid(body.replyTo),
    }).select().maybeSingle()

    if (error) {
      console.error('[widget message] insert failed', error)
      return NextResponse.json({ error: 'Message could not be sent' }, { status: 500 })
    }

    await db.from('conversations').update({
      last_message: (content || '📎 Attachment').slice(0, 200),
      last_message_at: new Date().toISOString(),
      is_unread: true,
      unread_count: 1,
      status: 'open',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, message })
  } catch (e: any) {
    console.error('[widget message] failed', e)
    return NextResponse.json({ error: 'Message could not be sent' }, { status: 500 })
  }
}
