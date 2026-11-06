import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { cancelBooking, manageUrl, systemNote, whenText } from '@/lib/booking'
import { addDays, dateInTz, isDate, dayKeyOf, zonedToUtc } from '@/lib/booking-time'
import { durationFor, periodName } from '@/lib/restaurant/settings'
import { coversTimeline, daySpan } from '@/lib/restaurant/availability'
import {
  restaurantDb, reservationsAccess, resContext, json, setupNeeded, isMissingRestaurantSchema, isUuid, isManager,
  RES_COLS, liveReservations, slotsFor, guestStats, createReservation, moveReservation, clip, cleanPhone, cleanEmail, cleanSeating,
} from '@/lib/restaurant/server'

export const dynamic = 'force-dynamic'

// Table reservations for the team (docs/plans/restaurants.md, Phase 1).
//   GET  ?companyId&op=day&date=YYYY-MM-DD      the day sheet: reservations, covers strip, counts
//   GET  ?companyId&op=range&from&to            reservations between two days (Upcoming / week)
//   GET  ?companyId&op=slots&date&party&exclude times for a party (team view: full ones marked)
//   GET  ?companyId&op=guests&q                 guests with visits, no-shows, last and next visit
//   GET  ?companyId&op=guest&contactId          one guest (Inbox panel, the reservation drawer)
//   POST { companyId, startsAt, party, name, phone?, email?, contactId?, notes?, seating?, occasion?,
//          internalNotes?, notify?, force?, walkIn? }
//   PATCH { companyId, id, action: seat | unseat | complete | no_show | undo | cancel | move | update, ... }

const ACTIVE = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled']

function shape(b: any, company: any, stats?: any) {
  const now = Date.now()
  const start = Date.parse(b.starts_at)
  let state = b.status as string
  if (b.status === 'confirmed') state = b.seated_at ? 'seated' : start < now - 15 * 60_000 ? 'late' : start <= now + 30 * 60_000 ? 'due' : 'booked'
  return {
    id: b.id, startsAt: b.starts_at, endsAt: b.ends_at, party: b.seats || 1, status: b.status, state,
    name: b.customer_name || '', phone: b.customer_phone || '', email: b.customer_email || '',
    notes: b.notes || '', internalNotes: b.internal_notes || '', seating: b.seating_pref || null, occasion: b.occasion || '',
    seatedAt: b.seated_at || null, completedAt: b.completed_at || null, contactId: b.contact_id || null, conversationId: b.conversation_id || null,
    source: b.source, createdAt: b.created_at, cancelledAt: b.cancelled_at || null, cancelReason: b.cancel_reason || null,
    confirmedByGuest: !!b.customer_confirmed_at, manageUrl: company && b.manage_token ? manageUrl(company, b.manage_token) : null,
    guest: stats ? { visits: stats.visits, noShows: stats.noShows, lastVisit: stats.lastVisit } : null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = restaurantDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const r = await resContext(db, companyId!)
    if (!r.ctx) return r.response
    const { company, rs, tz, service } = r.ctx
    const op = sp.get('op') || 'day'
    const today = dateInTz(Date.now(), tz)

    if (op === 'day' || op === 'range') {
      const from = isDate(sp.get(op === 'day' ? 'date' : 'from')) ? sp.get(op === 'day' ? 'date' : 'from')! : today
      let to = op === 'day' ? from : (isDate(sp.get('to')) ? sp.get('to')! : addDays(from, 13))
      if (to < from) to = from
      if (to > addDays(from, 62)) to = addDays(from, 62)
      const [a] = daySpan(from, tz), [, z] = daySpan(to, tz)
      const { data, error } = await db.from('bookings').select(RES_COLS)
        .eq('company_id', companyId!).eq('service_id', service.id).in('status', ACTIVE)
        .gte('starts_at', new Date(a).toISOString()).lt('starts_at', new Date(z).toISOString())
        .order('starts_at').limit(3000)
      if (error) { if (isMissingRestaurantSchema(error)) return setupNeeded(); throw error }
      const nowIso = new Date().toISOString()
      const rows = (data || []).filter((b: any) => b.status !== 'pending' || (b.hold_expires_at && b.hold_expires_at > nowIso))
      const stats = await guestStats(db, companyId!, service.id, rows.map((b: any) => b.contact_id).filter(Boolean))
      const list = rows.map((b: any) => shape(b, company, b.contact_id ? stats.get(b.contact_id) : null))
      const live = rows.filter((b: any) => b.status === 'confirmed' || b.status === 'pending')
      const counts = {
        reservations: live.length + rows.filter((b: any) => b.status === 'completed').length,
        covers: [...live, ...rows.filter((b: any) => b.status === 'completed')].reduce((n: number, b: any) => n + (b.seats || 1), 0),
        seated: list.filter(x => x.state === 'seated').reduce((n, x) => n + x.party, 0),
        toCome: list.filter(x => x.state === 'booked' || x.state === 'due' || x.state === 'late').reduce((n, x) => n + x.party, 0),
        noShows: rows.filter((b: any) => b.status === 'no_show').length,
        cancelled: rows.filter((b: any) => b.status === 'cancelled').length,
      }
      const out: any = { from, to, today, timezone: tz, reservations: list, counts, maxCovers: rs.max_covers, interval: rs.interval_mins }
      if (op === 'day') {
        const windows = rs.hours[dayKeyOf(from)] || []
        out.periods = windows.map(w => ({ name: periodName(w.start), start: w.start, end: w.end }))
        out.closed = rs.closed.find(c => c.date === from) || null
        // Guests seated through each service, from its first seating until the
        // longest dining time after its last.
        const liveRes = live.map((b: any) => ({ id: b.id, starts: Date.parse(b.starts_at), ends: Date.parse(b.ends_at), seats: b.seats || 1 }))
        const longest = Math.max(rs.duration_mins, ...rs.durations.map(d => d.mins))
        out.strips = windows.map(w => ({
          name: periodName(w.start),
          points: coversTimeline(liveRes, zonedToUtc(from, w.start, tz), zonedToUtc(from, w.end, tz) + longest * 60_000, rs.interval_mins),
        }))
      } else {
        const byDay: Record<string, { reservations: number; covers: number }> = {}
        for (const b of live) {
          const d = dateInTz(Date.parse(b.starts_at), tz)
          const x = byDay[d] || { reservations: 0, covers: 0 }
          x.reservations++; x.covers += b.seats || 1
          byDay[d] = x
        }
        out.byDay = byDay
      }
      out.canManage = isManager(access.role)
      return json(out)
    }

    if (op === 'slots') {
      const date = isDate(sp.get('date')) ? sp.get('date')! : today
      const party = Math.max(1, Math.min(500, Math.round(Number(sp.get('party')) || 2)))
      const exclude = isUuid(sp.get('exclude')) ? sp.get('exclude') : null
      const slots = await slotsFor(db, r.ctx, date, party, { excludeId: exclude, team: true })
      return json({
        date, timezone: tz, party, duration: durationFor(rs, party), maxCovers: rs.max_covers,
        slots: slots.map(s => ({ start: new Date(s.start).toISOString(), period: s.period, ok: s.ok, reason: s.reason || null, coversLeft: Number.isFinite(s.coversLeft) ? s.coversLeft : null })),
      })
    }

    if (op === 'guests') {
      const term = clip(sp.get('q'), 80).toLowerCase()
      const { data, error } = await db.from('bookings').select('contact_id, customer_name, customer_phone, customer_email, starts_at')
        .eq('company_id', companyId!).eq('service_id', service.id).not('contact_id', 'is', null)
        .order('starts_at', { ascending: false }).limit(4000)
      if (error) throw error
      const seen = new Map<string, any>()
      for (const b of data || []) if (!seen.has(b.contact_id)) seen.set(b.contact_id, b)
      let ids = [...seen.keys()]
      const { data: contacts } = ids.length ? await db.from('contacts').select('id, name, phone, email, guest_profile, birthday, tags').eq('company_id', companyId!).in('id', ids.slice(0, 1000)) : { data: [] }
      const byId = new Map((contacts || []).map((c: any) => [c.id, c]))
      if (term) ids = ids.filter(id => {
        const c: any = byId.get(id) || {}, b = seen.get(id)
        return [c.name, c.phone, c.email, b.customer_name, b.customer_phone, b.customer_email].some((v: any) => String(v || '').toLowerCase().includes(term))
      })
      ids = ids.slice(0, 300)
      const stats = await guestStats(db, companyId!, service.id, ids)
      const guests = ids.map(id => {
        const c: any = byId.get(id) || {}, b = seen.get(id), st = stats.get(id) || { visits: 0, noShows: 0, cancelled: 0, covers: 0, lastVisit: null, nextVisit: null, upcoming: 0 }
        return { id, name: c.name || b.customer_name || 'Guest', phone: c.phone || b.customer_phone || '', email: c.email || b.customer_email || '', vip: !!c.guest_profile?.vip, allergies: c.guest_profile?.allergies || '', birthday: c.birthday || null, ...st }
      })
      return json({ guests })
    }

    if (op === 'guest') {
      const contactId = sp.get('contactId')
      if (!isUuid(contactId)) return json({ error: 'Guest not found.' }, 404)
      const [{ data: c }, stats, { data: recent }] = await Promise.all([
        db.from('contacts').select('id, name, phone, email, guest_profile, birthday').eq('company_id', companyId!).eq('id', contactId!).maybeSingle(),
        guestStats(db, companyId!, service.id, [contactId!]),
        db.from('bookings').select(RES_COLS).eq('company_id', companyId!).eq('service_id', service.id).eq('contact_id', contactId!).order('starts_at', { ascending: false }).limit(12),
      ])
      if (!c) return json({ error: 'Guest not found.' }, 404)
      return json({
        guest: { id: c.id, name: c.name, phone: c.phone, email: c.email, profile: c.guest_profile || {}, birthday: c.birthday || null },
        stats: stats.get(contactId!) || { visits: 0, noShows: 0, cancelled: 0, covers: 0, lastVisit: null, nextVisit: null, upcoming: 0 },
        reservations: (recent || []).map((b: any) => shape(b, company)),
        timezone: tz,
      })
    }

    return json({ error: 'Unknown request.' }, 400)
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not load reservations.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const r = await resContext(db, companyId)
    if (!r.ctx) return r.response
    const walkIn = body.walkIn === true
    const startMs = walkIn ? Date.now() : Date.parse(String(body.startsAt || ''))
    if (!Number.isFinite(startMs)) return json({ error: 'Pick a time.' }, 400)
    const res = await createReservation(db, r.ctx, {
      startMs, party: Number(body.party), name: body.name || (walkIn ? 'Walk-in' : ''), phone: body.phone, email: body.email,
      contactId: body.contactId, notes: body.notes, seating: body.seating, occasion: body.occasion, internalNotes: body.internalNotes,
      source: walkIn ? 'walk_in' : body.source === 'manual' ? 'manual' : 'phone', byTeam: true, force: body.force === true,
      notify: !walkIn && body.notify !== false, seatNow: walkIn, origin: req.nextUrl.origin,
    })
    if (!res.ok) return json({ error: res.error, full: !!res.full, reason: res.reason || null }, res.status || 400)
    await audit(req, db, companyId, 'reservation_created', `${res.booking.service_name} for ${res.booking.customer_name} — ${whenText(res.booking)}${body.force ? ' (over the covers limit)' : ''}`, { booking_id: res.booking.id, party: res.booking.seats, walk_in: walkIn })
    return json({ reservation: shape(res.booking, r.ctx.company) })
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not make the reservation.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(body.id)) return json({ error: 'Reservation not found.' }, 404)
    const r = await resContext(db, companyId)
    if (!r.ctx) return r.response
    const { company, service } = r.ctx
    const { data: b, error } = await db.from('bookings').select('*').eq('company_id', companyId).eq('id', body.id).eq('service_id', service.id).maybeSingle()
    if (error) { if (isMissingRestaurantSchema(error)) return setupNeeded(); throw error }
    if (!b) return json({ error: 'Reservation not found.' }, 404)
    const origin = req.nextUrl.origin
    const now = new Date().toISOString()
    const reply = async (note?: string) => {
      const { data: fresh } = await db.from('bookings').select(RES_COLS).eq('id', b.id).maybeSingle()
      if (note) await systemNote(db, { ...b, ...(fresh || {}) }, note)
      return json({ reservation: shape(fresh || b, company) })
    }
    const claim = async (patch: any, from: string[]) => {
      const { data } = await db.from('bookings').update({ ...patch, updated_at: now }).eq('id', b.id).eq('company_id', companyId).in('status', from).select('id')
      return !!data?.length
    }
    const calendar = async (status: string) => { if (b.calendar_event_id) { try { await db.from('calendar_events').update({ status }).eq('id', b.calendar_event_id) } catch {} } }
    const who = access.name || 'The team'

    switch (String(body.action)) {
      case 'seat':
        if (!(await claim({ seated_at: now }, ['confirmed']))) return json({ error: 'Only a booked table can be seated.' }, 409)
        return reply(`🍽️ ${b.service_name} seated by ${who}`)
      case 'unseat':
        if (!(await claim({ seated_at: null }, ['confirmed']))) return json({ error: 'That table isn’t seated.' }, 409)
        return reply()
      case 'complete':
        if (!(await claim({ status: 'completed', completed_at: now, seated_at: b.seated_at || now }, ['confirmed']))) return json({ error: 'Only a booked or seated table can be finished.' }, 409)
        await calendar('completed')
        return reply(`✅ ${b.service_name} finished`)
      case 'no_show':
        if (!(await claim({ status: 'no_show', seated_at: null }, ['confirmed']))) return json({ error: 'Only a booked table can be marked as a no-show.' }, 409)
        await calendar('missed')
        await audit(req, db, companyId, 'reservation_updated', `${b.service_name} for ${b.customer_name} marked as a no-show — ${whenText(b)}`, { booking_id: b.id })
        return reply(`🚫 No-show: ${b.service_name} — ${whenText(b)}`)
      case 'undo':
        // Back to booked (a mistaken no-show or finish), only on the day.
        if (Date.parse(b.starts_at) < Date.now() - 24 * 3600e3) return json({ error: 'Too long ago to change.' }, 409)
        if (!(await claim({ status: 'confirmed', completed_at: null }, ['completed', 'no_show']))) return json({ error: 'Nothing to undo.' }, 409)
        await calendar('confirmed')
        return reply()
      case 'cancel': {
        const c = await cancelBooking(db, b.id, { by: 'business', reason: clip(body.reason, 500) || null, refund: false, notifyCustomer: body.notify !== false, origin })
        if (!c.ok) return json({ error: c.error }, 409)
        await audit(req, db, companyId, 'reservation_cancelled', `${b.service_name} for ${b.customer_name} cancelled — ${whenText(b)}`, { booking_id: b.id })
        return reply()
      }
      case 'move': {
        const startMs = body.startsAt ? Date.parse(String(body.startsAt)) : Date.parse(b.starts_at)
        if (!Number.isFinite(startMs)) return json({ error: 'Pick a time.' }, 400)
        const m = await moveReservation(db, b, { startMs, party: body.party != null ? Number(body.party) : b.seats, by: 'business', force: body.force === true, notify: body.notify !== false, origin })
        if (!m.ok) return json({ error: m.error, full: !!m.full }, m.status || 400)
        await audit(req, db, companyId, 'reservation_updated', `${m.booking.service_name} for ${b.customer_name} moved to ${whenText(m.booking)}`, { booking_id: b.id })
        return reply()
      }
      case 'update': {
        const patch: any = {}
        if (body.notes !== undefined) patch.notes = clip(body.notes, 1000) || null
        if (body.internalNotes !== undefined) patch.internal_notes = clip(body.internalNotes, 1000) || null
        if (body.seating !== undefined) patch.seating_pref = cleanSeating(body.seating)
        if (body.occasion !== undefined) patch.occasion = clip(body.occasion, 80) || null
        if (body.name !== undefined) { const n = clip(body.name, 120); if (!n) return json({ error: 'Add the guest’s name.' }, 400); patch.customer_name = n }
        if (body.phone !== undefined) patch.customer_phone = cleanPhone(body.phone) || null
        if (body.email !== undefined) patch.customer_email = cleanEmail(body.email) || null
        if (Object.keys(patch).length) await db.from('bookings').update({ ...patch, updated_at: now }).eq('id', b.id).eq('company_id', companyId)
        // The guest's profile lives on their contact (it follows them to every visit).
        if (b.contact_id && (body.profile !== undefined || body.birthday !== undefined)) {
          const cp: any = {}
          if (body.profile && typeof body.profile === 'object') {
            cp.guest_profile = { vip: body.profile.vip === true, allergies: clip(body.profile.allergies, 300), notes: clip(body.profile.notes, 1000), seating_pref: cleanSeating(body.profile.seating_pref) }
          }
          if (body.birthday !== undefined) cp.birthday = isDate(body.birthday) ? body.birthday : null
          if (Object.keys(cp).length) await db.from('contacts').update(cp).eq('id', b.contact_id).eq('company_id', companyId)
        }
        return reply()
      }
      default:
        return json({ error: 'Unknown action.' }, 400)
    }
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'That didn’t work. Please try again.' }, 500)
  }
}
