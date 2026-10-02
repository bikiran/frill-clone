import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { claimDraft, sendAiReply } from '@/lib/ai-live-reply'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { conversationId, draftId, action: 'send' | 'edit' | 'cancel', text? }
// A person stepping in on Colvy AI's reply during its countdown:
//   send   → send it now (with their edits, if any)
//   edit   → take it out of the countdown; the text goes into their reply box
//   cancel → don't send it
// Whoever takes the draft off the conversation first wins, so it can never go
// out twice (or after someone cancelled it).
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const conversationId = String(b.conversationId || '')
    const draftId = String(b.draftId || '')
    const action = String(b.action || '')
    if (!conversationId || !draftId || !['send', 'edit', 'cancel'].includes(action)) return NextResponse.json({ error: 'Missing details' }, { status: 400 })

    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const access = await requireCompanyAccess(req, db, conv.company_id)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const draft = String(conv.ai_draft || '')
    if (conv.ai_draft_id !== draftId || !(await claimDraft(db, conversationId, draftId))) {
      return NextResponse.json({ error: 'Too late — that reply has already been sent or taken over.', gone: true }, { status: 409 })
    }

    const log = (row: any) => db.from('ai_actions').insert({ company_id: conv.company_id, conversation_id: conversationId, allowed: true, ...row }).then(() => {}, () => {})

    if (action === 'send') {
      const text = String(b.text ?? draft).trim()
      if (!text) return NextResponse.json({ error: 'The reply is empty.' }, { status: 400 })
      const { data: co } = await db.from('companies').select('name').eq('id', conv.company_id).maybeSingle()
      const sent = await sendAiReply(db, { conv, companyId: conv.company_id, businessName: co?.name || 'Us', text, meta: { approved_by: access.userId || null, edited: text !== draft } })
      if (!sent.ok) return NextResponse.json({ error: sent.error || 'Could not send' }, { status: 502 })
      await log({ action: 'reply_sent_early', payload: { edited: text !== draft } })
      return NextResponse.json({ ok: true })
    }
    if (action === 'edit') {
      await log({ action: 'reply_taken_to_edit', payload: { draft: draft.slice(0, 400) } })
      return NextResponse.json({ ok: true, text: draft })
    }
    await log({ action: 'reply_cancelled', payload: { draft: draft.slice(0, 400) } })
    await db.from('conversations').update({ is_unread: true }).eq('id', conversationId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
