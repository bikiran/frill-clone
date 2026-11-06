import { NextRequest } from 'next/server'
import { jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, isJobsManager, clip } from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// Team notes on a job, kept in its activity timeline (job_events, type 'note').
//   POST   { companyId, text }      add a note
//   DELETE ?companyId&noteId        remove your own note (owners and admins: any)

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const text = clip(body.text, 4000)
    if (!text) return json({ error: 'Write a note first.' }, 400)
    if (!isUuid(id)) return json({ error: 'Job not found.' }, 404)
    const { data: job, error } = await db.from('jobs').select('id').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!job) return json({ error: 'Job not found.' }, 404)
    const { data: note, error: iErr } = await db.from('job_events').insert({
      company_id: companyId, job_id: id, type: 'note', actor_type: 'staff', actor_id: access.userId, actor_name: access.name,
      summary: text.slice(0, 300), data: { text },
    }).select('id, quote_id, type, actor_type, actor_name, summary, data, created_at').maybeSingle()
    if (iErr) throw iErr
    await db.from('jobs').update({ updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id)
    return json({ note })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not add the note.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const noteId = sp.get('noteId')
    if (!isUuid(id) || !isUuid(noteId)) return json({ error: 'Note not found.' }, 404)
    const { data: note } = await db.from('job_events').select('id, actor_id').eq('company_id', companyId!).eq('job_id', id).eq('id', noteId!).eq('type', 'note').maybeSingle()
    if (!note) return json({ error: 'Note not found.' }, 404)
    if (note.actor_id !== access.userId && !isJobsManager(access.role)) return json({ error: 'You can only delete your own notes.' }, 403)
    await db.from('job_events').delete().eq('company_id', companyId!).eq('id', noteId!)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the note.' }, 500)
  }
}
