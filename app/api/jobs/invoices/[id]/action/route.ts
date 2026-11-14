import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { fmtMoney, inputToCents } from '@/lib/jobs/quote-math'
import { jobsDb, jobsAccess, json, isUuid, logJobEvent, loadCompany, companySettings, companyTz, todayIn, clip } from '@/lib/jobs/server'
import { moneyAllowed, MONEY_DENIED } from '@/lib/jobs/field'
import {
  invoicesSetupNeeded, isMissingInvoiceSchema, invoiceLabel, invoicePayment, afterPayment, invoicePayCheckout, closeInvoicePayLink, balanceOf, METHOD_LABEL, PAYMENT_METHODS,
} from '@/lib/jobs/invoices'

export const dynamic = 'force-dynamic'

// POST { companyId, action, ... } on one invoice:
//   record_payment { amount ("123.45"), method, note?, paidOn? }   cash, bank transfer…
//   remove_payment { paymentRowId }   a payment recorded by mistake (not a card payment)
//   void { reason? }                  cancel a sent invoice (its link says so)
//   pay_link                          a card payment link for what's owing, to copy

type Ctx = { params: Promise<{ id: string }> }
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId)))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(id)) return json({ error: 'Invoice not found.' }, 404)
    const { data: inv, error } = await db.from('job_invoices').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const label = invoiceLabel(settings, inv.number)
    const action = String(body.action || '')

    if (action === 'record_payment') {
      const cents = typeof body.amount === 'number' ? Math.round(body.amount) : inputToCents(String(body.amount ?? ''))
      const method = (PAYMENT_METHODS as readonly string[]).includes(body.method) ? String(body.method) : 'other'
      const paidOn = DATE.test(String(body.paidOn || '')) ? String(body.paidOn) : todayIn(companyTz(company))
      if (!(cents > 0)) return json({ error: 'Enter the amount paid.' }, 400)
      const r = await invoicePayment(db, { invoiceId: id, action: 'add', cents, method, note: clip(body.note, 500) || null, paidOn, actorId: access.userId, actorName: access.name })
      if (!r.ok) {
        const msg = r.reason === 'too_much' ? `That’s more than the ${fmtMoney(r.balance_cents)} owing.`
          : r.reason === 'nothing_owing' ? 'Nothing is owing on this invoice.'
          : r.reason === 'not_open' ? 'Send the invoice before recording a payment on it.'
          : 'That payment couldn’t be recorded.'
        return json({ error: msg }, 409)
      }
      await afterPayment(db, company, inv, r, { amount: cents, method, actorType: 'staff', actorId: access.userId, actorName: access.name })
      await audit(req, db, companyId, 'invoice_payment', `Recorded ${fmtMoney(cents)} (${METHOD_LABEL[method]}) on invoice ${label}`, { invoice_id: id, job_id: inv.job_id })
      return json({ ok: true, ...r })
    }

    if (action === 'remove_payment') {
      if (!isUuid(body.paymentRowId)) return json({ error: 'Which payment?' }, 400)
      const r = await invoicePayment(db, { invoiceId: id, action: 'remove', rowId: body.paymentRowId, actorId: access.userId, actorName: access.name })
      if (!r.ok) return json({ error: r.reason === 'payment_not_found' ? 'That payment isn’t on this invoice, or it was a card payment (refund those in Payments).' : 'That payment couldn’t be removed.' }, 409)
      await logJobEvent(db, { companyId, jobId: inv.job_id, type: 'invoice_payment_removed', actorId: access.userId, actorName: access.name, summary: `Removed a ${fmtMoney(r.amount_cents)} payment from invoice ${label}${r.balance_cents ? ` · ${fmtMoney(r.balance_cents)} owing` : ''}`, data: { invoice_id: id } })
      await audit(req, db, companyId, 'invoice_payment', `Removed a ${fmtMoney(r.amount_cents)} payment from invoice ${label}`, { invoice_id: id, job_id: inv.job_id })
      return json({ ok: true, ...r })
    }

    if (action === 'void') {
      if (inv.status === 'draft') return json({ error: 'Delete a draft instead.' }, 409)
      if (inv.status === 'void') return json({ ok: true })
      if (Number(inv.paid_cents) > 0) return json({ error: 'Payments have been taken on this invoice. Remove recorded payments (or refund card payments) first.' }, 409)
      const reason = clip(body.reason, 300) || null
      const now = new Date().toISOString()
      const { data: done } = await db.from('job_invoices').update({ status: 'void', voided_at: now, void_reason: reason, updated_at: now }).eq('company_id', companyId).eq('id', id).eq('status', inv.status).eq('paid_cents', 0).select('id')
      if (!done?.length) return json({ error: 'Someone else just changed this invoice. Refresh and try again.' }, 409)
      // Its open card link (if any) is closed, so it can't be paid now.
      await closeInvoicePayLink(db, company, inv)
      await logJobEvent(db, { companyId, jobId: inv.job_id, type: 'invoice_voided', actorId: access.userId, actorName: access.name, summary: `Voided invoice ${label}${reason ? `: ${reason}` : ''}`, data: { invoice_id: id } })
      await audit(req, db, companyId, 'invoice_voided', `Voided invoice ${label}${reason ? `: ${reason}` : ''}`, { invoice_id: id, job_id: inv.job_id })
      return json({ ok: true })
    }

    if (action === 'pay_link') {
      if (balanceOf(inv) <= 0) return json({ error: 'Nothing is owing on this invoice.' }, 409)
      const { data: job } = await db.from('jobs').select('id, contact_id, conversation_id').eq('company_id', companyId).eq('id', inv.job_id).maybeSingle()
      const r = await invoicePayCheckout(db, company, inv, job)
      if ('error' in r) return json({ error: r.error }, r.status)
      return json({ url: r.url })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not do that.' }, 500)
  }
}
