import { requireCompanyAccess, staffUserIds } from '@/lib/company-access'
import { internalHeaders } from '@/lib/internal-call'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/inbox/assigned
 *
 * Tell a team member a conversation was just assigned to them: the in-app bell
 * and a push to their phone that opens the conversation. Called by the web
 * inbox and the mobile app after they set conversations.assigned_to. Never for
 * a self-assignment, and only to this workspace's staff.
 *
 * Body: { companyId, conversationId, assigneeId, assignedBy }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, assigneeId, assignedBy } = await req.json()
    if (!companyId || !conversationId || !assigneeId) return NextResponse.json({ error: 'companyId, conversationId and assigneeId required' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })
    if (access.userId === assigneeId) return NextResponse.json({ ok: true, skipped: 'self-assigned' })
    if (!(await staffUserIds(db, companyId)).has(assigneeId)) return NextResponse.json({ ok: true, skipped: 'not on the team' })

    // Only if it's still theirs (a quick reassign shouldn't ping the first pick).
    const { data: conv } = await db.from('conversations')
      .select('id, assigned_to, subject, last_message, contact_id')
      .eq('id', conversationId).eq('company_id', companyId).maybeSingle()
    if (!conv || (conv as any).assigned_to !== assigneeId) return NextResponse.json({ ok: true, skipped: 'not assigned to them' })
    let who = ''
    if ((conv as any).contact_id) {
      const { data: ct } = await db.from('contacts').select('name, phone, email').eq('id', (conv as any).contact_id).maybeSingle()
      who = (ct as any)?.name || (ct as any)?.phone || (ct as any)?.email || ''
    }
    who = who || (conv as any).subject || 'a customer'
    const by = String(assignedBy || 'A teammate').slice(0, 80)
    const title = `${by} assigned you a conversation`
    const last = String((conv as any).last_message || '').trim()
    const body = last ? `${who}: ${last}`.slice(0, 300) : `With ${who}`

    try {
      await db.from('notifications').insert({
        user_id: assigneeId, company_id: companyId, type: 'conversation_assigned',
        message: `${by} assigned you the conversation with ${who}`,
        actor_name: by, conversation_id: conversationId, is_read: false,
      })
    } catch { /* the push below still goes */ }

    // Awaited: an un-awaited fetch can be dropped when the function returns.
    const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin
    const r = await fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ companyId, userIds: [assigneeId], title, body, conversationId }),
    }).catch(() => null)
    const pushed = r && r.ok ? await r.json().catch(() => ({})) : {}
    return NextResponse.json({ ok: true, sent: (pushed as any)?.sent ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
