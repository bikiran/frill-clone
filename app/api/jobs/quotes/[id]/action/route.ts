import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { cleanLines, fmtMoney } from '@/lib/jobs/quote-math'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, logJobEvent, emitJobEvent,
  loadCompany, companySettings, companyTz, todayIn, quoteDepositCheckout, clip,
} from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// POST { companyId, action, ... } on a quote:
//   withdraw                    take back a sent quote
//   accept / decline { name, note }   record the customer's answer given by phone or in person
//   deposit_link                a card payment link for the deposit (to send another way)
//   save_template { name }      keep this quote's lines as a template

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(id)) return json({ error: 'Quote not found.' }, 404)
    const { data: quote, error } = await db.from('job_quotes').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!quote) return json({ error: 'Quote not found.' }, 404)
    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const label = `${settings.quote_prefix}-${quote.number}${quote.revision > 1 ? ` (rev ${quote.revision})` : ''}`
    const { data: job } = await db.from('jobs').select('id, number, title, status, contact_id, conversation_id').eq('company_id', companyId).eq('id', quote.job_id).maybeSingle()
    if (!job) return json({ error: 'Job not found.' }, 404)
    const now = new Date().toISOString()

    switch (String(body.action)) {
      case 'withdraw': {
        if (quote.status !== 'sent') return json({ error: 'Only a sent quote can be withdrawn.' }, 409)
        const { data: w } = await db.from('job_quotes').update({ status: 'withdrawn', updated_at: now }).eq('company_id', companyId).eq('id', id).eq('status', 'sent').select('*')
        if (!w?.length) return json({ error: 'The customer just answered this quote. Refresh to see it.' }, 409)
        // The last quote out taken back: the job is being quoted again.
        const { data: still } = await db.from('job_quotes').select('id').eq('company_id', companyId).eq('job_id', job.id).eq('status', 'sent').limit(1)
        if (!still?.length && job.status === 'awaiting_approval') await db.from('jobs').update({ status: 'quoting', updated_at: now }).eq('company_id', companyId).eq('id', job.id).eq('status', 'awaiting_approval')
        await logJobEvent(db, { companyId, jobId: job.id, quoteId: id, type: 'quote_withdrawn', actorId: access.userId, actorName: access.name, summary: `Withdrew quote ${label}` })
        await audit(req, db, companyId, 'quote_updated', `Withdrew quote ${label}`, { quote_id: id, job_id: job.id })
        return json({ quote: w[0] })
      }

      case 'accept':
      case 'decline': {
        const decision = body.action as 'accept' | 'decline'
        const name = clip(body.name, 120)
        if (decision === 'accept' && name.length < 2) return json({ error: 'Who accepted it? Enter the customer’s name.' }, 400)
        const { data: r, error: rErr } = await db.rpc('colvy_quote_decide', {
          p_quote: id, p_token: null, p_decision: decision, p_name: name || null, p_note: clip(body.note, 1000) || null,
          p_ip: null, p_ua: null, p_actor_type: 'staff', p_actor_id: access.userId, p_actor_name: access.name,
          p_today: todayIn(companyTz(company)),
        })
        if (rErr) { if (isMissingJobsSchema(rErr)) return setupNeeded(); throw rErr }
        if (!r?.ok) return json({ error: r?.reason === 'not_open' ? `This quote is ${r.status}, so it can’t be ${decision === 'accept' ? 'accepted' : 'declined'}.` : 'Quote not found.' }, 409)
        if (!r.already) {
          const how = decision === 'accept' ? 'accepted' : 'declined'
          await audit(req, db, companyId, 'quote_decided', `Recorded quote ${label} as ${how}${name ? ` by ${name}` : ''} (${fmtMoney(quote.total_cents)})`, { quote_id: id, job_id: job.id, decision, by: 'staff' })
          emitJobEvent(companyId, decision === 'accept' ? 'quote.accepted' : 'quote.declined', {
            title: `Quote ${label} ${how}`, summary: `${job.title} · ${fmtMoney(quote.total_cents)}`, jobId: job.id,
            fields: { By: name || 'Customer', 'Recorded by': access.name }, dedupeKey: `quote.${decision}:${id}`,
          }, db)
        }
        const { data: fresh } = await db.from('job_quotes').select('*').eq('id', id).maybeSingle()
        return json({ quote: fresh, jobStatus: r.job_status || null })
      }

      case 'deposit_link': {
        const r = await quoteDepositCheckout(db, company, quote, job)
        if ('error' in r) return json({ error: r.error }, r.status)
        await logJobEvent(db, { companyId, jobId: job.id, quoteId: id, type: 'deposit_requested', actorId: access.userId, actorName: access.name, summary: `Made a deposit link for ${fmtMoney(quote.deposit_cents)}` })
        await audit(req, db, companyId, 'quote_deposit_requested', `Deposit link for quote ${label} (${fmtMoney(quote.deposit_cents)})`, { quote_id: id, job_id: job.id })
        return json({ url: r.url })
      }

      case 'save_template': {
        const name = clip(body.name, 120) || clip(quote.title, 120) || `Quote ${label}`
        const { data: t, error: tErr } = await db.from('job_quote_templates').insert({
          company_id: companyId, name, title: quote.title, intro: quote.intro, terms: quote.terms,
          items: cleanLines(quote.items), discount_type: quote.discount_type, discount_value: quote.discount_value,
          deposit_type: quote.deposit_type, deposit_value: quote.deposit_value,
        }).select('id, name, title').maybeSingle()
        if (tErr) throw tErr
        return json({ template: t })
      }

      default:
        return json({ error: 'Unknown action.' }, 400)
    }
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'That didn’t work. Please try again.' }, 500)
  }
}
