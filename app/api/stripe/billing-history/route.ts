import { callerStripeCustomer, requireCompanyAdmin } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/stripe/billing-history?companyId=
//   The business's payments to Colvy: Stripe invoices (plans, add-ons, numbers)
//   and one-off payments with no Stripe invoice (SMS credit, auto top-ups,
//   porting fees), each with its Colvy tax invoice when one has been issued
//   (lib/tax-invoices billingHistory). Owner / admin of the workspace.
//   Without companyId (older pages): the caller's own plan customer's Stripe
//   invoices, as before.
// Always answers { invoices: [...] } (empty on any problem) so the page works.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET(req: NextRequest) {
  try {
    const db: any = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const { colvyStripe, billingHistory } = await import('@/lib/tax-invoices')
    if (companyId) {
      if (!(await requireCompanyAdmin(req, db, companyId)).ok) return NextResponse.json({ invoices: [] }, { status: 403 })
      const { rows, stored } = await billingHistory(db, await colvyStripe(), companyId)
      return NextResponse.json({ invoices: rows, taxInvoicesReady: stored })
    }

    // The caller's own billing customer — never one named in the request.
    const customerId = await callerStripeCustomer(req, db)
    if (!customerId) return NextResponse.json({ invoices: [] })
    const stripe = await colvyStripe()
    if (!stripe) return NextResponse.json({ invoices: [] })
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 })
    return NextResponse.json({
      invoices: invoices.data.map((inv: any) => ({
        id: inv.id,
        ref: inv.id,
        created: inv.created,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        description: inv.lines?.data?.[0]?.description || 'Subscription',
        invoice_pdf: inv.invoice_pdf,
        taxInvoice: null,
      }))
    })
  } catch (err: any) {
    return NextResponse.json({ invoices: [], error: err.message })
  }
}
