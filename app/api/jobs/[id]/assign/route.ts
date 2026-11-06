import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { jobsDb, json, logJobEvent, isMissingJobsSchema, setupNeeded } from '@/lib/jobs/server'
import { jobContext, jobStaff, busyFor, describeConflicts, syncJob, notifyPeople, whenText } from '@/lib/jobs/field'
import { cleanAssignees, assigneesOf, findConflicts, jobWindow } from '@/lib/jobs/work'

export const dynamic = 'force-dynamic'

// POST { companyId, assignees: [userId…], force?, check? }
// Put people on a job. Anything they're already doing at that time (another
// job, a booking, a calendar event) comes back as a clash and nothing is
// saved, unless force is set ("assign anyway"). check: true only reports.
// Saving updates the job's Calendar entry (so their booking slots are
// blocked) and tells the people added or taken off.

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { access, job, company, settings, view, tz, label } = c
    const companyId = String(body.companyId)
    if (view.restrict && !view.isManager) return json({ error: 'Only owners and admins can change who’s on a job.' }, 403)
    if (job.status === 'cancelled') return json({ error: 'Reopen the job before assigning people.' }, 409)

    const staff = await jobStaff(db, company)
    const next = cleanAssignees(body.assignees, staff)
    const before = assigneesOf(job)

    // Clashes for the people on it, at the job's time.
    let conflicts: any[] = []
    const w = jobWindow(job.scheduled_start, job.scheduled_end)
    if (next.length && w) {
      const busy = await busyFor(db, companyId, next.map(a => a.id), w[0], w[1], settings.job_prefix)
      conflicts = describeConflicts(findConflicts({ userIds: next.map(a => a.id), start: job.scheduled_start, end: job.scheduled_end, busy, excludeRefId: job.id }), new Map(next.map(a => [a.id, a.name])), tz)
    }
    if (body.check) return json({ conflicts, assignees: next })
    if (conflicts.length && !body.force) return json({ error: 'Some of them are busy then.', conflicts, needsConfirm: true }, 409)

    const now = new Date().toISOString()
    const { data: saved, error } = await db.from('jobs').update({ assignees: next, updated_at: now }).eq('company_id', companyId).eq('id', id).select('*').maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    await syncJob(db, saved, company)

    const added = next.filter(a => !before.some(b => b.id === a.id))
    const removed = before.filter(b => !next.some(a => a.id === b.id))
    if (added.length || removed.length) {
      const parts = [added.length ? `Assigned ${added.map(a => a.name).join(', ')}` : '', removed.length ? `took ${removed.map(a => a.name).join(', ')} off` : ''].filter(Boolean)
      const summary = parts.join('; ').replace(/^took/, 'Took') + (conflicts.length ? ' (despite a clash)' : '')
      await logJobEvent(db, { companyId, jobId: id, type: 'assigned', actorId: access.userId, actorName: access.name, summary, data: { added: added.map(a => a.id), removed: removed.map(a => a.id), forced: !!conflicts.length } })
      await audit(req, db, companyId, 'job_updated', `${label}: ${summary.toLowerCase()}`, { job_id: id })
      const where = saved.address ? ` · ${saved.address}` : ''
      await notifyPeople(db, { companyId, userIds: added.map(a => a.id), exclude: access.userId, type: 'job_assigned', title: `${access.name} put you on ${label}`, body: `${saved.title} · ${whenText(saved.scheduled_start, tz)}${where}`, link: `/admin/jobs/${id}`, origin: req.nextUrl.origin })
      await notifyPeople(db, { companyId, userIds: removed.map(a => a.id), exclude: access.userId, type: 'job_unassigned', title: `You’re off ${label}`, body: `${access.name} took you off ${saved.title}`, link: `/admin/jobs/my`, origin: req.nextUrl.origin })
    }
    return json({ job: saved, conflicts })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save who’s on the job.' }, 500)
  }
}
