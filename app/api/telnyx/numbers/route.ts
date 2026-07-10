import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: list all of a company's numbers, with their assigned location.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data: numbers } = await db.from('phone_numbers')
      .select('*').eq('company_id', companyId).neq('status', 'released')
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true })
    const { data: locations } = await db.from('company_locations')
      .select('id, label, suburb, state').eq('company_id', companyId)
    return NextResponse.json({ numbers: numbers || [], locations: locations || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH: assign a number to a location, set primary, or relabel.
export async function PATCH(req: NextRequest) {
  try {
    const { numberId, companyId, locationId, isPrimary, label } = await req.json()
    if (!numberId || !companyId) return NextResponse.json({ error: 'Missing numberId or companyId' }, { status: 400 })
    const db = admin()

    const patch: any = { updated_at: new Date().toISOString() }
    if (locationId !== undefined) patch.location_id = locationId || null
    if (label !== undefined) patch.label = label
    if (isPrimary === true) {
      // Only one primary per company
      await db.from('phone_numbers').update({ is_primary: false }).eq('company_id', companyId)
      patch.is_primary = true
    }
    await db.from('phone_numbers').update(patch).eq('id', numberId)

    // Keep the location's back-reference in sync
    if (locationId !== undefined) {
      // Clear this number from any other location first
      await db.from('company_locations').update({ phone_number_id: null }).eq('phone_number_id', numberId)
      if (locationId) await db.from('company_locations').update({ phone_number_id: numberId }).eq('id', locationId)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: release a number (soft-delete; actual Telnyx release is a follow-up).
export async function DELETE(req: NextRequest) {
  try {
    const numberId = req.nextUrl.searchParams.get('numberId')
    if (!numberId) return NextResponse.json({ error: 'Missing numberId' }, { status: 400 })
    const db = admin()
    await db.from('phone_numbers').update({ status: 'released', is_primary: false, updated_at: new Date().toISOString() }).eq('id', numberId)
    await db.from('company_locations').update({ phone_number_id: null }).eq('phone_number_id', numberId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
