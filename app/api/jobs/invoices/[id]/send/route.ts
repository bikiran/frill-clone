import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { fmtMoney } from '@/lib/jobs/quote-math'
import {
  jobsDb, jobsAccess, json, isUuid, logJobEvent, emitJobEvent, loadCompany, companySettings, companyTz, todayIn, newPublicToken, clip,
} from '@/lib/jobs/server'
import { addDays } from '@/lib/booking-time'
import { moneyAllowed, MONEY_DENIED } from '@/lib/jobs/field'
import {
  invoicesSetupNeeded, isMissingInvoiceSchema, invoiceUrl, invoiceLabel, invoiceMessage, deliverInvoice, balanceOf, amountDueOf,
} from '@/lib/jobs/invoices'

export const dynamic = 'force-dynamic'

// POST { companyId, channel: 'sms' | 'email' | 'link', message?, to?, subject?, reminder?, preview? }
// Send an invoice: give it its private link, mark it Sent (or Paid, when a
// deposit already covers it), and text or email the customer, or just hand
// back the link. Sending a sent invoice again re-sends it; reminder: true
// words it as a reminder. preview: true returns the message and where it
// would go, sending nothing.

type Ctx = { params: Promise<{ id: string }> }

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
    const channel = ['sms', 'email', 'link'].includes(body.channel) ? body.channel as 'sms' | 'email' | 'link' : 'link'

    const { data: inv, error } = await db.from('job_invoices').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    if (inv.status === 'void') return json({ error: 'This invoice is void, so it can’t be sent.' }, 409)
    if (!Array.isArray(inv.items) || !inv.items.length) return json({ error: 'Add at least one line before sending.' }, 400)
    const reminder = body.reminder === true
    if (reminder && (inv.status !== 'sent' || balanceOf(inv) <= 0)) return json({ error: 'Only an invoice with something still owing needs a reminder.' }, 409)

    const { data: job } = await db.from('jobs').select('id, number, title, status, contact_id, conversation_id').eq('company_id', companyId).eq('id', inv.job_id).maybeSingle()
    if (!job) return json({ error: 'Job not found.' }, 404)
    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const today = todayIn(companyTz(company))
    const label = invoiceLabel(settings, inv.number)
    const { data: contact } = job.contact_id ? await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).eq('id', job.contact_id).maybeSingle() : { data: null }

    // The private link is made once and kept, so the previewed message (with
    // its link) is the one that goes. A draft's link opens nothing yet.
    let token = inv.public_token as string | null
    if (!token) {
      await db.from('job_invoices').update({ public_token: newPublicToken() }).eq('company_id', companyId).eq('id', id).is('public_token', null)
      const { data: t } = await db.from('job_invoices').select('public_token').eq('company_id', companyId).eq('id', id).maybeSingle()
      token = t?.public_token || null
      if (!token) return json({ error: 'Couldn’t make the invoice’s link. Please try again.' }, 500)
    }
    const url = invoiceUrl(company, token)
    // A draft without dates gets them now (today, and the business's terms).
    const issueDate = inv.issue_date || today
    const dueDate = inv.due_date || addDays(issueDate, settings.payment_terms_days)
    const willBe = { ...inv, public_token: token, issue_date: issueDate, due_date: dueDate, status: inv.status === 'draft' ? 'sent' : inv.status }
    const to = clip(body.to, 200) || (channel === 'sms' ? contact?.phone : channel === 'email' ? contact?.email : '') || ''
    const message = clip(body.message, 1500) || invoiceMessage({ company, contact, invoice: willBe, url, prefix: settings.invoice_prefix, kind: reminder ? 'reminder' : 'invoice', today })
    const subject = clip(body.subject, 200) || (reminder ? `Reminder: invoice ${label} from ${company?.name || 'us'}` : `Invoice ${label} from ${company?.name || 'us'}`)
    if (body.preview) return json({ to, message, subject, url })

    if (channel !== 'link') {
      if (!to) return json({ error: channel === 'sms' ? 'Add a mobile number for this customer first.' : 'Add an email address for this customer first.' }, 400)
      if (!message.includes(url)) return json({ error: 'Keep the invoice link in the message so they can open it.' }, 400)
      if (await isExternalSendBlocked(companyId, db)) return json({ error: 'Sending is switched off in this demo workspace. Copy the link instead.' }, 403)
    }

    // 1. The link and the Sent status first (compare-and-set), so the
    //    customer never gets a link to an invoice that isn't open yet.
    const now = new Date().toISOString()
    const wasDraft = inv.status === 'draft'
    const patch: any = { public_token: token, updated_at: now, sent_via: channel, issue_date: issueDate, due_date: dueDate }
    if (wasDraft) {
      patch.sent_at = now
      // Nothing to pay (a deposit covered it): it's a paid invoice from the start.
      if (amountDueOf(inv) <= 0) { patch.status = 'paid'; patch.paid_at = now } else patch.status = 'sent'
    }
    if (reminder) { patch.last_reminder_at = now }
    const { data: sent, error: sErr } = await db.from('job_invoices').update(patch).eq('company_id', companyId).eq('id', id).eq('status', inv.status).select('*')
    if (sErr) throw sErr
    if (!sent?.length) return json({ error: 'Someone else just changed this invoice. Refresh and try again.' }, 409)

    // 2. Deliver it.
    let delivered = channel === 'link', deliveryError = ''
    if (channel !== 'link') {
      const r = await deliverInvoice(db, {
        origin: req.nextUrl.origin, company, invoice: sent[0], job, contact, channel, to, message, subject, url,
        senderName: access.name, kind: reminder ? 'reminder' : wasDraft ? 'new' : 'resent', today,
      })
      delivered = r.delivered; deliveryError = r.error
    }

    const via = channel === 'sms' ? 'by text' : channel === 'email' ? 'by email' : 'as a link'
    const verb = reminder ? 'Sent a reminder for' : wasDraft ? 'Sent' : 'Re-sent'
    const summary = `${verb} invoice ${label} ${via}${channel !== 'link' && to ? ` to ${to}` : ''} (${fmtMoney(balanceOf(sent[0]))} owing)${delivered ? '' : ' — delivery failed'}`
    await logJobEvent(db, { companyId, jobId: job.id, type: reminder ? 'invoice_reminder' : wasDraft ? 'invoice_sent' : 'invoice_resent', actorId: access.userId, actorName: access.name, summary, data: { invoice_id: id, channel, to: to || null, delivered, error: deliveryError || null } })
    await audit(req, db, companyId, 'invoice_sent', summary, { job_id: job.id, invoice_id: id, channel })
    if (wasDraft) {
      emitJobEvent(companyId, 'invoice.sent', {
        title: `Invoice ${label} sent`, summary: `${job.title} · ${fmtMoney(amountDueOf(inv))}`, jobId: job.id,
        customer: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : null,
        fields: { 'Amount due': fmtMoney(amountDueOf(inv)), Due: dueDate, Via: channel }, dedupeKey: `invoice.sent:${id}`,
      }, db)
    }
    return json({ invoice: sent[0], url, delivered, warning: deliveryError || null })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not send the invoice.' }, 500)
  }
}
