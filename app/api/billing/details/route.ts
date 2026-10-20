import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAdmin } from '@/lib/company-access'
import { colvyStripe, getBillingDetails, isMissing, syncStripeCustomers, validateDetails } from '@/lib/tax-invoices'
import { formatAbn } from '@/lib/abn'

export const dynamic = 'force-dynamic'

// Billing → Business details: who Colvy's tax invoices are made out to.
//
// GET  ?companyId=     → { ready, details: { legalName, abn, email, address }, defaults }
// POST { companyId, legalName, abn, email, address: { line1, line2, suburb, state, postcode } }
//   Checks the ABN (11 digits, ATO check digit; optional), saves it on the
//   company (V404 columns) and copies it to the business's Stripe customers
//   (name, address, email, au_abn tax ID), best effort. Documents already
//   issued keep the details they were issued with.
// Owner / admin of the workspace (and the platform admin).

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const NOT_READY = 'Business details can’t be saved just yet. Try again later, or email us and we’ll add them for you.'

function view(d: any) {
  return {
    legalName: d.legalName || '', abn: d.abn ? formatAbn(d.abn) : '', email: d.email || '',
    address: { line1: d.address?.line1 || '', line2: d.address?.line2 || '', suburb: d.address?.suburb || '', state: d.address?.state || '', postcode: d.address?.postcode || '' },
  }
}

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const db: any = admin()
    if (!(await requireCompanyAdmin(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const d = await getBillingDetails(db, companyId)
    if (!d) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    return NextResponse.json({ ready: d.ready, details: view(d), defaults: { legalName: d.companyName, email: d.ownerEmail || '' } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body?.companyId || '')
    const db: any = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the owner or an admin can change billing details.' : 'Not authorized' }, { status: 403 })
    const v = validateDetails(body || {})
    if (!v.ok) return NextResponse.json({ error: Object.values(v.errors)[0], errors: v.errors }, { status: 400 })
    const { error } = await db.from('companies').update(v.value).eq('id', companyId)
    if (error) {
      if (isMissing(error)) return NextResponse.json({ error: NOT_READY, notReady: true }, { status: 409 })
      return NextResponse.json({ error: 'We couldn’t save that. Try again in a minute.' }, { status: 500 })
    }
    let stripe = { synced: 0, failed: 0 }
    try { stripe = await syncStripeCustomers(db, await colvyStripe(), companyId) } catch {}
    const d = await getBillingDetails(db, companyId)
    return NextResponse.json({ ok: true, details: d ? view(d) : null, stripe })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
