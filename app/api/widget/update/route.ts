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
 * Fields a visitor is allowed to change on their own conversation.
 *
 * Deliberately a whitelist, not a blocklist. Passing the update object straight
 * through would let a caller set `status`, `assigned_to`, or anything else on
 * any conversation — so only these are accepted, and everything else is
 * silently dropped.
 */
const CONVERSATION_FIELDS = new Set([
  'page_url', 'page_title', 'page_history', 'page_seen_at',
  'assigned_location_id', 'assigned_auto',
])

/**
 * POST /api/widget/update
 *
 * Small changes a visitor legitimately makes to their own thread: which page
 * they're on (the presence heartbeat), which outlet they picked, and reactions
 * to a message.
 *
 * These were direct table updates from the browser, which meant `conversations`
 * and `messages` had to stay writable by anyone holding the public key.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const companyId = uuid(b.companyId)
    const conversationId = uuid(b.conversationId)
    if (!companyId || !conversationId) {
      return NextResponse.json({ error: 'companyId and conversationId are required' }, { status: 400 })
    }

    const db = admin()

    // The thread must belong to the company being claimed.
    const { data: conv } = await db.from('conversations')
      .select('id, company_id').eq('id', conversationId).maybeSingle()
    if (!conv || conv.company_id !== companyId) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // ── Message reaction ────────────────────────────────────────────────────
    if (b.messageId) {
      const messageId = uuid(b.messageId)
      if (!messageId) return NextResponse.json({ error: 'Invalid messageId' }, { status: 400 })
      // The message must be in this conversation — not just any message.
      const { data: msg } = await db.from('messages')
        .select('id, conversation_id').eq('id', messageId).maybeSingle()
      if (!msg || msg.conversation_id !== conversationId) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }
      await db.from('messages').update({ reactions: b.reactions ?? null }).eq('id', messageId)
      return NextResponse.json({ ok: true })
    }

    // ── Conversation fields ─────────────────────────────────────────────────
    const patch: Record<string, any> = {}
    for (const [k, v] of Object.entries(b.fields || {})) {
      if (CONVERSATION_FIELDS.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    patch.updated_at = new Date().toISOString()

    await db.from('conversations').update(patch).eq('id', conversationId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[widget update] failed', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
