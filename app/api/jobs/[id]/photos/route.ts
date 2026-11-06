import { NextRequest } from 'next/server'
import { jobsDb, json, logJobEvent, isUuid, isMissingJobsSchema, setupNeeded, clip } from '@/lib/jobs/server'
import { jobContext, isJobFileUrl } from '@/lib/jobs/field'
import { isPhotoKind, PHOTO_KIND_LABEL } from '@/lib/jobs/work'

export const dynamic = 'force-dynamic'

// Before / after / other photos on a job. The browser uploads each file to
// this workspace's job folder first (/api/storage/put, prefix
// chat-attachments/<company>/jobs/<job>); this records them, and puts a copy
// in the Gallery tagged with the job.
//   POST   { companyId, kind, files: [{ url, name, mime, caption }] }
//   DELETE ?companyId&attachmentId   the uploader, or an owner/admin

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { access, job, label } = c
    const companyId = String(body.companyId)
    const kind = isPhotoKind(body.kind) ? body.kind : 'other'
    const files = (Array.isArray(body.files) ? body.files : []).slice(0, 20)
    // Only files in this job's own folder (never someone else's address).
    const good = files.filter((f: any) => isJobFileUrl(f?.url, companyId, id))
    if (!good.length) return json({ error: 'Upload the photos first.' }, 400)
    const rows = good.map((f: any) => ({
      company_id: companyId, job_id: id, kind, url: f.url, name: clip(f.name, 200) || null, mime: clip(f.mime, 100) || null,
      caption: clip(f.caption, 300) || null, uploaded_by_id: access.userId, uploaded_by_name: access.name,
    }))
    const { data: saved, error } = await db.from('job_attachments').insert(rows).select('id, kind, url, name, mime, caption, uploaded_by_id, uploaded_by_name, created_at')
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    // A copy in the Gallery, tagged with the job (best effort).
    for (const a of saved || []) {
      if (!/^image\/|^video\//.test(String(a.mime || 'image/'))) continue
      try {
        const { data: m } = await db.from('media_items').insert({
          company_id: companyId, title: `${label} · ${PHOTO_KIND_LABEL[kind as 'before']}${a.name ? ` · ${a.name}` : ''}`.slice(0, 200), description: job.title,
          url: a.url, kind: String(a.mime || '').startsWith('video/') ? 'video' : 'image', tags: ['job', label, kind],
          external_source: 'job', external_id: a.id,
        }).select('id').maybeSingle()
        if (m?.id) await db.from('job_attachments').update({ media_item_id: m.id }).eq('id', a.id)
      } catch {}
    }
    const n = saved?.length || 0
    await logJobEvent(db, { companyId, jobId: id, type: 'photos_added', actorId: access.userId, actorName: access.name, summary: `Added ${n} ${PHOTO_KIND_LABEL[kind as 'before'].toLowerCase()} photo${n === 1 ? '' : 's'}`, data: { kind, count: n } })
    await db.from('jobs').update({ updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id)
    return json({ attachments: saved || [] })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not add the photos.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const c = await jobContext(req, db, sp.get('companyId'), id)
    if (c.response) return c.response
    const { access, view } = c
    const companyId = String(sp.get('companyId'))
    const attId = sp.get('attachmentId')
    if (!isUuid(attId)) return json({ error: 'Photo not found.' }, 404)
    const { data: a } = await db.from('job_attachments').select('id, kind, uploaded_by_id, media_item_id').eq('company_id', companyId).eq('job_id', id).eq('id', attId!).maybeSingle()
    if (!a || a.kind === 'signature') return json({ error: 'Photo not found.' }, 404)
    if (a.uploaded_by_id !== access.userId && !view.isManager) return json({ error: 'Only the person who added it, or an owner or admin, can remove it.' }, 403)
    await db.from('job_attachments').delete().eq('company_id', companyId).eq('id', attId!)
    if (a.media_item_id) { try { await db.from('media_items').delete().eq('company_id', companyId).eq('id', a.media_item_id) } catch {} }
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not remove the photo.' }, 500)
  }
}
