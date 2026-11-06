import { NextRequest } from 'next/server'
import { jobsDb, json, logJobEvent, isMissingJobsSchema, setupNeeded, clip } from '@/lib/jobs/server'
import { jobContext, isJobFileUrl } from '@/lib/jobs/field'

export const dynamic = 'force-dynamic'

// POST { companyId, name, url } — the customer's sign-off, drawn on the
// team member's screen. The browser uploads the drawing (PNG) to this job's
// folder first; signing again replaces it.

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { access, job } = c
    const companyId = String(body.companyId)
    const name = clip(body.name, 120).replace(/[\p{Cc}\p{Cf}]/gu, '')
    if (name.length < 2) return json({ error: 'Type the name of the person signing.' }, 400)
    const url = String(body.url || '')
    if (!isJobFileUrl(url, companyId, id)) return json({ error: 'Save the signature first.' }, 400)
    if (job.status === 'cancelled') return json({ error: 'This job is cancelled.' }, 409)
    const now = new Date().toISOString()
    const { data: att, error } = await db.from('job_attachments').insert({
      company_id: companyId, job_id: id, kind: 'signature', url, name: `Signature — ${name}`, mime: 'image/png',
      uploaded_by_id: access.userId, uploaded_by_name: access.name,
    }).select('id').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    const signature = { name, url, signed_at: now, attachment_id: att?.id || null, collected_by: access.name, collected_by_id: access.userId }
    const { data: saved } = await db.from('jobs').update({ signature, updated_at: now }).eq('company_id', companyId).eq('id', id).select('*').maybeSingle()
    await logJobEvent(db, { companyId, jobId: id, type: 'signed', actorId: access.userId, actorName: access.name, summary: `Signed off by ${name}`, data: { name } })
    return json({ job: saved, signature })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the signature.' }, 500)
  }
}
