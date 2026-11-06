// Server helpers for Jobs Phase 2 (doing the work): the team, everyone's busy
// time (for clash checks), the job's entry on the team Calendar, notifying
// the people on a job, and the "field staff see only their own jobs" check.
// The pure decisions live in lib/jobs/work.ts.

import { loadStaff } from '@/lib/booking'
import { internalHeaders } from '@/lib/internal-call'
import { jobWindow, assigneesOf, canSeeJob, canSeeMoney, jobFileUrlOk, type Busy } from '@/lib/jobs/work'
import { isJobsManager, companySettings, jobsAccess, isUuid, json, setupNeeded, isMissingJobsSchema, loadCompany, companyTz, type JobsCaller } from '@/lib/jobs/server'
import type { JobSettings } from '@/lib/jobs/settings'
import { r2PublicBase } from '@/lib/r2'

export type StaffMember = { id: string; name: string; avatar_url?: string | null; email?: string | null; phone?: string | null }

/** The people a job can be assigned to: the owner and active staff (auth user ids). */
export async function jobStaff(db: any, company: any): Promise<StaffMember[]> {
  return (await loadStaff(db, company)) as StaffMember[]
}

/** What the caller may see on jobs under the business's settings. */
export function viewFor(access: JobsCaller, settings: JobSettings) {
  const isManager = isJobsManager(String(access.role || ''))
  const restrict = !!settings.restrict_to_assigned
  return { isManager, restrict, money: canSeeMoney({ isManager, restrict }), userId: String(access.userId || '') }
}
export const callerSeesJob = (view: ReturnType<typeof viewFor>, job: any) =>
  canSeeJob({ isManager: view.isManager, userId: view.userId, restrict: view.restrict, job })

const fmtRange = (from: number, until: number, tz: string) => {
  try {
    const d = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(from))
    const t = (ms: number) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms)).replace(' ', '').toLowerCase()
    return `${d}, ${t(from)}–${t(until)}`
  } catch { return '' }
}

/**
 * Everything the given people are already doing between from and to: other
 * jobs they're on, bookings with them, and calendar events assigned to them
 * (deliveries, appointments). Jobs' and bookings' own calendar rows are
 * skipped, since their tables already count.
 */
export async function busyFor(db: any, companyId: string, userIds: string[], fromMs: number, toMs: number, prefix = 'J'): Promise<Busy[]> {
  if (!userIds.length) return []
  const ids = new Set(userIds)
  const out: Busy[] = []
  const fromIso = new Date(fromMs).toISOString(), toIso = new Date(toMs).toISOString()
  const dayBefore = new Date(fromMs - 24 * 3600_000).toISOString()
  const [jobs, bookings, events] = await Promise.all([
    db.from('jobs').select('id, number, title, status, scheduled_start, scheduled_end, assignees')
      .eq('company_id', companyId).neq('status', 'cancelled').gte('scheduled_start', dayBefore).lt('scheduled_start', toIso).limit(500),
    db.from('bookings').select('id, staff_id, service_name, customer_name, busy_from, busy_until, status, hold_expires_at')
      .eq('company_id', companyId).in('status', ['pending', 'confirmed']).lt('busy_from', toIso).gt('busy_until', fromIso).limit(500),
    db.from('calendar_events').select('id, title, event_type, starts_at, ends_at, is_all_day, status, assigned_to_id, assignees, external_source')
      .eq('company_id', companyId).neq('status', 'cancelled').gte('starts_at', dayBefore).lt('starts_at', toIso).limit(500),
  ])
  for (const j of jobs.data || []) {
    if (j.status === 'completed') continue
    const w = jobWindow(j.scheduled_start, j.scheduled_end)
    if (!w || w[1] <= fromMs) continue
    for (const a of assigneesOf(j)) if (ids.has(a.id)) out.push({ userId: a.id, from: w[0], until: w[1], kind: 'job', label: `${prefix}-${j.number} ${j.title}`, refId: j.id })
  }
  const nowIso = new Date().toISOString()
  for (const b of bookings.data || []) {
    if (!b.staff_id || !ids.has(b.staff_id)) continue
    if (b.status === 'pending' && !(b.hold_expires_at && b.hold_expires_at > nowIso)) continue
    out.push({ userId: b.staff_id, from: Date.parse(b.busy_from), until: Date.parse(b.busy_until), kind: 'booking', label: `Booking: ${b.service_name || 'Booking'}${b.customer_name ? ` with ${b.customer_name}` : ''}`, refId: b.id })
  }
  for (const e of events.data || []) {
    if (e.is_all_day || !e.starts_at || e.external_source === 'booking' || e.external_source === 'job') continue
    const from = Date.parse(e.starts_at)
    const until = e.ends_at ? Date.parse(e.ends_at) : from + 30 * 60_000
    if (until <= fromMs) continue
    const who = new Set<string>()
    if (e.assigned_to_id) who.add(e.assigned_to_id)
    for (const a of Array.isArray(e.assignees) ? e.assignees : []) if (a?.id) who.add(a.id)
    for (const id of who) if (ids.has(id)) out.push({ userId: id, from, until, kind: 'event', label: e.title || 'Calendar event', refId: e.id })
  }
  return out
}

/** Clashes as the API returns them: who, what, when (in the business's time). */
export function describeConflicts(conflicts: Busy[], names: Map<string, string>, tz: string) {
  return conflicts.map(c => ({ userId: c.userId, name: names.get(c.userId) || 'Team member', kind: c.kind, label: c.label, when: fmtRange(c.from, c.until, tz), from: new Date(c.from).toISOString(), until: new Date(c.until).toISOString() }))
}

/**
 * Keep the job's row on the team Calendar in step: there (with its people)
 * while it's scheduled, cancelled when the job is cancelled or unscheduled.
 * The row blocks those people's online booking slots like any assigned event.
 * Best effort: a calendar hiccup never stops the job being saved.
 */
export async function syncJobCalendar(db: any, job: any, company: any, contactName?: string | null): Promise<string | null> {
  try {
    const pf = companySettings(company).job_prefix
    const w = jobWindow(job.scheduled_start, job.scheduled_end)
    const live = !!w && job.status !== 'cancelled'
    if (!live) {
      if (job.calendar_event_id) await db.from('calendar_events').update({ status: 'cancelled' }).eq('company_id', job.company_id).eq('id', job.calendar_event_id)
      return job.calendar_event_id || null
    }
    const people = assigneesOf(job)
    const ev: any = {
      company_id: job.company_id, event_type: 'appointment',
      title: `${pf}-${job.number} · ${job.title}${contactName ? ` — ${contactName}` : ''}`.slice(0, 200),
      starts_at: new Date(w![0]).toISOString(), ends_at: new Date(w![1]).toISOString(), is_all_day: false,
      status: job.status === 'completed' ? 'completed' : 'confirmed',
      address: job.address || null, contact_id: job.contact_id || null, conversation_id: job.conversation_id || null,
      notes: `Job ${pf}-${job.number}. Change it on the job (Jobs → ${pf}-${job.number}); edits here are replaced.`,
      external_source: 'job', external_id: job.id,
      assigned_to_id: people[0]?.id || null, assigned_to_name: people[0]?.name || null, assignees: people,
      notify_customer: false,
    }
    if (job.calendar_event_id) {
      const { data, error } = await db.from('calendar_events').update(ev).eq('company_id', job.company_id).eq('id', job.calendar_event_id).select('id')
      if (!error && data?.length) return job.calendar_event_id
    }
    let id: string | null = null
    const ins = await db.from('calendar_events').insert(ev).select('id').maybeSingle()
    if (!ins.error) id = ins.data?.id || null
    else {
      // Older calendars without the assignment columns.
      const { assigned_to_id, assigned_to_name, assignees, notify_customer, ...minimal } = ev
      void assigned_to_id; void assigned_to_name; void assignees; void notify_customer
      const r2 = await db.from('calendar_events').insert(minimal).select('id').maybeSingle()
      id = r2.data?.id || null
    }
    if (id) await db.from('jobs').update({ calendar_event_id: id }).eq('company_id', job.company_id).eq('id', job.id)
    return id
  } catch { return null }
}

/**
 * Tell particular people about a job: a bell notification that opens it, and
 * a push to their phones. Never the person who did it. Best effort.
 */
export async function notifyPeople(db: any, o: { companyId: string; userIds: string[]; exclude?: string | null; title: string; body: string; link: string; type: string; origin?: string }) {
  const ids = Array.from(new Set(o.userIds.filter(id => id && id !== o.exclude)))
  if (!ids.length) return 0
  try {
    await db.from('notifications').insert(ids.map(uid => ({
      company_id: o.companyId, user_id: uid, type: o.type, title: o.title.slice(0, 200), body: o.body.slice(0, 300),
      message: `${o.title}${o.body ? `: ${o.body}` : ''}`.slice(0, 300), link: o.link, is_read: false,
    })))
  } catch {}
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || o.origin || 'https://colvy.com'
    await fetch(`${base}/api/push/send`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ companyId: o.companyId, userIds: ids, title: o.title.slice(0, 120), body: o.body.slice(0, 300) || o.title, route: o.link }),
    })
  } catch {}
  return ids.length
}

/** "Tue 3 Nov, 9am" for notifications, in the business's time zone. */
export function whenText(start: string | null | undefined, tz: string): string {
  if (!start) return 'not scheduled yet'
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(start)).replace(' am', 'am').replace(' pm', 'pm')
  } catch { return '' }
}

/** Sync with the customer's name in the calendar title. */
export async function syncJob(db: any, job: any, company: any) {
  let name: string | null = null
  if (job.contact_id) {
    try { const { data } = await db.from('contacts').select('name').eq('company_id', job.company_id).eq('id', job.contact_id).maybeSingle(); name = data?.name || null } catch {}
  }
  return syncJobCalendar(db, job, company, name)
}

/**
 * Stop every running timer on a job (finishing it, or cancelling). Returns the
 * seconds added. Each entry is closed only if it's still open, so two people
 * finishing at once can't count time twice.
 */
export async function closeOpenEntries(db: any, job: { id: string; company_id: string }, userId?: string): Promise<number> {
  let q = db.from('job_time_entries').select('id, started_at').eq('company_id', job.company_id).eq('job_id', job.id).is('ended_at', null)
  if (userId) q = q.eq('user_id', userId)
  const { data: open } = await q
  if (!open?.length) return 0
  const now = new Date()
  let added = 0
  for (const e of open) {
    const secs = Math.max(0, Math.round((now.getTime() - Date.parse(e.started_at)) / 1000))
    const { data: closed } = await db.from('job_time_entries').update({ ended_at: now.toISOString(), seconds: secs }).eq('id', e.id).is('ended_at', null).select('id')
    if (closed?.length) added += secs
  }
  if (added) {
    const { data: j } = await db.from('jobs').select('time_seconds').eq('id', job.id).maybeSingle()
    await db.from('jobs').update({ time_seconds: Number(j?.time_seconds || 0) + added }).eq('company_id', job.company_id).eq('id', job.id)
  }
  return added
}

/** Quotes and prices: not for field staff when the business limits them to their own jobs. */
/** Pass the company when the route already has it, to skip reading it again. */
export async function moneyAllowed(db: any, access: JobsCaller, companyId: string, company?: any): Promise<boolean> {
  return viewFor(access, companySettings(company !== undefined ? company : await loadCompany(db, companyId))).money
}
export const MONEY_DENIED = 'Quotes and prices are for owners and admins in this workspace.'

/**
 * The common start of every per-job route: the caller may use Jobs in this
 * workspace, the job is in it, and (when field staff are limited) it's theirs.
 * Flat return (no strictNullChecks here): check `response` first.
 */
export async function jobContext(req: Request, db: any, companyId: any, id: any) {
  const access = await jobsAccess(req, db, companyId)
  if (!access.ok) return { response: access.response } as any
  if (!isUuid(id)) return { response: json({ error: 'Job not found.' }, 404) } as any
  const [{ data: job, error }, company] = await Promise.all([
    db.from('jobs').select('*').eq('company_id', companyId).eq('id', id).maybeSingle(),
    loadCompany(db, companyId),
  ])
  if (error) { if (isMissingJobsSchema(error)) return { response: setupNeeded() } as any; throw error }
  const settings = companySettings(company)
  const view = viewFor(access, settings)
  if (!job || !callerSeesJob(view, job)) return { response: json({ error: 'Job not found.' }, 404) } as any
  return {
    response: null as any, access, job, company, settings, view,
    tz: companyTz(company), label: `${settings.job_prefix}-${job.number}`,
  }
}

/**
 * A file this job may record: uploaded by /api/storage/put into THIS job's
 * folder on our own storage (R2's public domain or the Supabase bucket).
 */
export function isJobFileUrl(url: any, companyId: string, jobId: string): boolean {
  const sb = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  return jobFileUrlOk(url, companyId, jobId, [r2PublicBase(), sb ? `${sb}/storage/v1/object/public/chat-attachments` : ''])
}
