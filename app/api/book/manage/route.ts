import { NextRequest, NextResponse } from 'next/server'
import { hidesPoweredBy } from '@/lib/branding'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import { chatStripe } from '@/lib/chat-checkout'
import { buildIcs } from '@/lib/booking-ics'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, availability, publicBooking, policyFor,
  cancelBooking, rescheduleBooking, settleBookingPayment, isMissingBookingSchema, manageUrl, whereText,
} from '@/lib/booking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The customer's own booking, by its private manage token (from the
// confirmation SMS / email). No sign-in.
//
// GET  ?token=                            → booking
// GET  ?token=&op=slots&from=&to=         → times it can move to
// GET  ?token=&op=ics                     → calendar file (Apple Calendar / Outlook)
// POST { token, action: 'verify' }        → confirm after Stripe (if the webhook hasn't yet)
// POST { token, action: 'pay' }           → the checkout link again, while the hold lasts
// POST { token, action: 'cancel', reason? }
// POST { token, action: 'reschedule', startsAt }

async function load(db: any, token: string | null) {
  if (!token || token.length < 20) return null
  const { data: b } = await db.from('bookings').select('*').eq('manage_token', token).maybeSingle()
  if (!b) return null
  const company = await loadCompanyPublic(db, { id: b.company_id })
  if (!company) return null
  const { data: service } = b.service_id ? await db.from('booking_services').select('*').eq('id', b.service_id).maybeSingle() : { data: null }
  return { b, company, service, settings: resolveBookingSettings(company.booking_settings) }
}

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const ctx = await load(db, sp.get('token'))
    if (!ctx) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const { b, company, service, settings } = ctx

    if (sp.get('op') === 'ics') {
      const url = manageUrl(company, b.manage_token)
      const ics = buildIcs({
        uid: b.id, title: `${b.service_name} — ${company.name}`,
        startMs: Date.parse(b.starts_at), endMs: Date.parse(b.ends_at),
        location: whereText(b, service) || null, description: `Manage your booking: ${url}`, url,
        cancelled: b.status === 'cancelled', sequence: b.reschedule_count || 0,
      })
      // inline → iOS Safari shows "Add to Calendar"; desktops open Calendar / Outlook.
      return new NextResponse(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="booking.ics"', 'Cache-Control': 'no-store' } })
    }

    if (sp.get('op') === 'slots') {
      if (!service || !policyFor(b, settings).canReschedule) return NextResponse.json({ timezone: settings.timezone, slots: [] })
      const tz = settings.timezone
      const today = dateInTz(Date.now(), tz)
      let from = isDate(sp.get('from')) ? sp.get('from')! : today
      let to = isDate(sp.get('to')) ? sp.get('to')! : addDays(from, 34)
      if (from < today) from = today
      const last = addDays(today, service.max_days_ahead || 60)
      if (to > last) to = last
      if (to > addDays(from, 45)) to = addDays(from, 45)
      if (to < from) return NextResponse.json({ timezone: tz, slots: [] })
      const staff = await loadStaff(db, company)
      const staffFilter = b.staff_choice === 'specific' && b.staff_id ? b.staff_id : 'any'
      const { slots } = await availability(db, { company, settings, service, staff, staffFilter, fromDate: from, toDate: to, excludeBookingId: b.id })
      return NextResponse.json({ timezone: tz, slots: slots.map(s => ({ start: new Date(s.start).toISOString() })) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ booking: publicBooking(b, company, service, settings, await hidesPoweredBy(db, company.id, company)) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    if (isMissingBookingSchema(e)) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    if (!checkBurst(`book-manage:${callerKey(req)}`, 20)) return NextResponse.json({ error: 'Too many attempts — please wait a minute.' }, { status: 429 })
    const ctx = await load(db, body.token)
    if (!ctx) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const { b, company, service, settings } = ctx
    const origin = req.nextUrl.origin
    const reply = async () => {
      const fresh = await load(db, body.token)
      return NextResponse.json({ ok: true, booking: fresh ? publicBooking(fresh.b, fresh.company, fresh.service, fresh.settings, await hidesPoweredBy(db, fresh.company.id, fresh.company)) : null })
    }

    if (body.action === 'verify') {
      if ((b.status === 'pending' || b.status === 'expired') && b.stripe_session_id) {
        const { s, connectOpts } = chatStripe(company)
        const session: any = await s.checkout.sessions.retrieve(b.stripe_session_id, { expand: ['payment_intent.latest_charge'] } as any, connectOpts)
        if (session?.payment_status === 'paid') await settleBookingPayment(db, b.id, session, origin)
      }
      return reply()
    }

    if (body.action === 'pay') {
      if (b.status !== 'pending' || !b.hold_expires_at || Date.parse(b.hold_expires_at) <= Date.now() || !b.chat_payment_id) {
        return NextResponse.json({ error: 'This hold has expired — please book again.' }, { status: 410 })
      }
      const { data: pay } = await db.from('chat_payments').select('checkout_url').eq('id', b.chat_payment_id).maybeSingle()
      if (!pay?.checkout_url) return NextResponse.json({ error: 'Payment link not found — please book again.' }, { status: 410 })
      return NextResponse.json({ ok: true, checkoutUrl: pay.checkout_url })
    }

    if (body.action === 'cancel') {
      // An unpaid hold the customer backs out of: just release it.
      if (b.status === 'pending') {
        await db.from('bookings').update({ status: 'expired', hold_expires_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'pending')
        return reply()
      }
      const pol = policyFor(b, settings)
      if (!pol.canCancel) return NextResponse.json({ error: settings.late_cancel === 'block' ? `Bookings can’t be cancelled online within ${settings.cancel_hours} hours — please contact ${company.name}.` : 'This booking can’t be cancelled.' }, { status: 400 })
      const r = await cancelBooking(db, b.id, { by: 'customer', reason: String(body.reason || '').slice(0, 500), refund: pol.refundOnCancel, notifyCustomer: true, origin })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      return reply()
    }

    if (body.action === 'reschedule') {
      const pol = policyFor(b, settings)
      if (!service || !pol.canReschedule) return NextResponse.json({ error: `This booking can’t be moved online${settings.cancel_hours ? ` within ${settings.cancel_hours} hours of the start` : ''} — please contact ${company.name}.` }, { status: 400 })
      const startMs = Date.parse(String(body.startsAt || ''))
      if (!Number.isFinite(startMs)) return NextResponse.json({ error: 'Pick a new time.' }, { status: 400 })
      const r = await rescheduleBooking(db, b.id, { startMs, by: 'customer', notifyCustomer: true, origin })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
      return reply()
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
