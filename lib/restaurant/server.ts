// Server side of table reservations (docs/plans/restaurants.md, Phase 1).
// A reservation is a booking on the restaurant's 'reservation' service:
// claim_reservation() (V429) takes the seats atomically, then the normal
// booking confirm (lib/booking.ts) links the guest, adds the Calendar entry and
// sends the confirmation, and the booking sweep sends reminders and wraps up.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { bearerToken, verifyToken, SUPER_ADMIN } from '@/lib/company-access'
import {
  PUBLIC_COMPANY_COLS, resolveBookingSettings, confirmBooking, customerMessage, systemNote, whenText,
  bookingEvent, type BookingSettings,
} from '@/lib/booking'
import { dateInTz } from '@/lib/booking-time'
import { notifyCompany } from '@/lib/notify'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { resolveRestaurantSettings, durationFor, reservationName, SEATING_OPTIONS, type RestaurantSettings } from '@/lib/restaurant/settings'
import { reservationSlots, onGrid, fits, type LiveRes } from '@/lib/restaurant/availability'
import { checkReservationsAccess } from '@/lib/restaurant/access-core'
import { isJobsManager } from '@/lib/jobs/server'

const MIN = 60_000

export const restaurantDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export const RESTAURANT_HINT = 'Table reservations need one database update: run migrations/COLVY_V429_RESTAURANT_RESERVATIONS.sql in the Supabase SQL editor.'
export const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export const setupNeeded = () => json({ setupNeeded: true, error: RESTAURANT_HINT }, 503)

/** V429 not run yet (a column or the claim function is missing). */
export function isMissingRestaurantSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''}`
  return /42P01|42703|42883|PGRST202|PGRST204|PGRST205|does not exist|could not find the|schema cache/i.test(m)
    && /restaurant_settings|claim_reservation|seated_at|seating_pref|occasion|internal_notes|guest_profile|birthday|modules/i.test(m)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: any) => typeof v === 'string' && UUID.test(v)

// ── Access ──────────────────────────────────────────────────────────────────

export type ResCaller = { ok: boolean; userId?: string; name?: string; role?: string; response?: NextResponse }

const ACCESS_TTL_MS = 20_000
const granted = new Map<string, { caller: ResCaller; at: number }>()

/** Signed in, and staff of THIS workspace with the reservations permission. */
export async function reservationsAccess(req: Request, db: any, companyId: any): Promise<ResCaller> {
  const deny = (status: number, error: string): ResCaller => ({ ok: false, response: json({ error }, status) })
  if (!isUuid(companyId)) return deny(400, 'A workspace is needed.')
  const token = bearerToken(req as any)
  if (!token) return deny(401, 'Please sign in again.')
  const ck = `${token}:${companyId}`
  const hit = granted.get(ck)
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.caller
  const user = await verifyToken(db, token).catch(() => null)
  if (!user) return deny(401, 'Please sign in again.')
  const email = String(user.email || '')
  const fallback = String(user.user_metadata?.display_name || user.user_metadata?.full_name || email.split('@')[0] || 'Team')
  let caller: ResCaller
  if (email.toLowerCase() === SUPER_ADMIN) caller = { ok: true, userId: user.id, name: fallback, role: 'owner' }
  else {
    try {
      const [own, team] = await Promise.all([
        db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle(),
        db.from('team_members').select('*').eq('company_id', companyId).eq('user_id', user.id).limit(5),
      ])
      if (own?.error && team?.error) return deny(503, 'Colvy couldn’t check your access just now. Please try again.')
      const rows = team?.data || []
      const d = checkReservationsAccess({ isOwner: !!own?.data, rows })
      if (!d.ok) return deny(403, d.reason === 'no_permission' ? 'You don’t have access to Reservations. Ask the owner to switch it on for you in Team.' : 'Not authorized for this workspace.')
      const row = rows.find((r: any) => r?.name || r?.display_name) || {}
      caller = { ok: true, userId: user.id, name: String(row.name || row.display_name || fallback).slice(0, 80), role: d.role }
    } catch {
      return deny(503, 'Colvy couldn’t check your access just now. Please try again.')
    }
  }
  if (granted.size > 500) granted.clear()
  granted.set(ck, { caller, at: Date.now() })
  return caller
}

export const isManager = (role?: string) => isJobsManager(String(role || ''))

// ── The restaurant and its reservation service ──────────────────────────────

const COMPANY_COLS = `${PUBLIC_COMPANY_COLS}, industry, modules, restaurant_settings`

export async function loadRestaurant(db: any, companyId: string): Promise<{ company: any; error?: any }> {
  const { data, error } = await db.from('companies').select(COMPANY_COLS).eq('id', companyId).maybeSingle()
  return { company: data || null, error }
}

export type ResCtx = { company: any; rs: RestaurantSettings; bs: BookingSettings; tz: string; service: any }

export function settingsOf(company: any) {
  const bs = resolveBookingSettings(company?.booking_settings)
  return { rs: resolveRestaurantSettings(company?.restaurant_settings), bs, tz: bs.timezone }
}

/**
 * The restaurant's one 'reservation' booking service, made the first time and
 * kept in step with the settings (the Calendar and messages read it). It never
 * shows on the appointment booking page or in Services.
 */
export async function ensureReservationService(db: any, company: any, rs: RestaurantSettings): Promise<any> {
  const want = { duration_mins: rs.duration_mins, slot_interval: rs.interval_mins, min_notice_mins: rs.min_notice_mins, max_days_ahead: rs.max_days_ahead }
  const { data: rows, error } = await db.from('booking_services').select('*').eq('company_id', company.id).eq('kind', 'reservation').order('created_at').limit(1)
  if (error) throw error
  const svc = rows?.[0]
  if (svc) {
    const stale = Object.entries(want).some(([k, v]) => svc[k] !== v) || !svc.active
    if (stale) {
      const { data: up } = await db.from('booking_services').update({ ...want, active: true, updated_at: new Date().toISOString() }).eq('id', svc.id).eq('company_id', company.id).select('*').maybeSingle()
      return up || { ...svc, ...want, active: true }
    }
    return svc
  }
  let slug = 'table-reservation'
  const { data: taken } = await db.from('booking_services').select('slug').eq('company_id', company.id).like('slug', 'table-reservation%')
  if ((taken || []).length) slug = `table-reservation-${(taken || []).length + 1}`
  const { data: made, error: mErr } = await db.from('booking_services').insert({
    company_id: company.id, name: 'Table reservation', slug, kind: 'reservation', description: 'Book a table',
    ...want, buffer_before: 0, buffer_after: 0, capacity: 1, price_cents: 0, payment_mode: 'none', deposit_cents: 0,
    location_mode: 'outlet', active: true, sort_order: 999,
  }).select('*').maybeSingle()
  if (mErr) throw mErr
  return made
}

export async function resContext(db: any, companyId: string): Promise<{ ctx?: ResCtx; response?: NextResponse }> {
  const { company, error } = await loadRestaurant(db, companyId)
  if (error) return { response: isMissingRestaurantSchema(error) ? setupNeeded() : json({ error: error.message }, 500) }
  if (!company) return { response: json({ error: 'Workspace not found.' }, 404) }
  const { rs, bs, tz } = settingsOf(company)
  const service = await ensureReservationService(db, company, rs)
  return { ctx: { company, rs, bs, tz, service } }
}

// ── Reading reservations ────────────────────────────────────────────────────

export const RES_COLS = 'id, company_id, service_id, service_name, starts_at, ends_at, status, seats, customer_name, customer_email, customer_phone, notes, internal_notes, seating_pref, occasion, seated_at, completed_at, contact_id, conversation_id, source, created_at, cancelled_at, cancel_reason, reschedule_count, customer_confirmed_at, manage_token, hold_expires_at'

/** Live reservations overlapping [from, to): what takes seats. */
export async function liveReservations(db: any, companyId: string, serviceId: string, fromMs: number, toMs: number): Promise<LiveRes[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await db.from('bookings').select('id, starts_at, ends_at, seats, status, hold_expires_at')
    .eq('company_id', companyId).eq('service_id', serviceId).in('status', ['pending', 'confirmed'])
    .lt('starts_at', new Date(toMs).toISOString()).gt('ends_at', new Date(fromMs).toISOString()).limit(5000)
  if (error) throw error
  return (data || [])
    .filter((b: any) => b.status === 'confirmed' || (b.hold_expires_at && b.hold_expires_at > nowIso))
    .map((b: any) => ({ id: b.id, starts: Date.parse(b.starts_at), ends: Date.parse(b.ends_at), seats: b.seats || 1 }))
}

/** The times a party can book on a day (with why the others can't). */
export async function slotsFor(db: any, ctx: ResCtx, date: string, party: number, opts: { excludeId?: string | null; team?: boolean } = {}) {
  const now = Date.now()
  const rs = opts.team ? { ...ctx.rs, min_notice_mins: 0, max_days_ahead: 365 } : ctx.rs
  const span = [Date.parse(`${date}T00:00:00Z`) - 36 * 3600e3, Date.parse(`${date}T00:00:00Z`) + 60 * 3600e3]
  const live = await liveReservations(db, ctx.company.id, ctx.service.id, span[0], span[1])
  return reservationSlots({ settings: rs, tz: ctx.tz, date, party, live, now, excludeId: opts.excludeId })
}

/**
 * Visits, no-shows and the next table for each guest, worked out from their
 * reservations (never copied onto the contact, so it can't drift).
 */
export async function guestStats(db: any, companyId: string, serviceId: string, contactIds: string[]) {
  const out = new Map<string, { visits: number; noShows: number; cancelled: number; covers: number; lastVisit: string | null; nextVisit: string | null; nextId: string | null; upcoming: number }>()
  const ids = Array.from(new Set(contactIds.filter(isUuid))).slice(0, 500)
  if (!ids.length) return out
  const now = Date.now()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('bookings').select('id, contact_id, starts_at, ends_at, status, seats, seated_at')
      .eq('company_id', companyId).eq('service_id', serviceId).in('contact_id', ids.slice(i, i + 200)).limit(10000)
    for (const b of data || []) {
      const s = out.get(b.contact_id) || { visits: 0, noShows: 0, cancelled: 0, covers: 0, lastVisit: null, nextVisit: null, nextId: null, upcoming: 0 }
      const start = Date.parse(b.starts_at)
      const visited = b.status === 'completed' || (b.status === 'confirmed' && (b.seated_at || Date.parse(b.ends_at) < now))
      if (visited) { s.visits++; s.covers += b.seats || 1; if (!s.lastVisit || b.starts_at > s.lastVisit) s.lastVisit = b.starts_at }
      if (b.status === 'no_show') s.noShows++
      if (b.status === 'cancelled') s.cancelled++
      if ((b.status === 'confirmed' || b.status === 'pending') && start > now && !b.seated_at) {
        s.upcoming++
        if (!s.nextVisit || b.starts_at < s.nextVisit) { s.nextVisit = b.starts_at; s.nextId = b.id }
      }
      out.set(b.contact_id, s)
    }
  }
  return out
}

// ── Making and moving reservations ──────────────────────────────────────────

export const cleanPhone = (v: any) => String(v || '').replace(/[^\d+()\s-]/g, '').trim().slice(0, 32)
export const cleanEmail = (v: any) => { const e = String(v || '').trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '' }
export const clip = (v: any, n: number) => (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n)
export const cleanSeating = (v: any) => (SEATING_OPTIONS as string[]).includes(v) ? v : null

export type CreateRes = {
  startMs: number
  party: number
  name: string
  phone?: string
  email?: string
  contactId?: string | null
  notes?: string
  seating?: string | null
  occasion?: string
  internalNotes?: string
  source: 'page' | 'phone' | 'manual' | 'walk_in' | 'sms' | 'integration'
  /** Made by the team (any time on the day, larger parties, no notice). */
  byTeam: boolean
  /** Book even when it's over the covers limit (team only). */
  force?: boolean
  notify: boolean
  /** A walk-in: seated straight away. */
  seatNow?: boolean
  marketingOptIn?: boolean
  origin: string
}

export type ResResult = { ok: boolean; booking?: any; error?: string; status?: number; full?: boolean; reason?: string }

export async function createReservation(db: any, ctx: ResCtx, input: CreateRes): Promise<ResResult> {
  const { company, rs, tz, service } = ctx
  const party = Math.round(Number(input.party))
  const maxParty = input.byTeam ? 500 : rs.party_max
  const minParty = input.byTeam ? 1 : rs.party_min
  if (!Number.isFinite(party) || party < minParty) return { ok: false, error: `Bookings are for ${minParty} or more.`, status: 400 }
  if (party > maxParty) return { ok: false, error: rs.large_party_note || `For groups over ${rs.party_max}, please get in touch with ${company.name}.`, status: 400 }
  const start = Math.round(input.startMs / MIN) * MIN
  if (!Number.isFinite(start)) return { ok: false, error: 'Pick a time.', status: 400 }
  const name = clip(input.name, 120)
  const phone = cleanPhone(input.phone), email = cleanEmail(input.email)
  if (!name) return { ok: false, error: 'Add the guest’s name.', status: 400 }
  if (!input.byTeam) {
    if (rs.require_phone && phone.replace(/\D/g, '').length < 8) return { ok: false, error: 'Add a mobile number so we can confirm your table.', status: 400 }
    if (rs.require_email && !email) return { ok: false, error: 'Add your email address.', status: 400 }
    if (!phone && !email) return { ok: false, error: 'Add a mobile number or email so we can confirm your table.', status: 400 }
  }
  const date = dateInTz(start, tz)
  const end = start + durationFor(rs, party) * MIN

  if (!input.byTeam) {
    if (!onGrid(rs, tz, date, start)) return { ok: false, error: 'That time isn’t available. Please pick another.', status: 409 }
    const slot = (await slotsFor(db, ctx, date, party)).find(s => s.start === start)
    if (!slot || !slot.ok) return { ok: false, error: slot?.reason === 'notice' ? 'That time is too soon to book online. Please pick a later time or call us.' : 'Sorry, that time is now full. Please pick another.', status: 409, full: true, reason: slot?.reason }
  }

  const force = !!input.force && input.byTeam
  const row = {
    service_name: reservationName(party), timezone: tz, status: 'pending',
    hold_expires_at: new Date(Date.now() + 5 * MIN).toISOString(),
    customer_name: name, customer_email: email || null, customer_phone: phone || null,
    notes: clip(input.notes, 1000) || null, manage_token: randomBytes(18).toString('base64url'),
    source: input.source, seating_pref: cleanSeating(input.seating), occasion: clip(input.occasion, 80) || null,
    internal_notes: input.byTeam ? (clip(input.internalNotes, 1000) || null) : null,
    contact_id: isUuid(input.contactId) ? input.contactId : null, currency: 'aud',
  }
  const { data: id, error } = await db.rpc('claim_reservation', {
    p_company: company.id, p_service: service.id, p_starts: new Date(start).toISOString(), p_ends: new Date(end).toISOString(),
    p_party: party, p_max_covers: force ? 0 : rs.max_covers, p_pace_covers: force ? 0 : rs.pace_covers, p_pace_mins: rs.interval_mins,
    p_row: row, p_exclude: null,
  })
  if (error) {
    if (isMissingRestaurantSchema(error)) return { ok: false, error: RESTAURANT_HINT, status: 503 }
    return { ok: false, error: error.message, status: 500 }
  }
  if (!id) {
    // Why: so the team can choose to book over the top.
    const live = await liveReservations(db, company.id, service.id, start - 12 * 3600e3, end + 12 * 3600e3)
    const f = fits(rs, live, start, party)
    return { ok: false, full: true, reason: f.reason || 'full', status: 409, error: input.byTeam
      ? (f.reason === 'pace' ? `Too many guests arriving at that time (pacing ${rs.pace_covers}).` : `That time is full (${Math.max(0, f.coversLeft === Infinity ? 0 : f.coversLeft)} seats left of ${rs.max_covers}).`)
      : 'Sorry, that time just filled up. Please pick another.' }
  }

  const c = await confirmBooking(db, id as string, { origin: input.origin, byTeam: input.byTeam, notifyCustomer: input.notify, reservation: true })
  if (!c.ok) return { ok: false, error: 'That time was just taken. Please pick another.', status: 409, full: true }
  const patch: any = {}
  if (input.seatNow) patch.seated_at = new Date().toISOString()
  if (Object.keys(patch).length) await db.from('bookings').update(patch).eq('id', id).eq('company_id', company.id)
  const { data: fresh } = await db.from('bookings').select(RES_COLS).eq('id', id).maybeSingle()
  if (input.marketingOptIn && fresh?.contact_id) {
    try {
      await db.from('contacts').update({ subscribed_to_marketing: true, consent_basis: 'express', consent_source: `${company.name} table booking page (ticked “Send me news and offers”)` })
        .eq('id', fresh.contact_id).eq('company_id', company.id)
    } catch {}
  }
  emitIntegrationEvent(company.id, 'booking.created', bookingEvent(fresh || { id }, `New reservation: ${reservationName(party)} · ${name}`, { Guests: party }), { db })
  return { ok: true, booking: fresh }
}

/**
 * Move a reservation (time and/or party size), atomically. `by: 'customer'`
 * keeps them to the online rules (seating times, notice, covers); the team can
 * pick any time and book over the top with `force`.
 */
export async function moveReservation(db: any, b: any, opts: { startMs: number; party?: number; by: 'customer' | 'business'; force?: boolean; notify: boolean; origin: string }): Promise<ResResult> {
  if (b.status !== 'confirmed') return { ok: false, error: 'Only a booked table can be moved.', status: 400 }
  const r = await resContext(db, b.company_id)
  if (!r.ctx) return { ok: false, error: 'Reservations aren’t set up here.', status: 503 }
  const ctx = r.ctx
  const { company, rs, tz, service } = ctx
  if (b.service_id !== service.id) return { ok: false, error: 'This isn’t a table reservation.', status: 400 }
  const party = Math.round(Number(opts.party ?? b.seats))
  const team = opts.by === 'business'
  if (!Number.isFinite(party) || party < 1 || party > (team ? 500 : rs.party_max)) return { ok: false, error: team ? 'Party size must be 1–500.' : (rs.large_party_note || `For groups over ${rs.party_max}, please contact ${company.name}.`), status: 400 }
  const start = Math.round(opts.startMs / MIN) * MIN
  const date = dateInTz(start, tz)
  if (!team) {
    if (!onGrid(rs, tz, date, start)) return { ok: false, error: 'That time isn’t available. Please pick another.', status: 409 }
    const slot = (await slotsFor(db, ctx, date, party, { excludeId: b.id })).find(s => s.start === start)
    if (!slot?.ok) return { ok: false, error: 'Sorry, that time isn’t available. Please pick another.', status: 409, full: true }
  }
  const end = start + durationFor(rs, party) * MIN
  const force = team && !!opts.force
  const { data: moved, error } = await db.rpc('claim_reservation', {
    p_company: b.company_id, p_service: service.id, p_starts: new Date(start).toISOString(), p_ends: new Date(end).toISOString(),
    p_party: party, p_max_covers: force ? 0 : rs.max_covers, p_pace_covers: force ? 0 : rs.pace_covers, p_pace_mins: rs.interval_mins,
    p_row: { service_name: reservationName(party) }, p_exclude: b.id,
  })
  if (error) return { ok: false, error: isMissingRestaurantSchema(error) ? RESTAURANT_HINT : error.message, status: isMissingRestaurantSchema(error) ? 503 : 500 }
  if (!moved) return { ok: false, error: team ? 'That time is full. Book over the limit, or pick another time.' : 'Sorry, that time was just taken. Please pick another.', status: 409, full: true }

  const oldWhen = whenText(b), oldParty = b.seats
  const timeChanged = start !== Date.parse(b.starts_at)
  const upd: any = { reschedule_count: (b.reschedule_count || 0) + (timeChanged ? 1 : 0) }
  if (timeChanged) Object.assign(upd, { reminder_24h_at: null, reminder_2h_at: null, customer_confirmed_at: null })
  try { await db.from('bookings').update(upd).eq('id', b.id) } catch { await db.from('bookings').update({ reschedule_count: upd.reschedule_count }).eq('id', b.id) }
  const { data: fresh } = await db.from('bookings').select('*').eq('id', b.id).maybeSingle()
  const bk = fresh || b
  if (b.calendar_event_id) {
    try { await db.from('calendar_events').update({ starts_at: bk.starts_at, ends_at: bk.ends_at, title: `${bk.service_name} — ${bk.customer_name || 'Guest'}`, status: 'confirmed', reminded_at: null, customer_reminded_at: null }).eq('id', b.calendar_event_id) }
    catch { try { await db.from('calendar_events').update({ starts_at: bk.starts_at, ends_at: bk.ends_at }).eq('id', b.calendar_event_id) } catch {} }
  }
  const what = [timeChanged ? `was ${oldWhen}, now ${whenText(bk)}` : '', party !== oldParty ? `party ${oldParty} → ${party}` : ''].filter(Boolean).join('; ')
  await systemNote(db, bk, `🔁 Reservation changed by ${team ? 'the team' : 'the guest'}: ${what || 'no change'}`)
  if (!team) await notifyCompany({ db, companyId: b.company_id, type: 'booking', conversationId: b.conversation_id || undefined, message: `🔁 ${b.customer_name || 'A guest'} changed their table: ${what}` })
  emitIntegrationEvent(b.company_id, 'booking.rescheduled', bookingEvent(bk, `Reservation changed: ${bk.service_name} · ${b.customer_name || 'a guest'}`, { Was: oldWhen, 'Moved by': team ? 'Team' : 'Guest' }), { db })
  if (opts.notify && (timeChanged || party !== oldParty)) await customerMessage(db, company, ctx.bs, bk, 'rescheduled', { service, origin: opts.origin })
  return { ok: true, booking: bk }
}

/** Re-take a reservation's seats (its hold lapsed before it was confirmed). */
export async function reclaimReservation(db: any, b: any): Promise<boolean> {
  const { company } = await loadRestaurant(db, b.company_id)
  if (!company) return false
  const { rs } = settingsOf(company)
  const { data } = await db.rpc('claim_reservation', {
    p_company: b.company_id, p_service: b.service_id, p_starts: b.starts_at, p_ends: b.ends_at, p_party: b.seats || 1,
    p_max_covers: rs.max_covers, p_pace_covers: rs.pace_covers, p_pace_mins: rs.interval_mins, p_row: {}, p_exclude: b.id,
  })
  return !!data
}

/** The public view of the restaurant for its booking page. */
export function publicRestaurant(company: any, rs: RestaurantSettings, tz: string) {
  return {
    name: company.name, slug: company.slug, logo: company.logo_url || null, accent: /^#[0-9a-f]{6}$/i.test(company.accent_color || '') ? company.accent_color : null,
    timezone: tz, title: rs.page_title || `Book a table at ${company.name}`, intro: rs.intro, confirmationNote: rs.confirmation_note,
    partyMin: rs.party_min, partyMax: rs.party_max, largePartyNote: rs.large_party_note, maxDaysAhead: rs.max_days_ahead,
    requirePhone: rs.require_phone, requireEmail: rs.require_email, seating: rs.seating,
    hours: rs.hours, closed: rs.closed.map(c => c.date),
  }
}
