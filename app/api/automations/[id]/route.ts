import { NextRequest } from 'next/server'
import { db, adminCaller, json, clip, view, isUuid, isMissing, MIGRATION_HINT, triggerTypeOf } from '../shared'
import { cleanGraph, problems } from '@/lib/automations/graph'
import { planAllows, GATED } from '@/lib/plan-gate'
import { loadStaffRows } from '@/lib/team-list'
import { isStaffRow } from '@/lib/company-access'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function load(client: any, companyId: string, id: string) {
  if (!isUuid(id)) return null
  const { data } = await client.from('automations').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return data || null
}

/**
 * GET    /api/automations/:id?companyId=  the flow, its recent runs, the team and tags to pick from
 * PATCH  /api/automations/:id             { companyId, name?, graph?, enabled? }
 * DELETE /api/automations/:id?companyId=
 *
 * Switching on needs a flow with nothing left to fix, and automations on the
 * plan. Saving changes that break a live flow switches it off (the reply
 * says so), so a half-finished edit never runs.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const client = db()
  const c = await adminCaller(req, client, companyId)
  if (!c.ok) return c.response
  const row = await load(client, companyId!, id).catch(() => null)
  if (!row) return json({ error: 'That automation isn’t here any more.' }, 404)
  const [runs, staff, tags, planOk] = await Promise.all([
    client.from('automation_runs').select('id, status, conversation_id, steps, error, created_at, updated_at, resume_at, event_key').eq('automation_id', id).eq('company_id', companyId).order('created_at', { ascending: false }).limit(40),
    loadStaffRows(client, companyId!, 'user_id, name, email, role, status').catch(() => [] as any[]),
    client.from('contacts').select('tags').eq('company_id', companyId).not('tags', 'is', null).order('updated_at', { ascending: false }).limit(400),
    planAllows(client, companyId!, 'aiAutomation'),
  ])
  const { data: co } = await client.from('companies').select('owner_id, name').eq('id', companyId).maybeSingle()
  const team = new Map<string, string>()
  for (const s of staff as any[]) if (s?.user_id && isStaffRow(s)) team.set(s.user_id, clip(s.name || String(s.email || '').split('@')[0] || 'Teammate', 80))
  if (co?.owner_id && !team.has(co.owner_id)) team.set(co.owner_id, c.userId === co.owner_id ? c.name : 'Owner')
  const tagSet = new Map<string, string>()
  for (const r of tags.data || []) for (const t of Array.isArray(r.tags) ? r.tags : []) { const s = clip(t, 40); if (s && !tagSet.has(s.toLowerCase())) tagSet.set(s.toLowerCase(), s) }
  // Who each run was for, so the run list reads "Jordan Lee" not an id.
  const convIds = Array.from(new Set((runs.data || []).map((r: any) => r.conversation_id).filter(Boolean))).slice(0, 40)
  const who = new Map<string, string>()
  if (convIds.length) {
    const { data: convs } = await client.from('conversations').select('id, contact_id, subject').in('id', convIds)
    const contactIds = Array.from(new Set((convs || []).map((x: any) => x.contact_id).filter(Boolean)))
    const { data: cts } = contactIds.length ? await client.from('contacts').select('id, name, phone, email').in('id', contactIds) : { data: [] as any[] }
    const ct = new Map((cts || []).map((x: any) => [x.id, x.name || x.phone || x.email]))
    for (const cv of convs || []) who.set(cv.id, String(ct.get(cv.contact_id) || cv.subject || 'A customer'))
  }
  return json({
    automation: view(row),
    runs: (runs.data || []).map((r: any) => ({
      id: r.id, status: r.status, conversationId: r.conversation_id, customer: r.conversation_id ? who.get(r.conversation_id) || 'A customer' : (String(r.event_key || '').startsWith('call:') ? 'A caller' : 'A customer'),
      steps: Array.isArray(r.steps) ? r.steps : [], error: r.error, createdAt: r.created_at, updatedAt: r.updated_at, resumeAt: r.resume_at,
    })),
    team: Array.from(team, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    tags: Array.from(tagSet.values()).sort((a, b) => a.localeCompare(b)).slice(0, 200),
    business: co?.name || null,
    planOk, planLocked: planOk ? null : GATED.aiAutomation.locked,
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const client = db()
  const c = await adminCaller(req, client, body?.companyId)
  if (!c.ok) return c.response
  const row = await load(client, body.companyId, id).catch(() => null)
  if (!row) return json({ error: 'That automation isn’t here any more.' }, 404)

  const patch: Record<string, any> = { updated_by: c.userId, updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = clip(body.name, 80)
    if (!name) return json({ error: 'Give it a name.' }, 400)
    patch.name = name
  }
  const graph = body.graph !== undefined ? cleanGraph(body.graph) : cleanGraph(row.graph)
  if (body.graph !== undefined) { patch.graph = graph; patch.trigger_type = triggerTypeOf(graph) }
  const issues = problems(graph)
  let switchedOff: string | null = null
  if (body.enabled === true) {
    if (issues.length) return json({ error: `Fix this first: ${issues[0].message}`, problems: issues }, 400)
    if (!(await planAllows(client, body.companyId, 'aiAutomation'))) return json({ error: GATED.aiAutomation.locked, upgrade: true }, 402)
    patch.enabled = true
  } else if (body.enabled === false) {
    patch.enabled = false
  } else if (row.enabled && issues.length) {
    patch.enabled = false
    switchedOff = `Switched off until it’s fixed: ${issues[0].message}`
  }
  const { data, error } = await client.from('automations').update(patch).eq('id', id).eq('company_id', body.companyId).select('*').single()
  if (error) {
    if (isMissing(error)) return json({ error: MIGRATION_HINT, missing: true }, 503)
    return json({ error: 'Couldn’t save the automation.' }, 500)
  }
  return json({ automation: view(data), switchedOff })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const client = db()
  const c = await adminCaller(req, client, companyId)
  if (!c.ok) return c.response
  if (!isUuid(id)) return json({ error: 'That automation isn’t here any more.' }, 404)
  const { error } = await client.from('automations').delete().eq('id', id).eq('company_id', companyId)
  if (error) return json({ error: 'Couldn’t delete the automation.' }, 500)
  return json({ ok: true })
}
