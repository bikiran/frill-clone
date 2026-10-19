import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { isInternalCall } from '@/lib/internal-call'
import { sendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Reply to a WhatsApp conversation (lib/whatsapp sendWhatsApp):
//   { conversationId, content?, attachments?, agentName? }          free-form, inside the 24-hour window
//   { conversationId, templateId, variables, agentName? }            an approved utility template, any time
//   skipChatMessage: true   send only; the caller records the thread message
// Workspace members (Bearer) or Colvy's own server (agents, scheduled replies).
// Refusals answer with { error, reason } — reason 'window_closed' tells the
// composer to offer a template.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const db = admin()
    const { data: conv } = await db.from('conversations').select('id, company_id').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (!isInternalCall(req) && !(await requireCompanyAccess(req, db, conv.company_id)).ok) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    const attachments = Array.isArray(body.attachments) ? body.attachments
      : body.attachmentUrl ? [{ url: String(body.attachmentUrl), kind: body.attachmentKind || 'file' }] : []
    const r = await sendWhatsApp(db, {
      companyId: conv.company_id, conversationId,
      text: typeof body.content === 'string' ? body.content : '',
      attachments,
      templateId: typeof body.templateId === 'string' && body.templateId ? body.templateId : null,
      variables: body.variables && typeof body.variables === 'object' ? body.variables : null,
      senderName: typeof body.agentName === 'string' ? body.agentName.slice(0, 120) : null,
      isAi: isInternalCall(req) && body.isAi === true,
      metadata: isInternalCall(req) && body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
      skipThreadMessage: body.skipChatMessage === true,
    })
    if (!r.ok) return NextResponse.json({ error: r.error, reason: r.reason, ...(r.code ? { code: r.code } : {}) }, { status: r.status })
    return NextResponse.json({ ok: true, id: r.sid, sids: r.sids, messageId: r.messageId, text: r.text, kind: r.kind })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'WhatsApp message not sent' }, { status: 500 })
  }
}
