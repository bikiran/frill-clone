import { NextRequest, NextResponse } from 'next/server'
import { agentAccess, missingAgentTables } from '@/lib/agent/access'
import { pendingApprovals } from '@/lib/agent/approvals'

export const dynamic = 'force-dynamic'

/** GET /api/agent/approvals?companyId=&conversationId= — suggestions waiting for a person. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    return NextResponse.json({ approvals: await pendingApprovals(db, companyId!, { conversationId: sp.get('conversationId') }) })
  } catch (e: any) {
    if (missingAgentTables(e)) return NextResponse.json({ approvals: [] })
    return NextResponse.json({ error: e?.message || 'Couldn’t load suggestions' }, { status: 500 })
  }
}
