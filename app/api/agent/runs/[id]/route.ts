import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { activityName } from '@/lib/agent/record'

export const dynamic = 'force-dynamic'

/** GET /api/agent/runs/:id?companyId= — one run with every step, in order. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: run } = await db.from('agent_runs').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [{ data: steps }, { data: approvals }] = await Promise.all([
    db.from('agent_steps').select('id, seq, kind, action_key, input, output, reason, decision, decision_reason, autonomy, status, entity_type, entity_id, duration_ms, tokens_in, tokens_out, created_at').eq('run_id', id).order('seq', { ascending: true }),
    db.from('agent_approvals').select('id, action_key, args, status, result, created_at, expires_at').eq('run_id', id).order('created_at', { ascending: true }),
  ])
  return NextResponse.json({ run: { ...run, actor: activityName(run.role_key, run.input) }, steps: steps || [], approvals: approvals || [] })
}
