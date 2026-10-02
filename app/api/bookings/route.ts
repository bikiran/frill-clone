import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, availability, cancelBooking, rescheduleBooking,
  isMissingBookingSchema, MIGRATION_HINT, manageUrl,
} from '@/lib/booking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Team view of online bookings.
// GET   ?companyId=&scope=upcoming|past|cancelled|all
// GET   ?companyId=&op=slots&id=&from=&to=          → times a booking can move to
// PATCH { companyId, id, action: 'cancel' | 'reschedule' | 'complete' | 'no_show' | 'confirm',
//         refund?, notify?, reason?, startsAt? }
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (sp.get('op') === 'slots') {
      const { data: b } = await db.from('bookings').select('*').eq('id', sp.get('id')).eq('company_id', companyId).maybeSingle()
      if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const company = await loadCompanyPublic(db, { id: companyId })
      const settings = resolveBookingSettings(company?.booking_settings)
      const { data: service } = await db.from('booking_services').select('*').eq('id', b.service_id).maybeSingle()
      if (!service) return NextResponse.json({ timezone: settings.timezone, slots: [] })
      const today = dateInTz(Date.now(), settings.timezone)
      let from = isDate(sp.get('from')) ? sp.get('from')! : today
      if (from < today) from = today
      let to = isDate(sp.get('to')) ? sp.get('to')! : addDays(from, 34)
      if (to > addDays(from, 45)) to = addDays(from, 45)
      // The team can move a booking past the customer-facing notice window.
      const staff = await loadStaff(db, company)
      const { slots } = await availability(db, { company, settings, service: { ...service, min_notice_mins: 0, max_days_ahead: 365 }, staff, staffFilter: b.staff_choice === 'specific' && b.staff_id ? b.staff_id : 'any', fromDate: from, toDate: to, excludeBookingId: b.id })
      return NextResponse.json({ timezone: settings.timezone, slots: slots.map(s => ({ start: new Date(s.start).toISOString() })) })
    }

    const scope = sp.get('scope') || 'upcoming'
    const nowIso = new Date().toISOString()
    let q = db.from('bookings').select('*').eq('company_id', companyId)
    if (scope === 'upcoming') q = q.in('status', ['confirmed', 'pending']).gte('ends_at', nowIso).order('starts_at', { ascending: true })
    else if (scope === 'past') q = q.in('status', ['confirmed', 'completed', 'no_show']).lt('ends_at', nowIso).order('starts_at', { ascending: false })
    else if (scope === 'cancelled') q = q.in('status', ['cancelled']).order('starts_at', { ascending: false })
    else q = q.order('starts_at', { ascending: false })
    const { data, error } = await q.limit(500)
    if (error) {
      if (isMissingBookingSchema(error)) return NextResponse.json({ bookings: [], setupNeeded: true, hint: MIGRATION_HINT })
      throw error
    }
    // Lapsed unpaid holds are noise in "upcoming" — hide them.
    const rows = (data || []).filter((b: any) => b.status !== 'pending' || (b.hold_expires_at && b.hold_expires_at > nowIso))
    const company = await loadCompanyPublic(db, { id: companyId })
    return NextResponse.json({ bookings: rows.map((b: any) => ({ ...b, manage_token: undefined, manage_url: company ? manageUrl(company, b.manage_token) : null })) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data: b } = await db.from('bookings').select('*').eq('id', body.id).eq('company_id', companyId).maybeSingle()
    if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const origin = req.nextUrl.origin

    if (body.action === 'cancel') {
      const r = await cancelBooking(db, b.id, { by: 'business', reason: body.reason || null, refund: !!body.refund, notifyCustomer: body.notify !== false, origin })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      return NextResponse.json({ ok: true, refunded: r.refunded || 0, refundError: r.refundError || null })
    }
    if (body.action === 'reschedule') {
      const startMs = Date.parse(String(body.startsAt || ''))
      if (!Number.isFinite(startMs)) return NextResponse.json({ error: 'Pick a new time' }, { status: 400 })
      const r = await rescheduleBooking(db, b.id, { startMs, by: 'business', notifyCustomer: body.notify !== false, origin })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'complete' || body.action === 'no_show' || body.action === 'confirm') {
      if (!['confirmed', 'completed', 'no_show'].includes(b.status)) return NextResponse.json({ error: 'Only confirmed bookings can be updated' }, { status: 400 })
      const status = body.action === 'complete' ? 'completed' : body.action === 'no_show' ? 'no_show' : 'confirmed'
      await db.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', b.id)
      if (b.calendar_event_id) {
        const evStatus = status === 'completed' ? 'completed' : status === 'no_show' ? 'missed' : 'confirmed'
        try { await db.from('calendar_events').update({ status: evStatus }).eq('id', b.calendar_event_id) } catch {}
      }
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
