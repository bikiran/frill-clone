import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { stripeReady } from '@/lib/booking'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, logJobEvent,
  loadCompany, companySettings, companyTz, todayIn, quoteMoney, quoteUrl, clip,
} from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// One quote, for the editor.
//   GET    ?companyId   the quote, its job and customer, the price list and templates
//   PATCH  { companyId, ... }   save a draft (totals are recomputed here, never trusted)
//   DELETE ?companyId   delete a draft

type Ctx = { params: Promise<{ id: string }> }
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(id)) return json({ error: 'Quote not found.' }, 404)
    const { data: quote, error } = await db.from('job_quotes').select('*').eq('company_id', companyId!).eq('id', id).maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!quote) return json({ error: 'Quote not found.' }, 404)
    const { data: job } = await db.from('jobs').select('id, number, title, status, address, contact_id, conversation_id, scheduled_start').eq('company_id', companyId!).eq('id', quote.job_id).maybeSingle()
    const [contact, priceItems, templates, company, conv] = await Promise.all([
      job?.contact_id ? db.from('contacts').select('id, name, email, phone').eq('company_id', companyId!).eq('id', job.contact_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from('job_price_items').select('*').eq('company_id', companyId!).eq('active', true).order('sort_order').order('name').limit(500),
      db.from('job_quote_templates').select('id, name, title').eq('company_id', companyId!).order('name').limit(200),
      loadCompany(db, companyId!),
      job?.conversation_id ? db.from('conversations').select('id, channel').eq('company_id', companyId!).eq('id', job.conversation_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const settings = companySettings(company)
    return json({
      quote, job, contact: contact.data || null, conversation: conv.data || null,
      priceItems: priceItems.data || [], templates: templates.data || [],
      settings, timezone: companyTz(company), today: todayIn(companyTz(company)),
      company: company ? { name: company.name, logo_url: company.logo_url, accent_color: company.accent_color, abn: company.abn_acn || null } : null,
      url: quote.public_token ? quoteUrl(company, quote.public_token) : null,
      paymentsReady: stripeReady(company),
    })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not load the quote.' }, 500)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
    // A sent quote is what the customer saw: change it with a revision.
    if (quote.status !== 'draft') return json({ error: 'This quote has been sent, so it can’t be edited. Start a revision instead.', quote }, 409)

    const settings = companySettings(await loadCompany(db, companyId))
    const items = body.items !== undefined ? body.items : quote.items
    const discount = body.discount !== undefined ? body.discount : { type: quote.discount_type, value: Number(quote.discount_value) }
    const deposit = body.deposit !== undefined ? body.deposit : { type: quote.deposit_type, value: Number(quote.deposit_value) }
    const incl = body.pricesIncludeTax !== undefined ? !!body.pricesIncludeTax : quote.prices_include_tax
    const money = quoteMoney({ items, discount, deposit, prices_include_tax: incl, tax_rate: effectiveTaxRate(settings) })
    const patch: any = { ...money, updated_at: new Date().toISOString() }
    if (body.title !== undefined) patch.title = clip(body.title, 160) || null
    if (body.intro !== undefined) patch.intro = clip(body.intro, 4000) || null
    if (body.terms !== undefined) patch.terms = clip(body.terms, 6000) || null
    if (body.validUntil !== undefined) {
      if (body.validUntil && !DATE.test(String(body.validUntil))) return json({ error: 'Pick a valid date.' }, 400)
      patch.valid_until = body.validUntil || null
    }
    // Compare-and-set on the draft, so a teammate's send in between isn't overwritten.
    const { data: saved, error: uErr } = await db.from('job_quotes').update(patch).eq('company_id', companyId).eq('id', id).eq('status', 'draft').select('*')
    if (uErr) throw uErr
    if (!saved?.length) return json({ error: 'This quote was just sent by someone else, so it can’t be edited now.' }, 409)
    await db.from('jobs').update({ updated_at: patch.updated_at }).eq('company_id', companyId).eq('id', quote.job_id)
    if (body.logSave) await audit(req, db, companyId, 'quote_updated', `Saved quote ${settings.quote_prefix}-${quote.number}`, { quote_id: id, job_id: quote.job_id })
    return json({ quote: saved[0] })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the quote.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(id)) return json({ error: 'Quote not found.' }, 404)
    const { data: quote } = await db.from('job_quotes').select('id, job_id, number, revision, status').eq('company_id', companyId!).eq('id', id).maybeSingle()
    if (!quote) return json({ error: 'Quote not found.' }, 404)
    if (quote.status !== 'draft') return json({ error: 'Only a draft can be deleted. Withdraw a sent quote instead.' }, 409)
    const { data: gone } = await db.from('job_quotes').delete().eq('company_id', companyId!).eq('id', id).eq('status', 'draft').select('id')
    if (!gone?.length) return json({ error: 'This quote was just sent, so it can’t be deleted.' }, 409)
    const settings = companySettings(await loadCompany(db, companyId!))
    await logJobEvent(db, { companyId: companyId!, jobId: quote.job_id, type: 'quote_deleted', actorId: access.userId, actorName: access.name, summary: `Deleted draft quote ${settings.quote_prefix}-${quote.number}${quote.revision > 1 ? ` (rev ${quote.revision})` : ''}` })
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the quote.' }, 500)
  }
}
