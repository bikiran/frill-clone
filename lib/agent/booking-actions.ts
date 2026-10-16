// Reception Agent actions (Phase 8): bookings, the way a good receptionist
// handles them.
//
//   list_services / check_availability — what can be booked and when (reads).
//   find_my_bookings — ONLY the person in the conversation's own bookings
//     (contact, phone or email match; an unknown texter must give the email or
//     phone they booked with). Each comes with its self-serve manage link.
//   booking_link — a link to book themselves (pre-filled for this customer).
//   reschedule_booking / cancel_booking — never on its own: always prepared
//     for a person to approve (platform ceiling: prepare). Approving runs the
//     same code as the booking page, so the customer gets the usual message,
//     the calendar updates and the cancellation policy (refunds) applies.

import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, loadLocations, availability, policyFor, manageUrl, bookingPageUrl, createInvite,
  cancelBooking, rescheduleBooking,
} from '@/lib/booking'
import { addDays, dateInTz, fmtDateTime, zonedParts } from '@/lib/booking-time'
import { ilikeExact } from '@/lib/phone'
import type { ActionContext, ActionDef, JsonSchema } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const tail9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)
const lc = (s: any) => String(s || '').trim().toLowerCase()
const money = (cents: number, cur = 'aud') => `${(Number(cents || 0) / 100).toFixed(2)} ${String(cur || 'aud').toUpperCase()}`

async function bookingCtx(ctx: ActionContext) {
  if (ctx.scratch.booking) return ctx.scratch.booking
  const company = await loadCompanyPublic(ctx.db, { id: ctx.companyId })
  if (!company) return null
  const settings = resolveBookingSettings(company.booking_settings)
  return (ctx.scratch.booking = { company, settings })
}

async function findService(ctx: ActionContext, name: string) {
  const q = String(name || '').trim()
  const { data } = await ctx.db.from('booking_services').select('*').eq('company_id', ctx.companyId).eq('active', true).limit(50)
  const all = data || []
  if (!q) return all.length === 1 ? all[0] : null
  return all.find((s: any) => lc(s.name) === lc(q)) || all.find((s: any) => lc(s.name).includes(lc(q)) || lc(q).includes(lc(s.name))) || null
}

export const listServices: ActionDef = {
  key: 'list_services',
  description: 'What customers can book: each service with how long it takes, the price and any deposit.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx) {
    const bc = await bookingCtx(ctx)
    if (!bc || bc.settings.enabled === false) return { ok: true, data: { services: [], note: 'Online booking isn’t switched on for this business.' } }
    const { data } = await ctx.db.from('booking_services').select('name, description, kind, duration_mins, price_cents, payment_mode, deposit_cents, currency, capacity').eq('company_id', ctx.companyId).eq('active', true).limit(50)
    const services = (data || []).map((s: any) => ({
      name: s.name, about: s.description ? String(s.description).slice(0, 300) : null, minutes: s.duration_mins,
      price: s.price_cents ? money(s.price_cents, s.currency) : 'free', payUpfront: s.payment_mode === 'full' ? 'full price' : s.payment_mode === 'deposit' ? `deposit ${money(s.deposit_cents, s.currency)}` : 'nothing',
      group: (s.capacity || 1) > 1,
    }))
    return { ok: true, data: { services }, summary: `${services.length} service${services.length === 1 ? '' : 's'}` }
  },
}

export const checkAvailability: ActionDef = {
  key: 'check_availability',
  description: 'Free times for a service, in the business’s local time. Give the service name; optionally a date (YYYY-MM-DD) and how many days to look (1–7). If nothing is free it looks further ahead. To move one of the customer’s bookings, pass its bookingId (from find_my_bookings): the times then suit that booking — the same person if they chose one, the same outlet — and its current time counts as free. If they want a particular time of day, pass near (HH:MM, 24-hour): the closest free times come first and nearest is the single closest one.',
  input: obj({
    service: { type: 'string', description: 'The service name (from list_services).' },
    date: { type: 'string', description: 'First day to look, YYYY-MM-DD. Default: today.' },
    days: { type: 'integer', description: 'How many days to look (1–7). Default 3.' },
    bookingId: { type: 'string', description: 'Only when moving one of the customer’s bookings: its bookingId from find_my_bookings.' },
    near: { type: 'string', description: 'Optional preferred time of day, HH:MM in 24-hour time, e.g. 15:00.' },
    location: { type: 'string', description: 'Optional outlet name, if the customer asked for one.' },
  }, ['service']),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const bc = await bookingCtx(ctx)
    if (!bc) return { ok: false, error: 'Business not found.' }
    // Moving a booking: only one this customer was shown to own.
    let moving: any = null
    if (args?.bookingId) {
      if (!proven(ctx).has(String(args.bookingId))) return { ok: true, data: { slots: [], note: 'That booking isn’t linked to this customer. Use find_my_bookings first.' } }
      const { data } = await ctx.db.from('bookings').select('id, service_id, staff_id, staff_choice, location_id, starts_at').eq('company_id', ctx.companyId).eq('id', String(args.bookingId)).maybeSingle()
      moving = data || null
    }
    let service: any = null
    if (moving?.service_id) {
      const { data } = await ctx.db.from('booking_services').select('*').eq('company_id', ctx.companyId).eq('id', moving.service_id).maybeSingle()
      service = data || null
    }
    if (!service) service = await findService(ctx, args?.service)
    if (!service) return { ok: true, data: { slots: [], note: 'No service by that name. Use list_services.' } }
    const tz = bc.settings.timezone
    const today = dateInTz(Date.now(), tz)
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args?.date || '')) && String(args.date) >= today ? String(args.date) : today
    const days = Math.min(7, Math.max(1, Number(args?.days) || 3))
    const staff = await loadStaff(ctx.db, bc.company)
    let locationId: string | null = moving?.location_id || null
    if (!locationId && args?.location && service.location_mode === 'outlet') {
      const locs = await loadLocations(ctx.db, ctx.companyId)
      const q = lc(args.location)
      locationId = (locs.find((l: any) => lc(l.label) === q) || locs.find((l: any) => lc(l.label).includes(q) || lc(l.address).includes(q)))?.id || null
    }
    const opts = {
      company: bc.company, settings: bc.settings, service, staff, locationId,
      staffFilter: (moving?.staff_choice === 'specific' && moving.staff_id ? moving.staff_id : 'any') as string,
      excludeBookingId: moving?.id || null,
    }
    let { slots } = await availability(ctx.db, { ...opts, fromDate: from, toDate: addDays(from, days - 1) })
    let widened = false
    if (!slots.length) {
      ;({ slots } = await availability(ctx.db, { ...opts, fromDate: addDays(from, days), toDate: addDays(from, days + 13) }))
      widened = true
    }
    // A preferred time of day: closest first within each day, plus the single
    // nearest free time to offer straight away.
    const near = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(args?.near || '').trim())
    const wantMin = near ? Number(near[1]) * 60 + Number(near[2]) : null
    const minsOf = (ms: number) => { const z = zonedParts(ms, tz); return z.h * 60 + z.mi }
    const gap = (ms: number) => wantMin == null ? 0 : Math.abs(minsOf(ms) - wantMin)
    const ordered = wantMin == null ? slots : [...slots].sort((a, b) => dateInTz(a.start, tz).localeCompare(dateInTz(b.start, tz)) || gap(a.start) - gap(b.start) || a.start - b.start)
    const byDay: Record<string, string[]> = {}
    for (const s of ordered.slice(0, 120)) {
      const txt = fmtDateTime(s.start, tz)                      // "Sat, 18 Oct, 10:00am" (or "Sat 18 Oct, 10:00am")
      const cut = txt.lastIndexOf(', ')
      const day = txt.slice(0, cut).replace(/,/g, ''), time = txt.slice(cut + 2)
      if ((byDay[day] ||= []).length < 8) byDay[day].push(time)
    }
    // The nearest: soonest day first, then closest to the time asked for.
    const nearest = wantMin != null && slots.length ? [...slots].sort((a, b) => gap(a.start) - gap(b.start) || a.start - b.start).find(s => gap(s.start) <= 90) || ordered[0] : null
    ctx.scratch.slots = slots.slice(0, 200).map(s => s.start)
    return {
      ok: true,
      data: {
        service: service.name, minutes: service.duration_mins, timezone: tz,
        ...(moving ? { moving: { bookingId: moving.id, now: fmtDateTime(Date.parse(moving.starts_at), tz) } } : {}),
        free: Object.entries(byDay).slice(0, 7).map(([day, times]) => ({ day, times })),
        ...(nearest ? { nearest: { when: fmtDateTime(nearest.start, tz), start: new Date(nearest.start).toISOString() } } : {}),
        ...(widened ? { note: slots.length ? 'Nothing in the days asked about — these are the next free times.' : 'Nothing free in the next three weeks.' } : {}),
        slotIds: ordered.slice(0, 40).map(s => ({ when: fmtDateTime(s.start, tz), start: new Date(s.start).toISOString() })),
      },
      summary: `${slots.length} free time${slots.length === 1 ? '' : 's'} for ${service.name}`,
    }
  },
}

function proven(ctx: ActionContext): Set<string> { return (ctx.scratch.provenBookings ||= new Set<string>()) }

export const findMyBookings: ActionDef = {
  key: 'find_my_bookings',
  description: 'The customer’s own upcoming bookings, with whether they can still move or cancel them and their manage link. If the customer isn’t identified, pass the email or phone they booked with.',
  input: obj({
    email: { type: 'string', description: 'Only if the customer isn’t identified.' },
    phone: { type: 'string', description: 'Only if the customer isn’t identified.' },
  }),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const bc = await bookingCtx(ctx)
    if (!bc) return { ok: false, error: 'Business not found.' }
    let contact: any = null
    if (ctx.contactId && ctx.customerVerification !== 'unknown') {
      const { data } = await ctx.db.from('contacts').select('id, email, phone').eq('company_id', ctx.companyId).eq('id', ctx.contactId).maybeSingle()
      contact = data
    }
    const email = lc(contact?.email || args?.email), phone = tail9(contact?.phone || args?.phone)
    if (!contact && !email && phone.length < 8) return { ok: true, data: { bookings: [], needs: 'Ask for the email or phone number they booked with.' } }
    // Look for THIS customer's bookings (by contact, email and phone), not the
    // next few dozen of the whole business — a busy shop's next 40 bookings
    // can easily all be other people's, and theirs would never be found.
    const cols = 'id, service_name, starts_at, status, payment_status, location_label, address, staff_name, contact_id, customer_email, customer_phone, manage_token, timezone'
    const base = () => ctx.db.from('bookings').select(cols)
      .eq('company_id', ctx.companyId).in('status', ['confirmed', 'pending']).gte('starts_at', new Date(Date.now() - 3600_000).toISOString())
      .order('starts_at', { ascending: true }).limit(20)
    const reads: PromiseLike<any>[] = []
    if (contact) reads.push(base().eq('contact_id', contact.id))
    if (email) reads.push(base().ilike('customer_email', ilikeExact(email)))
    // However the number was typed ("0412 345 678", "+61412345678"): its last
    // eight digits in order, then an exact check below.
    if (phone.length >= 8) reads.push(base().ilike('customer_phone', `%${phone.slice(-8).split('').join('%')}%`))
    const found = new Map<string, any>()
    for (const r of await Promise.all(reads)) for (const b of r?.data || []) found.set(b.id, b)
    const mine = [...found.values()]
      .filter((b: any) => (contact && b.contact_id === contact.id) || (email && lc(b.customer_email) === email) || (phone.length >= 8 && tail9(b.customer_phone) === phone))
      .sort((x: any, y: any) => Date.parse(x.starts_at) - Date.parse(y.starts_at)).slice(0, 5)
    mine.forEach((b: any) => proven(ctx).add(b.id))
    if (!mine.length) return { ok: true, data: { bookings: [], note: contact ? 'No upcoming bookings for this customer.' : 'No upcoming bookings match those details.' } }
    return {
      ok: true,
      data: {
        bookings: mine.map((b: any) => {
          const p = policyFor(b, bc.settings)
          return {
            bookingId: b.id, service: b.service_name, when: fmtDateTime(Date.parse(b.starts_at), b.timezone || bc.settings.timezone), status: b.status,
            where: b.location_label || b.address || null, with: b.staff_name || null,
            canMove: p.canReschedule, canCancel: p.canCancel, refundIfCancelled: p.refundOnCancel,
            changeBy: p.cutoffMs ? fmtDateTime(p.cutoffMs, bc.settings.timezone) : null,
            manageLink: b.manage_token ? manageUrl(bc.company, b.manage_token) : null,
          }
        }),
        guidance: 'The manage link lets them move or cancel it themselves straight away — offer that first. Only use reschedule_booking / cancel_booking if they ask you to do it; a person approves those.',
      },
      summary: `${mine.length} upcoming booking${mine.length === 1 ? '' : 's'}`,
    }
  },
}

export const bookingLink: ActionDef = {
  key: 'booking_link',
  description: 'A link for the customer to book online themselves, optionally straight to one service. Their details are pre-filled.',
  input: obj({ service: { type: 'string', description: 'Optional service name.' } }),
  category: 'internal_write', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const bc = await bookingCtx(ctx)
    if (!bc || bc.settings.enabled === false) return { ok: false, error: 'Online booking isn’t switched on for this business.' }
    const service = args?.service ? await findService(ctx, args.service) : null
    try {
      const inv = await createInvite(ctx.db, { companyId: ctx.companyId, contactId: ctx.contactId, conversationId: ctx.conversationId, serviceId: service?.id || null })
      const url = `${bookingPageUrl(bc.company, service?.slug)}?i=${inv.token}`
      return { ok: true, data: { link: url, service: service?.name || null }, summary: `Booking link${service ? ` for ${service.name}` : ''}` }
    } catch (e: any) { return { ok: false, error: /booking_invites/.test(String(e?.message)) ? 'Online booking isn’t set up yet.' : e?.message || 'Couldn’t make the link.' } }
  },
}

async function provenBooking(ctx: ActionContext, id: string) {
  if (!proven(ctx).has(id)) return null
  const { data } = await ctx.db.from('bookings').select('id, service_name, starts_at, status, timezone, payment_status').eq('company_id', ctx.companyId).eq('id', id).maybeSingle()
  return data || null
}

export const rescheduleBookingAction: ActionDef = {
  key: 'reschedule_booking',
  description: 'Ask the team to move one of the customer’s bookings to a new free time (a start from check_availability called with this bookingId). A person approves it; tell the customer you’ve asked the team.',
  input: obj({ bookingId: { type: 'string' }, newStart: { type: 'string', description: 'ISO start time from check_availability.' } }, ['bookingId', 'newStart']),
  category: 'external_write', risk: 'high', maxAutonomy: 'prepare', customerSafe: true,
  async validate(ctx, args) {
    if (!(await provenBooking(ctx, String(args?.bookingId || '')))) return 'That booking isn’t linked to this customer. Use find_my_bookings first.'
    const start = Date.parse(String(args?.newStart || ''))
    if (!Number.isFinite(start)) return 'Give newStart as a start time from check_availability.'
    if (!(ctx.scratch.slots || []).includes(start)) return 'That time isn’t one check_availability returned as free. Check availability for that day first.'
    return null
  },
  async describe(ctx, args) {
    const b = await provenBooking(ctx, String(args?.bookingId || ''))
    const bc = await bookingCtx(ctx)
    const tz = b?.timezone || bc?.settings.timezone || 'Australia/Melbourne'
    return b ? `Move ${b.service_name} from ${fmtDateTime(Date.parse(b.starts_at), tz)} to ${fmtDateTime(Date.parse(args.newStart), tz)}` : 'Move a booking'
  },
  async run(ctx, args) {
    const b = await provenBooking(ctx, String(args?.bookingId || ''))
    if (!b) return { ok: false, error: 'That booking isn’t linked to this customer. Use find_my_bookings.' }
    const start = Date.parse(String(args?.newStart || ''))
    if (!Number.isFinite(start)) return { ok: false, error: 'Give a start time from check_availability.' }
    const r = await rescheduleBooking(ctx.db, b.id, { startMs: start, by: 'business', notifyCustomer: true, origin: ctx.siteOrigin })
    return r.ok ? { ok: true, data: { moved: true }, entityType: 'booking', entityId: b.id, summary: `Moved ${b.service_name}` } : { ok: false, error: r.error || 'Couldn’t move it.' }
  },
}

export const cancelBookingAction: ActionDef = {
  key: 'cancel_booking',
  description: 'Ask the team to cancel one of the customer’s bookings, at their request. A person approves it; the cancellation policy (refunds) applies.',
  input: obj({ bookingId: { type: 'string' }, why: { type: 'string', description: 'What the customer said.' } }, ['bookingId']),
  category: 'external_write', risk: 'high', maxAutonomy: 'prepare', customerSafe: true,
  async validate(ctx, args) {
    return (await provenBooking(ctx, String(args?.bookingId || ''))) ? null : 'That booking isn’t linked to this customer. Use find_my_bookings first.'
  },
  async describe(ctx, args) {
    const b = await provenBooking(ctx, String(args?.bookingId || ''))
    const bc = await bookingCtx(ctx)
    return b ? `Cancel ${b.service_name} on ${fmtDateTime(Date.parse(b.starts_at), b.timezone || bc?.settings.timezone || 'Australia/Melbourne')}${b.payment_status === 'paid' ? ' (paid — refund follows your policy)' : ''}` : 'Cancel a booking'
  },
  async run(ctx, args) {
    const b = await provenBooking(ctx, String(args?.bookingId || ''))
    if (!b) return { ok: false, error: 'That booking isn’t linked to this customer. Use find_my_bookings.' }
    const bc = await bookingCtx(ctx)
    const p = bc ? policyFor(b, bc.settings) : null
    const r = await cancelBooking(ctx.db, b.id, { by: 'customer', reason: String(args?.why || '').slice(0, 300) || 'Asked over chat', refund: !!p?.refundOnCancel, notifyCustomer: true, origin: ctx.siteOrigin })
    return r.ok ? { ok: true, data: { cancelled: true, refunded: r.refunded || 0 }, entityType: 'booking', entityId: b.id, summary: `Cancelled ${b.service_name}` } : { ok: false, error: r.error || 'Couldn’t cancel it.' }
  },
}

/**
 * For approvals: a person approved moving or cancelling a booking. The agent
 * proved the booking was this customer's before asking (validate); here we
 * check it's still this business's and still active, then run the same code
 * as the booking page.
 */
export async function runApprovedBookingAction(db: any, companyId: string, actionKey: string, args: any, origin: string): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const { data: b } = await db.from('bookings').select('id, company_id, service_name, starts_at, status, payment_status, timezone').eq('company_id', companyId).eq('id', String(args?.bookingId || '')).maybeSingle()
  if (!b) return { ok: false, error: 'That booking no longer exists.' }
  if (!['confirmed', 'pending'].includes(b.status)) return { ok: false, error: `That booking is already ${b.status}.` }
  if (actionKey === 'reschedule_booking') {
    const start = Date.parse(String(args?.newStart || ''))
    if (!Number.isFinite(start)) return { ok: false, error: 'No new time to move it to.' }
    const r = await rescheduleBooking(db, b.id, { startMs: start, by: 'business', notifyCustomer: true, origin })
    return r.ok ? { ok: true, detail: 'moved' } : { ok: false, error: r.error || 'That time isn’t free any more — ask the customer for another.' }
  }
  if (actionKey === 'cancel_booking') {
    const company = await loadCompanyPublic(db, { id: companyId })
    const p = company ? policyFor(b, resolveBookingSettings(company.booking_settings)) : null
    const r = await cancelBooking(db, b.id, { by: 'customer', reason: String(args?.why || '').slice(0, 300) || 'Asked over chat', refund: !!p?.refundOnCancel, notifyCustomer: true, origin })
    return r.ok ? { ok: true, detail: r.refunded ? `cancelled, ${money(r.refunded)} refunded` : 'cancelled' } : { ok: false, error: r.error || 'Couldn’t cancel it.' }
  }
  return { ok: false, error: 'Not a booking action.' }
}
