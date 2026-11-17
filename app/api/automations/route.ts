import { NextRequest } from 'next/server'
import { db, adminCaller, json, clip, view, isMissing, MIGRATION_HINT, MAX_FLOWS, triggerTypeOf } from './shared'
import { TEMPLATES, templateGraph } from '@/lib/automations/graph'
import { planAllows } from '@/lib/plan-gate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/automations?companyId=  the business's automations + starting points
 * POST /api/automations            { companyId, template, name? } → a new one (off)
 *
 * Owners and admins only. The flows run in lib/automations/engine.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const client = db()
  const c = await adminCaller(req, client, companyId)
  if (!c.ok) return c.response
  const [{ data, error }, planOk] = await Promise.all([
    client.from('automations').select('*').eq('company_id', companyId).order('created_at', { ascending: true }).limit(MAX_FLOWS),
    planAllows(client, companyId!, 'aiAutomation'),
  ])
  const templates = TEMPLATES.map(t => ({ id: t.id, name: t.name, about: t.about, graph: t.graph }))
  if (error) {
    if (isMissing(error)) return json({ missing: true, hint: MIGRATION_HINT, automations: [], templates, planOk })
    return json({ error: 'Couldn’t load your automations.' }, 500)
  }
  return json({ automations: (data || []).map(view), templates, planOk })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const client = db()
  const c = await adminCaller(req, client, body?.companyId)
  if (!c.ok) return c.response
  const { count } = await client.from('automations').select('id', { count: 'exact', head: true }).eq('company_id', body.companyId)
  if ((count || 0) >= MAX_FLOWS) return json({ error: `You can have up to ${MAX_FLOWS} automations. Delete one you no longer use first.` }, 400)
  const tpl = TEMPLATES.find(t => t.id === body?.template) || TEMPLATES[0]
  const graph = templateGraph(tpl.id)
  const name = clip(body?.name, 80) || (tpl.id === 'blank' ? 'New automation' : tpl.name)
  const { data, error } = await client.from('automations').insert({
    company_id: body.companyId, name, enabled: false, trigger_type: triggerTypeOf(graph), graph, created_by: c.userId, updated_by: c.userId,
  }).select('*').single()
  if (error) {
    if (isMissing(error)) return json({ error: MIGRATION_HINT, missing: true }, 503)
    return json({ error: 'Couldn’t create the automation.' }, 500)
  }
  return json({ automation: view(data) })
}
