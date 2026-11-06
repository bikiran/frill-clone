import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { resolveJobSettings } from '@/lib/jobs/settings'
import { readModules, jobsEnabled } from '@/lib/modules'
import { stripeReady } from '@/lib/booking'
import { jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isJobsManager, loadCompany } from '@/lib/jobs/server'
import { viewFor } from '@/lib/jobs/field'

export const dynamic = 'force-dynamic'

// Jobs & quotes settings.
//   GET   ?companyId   settings, whether the module is on, the price list and templates
//   PATCH { companyId, settings?, jobsModule? }   owners and admins

export async function GET(req: NextRequest) {
  try {
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const company = await loadCompany(db, companyId!)
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    if (company.job_settings === undefined) return setupNeeded()
    const [items, templates] = await Promise.all([
      db.from('job_price_items').select('*').eq('company_id', companyId!).order('sort_order').order('name').limit(500),
      db.from('job_quote_templates').select('id, name, title, intro, terms, items, discount_type, discount_value, deposit_type, deposit_value, updated_at').eq('company_id', companyId!).order('name').limit(200),
    ])
    if (items.error && isMissingJobsSchema(items.error)) return setupNeeded()
    // Field staff limited to their own jobs don't see prices.
    const money = viewFor(access, resolveJobSettings(company.job_settings)).money
    return json({
      settings: resolveJobSettings(company.job_settings),
      modules: readModules(company.modules),
      jobsEnabled: jobsEnabled(company),
      industry: company.industry || null,
      priceItems: money ? (items.data || []) : [],
      templates: money ? (templates.data || []) : [],
      seesMoney: money,
      paymentsReady: stripeReady(company),
      canManage: isJobsManager(access.role),
    })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not load the settings.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(access.role)) return json({ error: 'Only owners and admins can change these settings.' }, 403)
    const company = await loadCompany(db, companyId)
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    if (company.job_settings === undefined) return setupNeeded()
    const patch: any = {}
    const changes: string[] = []
    if (body.settings && typeof body.settings === 'object') {
      patch.job_settings = resolveJobSettings({ ...resolveJobSettings(company.job_settings), ...body.settings })
      changes.push('quote settings')
    }
    if (typeof body.jobsModule === 'boolean') {
      patch.modules = { ...readModules(company.modules), jobs: body.jobsModule }
      changes.push(body.jobsModule ? 'turned Jobs & quotes on' : 'turned Jobs & quotes off')
    }
    if (!changes.length) return json({ error: 'Nothing to save.' }, 400)
    const { data, error } = await db.from('companies').update(patch).eq('id', companyId).select('id, industry, modules, job_settings').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    await audit(req, db, companyId, 'job_updated', `Jobs & quotes: ${changes.join(', ')}`, { settings: true })
    return json({ settings: resolveJobSettings(data?.job_settings), modules: readModules(data?.modules), jobsEnabled: jobsEnabled(data) })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the settings.' }, 500)
  }
}
