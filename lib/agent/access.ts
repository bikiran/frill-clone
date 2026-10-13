// Who may see and start agent runs: workspace staff with the "AI agents"
// permission (owners and admins always).

import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bearerToken, isStaffRow, SUPER_ADMIN, verifyToken } from '@/lib/company-access'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'

export function agentDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
}

export async function agentAccess(req: NextRequest, companyId: string | null | undefined): Promise<{ ok: boolean; db: any; userId?: string }> {
  const db = agentDb()
  // Same rules as requireCompanyAccess (owner, staff, or the platform admin),
  // plus the "agents" permission — worked out from one round of lookups.
  try {
    const user = companyId ? await verifyToken(db, bearerToken(req)) : null
    if (!user || !companyId) return { ok: false, db }
    if (user.email === SUPER_ADMIN) return { ok: true, db, userId: user.id }
    const [{ data: co }, { data: rows }] = await Promise.all([
      db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
      db.from('team_members').select('role, status, permissions').eq('company_id', companyId).eq('user_id', user.id).limit(5),
    ])
    if (co?.owner_id === user.id) return { ok: true, db, userId: user.id }
    const row = (rows || []).find(isStaffRow)
    if (!row) return { ok: false, db }
    const role = String(row.role || 'viewer').toLowerCase()
    const ok = hasFullAccess(role) || canUseFeature(role, row.permissions && typeof row.permissions === 'object' ? row.permissions : null, 'agents')
    return { ok, db, userId: user.id }
  } catch { return { ok: false, db } }
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

/** Display names for several team members at once: one team lookup, then any gaps filled side by side. */
export async function staffNames(db: any, companyId: string, userIds: string[]): Promise<Record<string, string | null>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  const out: Record<string, string | null> = {}
  if (!ids.length) return out
  const { data } = await db.from('team_members').select('user_id, name, email').eq('company_id', companyId).in('user_id', ids)
  for (const tm of data || []) out[tm.user_id] = tm.name || tm.email?.split('@')[0] || null
  await Promise.all(ids.filter(id => !out[id]).map(async id => {
    const { data } = await db.auth.admin.getUserById(id).catch(() => ({ data: null }))
    const u = (data as any)?.user
    out[id] = u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || null
  }))
  return out
}
