import crypto from 'crypto'
import { internalHeaders } from '@/lib/internal-call'
// Booking waitlist — server core. Needs COLVY_V400_BOOKING_WAITLIST.sql;
// before it runs every entry point here answers "not available" instead of
// failing. The rules (matching, sending hours, wording) are pure, in
// lib/booking-waitlist-rules.ts; the hooks lib/booking.ts calls are in
// lib/booking-waitlist-queue.ts.
//
//   Join      The public booking page (/api/book/waitlist): name, mobile,
//             optional email, the service, specific days or a date range and
//             morning / afternoon / any. Express consent to be texted about a
//             freed spot is recorded (the entry's consent_* columns plus a
//             consent_events row on their contact) — it's for this purpose
//             only, so marketing consent is left alone.
//   Freed     A cancellation, a move, a released or lapsed unpaid hold, the
//             team opening more hours, or the team offering a time by hand
//             queues a booking_waitlist_jobs row. processWaitlistJobs() (after
//             the response, and every 5 minutes from
//             /api/cron/booking-waitlist) claims each job atomically
//             (UPDATE … WHERE status = 'queued' RETURNING), works out which
//             times are now free and who wants them, and offers them.
//   Offer     "First to claim" (default): up to N people (3) get a link at
//             once; the first to book gets it. "In order": one person at a
//             time, the time held for them (a pending booking, source
//             'waitlist_hold') for X minutes (15), then the next person.
//             Only inside sending hours (9am–8pm business time, the campaign
//             and rebook-nudge window); a time freed overnight waits for the
//             morning and is offered then only if it's still at least the
//             minimum notice away. One offer per person per time (unique in
//             the database), at most `max_per_day` a day, and in first-to-claim
//             mode nobody is offered another time within 30 minutes of the
//             last. Texts go through /api/telnyx/sms/send (opt-out check,
//             SMS billing, tracked links, logged in their thread) after our
//             own opt-out check; an email goes instead when the text can't.
//   Claim     The link opens the normal booking page on that time
//             (?offer=<token>): deposits and payment apply as usual and the
//             booking is made through createBooking (claim_booking_slot), so
//             two people tapping at once can't both get it. The loser is told
//             it's gone and stays on the list.

import {
  resolveBookingSettings, loadStaff, availability, bookingPageUrl, PUBLIC_COMPANY_COLS, slotService,
  type BookingSettings,
} from '@/lib/booking'
import { addDays, dateInTz, fmtDateTime, zonedToUtc } from '@/lib/booking-time'
import {
  entryWantsSlot, entryExpiry, cleanWaitlistDates, describeWants, offerSms, withinHours, nextWindowOpen,
  LIVE_ENTRY, FIRST_MODE_COOLDOWN_MINS, CONSENT_TEXT, MAX_RANGE_DAYS,
} from '@/lib/booking-waitlist-rules'
import { isMissingWaitlist, queueWaitlistJob, WAITLIST_MIGRATION_HINT } from '@/lib/booking-waitlist-queue'
import { QUIET_START, QUIET_END } from '@/lib/campaign-sender'
import { textOptOut } from '@/lib/sms-consent'
import { sendCustomerEmail } from '@/lib/customer-email'
import { shortenUrl } from '@/lib/short-link'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { notifyCompany } from '@/lib/notify'
import { phoneKey, toE164 } from '@/lib/phone'
import { ensureContactByPhone } from '@/lib/contact-capture'

export { isMissingWaitlist, WAITLIST_MIGRATION_HINT }

const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const esc = (s: string) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
const newToken = () => crypto.randomBytes(18).toString('base64url')

// ── What sending needs (swappable in tests) ─────────────────────────────────

export type WaitlistDeps = {
  now: () => number
  /** Text through the consent-checked, billed send route. */
  sendSms: (a: { company: any; to: string; text: string; conversationId?: string | null }) => Promise<{ ok: boolean; optedOut?: boolean; error?: string }>
  sendEmail: (a: { company: any; to: string; subject: string; html: string; text: string }) => Promise<boolean>
  /** A tracked short link (same helper as the booking reminders). */
  shorten: (url: string, a: { companyId: string; conversationId?: string | null }) => Promise<string>
  externalBlocked: (companyId: string) => Promise<boolean>
}

export function defaultDeps(db: any, origin: string): WaitlistDeps {
  return {
    now: () => Date.now(),
    async sendSms({ company, to, text, conversationId }) {
      try {
        // /api/telnyx/sms/send checks the opt-out again (lib/sms-consent) and
        // charges the text to the business (SMS allowance / credit).
        const r = await fetch(`${origin}/api/telnyx/sms/send`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ companyId: company.id, conversationId: conversationId || undefined, to, text, senderName: company.name }),
        })
        if (r.ok) return { ok: true }
        const d: any = await r.json().catch(() => ({}))
        return { ok: false, optedOut: !!d?.optedOut, error: d?.error || `Text not sent (${r.status})` }
      } catch (e: any) { return { ok: false, error: e?.message || 'Text not sent' } }
    },
    sendEmail: ({ company, to, subject, html, text }) => sendCustomerEmail(db, company, { to, subject, html, text }),
    async shorten(url, { companyId, conversationId }) {
      try {
        const s = await shortenUrl(url, { companyId, conversationId: conversationId || undefined, kind: 'booking' })
        const code = s && s !== url ? (s.split('/l/')[1] || '') : ''
        if (code) { try { await db.from('short_links').update({ link_type: 'booking', conversation_id: conversationId || null, channel: 'booking' }).eq('code', code) } catch {} }
        return s || url
      } catch { return url }
    },
    externalBlocked: (companyId) => isExternalSendBlocked(companyId, db),
  }
}

async function loadCompany(db: any, id: string) {
  const { data } = await db.from('companies').select(PUBLIC_COMPANY_COLS).eq('id', id).maybeSingle()
  return data || null
}

// ── Join ─────────────────────────────────────────────────────────────────────

export type JoinInput = {
  name: string; phone: string; email: string | null
  days?: string[] | null; from?: string | null; to?: string | null; window?: string | null
  locationId?: string | null
  ip?: string | null
  source?: 'page' | 'agent' | 'staff'
}

export type JoinResult =
  | { ok: true; entryId: string; updated: boolean; wants: string; smsBlocked: boolean }
  | { ok: false; error: string; status: number }

/**
 * Put a customer on the waitlist for a service (or update the dates on the
 * entry they already have). Records their express consent to be texted about
 * a freed spot. The caller has rate limited the request.
 */
export async function joinWaitlist(db: any, a: { company: any; settings: BookingSettings; service: any; input: JoinInput; now?: number }): Promise<JoinResult> {
  const { company, settings, service, input } = a
  const now = a.now ?? Date.now()
  if (!settings.waitlist.enabled) return { ok: false, error: 'This business isn’t taking waitlist sign-ups right now.', status: 404 }
  const name = String(input.name || '').trim().slice(0, 120)
  const email = String(input.email || '').trim().toLowerCase().slice(0, 200) || null
  const key = phoneKey(input.phone)
  if (!name) return { ok: false, error: 'Please enter your name.', status: 400 }
  if (key.length !== 9 || !key.startsWith('4')) return { ok: false, error: 'Please enter an Australian mobile number (04xx xxx xxx) so we can text you.', status: 400 }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please check your email address.', status: 400 }
  const tz = settings.timezone
  const today = dateInTz(now, tz)
  const lastDay = addDays(today, Math.min(service.max_days_ahead || 60, 365))
  const dates = cleanWaitlistDates({ days: input.days, from: input.from, to: input.to, window: input.window }, { today, lastDay })
  if ('error' in dates) return { ok: false, error: dates.error, status: 400 }
  const locationId = service.location_mode === 'outlet' && typeof input.locationId === 'string' && /^[0-9a-f-]{36}$/i.test(input.locationId) ? input.locationId : null
  const phone = toE164(input.phone)

  // Light limits on top of the route's burst check: a number can wait for a
  // handful of services at a time, and one business can't be flooded.
  const live = await db.from('booking_waitlist').select('id, service_id').eq('company_id', company.id).eq('phone_norm', key).in('status', LIVE_ENTRY).limit(20)
  if (live.error) {
    if (isMissingWaitlist(live.error)) return { ok: false, error: 'The waitlist isn’t available yet. Please contact the business directly.', status: 503 }
    throw live.error
  }
  const existing = (live.data || []).find((e: any) => e.service_id === service.id) || null
  if (!existing && (live.data || []).length >= 5) return { ok: false, error: 'You’re already waiting for several services here. Please contact the business directly.', status: 429 }
  if (!existing) {
    const { count } = await db.from('booking_waitlist').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', iso(now - 3600_000))
    if ((count || 0) >= 100) return { ok: false, error: 'Too many sign-ups right now — please try again a little later.', status: 429 }
  }

  // Their contact (so replies and the consent record land in the CRM).
  let contactId: string | null = null
  try {
    contactId = await ensureContactByPhone(db, company.id, phone, { name, source: 'booking' })
    if (contactId) {
      const { data: c } = await db.from('contacts').select('id, name, email').eq('id', contactId).maybeSingle()
      const patch: any = {}
      if (c && !c.name) patch.name = name
      if (c && !c.email && email) patch.email = email
      if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', contactId)
    }
  } catch {}

  const consentText = CONSENT_TEXT(company.name || 'the business')
  const row: any = {
    company_id: company.id, service_id: service.id, contact_id: contactId,
    customer_name: name, customer_phone: phone, customer_email: email, phone_norm: key, location_id: locationId,
    days: dates.value.days, date_from: dates.value.date_from, date_to: dates.value.date_to, time_window: dates.value.time_window,
    timezone: tz, expires_at: iso(entryExpiry(dates.value.date_to, tz)),
    consent_text: consentText, consent_at: iso(now), consent_ip: input.ip ? String(input.ip).slice(0, 80) : null,
    source: input.source || 'page', updated_at: iso(now),
  }
  let entryId: string | null = null, updated = false
  if (existing) {
    const { data } = await db.from('booking_waitlist').update(row).eq('id', existing.id).in('status', LIVE_ENTRY).select('id')
    if (data?.length) { entryId = existing.id; updated = true }
  }
  if (!entryId) {
    const { data, error } = await db.from('booking_waitlist').insert({ ...row, status: 'waiting' }).select('id').maybeSingle()
    if (error) {
      // Two joins at once: the one-live-entry index caught the second — update that one.
      if (/duplicate|unique/i.test(error.message || '')) {
        const { data: again } = await db.from('booking_waitlist').update(row).eq('company_id', company.id).eq('service_id', service.id).eq('phone_norm', key).in('status', LIVE_ENTRY).select('id')
        entryId = again?.[0]?.id || null; updated = true
      } else if (isMissingWaitlist(error)) return { ok: false, error: 'The waitlist isn’t available yet. Please contact the business directly.', status: 503 }
      else throw error
    } else entryId = data?.id || null
  }
  if (!entryId) return { ok: false, error: 'Couldn’t add you to the waitlist. Please try again.', status: 500 }

  const wants = describeWants(dates.value)
  // Express consent for this purpose, on the record (V193 audit trail).
  if (contactId) {
    try {
      await db.from('consent_events').insert({
        company_id: company.id, contact_id: contactId, action: 'waitlist_texts', basis: 'express', actor: 'customer',
        source: `Booking waitlist: ${service.name}`.slice(0, 200), note: `${consentText} (${wants})`.slice(0, 500),
      })
    } catch {}
  }

  // Their thread, with a note for the team.
  try {
    let conversationId: string | null = null
    if (contactId) {
      const { data: cv } = await db.from('conversations').select('id').eq('company_id', company.id).eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1)
      conversationId = cv?.[0]?.id || null
    }
    if (!conversationId) {
      const { data: created } = await db.from('conversations').insert({
        company_id: company.id, channel: 'sms', subject: name, contact_id: contactId, status: 'open',
        sms_number: phone, sms_enabled: true, last_message: '', last_message_at: iso(now),
      }).select('id').maybeSingle()
      conversationId = created?.id || null
    }
    if (conversationId) {
      await db.from('booking_waitlist').update({ conversation_id: conversationId }).eq('id', entryId)
      await db.from('messages').insert({ conversation_id: conversationId, company_id: company.id, sender_type: 'system', content: `Joined the booking waitlist: ${service.name}, ${wants}.`, metadata: { booking_waitlist_id: entryId } })
    }
    if (!updated) await notifyCompany({ db, companyId: company.id, type: 'booking', conversationId: conversationId || undefined, message: `${name} joined the waitlist for ${service.name} (${wants})` })
  } catch {}

  // Replied STOP to this business before: we can't text them until they text START.
  let smsBlocked = false
  try { smsBlocked = (await textOptOut(db, company.id, phone, contactId)).state === 'opted_out' } catch {}
  return { ok: true, entryId, updated, wants, smsBlocked }
}

// ── Processing the queue ─────────────────────────────────────────────────────

export type ProcessResult = {
  jobs: number; offers: number; held: number; deferred: number; skipped: number; failed: number
  expiredEntries: number; advanced: number; note?: string
}

type Slot = { serviceId: string; service: any; start: number; end: number; locationId: string | null; resources: (string | null)[] }

/**
 * Housekeeping, then every queued job that's due. Safe to run from several
 * places at once: each job is claimed before it's worked, an offer is unique
 * per person per time, and an "in order" hold is a real booking hold
 * (claim_booking_slot), so two runs can't hold one time twice.
 */
export async function processWaitlistJobs(db: any, origin: string, opts: { deps?: Partial<WaitlistDeps>; limit?: number; budgetMs?: number } = {}): Promise<ProcessResult> {
  const deps: WaitlistDeps = { ...defaultDeps(db, origin), ...(opts.deps || {}) }
  const out: ProcessResult = { jobs: 0, offers: 0, held: 0, deferred: 0, skipped: 0, failed: 0, expiredEntries: 0, advanced: 0 }
  const started = Date.now()
  const now = deps.now()

  const probe = await db.from('booking_waitlist_jobs').select('id').limit(1)
  if (probe.error) {
    if (isMissingWaitlist(probe.error)) return { ...out, note: WAITLIST_MIGRATION_HINT }
    throw probe.error
  }
  await housekeeping(db, now, out)

  // A run that died mid-job leaves it 'running': put it back (a few tries).
  try {
    await db.from('booking_waitlist_jobs').update({ status: 'queued' }).eq('status', 'running').lt('claimed_at', iso(now - 10 * MIN)).lt('attempts', 5)
    await db.from('booking_waitlist_jobs').update({ status: 'failed', finished_at: iso(now) }).eq('status', 'running').lt('claimed_at', iso(now - 10 * MIN)).gte('attempts', 5)
  } catch {}

  const { data: due } = await db.from('booking_waitlist_jobs').select('*').eq('status', 'queued').lte('run_after', iso(now)).order('run_after', { ascending: true }).limit(opts.limit || 50)
  for (const j of due || []) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) break
    // Claim it: only one run gets the row.
    const { data: claimed } = await db.from('booking_waitlist_jobs').update({ status: 'running', claimed_at: iso(now), attempts: (j.attempts || 0) + 1 })
      .eq('id', j.id).eq('status', 'queued').select('*')
    if (!claimed?.length) continue
    out.jobs++
    try {
      const r = await runJob(db, claimed[0], deps, out)
      if (r.deferUntil) {
        out.deferred++
        await db.from('booking_waitlist_jobs').update({ status: 'queued', run_after: iso(r.deferUntil), attempts: j.attempts || 0, claimed_at: null }).eq('id', j.id)
      } else {
        await db.from('booking_waitlist_jobs').update({ status: 'done', finished_at: iso(deps.now()), result: r.result || {} }).eq('id', j.id)
      }
    } catch (e: any) {
      console.error('[booking waitlist] job failed', j.id, e?.message || e)
      const tries = (j.attempts || 0) + 1
      await db.from('booking_waitlist_jobs').update({ status: tries >= 5 ? 'failed' : 'queued', run_after: iso(deps.now() + 2 * MIN), result: { error: String(e?.message || e).slice(0, 500) } }).eq('id', j.id)
    }
  }
  return out
}

/**
 * Lapsed entries expire; "in order" holds that ran out move to the next
 * person; first-to-claim offers end when their time starts; and someone whose
 * offers have all ended is back to waiting.
 */
async function housekeeping(db: any, now: number, out: ProcessResult) {
  try {
    const { data: gone } = await db.from('booking_waitlist').update({ status: 'expired', updated_at: iso(now) })
      .in('status', LIVE_ENTRY).lt('expires_at', iso(now)).select('id')
    out.expiredEntries = gone?.length || 0
  } catch {}

  // In order: the hold ran out → release it and offer the time to the next.
  try {
    const { data: lapsed } = await db.from('booking_waitlist_offers').select('*').eq('status', 'sent').eq('mode', 'order').lte('expires_at', iso(now)).limit(200)
    for (const o of lapsed || []) {
      if (o.booking_id) {
        // They tapped it and are paying: their own booking hold decides.
        const { data: bk } = await db.from('bookings').select('status, hold_expires_at').eq('id', o.booking_id).maybeSingle()
        if (bk?.status === 'confirmed' || bk?.status === 'completed') { await db.from('booking_waitlist_offers').update({ status: 'claimed', claimed_at: iso(now) }).eq('id', o.id).eq('status', 'sent'); continue }
        if (bk?.status === 'pending' && bk.hold_expires_at && Date.parse(bk.hold_expires_at) > now) continue
      }
      const { data: mine } = await db.from('booking_waitlist_offers').update({ status: 'expired' }).eq('id', o.id).eq('status', 'sent').select('id')
      if (!mine?.length) continue
      if (o.hold_booking_id) {
        try { await db.from('bookings').update({ status: 'expired', hold_expires_at: iso(now) }).eq('id', o.hold_booking_id).eq('status', 'pending').eq('source', 'waitlist_hold') } catch {}
      }
      if (Date.parse(o.slot_start) > now) {
        await queueWaitlistJob(db, { companyId: o.company_id, kind: 'advance', serviceId: o.service_id, fromMs: Date.parse(o.slot_start), untilMs: Date.parse(o.slot_start), payload: { location_id: o.location_id || null, after_offer: o.id } })
        out.advanced++
      }
    }
  } catch (e) { console.error('[booking waitlist] advancing holds failed', e) }

  // First to claim: an offer ends when its time starts.
  try { await db.from('booking_waitlist_offers').update({ status: 'expired' }).eq('status', 'sent').eq('mode', 'first').lte('expires_at', iso(now)) } catch {}

  // Offered, but every offer has ended → waiting again.
  try {
    const { data: offered } = await db.from('booking_waitlist').select('id').eq('status', 'offered').limit(500)
    const ids = (offered || []).map((e: any) => e.id)
    if (ids.length) {
      const { data: liveOffers } = await db.from('booking_waitlist_offers').select('entry_id').in('entry_id', ids).in('status', ['sent', 'sending']).gt('expires_at', iso(now))
      const busy = new Set((liveOffers || []).map((o: any) => o.entry_id))
      const back = ids.filter((id: string) => !busy.has(id))
      if (back.length) await db.from('booking_waitlist').update({ status: 'waiting', updated_at: iso(now) }).in('id', back).eq('status', 'offered')
    }
  } catch {}
}

type JobOutcome = { deferUntil?: number; result?: Record<string, any> }

async function runJob(db: any, job: any, deps: WaitlistDeps, out: ProcessResult): Promise<JobOutcome> {
  const now = deps.now()
  const company = await loadCompany(db, job.company_id)
  if (!company) return { result: { skipped: 'no company' } }
  const settings = resolveBookingSettings(company.booking_settings)
  if (!settings.enabled || !settings.waitlist.enabled) return { result: { skipped: 'waitlist off' } }
  const { data: entries } = await db.from('booking_waitlist').select('*').eq('company_id', company.id).in('status', LIVE_ENTRY)
    .order('created_at', { ascending: true }).limit(2000)
  const waiting = (entries || []).filter((e: any) => !e.expires_at || Date.parse(e.expires_at) > now)
  if (!waiting.length) return { result: { skipped: 'nobody waiting' } }
  // Sending hours: overnight, wait for the morning (then the notice rule decides).
  const tz = settings.timezone
  if (!withinHours(now, tz, QUIET_START, QUIET_END)) return { deferUntil: nextWindowOpen(now, tz, QUIET_START) }
  if (await deps.externalBlocked(company.id)) return { result: { skipped: 'sending blocked' } }

  const slots = await candidateSlots(db, job, company, settings, waiting, now)
  const offeredThisRun = new Set<string>()
  let offers = 0
  for (const slot of slots.sort((a, b) => a.start - b.start)) {
    offers += await offerSlot(db, { company, settings, entries: waiting, offeredThisRun }, slot, deps, out)
  }
  return { result: { slots: slots.length, offers } }
}

/** The free times a job may have opened up, per service (and outlet) people are waiting for. */
async function candidateSlots(db: any, job: any, company: any, settings: BookingSettings, entries: any[], now: number): Promise<Slot[]> {
  const tz = settings.timezone
  const ws = settings.waitlist
  let serviceIds = [...new Set(entries.map(e => e.service_id))]
  if ((job.kind === 'manual' || job.kind === 'advance') && job.service_id) serviceIds = serviceIds.filter(id => id === job.service_id)
  if (!serviceIds.length) return []
  const { data: services } = await db.from('booking_services').select('*').eq('company_id', company.id).in('id', serviceIds).eq('active', true)
  if (!services?.length) return []
  const staff = await loadStaff(db, company)
  const today = dateInTz(now, tz)
  const out: Slot[] = []
  const fromMs = job.from_at ? Date.parse(job.from_at) : null
  const untilMs = job.until_at ? Date.parse(job.until_at) : fromMs
  const before = job.kind === 'availability' && job.payload?.before !== undefined ? job.payload.before : undefined

  for (const svc of services) {
    // The service's own notice still applies (the booking page enforces it).
    const svcEff = { ...svc, min_notice_mins: Math.max(svc.min_notice_mins ?? 120, ws.notice_mins) }
    const ss = slotService(svc)
    const mine = entries.filter(e => e.service_id === svc.id)
    const locs = [...new Set(mine.map(e => e.location_id || null))]
    for (const loc of locs) {
      const forLoc = mine.filter(e => (e.location_id || null) === loc)
      let found: { start: number; resources: (string | null)[] }[] = []
      if (job.kind === 'availability') {
        // The team changed hours / staff / closed days: what's free now that wasn't before.
        let from = forLoc.reduce((m, e) => String(e.date_from).slice(0, 10) < m ? String(e.date_from).slice(0, 10) : m, '9999-12-31')
        let to = forLoc.reduce((m, e) => String(e.date_to).slice(0, 10) > m ? String(e.date_to).slice(0, 10) : m, '0000-01-01')
        if (from < today) from = today
        const last = addDays(today, Math.min(svc.max_days_ahead || 60, MAX_RANGE_DAYS + 30))
        if (to > last) to = last
        if (to < from) continue
        const fresh = await availability(db, { company, settings, service: svcEff, staff, staffFilter: 'any', fromDate: from, toDate: to, locationId: loc })
        let old = new Set<number>()
        if (before !== undefined) {
          const oldSettings = resolveBookingSettings(before)
          const prev = await availability(db, { company: { ...company, booking_settings: before }, settings: oldSettings, service: svcEff, staff, staffFilter: 'any', fromDate: from, toDate: to, locationId: loc })
          old = new Set(prev.slots.map(s => s.start))
        }
        found = fresh.slots.filter(s => !old.has(s.start))
      } else {
        if (fromMs == null || untilMs == null) continue
        // A freed stretch: any start whose time (with buffers) overlaps it.
        const lo = job.kind === 'slot_freed' ? fromMs - (ss.duration_mins + ss.buffer_after) * MIN : fromMs
        let fromDate = dateInTz(lo, tz), toDate = dateInTz(untilMs, tz)
        if (fromDate < today) fromDate = today
        if (toDate < fromDate) continue
        const r = await availability(db, { company, settings, service: svcEff, staff, staffFilter: 'any', fromDate, toDate, locationId: loc })
        found = r.slots.filter(s => {
          if (job.kind !== 'slot_freed') return s.start === fromMs
          const bFrom = s.start - ss.buffer_before * MIN, bUntil = s.start + (ss.duration_mins + ss.buffer_after) * MIN
          return bFrom < untilMs && bUntil > fromMs
        })
      }
      for (const s of found.slice(0, 60)) out.push({ serviceId: svc.id, service: svc, start: s.start, end: s.start + svc.duration_mins * MIN, locationId: loc, resources: s.resources })
    }
  }
  return out
}

/** Offer one free time to the people waiting for it. Returns how many offers went out. */
async function offerSlot(db: any, ctx: { company: any; settings: BookingSettings; entries: any[]; offeredThisRun: Set<string> }, slot: Slot, deps: WaitlistDeps, out: ProcessResult): Promise<number> {
  const { company, settings } = ctx
  const ws = settings.waitlist
  const tz = settings.timezone
  const now = deps.now()
  const notice = Math.max(slot.service.min_notice_mins ?? 120, ws.notice_mins)
  const matching = ctx.entries.filter(e => (e.location_id || null) === slot.locationId && entryWantsSlot(e, slot, tz, now, notice))
  if (!matching.length) return 0

  // Who has already been offered this time, and is an offer still live?
  const { data: existing } = await db.from('booking_waitlist_offers').select('entry_id, status, mode, expires_at')
    .eq('company_id', company.id).eq('service_id', slot.serviceId).eq('slot_start', iso(slot.start))
  const offered = new Set((existing || []).map((o: any) => o.entry_id))
  const live = (existing || []).filter((o: any) => ['sent', 'sending'].includes(o.status) && (!o.expires_at || Date.parse(o.expires_at) > now))

  // Today's offers per person (max per day), and recent ones (cool-down).
  const ids = matching.map(e => e.id)
  const dayStart = zonedToUtc(dateInTz(now, tz), '00:00', tz)
  const since = Math.min(dayStart, now - FIRST_MODE_COOLDOWN_MINS * MIN)
  const { data: recent } = await db.from('booking_waitlist_offers').select('entry_id, status, mode, sent_at, expires_at').in('entry_id', ids).gte('created_at', iso(since))
  const sentToday = (id: string) => (recent || []).filter((o: any) => o.entry_id === id && o.sent_at && Date.parse(o.sent_at) >= dayStart).length
  const cooling = (id: string) => (recent || []).some((o: any) => o.entry_id === id && o.sent_at && (
    (ws.mode === 'first' && Date.parse(o.sent_at) > now - FIRST_MODE_COOLDOWN_MINS * MIN) ||
    (o.mode === 'order' && o.status === 'sent' && o.expires_at && Date.parse(o.expires_at) > now)))
  const eligible = matching.filter(e => !offered.has(e.id) && !ctx.offeredThisRun.has(e.id) && sentToday(e.id) < ws.max_per_day && !cooling(e.id))
  if (!eligible.length) { out.skipped++; return 0 }

  let sent = 0
  if (ws.mode === 'order') {
    if (live.length) return 0                     // someone holds it right now
    for (const e of eligible) {
      const holdUntil = now + ws.hold_mins * MIN
      const holdId = await holdSlot(db, company, settings, slot, e, holdUntil)
      if (!holdId) return sent                    // the time was taken meanwhile
      const r = await sendOffer(db, ctx, slot, e, { mode: 'order', expiresAt: holdUntil, holdBookingId: holdId }, deps, out)
      if (r) { ctx.offeredThisRun.add(e.id); out.held++; return 1 }
      // Couldn't reach them: release the hold and try the next person.
      try { await db.from('bookings').update({ status: 'expired', hold_expires_at: iso(now) }).eq('id', holdId).eq('status', 'pending').eq('source', 'waitlist_hold') } catch {}
    }
    return 0
  }
  let room = ws.batch - live.length
  for (const e of eligible) {
    if (room <= 0) break
    if (await sendOffer(db, ctx, slot, e, { mode: 'first', expiresAt: slot.start, holdBookingId: null }, deps, out)) { room--; sent++; ctx.offeredThisRun.add(e.id) }
  }
  return sent
}

/** "In order": hold the time for this person (a pending booking, source 'waitlist_hold'). */
async function holdSlot(db: any, company: any, settings: BookingSettings, slot: Slot, e: any, holdUntil: number): Promise<string | null> {
  const svc = slot.service
  for (const cand of slot.resources) {
    const { data, error } = await db.rpc('claim_booking_slot', {
      p_company: company.id, p_service: svc.id, p_staff: cand,
      p_starts: iso(slot.start), p_ends: iso(slot.end),
      p_busy_from: iso(slot.start - (svc.buffer_before || 0) * MIN), p_busy_until: iso(slot.end + (svc.buffer_after || 0) * MIN),
      p_capacity: svc.capacity || 1,
      p_row: {
        service_name: svc.name, staff_name: null, staff_choice: 'any', location_id: slot.locationId || '',
        timezone: settings.timezone, status: 'pending', hold_expires_at: iso(holdUntil), seats: 1,
        customer_name: e.customer_name, customer_email: e.customer_email, customer_phone: e.customer_phone,
        price_cents: svc.price_cents || 0, amount_due_cents: 0, currency: svc.currency || 'aud',
        payment_mode: 'none', payment_status: 'none', manage_token: newToken(), source: 'waitlist_hold',
        notes: 'Held for someone on the waitlist',
      },
      p_exclude: null,
    })
    if (error) throw error
    if (data) return data as string
  }
  return null
}

/** Record the offer (unique per person per time), then text it — or email it when a text can't go. */
async function sendOffer(db: any, ctx: { company: any; settings: BookingSettings }, slot: Slot, e: any, o: { mode: 'first' | 'order'; expiresAt: number; holdBookingId: string | null }, deps: WaitlistDeps, out: ProcessResult): Promise<boolean> {
  const { company, settings } = ctx
  const tz = settings.timezone
  const token = newToken()
  const { data: row, error } = await db.from('booking_waitlist_offers').insert({
    company_id: company.id, entry_id: e.id, service_id: slot.serviceId, slot_start: iso(slot.start), slot_end: iso(slot.end),
    location_id: slot.locationId, token, mode: o.mode, status: 'sending', expires_at: iso(o.expiresAt), hold_booking_id: o.holdBookingId,
  }).select('id').maybeSingle()
  if (error || !row?.id) return false              // already offered this time (another run got there first)

  const when = fmtDateTime(slot.start, tz)
  const link = await deps.shorten(`${bookingPageUrl(company, slot.service.slug)}?offer=${token}`, { companyId: company.id, conversationId: e.conversation_id })
  const first = String(e.customer_name || '').trim().split(/\s+/)[0] || ''
  const text = offerSms({ first, service: slot.service.name, when, business: company.name || 'us', link, mode: o.mode, holdMins: settings.waitlist.hold_mins })

  let channel: 'sms' | 'email' | null = null
  let why: string | null = null
  let optedOut = false
  const check = await textOptOut(db, company.id, e.customer_phone, e.contact_id).catch(() => ({ state: 'unknown' as const }))
  if (check.state === 'ok') {
    const r = await deps.sendSms({ company, to: e.customer_phone, text, conversationId: e.conversation_id })
    if (r.ok) channel = 'sms'
    else { why = r.error || 'Text not sent'; optedOut = !!r.optedOut }
  } else { optedOut = check.state === 'opted_out'; why = optedOut ? 'They replied STOP, so no text' : 'Couldn’t check the text opt-out' }

  if (!channel && e.customer_email) {
    const ok = await deps.sendEmail({ company, to: e.customer_email, ...offerEmail(company, slot.service.name, when, link, o.mode, settings.waitlist.hold_mins, first) })
    if (ok) channel = 'email'
  }

  const nowIso = iso(deps.now())
  if (!channel) {
    await db.from('booking_waitlist_offers').update({ status: optedOut ? 'skipped' : 'failed', error: (why || 'Not sent').slice(0, 300) }).eq('id', row.id)
    if (optedOut) out.skipped++; else out.failed++
    return false
  }
  await db.from('booking_waitlist_offers').update({ status: 'sent', channel, sent_at: nowIso, error: why ? why.slice(0, 300) : null }).eq('id', row.id)
  await db.from('booking_waitlist').update({ status: 'offered', offers_count: (e.offers_count || 0) + 1, last_offered_at: nowIso, updated_at: nowIso }).eq('id', e.id).in('status', LIVE_ENTRY)
  e.offers_count = (e.offers_count || 0) + 1
  if (channel === 'email' && e.conversation_id) {
    try { await db.from('messages').insert({ conversation_id: e.conversation_id, company_id: company.id, sender_type: 'system', content: `Waitlist: emailed an offer for ${slot.service.name}, ${when}.`, metadata: { booking_waitlist_id: e.id } }) } catch {}
  }
  out.offers++
  return true
}

function offerEmail(company: any, service: string, when: string, link: string, mode: 'first' | 'order', holdMins: number, first: string) {
  const business = company.name || 'us'
  const accent = /^#[0-9a-f]{6}$/i.test(company.accent_color || '') ? company.accent_color : '#ff7a6b'
  const line = mode === 'order' ? `It’s held for you for ${holdMins} minutes.` : 'It goes to whoever books first.'
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #eee">
    ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" style="height:36px;margin-bottom:14px">` : `<div style="font-weight:800;font-size:16px;margin-bottom:14px">${esc(business)}</div>`}
    <h1 style="margin:0 0 8px;font-size:22px;color:#111">A spot opened up</h1>
    <p style="margin:0 0 18px;color:#4b5563;font-size:14.5px;line-height:1.55">Hi ${esc(first || 'there')}, a time you were waiting for is free: <b>${esc(service)}</b>, ${esc(when)}. ${esc(line)}</p>
    <a href="${esc(link)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px">Book this time</a>
    <p style="margin:18px 0 0;color:#9ca3af;font-size:12px;line-height:1.5">You’re getting this because you joined the waitlist at ${esc(business)}. The link also lets you leave the waitlist.</p>
  </div>
</div></body></html>`
  return { subject: `A spot opened: ${service}, ${when}`, html, text: `A spot opened up\n\n${service}, ${when}. ${line}\n\nBook it: ${link}` }
}

// ── The claim link ───────────────────────────────────────────────────────────

export type OfferState = 'open' | 'held' | 'gone' | 'expired' | 'claimed' | 'booked' | 'closed'

export type OfferView = {
  state: OfferState
  token: string
  service: { id: string; slug: string; name: string } | null
  start: string
  holdUntil: string | null
  mode: 'first' | 'order'
  prefill: { name: string; phone: string; email: string }
  wants: string
  entryStatus: string
}

async function loadOfferRow(db: any, token: string | null | undefined) {
  if (!token || token.length < 20 || token.length > 80 || !/^[\w-]+$/.test(token)) return null
  const { data: offer, error } = await db.from('booking_waitlist_offers').select('*').eq('token', token).maybeSingle()
  if (error || !offer) return null
  const { data: entry } = await db.from('booking_waitlist').select('*').eq('id', offer.entry_id).maybeSingle()
  if (!entry) return null
  return { offer, entry }
}

/** What the claim link shows: is the time still theirs to book? */
export async function offerView(db: any, company: any, token: string, now = Date.now()): Promise<OfferView | null> {
  const r = await loadOfferRow(db, token)
  if (!r || r.offer.company_id !== company.id) return null
  const { offer, entry } = r
  const settings = resolveBookingSettings(company.booking_settings)
  const { data: service } = await db.from('booking_services').select('*').eq('id', offer.service_id).eq('company_id', company.id).maybeSingle()
  const view: OfferView = {
    state: 'open', token, service: service ? { id: service.id, slug: service.slug, name: service.name } : null,
    start: offer.slot_start, holdUntil: null, mode: offer.mode === 'order' ? 'order' : 'first',
    prefill: { name: entry.customer_name || '', phone: entry.customer_phone || '', email: entry.customer_email || '' },
    wants: describeWants(entry), entryStatus: entry.status,
  }
  const start = Date.parse(offer.slot_start)
  if (offer.status === 'claimed') view.state = 'claimed'
  else if (entry.status === 'booked') view.state = 'booked'
  else if (entry.status === 'removed') view.state = 'closed'
  else if (!service || !service.active || start <= now) view.state = 'expired'
  else if (offer.mode === 'order' && offer.status === 'sent' && offer.hold_booking_id && Date.parse(offer.expires_at) > now) {
    const { data: hold } = await db.from('bookings').select('status, source, hold_expires_at').eq('id', offer.hold_booking_id).maybeSingle()
    if (hold?.status === 'pending' && hold.source === 'waitlist_hold' && Date.parse(hold.hold_expires_at) > now) { view.state = 'held'; view.holdUntil = hold.hold_expires_at }
  }
  if (view.state === 'open') {
    // Still free? The same check the booking page makes.
    const staff = await loadStaff(db, company)
    const date = dateInTz(start, settings.timezone)
    const { slots } = await availability(db, { company, settings, service, staff, staffFilter: 'any', fromDate: date, toDate: date, locationId: offer.location_id || null })
    if (!slots.some(s => s.start === start)) {
      view.state = 'gone'
      if (offer.status === 'sent') { try { await db.from('booking_waitlist_offers').update({ status: 'gone' }).eq('id', offer.id).eq('status', 'sent') } catch {} }
    }
  }
  return view
}

/**
 * Booking from a claim link: check the offer belongs to this business,
 * service and time, and say which hold (if any) the booking may take over.
 */
export async function prepareClaim(db: any, company: any, token: string, serviceId: string, startMs: number, now = Date.now()): Promise<{ ok: true; offerId: string; heldBookingId: string | null } | { ok: false; error: string; status: number }> {
  let r: Awaited<ReturnType<typeof loadOfferRow>> = null
  try { r = await loadOfferRow(db, token) } catch { r = null }
  if (!r || r.offer.company_id !== company.id) return { ok: false, error: 'This waitlist link isn’t valid any more. You can still book any free time.', status: 410 }
  const { offer, entry } = r
  if (offer.service_id !== serviceId || Date.parse(offer.slot_start) !== startMs) return { ok: false, error: 'This waitlist link is for a different time. You can still book any free time.', status: 400 }
  if (entry.status === 'removed') return { ok: false, error: 'You left the waitlist, so this spot isn’t held for you. You can still book any free time.', status: 410 }
  if (offer.status === 'claimed' || entry.status === 'booked') return { ok: false, error: 'You’ve already booked from the waitlist.', status: 409 }
  const held = offer.mode === 'order' && offer.status === 'sent' && offer.hold_booking_id && Date.parse(offer.expires_at) > now ? offer.hold_booking_id : null
  return { ok: true, offerId: offer.id, heldBookingId: held }
}

/** Someone else booked it first: this offer is over; they stay on the list. */
export async function markOfferGone(db: any, offerId: string) {
  try { await db.from('booking_waitlist_offers').update({ status: 'gone' }).eq('id', offerId).in('status', ['sent', 'sending']) } catch {}
}

/** The customer leaves the waitlist from their link. */
export async function leaveByToken(db: any, company: any, token: string): Promise<boolean> {
  const r = await loadOfferRow(db, token)
  if (!r || r.offer.company_id !== company.id) return false
  await removeEntry(db, company.id, r.entry.id, 'customer')
  return true
}

/** Take someone off the list (staff, or themselves); any time held for them is released. */
export async function removeEntry(db: any, companyId: string, entryId: string, by: string): Promise<boolean> {
  const now = iso(Date.now())
  const { data } = await db.from('booking_waitlist').update({ status: 'removed', removed_at: now, removed_by: String(by).slice(0, 120), updated_at: now })
    .eq('id', entryId).eq('company_id', companyId).in('status', LIVE_ENTRY).select('id')
  if (!data?.length) return false
  const { data: live } = await db.from('booking_waitlist_offers').select('id, hold_booking_id, slot_start, service_id, location_id, mode').eq('entry_id', entryId).eq('status', 'sent')
  for (const o of live || []) {
    await db.from('booking_waitlist_offers').update({ status: 'expired' }).eq('id', o.id).eq('status', 'sent')
    if (o.hold_booking_id) {
      const { data: rel } = await db.from('bookings').update({ status: 'expired', hold_expires_at: now }).eq('id', o.hold_booking_id).eq('status', 'pending').eq('source', 'waitlist_hold').select('id')
      if (rel?.length && Date.parse(o.slot_start) > Date.now()) await queueWaitlistJob(db, { companyId, kind: 'advance', serviceId: o.service_id, fromMs: Date.parse(o.slot_start), untilMs: Date.parse(o.slot_start), payload: { location_id: o.location_id || null } })
    }
  }
  return true
}

// ── Admin ────────────────────────────────────────────────────────────────────

/** Everyone on the list (newest first), each with their offers. */
export async function listWaitlist(db: any, companyId: string, opts: { status?: string | null; serviceId?: string | null } = {}) {
  let q = db.from('booking_waitlist').select('*').eq('company_id', companyId)
  if (opts.status && opts.status !== 'all') q = opts.status === 'live' ? q.in('status', LIVE_ENTRY) : q.eq('status', opts.status)
  if (opts.serviceId) q = q.eq('service_id', opts.serviceId)
  const { data: entries, error } = await q.order('created_at', { ascending: false }).limit(500)
  if (error) return { error }
  const ids = (entries || []).map((e: any) => e.id)
  const offers: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('booking_waitlist_offers').select('id, entry_id, slot_start, status, channel, sent_at, expires_at, mode, booking_id, error')
      .in('entry_id', ids.slice(i, i + 200)).order('created_at', { ascending: false }).limit(2000)
    offers.push(...(data || []))
  }
  return {
    entries: (entries || []).map((e: any) => ({
      id: e.id, service_id: e.service_id, customer_name: e.customer_name, customer_phone: e.customer_phone, customer_email: e.customer_email,
      contact_id: e.contact_id, conversation_id: e.conversation_id, days: e.days, date_from: e.date_from, date_to: e.date_to,
      time_window: e.time_window, status: e.status, created_at: e.created_at, offers_count: e.offers_count, last_offered_at: e.last_offered_at,
      booking_id: e.booking_id, expires_at: e.expires_at, wants: describeWants(e), source: e.source,
      offers: offers.filter(o => o.entry_id === e.id).slice(0, 20),
    })),
  }
}

/** Staff offered a free time by hand: queue it like any freed time. */
export async function offerTimeManually(db: any, companyId: string, serviceId: string, startMs: number): Promise<boolean> {
  return queueWaitlistJob(db, { companyId, kind: 'manual', serviceId, fromMs: startMs, untilMs: startMs, payload: {} })
}

/** The team saved new hours / staff / closed days: queue a "what's newly free" check. */
export async function availabilityChanged(db: any, companyId: string, before: any, after: any): Promise<boolean> {
  const keys = ['hours', 'staff', 'closed', 'enabled', 'timezone']
  const changed = keys.some(k => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null))
  if (!changed || !resolveBookingSettings(after).waitlist.enabled) return false
  return queueWaitlistJob(db, { companyId, kind: 'availability', payload: { before: before ?? null } })
}

/** For the Reception Agent: the booking-page link that opens the waitlist form. */
export function waitlistLink(company: any, serviceSlug?: string | null) {
  return `${bookingPageUrl(company, serviceSlug || undefined)}?waitlist=1`
}

export const _test = { candidateSlots, offerSlot, housekeeping, runJob }
