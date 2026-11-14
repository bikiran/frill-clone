import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { cleanLines } from '@/lib/jobs/quote-math'
import {
  jobsDb, jobsAccess, json, isUuid, nextNumber, logJobEvent, loadCompany, companySettings, companyTz, todayIn, quoteMoney, clip,
} from '@/lib/jobs/server'
import { moneyAllowed, MONEY_DENIED } from '@/lib/jobs/field'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { invoicesSetupNeeded, isMissingInvoiceSchema, invoiceDefaults, invoiceLabel, balanceOf, isOverdue } from '@/lib/jobs/invoices'

export const dynamic = 'force-dynamic'

// Invoices for Jobs & quotes.
//   GET  ?companyId&status=owing|overdue|paid|draft|all   the list, with totals
//   POST { companyId, jobId, blank? }   a new draft invoice for a job
//
// A new invoice starts from the job's accepted quote (its items, discount and
// GST setting) less a deposit already paid on it, the first time. Once an
// invoice has been made from that quote (and not voided), the next one starts
// blank, so the same work and the same deposit are never billed twice.

const LIST_COLS = 'id, job_id, number, status, title, total_cents, credit_cents, paid_cents, issue_date, due_date, sent_at, sent_via, viewed_at, paid_at, reminder_count, last_reminder_at, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const db = jobsDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const ok = isUuid(companyId)
    const [access, company, res] = await Promise.all([
      jobsAccess(req, db, companyId),
      ok ? loadCompany(db, companyId!) : Promise.resolve(null),
      ok ? db.from('job_invoices').select(LIST_COLS).eq('company_id', companyId!).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: null, error: null }),
    ])
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId), company))) return json({ error: MONEY_DENIED }, 403)
    const { data, error } = res as any
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }
    const settings = companySettings(company)
    const today = todayIn(companyTz(company))
    const all: any[] = data || []

    // Each invoice's job and customer, for the list.
    const jobIds = [...new Set(all.map(i => i.job_id))]
    const { data: jobs } = jobIds.length ? await db.from('jobs').select('id, number, title, contact_id').eq('company_id', companyId!).in('id', jobIds) : { data: [] }
    const contactIds = [...new Set((jobs || []).map((j: any) => j.contact_id).filter(Boolean))]
    const { data: contacts } = contactIds.length ? await db.from('contacts').select('id, name, phone, email').eq('company_id', companyId!).in('id', contactIds) : { data: [] }
    const jobOf = new Map((jobs || []).map((j: any) => [j.id, j]))
    const contactOf = new Map((contacts || []).map((c: any) => [c.id, c]))
    const rows = all.map(i => {
      const j: any = jobOf.get(i.job_id) || null
      const c: any = j?.contact_id ? contactOf.get(j.contact_id) || null : null
      return { ...i, balance_cents: balanceOf(i), overdue: isOverdue(i, today), job: j ? { id: j.id, number: j.number, title: j.title } : null, customer: c ? { name: c.name || c.phone || c.email || null } : null }
    })

    const sum = (list: any[]) => list.reduce((s, i) => s + i.balance_cents, 0)
    const owing = rows.filter(i => i.status === 'sent')
    const overdue = owing.filter(i => i.overdue)
    const monthStart = `${today.slice(0, 7)}-01`
    const paidThisMonth = rows.filter(i => i.status === 'paid' && i.paid_at && String(i.paid_at).slice(0, 10) >= monthStart)
    const totals = {
      owing_cents: sum(owing), owing: owing.length,
      overdue_cents: sum(overdue), overdue: overdue.length,
      paid_month_cents: paidThisMonth.reduce((s, i) => s + Math.max(0, Number(i.total_cents) - Number(i.credit_cents)), 0), paid_month: paidThisMonth.length,
      drafts: rows.filter(i => i.status === 'draft').length,
    }
    const status = String(req.nextUrl.searchParams.get('status') || 'all')
    const shown = status === 'owing' ? owing : status === 'overdue' ? overdue : status === 'paid' ? rows.filter(i => i.status === 'paid')
      : status === 'draft' ? rows.filter(i => i.status === 'draft') : rows
    return json({ invoices: shown, totals, today, prefix: settings.invoice_prefix, jobPrefix: settings.job_prefix })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not load the invoices.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId)))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(body.jobId)) return json({ error: 'Which job?' }, 400)

    const { data: job } = await db.from('jobs').select('id, number, title, status, accepted_quote_id').eq('company_id', companyId).eq('id', body.jobId).maybeSingle()
    if (!job) return json({ error: 'Job not found.' }, 404)
    if (job.status === 'cancelled') return json({ error: 'This job is cancelled. Reopen it before invoicing.' }, 409)

    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const d = invoiceDefaults(settings, companyTz(company))

    // The accepted quote, unless an invoice already came from it.
    const { data: existing, error: exErr } = await db.from('job_invoices').select('id, quote_id, status, credit_cents').eq('company_id', companyId).eq('job_id', job.id)
    if (exErr) { if (isMissingInvoiceSchema(exErr)) return invoicesSetupNeeded(); throw exErr }
    const live = (existing || []).filter((i: any) => i.status !== 'void')
    let quote: any = null
    if (!body.blank && isUuid(job.accepted_quote_id) && !live.some((i: any) => i.quote_id === job.accepted_quote_id)) {
      const { data: q } = await db.from('job_quotes').select('*').eq('company_id', companyId).eq('id', job.accepted_quote_id).maybeSingle()
      if (q?.status === 'accepted') quote = q
    }
    // A deposit already paid comes off, once across the job's invoices.
    const depositTaken = live.some((i: any) => Number(i.credit_cents) > 0)
    const credit = quote && quote.deposit_status === 'paid' && !depositTaken ? Math.max(0, Number(quote.deposit_cents) || 0) : 0

    const content = quote
      ? { title: quote.title || job.title, intro: '', items: cleanLines(quote.items).map((l, i) => ({ ...l, id: `l${Date.now().toString(36)}${i}` })), discount: { type: quote.discount_type, value: Number(quote.discount_value) }, incl: !!quote.prices_include_tax }
      : { title: job.title, intro: '', items: [], discount: { type: 'none', value: 0 }, incl: settings.prices_include_tax }
    const money = quoteMoney({ items: content.items, discount: content.discount, prices_include_tax: content.incl, tax_rate: effectiveTaxRate(settings) })
    const { deposit_type: _dt, deposit_value: _dv, deposit_cents: _dc, ...invMoney } = money

    const number = await nextNumber(db, companyId, 'invoice')
    const row = {
      company_id: companyId, job_id: job.id, quote_id: quote?.id || null, number, status: 'draft',
      title: clip(content.title, 160) || null, intro: null, terms: clip(d.terms, 6000) || null,
      ...invMoney, credit_cents: Math.min(credit, money.total_cents), credit_label: credit > 0 ? `Deposit paid on quote ${settings.quote_prefix}-${quote.number}` : null,
      issue_date: d.issue_date, due_date: d.due_date, reminders: settings.invoice_reminders, created_by: access.userId,
    }
    const { data: inv, error } = await db.from('job_invoices').insert(row).select('*').maybeSingle()
    if (error) { if (isMissingInvoiceSchema(error)) return invoicesSetupNeeded(); throw error }

    const label = invoiceLabel(settings, number)
    const summary = `Created invoice ${label}${quote ? ` from quote ${settings.quote_prefix}-${quote.number}` : ''}${credit > 0 ? ' (less the deposit paid)' : ''}`
    await db.from('jobs').update({ updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', job.id)
    await logJobEvent(db, { companyId, jobId: job.id, type: 'invoice_created', actorId: access.userId, actorName: access.name, summary, data: { invoice_id: inv.id } })
    await audit(req, db, companyId, 'invoice_created', `${summary} (job ${settings.job_prefix}-${job.number})`, { job_id: job.id, invoice_id: inv.id })
    return json({ invoice: inv })
  } catch (e: any) {
    if (isMissingInvoiceSchema(e)) return invoicesSetupNeeded()
    return json({ error: e?.message || 'Could not create the invoice.' }, 500)
  }
}
