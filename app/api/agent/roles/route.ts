import { NextRequest, NextResponse } from 'next/server'
import { agentAccess, missingAgentTables } from '@/lib/agent/access'
import { ROLES } from '@/lib/agent/roles'

export const dynamic = 'force-dynamic'

/** GET /api/agent/roles?companyId= — each role and whether it's on for this business. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('agent_roles').select('role_key, enabled').eq('company_id', companyId)
  if (error && !missingAgentTables(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  const on = new Map((data || []).map((r: any) => [r.role_key, !!r.enabled]))
  return NextResponse.json({ roles: Object.values(ROLES).map(r => ({ key: r.key, name: r.name, goal: r.goal, enabled: on.get(r.key) || false })) })
}

/** POST /api/agent/roles { companyId, roleKey, enabled } — switch a role on or off. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!ROLES[body.roleKey]) return NextResponse.json({ error: 'Unknown role' }, { status: 400 })
  const { error } = await db.from('agent_roles').upsert(
    { company_id: body.companyId, role_key: body.roleKey, enabled: !!body.enabled, updated_by: userId || null, updated_at: new Date().toISOString() },
    { onConflict: 'company_id,role_key' },
  )
  if (error) return NextResponse.json({ error: missingAgentTables(error) ? 'Agents need a database update first (COLVY_V353_AGENT_ENGINE.sql).' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, enabled: !!body.enabled })
}
