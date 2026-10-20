import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAdmin } from '@/lib/company-access'
import { colvyStripe, ensureForRef } from '@/lib/tax-invoices'

export const dynamic = 'force-dynamic'

// GET /api/billing/tax-invoices?companyId=&ref=
//   One of the business's Colvy tax invoices (or receipts), for Billing →
//   Billing history → Tax invoice. `ref` is the document's id or the Stripe
//   invoice (in_…) / payment (pi_…) it's for. A payment with no document yet
//   gets one now (numbered, stored, the same one every time after), once it's
//   checked to be this business's payment. Before V404 the document is built
//   live from Stripe with no number (stored: false).
//   Owner / admin of the workspace (and the platform admin).
//   → { invoice: TaxInvoiceDoc, stored }   (invoice.adjustments lists its notes)
// GET /api/billing/tax-invoices?companyId=&note=
//   One of its adjustment notes (or refund receipts) for a refund, by id or
//   number (CN-000012). A refund receipt opened once Colvy's ABN is set becomes
//   an adjustment note with the same number.
//   → { note: CreditNoteDoc, stored: true }

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const note = req.nextUrl.searchParams.get('note') || ''
    const ref = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('id') || ''
    if (!companyId || (!ref && !note)) return NextResponse.json({ error: 'Missing companyId or ref' }, { status: 400 })
    const db: any = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the owner or an admin can see billing.' : 'Not authorized' }, { status: 403 })
    if (note) {
      const { ensureNote } = await import('@/lib/tax-credit-notes')
      const n = await ensureNote(db, companyId, note)
      if (!n.ok) return NextResponse.json({ error: n.error }, { status: n.status })
      return NextResponse.json({ note: n.note, stored: true })
    }
    const r = await ensureForRef(db, await colvyStripe(), companyId, ref)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ invoice: r.doc, stored: r.stored })
  } catch (err: any) {
    console.error('[billing/tax-invoices]', err?.message)
    return NextResponse.json({ error: 'We couldn’t open this invoice. Try again in a minute.' }, { status: 500 })
  }
}
