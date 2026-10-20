// Colvy's adjustment notes (credit notes): the pure part, shared by the server
// (lib/tax-credit-notes), the renderer, the pages and the tests.
//
// When a payment Colvy gave a tax invoice for is refunded, or reduced by a
// Stripe credit note, GST law asks the supplier for an adjustment note: the
// words "Adjustment Note", the supplier's identity and ABN, the date, the
// buyer's identity or ABN (needed from A$1,000, shown whenever known), the
// original tax invoice's number and date, the amount of the adjustment and the
// GST adjustment, and a short reason. Colvy titles it "Adjustment Note
// (Credit Note)" and numbers them CN-000001… (V406), one per Stripe refund or
// Stripe credit note.
//
// GST: Colvy's prices include GST, so the GST in a refund is 1/11 of it. When
// the original invoice's GST wasn't 1/11 of its total (Stripe Tax worked it
// out), the refund takes the same share of it, or the credit note's own tax
// figure when Stripe has one. Never more than what's left of the original's
// GST, and the refund that brings the total to the invoice's total takes all
// of what's left, so a full refund in parts credits exactly the original GST.
//
// Without Colvy's ABN, or when the original is only a Receipt, the document is
// a "Refund Receipt", never an adjustment note.

import { cleanAbn } from '@/lib/abn'
import {
  gstFromInclusive, sid, type AdjustmentRef, type InvoiceLine, type InvoiceSource, type Party, type TaxInvoiceDoc,
} from '@/lib/tax-invoice-core'

export type CreditNoteKind = 'adjustment_note' | 'refund_receipt'
export type CreditNoteStatus = 'issued' | 'void'

export type CreditNoteOriginal = {
  id: string | null
  /** CLV-000123 */
  number: string | null
  issuedAt: string | null
  totalCents: number
  gstCents: number
  docType: 'tax_invoice' | 'receipt'
  /** in_… / pi_… */
  reference: string
}

export type CreditNoteDoc = {
  id: string | null
  /** CN-000012 once stored. */
  number: string | null
  kind: CreditNoteKind
  status: CreditNoteStatus
  currency: string
  issuedAt: string
  voidedAt: string | null
  supplier: Party
  customer: Party
  original: CreditNoteOriginal
  /** What's credited, GST inclusive, as positive amounts (shown as credits). */
  lines: InvoiceLine[]
  amountCents: number
  gstCents: number
  /** Adjusted on the same invoice by earlier notes (not void), when this one was issued. */
  priorAdjustedCents: number
  reason: string
  stripe: {
    refundId: string | null
    creditNoteId: string | null
    /** Refunds a Stripe credit note paid out (so they never get a note of their own). */
    refundIds: string[]
    chargeId: string | null
    invoiceId: string | null
    paymentIntentId: string | null
  }
  /** The Stripe id people can quote (re_…, cn_…). */
  reference: string
}

const clean = (v: unknown) => String(v ?? '').trim()
const int = (v: any) => Math.round(Number(v) || 0)
const iso = (unix: any): string | null => (Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString() : null)

export const ADJUSTMENT_NOTE_TITLE = 'Adjustment Note (Credit Note)'

/** "Adjustment Note (Credit Note)" only with Colvy's ABN on it; otherwise "Refund Receipt". */
export const noteTitle = (n: Pick<CreditNoteDoc, 'kind' | 'supplier'>) => (n.kind === 'adjustment_note' && n.supplier.abn ? ADJUSTMENT_NOTE_TITLE : 'Refund Receipt')
export const noteLabel = (kind: string) => (kind === 'adjustment_note' ? 'Adjustment note' : 'Refund receipt')

/** An adjustment note needs Colvy's ABN and an original that is a tax invoice. */
export function noteKindFor(supplier: Pick<Party, 'abn'>, originalDocType: string | null | undefined): CreditNoteKind {
  return cleanAbn(supplier.abn) && originalDocType === 'tax_invoice' ? 'adjustment_note' : 'refund_receipt'
}

/**
 * The GST in an adjustment of `amountCents` on an invoice of `o.totalCents`
 * (GST `o.gstCents`), after earlier adjustments `prior`. `given` is Stripe's
 * own tax figure for it, if any.
 */
export function adjustmentGst(amountCents: number, o: { totalCents: number; gstCents: number }, prior: { amountCents: number; gstCents: number } = { amountCents: 0, gstCents: 0 }, given?: number | null): number {
  const amount = Math.max(0, int(amountCents))
  const left = Math.max(0, int(o.gstCents) - int(prior.gstCents))
  if (amount <= 0 || left <= 0) return 0
  // The last of the invoice: whatever GST is left, so the total credited is the original's.
  if (int(prior.amountCents) + amount >= int(o.totalCents)) return Math.min(left, amount)
  let g: number
  if (given != null && Number(given) > 0) g = int(given)
  else if (int(o.gstCents) === gstFromInclusive(int(o.totalCents))) g = gstFromInclusive(amount)
  else g = int(o.totalCents) > 0 ? Math.round(amount * int(o.gstCents) / int(o.totalCents)) : 0
  return Math.max(0, Math.min(g, left, amount))
}

/** What's left to adjust on the invoice (never below 0). */
export const adjustableCents = (o: { totalCents: number }, prior: { amountCents: number }) => Math.max(0, int(o.totalCents) - int(prior.amountCents))

const WHAT: Record<InvoiceSource, string> = {
  subscription: 'Colvy subscription', invoice: 'Colvy invoice', sms_credit: 'SMS credit top-up', sms_auto_topup: 'SMS credit auto top-up',
  phone_number: 'Colvy business number', porting: 'number porting', payment: 'Colvy payment',
}
const WHY: Record<string, string> = {
  duplicate: 'duplicate payment', fraudulent: 'fraudulent payment', requested_by_customer: 'requested by the customer',
  expired_uncaptured_charge: 'payment not captured', order_change: 'change to the order', product_unsatisfactory: 'not satisfied with the service',
}

/** "Refund of SMS credit top-up", "Partial refund of Colvy subscription: duplicate payment", "Credit for …". */
export function adjustmentReason(o: { source: InvoiceSource | string; full: boolean; credit?: boolean; stripeReason?: string | null; memo?: string | null }): string {
  const what = WHAT[o.source as InvoiceSource] || 'Colvy payment'
  const verb = o.credit ? (o.full ? 'Credit for' : 'Partial credit for') : (o.full ? 'Refund of' : 'Partial refund of')
  const why = clean(o.memo) || WHY[clean(o.stripeReason)] || ''
  return `${verb} ${what}${why ? `: ${why}` : ''}`.slice(0, 300)
}

function originalOf(doc: TaxInvoiceDoc): CreditNoteOriginal {
  return { id: doc.id, number: doc.number, issuedAt: doc.issuedAt, totalCents: doc.totalCents, gstCents: doc.gstCents, docType: doc.docType, reference: doc.reference }
}

function linesFor(amount: number, orig: TaxInvoiceDoc, verb: 'Refund' | 'Credit'): InvoiceLine[] {
  const sum = orig.lines.reduce((s, l) => s + l.amountCents, 0)
  if (amount === orig.totalCents && orig.lines.length && sum === amount) return orig.lines.map(l => ({ ...l, description: `${verb}: ${l.description}`.slice(0, 300) }))
  const what = orig.lines.length === 1 ? orig.lines[0].description : (orig.number ? `${orig.number}` : 'Colvy payment')
  return [{ description: `${amount === orig.totalCents ? verb : `Partial ${verb.toLowerCase()}`}: ${what}`.slice(0, 300), quantity: 1, unitCents: amount, amountCents: amount }]
}

type BuildOpts = { original: TaxInvoiceDoc; supplier: Party; customer: Party; prior?: { amountCents: number; gstCents: number } }

function supplierParty(s: Party): Party {
  return { name: s.name, abn: cleanAbn(s.abn), email: s.email || null, address: s.address || [] }
}

/** A succeeded Stripe refund on a payment with a Colvy invoice → its note. */
export function noteFromRefund(refund: any, o: BuildOpts): CreditNoteDoc {
  const prior = o.prior || { amountCents: 0, gstCents: 0 }
  const orig = o.original
  const asked = Math.max(0, int(refund?.amount))
  const amount = Math.min(asked, adjustableCents(orig, prior))
  const full = prior.amountCents + amount >= orig.totalCents && prior.amountCents === 0
  let reason = adjustmentReason({ source: orig.source, full, stripeReason: refund?.reason, memo: refund?.metadata?.reason })
  if (amount < asked) reason = `${reason} (limited to what was left on ${orig.number || 'the invoice'})`.slice(0, 300)
  const supplier = supplierParty(o.supplier)
  return {
    id: null, number: null,
    kind: noteKindFor(supplier, orig.docType), status: 'issued',
    currency: String(refund?.currency || orig.currency || 'aud').toLowerCase(),
    issuedAt: iso(refund?.created) || new Date().toISOString(), voidedAt: null,
    supplier, customer: o.customer, original: originalOf(orig),
    lines: amount > 0 ? linesFor(amount, orig, 'Refund') : [],
    amountCents: amount, gstCents: adjustmentGst(amount, orig, prior), priorAdjustedCents: prior.amountCents,
    reason,
    stripe: {
      refundId: sid(refund) , creditNoteId: null, refundIds: [],
      chargeId: sid(refund?.charge) || orig.stripe.chargeId, invoiceId: orig.stripe.invoiceId, paymentIntentId: sid(refund?.payment_intent) || orig.stripe.paymentIntentId,
    },
    reference: sid(refund) || '',
  }
}

/** The refunds a Stripe credit note paid out (old API: refund; newer: refunds[].refund). */
export function creditNoteRefundIds(cn: any): string[] {
  const out: string[] = []
  const one = sid(cn?.refund)
  if (one) out.push(one)
  for (const r of Array.isArray(cn?.refunds) ? cn.refunds : Array.isArray(cn?.refunds?.data) ? cn.refunds.data : []) {
    const id = sid(r?.refund) || (typeof r?.id === 'string' && !String(r.id).startsWith('cnr_') ? r.id : null)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function creditNoteTax(cn: any): number | null {
  const sum = (arr: any) => (Array.isArray(arr) ? arr.reduce((s: number, t: any) => s + int(t?.amount), 0) : 0)
  const t = sum(cn?.total_taxes) || sum(cn?.tax_amounts)
  return t > 0 ? t : null
}

/** A Stripe Billing credit note on a paid invoice → its note. */
export function noteFromStripeCreditNote(cn: any, o: BuildOpts): CreditNoteDoc {
  const prior = o.prior || { amountCents: 0, gstCents: 0 }
  const orig = o.original
  const asked = Math.max(0, int(cn?.total ?? cn?.amount))
  const amount = Math.min(asked, adjustableCents(orig, prior))
  const refundIds = creditNoteRefundIds(cn)
  const full = prior.amountCents + amount >= orig.totalCents && prior.amountCents === 0
  let reason = adjustmentReason({ source: orig.source, full, credit: refundIds.length === 0, stripeReason: cn?.reason, memo: cn?.memo })
  if (amount < asked) reason = `${reason} (limited to what was left on ${orig.number || 'the invoice'})`.slice(0, 300)
  const raw: any[] = Array.isArray(cn?.lines?.data) ? cn.lines.data : []
  const given: InvoiceLine[] = raw.map(l => {
    const quantity = Math.max(1, int(l?.quantity) || 1)
    const amountCents = int(l?.amount)
    return { description: (clean(l?.description) || 'Credit').slice(0, 300), quantity, unitCents: Math.round(amountCents / quantity), amountCents }
  }).filter(l => l.amountCents > 0)
  const lines = given.length && given.reduce((s, l) => s + l.amountCents, 0) === amount ? given : (amount > 0 ? linesFor(amount, orig, refundIds.length ? 'Refund' : 'Credit') : [])
  const tax = amount === asked ? creditNoteTax(cn) : null
  const supplier = supplierParty(o.supplier)
  return {
    id: null, number: null,
    kind: noteKindFor(supplier, orig.docType), status: 'issued',
    currency: String(cn?.currency || orig.currency || 'aud').toLowerCase(),
    issuedAt: iso(cn?.effective_at) || iso(cn?.created) || new Date().toISOString(), voidedAt: null,
    supplier, customer: o.customer, original: originalOf(orig),
    lines, amountCents: amount, gstCents: adjustmentGst(amount, orig, prior, tax), priorAdjustedCents: prior.amountCents,
    reason,
    stripe: {
      refundId: refundIds[0] || null, creditNoteId: sid(cn), refundIds,
      chargeId: orig.stripe.chargeId, invoiceId: sid(cn?.invoice) || orig.stripe.invoiceId, paymentIntentId: orig.stripe.paymentIntentId,
    },
    reference: sid(cn) || '',
  }
}

// ── stored row ↔ document ───────────────────────────────────────────────────

/** The columns issue_tax_credit_note (V406) takes. */
export function noteToRow(n: CreditNoteDoc): Record<string, any> {
  return {
    kind: n.kind, currency: n.currency, tax_invoice_id: n.original.id,
    stripe_refund_id: n.stripe.refundId, stripe_credit_note_id: n.stripe.creditNoteId, stripe_refund_ids: n.stripe.refundIds,
    stripe_charge_id: n.stripe.chargeId, stripe_invoice_id: n.stripe.invoiceId, stripe_payment_intent_id: n.stripe.paymentIntentId,
    issued_at: n.issuedAt, amount_cents: n.amountCents, gst_cents: n.gstCents, lines: n.lines, reason: n.reason,
    supplier: n.supplier, customer: n.customer,
  }
}

const party = (p: any): Party => ({ name: clean(p?.name) || 'Customer', abn: cleanAbn(p?.abn), email: clean(p?.email) || null, address: Array.isArray(p?.address) ? p.address.map(clean).filter(Boolean) : [] })

export function rowToNote(r: any): CreditNoteDoc {
  return {
    id: r.id || null, number: r.number || null,
    kind: r.kind === 'adjustment_note' ? 'adjustment_note' : 'refund_receipt',
    status: r.status === 'void' ? 'void' : 'issued',
    currency: r.currency || 'aud', issuedAt: r.issued_at || r.created_at, voidedAt: r.voided_at || null,
    supplier: party(r.supplier), customer: party(r.customer),
    original: {
      id: r.tax_invoice_id || null, number: r.original_number || null, issuedAt: r.original_issued_at || null,
      totalCents: int(r.original_total_cents), gstCents: int(r.original_gst_cents),
      docType: r.original_doc_type === 'tax_invoice' ? 'tax_invoice' : 'receipt', reference: r.stripe_invoice_id || r.stripe_payment_intent_id || '',
    },
    lines: Array.isArray(r.lines) ? r.lines.map((l: any) => ({ description: clean(l?.description), quantity: int(l?.quantity) || 1, unitCents: int(l?.unitCents), amountCents: int(l?.amountCents) })) : [],
    amountCents: int(r.amount_cents), gstCents: int(r.gst_cents), priorAdjustedCents: int(r.prior_adjusted_cents),
    reason: clean(r.reason),
    stripe: {
      refundId: r.stripe_refund_id || null, creditNoteId: r.stripe_credit_note_id || null, refundIds: Array.isArray(r.stripe_refund_ids) ? r.stripe_refund_ids : [],
      chargeId: r.stripe_charge_id || null, invoiceId: r.stripe_invoice_id || null, paymentIntentId: r.stripe_payment_intent_id || null,
    },
    reference: r.stripe_credit_note_id || r.stripe_refund_id || '',
  }
}

export function rowToAdjustment(r: any): AdjustmentRef {
  return {
    id: String(r.id), number: String(r.number || ''), kind: r.kind === 'adjustment_note' ? 'adjustment_note' : 'refund_receipt',
    status: r.status === 'void' ? 'void' : 'issued', issuedAt: r.issued_at || r.created_at, amountCents: int(r.amount_cents), gstCents: int(r.gst_cents),
  }
}

/** Totals of the notes that count (not void). */
export function adjustedTotals(list: { amountCents?: number; amount_cents?: number; gstCents?: number; gst_cents?: number; status?: string }[]): { amountCents: number; gstCents: number } {
  let amountCents = 0, gstCents = 0
  for (const n of list || []) {
    if (n?.status === 'void') continue
    amountCents += int(n.amountCents ?? n.amount_cents)
    gstCents += int(n.gstCents ?? n.gst_cents)
  }
  return { amountCents, gstCents }
}
