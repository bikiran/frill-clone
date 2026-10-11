import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { decideApproval } from '@/lib/agent/approvals'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/agent/approvals/:id  { companyId, action: 'approve' | 'reject', text? }
 * A person decides on something an agent prepared. Approving a reply sends
 * exactly the frozen text, or the person's edit of it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!['approve', 'reject'].includes(body.action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  let name: string | null = null
  if (userId) {
    const { data: tm } = await db.from('team_members').select('name, email').eq('company_id', body.companyId).eq('user_id', userId).maybeSingle()
    name = tm?.name || tm?.email?.split('@')[0] || null
    if (!name) { const { data } = await db.auth.admin.getUserById(userId).catch(() => ({ data: null })); const u = (data as any)?.user; name = u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || null }
  }
  const r = await decideApproval(db, { companyId: body.companyId, approvalId: id, action: body.action, user: { id: userId || null, name }, text: typeof body.text === 'string' ? body.text : null })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json(r)
}
