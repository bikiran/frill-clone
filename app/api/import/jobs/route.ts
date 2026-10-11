import { NextRequest, NextResponse, after } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { adminDb, drive, missingTable } from '@/lib/import/server'
import { ACTIVE, filterPayload, sanitizePayload, includeOf, publicJob, zeroCounts } from '@/lib/import/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** GET /api/import/jobs?companyId= — this workspace's recent imports. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = adminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('import_jobs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20)
  if (error) {
    if (missingTable(error)) return NextResponse.json({ jobs: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ jobs: (data || []).map(publicJob) })
}

/**
 * POST /api/import/jobs
 * { companyId, source, apiKey?, url?, payload? (csv), label?, include, publishArticles }
 *
 * Starts an import in the background and returns the job straight away. It's
 * run right after this response (after()), then by the minute cron until done,
 * so closing the page doesn't stop it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { companyId, source } = body || {}
  const db = adminDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!['csv', 'canny', 'zendesk'].includes(source)) return NextResponse.json({ error: 'Pick a source to import from.' }, { status: 400 })

  const { data: active, error: activeErr } = await db.from('import_jobs').select('id').eq('company_id', companyId).in('status', ACTIVE).limit(1)
  if (activeErr) {
    if (missingTable(activeErr)) return NextResponse.json({ error: 'Imports need a database update first (COLVY_V350_IMPORT_JOBS.sql).' }, { status: 503 })
    return NextResponse.json({ error: activeErr.message }, { status: 500 })
  }
  if (active?.length) return NextResponse.json({ error: 'An import is already running. Wait for it to finish, or stop it first.' }, { status: 409 })

  const include = includeOf(body)
  const label = String(body.label || '').slice(0, 80) || null
  let byName: string | null = null
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data } = await db.auth.getUser(token)
    const u = data?.user
    byName = u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || null
  } catch {}

  const row: any = {
    company_id: companyId, source, status: 'queued', counts: zeroCounts(), errors: [],
    created_by: access.userId || null, created_by_name: byName,
    options: { include, publishArticles: body.publishArticles !== false, label, ...(source === 'canny' ? { apiKey: String(body.apiKey || '').trim() } : {}), ...(source === 'zendesk' ? { url: String(body.url || '').trim() } : {}) },
  }
  if (source === 'csv') {
    const payload = filterPayload(sanitizePayload(body.payload), include)
    const total = payload.ideas.length + payload.announcements.length + payload.articles.length
    if (!total) return NextResponse.json({ error: 'Nothing to import — no rows had a title.' }, { status: 400 })
    Object.assign(row, { stage: 'write', payload, total, cursor: { phase: 'ideas', i: 0 } })
  } else {
    if (source === 'canny' && !row.options.apiKey) return NextResponse.json({ error: 'Paste your Canny API key.' }, { status: 400 })
    if (source === 'zendesk' && !row.options.url) return NextResponse.json({ error: 'Paste your help centre address.' }, { status: 400 })
    Object.assign(row, { stage: 'fetch', cursor: {} })
  }

  const { data: job, error } = await db.from('import_jobs').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: missingTable(error) ? 'Imports need a database update first (COLVY_V350_IMPORT_JOBS.sql).' : error.message }, { status: 500 })

  after(async () => { try { await drive(adminDb(), job.id) } catch {} })
  return NextResponse.json({ job: publicJob(job) })
}
