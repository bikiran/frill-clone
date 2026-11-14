import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { canMoveJob, isJobStatus, JOB_STATUS_LABEL, type JobStatus } from '@/lib/jobs/status'
import { companyBase, stripeReady } from '@/lib/booking'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, isJobsManager,
  logJobEvent, emitJobEvent, loadCompany, companySettings, companyTz, todayIn, clip, isoOrNull,
} from '@/lib/jobs/server'
import { viewFor, callerSeesJob, busyFor, describeConflicts, syncJob, closeOpenEntries, notifyPeople, whenText } from '@/lib/jobs/field'
import { assigneesOf, findConflicts, jobWindow, timeTotals } from '@/lib/jobs/work'

export const dynamic = 'force-dynamic'

// One job.
//   GET    ?companyId   the job, who it's for, where it came from, its quotes and activity,
//                       and (Phase 2) its people, clashes, checklist, photos and time
//   PATCH  { companyId, ... }   edit details, or move its status (compare-and-set);
//                       keeps its Calendar entry in step and tells the people on it
//   DELETE ?companyId   owners and admins, and only while no quote has gone out

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!isUuid(id)) {
      const access = await jobsAccess(req, db, companyId)
      return access.ok ? json({ error: 'Job not found.' }, 404) : access.response
    }

    // Everything that doesn't depend on the job row is asked for at the same
    // time as the access check; nothing is sent back unless it says yes.
    const ok = isUuid(companyId)
    const none = Promise.resolve({ data: null, error: null })
    const [access, jobRes, quotes, events, company, checklist, attachments, entries, invoices] = await Promise.all([
      jobsAccess(req, db, companyId),
      ok ? db.from('jobs').select('*').eq('company_id', companyId!).eq('id', id).maybeSingle() : none,
      ok ? db.from('job_quotes').select('id, number, revision, status, title, total_cents, tax_cents, deposit_cents, deposit_status, valid_until, public_token, sent_at, sent_via, viewed_at, accepted_at, declined_at, decided_name, decided_note, decided_by_type, created_at, updated_at')
        .eq('company_id', companyId!).eq('job_id', id).order('created_at', { ascending: false }) : none,
      ok ? db.from('job_events').select('id, quote_id, type, actor_type, actor_id, actor_name, summary, data, created_at').eq('company_id', companyId!).eq('job_id', id).order('created_at', { ascending: false }).limit(150) : none,
      ok ? loadCompany(db, companyId!) : Promise.resolve(null),
      ok ? db.from('job_checklist_items').select('id, text, done, done_by_id, done_by_name, done_at, sort_order').eq('company_id', companyId!).eq('job_id', id).order('sort_order').limit(200) : none,
      ok ? db.from('job_attachments').select('id, kind, url, name, mime, caption, uploaded_by_id, uploaded_by_name, created_at').eq('company_id', companyId!).eq('job_id', id).order('created_at').limit(300) : none,
      ok ? db.from('job_time_entries').select('id, user_id, user_name, started_at, ended_at, seconds').eq('company_id', companyId!).eq('job_id', id).order('started_at', { ascending: false }).limit(300) : none,
      // Invoices (V434); none yet before that migration.
      ok ? db.from('job_invoices').select('id, quote_id, number, status, title, total_cents, credit_cents, paid_cents, issue_date, due_date, public_token, sent_at, sent_via, viewed_at, paid_at, voided_at, reminders, reminder_count, created_at, updated_at')
        .eq('company_id', companyId!).eq('job_id', id).order('created_at', { ascending: false }) : none,
    ]) as any[]
    if (!access.ok) return access.response
    const { data: job, error } = jobRes
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    const settings = companySettings(company)
    const view = viewFor(access, settings)
    if (!job || !callerSeesJob(view, job)) return json({ error: 'Job not found.' }, 404)

    const [contact, conversation, booking, form] = await Promise.all([
      job.contact_id ? db.from('contacts').select('id, name, email, phone, address').eq('company_id', companyId!).eq('id', job.contact_id).maybeSingle() : none,
      job.conversation_id ? db.from('conversations').select('id, channel, subject, status').eq('company_id', companyId!).eq('id', job.conversation_id).maybeSingle() : none,
      job.booking_id ? db.from('bookings').select('id, service_name, starts_at, ends_at, status').eq('company_id', companyId!).eq('id', job.booking_id).maybeSingle() : none,
      job.form_id ? db.from('forms').select('id, title, company_id').eq('id', job.form_id).maybeSingle() : none,
    ])
    const tz = companyTz(company)
    // Clashes for the people on it, live (bookings and other jobs change).
    let conflicts: any[] = []
    const people = assigneesOf(job)
    const w = jobWindow(job.scheduled_start, job.scheduled_end)
    if (people.length && w && job.status !== 'completed' && job.status !== 'cancelled') {
      try {
        const busy = await busyFor(db, companyId!, people.map(p => p.id), w[0], w[1], settings.job_prefix)
        conflicts = describeConflicts(findConflicts({ userIds: people.map(p => p.id), start: job.scheduled_start, end: job.scheduled_end, busy, excludeRefId: job.id }), new Map(people.map(p => [p.id, p.name])), tz)
      } catch {}
    }
    const time = timeTotals(entries.data || [])
    return json({
      job: view.money ? job : { ...job, value_cents: null },
      contact: contact.data || null,
      conversation: conversation.data || null,
      booking: booking.data || null,
      form: form.data && (form.data as any).company_id === companyId ? { id: (form.data as any).id, title: (form.data as any).title } : null,
      quotes: view.money ? (quotes.data || []) : [],
      invoices: view.money ? (invoices.data || []) : [],
      invoicesReady: !invoices.error,
      today: todayIn(tz),
      events: (events.data || []).filter((e: any) => view.money || !/^(quote|invoice)/.test(String(e.type || '')) && e.type !== 'deposit_paid' && e.type !== 'deposit_requested'),
      checklist: checklist.data || [],
      attachments: attachments.data || [],
      time: { entries: entries.data || [], totalSeconds: time.totalSeconds, byUser: time.byUser, running: time.runningUserIds, mineRunning: time.runningUserIds.includes(view.userId) },
      conflicts,
      me: view.userId, seesMoney: view.money, restricted: view.restrict && !view.isManager,
      settings,
      timezone: tz,
      quoteBase: companyBase(company).base,
      paymentsReady: stripeReady(company),
      canManage: isJobsManager(access.role),
    })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not load the job.' }, 500)
  }
}

const DETAIL_LABEL: Record<string, string> = {
  title: 'title', description: 'description', address: 'address', scheduled_start: 'start time', scheduled_end: 'finish time', contact_id: 'customer',
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    // A drag on the board lands here: the access check, the job and the
    // company are read together (nothing changes unless access says yes).
    const ok = isUuid(companyId) && isUuid(id)
    const [access, jobRes, company] = await Promise.all([
      jobsAccess(req, db, companyId),
      ok ? db.from('jobs').select('*').eq('company_id', companyId).eq('id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ok ? loadCompany(db, companyId) : Promise.resolve(null),
    ])
    if (!access.ok) return access.response
    if (!isUuid(id)) return json({ error: 'Job not found.' }, 404)

    const { data: job, error } = jobRes as any
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    const settings = companySettings(company)
    const view = viewFor(access, settings)
    if (!job || !callerSeesJob(view, job)) return json({ error: 'Job not found.' }, 404)
    const now = new Date().toISOString()
    const pf = settings.job_prefix
    const label = `${pf}-${job.number}`
    const tz = companyTz(company)

    // ── Status: only the allowed moves, and only from the status the caller saw ──
    if (body.status !== undefined) {
      const to = String(body.status)
      const from = isJobStatus(body.expectedStatus) ? body.expectedStatus : job.status
      if (!isJobStatus(to)) return json({ error: 'Unknown status.' }, 400)
      if (from !== job.status) return json({ error: 'Someone else just changed this job. Here’s the latest.', job, conflict: true }, 409)
      if (to === job.status) return json({ job })
      if (!canMoveJob(from, to)) return json({ error: `A job can’t go from ${JOB_STATUS_LABEL[from as JobStatus]} to ${JOB_STATUS_LABEL[to as JobStatus]}.` }, 400)
      const patch: any = { status: to, updated_at: now }
      if (to === 'completed' || to === 'cancelled') patch.closed_at = now
      else patch.closed_at = null
      if (to === 'cancelled') patch.cancel_reason = clip(body.cancelReason, 500) || null
      if (from === 'cancelled') patch.cancel_reason = null
      if (to === 'in_progress' && !job.started_at) patch.started_at = now
      if (to === 'completed') {
        if (settings.require_signature && !job.signature) return json({ error: 'Get the customer’s signature before completing this job.', needsSignature: true }, 409)
        patch.completed_at = now
      }
      if (from === 'completed') patch.completed_at = null
      if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) patch.sort_order = body.sortOrder
      const { data: moved, error: mErr } = await db.from('jobs').update(patch).eq('company_id', companyId).eq('id', id).eq('status', from).select('*')
      if (mErr) throw mErr
      if (!moved?.length) {
        const { data: latest } = await db.from('jobs').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
        return json({ error: 'Someone else just changed this job. Here’s the latest.', job: latest, conflict: true }, 409)
      }
      // Finishing or cancelling stops anyone's running timer; the Calendar entry follows.
      if (to === 'completed' || to === 'cancelled') await closeOpenEntries(db, moved[0])
      await syncJob(db, moved[0], company)
      if (to === 'completed' && job.created_by && job.created_by !== access.userId) {
        await notifyPeople(db, { companyId, userIds: [job.created_by], exclude: access.userId, type: 'job_completed', title: `${access.name} completed ${label}`, body: job.title, link: `/admin/jobs/${id}`, origin: req.nextUrl.origin })
      }
      const summary = `Moved from ${JOB_STATUS_LABEL[from as JobStatus]} to ${JOB_STATUS_LABEL[to as JobStatus]}${to === 'cancelled' && patch.cancel_reason ? `: ${patch.cancel_reason}` : ''}`
      await logJobEvent(db, { companyId, jobId: id, type: 'status_changed', actorId: access.userId, actorName: access.name, summary, data: { from, to } })
      await audit(req, db, companyId, 'job_status_changed', `${label} ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`, { job_id: id, from, to })
      emitJobEvent(companyId, 'job.status_changed', { title: `${label} is now ${JOB_STATUS_LABEL[to as JobStatus]}`, summary: job.title, jobId: id, fields: { From: JOB_STATUS_LABEL[from as JobStatus], To: JOB_STATUS_LABEL[to as JobStatus] }, dedupeKey: `job.status:${id}:${to}:${now}` }, db)
      return json({ job: moved[0] })
    }

    // ── Board order only (dragging within a column) ──
    if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder) && Object.keys(body).every(k => ['companyId', 'sortOrder'].includes(k))) {
      const { data: j } = await db.from('jobs').update({ sort_order: body.sortOrder }).eq('company_id', companyId).eq('id', id).select('*').maybeSingle()
      return json({ job: j || job })
    }

    // ── Details ──
    const patch: Record<string, any> = {}
    if (body.title !== undefined) { const t = clip(body.title, 160); if (!t) return json({ error: 'Give the job a title.' }, 400); patch.title = t }
    if (body.description !== undefined) patch.description = clip(body.description, 8000) || null
    if (body.address !== undefined) patch.address = clip(body.address, 300) || null
    if (body.scheduledStart !== undefined) patch.scheduled_start = isoOrNull(body.scheduledStart)
    if (body.scheduledEnd !== undefined) patch.scheduled_end = isoOrNull(body.scheduledEnd)
    if (body.contactId !== undefined) {
      if (body.contactId === null || body.contactId === '') patch.contact_id = null
      else {
        if (!isUuid(body.contactId)) return json({ error: 'Unknown customer.' }, 400)
        const { data: c } = await db.from('contacts').select('id').eq('company_id', companyId).eq('id', body.contactId).maybeSingle()
        if (!c) return json({ error: 'That customer isn’t in this workspace.' }, 404)
        patch.contact_id = c.id
      }
    }
    const start = patch.scheduled_start !== undefined ? patch.scheduled_start : job.scheduled_start
    const end = patch.scheduled_end !== undefined ? patch.scheduled_end : job.scheduled_end
    if (start && end && Date.parse(end) < Date.parse(start)) return json({ error: 'The job can’t finish before it starts.' }, 400)
    const changed = Object.keys(patch).filter(k => String(patch[k] ?? '') !== String(job[k] ?? ''))
    if (!changed.length) return json({ job })
    patch.updated_at = now
    const { data: updated, error: uErr } = await db.from('jobs').update(patch).eq('company_id', companyId).eq('id', id).select('*').maybeSingle()
    if (uErr) throw uErr
    // The Calendar entry follows; the people on it hear about a new time or place.
    let warnings: any[] = []
    if (changed.some(k => ['title', 'address', 'scheduled_start', 'scheduled_end', 'contact_id'].includes(k))) await syncJob(db, updated, company)
    const people = assigneesOf(updated)
    if (people.length && changed.some(k => ['scheduled_start', 'scheduled_end', 'address'].includes(k))) {
      const moved = changed.includes('scheduled_start') || changed.includes('scheduled_end')
      await notifyPeople(db, {
        companyId, userIds: people.map(p => p.id), exclude: access.userId, type: 'job_changed',
        title: moved ? `${label} is now ${whenText(updated.scheduled_start, tz)}` : `${label} has a new address`,
        body: `${updated.title}${updated.address ? ` · ${updated.address}` : ''}`, link: `/admin/jobs/${id}`, origin: req.nextUrl.origin,
      })
      const w = jobWindow(updated.scheduled_start, updated.scheduled_end)
      if (moved && w) {
        try {
          const busy = await busyFor(db, companyId, people.map(p => p.id), w[0], w[1], pf)
          warnings = describeConflicts(findConflicts({ userIds: people.map(p => p.id), start: updated.scheduled_start, end: updated.scheduled_end, busy, excludeRefId: id }), new Map(people.map(p => [p.id, p.name])), tz)
        } catch {}
      }
    }
    const what = changed.map(k => DETAIL_LABEL[k] || k)
    const summary = `Updated the ${what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0]}`
    await logJobEvent(db, { companyId, jobId: id, type: 'updated', actorId: access.userId, actorName: access.name, summary, data: { fields: changed } })
    await audit(req, db, companyId, 'job_updated', `${label}: ${summary.toLowerCase()}`, { job_id: id, fields: changed })
    return json({ job: updated, warnings })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the job.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isJobsManager(access.role)) return json({ error: 'Only owners and admins can delete jobs. You can cancel it instead.' }, 403)
    if (!isUuid(id)) return json({ error: 'Job not found.' }, 404)
    const { data: job } = await db.from('jobs').select('id, number, title, calendar_event_id').eq('company_id', companyId!).eq('id', id).maybeSingle()
    if (!job) return json({ error: 'Job not found.' }, 404)
    // A quote the customer has seen stays on record: cancel the job instead.
    const { data: out } = await db.from('job_quotes').select('id').eq('company_id', companyId!).eq('job_id', id).neq('status', 'draft').limit(1)
    if (out?.length) return json({ error: 'A quote for this job has been sent, so it stays on record. Cancel the job instead.' }, 409)
    // So does an invoice (a tax invoice is a business record).
    const { data: billed, error: bErr } = await db.from('job_invoices').select('id').eq('company_id', companyId!).eq('job_id', id).neq('status', 'draft').limit(1)
    if (!bErr && billed?.length) return json({ error: 'An invoice for this job has been sent, so it stays on record. Cancel the job instead.' }, 409)
    const { error } = await db.from('jobs').delete().eq('company_id', companyId!).eq('id', id)
    if (error) throw error
    if (job.calendar_event_id) { try { await db.from('calendar_events').update({ status: 'cancelled' }).eq('company_id', companyId!).eq('id', job.calendar_event_id) } catch {} }
    const pf = companySettings(await loadCompany(db, companyId!)).job_prefix
    await audit(req, db, companyId!, 'job_updated', `Deleted job ${pf}-${job.number}: ${job.title}`, { job_id: id, deleted: true })
    return json({ ok: true })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not delete the job.' }, 500)
  }
}
