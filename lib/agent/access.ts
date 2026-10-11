// Who may see and start agent runs: workspace staff with the "AI agents"
// permission (owners and admins always).

import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'

export function agentDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
}

export async function agentAccess(req: NextRequest, companyId: string | null | undefined): Promise<{ ok: boolean; db: any; userId?: string }> {
  const db = agentDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok || !companyId) return { ok: false, db }
  if (!access.userId) return { ok: true, db }
  const [{ data: co }, { data: rows }] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    db.from('team_members').select('role, permissions').eq('company_id', companyId).eq('user_id', access.userId).limit(1),
  ])
  if (co?.owner_id === access.userId) return { ok: true, db, userId: access.userId }
  const row = rows?.[0]
  if (!row) return { ok: true, db, userId: access.userId }   // platform admin
  const role = String(row.role || 'viewer').toLowerCase()
  const ok = hasFullAccess(role) || canUseFeature(role, row.permissions && typeof row.permissions === 'object' ? row.permissions : null, 'agents')
  return { ok, db, userId: access.userId }
}

export const missingAgentTables = (e: any) => /agent_runs|agent_steps|agent_approvals/i.test(String(e?.message || '')) && /does not exist|schema cache|relation/i.test(String(e?.message || ''))

/** A team member's display name, for the audit trail ("Sam approved it"). */
export async function staffName(db: any, companyId: string, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const { data: tm } = await db.from('team_members').select('name, email').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
  const name = tm?.name || tm?.email?.split('@')[0] || null
  if (name) return name
  const { data } = await db.auth.admin.getUserById(userId).catch(() => ({ data: null }))
  const u = (data as any)?.user
  return u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || null
}
