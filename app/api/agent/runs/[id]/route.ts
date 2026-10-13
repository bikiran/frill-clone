import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { runDetail } from '@/lib/agent/run-detail'

export const dynamic = 'force-dynamic'

/** GET /api/agent/runs/:id?companyId= — one run with every step, in order. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const detail = await runDetail(db, companyId!, id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}
