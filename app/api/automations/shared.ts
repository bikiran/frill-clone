// Shared by the /api/automations routes: who may change automations, and how
// a saved flow is shown to the builder.
import { createClient } from '@supabase/supabase-js'
import { powersCaller, json, isUuid, clip } from '@/lib/powers/server'
import { cleanGraph, problems, triggerOf, type Graph } from '@/lib/automations/graph'

export { json, isUuid, clip }
export const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
export const MIGRATION_HINT = 'Automations need a database update: run migrations/COLVY_V440_AUTOMATIONS.sql in the Supabase SQL editor.'
export const MAX_FLOWS = 50
export const isMissing = (e: any) => /^(42P01|PGRST205)$/.test(String(e?.code || '')) || /does not exist|could not find the table|schema cache/i.test(String(e?.message || ''))

/** Signed in as an owner or admin of this workspace (automations act for the whole business). */
export async function adminCaller(req: Request, client: any, companyId: any) {
  const c = await powersCaller(req, client, companyId)
  if (!c.ok) return c
  if (!c.isAdmin) return { ok: false as const, response: json({ error: 'Only the owner or an admin can set up automations.' }, 403) }
  return c
}

export const triggerTypeOf = (g: Graph) => (triggerOf(g)?.config.type === 'missed_call' ? 'missed_call' : 'message')

export function view(row: any) {
  const graph = cleanGraph(row.graph)
  return {
    id: row.id, name: row.name, enabled: !!row.enabled, triggerType: row.trigger_type, graph,
    runCount: row.run_count || 0, lastRunAt: row.last_run_at || null, updatedAt: row.updated_at, createdAt: row.created_at,
    problems: problems(graph),
  }
}
