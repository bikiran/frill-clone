import { NextRequest, NextResponse, after } from 'next/server'
import { hidesPoweredBy } from '@/lib/branding'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import { chatStripe } from '@/lib/chat-checkout'
import { buildIcs } from '@/lib/booking-ics'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, availability, publicBooking, policyFor,
  cancelBooking, rescheduleBooking, settleBookingPayment, isMissingBookingSchema, manageUrl, whereText,
  checkInState, announceArrival,
} from '@/lib/booking'
import { accountLink } from '@/lib/portal/auth'
import { isMissingColumn } from '@/lib/email-db'
import { fmtTime } from '@/lib/booking-time'
import { bookingTimeFreed } from '@/lib/booking-waitlist-queue'
import { resolveRestaurantSettings } from '@/lib/restaurant/settings'
import { resContext, slotsFor } from '@/lib/restaurant/server'

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
// POST { token, action: 'arrived' }       → "I'm here": the team gets an alert (once)

// Without V431 the booking can't remember the tap; this stops repeat alerts meanwhile.
const toldTeam = new Map<string, number>()

async function load(db: any, token: string | null) {
  if (!token || token.length < 20) return null
  const { data: b } = await db.from('bookings').select('*').eq('manage_token', token).maybeSingle()
  if (!b) return null
  const company = await loadCompanyPublic(db, { id: b.company_id })
  if (!company) return null
  const { data: service } = b.service_id ? await db.from('booking_services').select('*').eq('id', b.service_id).maybeSingle() : { data: null }
  const settings = resolveBookingSettings(company.booking_settings)
  if (service?.kind === 'reservation') {
    // A table: the restaurant's own window for changes; cancelling is always
    // allowed online (a restaurant would rather know than get a no-show). A
    // deposit comes back when they cancel before that window; after it, it's kept.
    try {
      const { data: rc } = await db.from('companies').select('restaurant_settings').eq('id', company.id).maybeSingle()
      const rs = resolveRestaurantSettings(rc?.restaurant_settings)
      Object.assign(settings, { cancel_hours: rs.cancel_hours, allow_reschedule: rs.allow_changes, late_cancel: 'allow', refund_on_cancel: true })
    } catch {}
  }
  return { b, company, service, settings }
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

    if (sp.get('op') === 'slots' && service?.kind === 'reservation') {
      // A table: same party, times with room (this booking's own seats freed).
      if (!policyFor(b, settings).canReschedule) return NextResponse.json({ timezone: settings.timezone, slots: [] })
      const r = await resContext(db, b.company_id)
      if (!r.ctx) return NextResponse.json({ timezone: settings.timezone, slots: [] })
      const tz = r.ctx.tz
      const today = dateInTz(Date.now(), tz)
      let from = isDate(sp.get('from')) ? sp.get('from')! : today
      if (from < today) from = today
      let to = isDate(sp.get('to')) ? sp.get('to')! : addDays(from, 13)
      const last = addDays(today, r.ctx.rs.max_days_ahead)
      if (to > last) to = last
      if (to > addDays(from, 20)) to = addDays(from, 20)
      const out: { start: string }[] = []
      for (let d = from; d <= to; d = addDays(d, 1)) {
        for (const x of await slotsFor(db, r.ctx, d, b.seats || 1, { excludeId: b.id })) if (x.ok) out.push({ start: new Date(x.start).toISOString() })
      }
      return NextResponse.json({ timezone: tz, slots: out }, { headers: { 'Cache-Control': 'no-store' } })
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
      const { slots } = await availability(db, { company, settings, service, staff, staffFilter, fromDate: from, toDate: to, excludeBookingId: b.id, locationId: b.location_id })
      return NextResponse.json({ timezone: tz, slots: slots.map(s => ({ start: new Date(s.start).toISOString() })) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const [hide, account] = await Promise.all([hidesPoweredBy(db, company.id, company), b.contact_id ? accountLink(db, company, { b: b.manage_token }) : null])
    return NextResponse.json({ booking: { ...publicBooking(b, company, service, settings, hide), account_url: account } }, { headers: { 'Cache-Control': 'no-store' } })
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
        const { s, connectOpts } = await chatStripe(company)
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
        const { data: released } = await db.from('bookings').update({ status: 'expired', hold_expires_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'pending').select('id')
        // The time is free again: offer it to the waitlist.
        if (released?.length) await bookingTimeFreed(db, company.booking_settings, b, origin)
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

    if (body.action === 'arrived') {
      if (b.arrived_at) return NextResponse.json({ ok: true, arrived: true, booking: (await reply().then(r => r.json())).booking })
      const ci = checkInState(b, service)
      if (!ci.open) {
        const tz = b.timezone || settings.timezone
        return NextResponse.json({ error: b.status !== 'confirmed' ? 'This booking isn’t active.' : b.seated_at ? 'You’re already seated. Enjoy!' : Date.now() < ci.opensAt ? `You can tap “I’m here” from ${fmtTime(ci.opensAt, tz)}.` : 'This booking has finished.' }, { status: 400 })
      }
      // Once per booking: a second tap, or a second phone, doesn't alert the team again.
      let first = false
      const { data: claimed, error } = await db.from('bookings').update({ arrived_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'confirmed').is('arrived_at', null).select('id')
      if (error) {
        if (!isMissingColumn(error)) throw error
        const seen = toldTeam.get(b.id)
        first = !seen || Date.now() - seen > 6 * 3600e3
        if (first) { if (toldTeam.size > 2000) toldTeam.clear(); toldTeam.set(b.id, Date.now()) }
      } else first = !!claimed?.length
      if (first) after(() => announceArrival(db, company, service, b, origin).catch(e => console.error('[book/manage] arrival alert', e?.message || e)))
      const fresh = await reply().then(r => r.json())
      return NextResponse.json({ ok: true, arrived: true, booking: fresh.booking })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
