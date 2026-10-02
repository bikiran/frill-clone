import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { addDays, dateInTz, isDate, zonedToUtc } from '@/lib/booking-time'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, availability, cancelBooking, rescheduleBooking,
  isMissingBookingSchema, MIGRATION_HINT, manageUrl, customerMessage,
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
// GET   ?companyId=&op=today                          → today's schedule + headline stats
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

    if (sp.get('op') === 'today') {
      const company = await loadCompanyPublic(db, { id: companyId })
      const settings = resolveBookingSettings(company?.booking_settings)
      const tz = settings.timezone
      const today = dateInTz(Date.now(), tz)
      const dayStart = zonedToUtc(today, '00:00', tz), dayEnd = zonedToUtc(addDays(today, 1), '00:00', tz)
      const DAY = 86400000, now = Date.now()
      const { data: rows, error } = await db.from('bookings')
        .select('id, status, service_id, service_name, staff_id, staff_name, starts_at, ends_at, created_at, customer_name, customer_phone, customer_email, address, location_label, amount_due_cents, refunded_cents, payment_status, currency, conversation_id, customer_confirmed_at, reminder_24h_at, reminder_2h_at, answers, notes')
        .eq('company_id', companyId).gte('starts_at', new Date(now - 30 * DAY).toISOString()).lt('starts_at', new Date(now + 8 * DAY).toISOString())
        .order('starts_at').limit(2000)
      if (error) {
        if (isMissingBookingSchema(error) || /column/i.test(error.message)) return NextResponse.json({ today: [], stats: null, setupNeeded: true, hint: 'Run migrations V323 + V324 in Supabase.' })
        throw error
      }
      const all = rows || []
      const live = (b: any) => ['confirmed', 'completed', 'no_show'].includes(b.status)
      const todays = all.filter(b => live(b) && Date.parse(b.starts_at) >= dayStart && Date.parse(b.starts_at) < dayEnd)
      const week = all.filter(b => live(b) && Date.parse(b.starts_at) >= now && Date.parse(b.starts_at) < now + 7 * DAY)
      const reminded = all.filter(b => b.status === 'confirmed' && Date.parse(b.starts_at) > now && (b.reminder_24h_at || b.reminder_2h_at))
      const past30 = all.filter(b => Date.parse(b.starts_at) < now && (b.status === 'completed' || b.status === 'no_show'))
      const noShows = past30.filter(b => b.status === 'no_show').length
      const paid = all.filter(b => Date.parse(b.created_at) > now - 30 * DAY && (b.payment_status === 'paid' || b.payment_status === 'partially_refunded'))
        .reduce((sum, b) => sum + (b.amount_due_cents || 0) - (b.refunded_cents || 0), 0)
      return NextResponse.json({
        timezone: tz,
        today: todays,
        stats: {
          today: todays.length,
          next7: week.length,
          newThisWeek: all.filter(b => live(b) && Date.parse(b.created_at) > now - 7 * DAY).length,
          confirmedRate: reminded.length ? Math.round(100 * reminded.filter(b => b.customer_confirmed_at).length / reminded.length) : null,
          remindedCount: reminded.length,
          noShowRate: past30.length ? Math.round(100 * noShows / past30.length) : null,
          noShows,
          paidCents30: paid,
          currency: all.find(b => b.currency)?.currency || 'aud',
        },
      })
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
      // Marked done by hand → start the rebook-nudge clock (V324 column).
      if (status === 'completed' && !b.completed_at) { try { await db.from('bookings').update({ completed_at: new Date().toISOString() }).eq('id', b.id) } catch {} }
      if (b.calendar_event_id) {
        const evStatus = status === 'completed' ? 'completed' : status === 'no_show' ? 'missed' : 'confirmed'
        try { await db.from('calendar_events').update({ status: evStatus }).eq('id', b.calendar_event_id) } catch {}
      }
      // "Sorry we missed you — book another time?"
      if (status === 'no_show' && body.notify) {
        const company = await loadCompanyPublic(db, { id: companyId })
        const { data: service } = b.service_id ? await db.from('booking_services').select('*').eq('id', b.service_id).maybeSingle() : { data: null }
        await customerMessage(db, company, resolveBookingSettings(company?.booking_settings), b, 'noshow', { service, origin })
      }
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
