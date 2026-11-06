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
  bookingEvent, manageUrl, type BookingSettings,
} from '@/lib/booking'
import { dateInTz, fmtDateTime } from '@/lib/booking-time'
import { createChatCheckoutSession } from '@/lib/chat-checkout'
import { notifyCompany } from '@/lib/notify'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { resolveRestaurantSettings, durationFor, reservationName, depositFor, SEATING_OPTIONS, type RestaurantSettings } from '@/lib/restaurant/settings'
import { seatsByTable, type Floor, type FloorTable, type FloorCombo, type TableHold } from '@/lib/restaurant/tables'
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

export const TABLES_HINT = 'Tables need one database update: run migrations/COLVY_V430_RESTAURANT_TABLES.sql in the Supabase SQL editor.'
/** V430 not run yet (the tables or the table claim are missing). */
export function isMissingTablesSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''} ${e?.hint || ''}`
  return /42P01|42703|42883|PGRST202|PGRST204|PGRST205|does not exist|could not find the|schema cache/i.test(m)
    && /restaurant_tables|restaurant_areas|restaurant_table_combos|reservation_tables|claim_table_reservation/i.test(m)
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

export type ResCtx = {
  company: any; rs: RestaurantSettings; bs: BookingSettings; tz: string; service: any
  /** The floor plan (Phase 2), when V430 is in. */
  floor: Floor | null
  /** Seating by table now: the setting is on and there are tables. */
  byTable: boolean
}

export const FLOOR_TABLE_COLS = 'id, area_id, label, min_party, max_party, x, y, w, h, shape, rotation, combinable, online, active, unavailable_until, unavailable_note, sort'

/** Areas, tables and combos (active ones). `missing`: V430 isn't in yet. */
export async function loadFloor(db: any, companyId: string): Promise<{ floor: Floor; areas: any[]; missing: boolean }> {
  const [t, c, a] = await Promise.all([
    db.from('restaurant_tables').select(FLOOR_TABLE_COLS).eq('company_id', companyId).eq('active', true).order('sort').limit(500),
    db.from('restaurant_table_combos').select('id, name, table_ids, min_party, max_party, online, active').eq('company_id', companyId).eq('active', true).limit(200),
    db.from('restaurant_areas').select('id, name, sort, active').eq('company_id', companyId).eq('active', true).order('sort').limit(50),
  ])
  const err = t.error || c.error || a.error
  if (err) {
    if (isMissingTablesSchema(err)) return { floor: { tables: [], combos: [] }, areas: [], missing: true }
    throw err
  }
  const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const tables: FloorTable[] = (t.data || []).map((r: any) => ({ ...r, x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 2), h: num(r.h, 2), min_party: num(r.min_party, 1), max_party: num(r.max_party, 2), sort: num(r.sort, 0) }))
  const combos: FloorCombo[] = (c.data || []).map((r: any) => ({ ...r, table_ids: Array.isArray(r.table_ids) ? r.table_ids : [], min_party: num(r.min_party, 1), max_party: num(r.max_party, 2) }))
  return { floor: { tables, combos }, areas: a.data || [], missing: false }
}

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
  return { ctx: await ctxOf(db, company) }
}

/** The context for a loaded restaurant: its settings, reservation service and floor plan. */
export async function ctxOf(db: any, company: any): Promise<ResCtx> {
  const { rs, bs, tz } = settingsOf(company)
  const [service, fl] = await Promise.all([
    ensureReservationService(db, company, rs),
    loadFloor(db, company.id).catch(() => ({ floor: { tables: [], combos: [] }, areas: [], missing: true })),
  ])
  const floor = fl.missing ? null : fl.floor
  return { company, rs, bs, tz, service, floor, byTable: seatsByTable(rs.use_tables, floor) }
}

// ── Reading reservations ────────────────────────────────────────────────────

export const RES_COLS = 'id, company_id, service_id, service_name, starts_at, ends_at, status, seats, customer_name, customer_email, customer_phone, notes, internal_notes, seating_pref, occasion, seated_at, completed_at, contact_id, conversation_id, source, created_at, cancelled_at, cancel_reason, reschedule_count, customer_confirmed_at, manage_token, hold_expires_at, amount_due_cents, payment_status, payment_mode'

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

/** Which tables the live reservations hold (for picking tables like the claim does). */
export async function tableHolds(db: any, companyId: string, live: LiveRes[]): Promise<TableHold[]> {
  const ids = live.map(l => l.id).filter(Boolean) as string[]
  if (!ids.length) return []
  const byId = new Map(live.map(l => [l.id, l]))
  const out: TableHold[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from('reservation_tables').select('table_id, booking_id').eq('company_id', companyId).eq('active', true).in('booking_id', ids.slice(i, i + 300))
    if (error) { if (isMissingTablesSchema(error)) return []; throw error }
    for (const r of data || []) { const l = byId.get(r.booking_id); if (l) out.push({ table_id: r.table_id, booking_id: r.booking_id, starts: l.starts, ends: l.ends }) }
  }
  return out
}

/** The tables each reservation has: booking id → [{ id, label }]. */
export async function tablesFor(db: any, ctx: ResCtx, bookingIds: string[]): Promise<Map<string, { id: string; label: string }[]>> {
  const out = new Map<string, { id: string; label: string }[]>()
  if (!ctx.floor || !bookingIds.length) return out
  const label = new Map(ctx.floor.tables.map(t => [t.id, t.label]))
  for (let i = 0; i < bookingIds.length; i += 300) {
    const { data, error } = await db.from('reservation_tables').select('table_id, booking_id').eq('company_id', ctx.company.id).eq('active', true).in('booking_id', bookingIds.slice(i, i + 300))
    if (error) { if (isMissingTablesSchema(error)) return out; throw error }
    for (const r of data || []) {
      const list = out.get(r.booking_id) || []
      list.push({ id: r.table_id, label: label.get(r.table_id) || 'Table' })
      out.set(r.booking_id, list)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  return out
}

/** The times a party can book on a day (with why the others can't). */
export async function slotsFor(db: any, ctx: ResCtx, date: string, party: number, opts: { excludeId?: string | null; team?: boolean } = {}) {
  const now = Date.now()
  const rs = opts.team ? { ...ctx.rs, min_notice_mins: 0, max_days_ahead: 365 } : ctx.rs
  const span = [Date.parse(`${date}T00:00:00Z`) - 36 * 3600e3, Date.parse(`${date}T00:00:00Z`) + 60 * 3600e3]
  const live = await liveReservations(db, ctx.company.id, ctx.service.id, span[0], span[1])
  const floor = ctx.byTable && ctx.floor ? { floor: ctx.floor, holds: await tableHolds(db, ctx.company.id, live), onlineOnly: !opts.team } : null
  return reservationSlots({ settings: rs, tz: ctx.tz, date, party, live, now, excludeId: opts.excludeId, floor })
}

/**
 * Visits, no-shows and the next table for each guest, worked out from their
 * reservations (never copied onto the contact, so it can't drift).
 */
/** When guests tapped "I'm here" on their booking page (V431); empty until it's run. */
export async function arrivalsFor(db: any, bookingIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!bookingIds.length) return out
  try {
    const { data, error } = await db.from('bookings').select('id, arrived_at').in('id', bookingIds.slice(0, 1000)).not('arrived_at', 'is', null)
    if (!error) for (const r of data || []) if (r.arrived_at) out.set(r.id, r.arrived_at)
  } catch {}
  return out
}

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
  /** Run the slow follow-ups (the guest's confirmation, notes, alerts, calendar) after the reply: next/server after(). */
  later?: (job: () => Promise<unknown>) => void
}

export type ResResult = { ok: boolean; booking?: any; error?: string; status?: number; full?: boolean; reason?: string; checkoutUrl?: string | null; tables?: string[]; noTable?: boolean }

// ── The claim (covers, pacing, tables) ──────────────────────────────────────
// claim_table_reservation (V430) when it's there; before V430 the Phase 1
// claim_reservation (covers only), so reservations keep working either way.
let v430MissingAt = 0
type ClaimIn = { start: number; end: number; party: number; maxCovers: number; paceCovers: number; row: any; exclude?: string | null; tables?: string[] | null; requireTable?: boolean; onlineOnly?: boolean; area?: string | null; useTables?: boolean }
type ClaimOut = { ok: boolean; id?: string; tables?: string[]; reason?: 'full' | 'pace' | 'no_table' | 'table_busy' | 'bad_table' | 'not_found' | 'invalid'; error?: any }

export async function claimSeats(db: any, ctx: ResCtx, c: ClaimIn): Promise<ClaimOut> {
  const base = {
    p_company: ctx.company.id, p_service: ctx.service.id, p_starts: new Date(c.start).toISOString(), p_ends: new Date(c.end).toISOString(),
    p_party: c.party, p_max_covers: c.maxCovers, p_pace_covers: c.paceCovers, p_pace_mins: ctx.rs.interval_mins, p_row: c.row || {}, p_exclude: c.exclude || null,
  }
  if (Date.now() - v430MissingAt > 10 * MIN) {
    const useTables = c.useTables ?? (ctx.byTable || (Array.isArray(c.tables) && c.tables.length > 0))
    const { data, error } = await db.rpc('claim_table_reservation', {
      ...base, p_tables: Array.isArray(c.tables) ? c.tables : null, p_use_tables: useTables,
      p_require_table: useTables && !!c.requireTable && !Array.isArray(c.tables), p_online_only: !!c.onlineOnly, p_area: c.area || null,
    })
    if (!error) {
      const r = typeof data === 'string' ? JSON.parse(data) : data
      if (r?.ok) return { ok: true, id: r.id, tables: Array.isArray(r.tables) ? r.tables : [] }
      return { ok: false, reason: r?.reason || 'full' }
    }
    if (!isMissingTablesSchema(error)) return { ok: false, error }
    v430MissingAt = Date.now()
  }
  const { data: id, error } = await db.rpc('claim_reservation', base)
  if (error) return { ok: false, error }
  return id ? { ok: true, id, tables: [] } : { ok: false, reason: 'full' }
}

const FULL_TEXT = (rs: RestaurantSettings, reason: string | undefined, team: boolean, coversLeft?: number) => {
  if (reason === 'no_table') return team ? 'No table is free for that party then.' : 'Sorry, there’s no table for that party then. Please pick another time.'
  if (reason === 'table_busy') return 'That table is taken then. Pick another table, or let Colvy choose.'
  if (reason === 'bad_table') return 'That table isn’t on the floor plan any more.'
  if (!team) return 'Sorry, that time just filled up. Please pick another.'
  if (reason === 'pace') return `Too many guests arriving at that time (pacing ${rs.pace_covers}).`
  return `That time is full${coversLeft != null ? ` (${Math.max(0, coversLeft)} seats left of ${rs.max_covers})` : ''}.`
}

/** Past no-shows for whoever's booking, matched by their mobile or email. */
export async function noShowsFor(db: any, ctx: ResCtx, phone: string, email: string): Promise<number> {
  const tail = String(phone || '').replace(/\D/g, '').slice(-9)
  if (tail.length < 8 && !email) return 0
  try {
    let q = db.from('bookings').select('id').eq('company_id', ctx.company.id).eq('service_id', ctx.service.id).eq('status', 'no_show').limit(20)
    q = email && tail.length >= 8 ? q.or(`customer_email.eq.${email.replace(/[,()]/g, '')},customer_phone.ilike.%${tail}`) : email ? q.eq('customer_email', email) : q.ilike('customer_phone', `%${tail}`)
    const { data } = await q
    return (data || []).length
  } catch { return 0 }
}

const stripeReady = (company: any) => !!(company?.stripe_connected && company?.stripe_account_id)

export async function createReservation(db: any, ctx: ResCtx, input: CreateRes & { tables?: string[] | null }): Promise<ResResult> {
  const { company, rs, tz } = ctx
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

  // Online: on the grid, bookable now, and — for guests who keep not turning up — not blocked.
  let deposit = 0, depositWhy: string | null = null
  if (!input.byTeam) {
    if (!onGrid(rs, tz, date, start)) return { ok: false, error: 'That time isn’t available. Please pick another.', status: 409 }
    const slot = (await slotsFor(db, ctx, date, party)).find(s => s.start === start)
    if (!slot || !slot.ok) return { ok: false, error: slot?.reason === 'notice' ? 'That time is too soon to book online. Please pick a later time or call us.' : slot?.reason === 'no_table' ? FULL_TEXT(rs, 'no_table', false) : 'Sorry, that time is now full. Please pick another.', status: 409, full: true, reason: slot?.reason }
    const noShows = rs.no_show.block_after > 0 || rs.no_show.deposit_after > 0 ? await noShowsFor(db, ctx, phone, email) : 0
    if (rs.no_show.block_after > 0 && noShows >= rs.no_show.block_after) {
      return { ok: false, error: `Please call ${company.name} to book this table${company.business_mobile ? ` on ${company.business_mobile}` : ''}.`, status: 403, reason: 'blocked' }
    }
    const d = depositFor(rs, { party, date, noShows })
    if (d.cents > 0 && stripeReady(company)) { deposit = d.cents; depositWhy = d.why }
  }

  const force = !!input.force && input.byTeam
  const row = {
    service_name: reservationName(party), timezone: tz, status: 'pending',
    // A deposit has half an hour to pay (Stripe Checkout's window); otherwise five minutes to confirm.
    hold_expires_at: new Date(Date.now() + (deposit ? 31 : 5) * MIN).toISOString(),
    customer_name: name, customer_email: email || null, customer_phone: phone || null,
    notes: clip(input.notes, 1000) || null, manage_token: randomBytes(18).toString('base64url'),
    source: input.source, seating_pref: cleanSeating(input.seating), occasion: clip(input.occasion, 80) || null,
    internal_notes: input.byTeam ? (clip(input.internalNotes, 1000) || null) : null,
    contact_id: isUuid(input.contactId) ? input.contactId : null, currency: 'aud',
    ...(deposit ? { payment_mode: 'deposit', amount_due_cents: deposit, payment_status: 'pending' } : {}),
  }
  const tables = Array.isArray(input.tables) ? input.tables.filter(isUuid).slice(0, 8) : null
  const c = await claimSeats(db, ctx, {
    start, end, party, maxCovers: force ? 0 : rs.max_covers, paceCovers: force ? 0 : rs.pace_covers, row,
    tables: tables && tables.length ? tables : null, requireTable: !input.byTeam, onlineOnly: !input.byTeam,
  })
  if (c.error) {
    if (isMissingRestaurantSchema(c.error)) return { ok: false, error: RESTAURANT_HINT, status: 503 }
    return { ok: false, error: c.error.message, status: 500 }
  }
  if (!c.ok || !c.id) {
    // Why: so the team can choose to book over the top (or another table).
    const live = await liveReservations(db, company.id, ctx.service.id, start - 12 * 3600e3, end + 12 * 3600e3)
    const f = fits(rs, live, start, party)
    const reason = c.reason === 'full' || c.reason === 'pace' ? (f.reason || c.reason) : c.reason
    return { ok: false, full: true, reason: reason || 'full', status: 409, error: FULL_TEXT(rs, reason, input.byTeam, f.coversLeft === Infinity ? undefined : f.coversLeft) }
  }
  const id = c.id

  if (deposit) {
    const pay = await startDeposit(db, ctx, id, { cents: deposit, party, start, name, email, why: depositWhy })
    if (!pay.ok) {
      await db.from('bookings').update({ status: 'expired', payment_status: 'failed' }).eq('id', id).eq('company_id', company.id)
      return { ok: false, error: pay.error || 'Couldn’t start the deposit payment. Please try again.', status: 502 }
    }
    const { data: held } = await db.from('bookings').select(RES_COLS).eq('id', id).maybeSingle()
    return { ok: true, booking: held, checkoutUrl: pay.url, tables: c.tables }
  }

  const conf = await confirmBooking(db, id as string, { origin: input.origin, byTeam: input.byTeam, notifyCustomer: input.notify, reservation: true, later: input.later })
  if (!conf.ok) return { ok: false, error: 'That time was just taken. Please pick another.', status: 409, full: true }
  const patch: any = {}
  if (input.seatNow) patch.seated_at = new Date().toISOString()
  if (Object.keys(patch).length) await db.from('bookings').update(patch).eq('id', id).eq('company_id', company.id)
  // The confirmed row as confirmBooking left it (no second read), unless someone else confirmed it first.
  const fresh = conf.booking ? { ...conf.booking, ...patch } : (await db.from('bookings').select(RES_COLS).eq('id', id).maybeSingle()).data
  if (input.marketingOptIn && fresh?.contact_id) {
    try {
      await db.from('contacts').update({ subscribed_to_marketing: true, consent_basis: 'express', consent_source: `${company.name} table booking page (ticked “Send me news and offers”)` })
        .eq('id', fresh.contact_id).eq('company_id', company.id)
    } catch {}
  }
  emitIntegrationEvent(company.id, 'booking.created', bookingEvent(fresh || { id }, `New reservation: ${reservationName(party)} · ${name}`, { Guests: party }), { db })
  return { ok: true, booking: fresh, tables: c.tables, noTable: ctx.byTable && !(c.tables || []).length }
}

/**
 * Take a deposit for a held reservation: a chat_payments row (Payments page,
 * receipts, refunds) and Stripe Checkout on the restaurant's own account. The
 * Stripe webhook (booking_payment) or the return page confirms the booking.
 */
async function startDeposit(db: any, ctx: ResCtx, bookingId: string, d: { cents: number; party: number; start: number; name: string; email: string; why: string | null }): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { company, tz } = ctx
  const description = `Deposit — ${reservationName(d.party)}, ${fmtDateTime(d.start, tz)}`
  const { data: pay } = await db.from('chat_payments').insert({
    company_id: company.id, conversation_id: null, message_id: null, amount_cents: d.cents, currency: 'aud', description, status: 'pending',
  }).select('id').maybeSingle()
  if (!pay?.id) return { ok: false }
  const { data: b } = await db.from('bookings').select('manage_token').eq('id', bookingId).maybeSingle()
  const url = manageUrl(company, b?.manage_token || '')
  try {
    const session = await createChatCheckoutSession(company, {
      cents: d.cents, currency: 'aud', description, companyId: company.id, conversationId: '',
      kind: 'booking_payment', extraMetadata: { bookingId, paymentId: pay.id, reservation: '1', depositWhy: d.why || '' },
      successUrl: `${url}?paid=1&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${url}?payment=cancelled`, pageUrl: url,
      expiresAt: Math.floor(Date.now() / 1000) + 31 * 60, customerEmail: d.email || undefined,
    })
    await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', pay.id)
    await db.from('bookings').update({ chat_payment_id: pay.id, stripe_session_id: session.id }).eq('id', bookingId)
    return { ok: true, url: session.url }
  } catch (e: any) {
    try { await db.from('chat_payments').update({ status: 'failed' }).eq('id', pay.id) } catch {}
    return { ok: false, error: e?.message }
  }
}

export async function moveReservation(db: any, b: any, opts: { startMs: number; party?: number; by: 'customer' | 'business'; force?: boolean; notify: boolean; origin: string; tables?: string[] | null }): Promise<ResResult> {
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
  const tables = Array.isArray(opts.tables) ? opts.tables.filter(isUuid).slice(0, 8) : null
  const claimWith = (t: string[] | null) => claimSeats(db, ctx, {
    start, end, party, maxCovers: force ? 0 : rs.max_covers, paceCovers: force ? 0 : rs.pace_covers,
    row: { service_name: reservationName(party) }, exclude: b.id, tables: t, requireTable: !team, onlineOnly: !team,
  })
  // Same party: keep their table if it's still free at the new time.
  let c: ClaimOut | null = null
  if (!tables && ctx.floor && party === b.seats) {
    const cur = ((await tablesFor(db, ctx, [b.id])).get(b.id) || []).map(t => t.id)
    if (cur.length) {
      c = await claimWith(cur)
      if (!c.ok && !c.error && (c.reason === 'table_busy' || c.reason === 'bad_table')) c = null
    }
  }
  if (!c) c = await claimWith(tables)
  if (c.error) return { ok: false, error: isMissingRestaurantSchema(c.error) ? RESTAURANT_HINT : c.error.message, status: isMissingRestaurantSchema(c.error) ? 503 : 500 }
  if (!c.ok) return { ok: false, error: c.reason === 'full' || c.reason === 'pace' ? (team ? 'That time is full. Book over the limit, or pick another time.' : 'Sorry, that time was just taken. Please pick another.') : FULL_TEXT(rs, c.reason, team), status: 409, full: true, reason: c.reason }

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
  if (!timeChanged && party === oldParty) return { ok: true, booking: bk, tables: c.tables }
  const what = [timeChanged ? `was ${oldWhen}, now ${whenText(bk)}` : '', party !== oldParty ? `party ${oldParty} → ${party}` : ''].filter(Boolean).join('; ')
  await systemNote(db, bk, `🔁 Reservation changed by ${team ? 'the team' : 'the guest'}: ${what || 'no change'}`)
  if (!team) await notifyCompany({ db, companyId: b.company_id, type: 'booking', conversationId: b.conversation_id || undefined, message: `🔁 ${b.customer_name || 'A guest'} changed their table: ${what}` })
  emitIntegrationEvent(b.company_id, 'booking.rescheduled', bookingEvent(bk, `Reservation changed: ${bk.service_name} · ${b.customer_name || 'a guest'}`, { Was: oldWhen, 'Moved by': team ? 'Team' : 'Guest' }), { db })
  if (opts.notify && (timeChanged || party !== oldParty)) await customerMessage(db, company, ctx.bs, bk, 'rescheduled', { service, origin: opts.origin })
  return { ok: true, booking: bk, tables: c.tables }
}

/**
 * Give a reservation particular tables (the team's pick), let Colvy choose
 * (null), or none ([]). Same time and party; covers aren't re-checked.
 */
export async function assignTables(db: any, ctx: ResCtx, b: any, tables: string[] | null): Promise<ResResult> {
  if (b.status !== 'confirmed' && b.status !== 'pending') return { ok: false, error: 'Only a live reservation can have a table.', status: 400 }
  if (!ctx.floor) return { ok: false, error: TABLES_HINT, status: 503 }
  const c = await claimSeats(db, ctx, {
    start: Date.parse(b.starts_at), end: Date.parse(b.ends_at), party: b.seats || 1, maxCovers: 0, paceCovers: 0, row: {}, exclude: b.id,
    tables: Array.isArray(tables) ? tables.filter(isUuid).slice(0, 8) : null, requireTable: false, useTables: true,
  })
  if (c.error) return { ok: false, error: isMissingTablesSchema(c.error) ? TABLES_HINT : c.error.message, status: isMissingTablesSchema(c.error) ? 503 : 500 }
  if (!c.ok) return { ok: false, error: FULL_TEXT(ctx.rs, c.reason, true), status: 409, reason: c.reason }
  return { ok: true, tables: c.tables, noTable: !(c.tables || []).length }
}

/** Re-take a reservation's seats (and a table) when its hold lapsed before it was confirmed (a late deposit). */
export async function reclaimReservation(db: any, b: any): Promise<boolean> {
  const r = await resContext(db, b.company_id)
  if (!r.ctx) return false
  const c = await claimSeats(db, r.ctx, {
    start: Date.parse(b.starts_at), end: Date.parse(b.ends_at), party: b.seats || 1,
    maxCovers: r.ctx.rs.max_covers, paceCovers: r.ctx.rs.pace_covers, row: {}, exclude: b.id, requireTable: false,
  })
  return c.ok
}

/** The public view of the restaurant for its booking page. */
export function publicRestaurant(company: any, rs: RestaurantSettings, tz: string) {
  return {
    name: company.name, slug: company.slug, logo: company.logo_url || null, accent: /^#[0-9a-f]{6}$/i.test(company.accent_color || '') ? company.accent_color : null,
    timezone: tz, title: rs.page_title || `Book a table at ${company.name}`, intro: rs.intro, confirmationNote: rs.confirmation_note,
    partyMin: rs.party_min, partyMax: rs.party_max, largePartyNote: rs.large_party_note, maxDaysAhead: rs.max_days_ahead,
    requirePhone: rs.require_phone, requireEmail: rs.require_email, seating: rs.seating,
    hours: rs.hours, closed: rs.closed.map(c => c.date),
    // A deposit, when the restaurant takes card payments (the page shows it before they book).
    deposit: stripeReady(company) && rs.deposit.mode !== 'off' && rs.deposit.cents > 0
      ? { mode: rs.deposit.mode, cents: rs.deposit.cents, minParty: rs.deposit.min_party, days: rs.deposit.days } : null,
    allowChanges: rs.allow_changes, cancelHours: rs.cancel_hours,
  }
}
