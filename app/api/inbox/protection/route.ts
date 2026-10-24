import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, verifyToken, bearerToken } from '@/lib/company-access'
import { HIDDEN_PREVIEW } from '@/lib/conversation-protection'

export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const uuid = (v: any): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

/**
 * POST /api/inbox/protection { companyId, conversationId, action: 'not_spam' }
 *
 * A team member says a message Colvy held back (lib/conversation-protection)
 * isn't spam: every flagged message in the conversation is marked cleared,
 * the conversation comes out of Spam with its real preview back, and the
 * customer is trusted from now on (contacts.trusted_at, V417). Logged on the
 * conversation's timeline. Staff of that workspace only.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = uuid(body.companyId), conversationId = uuid(body.conversationId)
    if (!companyId || !conversationId || body.action !== 'not_spam') return NextResponse.json({ error: 'companyId, conversationId and action are required' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data: conv } = await db.from('conversations').select('id, company_id, contact_id, last_message').eq('id', conversationId).eq('company_id', companyId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const user = await verifyToken(db, bearerToken(req)).catch(() => null)
    let who = user?.email || 'A team member'
    try {
      const { data: tm } = await db.from('team_members').select('name').eq('company_id', companyId).eq('user_id', access.userId).limit(1)
      if (tm?.[0]?.name) who = tm[0].name
    } catch {}
    const at = new Date().toISOString()

    const { data: msgs } = await db.from('messages').select('id, metadata').eq('conversation_id', conversationId).eq('sender_type', 'visitor').order('created_at', { ascending: false }).limit(300)
    let cleared = 0
    for (const m of msgs || []) {
      const pr = m.metadata?.protection
      if (!pr || pr.cleared || pr.verdict === 'clean') continue
      await db.from('messages').update({ metadata: { ...m.metadata, protection: { ...pr, cleared: { by: who, at } } } }).eq('id', m.id)
      cleared++
    }

    const patch: any = { is_spam: false }
    if (conv.last_message === HIDDEN_PREVIEW) {
      const { data: last } = await db.from('messages').select('content').eq('conversation_id', conversationId).neq('sender_type', 'system').order('created_at', { ascending: false }).limit(1)
      patch.last_message = String(last?.[0]?.content || '').slice(0, 200) || null
    }
    await db.from('conversations').update(patch).eq('id', conversationId)
    // Trusted from now on (V417; before it runs, the next message is checked as usual).
    if (conv.contact_id) { try { await db.from('contacts').update({ trusted_at: at }).eq('id', conv.contact_id).eq('company_id', companyId) } catch {} }
    try { await db.from('conversation_events').insert({ conversation_id: conversationId, company_id: companyId, event_type: 'protection', actor_name: who, detail: `${who} marked this as not spam. Their messages won’t be held back again.` }) } catch {}
    return NextResponse.json({ ok: true, cleared, lastMessage: patch.last_message ?? conv.last_message })
  } catch (e: any) {
    console.error('[inbox/protection]', e?.message || e)
    return NextResponse.json({ error: 'Could not update' }, { status: 500 })
  }
}
