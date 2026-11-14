import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { stripeReady } from '@/lib/booking'
import {
  jobsDb, jobsAccess, json, isUuid, logJobEvent, loadCompany, companySettings, companyTz, todayIn, quoteMoney, clip,
} from '@/lib/jobs/server'
import { moneyAllowed, MONEY_DENIED } from '@/lib/jobs/field'
import { invoicesSetupNeeded, isMissingInvoiceSchema, invoiceUrl, invoiceLabel, balanceOf, isOverdue, REMINDER_DAYS } from '@/lib/jobs/invoices'

export const dynamic = 'force-dynamic'

// One invoice, for the editor.
//   GET    ?companyId   the invoice, its payments, job and customer, the price list
//   PATCH  { companyId, ... }   save a draft (totals worked out here, never trusted);
//                               reminders on/off and the due date also on a sent one
//   DELETE ?companyId   delete a draft

type Ctx = { params: Promise<{ id: string }> }
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const ok = isUuid(companyId) && isUuid(id)
    const none = Promise.resolve({ data: null, error: null })
    const [access, invRes, payRes, priceItems, company] = await Promise.all([
      jobsAccess(req, db, companyId),
      ok ? db.from('job_invoices').select('*').eq('company_id', companyId!).eq('id', id).maybeSingle() : none,
      ok ? db.from('job_invoice_payments').select('*').eq('company_id', companyId!).eq('invoice_id', id).order('created_at') : none,
      ok ? db.from('job_price_items').select('*').eq('company_id', companyId!).eq('active', true).order('sort_order').order('name').limit(500) : none,
      ok ? loadCompany(db, companyId!) : Promise.resolve(null),
    ])
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId), company))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(id)) return json({ error: 'Invoice not found.' }, 404)
    const { data: inv, error } = invRes as any
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    const { data: job } = await db.from('jobs').select('id, number, title, status, address, contact_id, conversation_id, accepted_quote_id').eq('company_id', companyId!).eq('id', inv.job_id).maybeSingle()
    const [contact, conv] = await Promise.all([
      job?.contact_id ? db.from('contacts').select('id, name, email, phone').eq('company_id', companyId!).eq('id', job.contact_id).maybeSingle() : none,
      job?.conversation_id ? db.from('conversations').select('id, channel').eq('company_id', companyId!).eq('id', job.conversation_id).maybeSingle() : none,
    ])
    const settings = companySettings(company)
    const tz = companyTz(company)
    const today = todayIn(tz)
    return json({
      invoice: { ...inv, balance_cents: balanceOf(inv), overdue: isOverdue(inv, today) },
      payments: (payRes as any).data || [],
      job, contact: (contact as any).data || null, conversation: (conv as any).data || null,
      priceItems: (priceItems as any).data || [],
      settings, timezone: tz, today, reminderDays: REMINDER_DAYS,
      company: company ? { name: company.name, logo_url: company.logo_url, abn: company.abn_acn || null } : null,
      url: inv.public_token ? invoiceUrl(company, inv.public_token) : null,
      paymentsReady: stripeReady(company),
    })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not load the invoice.' }, 500)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const ok = isUuid(companyId) && isUuid(id)
    const [access, invRes, company] = await Promise.all([
      jobsAccess(req, db, companyId),
      ok ? db.from('job_invoices').select('*').eq('company_id', companyId).eq('id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ok ? loadCompany(db, companyId) : Promise.resolve(null),
    ])
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId), company))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(id)) return json({ error: 'Invoice not found.' }, 404)
    const { data: inv, error } = invRes as any
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    const settings = companySettings(company)
    const now = new Date().toISOString()

    if (body.dueDate !== undefined && body.dueDate && !DATE.test(String(body.dueDate))) return json({ error: 'Pick a valid due date.' }, 400)
    if (body.issueDate !== undefined && body.issueDate && !DATE.test(String(body.issueDate))) return json({ error: 'Pick a valid invoice date.' }, 400)

    // Sent: only the reminders switch and the due date (the customer's copy
    // of everything else stays as it was sent).
    if (inv.status !== 'draft') {
      if (inv.status === 'void') return json({ error: 'This invoice is void.' }, 409)
      const patch: any = { updated_at: now }
      if (typeof body.reminders === 'boolean') patch.reminders = body.reminders
      if (body.dueDate !== undefined && inv.status === 'sent') {
        if (!body.dueDate) return json({ error: 'A sent invoice needs a due date.' }, 400)
        patch.due_date = body.dueDate
        // A new due date starts the reminders again from the first one.
        if (body.dueDate !== inv.due_date) { patch.reminder_count = 0; patch.last_reminder_at = null }
      }
      if (Object.keys(patch).length === 1) return json({ error: 'This invoice has been sent, so only its due date and reminders can change.', invoice: inv }, 409)
      const { data: saved, error: uErr } = await db.from('job_invoices').update(patch).eq('company_id', companyId).eq('id', id).eq('status', inv.status).select('*')
      if (uErr) throw uErr
      if (!saved?.length) return json({ error: 'Someone else just changed this invoice. Refresh and try again.' }, 409)
      const label = invoiceLabel(settings, inv.number)
      const what = typeof body.reminders === 'boolean' ? `Reminders ${body.reminders ? 'on' : 'off'} for invoice ${label}` : `Due date of invoice ${label} changed to ${patch.due_date}`
      await logJobEvent(db, { companyId, jobId: inv.job_id, type: 'invoice_updated', actorId: access.userId, actorName: access.name, summary: what, data: { invoice_id: id } })
      return json({ invoice: saved[0] })
    }

    const items = body.items !== undefined ? body.items : inv.items
    const discount = body.discount !== undefined ? body.discount : { type: inv.discount_type, value: Number(inv.discount_value) }
    const incl = body.pricesIncludeTax !== undefined ? !!body.pricesIncludeTax : inv.prices_include_tax
    const money = quoteMoney({ items, discount, prices_include_tax: incl, tax_rate: effectiveTaxRate(settings) })
    const { deposit_type: _dt, deposit_value: _dv, deposit_cents: _dc, ...invMoney } = money
    const patch: any = { ...invMoney, updated_at: now }
    // The deposit credit can't be more than the invoice.
    patch.credit_cents = Math.min(Number(inv.credit_cents) || 0, money.total_cents)
    if (body.removeCredit === true) { patch.credit_cents = 0; patch.credit_label = null }
    if (body.title !== undefined) patch.title = clip(body.title, 160) || null
    if (body.intro !== undefined) patch.intro = clip(body.intro, 4000) || null
    if (body.terms !== undefined) patch.terms = clip(body.terms, 6000) || null
    if (body.issueDate !== undefined) patch.issue_date = body.issueDate || null
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null
    if (typeof body.reminders === 'boolean') patch.reminders = body.reminders
    const { data: saved, error: uErr } = await db.from('job_invoices').update(patch).eq('company_id', companyId).eq('id', id).eq('status', 'draft').select('*')
    if (uErr) throw uErr
    if (!saved?.length) return json({ error: 'This invoice was just sent by someone else, so it can’t be edited now.' }, 409)
    if (body.logSave) await audit(req, db, companyId, 'invoice_updated', `Saved invoice ${invoiceLabel(settings, inv.number)}`, { invoice_id: id, job_id: inv.job_id })
    return json({ invoice: saved[0] })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not save the invoice.' }, 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId)))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(id)) return json({ error: 'Invoice not found.' }, 404)
    const { data: inv, error } = await db.from('job_invoices').select('id, job_id, number, status').eq('company_id', companyId!).eq('id', id).maybeSingle()
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    if (inv.status !== 'draft') return json({ error: 'Only a draft can be deleted. Void a sent invoice instead.' }, 409)
    const { data: gone } = await db.from('job_invoices').delete().eq('company_id', companyId!).eq('id', id).eq('status', 'draft').select('id')
    if (!gone?.length) return json({ error: 'This invoice was just sent, so it can’t be deleted.' }, 409)
    const settings = companySettings(await loadCompany(db, companyId!))
    await logJobEvent(db, { companyId: companyId!, jobId: inv.job_id, type: 'invoice_deleted', actorId: access.userId, actorName: access.name, summary: `Deleted draft invoice ${invoiceLabel(settings, inv.number)}` })
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not delete the invoice.' }, 500)
  }
}
