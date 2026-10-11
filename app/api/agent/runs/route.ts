import { NextRequest, NextResponse, after } from 'next/server'
import { agentAccess, agentDb, missingAgentTables } from '@/lib/agent/access'
import { enqueueRun, runAgent } from '@/lib/agent/engine'
import { ROLES } from '@/lib/agent/roles'
import { ACTIVITY_ROLES, activityName } from '@/lib/agent/record'
import { guardAiRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RUN_COLS = 'id, role_key, mode, trigger_type, conversation_id, contact_id, status, outcome, intent, summary, model, tokens_in, tokens_out, step_count, created_at, finished_at, input'

/** GET /api/agent/runs?companyId=&limit=&role= — recent AI activity, newest first. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 30, 1), 100)
  // Everything the AI did, or one kind: support | colvy_ai | assistant | connected_app.
  const role = req.nextUrl.searchParams.get('role')
  let q = db.from('agent_runs').select(RUN_COLS).eq('company_id', companyId)
  if (role && ACTIVITY_ROLES[role]) q = q.eq('role_key', role)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
  if (error) {
    if (missingAgentTables(error)) return NextResponse.json({ runs: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ runs: (data || []).map((r: any) => ({ ...r, actor: activityName(r.role_key, r.input) })), roles: Object.values(ROLES).map(r => ({ key: r.key, name: r.name, goal: r.goal })) })
}

/**
 * POST /api/agent/runs  { companyId, roleKey, message, conversationId? }
 *
 * A sandbox run: the agent reads real data but nothing with side effects
 * happens — each such action is recorded as a suggestion. Used to try an agent
 * safely before it is switched on.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { companyId } = body || {}
  const { ok, db, userId } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const roleKey = String(body.roleKey || 'support')
  if (!ROLES[roleKey]) return NextResponse.json({ error: 'Unknown agent role.' }, { status: 400 })
  const message = String(body.message || '').trim().slice(0, 4000)
  if (!message) return NextResponse.json({ error: roleKey === 'reputation' ? 'Type a review to try.' : 'Type a customer message to try.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })

  const guard = await guardAiRequest(req, companyId, 'agent_sandbox', false)
  if (!guard.ok) return guard.response!

  let conversationId: string | null = body.conversationId || null
  if (conversationId) {
    const { data: conv } = await db.from('conversations').select('id').eq('company_id', companyId).eq('id', conversationId).maybeSingle()
    if (!conv) conversationId = null
  }
  try {
    // The Reputation Agent tries out on a made-up review: stars + text.
    const input = roleKey === 'reputation'
      ? { kind: 'review', message, rating: Math.min(5, Math.max(1, Math.round(Number(body.rating) || 5))), reviewer: String(body.reviewer || 'Sam').slice(0, 60) }
      : { message }
    const { runId } = await enqueueRun(db, { type: 'sandbox', mode: 'sandbox', companyId, roleKey, conversationId: roleKey === 'reputation' ? null : conversationId, actorUserId: userId || null, input })
    after(async () => { try { await runAgent(agentDb(), runId, Date.now() + 240_000) } catch {} })
    return NextResponse.json({ runId })
  } catch (e: any) {
    if (missingAgentTables(e)) return NextResponse.json({ error: 'Agents need a database update first (COLVY_V353_AGENT_ENGINE.sql).' }, { status: 503 })
    return NextResponse.json({ error: e?.message || 'Couldn’t start the run.' }, { status: 500 })
  }
}
