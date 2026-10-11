import { NextRequest, NextResponse, after } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { adminDb, drive } from '@/lib/import/server'
import { ACTIVE, publicJob, stripSecrets, undo } from '@/lib/import/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function load(req: NextRequest, id: string, companyId: string | null) {
  const db = adminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return { db, job: null, denied: true }
  const { data: job } = await db.from('import_jobs').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return { db, job, denied: false }
}

/**
 * GET /api/import/jobs/:id?companyId=&drive=1
 * The job's progress. With drive=1 (the open import page polling), a job that
 * is waiting for the next worker tick is picked up right away instead.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sp = req.nextUrl.searchParams
  const { job, denied } = await load(req, id, sp.get('companyId'))
  if (denied) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sp.get('drive') === '1' && job.status === 'queued') {
    after(async () => { try { await drive(adminDb(), job.id) } catch {} })
  }
  return NextResponse.json({ job: publicJob(job) })
}

/** POST /api/import/jobs/:id  { companyId, action: 'cancel' | 'undo' } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { db, job, denied } = await load(req, id, body?.companyId || null)
  if (denied) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'cancel') {
    if (!ACTIVE.includes(job.status)) return NextResponse.json({ job: publicJob(job) })
    const { data } = await db.from('import_jobs').update({
      status: 'cancelled', payload: null, options: stripSecrets(job.options), finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id).in('status', ACTIVE).select('*').maybeSingle()
    return NextResponse.json({ job: publicJob(data || job) })
  }

  if (body.action === 'undo') {
    if (ACTIVE.includes(job.status)) return NextResponse.json({ error: 'Stop the import before undoing it.' }, { status: 409 })
    if (job.status === 'undone') return NextResponse.json({ job: publicJob(job) })
    try {
      await undo(db, job)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Couldn’t undo the import.' }, { status: 500 })
    }
    // A worker stopped mid-batch can still land that last batch: sweep again shortly.
    if (job.status === 'cancelled') {
      after(async () => {
        await new Promise(r => setTimeout(r, 20_000))
        const d = adminDb()
        for (const t of ['comments', 'ideas', 'announcements', 'help_articles']) await d.from(t).delete().eq('company_id', job.company_id).eq('import_job_id', job.id)
      })
    }
    const { data } = await db.from('import_jobs').select('*').eq('id', id).maybeSingle()
    return NextResponse.json({ job: publicJob(data || job) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
