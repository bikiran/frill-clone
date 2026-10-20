// Colvy's tax invoices: issuing, finding and sending them. Server only
// (service-role client). The document itself is built in lib/tax-invoice-core
// and drawn by lib/tax-invoice-render.
//
// Every successful charge to a business gets one document, numbered
// CLV-000123 by issue_tax_invoice (migrations/COLVY_V404_TAX_INVOICES.sql),
// keyed on the Stripe invoice or PaymentIntent so it's issued once however
// many times it's asked for:
//   • the Stripe webhook issues it when the payment succeeds (issueForEvent):
//       checkout.session.completed   SMS credit, a porting fee (payment mode),
//                                    and the first invoice of a plan, add-on,
//                                    number or ported-number subscription
//       invoice.paid / payment_succeeded   every subscription renewal, and
//                                    invoices Colvy sends by hand (Enterprise)
//       payment_intent.succeeded     SMS credit auto top-ups (off-session)
//       charge.refunded              records a refund on an issued document
//     and emails the billing contact a link (once);
//   • opening an older payment from Billing → Billing history issues it then
//     (ensureForRef), after checking the payment is this business's.
// Connected-account events (a business's own customers paying it) never make
// a Colvy invoice.
//
// Before V404 runs nothing here throws: issuing answers not_set_up, the page
// shows the document built live from Stripe with its Stripe reference, and
// nothing is emailed.

import { cleanAbn } from '@/lib/abn'
import {
  buyerFromStripe, buyerParty, colvySupplier, docFromPaymentIntent, docFromStripeInvoice, docTitle, docToRow, fmtAud,
  fmtInvoiceDate, refundsOf, rowToDoc, sid, sourceForPayment, statusFor, stripeInvoiceCustomFields, stripeInvoiceFooter,
  type InvoiceLine, type InvoiceSource, type Party, type StripeBuyer, type TaxInvoiceDoc,
} from '@/lib/tax-invoice-core'

export const isMissing = (e: any) => /does not exist|schema cache|Could not find|PGRST20[0-5]|42P01|42703|42883/i.test(String(e?.message || e?.code || e || ''))

/** Colvy's own Stripe client, or null when STRIPE_SECRET_KEY isn't set up. */
export async function colvyStripe(): Promise<any | null> {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
  if (!/^sk_(live|test)_\w+/.test(key)) return null
  const Stripe = (await import('stripe')).default
  return new Stripe(key, { apiVersion: '2024-06-20' as any })
}

// ── the business's billing details ─────────────────────────────────────────

export type BillingAddress = { line1?: string; line2?: string; suburb?: string; state?: string; postcode?: string; country?: string }
export type BillingDetails = {
  /** V404's columns exist (details can be saved). */
  ready: boolean
  companyId: string
  companyName: string
  slug: string | null
  ownerId: string | null
  ownerEmail: string | null
  legalName: string | null
  abn: string | null
  email: string | null
  address: BillingAddress | null
  /** The business profile's address (V118 business_address), used until billing details are saved. */
  profileAddress: string | null
}

const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

export function addressToLines(a: BillingAddress | null | undefined): string[] {
  if (!a || typeof a !== 'object') return []
  const town = [a.suburb, a.state, a.postcode].map(s => str(s)).filter(Boolean).join(' ')
  const country = str(a.country)
  return [str(a.line1), str(a.line2), town, country && !/^(au|australia)$/i.test(country) ? country : ''].filter(Boolean)
}

async function ownerEmailOf(db: any, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null
  try { const { data } = await db.auth.admin.getUserById(ownerId); return data?.user?.email || null } catch { return null }
}

export async function getBillingDetails(db: any, companyId: string): Promise<BillingDetails | null> {
  let co: any = null
  try { const { data } = await db.from('companies').select('*').eq('id', companyId).maybeSingle(); co = data } catch {}
  if (!co) return null
  const ready = 'billing_abn' in co || 'billing_legal_name' in co
  // Until the business saves its billing details, a valid ABN typed in its
  // business profile (V118 abn_acn) is used. Once saved, only what it saved.
  const saved = !!(co.billing_legal_name || co.billing_abn || co.billing_email || co.billing_address)
  const abn = saved ? cleanAbn(co.billing_abn) : cleanAbn(co.abn_acn)
  return {
    ready, companyId: co.id, companyName: co.name || 'Your business', slug: co.slug || null,
    ownerId: co.owner_id || null, ownerEmail: await ownerEmailOf(db, co.owner_id || null),
    legalName: str(co.billing_legal_name) || null,
    abn,
    email: str(co.billing_email) || null,
    address: co.billing_address && typeof co.billing_address === 'object' ? co.billing_address : null,
    profileAddress: saved ? null : (str(co.business_address, 300) || null),
  }
}

/** The buyer as it goes on a document issued now. */
export function customerFromDetails(d: BillingDetails | null, fromStripe: StripeBuyer = {}): Party {
  if (!d) return buyerParty({}, fromStripe)
  return buyerParty({
    name: d.legalName || d.companyName,
    abn: d.abn,
    email: d.email || d.ownerEmail,
    address: d.address ? addressToLines(d.address) : d.profileAddress ? d.profileAddress.split(/\n|,\s*(?=[^,]*$)/).map(x => x.trim()).filter(Boolean) : [],
  }, fromStripe)
}

export type DetailsInput = { legalName?: unknown; abn?: unknown; email?: unknown; address?: any }

export type DetailsRow = { billing_legal_name: string | null; billing_abn: string | null; billing_email: string | null; billing_address: BillingAddress | null }
export function validateDetails(input: DetailsInput): { ok: boolean; value?: DetailsRow; errors?: Record<string, string> } {
  const errors: Record<string, string> = {}
  const legalName = str(input.legalName, 160)
  const email = str(input.email, 200).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter an email address like accounts@yourbusiness.com.au.'
  const abnRaw = str(input.abn, 30)
  let abn: string | null = null
  if (abnRaw) {
    const d = abnRaw.replace(/[\s-]/g, '')
    if (!/^\d{11}$/.test(d)) errors.abn = 'An ABN has 11 digits, e.g. 51 824 753 556.'
    else if (!cleanAbn(d)) errors.abn = 'That ABN isn’t valid. Check it on the ABN Lookup.'
    else abn = d
  }
  const a = input.address && typeof input.address === 'object' ? input.address : {}
  const address: BillingAddress = {
    line1: str(a.line1, 160), line2: str(a.line2, 160), suburb: str(a.suburb, 80),
    state: str(a.state, 20).toUpperCase(), postcode: str(a.postcode, 10), country: str(a.country, 40) || 'AU',
  }
  if (address.postcode && !/^\d{4}$/.test(address.postcode) && /^(au|australia)$/i.test(address.country || 'AU')) errors.postcode = 'An Australian postcode has 4 digits.'
  if (address.state && !['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].includes(address.state) && /^(au|australia)$/i.test(address.country || 'AU')) errors.state = 'Choose a state or territory.'
  if (Object.keys(errors).length) return { ok: false, errors }
  const hasAddress = !!(address.line1 || address.suburb || address.postcode)
  return { ok: true, value: { billing_legal_name: legalName || null, billing_abn: abn, billing_email: email || null, billing_address: hasAddress ? address : null } }
}

// ── which Stripe customers are this business's ─────────────────────────────

/**
 * The business's Colvy billing customers in Stripe: the owner's plan customer,
 * the SMS credit wallet's, any already on its issued documents, and (when the
 * owner runs only this one workspace) customers Checkout made for the owner's
 * email, such as a number purchase's.
 */
export async function companyCustomers(db: any, stripe: any | null, companyId: string, d?: BillingDetails | null): Promise<string[]> {
  const out = new Set<string>()
  const details = d === undefined ? await getBillingDetails(db, companyId) : d
  const add = (v: any) => { const s = sid(v); if (s && s.startsWith('cus_')) out.add(s) }
  try {
    if (details?.ownerId) {
      const { data } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', details.ownerId).maybeSingle()
      add(data?.stripe_customer_id)
    }
  } catch {}
  try { const { data } = await db.from('sms_credit_accounts').select('stripe_customer_id').eq('company_id', companyId).maybeSingle(); add(data?.stripe_customer_id) } catch {}
  try {
    const { data } = await db.from('tax_invoices').select('stripe_customer_id').eq('company_id', companyId).limit(200)
    for (const r of data || []) add(r.stripe_customer_id)
  } catch {}
  if (stripe && details?.ownerId) {
    let only = false
    try { const { data } = await db.from('companies').select('id').eq('owner_id', details.ownerId).limit(2); only = (data || []).length === 1 } catch {}
    const emails = [...new Set([details.ownerEmail, details.email].filter(Boolean) as string[])]
    if (only) for (const email of emails.slice(0, 2)) {
      try { const list = await stripe.customers.list({ email, limit: 10 }); for (const c of list?.data || []) add(c.id) } catch {}
    }
  }
  return [...out].slice(0, 12)
}

/** The company a Stripe invoice is for, or null. */
export async function resolveInvoiceCompany(db: any, inv: any, stripe?: any | null): Promise<string | null> {
  const metas = [inv?.metadata, inv?.subscription_details?.metadata, inv?.parent?.subscription_details?.metadata, inv?.lines?.data?.[0]?.metadata, typeof inv?.subscription === 'object' ? inv.subscription?.metadata : null]
  for (const m of metas) if (m?.companyId) return String(m.companyId)
  const subId = sid(inv?.subscription) || sid(inv?.parent?.subscription_details?.subscription)
  const custId = sid(inv?.customer)
  const one = async (q: () => PromiseLike<any>, key = 'company_id') => { try { const { data } = await q(); const r = Array.isArray(data) ? data[0] : data; return r?.[key] ? String(r[key]) : null } catch { return null } }
  // An earlier document for the same subscription or customer.
  if (subId) { const c = await one(() => db.from('tax_invoices').select('company_id').eq('stripe_subscription_id', subId).limit(1)); if (c) return c }
  if (subId) {
    for (const t of ['porting_requests', 'twilio_integrations', 'telnyx_integrations']) {
      const c = await one(() => db.from(t).select('company_id').eq('stripe_subscription_id', subId).limit(1)); if (c) return c
    }
  }
  // The plan subscription: subscriptions → its owner's workspace.
  const ors = [subId ? `stripe_subscription_id.eq.${subId}` : '', custId ? `stripe_customer_id.eq.${custId}` : ''].filter(Boolean).join(',')
  if (ors) {
    const userId = await one(() => db.from('subscriptions').select('user_id').or(ors).limit(1), 'user_id')
    if (userId) { const c = await one(() => db.from('companies').select('id').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1), 'id'); if (c) return c }
  }
  if (custId) {
    const c = await one(() => db.from('tax_invoices').select('company_id').eq('stripe_customer_id', custId).limit(1)); if (c) return c
    const w = await one(() => db.from('sms_credit_accounts').select('company_id').eq('stripe_customer_id', custId).limit(1)); if (w) return w
  }
  // The Checkout that started the subscription says whose it is.
  if (stripe && subId) {
    try {
      const list = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 })
      const m = list?.data?.[0]?.metadata || {}
      if (m.companyId) return String(m.companyId)
      if (m.userId) { const c = await one(() => db.from('companies').select('id').eq('owner_id', m.userId).order('created_at', { ascending: true }).limit(1), 'id'); if (c) return c }
    } catch {}
  }
  return null
}

// ── issuing ─────────────────────────────────────────────────────────────────

export type IssueResult = { ok: boolean; created: boolean; stored: boolean; doc: TaxInvoiceDoc | null; reason?: string }

/** Store the document (numbering it) through issue_tax_invoice; the existing one if already issued. */
export async function storeDoc(db: any, companyId: string, doc: TaxInvoiceDoc): Promise<IssueResult> {
  if (!(doc.totalCents > 0)) return { ok: false, created: false, stored: false, doc, reason: 'nothing_paid' }
  try {
    const { data, error } = await db.rpc('issue_tax_invoice', { p_company: companyId, p_doc: docToRow(doc) })
    if (error) return { ok: false, created: false, stored: false, doc, reason: isMissing(error) ? 'not_set_up' : 'error' }
    if (!data?.ok || !data.invoice) return { ok: false, created: false, stored: false, doc, reason: data?.reason || 'error' }
    const row = data.invoice
    if (String(row.company_id) !== String(companyId)) return { ok: false, created: false, stored: true, doc: null, reason: 'other_company' }
    return { ok: true, created: !!data.created, stored: true, doc: rowToDoc(row) }
  } catch (e: any) {
    return { ok: false, created: false, stored: false, doc, reason: isMissing(e) ? 'not_set_up' : 'error' }
  }
}

async function expandCharge(stripe: any | null, charge: any): Promise<any | null> {
  if (charge && typeof charge === 'object') return charge
  const id = sid(charge)
  if (!stripe || !id) return null
  try { return await stripe.charges.retrieve(id, { expand: ['refunds'] }) } catch { return null }
}

/** The charge behind an invoice (old API: invoice.charge; newer: its payment's intent). */
async function invoiceCharge(stripe: any | null, inv: any): Promise<any | null> {
  if (inv?.charge) return expandCharge(stripe, inv.charge)
  const piId = sid(inv?.payment_intent) || sid(inv?.payments?.data?.[0]?.payment?.payment_intent)
  if (!stripe || !piId) return null
  try { const pi = await stripe.paymentIntents.retrieve(piId); return expandCharge(stripe, pi?.latest_charge) } catch { return null }
}

export type IssueOpts = { companyId?: string | null; email?: boolean; buyer?: StripeBuyer; checkoutSessionId?: string | null; source?: InvoiceSource; lines?: InvoiceLine[]; details?: BillingDetails | null }

/** A paid Stripe invoice → its Colvy document. */
export async function issueForStripeInvoice(db: any, stripe: any | null, inv: any, o: IssueOpts = {}): Promise<IssueResult> {
  if (!inv?.id) return { ok: false, created: false, stored: false, doc: null, reason: 'invalid' }
  if (inv.status && inv.status !== 'paid') return { ok: false, created: false, stored: false, doc: null, reason: 'unpaid' }
  if (!(Number(inv.total) > 0) && !(Number(inv.amount_paid) > 0)) return { ok: false, created: false, stored: false, doc: null, reason: 'nothing_paid' }
  const companyId = o.companyId || await resolveInvoiceCompany(db, inv, stripe)
  if (!companyId) return { ok: false, created: false, stored: false, doc: null, reason: 'no_company' }
  const details = o.details !== undefined ? o.details : await getBillingDetails(db, companyId)
  const charge = await invoiceCharge(stripe, inv)
  const fromStripe = { ...buyerFromStripe(inv), ...(o.buyer || {}) }
  const doc = docFromStripeInvoice(inv, { supplier: colvySupplier(), customer: customerFromDetails(details, fromStripe), charge, source: o.source, checkoutSessionId: o.checkoutSessionId })
  if (!doc.stripe.paymentIntentId && charge?.payment_intent) doc.stripe.paymentIntentId = sid(charge.payment_intent)
  const r = await storeDoc(db, companyId, doc)
  if (r.created && o.email) await emailTaxInvoice(db, companyId, r.doc!, details).catch(e => console.error('[tax-invoices] email failed', e?.message))
  return r
}

/** A succeeded PaymentIntent with no Stripe invoice → its Colvy document. */
export async function issueForPaymentIntent(db: any, stripe: any | null, pi: any, o: IssueOpts = {}): Promise<IssueResult> {
  if (!pi?.id || pi.status !== 'succeeded') return { ok: false, created: false, stored: false, doc: null, reason: 'unpaid' }
  // Paid through a Stripe invoice: that invoice is the document.
  if (pi.invoice && stripe) {
    try { const inv = await stripe.invoices.retrieve(sid(pi.invoice)); return issueForStripeInvoice(db, stripe, inv, o) } catch {}
  }
  const companyId = o.companyId || (pi.metadata?.companyId ? String(pi.metadata.companyId) : null)
  if (!companyId) return { ok: false, created: false, stored: false, doc: null, reason: 'no_company' }
  const details = o.details !== undefined ? o.details : await getBillingDetails(db, companyId)
  const charge = await expandCharge(stripe, pi.latest_charge || pi.charges?.data?.[0])
  const doc = docFromPaymentIntent(pi, { supplier: colvySupplier(), customer: customerFromDetails(details, o.buyer || {}), charge, source: o.source, checkoutSessionId: o.checkoutSessionId, lines: o.lines })
  const r = await storeDoc(db, companyId, doc)
  if (r.created && o.email) await emailTaxInvoice(db, companyId, r.doc!, details).catch(e => console.error('[tax-invoices] email failed', e?.message))
  return r
}

// Checkout kinds that are Colvy charging the business (not a business's own customer paying it).
const COLVY_KINDS = new Set(['sms_credit', 'phone_number', 'ported_number', 'addon'])
export function isColvyCheckout(meta: any): boolean {
  if (!meta) return false
  if (COLVY_KINDS.has(String(meta.kind || ''))) return true
  return !meta.kind && !!meta.userId && !!meta.tier
}

async function ownersCompany(db: any, userId: string): Promise<string | null> {
  try {
    const { data } = await db.from('companies').select('id').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1)
    return data?.[0]?.id || null
  } catch { return null }
}

/** Point a Colvy customer's future Stripe invoices at Colvy's ABN (footer + custom field). Best effort. */
export async function applyColvyInvoiceSettings(stripe: any | null, customerId: string | null): Promise<boolean> {
  const footer = stripeInvoiceFooter()
  const fields = stripeInvoiceCustomFields()
  if (!stripe || !customerId || !footer) return false
  try { await stripe.customers.update(customerId, { invoice_settings: { footer, custom_fields: fields } }); return true } catch (e: any) {
    console.error('[tax-invoices] could not set invoice settings', e?.message)
    return false
  }
}

/** checkout.session.completed for a Colvy charge. */
export async function issueForCheckoutSession(db: any, stripe: any | null, session: any, o: { email?: boolean } = {}): Promise<IssueResult> {
  const meta = session?.metadata || {}
  if (!isColvyCheckout(meta)) return { ok: false, created: false, stored: false, doc: null, reason: 'not_colvy' }
  if (session.payment_status !== 'paid') return { ok: false, created: false, stored: false, doc: null, reason: 'unpaid' }
  const companyId = meta.companyId ? String(meta.companyId) : meta.userId ? await ownersCompany(db, String(meta.userId)) : null
  if (!companyId) return { ok: false, created: false, stored: false, doc: null, reason: 'no_company' }
  const buyer = buyerFromStripe(session.customer_details)
  const source: InvoiceSource | undefined = meta.kind === 'phone_number' ? 'phone_number' : meta.kind === 'ported_number' ? 'porting' : undefined
  if (session.mode === 'subscription') {
    await applyColvyInvoiceSettings(stripe, sid(session.customer))
    let inv: any = session.invoice && typeof session.invoice === 'object' ? session.invoice : null
    if (!inv && session.invoice && stripe) { try { inv = await stripe.invoices.retrieve(sid(session.invoice)) } catch {} }
    if (!inv) return { ok: false, created: false, stored: false, doc: null, reason: 'no_invoice' }
    return issueForStripeInvoice(db, stripe, inv, { companyId, email: o.email, buyer, checkoutSessionId: session.id, source })
  }
  const piId = sid(session.payment_intent)
  if (!piId) return { ok: false, created: false, stored: false, doc: null, reason: 'no_payment' }
  let pi: any = typeof session.payment_intent === 'object' ? session.payment_intent : null
  if (!pi && stripe) { try { pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] }) } catch {} }
  // Without Stripe at hand, the session itself says what was paid.
  if (!pi) pi = { id: piId, status: 'succeeded', amount: session.amount_total, amount_received: session.amount_total, currency: session.currency, customer: session.customer, metadata: meta, created: session.created }
  return issueForPaymentIntent(db, stripe, { ...pi, metadata: { ...(pi.metadata || {}), ...meta } }, { companyId, email: o.email, buyer, checkoutSessionId: session.id, source: source || sourceForPayment(meta) })
}

/** A refund on a Colvy charge: record it on the issued document. */
export async function recordRefund(db: any, charge: any): Promise<boolean> {
  const piId = sid(charge?.payment_intent)
  const invId = sid(charge?.invoice)
  if (!piId && !invId) return false
  try {
    let q = db.from('tax_invoices').select('id, total_cents, amount_paid_cents, refunded_cents')
    q = invId ? q.eq('stripe_invoice_id', invId) : q.eq('stripe_payment_intent_id', piId)
    const { data } = await q.maybeSingle()
    if (!data) return false
    const { refundedCents, refunds } = refundsOf(charge)
    if (refundedCents === Number(data.refunded_cents || 0)) return false
    await db.from('tax_invoices').update({
      refunded_cents: refundedCents, refunds, status: statusFor(Number(data.amount_paid_cents) || Number(data.total_cents) || 0, refundedCents), updated_at: new Date().toISOString(),
    }).eq('id', data.id)
    return true
  } catch { return false }
}

/** The webhook's hook: issue (and email) the document for a payment that just succeeded. Never throws. */
export async function issueForEvent(db: any, stripe: any | null, event: any): Promise<IssueResult | null> {
  try {
    if (!event || event.account) return null
    const obj = event.data?.object
    switch (event.type) {
      case 'checkout.session.completed':
        return await issueForCheckoutSession(db, stripe, obj, { email: true })
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        return await issueForStripeInvoice(db, stripe, obj, { email: true })
      case 'payment_intent.succeeded':
        if (obj?.metadata?.kind !== 'sms_credit_auto') return null
        return await issueForPaymentIntent(db, stripe, obj, { email: true, source: 'sms_auto_topup' })
      case 'charge.refunded':
        await recordRefund(db, obj)
        return null
    }
  } catch (e: any) { console.error('[tax-invoices] issue failed', e?.message || e) }
  return null
}

// ── opening one ─────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function storedBy(db: any, col: string, val: string): Promise<{ row: any | null; missing: boolean }> {
  try {
    const { data, error } = await db.from('tax_invoices').select('*').eq(col, val).maybeSingle()
    if (error) return { row: null, missing: isMissing(error) }
    return { row: data || null, missing: false }
  } catch (e) { return { row: null, missing: isMissing(e) } }
}

/** A stored document whose refunds may have changed since: bring them up to date. Best effort. */
async function refreshRefunds(db: any, stripe: any | null, row: any): Promise<any> {
  if (!stripe || !row?.stripe_charge_id) return row
  try {
    const ch = await stripe.charges.retrieve(row.stripe_charge_id, { expand: ['refunds'] })
    const { refundedCents, refunds } = refundsOf(ch)
    if (refundedCents !== Number(row.refunded_cents || 0)) {
      const patch = { refunded_cents: refundedCents, refunds, status: statusFor(Number(row.amount_paid_cents) || Number(row.total_cents) || 0, refundedCents), updated_at: new Date().toISOString() }
      await db.from('tax_invoices').update(patch).eq('id', row.id)
      return { ...row, ...patch }
    }
  } catch {}
  return row
}

/** Issued as a Receipt while Colvy's ABN wasn't set, now it is: becomes a Tax Invoice (same number). */
async function upgradeReceipt(db: any, row: any): Promise<any> {
  const s = colvySupplier()
  if (row?.doc_type !== 'receipt' || !s.abn) return row
  const supplier = { name: s.name, abn: s.abn, email: s.email, address: s.address }
  try {
    await db.from('tax_invoices').update({ doc_type: 'tax_invoice', supplier, updated_at: new Date().toISOString() }).eq('id', row.id)
    return { ...row, doc_type: 'tax_invoice', supplier }
  } catch { return row }
}

export type OpenResult = { ok: boolean; doc?: TaxInvoiceDoc; stored?: boolean; status?: number; error?: string }

const notFound: OpenResult = { ok: false, status: 404, error: 'We couldn’t find that payment.' }

/**
 * The document for one of the business's payments, issuing it now if it has
 * none yet. `ref` is our id, a Stripe invoice (in_…) or a payment (pi_…). A
 * Stripe object must be this business's (one of its customers, or its own
 * company id in the metadata), or it's "not found".
 */
export async function ensureForRef(db: any, stripe: any | null, companyId: string, ref: string): Promise<OpenResult> {
  ref = String(ref || '').trim()
  if (!ref) return notFound
  if (UUID.test(ref)) {
    const { row } = await storedBy(db, 'id', ref)
    if (!row || String(row.company_id) !== String(companyId)) return notFound
    return { ok: true, doc: rowToDoc(await upgradeReceipt(db, await refreshRefunds(db, stripe, row))), stored: true }
  }
  if (!/^(in|pi)_[A-Za-z0-9]+$/.test(ref)) return notFound
  const col = ref.startsWith('in_') ? 'stripe_invoice_id' : 'stripe_payment_intent_id'
  const hit = await storedBy(db, col, ref)
  if (hit.row) {
    if (String(hit.row.company_id) !== String(companyId)) return notFound
    return { ok: true, doc: rowToDoc(await upgradeReceipt(db, await refreshRefunds(db, stripe, hit.row))), stored: true }
  }
  if (!stripe) return { ok: false, status: 503, error: 'Billing isn’t available just now. Try again in a minute.' }

  const details = await getBillingDetails(db, companyId)
  const customers = await companyCustomers(db, stripe, companyId, details)
  let r: IssueResult
  if (ref.startsWith('in_')) {
    let inv: any
    try { inv = await stripe.invoices.retrieve(ref) } catch { return notFound }
    if (!inv || inv.status !== 'paid') return notFound
    const mine = customers.includes(sid(inv.customer) || '') || (await resolveInvoiceCompany(db, inv, null)) === companyId
    if (!mine) return notFound
    r = await issueForStripeInvoice(db, stripe, inv, { companyId, details })
  } else {
    let pi: any
    try { pi = await stripe.paymentIntents.retrieve(ref, { expand: ['latest_charge'] }) } catch { return notFound }
    if (!pi || pi.status !== 'succeeded') return notFound
    const other = pi.metadata?.companyId && String(pi.metadata.companyId) !== String(companyId)
    const mine = !other && (String(pi.metadata?.companyId || '') === String(companyId) || customers.includes(sid(pi.customer) || ''))
    if (!mine) return notFound
    r = await issueForPaymentIntent(db, stripe, pi, { companyId, details })
  }
  if (r.reason === 'other_company') return notFound
  if (r.doc) return { ok: true, doc: r.doc, stored: r.stored }
  return { ok: false, status: r.reason === 'nothing_paid' ? 404 : 500, error: r.reason === 'nothing_paid' ? 'Nothing was paid on this one, so there’s no invoice.' : 'We couldn’t prepare this invoice. Try again in a minute.' }
}

// ── billing history ─────────────────────────────────────────────────────────

export type HistoryRow = {
  id: string; ref: string; created: number; amount_paid: number; currency: string; status: string
  description: string; invoice_pdf: string | null
  taxInvoice: { id: string; number: string | null; docType: string } | null
}

/** Stripe invoices and payments (with no invoice) for the business, with their documents. */
export async function billingHistory(db: any, stripe: any | null, companyId: string): Promise<{ rows: HistoryRow[]; stored: boolean }> {
  const rows = new Map<string, HistoryRow>()
  const piToInvoice = new Map<string, string>()
  if (stripe) {
    const customers = await companyCustomers(db, stripe, companyId)
    await Promise.all(customers.map(async c => {
      try {
        const list = await stripe.invoices.list({ customer: c, limit: 24 })
        for (const inv of list?.data || []) {
          if (inv.status === 'draft') continue
          rows.set(inv.id, {
            id: inv.id, ref: inv.id, created: inv.created, amount_paid: inv.amount_paid ?? 0, currency: inv.currency || 'aud', status: inv.status || 'open',
            description: inv.lines?.data?.[0]?.description || 'Subscription', invoice_pdf: inv.invoice_pdf || null, taxInvoice: null,
          })
          const pi = sid(inv.payment_intent); if (pi) piToInvoice.set(pi, inv.id)
        }
      } catch {}
      try {
        const list = await stripe.paymentIntents.list({ customer: c, limit: 24 })
        for (const pi of list?.data || []) {
          if (pi.status !== 'succeeded' || pi.invoice) continue
          rows.set(pi.id, {
            id: pi.id, ref: pi.id, created: pi.created, amount_paid: pi.amount_received || pi.amount || 0, currency: pi.currency || 'aud', status: 'paid',
            description: pi.description || 'Colvy payment', invoice_pdf: null, taxInvoice: null,
          })
        }
      } catch {}
    }))
    for (const [pi, inv] of piToInvoice) if (rows.has(pi) && rows.has(inv)) rows.delete(pi)
  }
  let stored = true
  try {
    const { data, error } = await db.from('tax_invoices').select('id, number, doc_type, source, stripe_invoice_id, stripe_payment_intent_id, issued_at, total_cents, amount_paid_cents, currency, status, lines')
      .eq('company_id', companyId).order('issued_at', { ascending: false }).limit(100)
    if (error) stored = !isMissing(error)
    for (const t of data || []) {
      const ref = t.stripe_invoice_id || t.stripe_payment_intent_id
      const key = rows.has(ref) ? ref : (t.stripe_payment_intent_id && rows.has(t.stripe_payment_intent_id) ? t.stripe_payment_intent_id : ref)
      const ti = { id: t.id, number: t.number, docType: t.doc_type }
      const row = rows.get(key)
      if (row) row.taxInvoice = ti
      else rows.set(key, {
        id: key, ref: key, created: Math.floor(Date.parse(t.issued_at) / 1000), amount_paid: Number(t.amount_paid_cents) || Number(t.total_cents) || 0,
        currency: t.currency || 'aud', status: t.status === 'refunded' ? 'refunded' : 'paid',
        description: (Array.isArray(t.lines) && t.lines[0]?.description) || 'Colvy payment', invoice_pdf: null, taxInvoice: ti,
      })
    }
  } catch (e) { stored = !isMissing(e) }
  return { rows: [...rows.values()].sort((a, b) => b.created - a.created).slice(0, 60), stored }
}

// ── telling the business ───────────────────────────────────────────────────

export function taxInvoiceUrl(slug: string | null, id: string): string {
  const host = slug ? `https://${slug}.colvy.com` : 'https://colvy.com'
  return `${host}/admin/billing/tax-invoice?id=${encodeURIComponent(id)}`
}

/** Email the billing contact a link to a newly issued document (once). */
export async function emailTaxInvoice(db: any, companyId: string, doc: TaxInvoiceDoc, details?: BillingDetails | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key || !doc.id) return false
  const d = details || await getBillingDetails(db, companyId)
  const to = doc.customer.email || d?.email || d?.ownerEmail
  if (!to) return false
  const { taxInvoiceEmail } = await import('@/lib/colvy-account-emails')
  const mail = taxInvoiceEmail({
    business: d?.companyName || doc.customer.name, title: docTitle(doc), number: doc.number || doc.reference,
    total: fmtAud(doc.totalCents), gst: fmtAud(doc.gstCents), date: fmtInvoiceDate(doc.issuedAt),
    items: doc.lines.map(l => l.description).slice(0, 4), url: taxInvoiceUrl(d?.slug || null, doc.id),
  })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Colvy <noreply@updates.colvy.com>', to: [to], reply_to: doc.supplier.email || undefined, subject: mail.subject, html: mail.html, text: mail.text }),
  })
  if (!res.ok) { console.error('[tax-invoices] email failed', res.status); return false }
  try { await db.from('tax_invoices').update({ emailed_at: new Date().toISOString() }).eq('id', doc.id) } catch {}
  return true
}

// ── the Stripe customer side of the business's details ──────────────────────

/** Copy the business's name, address, email and ABN (au_abn) to its Stripe customers. Best effort. */
export async function syncStripeCustomers(db: any, stripe: any | null, companyId: string): Promise<{ synced: number; failed: number }> {
  if (!stripe) return { synced: 0, failed: 0 }
  const d = await getBillingDetails(db, companyId)
  if (!d) return { synced: 0, failed: 0 }
  const customers = await companyCustomers(db, stripe, companyId, d)
  let synced = 0, failed = 0
  const footer = stripeInvoiceFooter()
  const fields = stripeInvoiceCustomFields()
  for (const c of customers) {
    try {
      const a = d.address
      const patch: any = {}
      if (d.legalName) patch.name = d.legalName
      if (d.email) patch.email = d.email
      if (a && (a.line1 || a.suburb || a.postcode)) patch.address = { line1: a.line1 || '', line2: a.line2 || '', city: a.suburb || '', state: a.state || '', postal_code: a.postcode || '', country: /^(au|australia)$/i.test(a.country || 'AU') ? 'AU' : (a.country || 'AU') }
      if (footer) patch.invoice_settings = { footer, custom_fields: fields }
      if (Object.keys(patch).length) await stripe.customers.update(c, patch)
      const list = await stripe.customers.listTaxIds(c, { limit: 20 })
      const abns = (list?.data || []).filter((t: any) => t.type === 'au_abn')
      for (const t of abns) if (!d.abn || String(t.value).replace(/\s/g, '') !== d.abn) await stripe.customers.deleteTaxId(c, t.id)
      if (d.abn && !abns.some((t: any) => String(t.value).replace(/\s/g, '') === d.abn)) await stripe.customers.createTaxId(c, { type: 'au_abn', value: d.abn })
      synced++
    } catch (e: any) { failed++; console.error('[tax-invoices] Stripe customer sync failed', c, e?.message) }
  }
  return { synced, failed }
}
