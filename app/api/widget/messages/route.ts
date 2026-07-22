import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const uuid = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

/**
 * GET /api/widget/messages?companyId=&conversationId=&since=
 *
 * The conversation history for the public chat widget.
 *
 * The widget used to SELECT from `messages` directly with the anon key, which
 * is why that table had to stay readable by anyone. Serving it here means the
 * table can be closed: the server checks the conversation belongs to the
 * company being claimed and returns only that thread.
 *
 * `since` (an ISO timestamp) fetches just what's newer — used to catch up after
 * a reconnect without re-sending the whole conversation.
 *
 * Internal notes are never returned; they're staff-only.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = uuid(req.nextUrl.searchParams.get('companyId'))
    const conversationId = uuid(req.nextUrl.searchParams.get('conversationId'))
    const since = req.nextUrl.searchParams.get('since')

    if (!companyId || !conversationId) {
      return NextResponse.json({ messages: [] })
    }

    const db = admin()

    // Confirm the thread belongs to this company before returning anything.
    const { data: conv } = await db.from('conversations')
      .select('id, company_id').eq('id', conversationId).maybeSingle()
    if (!conv || conv.company_id !== companyId) {
      return NextResponse.json({ messages: [] }, { status: 404 })
    }

    let q = db.from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (since) q = q.gt('created_at', since)

    const { data, error } = await q
    if (error) {
      console.error('[widget messages] query failed', error)
      return NextResponse.json({ messages: [] }, { status: 500 })
    }

    // A visitor must never see staff-only notes.
    const visible = (data || []).filter((m: any) =>
      m.sender_type !== 'internal' && !m.is_internal && !m.internal)

    return NextResponse.json({ messages: visible })
  } catch (e: any) {
    console.error('[widget messages] failed', e)
    return NextResponse.json({ messages: [] }, { status: 500 })
  }
}
