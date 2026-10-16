import { internalHeaders } from '@/lib/internal-call'
import { hidesPoweredBy } from '@/lib/branding'
// Online booking & appointments — server core.
//
// Shared by the public booking API (/api/book), the customer's manage link
// (/api/book/manage), the admin APIs (/api/bookings/*) and the Stripe webhook.
// Needs migrations/COLVY_V323_BOOKINGS.sql.
//
// Flow: the page asks for slots → the customer picks one → createBooking()
// claims it atomically (claim_booking_slot) as a short "pending" hold → either
// confirmBooking() straight away (no payment) or after Stripe Checkout
// succeeds (webhook / return-page verify, whichever lands first).

import crypto from 'crypto'
import {
  computeSlots, cleanWeek, dateInTz, addDays, isDate, isValidTimeZone, rKey, zonedParts, zonedToUtc,
  fmtDateTime, fmtMoney, fmtTime, DEFAULT_HOURS,
  type WeekHours, type SlotResource, type Busy, type Slot, type SlotService,
} from '@/lib/booking-time'
import { buildIcs, buildIcsMany, googleCalendarUrl, type InviteEvent } from '@/lib/booking-ics'
import { createChatCheckoutSession, chatStripe } from '@/lib/chat-checkout'
import { notifyCompany } from '@/lib/notify'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { sendCustomerEmail } from '@/lib/customer-email'
import { shortenUrl } from '@/lib/short-link'
import { stitchLinkClick } from '@/lib/link-stitch'
import { attributeBookingToLinks } from '@/lib/link-attribution'
import { ilikeExact, exactEmailRow, phoneKey } from '@/lib/phone'
import { loadStaffRows } from '@/lib/team-list'
import { worksAt } from '@/lib/booking-outlets'
export { worksAt, staffOutlets, outletGaps } from '@/lib/booking-outlets'

const MIN = 60_000
const HOUR = 3_600_000
const PAYMENT_HOLD_MINS = 35   // Stripe Checkout closes at 31 min; a little slack on top
const INSTANT_HOLD_MINS = 5

export const isMissingBookingSchema = (e: any) =>
  /booking_services|bookings|booking_settings|claim_booking_slot|does not exist|schema cache|PGRST20[25]/i.test(String(e?.message || e || ''))
export const MIGRATION_HINT = 'Run migrations/COLVY_V323_BOOKINGS.sql in Supabase, then try again.'
export const MIGRATION_HINT_V324 = 'Run migrations/COLVY_V324_BOOKING_PHASE2.sql in Supabase, then try again.'

// ── Settings ─────────────────────────────────────────────────────────────────

// `locations`: the outlets this person takes bookings at (empty = any outlet).
export type StaffSettings = { bookable: boolean; hours: WeekHours | null; off: string[]; locations: string[] }
export type BookingSettings = {
  enabled: boolean
  timezone: string
  hours: WeekHours
  staff: Record<string, StaffSettings>
  closed: { date: string; label: string }[]
  cancel_hours: number
  refund_on_cancel: boolean
  late_cancel: 'allow' | 'block'
  allow_reschedule: boolean
  require_phone: boolean
  require_email: boolean
  notify_sms: boolean
  notify_email: boolean
  page_title: string
  intro: string
  confirmation_note: string
  reminder_24h: boolean
  reminder_2h: boolean
  followup_review: boolean
  show_in_widget: boolean
}

export function resolveBookingSettings(raw: any): BookingSettings {
  const s = raw || {}
  const staff: Record<string, StaffSettings> = {}
  for (const [id, v] of Object.entries<any>(s.staff || {})) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue
    staff[id] = {
      bookable: !!v?.bookable,
      hours: v?.hours ? cleanWeek(v.hours) : null,
      off: Array.isArray(v?.off) ? v.off.filter(isDate).slice(0, 200) : [],
      locations: Array.isArray(v?.locations) ? v.locations.filter((x: any) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50) : [],
    }
  }
  const tz = String(s.timezone || '').trim()
  return {
    enabled: s.enabled !== false,
    timezone: tz && isValidTimeZone(tz) ? tz : 'Australia/Melbourne',
    hours: s.hours ? cleanWeek(s.hours) : DEFAULT_HOURS,
    staff,
    closed: Array.isArray(s.closed)
      ? s.closed.filter((c: any) => isDate(c?.date)).map((c: any) => ({ date: c.date, label: String(c.label || '').slice(0, 80) })).slice(0, 200)
      : [],
    cancel_hours: clampInt(s.cancel_hours, 0, 24 * 14, 24),
    refund_on_cancel: s.refund_on_cancel !== false,
    late_cancel: s.late_cancel === 'block' ? 'block' : 'allow',
    allow_reschedule: s.allow_reschedule !== false,
    require_phone: s.require_phone !== false,
    require_email: s.require_email !== false,
    notify_sms: s.notify_sms !== false,
    notify_email: s.notify_email !== false,
    page_title: String(s.page_title || '').slice(0, 120),
    intro: String(s.intro || '').slice(0, 1000),
    confirmation_note: String(s.confirmation_note || '').slice(0, 1000),
    reminder_24h: s.reminder_24h !== false,
    reminder_2h: s.reminder_2h !== false,
    followup_review: s.followup_review !== false,
    show_in_widget: s.show_in_widget !== false,
  }
}

function clampInt(v: any, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt
}

// ── Services ─────────────────────────────────────────────────────────────────

export type Question = { id: string; label: string; type: 'text' | 'textarea' | 'select' | 'checkbox'; options: string[]; required: boolean }

export function slugify(s: string) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'service'
}

// Validate an admin's service form into a DB row. Throws a readable message.
export function cleanService(input: any): Record<string, any> {
  const name = String(input?.name || '').trim().slice(0, 120)
  if (!name) throw new Error('Give the service a name.')
  const duration = clampInt(input.duration_mins, 5, 24 * 60, 30)
  const price = Math.max(0, Math.round(Number(input.price_cents) || 0))
  const mode = ['none', 'deposit', 'full'].includes(input.payment_mode) ? input.payment_mode : 'none'
  const deposit = Math.max(0, Math.round(Number(input.deposit_cents) || 0))
  if (mode === 'full' && price < 100) throw new Error('Set a price of at least $1 to take full payment online.')
  if (mode === 'deposit' && deposit < 100) throw new Error('Set a deposit of at least $1.')
  if (mode === 'deposit' && price > 0 && deposit > price) throw new Error('The deposit can’t be more than the price.')
  const questions: Question[] = (Array.isArray(input.questions) ? input.questions : []).slice(0, 15)
    .map((q: any, i: number) => ({
      id: String(q?.id || `q${i + 1}`).replace(/[^\w-]/g, '').slice(0, 40) || `q${i + 1}`,
      label: String(q?.label || '').trim().slice(0, 200),
      type: ['text', 'textarea', 'select', 'checkbox'].includes(q?.type) ? q.type : 'text',
      options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o).trim().slice(0, 100)).filter(Boolean).slice(0, 20) : [],
      required: !!q?.required,
    }))
    .filter((q: Question) => q.label)
  const uuids = (a: any) => (Array.isArray(a) ? a : []).filter((x: any) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50)
  return {
    name,
    slug: slugify(input.slug || name),
    description: String(input.description || '').slice(0, 2000) || null,
    kind: input.kind === 'booking' ? 'booking' : 'appointment',
    duration_mins: duration,
    buffer_before: clampInt(input.buffer_before, 0, 240, 0),
    buffer_after: clampInt(input.buffer_after, 0, 240, 0),
    slot_interval: input.slot_interval ? clampInt(input.slot_interval, 5, 240, 15) : null,
    capacity: clampInt(input.capacity, 1, 500, 1),
    price_cents: price,
    payment_mode: mode,
    deposit_cents: mode === 'deposit' ? deposit : 0,
    currency: /^[a-z]{3}$/i.test(String(input.currency || '')) ? String(input.currency).toLowerCase() : 'aud',
    location_mode: ['outlet', 'customer', 'phone', 'video'].includes(input.location_mode) ? input.location_mode : 'outlet',
    location_ids: uuids(input.location_ids),
    video_url: input.location_mode === 'video' ? (String(input.video_url || '').trim().slice(0, 500) || null) : null,
    staff_ids: uuids(input.staff_ids),
    min_notice_mins: clampInt(input.min_notice_mins, 0, 60 * 24 * 60, 120),
    max_days_ahead: clampInt(input.max_days_ahead, 1, 365, 60),
    rebook_days: input.rebook_days ? clampInt(input.rebook_days, 1, 730, 28) : null,
    questions,
    color: /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? input.color : null,
    image_url: String(input.image_url || '').trim().slice(0, 1000) || null,
    active: input.active !== false,
    sort_order: clampInt(input.sort_order, 0, 10000, 0),
  }
}

// What the customer pays online when booking.
export function amountDue(service: any): number {
  if (service.payment_mode === 'full') return service.price_cents || 0
  if (service.payment_mode === 'deposit') return service.deposit_cents || 0
  return 0
}

// 'keys' mode is only set once the business has saved its own secret key (kept
// server-side in company_secrets, never on this row).
export const stripeReady = (company: any) =>
  !!(company?.stripe_mode === 'keys' || company?.stripe_connected || company?.stripe_account_id)

// ── URLs ─────────────────────────────────────────────────────────────────────

// The company's own subdomain (roxyaquarium.colvy.com) — recognisable in an
// SMS — falling back to the site URL on previews / localhost.
export function companyBase(company: any): { base: string; onSubdomain: boolean } {
  const site = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
  try {
    const u = new URL(site)
    if (company?.slug && u.hostname.replace(/^www\./, '') === 'colvy.com') return { base: `${u.protocol}//${company.slug}.colvy.com`, onSubdomain: true }
  } catch {}
  return { base: site, onSubdomain: false }
}
export function bookingPageUrl(company: any, serviceSlug?: string) {
  const { base, onSubdomain } = companyBase(company)
  const root = onSubdomain ? `${base}/book` : `${base}/book/${company.slug}`
  return serviceSlug ? `${root}/${serviceSlug}` : root
}
export const manageUrl = (company: any, token: string) => `${companyBase(company).base}/booking/${token}`

// ── Lookups ──────────────────────────────────────────────────────────────────

export const PUBLIC_COMPANY_COLS = 'id, name, slug, logo_url, accent_color, owner_id, booking_settings, stripe_mode, stripe_connected, stripe_account_id'

export async function loadCompanyPublic(db: any, q: { slug?: string | null; domain?: string | null; id?: string | null }) {
  if (q.id) {
    const { data } = await db.from('companies').select(PUBLIC_COMPANY_COLS).eq('id', q.id).maybeSingle()
    return data || null
  }
  const slug = String(q.slug || '').toLowerCase().trim()
  if (slug) {
    const { data } = await db.from('companies').select(PUBLIC_COMPANY_COLS).eq('slug', slug).maybeSingle()
    if (data) return data
  }
  const domain = String(q.domain || '').toLowerCase().trim()
  if (domain) {
    for (const col of ['help_domain', 'board_domain']) {
      const { data } = await db.from('companies').select(PUBLIC_COMPANY_COLS).eq(col, domain).maybeSingle()
      if (data) return data
    }
  }
  return null
}

export type StaffMember = { id: string; name: string; avatar_url: string | null; email: string | null; phone: string | null }

// Owner + active staff who have signed in (a user id is what calendar events
// are assigned to). Never a board visitor.
export async function loadStaff(db: any, company: any): Promise<StaffMember[]> {
  const out: StaffMember[] = []
  try {
    const tm = await loadStaffRows(db, company.id, 'user_id, name, email, phone, avatar_url, status').catch(() => [])
    for (const m of tm || []) {
      if (!m.user_id || out.some(t => t.id === m.user_id)) continue
      if (['invited', 'pending', 'inactive', 'disabled', 'removed', 'suspended'].includes(String(m.status || '').toLowerCase())) continue
      out.push({ id: m.user_id, name: m.name || (m.email || '').split('@')[0] || 'Team member', avatar_url: m.avatar_url || null, email: m.email || null, phone: m.phone || null })
    }
    if (company.owner_id && !out.some(t => t.id === company.owner_id)) {
      let name = 'Owner', email: string | null = null
      try {
        const { data: u } = await (db.auth.admin as any).getUserById(company.owner_id)
        const meta = u?.user?.user_metadata || {}
        email = u?.user?.email || null
        name = meta.display_name || meta.full_name || meta.name || (email || '').split('@')[0] || 'Owner'
      } catch {}
      out.unshift({ id: company.owner_id, name, avatar_url: null, email, phone: null })
    }
  } catch {}
  return out
}

export async function loadLocations(db: any, companyId: string) {
  try {
    const { data } = await db.from('company_locations').select('id, label, unit, street_address, suburb, state, postcode, is_primary').eq('company_id', companyId)
    return (data || []).map((l: any) => ({
      id: l.id,
      label: l.label || l.suburb || 'Location',
      address: [l.unit ? `${l.unit}/` : '', l.street_address, l.suburb, l.state, l.postcode].filter(Boolean).join(' ').replace('/ ', '/'),
      is_primary: !!l.is_primary,
    }))
  } catch { return [] }
}

// ── Availability ─────────────────────────────────────────────────────────────

// The resources a service can be booked against. No bookable staff at all →
// "solo" mode: the business itself is the one resource, on business hours.
// With an outlet picked, only people who work there (or anywhere) are offered
// — unless that leaves nobody, when everyone is (a missing set-up shouldn't
// close an outlet; Availability warns about it). `outletIds`: the outlets
// that still exist, so a deleted one doesn't count.
export function resourcesFor(settings: BookingSettings, staff: StaffMember[], service: any, locationId?: string | null, outletIds?: Set<string> | null): SlotResource[] {
  const bookable = staff.filter(s => settings.staff[s.id]?.bookable)
  if (!bookable.length) return [{ id: null, hours: settings.hours, off: [] }]
  let allowed = (service.staff_ids || []).length ? bookable.filter(s => service.staff_ids.includes(s.id)) : bookable
  if (locationId) {
    const here = allowed.filter(s => worksAt(settings, s.id, locationId, outletIds))
    if (here.length) allowed = here
  }
  return allowed.map(s => ({ id: s.id, hours: settings.staff[s.id]?.hours || settings.hours, off: settings.staff[s.id]?.off || [] }))
}

// Everything that makes a resource busy between two instants: live bookings
// (confirmed, or still holding a slot) and the team's own calendar events.
export async function loadBusy(db: any, companyId: string, resources: SlotResource[], fromMs: number, toMs: number, excludeBookingId?: string | null): Promise<Map<string, Busy[]>> {
  const busy = new Map<string, Busy[]>()
  const push = (id: string | null, b: Busy) => { const k = rKey(id); const l = busy.get(k) || []; l.push(b); busy.set(k, l) }
  const ids = new Set(resources.map(r => r.id))
  const solo = ids.has(null)
  const fromIso = new Date(fromMs).toISOString(), toIso = new Date(toMs).toISOString()
  const nowIso = new Date().toISOString()

  const { data: bks, error } = await db.from('bookings')
    .select('id, staff_id, service_id, starts_at, busy_from, busy_until, seats, status, hold_expires_at')
    .eq('company_id', companyId).in('status', ['pending', 'confirmed'])
    .lt('busy_from', toIso).gt('busy_until', fromIso)
  if (error) throw error
  for (const b of bks || []) {
    if (excludeBookingId && b.id === excludeBookingId) continue
    if (b.status === 'pending' && !(b.hold_expires_at && b.hold_expires_at > nowIso)) continue
    if (!ids.has(b.staff_id ?? null)) continue
    push(b.staff_id ?? null, { from: Date.parse(b.busy_from), until: Date.parse(b.busy_until), serviceId: b.service_id, startMs: Date.parse(b.starts_at), seats: b.seats || 1 })
  }

  // Calendar events the team added themselves (deliveries, appointments…).
  // Booking-made events are skipped — the bookings table already covers them.
  try {
    const { data: evs } = await db.from('calendar_events')
      .select('event_type, starts_at, ends_at, is_all_day, status, assigned_to_id, assignees, external_source')
      .eq('company_id', companyId).neq('status', 'cancelled')
      .lt('starts_at', toIso).gte('starts_at', new Date(fromMs - 24 * HOUR).toISOString())
      .or('external_source.is.null,external_source.neq.booking')
    for (const e of evs || []) {
      if (e.is_all_day || !e.starts_at) continue
      const from = Date.parse(e.starts_at)
      const until = e.ends_at ? Date.parse(e.ends_at) : from + 30 * MIN
      if (until <= fromMs) continue
      const who = new Set<string>()
      if (e.assigned_to_id) who.add(e.assigned_to_id)
      for (const a of Array.isArray(e.assignees) ? e.assignees : []) if (a?.id) who.add(a.id)
      for (const id of who) if (ids.has(id)) push(id, { from, until })
      if (solo && (e.event_type === 'appointment' || e.event_type === 'booking')) push(null, { from, until })
    }
  } catch {}
  return busy
}

export function slotService(service: any): SlotService {
  return {
    id: service.id, duration_mins: service.duration_mins, buffer_before: service.buffer_before || 0,
    buffer_after: service.buffer_after || 0, slot_interval: service.slot_interval, capacity: service.capacity || 1,
    min_notice_mins: service.min_notice_mins ?? 120, max_days_ahead: service.max_days_ahead || 60,
  }
}

export async function availability(db: any, opts: {
  company: any; settings: BookingSettings; service: any; staff: StaffMember[]
  staffFilter: string | 'any'; fromDate: string; toDate: string; excludeBookingId?: string | null
  /** The outlet the booking is at — only staff who work there are offered. */
  locationId?: string | null
}): Promise<{ slots: Slot[]; busy: Map<string, Busy[]> }> {
  const { settings, service } = opts
  // Moving a booking that has a person of its own: they keep it, wherever
  // they're set to work now (the team already accepted that pairing).
  const keepsPerson = !!opts.excludeBookingId && opts.staffFilter !== 'any'
  const locationId = service.location_mode === 'outlet' && !keepsPerson ? opts.locationId || null : null
  let outletIds: Set<string> | null = null
  if (locationId && Object.values(settings.staff).some(v => v.locations?.length)) {
    outletIds = new Set((await loadLocations(db, opts.company.id)).map((l: any) => l.id))
  }
  let resources = resourcesFor(settings, opts.staff, service, locationId, outletIds)
  if (opts.staffFilter !== 'any') resources = resources.filter(r => r.id === opts.staffFilter)
  if (!resources.length) return { slots: [], busy: new Map() }
  const tz = settings.timezone
  const fromDate = opts.fromDate, toDate = opts.toDate
  const fromMs = Date.parse(`${addDays(fromDate, -1)}T00:00:00Z`)
  const toMs = Date.parse(`${addDays(toDate, 2)}T00:00:00Z`)
  const busy = await loadBusy(db, opts.company.id, resources, fromMs, toMs, opts.excludeBookingId)
  const slots = computeSlots({
    service: slotService(service), timezone: tz, resources,
    closed: settings.closed.map(c => c.date), fromDate, toDate, busy, now: Date.now(),
  })
  return { slots, busy }
}

// ── Contacts / conversations ─────────────────────────────────────────────────

const tail9 = (s: string) => (s || '').replace(/\D/g, '').slice(-9)

// `out.created` says whether a brand-new contact was made (a new lead, for
// smart-link reporting).
async function ensureContact(db: any, companyId: string, c: { name: string; email: string | null; phone: string | null }, knownId?: string, out?: { created?: boolean }) {
  let hit: any = null
  try {
    if (knownId) {
      const { data } = await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).eq('id', knownId).maybeSingle()
      hit = data || null
    }
    if (!hit && c.email) {
      const { data } = await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).ilike('email', ilikeExact(c.email)).limit(10)
      hit = exactEmailRow(data, c.email)
    }
    if (!hit && c.phone && tail9(c.phone).length >= 8) {
      const { data } = await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).ilike('phone', `%${tail9(c.phone)}%`).limit(10)
      hit = (data || []).find((x: any) => tail9(x.phone) === tail9(c.phone!)) || null
    }
  } catch {}
  if (hit) {
    // Only fill what's empty — never overwrite what the team saved.
    const patch: any = {}
    if (!hit.name && c.name) patch.name = c.name
    if (!hit.email && c.email) patch.email = c.email
    if (!hit.phone && c.phone) patch.phone = c.phone
    if (Object.keys(patch).length) { try { await db.from('contacts').update(patch).eq('id', hit.id) } catch {} }
    return hit.id as string
  }
  try {
    const { data } = await db.from('contacts').insert({ company_id: companyId, name: c.name || null, email: c.email, phone: c.phone, source: 'booking' }).select('id').maybeSingle()
    if (data?.id && out) out.created = true
    return (data?.id as string) || null
  } catch { return null }
}

async function ensureConversation(db: any, companyId: string, contactId: string | null, b: any): Promise<string | null> {
  if (contactId) {
    try {
      const { data } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contactId)
        .order('last_message_at', { ascending: false }).limit(1)
      if (data?.[0]?.id) return data[0].id
    } catch {}
  }
  try {
    const { data } = await db.from('conversations').insert({
      company_id: companyId, channel: b.customer_phone ? 'sms' : 'email',
      subject: b.customer_name || b.customer_phone || b.customer_email || 'Booking',
      contact_id: contactId, status: 'open',
      sms_number: b.customer_phone || null, sms_enabled: !!b.customer_phone,
      last_message: '', last_message_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    return data?.id || null
  } catch { return null }
}

async function systemNote(db: any, b: any, content: string) {
  if (!b.conversation_id) return
  try {
    await db.from('messages').insert({ conversation_id: b.conversation_id, company_id: b.company_id, sender_type: 'system', content, metadata: { booking_id: b.id } })
  } catch {}
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function whereText(b: any, service?: any): string {
  if (b.address) return b.address
  if (service?.location_mode === 'phone') return 'Phone call'
  if (service?.location_mode === 'video') return 'Video call'
  return b.location_label || ''
}

function whenText(b: any) {
  return fmtDateTime(Date.parse(b.starts_at), b.timezone || 'Australia/Melbourne', { withTz: true })
}

// The booking as integrations (Slack, webhooks, Zapier…) see it.
function bookingEvent(b: any, title: string, extra: Record<string, any> = {}) {
  return {
    title, path: '/admin/bookings',
    customer: { name: b.customer_name, email: b.customer_email, phone: b.customer_phone },
    fields: {
      Service: b.service_name, When: whenText(b), Staff: b.staff_name || null,
      Price: b.price_cents ? fmtMoney(b.price_cents, b.currency) : null,
      Paid: b.payment_status === 'paid' && b.amount_due_cents ? fmtMoney(b.amount_due_cents, b.currency) : null,
      ...extra,
    },
    data: { booking: {
      id: b.id, status: b.status, service: b.service_name, staff: b.staff_name || null, starts_at: b.starts_at, ends_at: b.ends_at,
      price_cents: b.price_cents ?? null, amount_due_cents: b.amount_due_cents ?? null, currency: b.currency || null, payment_status: b.payment_status || null,
    } },
    dedupeKey: `booking:${b.id}:${b.status}:${b.starts_at}`,
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateInput = {
  company: any
  service: any
  staffChoice: string | 'any'
  startMs: number
  customer: { name: string; email: string | null; phone: string | null; timezone: string | null }
  answers: { id: string; label: string; value: string }[]
  locationId: string | null
  address: string | null
  notes: string | null
  origin: string
  source?: string
  inviteToken?: string | null
  /** The tracked click (?clv=) the booking page was opened through, if any. */
  clickRef?: string | null
}

export type CreateResult = { ok: true; token: string; checkoutUrl?: string | null; state: 'confirmed' | 'pending' } | { ok: false; error: string; status?: number }

export async function createBooking(db: any, input: CreateInput): Promise<CreateResult> {
  const { company, service } = input
  const settings = resolveBookingSettings(company.booking_settings)
  const tz = settings.timezone
  const staff = await loadStaff(db, company)

  // Location
  let locationId: string | null = null, locationLabel: string | null = null
  if (service.location_mode === 'outlet') {
    const locs = await loadLocations(db, company.id)
    const allowed = (service.location_ids || []).length ? locs.filter((l: any) => service.location_ids.includes(l.id)) : locs.filter((l: any) => l.is_primary).slice(0, 1)
    const pick = allowed.find((l: any) => l.id === input.locationId) || (allowed.length === 1 ? allowed[0] : null)
    if (allowed.length > 1 && !pick) return { ok: false, error: 'Choose a location.' }
    if (pick) { locationId = pick.id; locationLabel = [pick.label, pick.address].filter(Boolean).join(' — ') }
  }
  const address = service.location_mode === 'customer' ? String(input.address || '').trim().slice(0, 300) : null
  if (service.location_mode === 'customer' && !address) return { ok: false, error: 'Enter the address for the appointment.' }
  if (service.location_mode === 'video' && service.video_url) locationLabel = service.video_url

  // Is the time still bookable — and by whom?
  const date = dateInTz(input.startMs, tz)
  const { slots, busy } = await availability(db, { company, settings, service, staff, staffFilter: input.staffChoice, fromDate: date, toDate: date, locationId })
  const slot = slots.find(s => s.start === input.startMs)
  if (!slot || !slot.resources.length) return { ok: false, error: 'Sorry, that time was just taken. Please pick another.', status: 409 }

  // "Anyone": the least-booked person that day first, to spread the load.
  const dayLoad = (id: string | null) => (busy.get(rKey(id)) || []).filter(b => b.serviceId !== undefined && dateInTz(b.from, tz) === date).length
  const candidates = [...slot.resources].sort((a, b) => dayLoad(a) - dayLoad(b))

  const due = amountDue(service)
  const needsPayment = due > 0
  if (needsPayment && !stripeReady(company)) return { ok: false, error: 'This business hasn’t finished setting up online payments, so this service can’t be booked online yet. Please contact them directly.' }

  const startMs = input.startMs
  const endMs = startMs + service.duration_mins * MIN
  const busyFrom = startMs - (service.buffer_before || 0) * MIN
  const busyUntil = endMs + (service.buffer_after || 0) * MIN
  const token = crypto.randomBytes(24).toString('base64url')
  const holdUntil = new Date(Date.now() + (needsPayment ? PAYMENT_HOLD_MINS : INSTANT_HOLD_MINS) * MIN).toISOString()

  let bookingId: string | null = null
  for (const cand of candidates) {
    const staffName = cand ? (staff.find(s => s.id === cand)?.name || null) : null
    const { data, error } = await db.rpc('claim_booking_slot', {
      p_company: company.id, p_service: service.id, p_staff: cand,
      p_starts: new Date(startMs).toISOString(), p_ends: new Date(endMs).toISOString(),
      p_busy_from: new Date(busyFrom).toISOString(), p_busy_until: new Date(busyUntil).toISOString(),
      p_capacity: service.capacity || 1,
      p_row: {
        service_name: service.name, staff_name: staffName,
        staff_choice: input.staffChoice === 'any' ? 'any' : 'specific',
        location_id: locationId || '', location_label: locationLabel, address,
        timezone: tz, status: 'pending', hold_expires_at: holdUntil, seats: 1,
        customer_name: input.customer.name, customer_email: input.customer.email, customer_phone: input.customer.phone,
        customer_timezone: input.customer.timezone, answers: input.answers, notes: input.notes,
        price_cents: service.price_cents || 0, amount_due_cents: due, currency: service.currency || 'aud',
        payment_mode: service.payment_mode || 'none', payment_status: needsPayment ? 'pending' : 'none',
        manage_token: token, source: input.source || 'page',
      },
      p_exclude: null,
    })
    if (error) {
      if (isMissingBookingSchema(error)) return { ok: false, error: 'Online booking isn’t available yet.', status: 503 }
      throw error
    }
    if (data) { bookingId = data as string; break }
  }
  if (!bookingId) return { ok: false, error: 'Sorry, that time was just taken. Please pick another.', status: 409 }

  // A personal link from the inbox → the booking joins that customer's thread.
  if (input.inviteToken) {
    const inv = await loadInvite(db, input.inviteToken)
    if (inv && inv.company_id === company.id) { try { await db.from('bookings').update({ invite_id: inv.id }).eq('id', bookingId) } catch {} }
  }

  // Smart links: remember the Reel / QR click that opened the page, so the
  // booking can be credited to that link when it's confirmed — for a paid
  // booking that's later, in the Stripe webhook. The column comes with V361;
  // before that the update just fails and instant bookings still get it below.
  if (input.clickRef) {
    try { await db.from('bookings').update({ source_click_id: input.clickRef }).eq('id', bookingId) } catch {}
  }

  if (!needsPayment) {
    await confirmBooking(db, bookingId, { origin: input.origin, clickRef: input.clickRef || null })
    return { ok: true, token, state: 'confirmed' }
  }

  // Payment: a chat_payments row (so it shows on the Payments page and gets the
  // shared receipt / refund tooling) + hosted Checkout on the business's account.
  const label = service.payment_mode === 'deposit' ? `Deposit — ${service.name}` : service.name
  const description = `${label}, ${fmtDateTime(startMs, tz)}`
  const { data: pay } = await db.from('chat_payments').insert({
    company_id: company.id, conversation_id: null, message_id: null,
    amount_cents: due, currency: service.currency || 'aud', description, status: 'pending',
  }).select('id').maybeSingle()
  if (!pay?.id) {
    await db.from('bookings').update({ status: 'expired', payment_status: 'failed' }).eq('id', bookingId)
    return { ok: false, error: 'Couldn’t start the payment. Please try again.' }
  }
  const url = manageUrl(company, token)
  try {
    const session = await createChatCheckoutSession(company, {
      cents: due, currency: service.currency || 'aud', description,
      companyId: company.id, conversationId: '',
      kind: 'booking_payment', extraMetadata: { bookingId, paymentId: pay.id },
      successUrl: `${url}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${url}?payment=cancelled`,
      pageUrl: url,
      expiresAt: Math.floor(Date.now() / 1000) + 31 * 60,
      customerEmail: input.customer.email,
    })
    await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', pay.id)
    await db.from('bookings').update({ chat_payment_id: pay.id, stripe_session_id: session.id }).eq('id', bookingId)
    return { ok: true, token, checkoutUrl: session.url, state: 'pending' }
  } catch (e: any) {
    try { await db.from('chat_payments').update({ status: 'failed' }).eq('id', pay.id) } catch {}
    await db.from('bookings').update({ status: 'expired', payment_status: 'failed' }).eq('id', bookingId)
    return { ok: false, error: e?.message || 'Couldn’t start the payment. Please try again.' }
  }
}

// ── Confirm ──────────────────────────────────────────────────────────────────

async function loadBookingCtx(db: any, bookingId: string) {
  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!b) return null
  const company = await loadCompanyPublic(db, { id: b.company_id })
  const { data: service } = b.service_id ? await db.from('booking_services').select('*').eq('id', b.service_id).maybeSingle() : { data: null }
  return { b, company, service, settings: resolveBookingSettings(company?.booking_settings) }
}

// Confirm a held booking. Idempotent: the webhook and the return-page verify
// can both call it; only one does the side effects. If the hold lapsed and the
// slot was taken meanwhile, a payment is refunded and the booking cancelled.
// `quiet`: a visit the team added (a repeat of a regular booking) — the
// calendar, contact and integrations get it as usual, but the customer and the
// team hear about the whole series once, from repeatBooking().
export async function confirmBooking(db: any, bookingId: string, opts: { origin: string; paymentIntent?: string | null; paid?: boolean; clickRef?: string | null; quiet?: boolean }): Promise<{ ok: boolean; conflict?: boolean; already?: boolean }> {
  const ctx = await loadBookingCtx(db, bookingId)
  if (!ctx) return { ok: false }
  const { b, company, service, settings } = ctx
  if (b.status === 'confirmed' || b.status === 'completed') return { ok: true, already: true }
  if (b.status !== 'pending' && b.status !== 'expired') {
    // Cancelled before the payment landed — give the money back.
    if (opts.paid && b.payment_status !== 'refunded') {
      if (opts.paymentIntent) await db.from('bookings').update({ stripe_payment_intent: opts.paymentIntent, payment_status: 'paid' }).eq('id', b.id)
      await refundBooking(db, company, { ...b, payment_status: 'paid' }, null)
    }
    return { ok: false }
  }

  const holdLapsed = b.status !== 'pending' || !b.hold_expires_at || Date.parse(b.hold_expires_at) <= Date.now()
  if (holdLapsed) {
    // Re-check the slot is still free (ignoring this booking's own row).
    const { data: still } = await db.rpc('claim_booking_slot', {
      p_company: b.company_id, p_service: b.service_id, p_staff: b.staff_id,
      p_starts: b.starts_at, p_ends: b.ends_at, p_busy_from: b.busy_from, p_busy_until: b.busy_until,
      p_capacity: service?.capacity || 1, p_row: { hold_expires_at: new Date(Date.now() + 5 * MIN).toISOString() }, p_exclude: b.id,
    })
    if (!still) {
      const patch: any = { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'system', cancel_reason: 'The time was taken before payment finished' }
      if (opts.paid) patch.payment_status = 'paid'
      if (opts.paymentIntent) patch.stripe_payment_intent = opts.paymentIntent
      await db.from('bookings').update(patch).eq('id', b.id)
      let refunded = false
      if (opts.paid) refunded = (await refundBooking(db, company, { ...b, ...patch }, null)).ok
      await customerMessage(db, company, settings, { ...b, ...patch }, 'conflict', { refunded })
      await notifyCompany({ db, companyId: b.company_id, type: 'booking', message: `⚠️ ${b.customer_name || 'A customer'} paid for ${b.service_name} at ${whenText(b)}, but that time had been taken — ${refunded ? 'refunded automatically' : 'please refund them'}.` })
      return { ok: false, conflict: true }
    }
    if (b.status !== 'pending') await db.from('bookings').update({ status: 'pending' }).eq('id', b.id)
  }

  // Claim pending → confirmed exactly once.
  const patch: any = { status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  if (opts.paid) patch.payment_status = 'paid'
  if (opts.paymentIntent) patch.stripe_payment_intent = opts.paymentIntent
  const { data: claimed } = await db.from('bookings').update(patch).eq('id', b.id).eq('status', 'pending').select('id')
  if (!claimed?.length) return { ok: true, already: true }
  const bk = { ...b, ...patch }

  // CRM: contact + conversation, so the booking lives with the customer.
  let contactId: string | null = null, conversationId: string | null = null
  if (b.invite_id) {
    try {
      const { data: inv } = await db.from('booking_invites').select('id, company_id, contact_id, conversation_id, used_count').eq('id', b.invite_id).maybeSingle()
      if (inv && inv.company_id === b.company_id) {
        contactId = inv.contact_id || null
        conversationId = inv.conversation_id || null
        await db.from('booking_invites').update({ used_count: (inv.used_count || 0) + 1 }).eq('id', inv.id)
        if (contactId) await ensureContact(db, b.company_id, { name: b.customer_name || '', email: b.customer_email, phone: b.customer_phone }, contactId)
      }
    } catch {}
  }
  // Already linked (a repeat visit copies its customer from the first one).
  if (!contactId && b.contact_id) contactId = await ensureContact(db, b.company_id, { name: b.customer_name || '', email: b.customer_email, phone: b.customer_phone }, b.contact_id)
  if (!conversationId && b.conversation_id) conversationId = b.conversation_id
  const made: { created?: boolean } = {}
  if (!contactId) contactId = await ensureContact(db, b.company_id, { name: b.customer_name || '', email: b.customer_email, phone: b.customer_phone }, undefined, made)
  if (!conversationId) conversationId = await ensureConversation(db, b.company_id, contactId, b)
  bk.contact_id = contactId; bk.conversation_id = conversationId
  if (b.chat_payment_id && conversationId) { try { await db.from('chat_payments').update({ conversation_id: conversationId }).eq('id', b.chat_payment_id) } catch {} }

  // Smart links: credit the booking (and what was paid online, once paid) to
  // the link that led to it — the Reel / QR click the page was opened through,
  // or else a tracked link this customer clicked in the last 7 days. The click
  // gets the contact, so their orders that week are credited too. Analytics only.
  if (!opts.quiet) try {
    const clickRef = opts.clickRef || b.source_click_id || null
    if (clickRef) await stitchLinkClick(db, { companyId: b.company_id, clickRef, contactId, contactIsNew: !!made.created, at: Date.parse(b.created_at) || Date.now() })
    await attributeBookingToLinks({
      db, companyId: b.company_id, contactId, bookingId: b.id, clickRef,
      paidCents: b.amount_due_cents || 0, paid: !!opts.paid, currency: b.currency, bookedAt: b.created_at,
    })
  } catch {}

  // Calendar
  const answers = (Array.isArray(b.answers) ? b.answers : []).filter((a: any) => a?.value)
  const notes = [
    b.source === 'repeat' ? 'Regular booking, added by the team.' : `Booked online${b.staff_choice === 'any' && b.staff_name ? ' (any staff)' : ''}.`,
    b.customer_phone ? `Phone: ${b.customer_phone}` : '',
    b.customer_email ? `Email: ${b.customer_email}` : '',
    ...answers.map((a: any) => `${a.label}: ${a.value}`),
    b.notes ? `Notes: ${b.notes}` : '',
    b.amount_due_cents ? `${b.payment_mode === 'deposit' ? 'Deposit' : 'Paid'} online: ${fmtMoney(b.amount_due_cents, b.currency)}${b.price_cents && b.payment_mode === 'deposit' ? ` of ${fmtMoney(b.price_cents, b.currency)}` : ''}` : (b.price_cents ? `Price: ${fmtMoney(b.price_cents, b.currency)} (pay on the day)` : ''),
  ].filter(Boolean).join('\n')
  const ev: any = {
    company_id: b.company_id,
    event_type: service?.kind === 'booking' ? 'booking' : 'appointment',
    title: `${b.service_name || 'Booking'} — ${b.customer_name || 'Customer'}`,
    starts_at: b.starts_at, ends_at: b.ends_at, is_all_day: false, status: 'confirmed',
    location_id: b.location_id || null, address: b.address || b.location_label || null,
    contact_id: contactId, conversation_id: conversationId, notes,
    external_source: 'booking', external_id: b.id,
    assigned_to_id: b.staff_id || null, assigned_to_name: b.staff_name || null,
    assignees: b.staff_id ? [{ id: b.staff_id, name: b.staff_name || '' }] : [],
    // Booking reminders come from the booking sweep, not the calendar's own.
    notify_customer: false, customer_contact_id: contactId,
  }
  let calendarEventId: string | null = null
  {
    const { data, error } = await db.from('calendar_events').insert(ev).select('id').maybeSingle()
    if (!error) calendarEventId = data?.id || null
    else {
      const { assigned_to_id, assigned_to_name, assignees, notify_customer, customer_contact_id, ...minimal } = ev
      void assigned_to_id; void assigned_to_name; void assignees; void notify_customer; void customer_contact_id
      const r2 = await db.from('calendar_events').insert(minimal).select('id').maybeSingle()
      calendarEventId = r2.data?.id || null
    }
  }
  await db.from('bookings').update({ contact_id: contactId, conversation_id: conversationId, calendar_event_id: calendarEventId }).eq('id', b.id)
  bk.calendar_event_id = calendarEventId

  const who = b.staff_name ? ` with ${b.staff_name}` : ''
  if (opts.quiet) {
    emitIntegrationEvent(b.company_id, 'booking.created', bookingEvent(bk, `New booking: ${b.service_name} · ${b.customer_name || 'a customer'}`), { db })
    return { ok: true }
  }
  await systemNote(db, bk, `📅 Booked online: ${b.service_name}${who} — ${whenText(b)}`)
  await notifyCompany({ db, companyId: b.company_id, type: 'booking', conversationId: conversationId || undefined, message: `📅 New booking: ${b.customer_name || 'A customer'} — ${b.service_name}${who}, ${whenText(b)}` })
  emitIntegrationEvent(b.company_id, 'booking.created', bookingEvent(bk, `New booking: ${b.service_name} · ${b.customer_name || 'a customer'}`), { db })
  await customerMessage(db, company, settings, bk, 'confirmed', { service, origin: opts.origin })
  return { ok: true }
}

// ── Refund / cancel / reschedule ─────────────────────────────────────────────

export async function refundBooking(db: any, company: any, b: any, cents: number | null): Promise<{ ok: boolean; refunded?: number; error?: string }> {
  try {
    if (!b.chat_payment_id) return { ok: false, error: 'No online payment on this booking' }
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', b.chat_payment_id).maybeSingle()
    if (!pay) return { ok: false, error: 'Payment record not found' }
    const { s, connectOpts } = await chatStripe(company)
    let pi: string | null = pay.stripe_payment_intent || b.stripe_payment_intent || null
    if (!pi && pay.stripe_session_id) {
      try { const sess: any = await s.checkout.sessions.retrieve(pay.stripe_session_id, {}, connectOpts); pi = (typeof sess?.payment_intent === 'string' ? sess.payment_intent : sess?.payment_intent?.id) || null } catch {}
    }
    if (!pi) return { ok: false, error: 'No Stripe payment reference' }
    const remaining = (pay.amount_cents || 0) - (pay.refunded_cents || 0)
    const amount = Math.min(remaining, cents ?? remaining)
    if (amount <= 0) return { ok: false, error: 'Nothing left to refund' }
    await s.refunds.create({ payment_intent: pi, amount }, connectOpts)
    const total = (pay.refunded_cents || 0) + amount
    const full = total >= (pay.amount_cents || 0)
    try { await db.from('chat_payments').update({ status: full ? 'refunded' : 'paid', refunded_cents: total, refunded_at: new Date().toISOString() }).eq('id', pay.id) }
    catch { try { await db.from('chat_payments').update({ status: full ? 'refunded' : 'paid' }).eq('id', pay.id) } catch {} }
    await db.from('bookings').update({ refunded_cents: total, payment_status: full ? 'refunded' : 'partially_refunded' }).eq('id', b.id)
    // A fully refunded booking is no longer revenue for the link that led to
    // it (same as /api/stripe/refund does for pay links). The booking itself
    // still counts as a booking.
    if (full) { try { await db.from('link_conversions').delete().eq('company_id', b.company_id).eq('order_id', `book_${b.id}`).eq('stage', 'paid') } catch {} }
    return { ok: true, refunded: amount }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Refund failed' }
  }
}

export function policyFor(b: any, settings: BookingSettings, now = Date.now()) {
  const startMs = Date.parse(b.starts_at)
  const cutoffMs = startMs - settings.cancel_hours * HOUR
  const beforeCutoff = now < cutoffMs
  const active = b.status === 'confirmed' && startMs > now
  const paid = b.payment_status === 'paid'
  return {
    cutoffMs,
    beforeCutoff,
    canCancel: active && (beforeCutoff || settings.late_cancel !== 'block'),
    canReschedule: active && settings.allow_reschedule && beforeCutoff,
    refundOnCancel: paid && beforeCutoff && settings.refund_on_cancel,
    paid,
  }
}

// `alsoCancelled`: later visits of the same regular booking cancelled with it
// (quietly) — the customer's one message says so.
export async function cancelBooking(db: any, bookingId: string, opts: { by: 'customer' | 'business'; reason?: string | null; refund: boolean; notifyCustomer: boolean; origin: string; alsoCancelled?: number; alsoCancelledEvents?: InviteEvent[] }): Promise<{ ok: boolean; refunded?: number; refundError?: string; error?: string }> {
  const ctx = await loadBookingCtx(db, bookingId)
  if (!ctx) return { ok: false, error: 'Booking not found' }
  const { b, company, service, settings } = ctx
  const patch = { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: opts.by, cancel_reason: (opts.reason || '').slice(0, 500) || null, updated_at: new Date().toISOString() }
  const { data: claimed } = await db.from('bookings').update(patch).eq('id', b.id).in('status', ['pending', 'confirmed']).select('id')
  if (!claimed?.length) return { ok: false, error: 'This booking is already cancelled or finished.' }
  const bk = { ...b, ...patch }

  let refunded = 0, refundError: string | undefined
  if (opts.refund && b.payment_status === 'paid') {
    const r = await refundBooking(db, company, bk, null)
    if (r.ok) refunded = r.refunded || 0; else refundError = r.error
  }
  if (b.calendar_event_id) { try { await db.from('calendar_events').update({ status: 'cancelled' }).eq('id', b.calendar_event_id) } catch {} }

  const refundTxt = refunded ? ` ${fmtMoney(refunded, b.currency)} refunded.` : ''
  await systemNote(db, bk, `❌ Booking cancelled by ${opts.by === 'customer' ? 'the customer' : 'the team'}: ${b.service_name} — ${whenText(b)}.${refundTxt}${bk.cancel_reason ? ` Reason: ${bk.cancel_reason}` : ''}`)
  if (opts.by === 'customer') {
    await notifyCompany({ db, companyId: b.company_id, type: 'booking', conversationId: b.conversation_id || undefined, message: `❌ ${b.customer_name || 'A customer'} cancelled ${b.service_name}, ${whenText(b)}.${refundTxt}` })
  }
  emitIntegrationEvent(b.company_id, 'booking.cancelled', bookingEvent(bk, `Booking cancelled: ${b.service_name} · ${b.customer_name || 'a customer'}`, {
    'Cancelled by': opts.by === 'customer' ? 'Customer' : 'Team', Reason: bk.cancel_reason, Refunded: refunded ? fmtMoney(refunded, b.currency) : null,
  }), { db })
  if (opts.notifyCustomer) await customerMessage(db, company, settings, bk, 'cancelled', { refunded, service, origin: opts.origin, alsoCancelled: opts.alsoCancelled, alsoCancelledEvents: opts.alsoCancelledEvents })
  return { ok: true, refunded, refundError }
}

export async function rescheduleBooking(db: any, bookingId: string, opts: { startMs: number; by: 'customer' | 'business'; notifyCustomer: boolean; origin: string }): Promise<{ ok: boolean; error?: string; status?: number }> {
  const ctx = await loadBookingCtx(db, bookingId)
  if (!ctx) return { ok: false, error: 'Booking not found' }
  const { b, company, service, settings } = ctx
  if (!service) return { ok: false, error: 'This service is no longer offered — please contact the business.' }
  if (b.status !== 'confirmed') return { ok: false, error: 'Only confirmed bookings can be moved.' }
  const tz = settings.timezone
  const staff = await loadStaff(db, company)
  const date = dateInTz(opts.startMs, tz)
  const staffFilter = b.staff_choice === 'specific' && b.staff_id ? b.staff_id : 'any'
  // The team can move a booking inside the customer-facing notice window.
  const svc = opts.by === 'business' ? { ...service, min_notice_mins: 0, max_days_ahead: 365 } : service
  const { slots } = await availability(db, { company, settings, service: svc, staff, staffFilter, fromDate: date, toDate: date, excludeBookingId: b.id, locationId: b.location_id })
  const slot = slots.find(s => s.start === opts.startMs)
  if (!slot) return { ok: false, error: 'Sorry, that time isn’t available. Please pick another.', status: 409 }
  const candidates = [...slot.resources].sort((x, y) => (x === b.staff_id ? -1 : 0) - (y === b.staff_id ? -1 : 0))

  const endMs = opts.startMs + service.duration_mins * MIN
  let moved: string | null = null, newStaff: string | null = null
  for (const cand of candidates) {
    const { data } = await db.rpc('claim_booking_slot', {
      p_company: b.company_id, p_service: b.service_id, p_staff: cand,
      p_starts: new Date(opts.startMs).toISOString(), p_ends: new Date(endMs).toISOString(),
      p_busy_from: new Date(opts.startMs - (service.buffer_before || 0) * MIN).toISOString(),
      p_busy_until: new Date(endMs + (service.buffer_after || 0) * MIN).toISOString(),
      p_capacity: service.capacity || 1,
      p_row: { staff_name: cand ? (staff.find(s => s.id === cand)?.name || '') : '' },
      p_exclude: b.id,
    })
    if (data) { moved = data as string; newStaff = cand; break }
  }
  if (!moved) return { ok: false, error: 'Sorry, that time was just taken. Please pick another.', status: 409 }

  const staffName = newStaff ? (staff.find(s => s.id === newStaff)?.name || null) : null
  const oldWhen = whenText(b)
  await db.from('bookings').update({ staff_name: staffName, reschedule_count: (b.reschedule_count || 0) + 1 }).eq('id', b.id)
  // New time → remind (and ask to confirm) again.
  try { await db.from('bookings').update({ reminder_24h_at: null, reminder_2h_at: null, customer_confirmed_at: null }).eq('id', b.id) } catch {}
  const { data: fresh } = await db.from('bookings').select('*').eq('id', b.id).maybeSingle()
  const bk = fresh || b
  if (b.calendar_event_id) {
    try {
      await db.from('calendar_events').update({
        starts_at: bk.starts_at, ends_at: bk.ends_at, status: 'confirmed', reminded_at: null, customer_reminded_at: null,
        assigned_to_id: newStaff, assigned_to_name: staffName, assignees: newStaff ? [{ id: newStaff, name: staffName || '' }] : [],
      }).eq('id', b.calendar_event_id)
    } catch {
      try { await db.from('calendar_events').update({ starts_at: bk.starts_at, ends_at: bk.ends_at }).eq('id', b.calendar_event_id) } catch {}
    }
  }
  await systemNote(db, bk, `🔁 Booking moved by ${opts.by === 'customer' ? 'the customer' : 'the team'}: ${b.service_name} — was ${oldWhen}, now ${whenText(bk)}`)
  if (opts.by === 'customer') {
    await notifyCompany({ db, companyId: b.company_id, type: 'booking', conversationId: b.conversation_id || undefined, message: `🔁 ${b.customer_name || 'A customer'} moved ${b.service_name} to ${whenText(bk)} (was ${oldWhen})` })
  }
  emitIntegrationEvent(b.company_id, 'booking.rescheduled', bookingEvent(bk, `Booking moved: ${b.service_name} · ${b.customer_name || 'a customer'}`, {
    Was: oldWhen, 'Moved by': opts.by === 'customer' ? 'Customer' : 'Team',
  }), { db })
  if (opts.notifyCustomer) await customerMessage(db, company, settings, bk, 'rescheduled', { service, origin: opts.origin })
  return { ok: true }
}

// ── One customer's bookings ──────────────────────────────────────────────────

/** The ways a number may have been typed ("0412 345 678", "+61412345678"…), for an exact match. */
export function phoneVariants(raw: string | null | undefined): string[] {
  const k = phoneKey(raw)
  if (k.length < 9) return []
  const [a, b, c] = [k.slice(0, 3), k.slice(3, 6), k.slice(6)]
  return [...new Set([`0${k}`, `+61${k}`, `61${k}`, k, `0${a} ${b} ${c}`, `+61 ${a} ${b} ${c}`, `0${a}-${b}-${c}`, String(raw || '').trim()].filter(Boolean))]
}

/**
 * A customer's bookings, by contact, email and phone — each an exact (or
 * indexed) lookup, never a pattern match across the whole business. Phone:
 * the usual spellings of the number, plus bookings linked to any contact with
 * that number (contacts.phone_norm, V359).
 */
export async function findCustomerBookings(db: any, companyId: string, who: { contactId?: string | null; email?: string | null; phone?: string | null }, opts: { fromIso: string; toIso?: string; statuses?: string[]; cols?: string; limit?: number }): Promise<any[]> {
  const cols = opts.cols || '*'
  const statuses = opts.statuses || ['confirmed', 'pending']
  const base = () => {
    let q = db.from('bookings').select(cols).eq('company_id', companyId).in('status', statuses).gte('starts_at', opts.fromIso)
    if (opts.toIso) q = q.lt('starts_at', opts.toIso)
    return q.order('starts_at', { ascending: true }).limit(opts.limit || 50)
  }
  const email = String(who.email || '').trim().toLowerCase()
  const key = phoneKey(who.phone)
  const contactIds = new Set<string>(who.contactId ? [who.contactId] : [])
  if (key.length >= 9) {
    try {
      const { data, error } = await db.from('contacts').select('id').eq('company_id', companyId).eq('phone_norm', key).limit(20)
      if (!error) for (const c of data || []) contactIds.add(c.id)
    } catch {}
  }
  const reads: PromiseLike<any>[] = []
  if (contactIds.size) reads.push(base().in('contact_id', [...contactIds]))
  if (email) reads.push(base().ilike('customer_email', ilikeExact(email)))
  if (key.length >= 9) reads.push(base().in('customer_phone', phoneVariants(who.phone)))
  const found = new Map<string, any>()
  for (const r of await Promise.all(reads)) for (const b of r?.data || []) found.set(b.id, b)
  return [...found.values()]
    .filter(b => (b.contact_id && contactIds.has(b.contact_id)) || (email && String(b.customer_email || '').toLowerCase() === email) || (key.length >= 9 && phoneKey(b.customer_phone) === key))
    .sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at))
}

/**
 * Send a booking's manage link to the phone or email ON THE BOOKING (never to
 * whoever asked for it): a text through the consent-checked send route, else
 * an email. Returns where it went, or null.
 */
export async function sendManageLink(db: any, company: any, b: any, origin: string): Promise<'sms' | 'email' | null> {
  if (!company || !b?.manage_token) return null
  if (await isExternalSendBlocked(company.id, db)) return null
  const settings = resolveBookingSettings(company.booking_settings)
  const tz = b.timezone || settings.timezone
  const url = manageUrl(company, b.manage_token)
  const first = String(b.customer_name || '').trim().split(/\s+/)[0] || 'there'
  const text = `Hi ${first}, here's the link to view, move or cancel your ${b.service_name} booking at ${company.name} on ${fmtDateTime(Date.parse(b.starts_at), tz)}: ${url}`
  if (b.customer_phone && settings.notify_sms) {
    try {
      // /api/telnyx/sms/send checks the opt-out (lib/sms-consent) for internal calls.
      const r = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: company.id, conversationId: b.conversation_id || undefined, to: b.customer_phone, text, senderName: company.name }),
      })
      if (r.ok) return 'sms'
    } catch (e) { console.error('[booking] manage link sms failed', e) }
  }
  if (b.customer_email) {
    const ok = await sendCustomerEmail(db, company, {
      to: b.customer_email, subject: `Your booking: ${b.service_name}`, text,
      html: `<p style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;color:#111;line-height:1.55">${esc(text.replace(url, ''))}<a href="${esc(url)}">${esc(url)}</a></p>`,
    })
    if (ok) return 'email'
  }
  return null
}

// ── Regular bookings (repeat a booking every N weeks) ───────────────────────
//
// Fortnightly tank maintenance and the like: the team repeats a booking at the
// same wall-clock time (10am stays 10am across daylight saving) every N weeks.
// Each visit is a normal booking — its own reminders, manage link, calendar
// event — joined by bookings.series_id (V388). A dry run shows which dates are
// free first; taken, closed or too-far-ahead dates are skipped, and so is any
// date this customer is already booked at (so repeating twice, or extending a
// series, never books them twice). A visit already in a series can only be
// repeated from the series' last visit ("extend").

export type RepeatPlanItem = { start: string; ok: boolean; reason?: string; staff_name?: string | null; created?: boolean }
export const MAX_REPEAT = 26

export async function repeatBooking(db: any, bookingId: string, opts: { everyWeeks: number; count: number; dryRun: boolean; notifyCustomer: boolean; origin: string; now?: number }): Promise<{ ok: boolean; error?: string; plan: RepeatPlanItem[]; created: number; seriesId?: string | null }> {
  const ctx = await loadBookingCtx(db, bookingId)
  if (!ctx) return { ok: false, error: 'Booking not found', plan: [], created: 0 }
  const { b, company, service, settings } = ctx
  if (!service) return { ok: false, error: 'This service no longer exists.', plan: [], created: 0 }
  if (!['confirmed', 'completed'].includes(b.status)) return { ok: false, error: 'Only a confirmed or completed booking can be repeated.', plan: [], created: 0 }
  const every = clampInt(opts.everyWeeks, 1, 12, 2)
  const count = clampInt(opts.count, 1, MAX_REPEAT, 6)
  const tz = b.timezone && isValidTimeZone(b.timezone) ? b.timezone : settings.timezone
  const now = opts.now ?? Date.now()

  // In a series already: only from its last live visit (that extends it).
  if (b.series_id) {
    const { data: later } = await db.from('bookings').select('id, starts_at').eq('company_id', b.company_id).eq('series_id', b.series_id)
      .in('status', ['confirmed', 'pending']).gt('starts_at', b.starts_at).order('starts_at', { ascending: false }).limit(1)
    if (later?.length) return { ok: false, error: `This visit is part of a regular booking. Extend it from its last visit (${fmtDateTime(Date.parse(later[0].starts_at), tz)}).`, plan: [], created: 0 }
  }

  const origStart = Date.parse(b.starts_at)
  const z = zonedParts(origStart, tz)
  const hhmm = `${String(z.h).padStart(2, '0')}:${String(z.mi).padStart(2, '0')}`
  const day0 = dateInTz(origStart, tz)
  const durMs = service.duration_mins * MIN
  const staff = await loadStaff(db, company)
  // The team books these, so the customer-facing notice doesn't apply; how far
  // ahead the service can be booked still does.
  const svc = { ...service, min_notice_mins: 0, max_days_ahead: 400 }
  const maxDays = Math.max(1, service.max_days_ahead || 60)
  const latest = now + maxDays * 86_400_000
  const closed = new Map(settings.closed.map(c => [c.date, c.label]))

  // Dates: every N weeks after the original, the first `count` still to come.
  const dates: string[] = []
  for (let k = 1; dates.length < count && k < count + 60; k++) {
    const d = addDays(day0, 7 * every * k)
    if (zonedToUtc(d, hhmm, tz) > now) dates.push(d)
  }
  if (!dates.length) return { ok: true, plan: [], created: 0 }
  const lastMs = zonedToUtc(dates[dates.length - 1], hhmm, tz) + durMs

  // This customer's live bookings over the whole stretch (any person, any
  // service): a date they're already booked at is skipped.
  const theirs = await findCustomerBookings(db, b.company_id, { contactId: b.contact_id, email: b.customer_email, phone: b.customer_phone }, {
    fromIso: new Date(now - 86_400_000).toISOString(), toIso: new Date(lastMs + 86_400_000).toISOString(),
    statuses: ['confirmed', 'pending'], cols: 'id, starts_at, ends_at, status, hold_expires_at, contact_id, customer_email, customer_phone, series_id', limit: 500,
  }).catch(() => [] as any[])
  const nowIso = new Date().toISOString()
  const liveTheirs = theirs.filter(x => x.id !== b.id && (x.status === 'confirmed' || (x.hold_expires_at && x.hold_expires_at > nowIso)))

  const outletIds = new Set<string>((await loadLocations(db, b.company_id)).map((l: any) => l.id))
  type Item = RepeatPlanItem & { resources: (string | null)[] }
  const plan: Item[] = await Promise.all(dates.map(async (d): Promise<Item> => {
    const startMs = zonedToUtc(d, hhmm, tz)
    const item: Item = { start: new Date(startMs).toISOString(), ok: false, resources: [] }
    if (startMs > latest) { item.reason = `Further ahead than ${service.name} can be booked (${maxDays} days)`; return item }
    if (closed.has(d)) { item.reason = `Closed${closed.get(d) ? `: ${closed.get(d)}` : ''}`; return item }
    if (liveTheirs.some(x => Date.parse(x.starts_at) < startMs + durMs && Date.parse(x.ends_at) > startMs)) { item.reason = 'Already booked in then'; return item }
    // Same person first (customers like their usual tech); anyone else who
    // works at that outlet only if they didn't ask for someone.
    const { slots } = await availability(db, { company, settings, service: svc, staff, staffFilter: 'any', fromDate: d, toDate: d })
    const free = slots.find(s => s.start === startMs)?.resources || []
    const usual = b.staff_id ?? null
    let resources: (string | null)[] = free.includes(usual) ? [usual] : []
    if (!resources.length && b.staff_choice !== 'specific') {
      const here = free.filter(id => !id || service.location_mode !== 'outlet' || worksAt(settings, id, b.location_id, outletIds))
      resources = here.length ? here : free
    }
    if (!resources.length) item.reason = free.length ? `${b.staff_name || 'The usual person'} isn’t free` : 'Already booked or outside hours'
    else { item.ok = true; item.resources = resources; item.staff_name = resources[0] ? (staff.find(s => s.id === resources[0])?.name || null) : null }
    return item
  }))
  const out = () => plan.map(({ resources, ...rest }) => { void resources; return rest })
  if (opts.dryRun) return { ok: true, plan: out(), created: 0 }

  // One id joins the series (V388); the first visit is set only once a
  // repeat really booked. Before V388 the visits are still booked, unlinked.
  let seriesId: string | null = b.series_id || crypto.randomUUID()
  let created = 0
  const answers = Array.isArray(b.answers) ? b.answers : []
  for (const item of plan) {
    if (!item.ok) continue
    try {
      const startMs = Date.parse(item.start)
      const endMs = startMs + durMs
      let id: string | null = null, who: string | null = null
      for (const cand of item.resources) {
        const staffName = cand ? (staff.find(s => s.id === cand)?.name || null) : null
        const { data, error } = await db.rpc('claim_booking_slot', {
          p_company: b.company_id, p_service: service.id, p_staff: cand,
          p_starts: new Date(startMs).toISOString(), p_ends: new Date(endMs).toISOString(),
          p_busy_from: new Date(startMs - (service.buffer_before || 0) * MIN).toISOString(),
          p_busy_until: new Date(endMs + (service.buffer_after || 0) * MIN).toISOString(),
          p_capacity: service.capacity || 1,
          p_row: {
            service_name: service.name, staff_name: staffName, staff_choice: b.staff_choice || 'any',
            location_id: b.location_id || '', location_label: b.location_label, address: b.address,
            timezone: tz, status: 'pending', hold_expires_at: new Date(Date.now() + INSTANT_HOLD_MINS * MIN).toISOString(), seats: 1,
            customer_name: b.customer_name, customer_email: b.customer_email, customer_phone: b.customer_phone,
            customer_timezone: b.customer_timezone, answers, notes: b.notes,
            price_cents: service.price_cents || 0, amount_due_cents: 0, currency: service.currency || b.currency || 'aud',
            payment_mode: 'none', payment_status: 'none',
            manage_token: crypto.randomBytes(24).toString('base64url'), source: 'repeat',
          },
          p_exclude: null,
        })
        if (error) throw error
        if (data) { id = data as string; who = staffName; break }
      }
      if (!id) { item.ok = false; item.reason = 'Just taken'; continue }
      const link: any = { contact_id: b.contact_id || null, conversation_id: b.conversation_id || null }
      if (seriesId) {
        const { error } = await db.from('bookings').update({ ...link, series_id: seriesId }).eq('id', id)
        if (error) { seriesId = null; await db.from('bookings').update(link).eq('id', id) }
      } else await db.from('bookings').update(link).eq('id', id)
      const conf = await confirmBooking(db, id, { origin: opts.origin, quiet: true })
      if (!conf.ok) {
        try { await db.from('bookings').update({ status: 'expired' }).eq('id', id).eq('status', 'pending') } catch {}
        item.ok = false; item.reason = 'Couldn’t confirm it'; continue
      }
      item.created = true
      item.staff_name = who
      created++
    } catch (e: any) {
      console.error('[booking] repeat visit failed', item.start, e?.message || e)
      item.ok = false; item.reason = 'Couldn’t book it — try again'
    }
  }

  if (created) {
    if (seriesId && !b.series_id) { try { await db.from('bookings').update({ series_id: seriesId }).eq('id', b.id) } catch {} }
    const made = plan.filter(p => p.created)
    const list = made.map(p => fmtDateTime(Date.parse(p.start), tz)).join(', ')
    const skipped = plan.filter(p => !p.created).length
    const freq = every === 1 ? 'every week' : `every ${every} weeks`
    await systemNote(db, b, `Regular booking set up: ${b.service_name}, ${freq}. ${made.length} visit${made.length === 1 ? '' : 's'} booked: ${list}.${skipped ? ` ${skipped} date${skipped === 1 ? ' was' : 's were'} skipped (not free).` : ''}`)
    if (opts.notifyCustomer) {
      const { data: rows } = await db.from('bookings').select('id, starts_at, ends_at, reschedule_count, manage_token').eq('company_id', b.company_id).eq('source', 'repeat').in('starts_at', made.map(p => p.start)).eq('status', 'confirmed')
      const mine = (rows || []).filter((r: any) => made.some(p => p.start === r.starts_at || Date.parse(p.start) === Date.parse(r.starts_at)))
      await seriesMessage(db, company, settings, b, made.map(p => Date.parse(p.start)), every, service, opts.origin, mine)
    }
  } else seriesId = b.series_id || null
  return { ok: true, plan: out(), created, seriesId: created ? seriesId : (b.series_id || null) }
}

// One message for a whole series: the dates (with a calendar file holding
// every visit), and that each gets a reminder.
async function seriesMessage(db: any, company: any, settings: BookingSettings, b: any, starts: number[], every: number, service: any, origin: string, visits: any[] = []): Promise<{ sms: boolean; email: boolean }> {
  const sent = { sms: false, email: false }
  if (!company || !starts.length) return sent
  if (await isExternalSendBlocked(company.id, db)) return sent
  const tz = b.timezone || settings.timezone
  const business = company.name || 'us'
  const first = String(b.customer_name || '').trim().split(/\s+/)[0] || 'there'
  const freq = every === 1 ? 'every week' : `every ${every} weeks`
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  const sameTime = starts.every(ms => fmtTime(ms, tz) === fmtTime(starts[0], tz))
  // "Tue 6 Oct, Tue 20 Oct and Tue 3 Nov" / "…, Tue 3 Nov, Tue 17 Nov and 2 more"
  const firstFew = starts.slice(0, 4).map(day)
  const shown = starts.length > 4 ? `${firstFew.join(', ')} and ${starts.length - 4} more`
    : firstFew.length > 1 ? `${firstFew.slice(0, -1).join(', ')} and ${firstFew[firstFew.length - 1]}` : firstFew[0]
  const where = whereText(b, service)
  const smsText = `Hi ${first}, your regular ${b.service_name} at ${business} is booked ${freq}: ${shown}${sameTime ? `, at ${fmtTime(starts[0], tz)}` : ''}.${where ? ` ${where}.` : ''} We'll text a reminder before each visit.`
  if (settings.notify_sms && b.customer_phone) {
    try {
      // /api/telnyx/sms/send checks the opt-out (lib/sms-consent) for internal calls.
      const r = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: company.id, conversationId: b.conversation_id || undefined, to: b.customer_phone, text: smsText, senderName: business }),
      })
      sent.sms = r.ok
    } catch (e) { console.error('[booking] series sms failed', e) }
  }
  if (settings.notify_email && b.customer_email) {
    const hideBadge = await hidesPoweredBy(db, company.id, company)
    const rows = starts.map(ms => `<tr><td style="padding:8px 0;color:#111;font-weight:600;border-top:1px solid #f1f1f1">${esc(fmtDateTime(ms, tz, { withTz: true }))}</td></tr>`).join('')
    const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #eee">
    ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" style="height:36px;margin-bottom:14px">` : `<div style="font-weight:800;font-size:16px;margin-bottom:14px">${esc(business)}</div>`}
    <h1 style="margin:0 0 8px;font-size:22px;color:#111">Your regular booking</h1>
    <p style="margin:0 0 18px;color:#4b5563;font-size:14.5px;line-height:1.55">Hi ${esc(first)}, your ${esc(b.service_name)} with ${esc(business)} is booked ${esc(freq)}${where ? ` at ${esc(where)}` : ''}. We’ll send a reminder before each visit, with a link to move or cancel it.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:14px">${esc(business)}${hideBadge ? '' : ' · Powered by Colvy'}</p>
</div></body></html>`
    const text = `Your regular booking\n\n${b.service_name}, ${freq}${where ? ` at ${where}` : ''}:\n${starts.map(ms => fmtDateTime(ms, tz, { withTz: true })).join('\n')}\n\nWe'll send a reminder before each visit.`
    // Every visit in one calendar file, each with its own manage link.
    const events = visits.map(v => {
      const url = manageUrl(company, v.manage_token)
      return { uid: v.id, title: `${b.service_name} — ${business}`, startMs: Date.parse(v.starts_at), endMs: Date.parse(v.ends_at), location: where || null, description: `Manage this visit: ${url}`, url, sequence: v.reschedule_count || 0 }
    })
    sent.email = await sendCustomerEmail(db, company, {
      to: b.customer_email, subject: `Your regular ${b.service_name}: ${freq}`, html, text,
      attachments: events.length ? [{ filename: 'regular-booking.ics', content: Buffer.from(buildIcsMany(events)).toString('base64') }] : [],
    })
  }
  return sent
}

// ── Customer messages (SMS + email with calendar invite) ─────────────────────

export type MsgKind = 'confirmed' | 'cancelled' | 'rescheduled' | 'conflict' | 'reminder' | 'noshow' | 'rebook'

// "today at 10:00am" / "tomorrow at 10:00am" / "Tue 7 Oct, 10:00am AEDT".
function relWhen(b: any) {
  const tz = b.timezone || 'Australia/Melbourne'
  const start = Date.parse(b.starts_at)
  const day = dateInTz(start, tz), today = dateInTz(Date.now(), tz)
  const t = new Date(start).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  if (day === today) return `today at ${t}`
  if (day === addDays(today, 1)) return `tomorrow at ${t}`
  return whenText(b)
}

// SMS + email to the customer for every step of a booking's life. Returns
// which channels went out. `channels` narrows it (e.g. the 2-hour reminder is
// SMS only).
export async function customerMessage(db: any, company: any, settings: BookingSettings, b: any, kind: MsgKind,
  extra: { service?: any; refunded?: number | boolean; origin?: string; channels?: ('sms' | 'email')[]; alsoCancelled?: number; alsoCancelledEvents?: InviteEvent[] }): Promise<{ sms: boolean; email: boolean }> {
  const sent = { sms: false, email: false }
  if (!company) return sent
  if (await isExternalSendBlocked(company.id, db)) return sent
  const hideBadge = await hidesPoweredBy(db, company.id, company)
  const allow = (c: 'sms' | 'email') => !extra.channels || extra.channels.includes(c)
  const business = company.name || 'us'
  const first = String(b.customer_name || '').trim().split(/\s+/)[0] || 'there'
  const when = whenText(b)
  const rel = relWhen(b)
  const who = b.staff_name ? ` with ${b.staff_name}` : ''
  const where = whereText(b, extra.service)
  // Tracked short links (same one in the SMS and the email), so the inbox card
  // shows when the customer opened their booking.
  const short = async (url: string, type: string) => {
    try {
      const s = await shortenUrl(url, { companyId: company.id, conversationId: b.conversation_id || undefined, kind: 'booking' })
      const code = s && s !== url ? (s.split('/l/')[1] || '') : ''
      if (code) await db.from('short_links').update({ link_type: type, contact_id: b.contact_id || null, conversation_id: b.conversation_id || null, channel: 'booking' }).eq('code', code)
      return s || url
    } catch { return url }
  }
  const live = kind === 'confirmed' || kind === 'rescheduled' || kind === 'reminder'
  const manage = live ? await short(manageUrl(company, b.manage_token), 'booking') : manageUrl(company, b.manage_token)
  const rebook = live ? bookingPageUrl(company, extra.service?.active ? extra.service.slug : undefined) : await short(bookingPageUrl(company, extra.service?.active ? extra.service.slug : undefined), 'booking')
  const refundAmt = typeof extra.refunded === 'number' ? extra.refunded : 0
  const refundLine = (refundAmt ? ` We've refunded ${fmtMoney(refundAmt, b.currency)}.` : (extra.refunded === true ? ' Your payment has been refunded.' : ''))
    + (kind === 'cancelled' && extra.alsoCancelled ? ` Your ${extra.alsoCancelled} later visit${extra.alsoCancelled === 1 ? '' : 's'} in this series ${extra.alsoCancelled === 1 ? 'is' : 'are'} cancelled too.` : '')

  const sms: Record<MsgKind, string> = {
    confirmed: `Hi ${first}, you're booked for ${b.service_name}${who} at ${business} on ${when}.${where ? ` ${where}.` : ''} Manage or reschedule: ${manage}`,
    rescheduled: `Hi ${first}, your ${b.service_name} booking at ${business} is now ${when}${who}. Manage: ${manage}`,
    cancelled: `Hi ${first}, your ${b.service_name} booking at ${business} on ${when} has been cancelled.${refundLine} Book again: ${rebook}`,
    conflict: `Hi ${first}, sorry — the ${b.service_name} time you chose at ${business} (${when}) was taken before your payment finished.${refundLine} Please pick another time: ${rebook}`,
    reminder: `Reminder: ${b.service_name}${who} at ${business} ${rel}.${where ? ` ${where}.` : ''} Reply C to confirm or R to reschedule. ${manage}`,
    noshow: `Hi ${first}, we missed you at your ${b.service_name} with ${business} today. Want to pick another time? ${rebook}`,
    rebook: `Hi ${first}, it's been a while since your ${b.service_name} at ${business} — ready for the next one? Book a time: ${rebook}`,
  }

  const origin = extra.origin || String(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

  // Opted out (replied STOP) or blocked → no texts. Marketing-flavoured
  // nudges (rebook) also skip email for them.
  let optedOut = false
  if (b.contact_id) {
    try { const { data: ct } = await db.from('contacts').select('unsubscribed_at, is_blocked').eq('id', b.contact_id).maybeSingle(); optedOut = !!(ct?.unsubscribed_at || ct?.is_blocked) } catch {}
  }

  if (settings.notify_sms && allow('sms') && b.customer_phone && !optedOut) {
    try {
      const r = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId: company.id, conversationId: b.conversation_id || undefined, to: b.customer_phone, text: sms[kind], senderName: business }),
      })
      sent.sms = r.ok
    } catch (e) { console.error('[booking] sms failed', e) }
  }

  if (settings.notify_email && allow('email') && b.customer_email && !(kind === 'rebook' && optedOut)) {
    const subjects: Record<MsgKind, string> = {
      confirmed: `Booking confirmed: ${b.service_name}, ${when}`,
      rescheduled: `Booking moved: ${b.service_name}, now ${when}`,
      cancelled: `Booking cancelled: ${b.service_name}, ${when}`,
      conflict: `Please choose another time: ${b.service_name}`,
      reminder: `Reminder: ${b.service_name} ${rel}`,
      noshow: `We missed you — book another time?`,
      rebook: `Time for your next ${b.service_name}?`,
    }
    const headlines: Record<MsgKind, string> = {
      confirmed: 'You’re booked in ✓', rescheduled: 'Your booking has moved', cancelled: 'Your booking is cancelled', conflict: 'That time was just taken',
      reminder: `See you ${rel.replace(/ at .*/, '')}`, noshow: 'We missed you', rebook: 'Ready for the next one?',
    }
    const invite = {
      uid: b.id, title: `${b.service_name} — ${business}`, startMs: Date.parse(b.starts_at), endMs: Date.parse(b.ends_at),
      location: where || null, description: `Manage your booking: ${manage}`, url: manage,
      cancelled: kind === 'cancelled' || kind === 'conflict', sequence: (b.reschedule_count || 0) + (kind === 'cancelled' ? 1 : 0),
    }
    const accent = /^#[0-9a-f]{6}$/i.test(company.accent_color || '') ? company.accent_color : '#ff7a6b'
    const rows: [string, string][] = kind === 'noshow' || kind === 'rebook' ? [] : [
      ['What', b.service_name + who],
      ['When', when],
      ...(where ? [['Where', where] as [string, string]] : []),
      ...(b.amount_due_cents && b.payment_status !== 'none' ? [[b.payment_mode === 'deposit' ? 'Deposit' : 'Paid', fmtMoney(b.amount_due_cents, b.currency)] as [string, string]] : []),
    ]
    const intro: Record<MsgKind, string> = {
      confirmed: `Hi ${esc(first)}, thanks for booking with ${esc(business)}. Here are your details.`,
      rescheduled: `Hi ${esc(first)}, your booking with ${esc(business)} has a new time.`,
      cancelled: `Hi ${esc(first)}, your booking with ${esc(business)} has been cancelled.${esc(refundLine)}`,
      conflict: `Hi ${esc(first)}, sorry — someone else booked this time before your payment finished.${esc(refundLine)}`,
      reminder: `Hi ${esc(first)}, a quick reminder of your booking with ${esc(business)}. Need to change it? Use the button below.`,
      noshow: `Hi ${esc(first)}, we missed you at your ${esc(b.service_name)} today. No worries — pick another time that suits you.`,
      rebook: `Hi ${esc(first)}, it’s been a while since your ${esc(b.service_name)} with ${esc(business)}. Book your next one in a few taps.`,
    }
    const buttons = live
      ? `<a href="${manage}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;margin:0 8px 8px 0">${kind === 'reminder' ? 'View or change' : 'Manage booking'}</a>${kind === 'reminder' ? '' : `<a href="${googleCalendarUrl(invite)}" style="display:inline-block;background:#fff;color:#111;border:1px solid #e5e7eb;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px;margin:0 8px 8px 0">Add to Google Calendar</a>`}`
      : `<a href="${rebook}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px">${kind === 'cancelled' || kind === 'conflict' ? 'Book another time' : 'Book now'}</a>`
    const note = (kind === 'confirmed' || kind === 'reminder') && settings.confirmation_note ? `<p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.55;white-space:pre-line">${esc(settings.confirmation_note)}</p>` : ''
    const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #eee">
    ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" style="height:36px;margin-bottom:14px">` : `<div style="font-weight:800;font-size:16px;margin-bottom:14px">${esc(business)}</div>`}
    <h1 style="margin:0 0 8px;font-size:22px;color:#111">${headlines[kind]}</h1>
    <p style="margin:0 0 18px;color:#4b5563;font-size:14.5px;line-height:1.55">${intro[kind]}</p>
    ${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;border-top:1px solid #f1f1f1">${k}</td><td style="padding:8px 0;color:#111;font-weight:600;border-top:1px solid #f1f1f1">${esc(v)}</td></tr>`).join('')}
    </table>` : ''}
    ${buttons}
    ${note}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:14px">${esc(business)}${hideBadge ? '' : ' · Powered by Colvy'}</p>
</div></body></html>`
    const text = `${headlines[kind]}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${live ? `Manage your booking: ${manage}` : `Book: ${rebook}`}`
    const withIcs = kind === 'confirmed' || kind === 'rescheduled' || kind === 'cancelled'
    sent.email = await sendCustomerEmail(db, company, {
      to: b.customer_email, subject: subjects[kind], html, text,
      attachments: withIcs ? [{ filename: kind === 'cancelled' ? 'cancelled.ics' : 'booking.ics', content: Buffer.from(kind === 'cancelled' && extra.alsoCancelledEvents?.length ? buildIcsMany([invite, ...extra.alsoCancelledEvents], true) : buildIcs(invite)).toString('base64') }] : [],
    })
  }
  return sent
}

const esc = (s: string) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])

// ── Public view of one booking (manage page) ─────────────────────────────────

export function publicBooking(b: any, company: any, service: any, settings: BookingSettings, hidePoweredBy = false) {
  const pol = policyFor(b, settings)
  const holdLive = b.status === 'pending' && b.hold_expires_at && Date.parse(b.hold_expires_at) > Date.now()
  return {
    id: b.id,
    status: b.status === 'pending' && !holdLive ? 'expired' : b.status,
    service: { id: service?.id || null, name: b.service_name, slug: service?.slug || null, duration_mins: service?.duration_mins || Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / MIN), location_mode: service?.location_mode || 'outlet' },
    staff_name: b.staff_name,
    staff_choice: b.staff_choice,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    timezone: b.timezone || settings.timezone,
    where: whereText(b, service),
    customer_name: b.customer_name,
    price_cents: b.price_cents,
    amount_due_cents: b.amount_due_cents,
    currency: b.currency,
    payment_mode: b.payment_mode,
    payment_status: b.payment_status,
    refunded_cents: b.refunded_cents,
    hold_expires_at: holdLive ? b.hold_expires_at : null,
    cancelled_by: b.cancelled_by,
    cancel_reason: b.status === 'cancelled' ? b.cancel_reason : null,
    policy: { ...pol, cancel_hours: settings.cancel_hours, late_cancel: settings.late_cancel, refund_on_cancel: settings.refund_on_cancel },
    confirmation_note: settings.confirmation_note,
    company: { name: company.name, slug: company.slug, logo_url: company.logo_url, accent_color: company.accent_color, hide_powered_by: hidePoweredBy },
    book_again_url: bookingPageUrl(company, service?.active ? service.slug : undefined),
  }
}

export function publicService(s: any) {
  return {
    id: s.id, name: s.name, slug: s.slug, description: s.description, kind: s.kind,
    duration_mins: s.duration_mins, capacity: s.capacity, price_cents: s.price_cents,
    payment_mode: s.payment_mode, deposit_cents: s.deposit_cents, currency: s.currency,
    location_mode: s.location_mode, location_ids: s.location_ids || [], staff_ids: s.staff_ids || [],
    questions: s.questions || [], color: s.color, image_url: s.image_url,
    max_days_ahead: s.max_days_ahead, min_notice_mins: s.min_notice_mins,
  }
}


// ── Payment settled (webhook or return-page verify) ──────────────────────────

// Called with a completed Checkout session for a booking. Confirms the booking
// first (so the conversation exists), then marks the chat_payments row paid
// through the shared helper, which posts "Payment received" into that thread.
export async function settleBookingPayment(db: any, bookingId: string, session: any, origin: string) {
  const pi = (typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id) || null
  const res = await confirmBooking(db, bookingId, { origin, paid: true, paymentIntent: pi })
  const { data: b } = await db.from('bookings').select('chat_payment_id, conversation_id, company_id').eq('id', bookingId).maybeSingle()
  if (b?.chat_payment_id) {
    const { data: pay } = await db.from('chat_payments').select('id, company_id, conversation_id, message_id, amount_cents').eq('id', b.chat_payment_id).maybeSingle()
    if (pay) {
      const card = session?.payment_intent?.latest_charge?.payment_method_details?.card || null
      const { confirmChatPayment } = await import('@/lib/chat-payment-confirm')
      await confirmChatPayment(db, { ...pay, conversation_id: pay.conversation_id || b.conversation_id || null }, {
        receiptUrl: session?.receipt_url || null, paymentIntent: pi, cardBrand: card?.brand || null, cardLast4: card?.last4 || null,
      })
    }
  }
  return res
}

// ── Personal booking links (invites) ─────────────────────────────────────────

export async function loadInvite(db: any, token: string | null | undefined) {
  if (!token || token.length < 16 || token.length > 80) return null
  try {
    const { data } = await db.from('booking_invites').select('*').eq('token', token).maybeSingle()
    if (!data || Date.parse(data.expires_at) < Date.now()) return null
    return data
  } catch { return null }
}

// What the booking page pre-fills from an invite.
export async function invitePrefill(db: any, inv: any) {
  if (!inv?.contact_id) return { name: '', email: '', phone: '', serviceId: inv?.service_id || null }
  const { data: c } = await db.from('contacts').select('name, email, phone').eq('id', inv.contact_id).eq('company_id', inv.company_id).maybeSingle()
  return { name: c?.name || '', email: c?.email || '', phone: c?.phone || '', serviceId: inv.service_id || null }
}

export async function createInvite(db: any, opts: { companyId: string; contactId?: string | null; conversationId?: string | null; serviceId?: string | null; userId?: string | null }) {
  const token = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await db.from('booking_invites').insert({
    token, company_id: opts.companyId, contact_id: opts.contactId || null, conversation_id: opts.conversationId || null,
    service_id: opts.serviceId || null, created_by: opts.userId || null,
  }).select('*').maybeSingle()
  if (error) throw error
  return data
}
