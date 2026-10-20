// Colvy's adjustment notes (credit notes) for refunds: issuing, finding and
// sending them. Server only (service-role client). The document is built in
// lib/tax-credit-note-core and drawn by lib/tax-invoice-render.
//
// One note per Stripe refund and one per Stripe credit note, numbered
// CN-000001… by issue_tax_credit_note (migrations/COLVY_V406_CREDIT_NOTES.sql),
// always against the payment's Colvy tax invoice (issued first if it has none
// yet). From the Stripe webhook (lib/tax-invoices issueForEvent):
//   charge.refunded              every succeeded refund on the charge, each
//                                with its own amount (never the charge's
//                                running amount_refunded)
//   refund.created / refund.updated / charge.refund.updated
//                                that refund, once it has succeeded (a pending
//                                refund gets its note when it succeeds)
//   refund.failed, or a refund now failed / canceled
//                                its note, if one was issued, becomes void
//   credit_note.created / updated   a Stripe credit note on a paid invoice;
//                                one that pays out a refund shares that
//                                refund's note (never two)
//   credit_note.voided           its note becomes void
// and emailed to the billing contact once. Opening the payment from Billing
// (or super admin's "Issue missing") issues notes for refunds the webhook
// missed, without emailing.
//
// Only Colvy's own charges: a refund counts when its payment already has a
// Colvy tax invoice, or is one Colvy would give one (a Stripe invoice of a
// Colvy customer, an SMS credit / number / porting Checkout, an auto top-up).
// A business refunding its own customer (app/api/stripe/refund, connected
// accounts) never gets one.
//
// Before V406 runs nothing here throws: issuing answers not_set_up and the
// original invoice still records the refund in its "Adjustment" box.

import { colvySupplier, fmtAud, fmtInvoiceDate, rowToDoc, sid, type Party } from '@/lib/tax-invoice-core'
import { adjustedTotals, noteFromRefund, noteFromStripeCreditNote, noteKindFor, noteTitle, noteToRow, rowToNote, creditNoteRefundIds, type CreditNoteDoc } from '@/lib/tax-credit-note-core'
import {
  customerFromDetails, getBillingDetails, isColvyCheckout, isMissing, issueForCheckoutSession, issueForPaymentIntent, issueForStripeInvoice,
  upgradeReceipt, type BillingDetails,
} from '@/lib/tax-invoices'

export type NoteResult = { ok: boolean; created: boolean; stored: boolean; note: CreditNoteDoc | null; reason?: string }
const no = (reason: string, note: CreditNoteDoc | null = null): NoteResult => ({ ok: false, created: false, stored: false, note, reason })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function invoiceRow(db: any, col: string, val: string | null): Promise<{ row: any | null; missing: boolean }> {
  if (!val) return { row: null, missing: false }
  try {
    const { data, error } = await db.from('tax_invoices').select('*').eq(col, val).limit(1)
    if (error) return { row: null, missing: isMissing(error) }
    return { row: (data || [])[0] || null, missing: false }
  } catch (e) { return { row: null, missing: isMissing(e) } }
}

// ── the original tax invoice ───────────────────────────────────────────────

/**
 * The Colvy tax invoice for a payment: the stored one, or issued now (no email)
 * when the payment is a Colvy charge. A Receipt is upgraded to a Tax Invoice
 * when Colvy's ABN is now set, so the note can be an adjustment note.
 */
export async function ensureOriginal(db: any, stripe: any | null, ref: { invoiceId?: string | null; paymentIntentId?: string | null }): Promise<{ row: any | null; reason?: string }> {
  const invId = ref.invoiceId || null
  let piId = ref.paymentIntentId || null
  let hit = await invoiceRow(db, 'stripe_invoice_id', invId)
  if (!hit.row && !hit.missing) hit = await invoiceRow(db, 'stripe_payment_intent_id', piId)
  if (hit.missing) return { row: null, reason: 'not_set_up' }
  if (hit.row) return { row: await upgradeReceipt(db, hit.row) }
  if (!stripe) return { row: null, reason: 'no_stripe' }

  let r: any = null
  if (invId) {
    let inv: any = null
    try { inv = await stripe.invoices.retrieve(invId) } catch {}
    if (!inv) return { row: null, reason: 'not_found' }
    r = await issueForStripeInvoice(db, stripe, inv)
  } else if (piId) {
    let pi: any = null
    try { pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] }) } catch {}
    if (!pi) return { row: null, reason: 'not_found' }
    const meta = pi.metadata || {}
    if (pi.invoice) {
      let inv: any = null
      try { inv = await stripe.invoices.retrieve(sid(pi.invoice)) } catch {}
      if (inv) r = await issueForStripeInvoice(db, stripe, inv)
    } else if (meta.kind === 'sms_credit_auto') {
      r = await issueForPaymentIntent(db, stripe, pi, { source: 'sms_auto_topup' })
    } else if (isColvyCheckout(meta) && meta.companyId) {
      r = await issueForPaymentIntent(db, stripe, pi, { companyId: String(meta.companyId) })
    } else {
      // A Checkout payment keeps its metadata on the session (porting fees).
      let session: any = null
      try { session = (await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 }))?.data?.[0] || null } catch {}
      if (!session || !isColvyCheckout(session.metadata)) return { row: null, reason: 'not_colvy' }
      r = await issueForCheckoutSession(db, stripe, { ...session, payment_intent: pi, payment_status: session.payment_status || 'paid' })
    }
  }
  if (!r) return { row: null, reason: 'not_colvy' }
  if (!r.ok || !r.doc?.id) return { row: null, reason: r.reason === 'no_company' ? 'not_colvy' : (r.reason || 'error') }
  const again = await invoiceRow(db, 'id', r.doc.id)
  return again.row ? { row: await upgradeReceipt(db, again.row) } : { row: null, reason: 'error' }
}

// ── storing ─────────────────────────────────────────────────────────────────

async function notesFor(db: any, invoiceId: string): Promise<{ rows: any[]; missing: boolean }> {
  try {
    const { data, error } = await db.from('tax_credit_notes').select('*').eq('tax_invoice_id', invoiceId).order('seq', { ascending: true })
    if (error) return { rows: [], missing: isMissing(error) }
    return { rows: data || [], missing: false }
  } catch (e) { return { rows: [], missing: isMissing(e) } }
}

const covers = (row: any, refundIds: string[], creditNoteId: string | null) =>
  (creditNoteId && row.stripe_credit_note_id === creditNoteId) ||
  refundIds.some(id => row.stripe_refund_id === id || (Array.isArray(row.stripe_refund_ids) && row.stripe_refund_ids.includes(id)))

/** Store the note (numbering it) through issue_tax_credit_note; the existing one if already issued. */
export async function storeNote(db: any, companyId: string, note: CreditNoteDoc): Promise<NoteResult & { leftCents?: number }> {
  if (!(note.amountCents > 0)) return no('nothing_refunded', note)
  try {
    const { data, error } = await db.rpc('issue_tax_credit_note', { p_company: companyId, p_note: noteToRow(note) })
    if (error) return no(isMissing(error) ? 'not_set_up' : 'error', note)
    if (!data?.ok || !data.note) return { ...no(data?.reason || 'error', note), leftCents: data?.left_cents }
    if (String(data.note.company_id) !== String(companyId)) return { ok: false, created: false, stored: true, note: null, reason: 'other_company' }
    return { ok: true, created: !!data.created, stored: true, note: rowToNote(data.note) }
  } catch (e: any) {
    return no(isMissing(e) ? 'not_set_up' : 'error', note)
  }
}

type Build = (o: { original: any; supplier: Party; customer: Party; prior: { amountCents: number; gstCents: number } }) => CreditNoteDoc

/**
 * Number a note for this invoice. Earlier notes cap it (never past the
 * invoice's total); when another note got in first (two refunds at once), it's
 * built again on the new total.
 */
async function issueAgainst(db: any, row: any, keys: { refundIds: string[]; creditNoteId: string | null }, build: Build, o: { email?: boolean; details?: BillingDetails | null }): Promise<NoteResult> {
  const companyId = String(row.company_id)
  const details = o.details !== undefined ? o.details : await getBillingDetails(db, companyId)
  const original = rowToDoc(row)
  const customer = customerFromDetails(details, original.customer)
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await notesFor(db, row.id)
    if (existing.missing) return no('not_set_up')
    const hit = existing.rows.find(n => covers(n, keys.refundIds, keys.creditNoteId))
    // Already issued (and, for a credit note, already linked): nothing to number.
    if (hit && (!keys.creditNoteId || hit.stripe_credit_note_id === keys.creditNoteId)) return { ok: true, created: false, stored: true, note: rowToNote(hit) }
    // A refund's note being linked to its credit note doesn't count against itself.
    const prior = adjustedTotals(existing.rows.filter(n => n !== hit))
    const note = build({ original, supplier: colvySupplier(), customer, prior })
    if (!hit && !(note.amountCents > 0)) return no('exceeds_invoice', note)
    const r = await storeNote(db, companyId, note)
    if (r.reason === 'exceeds_invoice' && attempt === 0) continue
    if (r.created && o.email) await emailCreditNote(db, companyId, r.note!, details).catch(e => console.error('[tax-credit-notes] email failed', e?.message))
    return r
  }
  return no('exceeds_invoice')
}

/** Void the note for a refund that failed, or a Stripe credit note that was voided. The number stays used. */
export async function voidNotes(db: any, key: { refundId?: string | null; creditNoteId?: string | null }): Promise<number> {
  const col = key.creditNoteId ? 'stripe_credit_note_id' : 'stripe_refund_id'
  const val = key.creditNoteId || key.refundId
  if (!val) return 0
  try {
    const { data } = await db.from('tax_credit_notes').update({ status: 'void', voided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq(col, val).eq('status', 'issued').select('id')
    return (data || []).length
  } catch { return 0 }
}

// ── from Stripe ─────────────────────────────────────────────────────────────

async function chargeOf(stripe: any | null, refund: any, given?: any): Promise<any | null> {
  if (given && typeof given === 'object') return given
  if (refund?.charge && typeof refund.charge === 'object') return refund.charge
  const id = sid(refund?.charge)
  if (!stripe || !id) return null
  try { return await stripe.charges.retrieve(id) } catch { return null }
}

/** The Stripe credit note that paid out this refund, if any. */
async function creditNoteForRefund(stripe: any | null, invoiceId: string | null, refundId: string): Promise<any | null> {
  if (!stripe || !invoiceId || !stripe.creditNotes?.list) return null
  try {
    const list = await stripe.creditNotes.list({ invoice: invoiceId, limit: 100 })
    return (list?.data || []).find((cn: any) => creditNoteRefundIds(cn).includes(refundId)) || null
  } catch { return null }
}

export type NoteOpts = { email?: boolean; charge?: any; details?: BillingDetails | null }

/** One Stripe refund → its note, once it has succeeded. */
export async function issueForRefund(db: any, stripe: any | null, refund: any, o: NoteOpts = {}): Promise<NoteResult> {
  const id = sid(refund)
  if (!id) return no('invalid')
  const status = String(refund.status || '')
  if (status === 'failed' || status === 'canceled') { await voidNotes(db, { refundId: id }); return no('failed') }
  if (status !== 'succeeded') return no('pending')
  const charge = await chargeOf(stripe, refund, o.charge)
  const piId = sid(refund.payment_intent) || sid(charge?.payment_intent)
  const invId = sid(charge?.invoice)
  if (!piId && !invId) return no('no_payment')
  const { row, reason } = await ensureOriginal(db, stripe, { invoiceId: invId, paymentIntentId: piId })
  if (!row) return no(reason || 'not_colvy')
  // Paid out by a Stripe credit note: that credit note is the adjustment.
  const cn = await creditNoteForRefund(stripe, row.stripe_invoice_id || invId, id)
  if (cn) return issueForStripeCreditNote(db, stripe, cn, o)
  return issueAgainst(db, row, { refundIds: [id], creditNoteId: null },
    b => noteFromRefund({ ...refund, charge: sid(charge) || refund.charge }, b), o)
}

/** charge.refunded: every succeeded refund on the charge, oldest first, each its own note. */
export async function issueForCharge(db: any, stripe: any | null, charge: any, o: NoteOpts = {}): Promise<NoteResult[]> {
  const id = sid(charge)
  if (!id) return []
  let refunds: any[] = []
  if (stripe?.refunds?.list) {
    try { refunds = (await stripe.refunds.list({ charge: id, limit: 100 }))?.data || [] } catch {}
  }
  if (!refunds.length && Array.isArray(charge?.refunds?.data)) refunds = charge.refunds.data
  refunds = refunds.filter(r => sid(r)).sort((a, b) => (Number(a.created) || 0) - (Number(b.created) || 0))
  const out: NoteResult[] = []
  for (const r of refunds) out.push(await issueForRefund(db, stripe, { ...r, charge: id, payment_intent: r.payment_intent || charge.payment_intent }, { ...o, charge }))
  return out
}

/** A Stripe Billing credit note → its note (or void it). Pre-payment credit notes reduce an unpaid invoice: no note. */
export async function issueForStripeCreditNote(db: any, stripe: any | null, cn: any, o: NoteOpts = {}): Promise<NoteResult> {
  const id = sid(cn)
  if (!id) return no('invalid')
  if (cn.status === 'void') { await voidNotes(db, { creditNoteId: id }); return no('void') }
  if (cn.type === 'pre_payment') return no('pre_payment')
  const invId = sid(cn.invoice)
  if (!invId) return no('no_invoice')
  const { row, reason } = await ensureOriginal(db, stripe, { invoiceId: invId })
  if (!row) return no(reason || 'not_colvy')
  return issueAgainst(db, row, { refundIds: creditNoteRefundIds(cn), creditNoteId: id }, b => noteFromStripeCreditNote(cn, b), o)
}

/** Refunds on a stored invoice's payment that have no note yet (opening it, backfill). No email. */
export async function issueMissingNotes(db: any, stripe: any | null, row: any): Promise<number> {
  if (!stripe || !row) return 0
  let chargeId = row.stripe_charge_id || null
  if (!chargeId && row.stripe_payment_intent_id) {
    try { chargeId = sid((await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id))?.latest_charge) } catch {}
  }
  if (!chargeId) return 0
  let charge: any = null
  try { charge = await stripe.charges.retrieve(chargeId) } catch { return 0 }
  const res = await issueForCharge(db, stripe, charge, { email: false })
  return res.filter(r => r.created).length
}

// ── opening one ─────────────────────────────────────────────────────────────

export type OpenNoteResult = { ok: boolean; note?: CreditNoteDoc; status?: number; error?: string }

/**
 * Issued as a Refund Receipt while Colvy's ABN wasn't set, now it is: becomes
 * an adjustment note (same number), as long as its original is a tax invoice
 * (the original is upgraded first, as opening it would).
 */
export async function upgradeNote(db: any, row: any): Promise<any> {
  const s = colvySupplier()
  if (row?.kind !== 'refund_receipt' || !s.abn || !row.tax_invoice_id) return row
  const orig = await invoiceRow(db, 'id', row.tax_invoice_id)
  if (!orig.row) return row
  const upgraded = await upgradeReceipt(db, orig.row)
  if (noteKindFor(s, upgraded?.doc_type) !== 'adjustment_note') return row
  const supplier = { name: s.name, abn: s.abn, email: s.email, address: s.address }
  const patch = { kind: 'adjustment_note', supplier, original_doc_type: 'tax_invoice', updated_at: new Date().toISOString() }
  try {
    const { error } = await db.from('tax_credit_notes').update(patch).eq('id', row.id)
    if (error) return row
    return { ...row, ...patch }
  } catch { return row }
}

/** One of the business's notes by id (or its number, CN-000012). */
export async function ensureNote(db: any, companyId: string, ref: string): Promise<OpenNoteResult> {
  ref = String(ref || '').trim()
  const nf: OpenNoteResult = { ok: false, status: 404, error: 'We couldn’t find that adjustment note.' }
  const col = UUID.test(ref) ? 'id' : /^CN-\d{6,}$/.test(ref) ? 'number' : null
  if (!col) return nf
  try {
    const { data, error } = await db.from('tax_credit_notes').select('*').eq(col, ref).maybeSingle()
    if (error || !data || String(data.company_id) !== String(companyId)) return nf
    return { ok: true, note: rowToNote(await upgradeNote(db, data)) }
  } catch { return nf }
}

// ── telling the business ───────────────────────────────────────────────────

export function creditNoteUrl(slug: string | null, id: string): string {
  const host = slug ? `https://${slug}.colvy.com` : 'https://colvy.com'
  return `${host}/admin/billing/tax-invoice?note=${encodeURIComponent(id)}`
}

/** Email the billing contact a link to a newly issued note (once). */
export async function emailCreditNote(db: any, companyId: string, note: CreditNoteDoc, details?: BillingDetails | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key || !note.id) return false
  const d = details || await getBillingDetails(db, companyId)
  const to = note.customer.email || d?.email || d?.ownerEmail
  if (!to) return false
  const { taxCreditNoteEmail } = await import('@/lib/colvy-account-emails')
  const mail = taxCreditNoteEmail({
    business: d?.companyName || note.customer.name, title: noteTitle(note), number: note.number || note.reference,
    amount: fmtAud(note.amountCents), gst: fmtAud(note.gstCents), date: fmtInvoiceDate(note.issuedAt),
    original: `${note.original.number || note.original.reference}${note.original.issuedAt ? ` (${fmtInvoiceDate(note.original.issuedAt)})` : ''}`,
    reason: note.reason, url: creditNoteUrl(d?.slug || null, note.id),
  })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Colvy <noreply@updates.colvy.com>', to: [to], reply_to: note.supplier.email || undefined, subject: mail.subject, html: mail.html, text: mail.text }),
  })
  if (!res.ok) { console.error('[tax-credit-notes] email failed', res.status); return false }
  try { await db.from('tax_credit_notes').update({ emailed_at: new Date().toISOString() }).eq('id', note.id) } catch {}
  return true
}

/** The webhook's hook for refunds and Stripe credit notes. Never throws. */
export async function noteForEvent(db: any, stripe: any | null, event: any): Promise<NoteResult[] | null> {
  try {
    if (!event || event.account) return null
    const obj = event.data?.object
    switch (event.type) {
      case 'charge.refunded':
        return await issueForCharge(db, stripe, obj, { email: true })
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
      case 'charge.refund.updated':
        return [await issueForRefund(db, stripe, obj, { email: true })]
      case 'credit_note.created':
      case 'credit_note.updated':
      case 'credit_note.voided':
        return [await issueForStripeCreditNote(db, stripe, obj, { email: true })]
    }
  } catch (e: any) { console.error('[tax-credit-notes] issue failed', e?.message || e) }
  return null
}
