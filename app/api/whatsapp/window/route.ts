import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { whatsappAccess, whatsappOptOut, lastWhatsAppInbound, listTemplates } from '@/lib/whatsapp'
import { serviceWindow, templateSendable, templateVariables, BLOCK_WORDS } from '@/lib/whatsapp-core'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?conversationId= — what the inbox composer needs on a WhatsApp thread:
// whether this business can send, whether the customer opted out, the 24-hour
// window (open, and until when), and the approved templates it may send once
// the window has closed.
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId') || ''
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  const db = admin()
  const { data: conv } = await db.from('conversations').select('id, company_id, whatsapp_number').eq('id', conversationId).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (!(await requireCompanyAccess(req, db, conv.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [access, optOut, last, tpl] = await Promise.all([
    whatsappAccess(db, conv.company_id),
    conv.whatsapp_number ? whatsappOptOut(db, conv.company_id, conv.whatsapp_number) : Promise.resolve('unknown' as const),
    lastWhatsAppInbound(db, conv.company_id, { conversationId }),
    listTemplates(db, conv.company_id),
  ])
  const templates = tpl.rows.filter(templateSendable).map(t => ({
    id: t.id, name: t.name, language: t.language, category: t.category, body: t.body,
    variables: templateVariables(t.body), labels: Array.isArray(t.variable_labels) ? t.variable_labels : [],
  }))
  return NextResponse.json({
    canSend: access.ok, reason: access.ok ? null : access.reason, reasonText: access.ok ? null : BLOCK_WORDS[access.reason || 'not_approved'],
    hasNumber: !!conv.whatsapp_number, optOut, window: serviceWindow(last), templates,
  })
}
