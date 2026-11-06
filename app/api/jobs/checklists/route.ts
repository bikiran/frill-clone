import { NextRequest } from 'next/server'
import { jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, isJobsManager, clip } from '@/lib/jobs/server'
import { cleanChecklistItems } from '@/lib/jobs/work'

export const dynamic = 'force-dynamic'

// Saved checklists (e.g. "Switchboard upgrade", "End of lease clean") to add
// to a job in one go.
//   GET    ?companyId
//   POST   { companyId, checklist: { id?, name, items } }   owners and admins
//   DELETE ?companyId&id                                    owners and admins

export async function GET(req: NextRequest) {
  try {
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const { data, error } = await db.from('job_checklists').select('id, name, items, updated_at').eq('company_id', companyId!).order('name').limit(200)
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    return json({ checklists: data || [] })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load the checklists.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(String(access.role))) return json({ error: 'Only owners and admins can change saved checklists.' }, 403)
    const c = body.checklist || {}
    const name = clip(c.name, 120)
    const items = cleanChecklistItems(c.items)
    if (!name) return json({ error: 'Give the checklist a name.' }, 400)
    if (!items.length) return json({ error: 'Add at least one item.' }, 400)
    const row = { company_id: companyId, name, items, updated_at: new Date().toISOString() }
    const q = isUuid(c.id) ? db.from('job_checklists').update(row).eq('company_id', companyId).eq('id', c.id) : db.from('job_checklists').insert(row)
    const { data, error } = await q.select('id, name, items, updated_at').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!data) return json({ error: 'Checklist not found.' }, 404)
    return json({ checklist: data })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not save the checklist.' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(String(access.role))) return json({ error: 'Only owners and admins can change saved checklists.' }, 403)
    const id = sp.get('id')
    if (!isUuid(id)) return json({ error: 'Checklist not found.' }, 404)
    await db.from('job_checklists').delete().eq('company_id', companyId!).eq('id', id!)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the checklist.' }, 500)
  }
}
