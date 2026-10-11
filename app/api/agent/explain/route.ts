import { NextRequest, NextResponse } from 'next/server'
import { agentDb, missingAgentTables } from '@/lib/agent/access'
import { requireCompanyAccess } from '@/lib/company-access'
import { explainRun, findRunId } from '@/lib/agent/explain'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/explain?companyId=&runId=            — explain a run
 * GET /api/agent/explain?companyId=&entityType=task&entityId=   — explain whatever made this
 *
 * "Why did Colvy do this?" from the inbox or a task. Readable by the business's
 * team (the same people who can see the conversation or task), not only those
 * with the AI agents permission; the full trail stays on the AI Agents page.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const db = agentDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok || !companyId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const runId = await findRunId(db, companyId, { runId: sp.get('runId'), entityType: sp.get('entityType'), entityId: sp.get('entityId') })
    const ex = runId ? await explainRun(db, companyId, runId) : null
    if (!ex) return NextResponse.json({ error: 'Couldn’t find what made this.' }, { status: 404 })
    return NextResponse.json(ex)
  } catch (e: any) {
    if (missingAgentTables(e)) return NextResponse.json({ error: 'Couldn’t find what made this.' }, { status: 404 })
    return NextResponse.json({ error: e?.message || 'Couldn’t load the explanation.' }, { status: 500 })
  }
}
