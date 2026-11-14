import { NextRequest } from 'next/server'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { stripeReady } from '@/lib/booking'
import { jobsDb, json, logJobEvent, loadCompany, companySettings, companyTz, todayIn } from '@/lib/jobs/server'
import {
  invoicesSetupNeeded, isMissingInvoiceSchema, invoiceLabel, balanceOf, amountDueOf, isOverdue, publicLines, invoicePayCheckout, verifyInvoicePayment,
} from '@/lib/jobs/invoices'

export const dynamic = 'force-dynamic'

// The customer's invoice link (/i/<token>). No sign-in: the long random token
// in the link is the key, so only what the customer needs is returned.
//   GET   ?session_id   the invoice (marks it viewed); back from paying,
//                       asks Stripe whether that payment went through
//   POST  { action: 'pay' }   a card payment link for what's owing

type Ctx = { params: Promise<{ token: string }> }
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/

async function load(db: any, token: string) {
  if (!TOKEN.test(token)) return null
  const { data: inv, error } = await db.from('job_invoices').select('*').eq('public_token', token).maybeSingle()
  if (error) throw error
  if (!inv || inv.status === 'draft') return null
  const [{ data: job }, company] = await Promise.all([
    db.from('jobs').select('id, number, title, address, contact_id, conversation_id').eq('company_id', inv.company_id).eq('id', inv.job_id).maybeSingle(),
    loadCompany(db, inv.company_id),
  ])
  if (!job || !company) return null
  return { inv, job, company }
}

function view(inv: any, job: any, company: any, contact: any, payments: any[]) {
  const settings = companySettings(company)
  const today = todayIn(companyTz(company))
  const gst = settings.gst_registered && Number(inv.tax_rate) > 0
  return {
    business: {
      name: company.name, logo_url: company.logo_url || null, accent_color: company.accent_color || null,
      abn: company.abn_acn || null, phone: company.business_mobile || null, email: company.business_email || null,
      address: company.business_address || null, website: company.website || null,
    },
    invoice: {
      label: invoiceLabel(settings, inv.number), status: inv.status, overdue: isOverdue(inv, today),
      // An Australian tax invoice when the business charges GST; a plain invoice otherwise.
      tax_invoice: gst, title: inv.title, intro: inv.intro, terms: inv.terms,
      items: publicLines(inv.items),
      prices_include_tax: inv.prices_include_tax, tax_rate: Number(inv.tax_rate),
      gross_cents: Number(inv.gross_cents), discount_cents: Number(inv.discount_cents), subtotal_cents: Number(inv.subtotal_cents),
      tax_cents: Number(inv.tax_cents), total_cents: Number(inv.total_cents),
      credit_cents: Number(inv.credit_cents), credit_label: inv.credit_label,
      paid_cents: Number(inv.paid_cents), amount_due_cents: amountDueOf(inv), balance_cents: balanceOf(inv),
      issue_date: inv.issue_date, due_date: inv.due_date, paid_at: inv.paid_at, voided_at: inv.voided_at,
      payments: payments.map(p => ({ amount_cents: Number(p.amount_cents), method: p.method, paid_on: p.paid_on || String(p.created_at).slice(0, 10) })),
    },
    job: { title: job.title, address: job.address },
    customer: contact ? { name: contact.name || null } : null,
    paymentsReady: stripeReady(company),
  }
}

async function extras(db: any, inv: any, job: any) {
  const [{ data: contact }, { data: payments }] = await Promise.all([
    job.contact_id ? db.from('contacts').select('name').eq('id', job.contact_id).eq('company_id', inv.company_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('job_invoice_payments').select('amount_cents, method, paid_on, created_at').eq('invoice_id', inv.id).order('created_at'),
  ])
  return { contact, payments: payments || [] }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    if (!checkBurst(`i-view:${callerKey(req)}`, 60)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const db = jobsDb()
    const hit = await load(db, token)
    if (!hit) return json({ error: 'This invoice link isn’t valid. Ask the business to send it again.' }, 404)
    let { inv } = hit
    const { job, company } = hit

    // Back from paying: ask Stripe (never trust the return alone).
    const sessionId = req.nextUrl.searchParams.get('session_id') || ''
    let paid = false
    if (sessionId && inv.status === 'sent') {
      try { paid = (await verifyInvoicePayment(db, company, inv, sessionId)).paid } catch {}
      if (paid) { const { data } = await db.from('job_invoices').select('*').eq('id', inv.id).maybeSingle(); if (data) inv = data }
    }

    // First open by the customer.
    if (!inv.viewed_at && inv.status !== 'void' && req.nextUrl.searchParams.get('preview') !== '1') {
      const now = new Date().toISOString()
      const { data: first } = await db.from('job_invoices').update({ viewed_at: now }).eq('id', inv.id).is('viewed_at', null).select('id')
      if (first?.length) {
        inv.viewed_at = now
        await logJobEvent(db, { companyId: inv.company_id, jobId: job.id, type: 'invoice_viewed', actorType: 'customer', summary: `Customer opened invoice ${invoiceLabel(companySettings(company), inv.number)}`, data: { invoice_id: inv.id } })
      }
    }
    const { contact, payments } = await extras(db, inv, job)
    const { accountLink } = await import('@/lib/portal/auth')
    const accountUrl = job.contact_id ? await accountLink(db, company, { i: inv.public_token }) : null
    return json({ ...view(inv, job, company, contact, payments), justPaid: paid, accountUrl })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: 'This invoice couldn’t be loaded. Please try again.' }, 500)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    if (!checkBurst(`i-act:${callerKey(req)}`, 10)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const body = await req.json().catch(() => ({}))
    const db = jobsDb()
    const hit = await load(db, token)
    if (!hit) return json({ error: 'This invoice link isn’t valid. Ask the business to send it again.' }, 404)
    const { inv, job, company } = hit
    if (body.action !== 'pay') return json({ error: 'Unknown action.' }, 400)
    const r = await invoicePayCheckout(db, company, inv, job)
    if ('error' in r) return json({ error: r.error }, r.status)
    return json({ payUrl: r.url })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: 'Something went wrong. Please try again, or contact the business.' }, 500)
  }
}
