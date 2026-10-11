import { NextRequest, NextResponse, after } from 'next/server'
import { agentAccess, staffName } from '@/lib/agent/access'
import { decideApproval } from '@/lib/agent/approvals'
import { proposeFromEdit } from '@/lib/agent/learn'

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
  const name = await staffName(db, body.companyId, userId)
  const r = await decideApproval(db, { companyId: body.companyId, approvalId: id, action: body.action, user: { id: userId || null, name }, text: typeof body.text === 'string' ? body.text : null })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  // An edited reply may teach something worth remembering — proposed to
  // Business Memory for the owner to keep or dismiss, never used before that.
  if (r.status === 'edited') after(async () => { try { await proposeFromEdit(db, { companyId: body.companyId, approvalId: id }) } catch (e) { console.warn('[agent] learn', e) } })
  return NextResponse.json(r)
}
