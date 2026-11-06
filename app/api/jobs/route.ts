import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { ensureContact } from '@/lib/booking'
import { isJobStatus } from '@/lib/jobs/status'
import { answerToPlainText, stripReservedAnswers } from '@/lib/form-logic'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid,
  nextNumber, logJobEvent, emitJobEvent, loadCompany, companySettings, clip, isoOrNull,
} from '@/lib/jobs/server'
import { viewFor } from '@/lib/jobs/field'

export const dynamic = 'force-dynamic'

// Jobs & Services (docs/plans/jobs.md).
//   GET  ?companyId&status&q&contactId&from&to   the jobs list (board, list, calendar)
//   POST { companyId, createKey, source, ... }   a new job, by hand or from a
//        conversation, a booking or a form response (filled in from it)


export async function GET(req: NextRequest) {
  try {
    const db = jobsDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    // The access check and the company (whose settings decide what this
    // person may see) are read together; the list follows.
    const [access, company] = await Promise.all([
      jobsAccess(req, db, companyId),
      isUuid(companyId) ? loadCompany(db, companyId!) : Promise.resolve(null),
    ])
    if (!access.ok) return access.response
    const settings = companySettings(company)
    const view = viewFor(access, settings)

    let q = db.from('jobs')
      .select('id, number, title, status, source, contact_id, conversation_id, booking_id, address, scheduled_start, scheduled_end, value_cents, accepted_quote_id, sort_order, assignees, time_seconds, completed_at, created_at, updated_at')
      .eq('company_id', companyId!)
    // Field staff (when the business limits them) see only their own jobs; anyone can ask for "mine".
    // JSON text, not an array: supabase-js turns an array into a Postgres array
    // literal ({…}), which doesn't match a jsonb column.
    if ((view.restrict && !view.isManager) || sp.get('mine') === '1') q = q.contains('assignees', JSON.stringify([{ id: view.userId }]))
    const status = sp.get('status')
    if (status && isJobStatus(status)) q = q.eq('status', status)
    const contactId = sp.get('contactId')
    if (contactId && isUuid(contactId)) q = q.eq('contact_id', contactId)
    const from = isoOrNull(sp.get('from')), to = isoOrNull(sp.get('to'))
    if (from) q = q.gte('scheduled_start', from)
    if (to) q = q.lt('scheduled_start', to)
    const search = clip(sp.get('q'), 80).replace(/[%,()]/g, ' ').trim()
    if (search) {
      const n = Number(search.replace(/^[A-Za-z]+-?/, ''))
      q = Number.isInteger(n) && n > 0 ? q.or(`title.ilike.%${search}%,number.eq.${n}`) : q.ilike('title', `%${search}%`)
    }
    const listRes = await q.order('updated_at', { ascending: false }).limit(500)
    const { data: jobs, error } = listRes as any
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }

    const list = jobs || []
    const contactIds = Array.from(new Set(list.map((j: any) => j.contact_id).filter(Boolean)))
    const jobIds = list.map((j: any) => j.id)
    const [contacts, quotes] = await Promise.all([
      contactIds.length ? db.from('contacts').select('id, name, phone, email').eq('company_id', companyId!).in('id', contactIds) : Promise.resolve({ data: [] }),
      jobIds.length && view.money ? db.from('job_quotes').select('id, job_id, number, revision, status, total_cents, created_at').eq('company_id', companyId!).in('job_id', jobIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ])
    const byContact = new Map((contacts.data || []).map((c: any) => [c.id, c]))
    const latestQuote = new Map<string, any>()
    for (const qt of quotes.data || []) if (!latestQuote.has(qt.job_id)) latestQuote.set(qt.job_id, qt)
    return json({
      jobs: list.map((j: any) => ({ ...j, value_cents: view.money ? j.value_cents : null, contact: byContact.get(j.contact_id) || null, quote: latestQuote.get(j.id) || null })),
      settings: { job_prefix: settings.job_prefix, quote_prefix: settings.quote_prefix },
      timezone: company?.booking_settings?.timezone || 'Australia/Melbourne',
      me: view.userId, canManage: view.isManager, seesMoney: view.money, restricted: view.restrict && !view.isManager,
    })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load jobs.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response

    const source = ['conversation', 'booking', 'form'].includes(body.source) ? body.source : 'manual'
    const createKey = clip(body.createKey, 80) || null

    // The same click twice (a double tap, a retried request): hand back the first job.
    if (createKey) {
      const { data: dup, error } = await db.from('jobs').select('id, number').eq('company_id', companyId).eq('create_key', createKey).maybeSingle()
      if (error && isMissingJobsSchema(error)) return setupNeeded()
      if (dup) return json({ job: dup, existing: true })
    }

    let title = clip(body.title, 160)
    let description = clip(body.description, 8000)
    let address = clip(body.address, 300) || null
    let start = isoOrNull(body.scheduledStart), end = isoOrNull(body.scheduledEnd)
    let contactId: string | null = isUuid(body.contactId) ? body.contactId : null
    let conversationId: string | null = null, bookingId: string | null = null, formId: string | null = null, formResponseId: string | null = null

    // ── Filled in from where it came from (so nothing is typed twice) ──
    if (source === 'conversation') {
      if (!isUuid(body.conversationId)) return json({ error: 'Which conversation?' }, 400)
      const { data: conv } = await db.from('conversations').select('id, contact_id, subject, last_message').eq('company_id', companyId).eq('id', body.conversationId).maybeSingle()
      if (!conv) return json({ error: 'That conversation isn’t in this workspace.' }, 404)
      conversationId = conv.id
      contactId = contactId || conv.contact_id || null
      if (!description) {
        const { data: msgs } = await db.from('messages').select('content, sender_type, created_at').eq('conversation_id', conv.id)
          .in('sender_type', ['visitor', 'customer', 'contact']).order('created_at', { ascending: false }).limit(4)
        description = (msgs || []).reverse().map((m: any) => String(m.content || '').trim()).filter(Boolean).join('\n\n').slice(0, 4000)
      }
      if (!title) title = clip(conv.subject && !/^\+?\d[\d\s]+$/.test(conv.subject) ? conv.subject : '', 160)
    } else if (source === 'booking') {
      if (!isUuid(body.bookingId)) return json({ error: 'Which booking?' }, 400)
      const { data: b } = await db.from('bookings').select('id, service_name, starts_at, ends_at, address, location_label, customer_name, customer_email, customer_phone, contact_id, conversation_id, notes').eq('company_id', companyId).eq('id', body.bookingId).maybeSingle()
      if (!b) return json({ error: 'That booking isn’t in this workspace.' }, 404)
      const { data: already } = await db.from('jobs').select('id, number').eq('company_id', companyId).eq('booking_id', b.id).maybeSingle()
      if (already) return json({ job: already, existing: true })
      bookingId = b.id
      conversationId = b.conversation_id || null
      contactId = contactId || b.contact_id || await ensureContact(db, companyId, { name: b.customer_name || '', email: b.customer_email || null, phone: b.customer_phone || null }, undefined, undefined, 'job')
      title = title || clip(`${b.service_name || 'Job'}${b.customer_name ? ` for ${b.customer_name}` : ''}`, 160)
      description = description || clip(b.notes, 4000)
      address = address || b.address || b.location_label || null
      start = start || b.starts_at || null
      end = end || b.ends_at || null
    } else if (source === 'form') {
      if (!isUuid(body.formResponseId)) return json({ error: 'Which form response?' }, 400)
      const { data: resp } = await db.from('form_responses').select('id, form_id, answers, created_at').eq('id', body.formResponseId).maybeSingle()
      if (!resp) return json({ error: 'That response wasn’t found.' }, 404)
      const { data: form } = await db.from('forms').select('id, title, questions, company_id').eq('id', resp.form_id).maybeSingle()
      if (!form || form.company_id !== companyId) return json({ error: 'That response isn’t in this workspace.' }, 404)
      const { data: already } = await db.from('jobs').select('id, number').eq('company_id', companyId).eq('form_response_id', resp.id).maybeSingle()
      if (already) return json({ job: already, existing: true })
      formId = form.id; formResponseId = resp.id
      const qs: any[] = (Array.isArray(form.questions) ? form.questions : []).filter((q: any) => q && typeof q === 'object')
      const answers: Record<string, any> = stripReservedAnswers(resp.answers)
      const lines: string[] = []
      let name = '', email = '', phone = '', addr = ''
      for (const q of qs) {
        const v = answers[q.id] ?? answers[q.key]
        // Payments never show their (unverifiable) amount; signatures and files print nothing / their name.
        if (v == null || v === '' || q.type === 'payment') continue
        const text = answerToPlainText(v, q).trim()
        if (!text) continue
        const label = String(q.title || q.label || q.question || '').trim()
        lines.push(`${label || 'Answer'}: ${text}`)
        const t = String(q.type || '').toLowerCase(), l = label.toLowerCase()
        if (!email && (t === 'email' || /e-?mail/.test(l))) email = text
        else if (!phone && (t === 'phone' || /phone|mobile/.test(l))) phone = text
        else if (!name && (t === 'name' || /\bname\b/.test(l))) name = text
        else if (!addr && (t === 'address' || /address|suburb|location/.test(l))) addr = text
      }
      description = description || lines.join('\n').slice(0, 6000)
      title = title || clip(`${form.title || 'Form'}${name ? ` — ${name}` : ''}`, 160)
      address = address || clip(addr, 300) || null
      if (!contactId && (email || phone)) contactId = await ensureContact(db, companyId, { name, email: email || null, phone: phone || null }, undefined, undefined, 'job')
    }

    // A customer typed into the new-job form.
    if (!contactId && body.contact && (body.contact.email || body.contact.phone || body.contact.name)) {
      const c = body.contact
      contactId = await ensureContact(db, companyId, { name: clip(c.name, 120), email: clip(c.email, 200) || null, phone: clip(c.phone, 40) || null }, undefined, undefined, 'job')
    }
    // Any id handed in must belong to this workspace.
    if (contactId) {
      const { data: ok } = await db.from('contacts').select('id').eq('company_id', companyId).eq('id', contactId).maybeSingle()
      if (!ok) contactId = null
    }
    if (!title) title = 'New job'
    if (start && end && Date.parse(end) < Date.parse(start)) return json({ error: 'The job can’t finish before it starts.' }, 400)

    const coRow = await loadCompany(db, companyId)
    const pf = companySettings(coRow).job_prefix
    const view = viewFor(access, companySettings(coRow))
    const number = await nextNumber(db, companyId, 'job')
    const status = start ? 'scheduled' : 'new'
    const row = {
      company_id: companyId, number, title, description: description || null, status, source,
      contact_id: contactId, conversation_id: conversationId, booking_id: bookingId, form_id: formId, form_response_id: formResponseId,
      address, scheduled_start: start, scheduled_end: end, create_key: createKey, sort_order: Date.now() / 1000,
      created_by: access.userId, created_by_name: access.name,
      // Field staff who only see their own jobs are put on the jobs they create.
      ...(view.restrict && !view.isManager ? { assignees: [{ id: access.userId, name: access.name }] } : {}),
    }
    const { data: job, error } = await db.from('jobs').insert(row).select('*').maybeSingle()
    if (error) {
      if (isMissingJobsSchema(error)) return setupNeeded()
      // Lost a race on the same click / booking / response: return the winner.
      if (String(error.code) === '23505') {
        const k = createKey ? ['create_key', createKey] : bookingId ? ['booking_id', bookingId] : formResponseId ? ['form_response_id', formResponseId] : null
        if (k) { const { data: dup } = await db.from('jobs').select('id, number').eq('company_id', companyId).eq(k[0], k[1]).maybeSingle(); if (dup) return json({ job: dup, existing: true }) }
      }
      throw error
    }

    const from = source === 'conversation' ? ' from a conversation' : source === 'booking' ? ' from a booking' : source === 'form' ? ' from a form response' : ''
    await logJobEvent(db, { companyId, jobId: job.id, type: 'created', actorId: access.userId, actorName: access.name, summary: `Job created${from}`, data: { source } })
    await audit(req, db, companyId, 'job_created', `Created job ${pf}-${number}: ${title}`, { job_id: job.id, source })
    emitJobEvent(companyId, 'job.created', { title: `New job ${pf}-${number}: ${title}`, summary: description ? description.slice(0, 300) : null, jobId: job.id, dedupeKey: `job.created:${job.id}` }, db)
    return json({ job })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not create the job.' }, 500)
  }
}
