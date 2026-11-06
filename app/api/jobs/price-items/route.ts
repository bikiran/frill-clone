import { NextRequest } from 'next/server'
import { cleanLine } from '@/lib/jobs/quote-math'
import { jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, isJobsManager, clip } from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// The price list quotes are built from (labour rates, materials, call-out fees).
//   POST   { companyId, item: { id?, name, description, kind, unit, unit_price_cents, taxable, active, sort_order } }
//   DELETE ?companyId&id
// Owners and admins.

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(access.role)) return json({ error: 'Only owners and admins can change the price list.' }, 403)
    const raw = body.item || {}
    const name = clip(raw.name, 120)
    if (!name) return json({ error: 'Give the item a name.' }, 400)
    const l = cleanLine({ ...raw, description: name })
    const row: any = {
      company_id: companyId, name, description: clip(raw.description, 300) || null, kind: l.kind, unit: l.unit,
      unit_price_cents: l.unit_price_cents, taxable: l.taxable, active: raw.active !== false,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Math.round(Number(raw.sort_order)) : 0, updated_at: new Date().toISOString(),
    }
    const q = isUuid(raw.id)
      ? db.from('job_price_items').update(row).eq('company_id', companyId).eq('id', raw.id)
      : db.from('job_price_items').insert(row)
    const { data, error } = await q.select('*').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!data) return json({ error: 'Item not found.' }, 404)
    return json({ item: data })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the item.' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(access.role)) return json({ error: 'Only owners and admins can change the price list.' }, 403)
    const id = sp.get('id')
    if (!isUuid(id)) return json({ error: 'Item not found.' }, 404)
    await db.from('job_price_items').delete().eq('company_id', companyId!).eq('id', id!)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the item.' }, 500)
  }
}
