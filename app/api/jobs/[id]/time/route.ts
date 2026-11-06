import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { jobsDb, json, logJobEvent, emitJobEvent, isMissingJobsSchema, setupNeeded } from '@/lib/jobs/server'
import { jobContext, closeOpenEntries, syncJob, notifyPeople } from '@/lib/jobs/field'
import { assigneesOf, isAssigned, timeTotals, fmtDuration } from '@/lib/jobs/work'
import { canMoveJob } from '@/lib/jobs/status'

export const dynamic = 'force-dynamic'

// POST { companyId, action: 'start' | 'pause' | 'finish' }
//   start   your timer on the job (one running timer per person, enforced by
//           the database); a New or Scheduled job moves to In progress, and
//           you're put on the job if you weren't
//   pause   stop your timer
//   finish  stop everyone's timer and complete the job (asks for the
//           customer's signature first when the business requires it)

type Ctx = { params: Promise<{ id: string }> }

async function state(db: any, companyId: string, id: string, me: string) {
  const [{ data: job }, { data: entries }] = await Promise.all([
    db.from('jobs').select('*').eq('company_id', companyId).eq('id', id).maybeSingle(),
    db.from('job_time_entries').select('id, user_id, user_name, started_at, ended_at, seconds').eq('company_id', companyId).eq('job_id', id).order('started_at', { ascending: false }).limit(300),
  ])
  const t = timeTotals(entries || [])
  return { job, time: { entries: entries || [], totalSeconds: t.totalSeconds, byUser: t.byUser, running: t.runningUserIds, mineRunning: t.runningUserIds.includes(me) } }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { access, job, company, settings, label } = c
    const companyId = String(body.companyId)
    const now = new Date().toISOString()
    const action = String(body.action)

    if (action === 'start') {
      if (job.status === 'cancelled' || job.status === 'completed') return json({ error: 'Reopen the job before starting work on it.' }, 409)
      const { data: mine } = await db.from('job_time_entries').select('id').eq('company_id', companyId).eq('job_id', id).eq('user_id', access.userId).limit(1)
      const { error } = await db.from('job_time_entries').insert({ company_id: companyId, job_id: id, user_id: access.userId, user_name: access.name, started_at: now })
      if (error && String(error.code) !== '23505') { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
      if (!error) {
        const patch: any = { updated_at: now }
        if (!job.started_at) patch.started_at = now
        if (!isAssigned(job, access.userId)) patch.assignees = [...assigneesOf(job), { id: access.userId, name: access.name }]
        await db.from('jobs').update(patch).eq('company_id', companyId).eq('id', id)
        if (job.status === 'new' || job.status === 'scheduled') {
          await db.from('jobs').update({ status: 'in_progress', updated_at: now }).eq('company_id', companyId).eq('id', id).eq('status', job.status)
        }
        await logJobEvent(db, { companyId, jobId: id, type: 'work_started', actorId: access.userId, actorName: access.name, summary: mine?.length ? 'Back on the job' : 'Started work' })
        if (patch.assignees) await syncJob(db, { ...job, ...patch }, company)
      }
      return json(await state(db, companyId, id, access.userId))
    }

    if (action === 'pause') {
      const { data: open } = await db.from('job_time_entries').select('id').eq('company_id', companyId).eq('job_id', id).eq('user_id', access.userId).is('ended_at', null).limit(1)
      if (!open?.length) return json({ error: 'Your timer isn’t running on this job.' }, 409)
      const secs = await closeOpenEntries(db, job, access.userId)
      await logJobEvent(db, { companyId, jobId: id, type: 'work_paused', actorId: access.userId, actorName: access.name, summary: `Paused after ${fmtDuration(secs)}` })
      return json(await state(db, companyId, id, access.userId))
    }

    if (action === 'finish') {
      if (job.status === 'cancelled') return json({ error: 'This job is cancelled.' }, 409)
      if (job.status === 'completed') return json(await state(db, companyId, id, access.userId))
      if (settings.require_signature && !job.signature) return json({ error: 'Get the customer’s signature before finishing this job.', needsSignature: true }, 409)
      if (!canMoveJob(job.status, 'completed')) return json({ error: `Move the job to Scheduled or In progress before finishing it.` }, 409)
      await closeOpenEntries(db, job)
      const { data: done } = await db.from('jobs').update({ status: 'completed', completed_at: now, closed_at: now, updated_at: now })
        .eq('company_id', companyId).eq('id', id).eq('status', job.status).select('*')
      if (!done?.length) return json({ error: 'Someone else just changed this job. Refresh to see it.' }, 409)
      await syncJob(db, done[0], company)
      const s = await state(db, companyId, id, access.userId)
      const summary = `Finished the job (${fmtDuration(s.time.totalSeconds)} on the clock)`
      await logJobEvent(db, { companyId, jobId: id, type: 'completed', actorId: access.userId, actorName: access.name, summary, data: { seconds: s.time.totalSeconds } })
      await audit(req, db, companyId, 'job_status_changed', `${label} completed by ${access.name}`, { job_id: id, from: job.status, to: 'completed' })
      emitJobEvent(companyId, 'job.status_changed', { title: `${label} is now Completed`, summary: job.title, jobId: id, fields: { From: job.status, To: 'completed', Time: fmtDuration(s.time.totalSeconds) }, dedupeKey: `job.status:${id}:completed:${now}` }, db)
      if (job.created_by && job.created_by !== access.userId) {
        await notifyPeople(db, { companyId, userIds: [job.created_by], exclude: access.userId, type: 'job_completed', title: `${access.name} finished ${label}`, body: job.title, link: `/admin/jobs/${id}`, origin: req.nextUrl.origin })
      }
      return json(s)
    }
    return json({ error: 'Unknown action.' }, 400)
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'That didn’t work. Please try again.' }, 500)
  }
}
