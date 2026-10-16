import { NextRequest, NextResponse } from 'next/server'
import { visitorConversation } from '@/lib/widget-access'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { formsDb, isUuid, type FormRow } from '@/lib/forms-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/widget/form?formId=&companyId=&conversationId=
 *
 * A form card sent into a live chat (from the inbox's Send → Form, or a smart
 * trigger's claim offer), as the chat widget renders it.
 *
 * The widget used to read the form straight from the forms table with the
 * public key. V375 closes drafts to that key, and businesses do send forms they
 * haven't published into a chat. So the widget asks here:
 *   • a published form is public anyway — returned to anyone;
 *   • an unpublished one only to the visitor of a chat it was sent into: the
 *     caller must be that chat's visitor (lib/widget-access.ts), the form must
 *     belong to the same business, and a staff / system message in that chat
 *     must carry it (visitors can't post message payloads).
 * Only what the card shows is returned: id, title, questions.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const formId = sp.get('formId')
  const companyId = sp.get('companyId')
  const conversationId = sp.get('conversationId')
  const none = (status: number) => NextResponse.json({ form: null }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!isUuid(formId)) return none(400)
  if (!checkBurst(`widget-form:${callerKey(req, isUuid(companyId) ? companyId : null)}`, 60)) return none(429)

  try {
    const db = formsDb()
    const { data } = await db.from('forms').select('id, company_id, title, questions, is_published').eq('id', formId).maybeSingle()
    const form = data as unknown as FormRow | null
    if (!form) return none(404)
    const out = () => NextResponse.json(
      { form: { id: form.id, title: form.title, questions: Array.isArray(form.questions) ? form.questions : [] } },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    if (form.is_published === true) return out()

    if (!isUuid(companyId) || !isUuid(conversationId) || form.company_id !== companyId) return none(404)
    const conv = await visitorConversation(req, db, companyId, conversationId)
    if (!conv || conv.company_id !== form.company_id) return none(404)
    const { data: sent } = await db.from('messages').select('id')
      .eq('conversation_id', conv.id).eq('message_type', 'form')
      .eq('message_payload->>ref_id', formId).neq('sender_type', 'visitor')
      .limit(1)
    if (!sent?.length) return none(404)
    return out()
  } catch {
    return none(500)
  }
}
