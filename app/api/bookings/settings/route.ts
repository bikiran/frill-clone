import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, loadLocations, stripeReady, bookingPageUrl, MIGRATION_HINT,
} from '@/lib/booking'
import { availabilityChanged } from '@/lib/booking-waitlist'
import { kickWaitlist } from '@/lib/booking-waitlist-queue'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId=   → settings + team + locations + payment status + share link
// PATCH { companyId, settings }
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const company = await loadCompanyPublic(db, { id: companyId })
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const staff = await loadStaff(db, company)
    return NextResponse.json({
      settings: resolveBookingSettings(company.booking_settings),
      saved: company.booking_settings != null,
      staff: staff.map(s => ({ id: s.id, name: s.name, avatar_url: s.avatar_url })),
      locations: await loadLocations(db, company.id),
      stripeReady: stripeReady(company),
      bookingUrl: company.slug ? bookingPageUrl(company) : null,
      slug: company.slug,
    })
  } catch (e: any) {
    const missing = /booking_settings|schema cache|does not exist/i.test(String(e?.message))
    return NextResponse.json({ error: missing ? MIGRATION_HINT : (e?.message || 'Failed') }, { status: missing ? 400 : 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const clean = resolveBookingSettings(body.settings || {})
    // The hours / people / closed days before this save, so the waitlist can
    // offer whatever is newly free.
    let before: any = undefined
    try { const { data } = await db.from('companies').select('booking_settings').eq('id', companyId).maybeSingle(); before = data ? data.booking_settings : undefined } catch {}
    const { error } = await db.from('companies').update({ booking_settings: clean }).eq('id', companyId)
    if (error) {
      const missing = /booking_settings|schema cache|could not find/i.test(error.message)
      return NextResponse.json({ error: missing ? MIGRATION_HINT : error.message }, { status: 400 })
    }
    if (before !== undefined && await availabilityChanged(db, companyId, before, clean)) kickWaitlist(db, req.nextUrl.origin)
    return NextResponse.json({ ok: true, settings: clean })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
