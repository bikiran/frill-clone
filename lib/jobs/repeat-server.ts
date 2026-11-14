// Repeating jobs, server side (migrations/COLVY_V435_REPEATING_JOBS.sql): a
// series made from a scheduled job, and the visits it makes. Each visit is a
// job of its own (same customer, address, team, checklist and price), made a
// few weeks ahead so it's on the board, the Calendar and the team's phones in
// time. The daily cron (/api/cron/repeat-jobs) keeps every series topped up;
// setting a job to repeat makes the first ones straight away.

import { addDays, dateInTz, zonedParts, zonedToUtc } from '@/lib/booking-time'
import { cleanRule, visitDate, withinEnd, ruleLabel, type RepeatRule } from '@/lib/jobs/repeat'
import { companySettings, companyTz, todayIn, nextNumber, logJobEvent, loadCompany, json } from '@/lib/jobs/server'
import { syncJob } from '@/lib/jobs/field'
import { assigneesOf } from '@/lib/jobs/work'

export const REPEAT_HINT = 'Repeating jobs need a database update: run migrations/COLVY_V435_REPEATING_JOBS.sql in the Supabase SQL editor.'
export const repeatSetupNeeded = () => json({ setupNeeded: true, error: REPEAT_HINT }, 503)
export function isMissingRepeatSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''} ${e?.hint || ''}`
  return /42P01|42703|PGRST205|PGRST204|does not exist|could not find the|schema cache/i.test(m) && /job_repeats|repeat_id|repeat_seq/i.test(m)
}

/** How far ahead visits are made. At least the next visit always exists. */
export const LOOKAHEAD_DAYS = 35
const MAX_PER_RUN = 8

export const ruleOf = (s: any): RepeatRule => cleanRule({ every: s.every_n, unit: s.unit, ends: s.ends, endsAfter: s.ends_after, endsOn: s.ends_on })
  || { every: 1, unit: 'week', ends: 'never', endsAfter: null, endsOn: null }

/** "HH:MM" of an instant, in the business's time zone. */
function localTime(iso: string, tz: string): string {
  const p = zonedParts(Date.parse(iso), tz)
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
}

/** What each visit copies from the job: who, where, what, the team, the price and the checklist. */
export async function templateFrom(db: any, job: any) {
  const { data: items } = await db.from('job_checklist_items').select('text, sort_order').eq('company_id', job.company_id).eq('job_id', job.id).order('sort_order').limit(200)
  return {
    title: job.title, description: job.description || null, address: job.address || null,
    contact_id: job.contact_id || null, conversation_id: job.conversation_id || null,
    assignees: assigneesOf(job), value_cents: job.value_cents ?? null,
    checklist: (items || []).map((i: any) => String(i.text || '')).filter(Boolean),
  }
}

/** The series fields for a job set to repeat (it becomes visit 1). */
export function seriesTiming(job: any, tz: string) {
  const startMs = Date.parse(job.scheduled_start)
  const endMs = job.scheduled_end ? Date.parse(job.scheduled_end) : startMs + 60 * 60_000
  return {
    start_date: dateInTz(startMs, tz),
    start_time: localTime(job.scheduled_start, tz),
    duration_min: Math.min(10080, Math.max(1, Math.round((endMs - startMs) / 60_000) || 60)),
  }
}

/**
 * Make the visits a series needs now: everything up to LOOKAHEAD_DAYS ahead,
 * and always the next one. Dates already past are skipped (not made). Each
 * visit is claimed first (last_seq compare-and-set) and is unique per
 * (series, visit), so two runs never make the same visit twice.
 */
export async function topUpSeries(db: any, series: any, company?: any): Promise<{ created: number; finished: boolean }> {
  let made = 0
  if (!series?.active) return { created: 0, finished: false }
  company = company || await loadCompany(db, series.company_id)
  if (!company) return { created: 0, finished: false }
  const tz = companyTz(company)
  const today = todayIn(tz)
  const horizon = addDays(today, LOOKAHEAD_DAYS)
  const rule = ruleOf(series)
  const t = series.template || {}
  const pf = companySettings(company).job_prefix

  const { data: ahead } = await db.from('jobs').select('id').eq('company_id', series.company_id).eq('repeat_id', series.id)
    .gte('scheduled_start', new Date().toISOString()).neq('status', 'cancelled').limit(1)
  let hasUpcoming = !!ahead?.length
  let last = Number(series.last_seq) || 1

  for (let guard = 0; guard < 600 && made < MAX_PER_RUN; guard++) {
    const seq = last + 1
    const date = visitDate(series.start_date, rule, seq)
    if (!withinEnd(rule, seq, date)) {
      await db.from('job_repeats').update({ active: false, ended_reason: 'finished', updated_at: new Date().toISOString() }).eq('id', series.id).eq('active', true)
      return { created: made, finished: true }
    }
    const past = date < today
    if (!past && date > horizon && hasUpcoming) break
    // Claim this visit.
    const { data: claimed } = await db.from('job_repeats').update({ last_seq: seq, updated_at: new Date().toISOString() }).eq('id', series.id).eq('last_seq', last).eq('active', true).select('id')
    if (!claimed?.length) break
    last = seq
    if (past) continue

    const startMs = zonedToUtc(date, series.start_time, tz)
    const number = await nextNumber(db, series.company_id, 'job')
    const row: any = {
      company_id: series.company_id, number, title: String(t.title || 'Repeat visit').slice(0, 160), description: t.description || null,
      status: 'scheduled', source: 'manual', contact_id: t.contact_id || null, conversation_id: t.conversation_id || null,
      address: t.address || null, scheduled_start: new Date(startMs).toISOString(), scheduled_end: new Date(startMs + series.duration_min * 60_000).toISOString(),
      assignees: Array.isArray(t.assignees) ? t.assignees : [], value_cents: t.value_cents ?? null,
      sort_order: startMs / 1000, created_by: series.created_by || null, created_by_name: 'Repeats',
      repeat_id: series.id, repeat_seq: seq,
    }
    const { data: job, error } = await db.from('jobs').insert(row).select('*').maybeSingle()
    if (error || !job) { if (String(error?.code) === '23505') continue; throw error || new Error('Could not make the visit') }
    made++; hasUpcoming = true
    const items = (Array.isArray(t.checklist) ? t.checklist : []).slice(0, 200)
    if (items.length) {
      try { await db.from('job_checklist_items').insert(items.map((text: string, i: number) => ({ company_id: series.company_id, job_id: job.id, text: String(text).slice(0, 300), sort_order: i, created_by: series.created_by || null }))) } catch {}
    }
    await syncJob(db, job, company)
    await logJobEvent(db, {
      companyId: series.company_id, jobId: job.id, type: 'created', actorType: 'system',
      summary: `Visit ${seq} of a job that repeats ${ruleLabel(rule).toLowerCase()}`, data: { repeat_id: series.id, repeat_seq: seq, prefix: pf },
    })
  }
  return { created: made, finished: false }
}

/** The daily sweep: top up every active series. */
export async function runRepeatJobs(db: any, opts?: { limit?: number }): Promise<{ series: number; created: number; finished: number; failed: number }> {
  const out = { series: 0, created: 0, finished: 0, failed: 0 }
  const { data, error } = await db.from('job_repeats').select('*').eq('active', true).order('updated_at', { ascending: true }).limit(opts?.limit || 500)
  if (error) { if (isMissingRepeatSchema(error)) return out; throw error }
  const companies = new Map<string, any>()
  for (const s of data || []) {
    out.series++
    try {
      if (!companies.has(s.company_id)) companies.set(s.company_id, await loadCompany(db, s.company_id))
      const r = await topUpSeries(db, s, companies.get(s.company_id))
      out.created += r.created
      if (r.finished) out.finished++
    } catch { out.failed++ }
  }
  return out
}

/**
 * Visits after `fromIso` that nobody has started (still New or Scheduled,
 * no timer, no sign-off): safe to call off when a series stops or changes.
 */
export async function untouchedAfter(db: any, companyId: string, repeatId: string, fromIso: string) {
  const { data } = await db.from('jobs').select('*').eq('company_id', companyId).eq('repeat_id', repeatId)
    .gt('scheduled_start', fromIso).in('status', ['new', 'scheduled']).is('started_at', null).order('scheduled_start').limit(200)
  return (data || []).filter((j: any) => !j.signature && !Number(j.time_seconds))
}

/** Call off visits (cancelled, off the Calendar), with a note on each. */
export async function cancelVisits(db: any, company: any, jobs: any[], reason: string, actor?: { id?: string | null; name?: string | null }) {
  const now = new Date().toISOString()
  let n = 0
  for (const j of jobs) {
    const { data } = await db.from('jobs').update({ status: 'cancelled', cancel_reason: reason, closed_at: now, updated_at: now }).eq('company_id', j.company_id).eq('id', j.id).eq('status', j.status).select('*')
    if (!data?.length) continue
    n++
    await syncJob(db, data[0], company)
    await logJobEvent(db, { companyId: j.company_id, jobId: j.id, type: 'status_changed', actorId: actor?.id || null, actorName: actor?.name || null, summary: `Cancelled: ${reason}`, data: { to: 'cancelled' } })
  }
  return n
}
