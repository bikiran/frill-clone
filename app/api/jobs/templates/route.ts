import { NextRequest } from 'next/server'
import { cleanLines, cleanDiscount, cleanDeposit } from '@/lib/jobs/quote-math'
import { jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, clip } from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// Quote templates (a quote's lines, terms and deposit, kept to reuse).
//   POST   { companyId, template: { id?, name, title, intro, terms, items, discount, deposit } }
//   DELETE ?companyId&id
// New templates usually come from a quote ("Save as template").

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const t = body.template || {}
    const name = clip(t.name, 120)
    if (!name) return json({ error: 'Give the template a name.' }, 400)
    const discount = cleanDiscount(t.discount), deposit = cleanDeposit(t.deposit)
    const row: any = {
      company_id: companyId, name, title: clip(t.title, 160) || null, intro: clip(t.intro, 4000) || null, terms: clip(t.terms, 6000) || null,
      items: cleanLines(t.items), discount_type: discount.type, discount_value: discount.value,
      deposit_type: deposit.type, deposit_value: deposit.value, updated_at: new Date().toISOString(),
    }
    const q = isUuid(t.id)
      ? db.from('job_quote_templates').update(row).eq('company_id', companyId).eq('id', t.id)
      : db.from('job_quote_templates').insert(row)
    const { data, error } = await q.select('*').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!data) return json({ error: 'Template not found.' }, 404)
    return json({ template: data })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the template.' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const id = sp.get('id')
    if (!isUuid(id)) return json({ error: 'Template not found.' }, 404)
    await db.from('job_quote_templates').delete().eq('company_id', companyId!).eq('id', id!)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the template.' }, 500)
  }
}
