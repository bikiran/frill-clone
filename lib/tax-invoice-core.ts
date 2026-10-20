// Colvy's tax invoices: the pure part (no database, no Stripe client), shared
// by the server (lib/tax-invoices), the print page and the tests.
//
// Colvy charges Australian businesses in AUD with GST included in every price
// (plans, SMS credit, numbers, porting fees). Under GST law a registered
// supplier gives the buyer a tax invoice: the words "Tax Invoice", the
// supplier's identity and ABN, the issue date, what was sold, the GST (or a
// statement that the total includes GST) and, from A$1,000, the buyer's
// identity or ABN. This file turns a paid Stripe invoice or payment into that
// document (TaxInvoiceDoc). The GST in a GST-inclusive price is 1/11 of it,
// rounded to the cent; when Stripe Tax has calculated tax on an invoice, its
// figure is used instead. Amounts charged are never changed here.
//
// Colvy's own details come from the environment:
//   COLVY_LEGAL_NAME       e.g. "Colvy Pty Ltd"        (default "Colvy")
//   COLVY_ABN              11 digits, spaces allowed   (no valid ABN: every
//                          document says "Receipt", never "Tax Invoice")
//   COLVY_BILLING_ADDRESS  one line, or lines separated by "\n" or " | "
//   COLVY_BILLING_EMAIL    shown for billing questions (default support@colvy.com)
// Optional switches:
//   COLVY_STRIPE_TAX_ID_COLLECTION=0   don't ask for an ABN on Stripe Checkout
//   COLVY_STRIPE_INVOICE_CREATION=1    also have Stripe create a (paid) invoice
//                                      for one-off Checkout payments (SMS credit,
//                                      porting fee). Off by default: Stripe
//                                      charges for those invoices and Colvy issues
//                                      its own tax invoice for every payment anyway.

import { cleanAbn, formatAbn } from '@/lib/abn'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

type Env = Record<string, string | undefined>

export type DocType = 'tax_invoice' | 'receipt'
export type InvoiceStatus = 'paid' | 'partially_refunded' | 'refunded'
export type InvoiceSource = 'subscription' | 'invoice' | 'sms_credit' | 'sms_auto_topup' | 'phone_number' | 'porting' | 'payment'

export type Party = {
  name: string
  abn: string | null
  email: string | null
  /** Address lines, top to bottom. */
  address: string[]
}

export type InvoiceLine = { description: string; quantity: number; unitCents: number; amountCents: number }
export type Refund = { amountCents: number; at: string | null; reason?: string | null }

export type TaxInvoiceDoc = {
  /** Our row id once stored. */
  id: string | null
  /** CLV-000123 once stored; null for a document that isn't stored yet. */
  number: string | null
  docType: DocType
  status: InvoiceStatus
  source: InvoiceSource
  currency: string
  issuedAt: string
  paidAt: string | null
  supplier: Party
  customer: Party
  lines: InvoiceLine[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  gstCents: number
  amountPaidCents: number
  creditAppliedCents: number
  refundedCents: number
  refunds: Refund[]
  paymentMethod: string | null
  stripe: {
    invoiceId: string | null
    paymentIntentId: string | null
    chargeId: string | null
    checkoutSessionId: string | null
    customerId: string | null
    subscriptionId: string | null
  }
  /** The Stripe id people can quote (in_…, pi_…). */
  reference: string
}

// ── money ────────────────────────────────────────────────────────────────────

/** The GST in a GST-inclusive amount: 1/11, rounded half away from zero to the cent. */
export function gstFromInclusive(cents: number): number {
  const c = Math.round(Number(cents) || 0)
  const g = Math.round(Math.abs(c) / 11)
  return c < 0 ? -g : g
}

/** 12345 → "A$123.45"; negative → "-A$123.45". */
export function fmtAud(cents: number): string {
  const c = Math.round(Number(cents) || 0)
  const s = (Math.abs(c) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${c < 0 ? '-' : ''}A$${s}`
}

/** A date the Australian way in Sydney time: 20 Oct 2026. */
export function fmtInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })
}

/** The buyer must be identified on a tax invoice from this total (GST incl). */
export const BUYER_ID_THRESHOLD_CENTS = 100000

// ── Colvy (the supplier) ────────────────────────────────────────────────────

const clean = (v: unknown) => String(v ?? '').trim()

export function addressLines(raw: string): string[] {
  return clean(raw).split(/\n|\s\|\s|\\n/).map(s => s.trim()).filter(Boolean).slice(0, 6)
}

export function colvySupplier(env: Env = process.env): Party & { abnValid: boolean; docType: DocType } {
  const abn = cleanAbn(env.COLVY_ABN)
  return {
    name: clean(env.COLVY_LEGAL_NAME) || 'Colvy',
    abn,
    email: clean(env.COLVY_BILLING_EMAIL) || COLVY_CONTACT.email,
    address: addressLines(clean(env.COLVY_BILLING_ADDRESS)),
    abnValid: !!abn,
    docType: abn ? 'tax_invoice' : 'receipt',
  }
}

export type SupplierCheck = { envVar: string; label: string; state: 'ok' | 'missing' | 'invalid'; problem: string }

/** What super admin sees about Colvy's invoice details. */
export function supplierStatus(env: Env = process.env): { ready: boolean; checks: SupplierCheck[] } {
  const rawAbn = clean(env.COLVY_ABN)
  const abnOk = !!cleanAbn(rawAbn)
  const checks: SupplierCheck[] = [
    {
      envVar: 'COLVY_ABN', label: 'Colvy’s ABN',
      state: !rawAbn ? 'missing' : abnOk ? 'ok' : 'invalid',
      problem: !rawAbn ? 'Not set: billing documents say “Receipt”, not “Tax Invoice”, so customers can’t claim GST credits from them.'
        : abnOk ? '' : 'Not a valid ABN (11 digits that pass the ATO check). Documents say “Receipt” until it’s fixed.',
    },
    { envVar: 'COLVY_LEGAL_NAME', label: 'Legal name', state: clean(env.COLVY_LEGAL_NAME) ? 'ok' : 'missing', problem: clean(env.COLVY_LEGAL_NAME) ? '' : 'Not set: invoices show “Colvy”. Use the name registered to the ABN, e.g. Colvy Pty Ltd.' },
    { envVar: 'COLVY_BILLING_ADDRESS', label: 'Business address', state: clean(env.COLVY_BILLING_ADDRESS) ? 'ok' : 'missing', problem: clean(env.COLVY_BILLING_ADDRESS) ? '' : 'Not set: invoices show no address for Colvy (recommended, not required).' },
    { envVar: 'COLVY_BILLING_EMAIL', label: 'Billing email', state: clean(env.COLVY_BILLING_EMAIL) ? 'ok' : 'missing', problem: clean(env.COLVY_BILLING_EMAIL) ? '' : `Not set: invoices show ${COLVY_CONTACT.email}.` },
  ]
  return { ready: abnOk, checks }
}

/** Footer for Stripe-hosted invoices (customer invoice_settings.footer). Null without a valid ABN. */
export function stripeInvoiceFooter(env: Env = process.env): string | null {
  const s = colvySupplier(env)
  if (!s.abn) return null
  return [`Tax Invoice · ${s.name} · ABN ${formatAbn(s.abn)}`, s.address.join(', '), 'Prices are in Australian dollars and include GST. The total includes GST of 1/11 of the amount.']
    .filter(Boolean).join('\n')
}

/** Custom fields for Stripe-hosted invoices (max 4; name ≤ 30, value ≤ 30 chars on older API versions). */
export function stripeInvoiceCustomFields(env: Env = process.env): { name: string; value: string }[] | null {
  const s = colvySupplier(env)
  if (!s.abn) return null
  return [{ name: 'Supplier ABN', value: formatAbn(s.abn) }]
}

/**
 * Extra Stripe Checkout params for a Colvy charge: let the buyer enter their
 * ABN (tax_id_collection, saved on the Stripe customer as au_abn), and for a
 * one-off payment optionally have Stripe create a paid invoice. With an
 * existing customer Stripe needs customer_update.name = 'auto' to collect a
 * tax ID, so the name (and address) entered are saved on the customer.
 */
export function checkoutTaxParams(env: Env, o: { mode: 'payment' | 'subscription'; customer?: string | null; description?: string; createCustomer?: boolean }): Record<string, any> {
  const out: Record<string, any> = {}
  if (clean(env.COLVY_STRIPE_TAX_ID_COLLECTION) !== '0') {
    out.tax_id_collection = { enabled: true }
    if (o.customer) out.customer_update = { name: 'auto', address: 'auto' }
    // A one-off payment keeps the ABN on a Stripe customer only if one is made.
    else if (o.mode === 'payment' && o.createCustomer) out.customer_creation = 'always'
  }
  if (o.mode === 'payment' && clean(env.COLVY_STRIPE_INVOICE_CREATION) === '1') {
    const footer = stripeInvoiceFooter(env)
    const fields = stripeInvoiceCustomFields(env)
    out.invoice_creation = {
      enabled: true,
      invoice_data: {
        ...(o.description ? { description: o.description.slice(0, 1500) } : {}),
        ...(footer ? { footer } : {}),
        ...(fields ? { custom_fields: fields } : {}),
      },
    }
  }
  return out
}

// ── Stripe → document ───────────────────────────────────────────────────────

export const sid = (v: any): string | null => (typeof v === 'string' ? v : v?.id) || null
const iso = (unix: any): string | null => (Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString() : null)
const int = (v: any) => Math.round(Number(v) || 0)

/** "Visa ending 4242" from a Stripe charge (or its payment_method_details). */
export function paymentMethodText(charge: any): string | null {
  const d = charge?.payment_method_details || null
  const card = d?.card || charge?.card || null
  if (card?.last4) {
    const brand = String(card.brand || card.display_brand || 'Card').replace(/_/g, ' ')
    return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ending ${card.last4}`
  }
  if (d?.type) return String(d.type).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
  return null
}

/** Refunds on a Stripe charge. */
export function refundsOf(charge: any): { refundedCents: number; refunds: Refund[] } {
  if (!charge || typeof charge !== 'object') return { refundedCents: 0, refunds: [] }
  const list: any[] = Array.isArray(charge.refunds?.data) ? charge.refunds.data : []
  const refunds = list.filter(r => r && r.status !== 'failed' && r.status !== 'canceled')
    .map(r => ({ amountCents: int(r.amount), at: iso(r.created), reason: r.reason || null }))
  const refundedCents = Math.max(int(charge.amount_refunded), refunds.reduce((s, r) => s + r.amountCents, 0))
  return { refundedCents, refunds }
}

export function statusFor(totalPaidCents: number, refundedCents: number): InvoiceStatus {
  if (refundedCents <= 0) return 'paid'
  return refundedCents >= totalPaidCents ? 'refunded' : 'partially_refunded'
}

/** Buyer details from Stripe (Checkout customer_details, an invoice, or a customer). */
export type StripeBuyer = { name?: string | null; email?: string | null; abn?: string | null; address?: string[] }

function auAbnFrom(taxIds: any): string | null {
  const list: any[] = Array.isArray(taxIds) ? taxIds : Array.isArray(taxIds?.data) ? taxIds.data : []
  for (const t of list) if (t?.type === 'au_abn') { const a = cleanAbn(t.value); if (a) return a }
  return null
}
function stripeAddressLines(a: any): string[] {
  if (!a || typeof a !== 'object') return []
  const town = [a.city, a.state, a.postal_code].filter(Boolean).join(' ')
  return [a.line1, a.line2, town, a.country && a.country !== 'AU' ? a.country : null].map(s => clean(s)).filter(Boolean)
}
export function buyerFromStripe(o: any): StripeBuyer {
  if (!o || typeof o !== 'object') return {}
  // An invoice: customer_name / customer_email / customer_address / customer_tax_ids.
  if ('customer_tax_ids' in o || 'customer_name' in o || 'customer_email' in o) {
    return { name: o.customer_name || null, email: o.customer_email || null, abn: auAbnFrom(o.customer_tax_ids), address: stripeAddressLines(o.customer_address) }
  }
  // Checkout customer_details, or a customer object.
  return { name: o.name || null, email: o.email || null, abn: auAbnFrom(o.tax_ids), address: stripeAddressLines(o.address) }
}

/**
 * The buyer on the document: the business's billing details as saved in Colvy
 * (frozen when issued), filling gaps from what they entered at Stripe.
 */
export function buyerParty(saved: Partial<Party> & { name?: string | null }, fromStripe: StripeBuyer = {}): Party {
  return {
    name: clean(saved.name) || clean(fromStripe.name) || 'Customer',
    abn: cleanAbn(saved.abn) || cleanAbn(fromStripe.abn) || null,
    email: clean(saved.email) || clean(fromStripe.email) || null,
    address: (saved.address && saved.address.length ? saved.address : fromStripe.address || []).map(clean).filter(Boolean),
  }
}

function invoiceTaxCents(inv: any): number | null {
  if (Number(inv?.tax) > 0) return int(inv.tax)
  const sum = (arr: any) => Array.isArray(arr) ? arr.reduce((s: number, t: any) => s + int(t?.amount), 0) : 0
  const t = sum(inv?.total_taxes) || sum(inv?.total_tax_amounts)
  return t > 0 ? t : null
}

const LINE_FALLBACK: Record<string, string> = {
  subscription: 'Colvy subscription', invoice: 'Colvy', sms_credit: 'Colvy SMS credit (prepaid)', sms_auto_topup: 'Colvy SMS credit (auto top-up)',
  phone_number: 'Colvy business number', porting: 'Number porting fee (one-off)', payment: 'Colvy',
}

function base(o: { supplier: Party & { docType?: DocType }; customer: Party }): Pick<TaxInvoiceDoc, 'id' | 'number' | 'docType' | 'currency' | 'supplier' | 'customer'> {
  const given = o.supplier
  const sup: Party = { name: given.name, abn: given.abn || null, email: given.email || null, address: given.address || [] }
  return { id: null, number: null, docType: sup.abn ? 'tax_invoice' : 'receipt', currency: 'aud', supplier: sup, customer: o.customer }
}

/** A paid Stripe invoice (a subscription period, or a one-off invoice Colvy sent). */
export function docFromStripeInvoice(inv: any, o: { supplier: Party; customer: Party; charge?: any; source?: InvoiceSource; checkoutSessionId?: string | null }): TaxInvoiceDoc {
  const subId = sid(inv?.subscription) || sid(inv?.parent?.subscription_details?.subscription) || null
  const source: InvoiceSource = o.source || (subId ? 'subscription' : 'invoice')
  const rawLines: any[] = Array.isArray(inv?.lines?.data) ? inv.lines.data : []
  const lines: InvoiceLine[] = rawLines.map(l => {
    const quantity = Math.max(1, int(l?.quantity) || 1)
    const amountCents = int(l?.amount)
    const desc = clean(l?.description) || clean(l?.price?.nickname) || clean(l?.price?.product?.name) || LINE_FALLBACK[source]
    return { description: desc.slice(0, 300), quantity, unitCents: Math.round(amountCents / quantity), amountCents }
  })
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0)
  const totalCents = int(inv?.total ?? subtotalCents)
  const discountFromStripe = Array.isArray(inv?.total_discount_amounts) ? inv.total_discount_amounts.reduce((s: number, d: any) => s + int(d?.amount), 0) : 0
  const discountCents = discountFromStripe || Math.max(0, subtotalCents - totalCents)
  if (!lines.length) lines.push({ description: LINE_FALLBACK[source], quantity: 1, unitCents: totalCents, amountCents: totalCents })
  const amountPaidCents = int(inv?.amount_paid)
  const creditAppliedCents = Math.max(0, totalCents - amountPaidCents - int(inv?.amount_remaining))
  const paidAt = iso(inv?.status_transitions?.paid_at) || iso(inv?.created)
  const charge = o.charge && typeof o.charge === 'object' ? o.charge : (inv?.charge && typeof inv.charge === 'object' ? inv.charge : null)
  const { refundedCents, refunds } = refundsOf(charge)
  const piId = sid(inv?.payment_intent) || sid(inv?.payments?.data?.[0]?.payment?.payment_intent) || null
  return {
    ...base(o),
    status: statusFor(amountPaidCents || totalCents, refundedCents),
    source,
    currency: String(inv?.currency || 'aud').toLowerCase(),
    issuedAt: paidAt || new Date().toISOString(),
    paidAt,
    lines,
    subtotalCents,
    discountCents,
    totalCents,
    gstCents: invoiceTaxCents(inv) ?? gstFromInclusive(totalCents),
    amountPaidCents,
    creditAppliedCents,
    refundedCents,
    refunds,
    paymentMethod: paymentMethodText(charge) || (amountPaidCents === 0 && creditAppliedCents > 0 ? 'Account credit' : null),
    stripe: {
      invoiceId: sid(inv), paymentIntentId: piId, chargeId: sid(charge) || sid(inv?.charge),
      checkoutSessionId: o.checkoutSessionId || null, customerId: sid(inv?.customer), subscriptionId: subId,
    },
    reference: sid(inv) || '',
  }
}

/** What a one-off payment was for, from its metadata. */
export function sourceForPayment(meta: any): InvoiceSource {
  const k = String(meta?.kind || '')
  if (k === 'sms_credit') return 'sms_credit'
  if (k === 'sms_credit_auto') return 'sms_auto_topup'
  if (k === 'ported_number') return 'porting'
  if (k === 'phone_number') return 'phone_number'
  return 'payment'
}

/**
 * A succeeded PaymentIntent with no Stripe invoice (SMS credit by Checkout,
 * an auto top-up charged off-session, a porting fee). `lines` overrides the
 * single line made from the payment (e.g. Checkout line items).
 */
export function docFromPaymentIntent(pi: any, o: { supplier: Party; customer: Party; charge?: any; source?: InvoiceSource; checkoutSessionId?: string | null; lines?: InvoiceLine[] }): TaxInvoiceDoc {
  const source = o.source || sourceForPayment(pi?.metadata)
  const totalCents = int(pi?.amount_received || pi?.amount)
  const charge = o.charge && typeof o.charge === 'object' ? o.charge
    : (pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : (Array.isArray(pi?.charges?.data) ? pi.charges.data[0] : null))
  const given = (o.lines || []).filter(l => l && l.amountCents)
  const lines: InvoiceLine[] = given.length && given.reduce((s, l) => s + l.amountCents, 0) === totalCents
    ? given
    : [{ description: source === 'payment' ? (clean(pi?.description) || LINE_FALLBACK.payment) : LINE_FALLBACK[source], quantity: 1, unitCents: totalCents, amountCents: totalCents }]
  const paidAt = iso(charge?.created) || iso(pi?.created)
  const { refundedCents, refunds } = refundsOf(charge)
  return {
    ...base(o),
    status: statusFor(totalCents, refundedCents),
    source,
    currency: String(pi?.currency || 'aud').toLowerCase(),
    issuedAt: paidAt || new Date().toISOString(),
    paidAt,
    lines,
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    gstCents: gstFromInclusive(totalCents),
    amountPaidCents: totalCents,
    creditAppliedCents: 0,
    refundedCents,
    refunds,
    paymentMethod: paymentMethodText(charge),
    stripe: {
      invoiceId: null, paymentIntentId: sid(pi), chargeId: sid(charge) || sid(pi?.latest_charge),
      checkoutSessionId: o.checkoutSessionId || null, customerId: sid(pi?.customer), subscriptionId: null,
    },
    reference: sid(pi) || '',
  }
}

// ── stored row ↔ document ───────────────────────────────────────────────────

/** The columns issue_tax_invoice (V404) takes. */
export function docToRow(doc: TaxInvoiceDoc): Record<string, any> {
  return {
    doc_type: doc.docType, status: doc.status, source: doc.source, currency: doc.currency,
    stripe_invoice_id: doc.stripe.invoiceId, stripe_payment_intent_id: doc.stripe.paymentIntentId,
    stripe_charge_id: doc.stripe.chargeId, stripe_checkout_session_id: doc.stripe.checkoutSessionId,
    stripe_customer_id: doc.stripe.customerId, stripe_subscription_id: doc.stripe.subscriptionId,
    issued_at: doc.issuedAt, paid_at: doc.paidAt,
    subtotal_cents: doc.subtotalCents, discount_cents: doc.discountCents, total_cents: doc.totalCents,
    gst_cents: doc.gstCents, amount_paid_cents: doc.amountPaidCents, credit_applied_cents: doc.creditAppliedCents,
    refunded_cents: doc.refundedCents, refunds: doc.refunds, lines: doc.lines,
    supplier: doc.supplier, customer: doc.customer, payment_method: doc.paymentMethod,
  }
}

const party = (p: any): Party => ({ name: clean(p?.name) || 'Customer', abn: cleanAbn(p?.abn), email: clean(p?.email) || null, address: Array.isArray(p?.address) ? p.address.map(clean).filter(Boolean) : [] })

export function rowToDoc(r: any): TaxInvoiceDoc {
  return {
    id: r.id || null, number: r.number || null,
    docType: r.doc_type === 'tax_invoice' ? 'tax_invoice' : 'receipt',
    status: (['paid', 'partially_refunded', 'refunded'].includes(r.status) ? r.status : 'paid') as InvoiceStatus,
    source: (r.source || 'payment') as InvoiceSource, currency: r.currency || 'aud',
    issuedAt: r.issued_at || r.created_at, paidAt: r.paid_at || null,
    supplier: party(r.supplier), customer: party(r.customer),
    lines: Array.isArray(r.lines) ? r.lines.map((l: any) => ({ description: clean(l?.description), quantity: int(l?.quantity) || 1, unitCents: int(l?.unitCents), amountCents: int(l?.amountCents) })) : [],
    subtotalCents: int(r.subtotal_cents), discountCents: int(r.discount_cents), totalCents: int(r.total_cents), gstCents: int(r.gst_cents),
    amountPaidCents: int(r.amount_paid_cents), creditAppliedCents: int(r.credit_applied_cents), refundedCents: int(r.refunded_cents),
    refunds: Array.isArray(r.refunds) ? r.refunds : [], paymentMethod: r.payment_method || null,
    stripe: {
      invoiceId: r.stripe_invoice_id || null, paymentIntentId: r.stripe_payment_intent_id || null, chargeId: r.stripe_charge_id || null,
      checkoutSessionId: r.stripe_checkout_session_id || null, customerId: r.stripe_customer_id || null, subscriptionId: r.stripe_subscription_id || null,
    },
    reference: r.stripe_invoice_id || r.stripe_payment_intent_id || '',
  }
}

/** "Tax Invoice" only with Colvy's ABN on it; otherwise "Receipt". */
export const docTitle = (doc: Pick<TaxInvoiceDoc, 'docType' | 'supplier'>) => (doc.docType === 'tax_invoice' && doc.supplier.abn ? 'Tax Invoice' : 'Receipt')

export const SOURCE_LABEL: Record<InvoiceSource, string> = {
  subscription: 'Subscription', invoice: 'Invoice', sms_credit: 'SMS credit', sms_auto_topup: 'SMS credit (auto top-up)',
  phone_number: 'Business number', porting: 'Number porting', payment: 'Payment',
}
