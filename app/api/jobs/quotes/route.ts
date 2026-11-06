import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { cleanLines } from '@/lib/jobs/quote-math'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, nextNumber, logJobEvent,
  loadCompany, companySettings, companyTz, quoteMoney, quoteDefaults, clip,
} from '@/lib/jobs/server'
import { effectiveTaxRate } from '@/lib/jobs/settings'

export const dynamic = 'force-dynamic'

// POST { companyId, jobId, templateId?, reviseOf? }
// A new draft quote for a job: blank (the business's defaults), from a saved
// template, or a revision of an earlier quote (same number, next revision,
// its lines copied). A job that was New moves to Quoting.

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(body.jobId)) return json({ error: 'Which job?' }, 400)

    const { data: job, error } = await db.from('jobs').select('id, number, title, status').eq('company_id', companyId).eq('id', body.jobId).maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!job) return json({ error: 'Job not found.' }, 404)
    if (job.status === 'cancelled' || job.status === 'completed') return json({ error: 'Reopen the job before quoting it.' }, 409)

    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const d = quoteDefaults(settings, companyTz(company))

    let number: number, revision = 1
    let content: any = {
      title: job.title, intro: '', terms: d.terms, items: [], discount: { type: 'none', value: 0 }, deposit: d.deposit,
      prices_include_tax: d.prices_include_tax,
    }
    let summary = ''

    if (isUuid(body.reviseOf)) {
      const { data: prev } = await db.from('job_quotes').select('*').eq('company_id', companyId).eq('job_id', job.id).eq('id', body.reviseOf).maybeSingle()
      if (!prev) return json({ error: 'That quote isn’t on this job.' }, 404)
      const { data: revs } = await db.from('job_quotes').select('revision').eq('company_id', companyId).eq('number', prev.number).order('revision', { ascending: false }).limit(1)
      number = prev.number
      revision = Number(revs?.[0]?.revision || prev.revision || 1) + 1
      content = {
        title: prev.title, intro: prev.intro, terms: prev.terms, items: prev.items,
        discount: { type: prev.discount_type, value: Number(prev.discount_value) }, deposit: { type: prev.deposit_type, value: Number(prev.deposit_value) },
        prices_include_tax: prev.prices_include_tax,
      }
      summary = `Started revision ${revision} of quote ${settings.quote_prefix}-${number}`
    } else {
      if (isUuid(body.templateId)) {
        const { data: t } = await db.from('job_quote_templates').select('*').eq('company_id', companyId).eq('id', body.templateId).maybeSingle()
        if (!t) return json({ error: 'That template wasn’t found.' }, 404)
        content = {
          ...content, title: t.title || content.title, intro: t.intro || '', terms: t.terms || content.terms,
          items: cleanLines(t.items).map((l, i) => ({ ...l, id: `l${Date.now().toString(36)}${i}` })),
          discount: { type: t.discount_type, value: Number(t.discount_value) },
          deposit: t.deposit_type !== 'none' ? { type: t.deposit_type, value: Number(t.deposit_value) } : content.deposit,
        }
      }
      number = await nextNumber(db, companyId, 'quote')
      summary = `Created quote ${settings.quote_prefix}-${number}${isUuid(body.templateId) ? ' from a template' : ''}`
    }

    const money = quoteMoney({ items: content.items, discount: content.discount, deposit: content.deposit, prices_include_tax: content.prices_include_tax, tax_rate: effectiveTaxRate(settings) })
    const row = {
      company_id: companyId, job_id: job.id, number, revision, status: 'draft',
      title: clip(content.title, 160) || null, intro: clip(content.intro, 4000) || null, terms: clip(content.terms, 6000) || null,
      valid_until: d.valid_until, created_by: access.userId, ...money,
    }
    const { data: quote, error: iErr } = await db.from('job_quotes').insert(row).select('*').maybeSingle()
    if (iErr) { if (isMissingJobsSchema(iErr)) return setupNeeded(); throw iErr }

    if (job.status === 'new') {
      await db.from('jobs').update({ status: 'quoting', updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', job.id).eq('status', 'new')
    } else {
      await db.from('jobs').update({ updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', job.id)
    }
    await logJobEvent(db, { companyId, jobId: job.id, quoteId: quote.id, type: 'quote_created', actorId: access.userId, actorName: access.name, summary })
    await audit(req, db, companyId, 'quote_created', `${summary} (job ${settings.job_prefix}-${job.number})`, { job_id: job.id, quote_id: quote.id })
    return json({ quote })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not create the quote.' }, 500)
  }
}
