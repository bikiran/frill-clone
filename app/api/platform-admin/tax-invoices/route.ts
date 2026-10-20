import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, isMissing } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { billingHistory, colvyStripe, ensureForRef } from '@/lib/tax-invoices'
import { supplierStatus } from '@/lib/tax-invoice-core'
import { ensureNote, issueMissingNotes } from '@/lib/tax-credit-notes'

export const dynamic = 'force-dynamic'

// Super admin → a company's console → Tax invoices.
//
// GET ?companyId=          the company's issued documents, and whether Colvy's
//                          own invoice details (COLVY_ABN …) are set
// GET ?companyId=&ref=     one document (issued now if it's a paid payment of
//                          theirs with none yet), to view and print
// GET ?companyId=&note=    one of its adjustment notes
// POST { companyId, action: 'backfill' }
//                          issue documents for every paid payment in their
//                          Stripe history that has none (up to 40 a run), and
//                          adjustment notes for refunds that have none (up to
//                          40 payments a run); no emails are sent for these.
//                          Audited.
export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const ref = req.nextUrl.searchParams.get('ref') || ''
    const noteRef = req.nextUrl.searchParams.get('note') || ''
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    if (noteRef) {
      const n = await ensureNote(db, companyId, noteRef)
      if (!n.ok) return NextResponse.json({ error: n.error }, { status: n.status })
      return NextResponse.json({ note: n.note, stored: true })
    }
    if (ref) {
      const r = await ensureForRef(db, await colvyStripe(), companyId, ref)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json({ invoice: r.doc, stored: r.stored })
    }
    const { data, error } = await db.from('tax_invoices')
      .select('id, number, doc_type, status, source, issued_at, total_cents, gst_cents, refunded_cents, stripe_invoice_id, stripe_payment_intent_id, emailed_at, customer')
      .eq('company_id', companyId).order('issued_at', { ascending: false }).limit(200)
    // Adjustment notes, listed under their invoices (none before V406).
    const notes = await db.from('tax_credit_notes')
      .select('id, number, kind, status, tax_invoice_id, original_number, issued_at, amount_cents, gst_cents, reason, emailed_at, stripe_refund_id, stripe_credit_note_id')
      .eq('company_id', companyId).order('seq', { ascending: true }).limit(400)
    return NextResponse.json({
      unavailable: !!error && isMissing(error),
      invoices: error ? [] : (data || []),
      notes: notes.error ? [] : (notes.data || []),
      notesUnavailable: !!notes.error && isMissing(notes.error),
      supplier: supplierStatus(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const me = await superAdmin(req, db)
    if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const companyId = String(body?.companyId || '')
    if (!companyId || body?.action !== 'backfill') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const stripe = await colvyStripe()
    if (!stripe) return NextResponse.json({ error: 'Stripe isn’t set up (STRIPE_SECRET_KEY).' }, { status: 503 })
    const { rows, stored } = await billingHistory(db, stripe, companyId)
    if (!stored) return NextResponse.json({ error: 'Run migrations/COLVY_V404_TAX_INVOICES.sql first.', unavailable: true }, { status: 409 })
    const todo = rows.filter(r => !r.taxInvoice && r.status === 'paid' && r.amount_paid > 0).slice(0, 40)
    let issued = 0, failed = 0
    for (const r of todo) {
      const res = await ensureForRef(db, stripe, companyId, r.ref)
      if (res.ok && res.stored) issued++; else failed++
    }
    // Refunds without an adjustment note: every stored invoice's payment is
    // checked in Stripe (the refund webhook may never have arrived).
    let notesIssued = 0
    const { data: stored2 } = await db.from('tax_invoices')
      .select('id, company_id, stripe_charge_id, stripe_payment_intent_id, stripe_invoice_id, refunded_cents, total_cents')
      .eq('company_id', companyId).order('issued_at', { ascending: false }).limit(40)
    for (const row of stored2 || []) {
      try { notesIssued += await issueMissingNotes(db, stripe, row) } catch {}
    }
    await logSuperAdminAudit(db, { adminId: me.id, adminEmail: me.email, action: 'tax_invoices.backfill', companyId, summary: `Issued ${issued} tax invoice${issued === 1 ? '' : 's'} and ${notesIssued} adjustment note${notesIssued === 1 ? '' : 's'}`, detail: { issued, failed, considered: todo.length, notesIssued } } as any)
    return NextResponse.json({ ok: true, issued, failed, notesIssued })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
