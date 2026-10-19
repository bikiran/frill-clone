import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { validatePortRequest, portFeeAud, type PortInput } from '@/lib/number-porting'
import { monthlyPriceAud } from '@/lib/number-types'
import { listCompanyPorts, createPortRequest, cancelPortByBusiness, getPort, missingTable, MIGRATION_NEEDED } from '@/lib/number-porting-server'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const prices = () => ({ portFee: portFeeAud(), monthly: monthlyPriceAud('local'), tollfreeMonthly: monthlyPriceAud('tollfree') })

// GET ?companyId= — the business's port requests (staff may look).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { unavailable, requests } = await listCompanyPorts(db, companyId)
    return NextResponse.json({ requests, unavailable, ...prices() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}

// POST multipart: companyId, data (the form as JSON), bill (the file). Owners
// and admins only: it signs a Letter of Authority for the business.
export async function POST(req: NextRequest) {
  try {
    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'Send the form with the bill attached.' }, { status: 400 }) }
    const companyId = String(form.get('companyId') || '')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the account owner or an admin can request a number move.' : 'Not authorized' }, { status: 403 })

    let input: PortInput = {}
    try { input = JSON.parse(String(form.get('data') || '{}')) } catch { return NextResponse.json({ error: 'The form didn’t come through. Please try again.' }, { status: 400 }) }
    const bill = form.get('bill')
    const file = bill && typeof bill === 'object' && 'arrayBuffer' in bill ? bill as File : null
    const check = validatePortRequest(input, file ? { name: file.name, type: file.type, size: file.size } : null)
    if (!check.ok || !check.value) return NextResponse.json({ error: Object.values(check.errors)[0] || 'Check the form.', errors: check.errors }, { status: 422 })

    // One open request per number: a second would only confuse the carriers.
    const { data: open, error: openErr } = await db.from('porting_requests').select('id, numbers, status')
      .eq('company_id', companyId).in('status', ['submitted', 'in_review', 'submitted_to_carrier', 'scheduled'])
    if (openErr && missingTable(openErr)) {
      return NextResponse.json({ error: MIGRATION_NEEDED, unavailable: true }, { status: 503 })
    }
    const clash = (open || []).find((r: any) => (r.numbers || []).some((n: string) => check.value!.numbers.includes(n)))
    if (clash) return NextResponse.json({ error: 'There’s already an open request for that number. You can follow it below.' }, { status: 409 })
    // A number that's already a Colvy number doesn't need porting.
    const { data: have } = await db.from('phone_numbers').select('phone_number').in('phone_number', check.value.numbers)
    if (have?.length) return NextResponse.json({ error: `${have[0].phone_number} is already a Colvy number.` }, { status: 409 })

    const bytes = new Uint8Array(await file!.arrayBuffer())
    const made = await createPortRequest(db, { companyId, userId: access.userId || null, value: check.value, bill: { name: file!.name, type: file!.type, size: file!.size, bytes } })
    if (!made.ok) return NextResponse.json({ error: made.error, unavailable: made.status === 503 }, { status: made.status })
    return NextResponse.json({ ok: true, request: made.request })
  } catch (err: any) {
    console.error('[phone-porting] create failed', err)
    return NextResponse.json({ error: 'Your request couldn’t be sent. Please try again.' }, { status: 500 })
  }
}

// PATCH { companyId, requestId, action: 'cancel' } — withdraw before it's lodged.
export async function PATCH(req: NextRequest) {
  try {
    const { companyId, requestId, action } = await req.json().catch(() => ({}))
    if (!companyId || !requestId) return NextResponse.json({ error: 'Missing companyId or requestId' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await getPort(db, String(requestId))
    if (!r || r.company_id !== companyId) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (action !== 'cancel') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const res = await cancelPortByBusiness(db, r, access.userId || null)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true, request: res.request })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
