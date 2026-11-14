import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { json, jobsDb, logJobEvent } from '@/lib/jobs/server'
import { jobContext } from '@/lib/jobs/field'
import { cleanRule, ruleLabel, endLabel, upcomingDates } from '@/lib/jobs/repeat'
import {
  repeatSetupNeeded, isMissingRepeatSchema, ruleOf, templateFrom, seriesTiming, topUpSeries, untouchedAfter, cancelVisits,
} from '@/lib/jobs/repeat-server'

export const dynamic = 'force-dynamic'

// Repeat a job.
//   GET    ?companyId   the series this job is in (if any), and its upcoming visits
//   POST   { companyId, every, unit, ends, endsAfter?, endsOn? }
//          Set this job to repeat (it's visit 1), or change the repeat from
//          this visit on: later visits nobody has started are replaced, and
//          the new ones copy this job as it is now.
//   DELETE ?companyId&cancelUpcoming=1   stop repeating (and call off the
//          upcoming visits nobody has started)
// Owners, admins and anyone not limited to their own jobs.

type Ctx = { params: Promise<{ id: string }> }

async function seriesView(db: any, companyId: string, series: any, jobSeq: number | null) {
  if (!series) return { repeat: null, upcoming: [] }
  const rule = ruleOf(series)
  const { data: upcoming } = await db.from('jobs').select('id, number, status, scheduled_start, repeat_seq').eq('company_id', companyId).eq('repeat_id', series.id)
    .gte('scheduled_start', new Date(Date.now() - 12 * 3600e3).toISOString()).neq('status', 'cancelled').order('scheduled_start').limit(6)
  return {
    repeat: {
      id: series.id, every: rule.every, unit: rule.unit, ends: rule.ends, endsAfter: rule.endsAfter, endsOn: rule.endsOn,
      label: ruleLabel(rule), endLabel: endLabel(rule), active: series.active, endedReason: series.ended_reason || null,
      startDate: series.start_date, startTime: series.start_time, lastSeq: series.last_seq, seq: jobSeq,
      // What comes after the visits already made (for the panel's preview).
      later: series.active ? upcomingDates(series.start_date, rule, series.last_seq, 3) : [],
    },
    upcoming: upcoming || [],
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const c = await jobContext(req, db, req.nextUrl.searchParams.get('companyId'), id)
    if (c.response) return c.response
    if (!c.job.repeat_id) return json({ repeat: null, upcoming: [] })
    const { data: series, error } = await db.from('job_repeats').select('*').eq('company_id', c.job.company_id).eq('id', c.job.repeat_id).maybeSingle()
    if (error) { if (isMissingRepeatSchema(error)) return repeatSetupNeeded(); throw error }
    return json(await seriesView(db, c.job.company_id, series, c.job.repeat_seq))
  } catch (e: any) {
    if (isMissingRepeatSchema(e)) return repeatSetupNeeded()
    return json({ error: e?.message || 'Could not load the repeat.' }, 500)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { job, company, access, view, tz, label } = c
    if (view.restrict && !view.isManager) return json({ error: 'Ask an owner or admin to set this job to repeat.' }, 403)
    if (job.status === 'cancelled') return json({ error: 'Reopen the job before setting it to repeat.' }, 409)
    if (!job.scheduled_start) return json({ error: 'Give the job a date and time first: each visit repeats it.' }, 400)
    const rule = cleanRule(body)
    if (!rule) return json({ error: 'Pick how often it repeats, and when it ends.' }, 400)
    const timing = seriesTiming(job, tz)
    if (rule.ends === 'on' && rule.endsOn! <= timing.start_date) return json({ error: 'The end date has to be after this visit.' }, 400)

    const now = new Date().toISOString()
    const template = await templateFrom(db, job)
    let replaced = 0

    // Already in a series: that one stops here, and visits after this one
    // that nobody has started are called off (the new series replaces them).
    if (job.repeat_id) {
      const { data: old, error: oErr } = await db.from('job_repeats').select('*').eq('company_id', job.company_id).eq('id', job.repeat_id).maybeSingle()
      if (oErr) { if (isMissingRepeatSchema(oErr)) return repeatSetupNeeded(); throw oErr }
      if (old) {
        await db.from('job_repeats').update({ active: false, ended_reason: 'changed', stopped_at: now, updated_at: now }).eq('id', old.id)
        replaced = await cancelVisits(db, company, await untouchedAfter(db, job.company_id, old.id, job.scheduled_start), 'the repeat was changed', { id: access.userId, name: access.name })
      }
    }

    const { data: series, error } = await db.from('job_repeats').insert({
      company_id: job.company_id, source_job_id: job.id, every_n: rule.every, unit: rule.unit, ends: rule.ends,
      ends_after: rule.endsAfter, ends_on: rule.endsOn, ...timing, template, last_seq: 1, active: true,
      created_by: access.userId, created_by_name: access.name,
    }).select('*').maybeSingle()
    if (error || !series) { if (isMissingRepeatSchema(error)) return repeatSetupNeeded(); throw error }
    const { error: jErr } = await db.from('jobs').update({ repeat_id: series.id, repeat_seq: 1, updated_at: now }).eq('company_id', job.company_id).eq('id', job.id)
    if (jErr) throw jErr

    const r = await topUpSeries(db, series, company)
    const summary = `Set to repeat ${ruleLabel(rule).toLowerCase()}${endLabel(rule) ? ` ${endLabel(rule)}` : ''}${replaced ? ` (replacing ${replaced} upcoming visit${replaced === 1 ? '' : 's'})` : ''}`
    await logJobEvent(db, { companyId: job.company_id, jobId: job.id, type: 'repeat_set', actorId: access.userId, actorName: access.name, summary, data: { repeat_id: series.id, created: r.created } })
    await audit(req, db, job.company_id, 'job_updated', `${label}: ${summary}`, { job_id: job.id, repeat_id: series.id })
    const { data: fresh } = await db.from('job_repeats').select('*').eq('id', series.id).maybeSingle()
    return json({ ...(await seriesView(db, job.company_id, fresh || series, 1)), created: r.created, replaced })
  } catch (e: any) {
    if (isMissingRepeatSchema(e)) return repeatSetupNeeded()
    return json({ error: e?.message || 'Could not set the job to repeat.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const c = await jobContext(req, db, req.nextUrl.searchParams.get('companyId'), id)
    if (c.response) return c.response
    const { job, company, access, view, label } = c
    if (view.restrict && !view.isManager) return json({ error: 'Ask an owner or admin to stop this repeat.' }, 403)
    if (!job.repeat_id) return json({ error: 'This job doesn’t repeat.' }, 409)
    const now = new Date().toISOString()
    const { data: stopped, error } = await db.from('job_repeats').update({ active: false, ended_reason: 'stopped', stopped_at: now, updated_at: now })
      .eq('company_id', job.company_id).eq('id', job.repeat_id).select('id')
    if (error) { if (isMissingRepeatSchema(error)) return repeatSetupNeeded(); throw error }
    if (!stopped?.length) return json({ error: 'That repeat wasn’t found.' }, 404)
    let cancelled = 0
    if (req.nextUrl.searchParams.get('cancelUpcoming') === '1') {
      const from = job.scheduled_start && Date.parse(job.scheduled_start) > Date.now() ? job.scheduled_start : now
      cancelled = await cancelVisits(db, company, await untouchedAfter(db, job.company_id, job.repeat_id, from), 'the repeat was stopped', { id: access.userId, name: access.name })
    }
    const summary = `Stopped repeating${cancelled ? `, and called off ${cancelled} upcoming visit${cancelled === 1 ? '' : 's'}` : ''}`
    await logJobEvent(db, { companyId: job.company_id, jobId: job.id, type: 'repeat_stopped', actorId: access.userId, actorName: access.name, summary, data: { repeat_id: job.repeat_id, cancelled } })
    await audit(req, db, job.company_id, 'job_updated', `${label}: ${summary}`, { job_id: job.id, repeat_id: job.repeat_id })
    return json({ ok: true, cancelled })
  } catch (e: any) {
    if (isMissingRepeatSchema(e)) return repeatSetupNeeded()
    return json({ error: e?.message || 'Could not stop the repeat.' }, 500)
  }
}
