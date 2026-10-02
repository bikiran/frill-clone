// Booking automations that run on a schedule (/api/cron/booking-reminders,
// every 10 minutes from Vercel Cron, also pinged by the admin app):
//
//   1. Reminders — 24 hours before (SMS + email) and 2 hours before (SMS),
//      asking the customer to reply C to confirm or R to reschedule.
//   2. Wrap-up — 2 hours after a confirmed booking ends it's marked completed,
//      and (if the business uses review requests) a review request is queued
//      through the existing review dispatcher, with its suppression rules.
//   3. Rebook nudges — "time for your next one?" N days later, for services
//      that set it, unless they've already booked again.
//   4. Tidy — lapsed unpaid holds become 'expired'.
//
// Every send is claimed first (update … where <col> is null) so overlapping
// runs never double-send. Needs migrations V323 + V324.

import { resolveBookingSettings, customerMessage, PUBLIC_COMPANY_COLS, isMissingBookingSchema } from '@/lib/booking'
import { zonedParts } from '@/lib/booking-time'
import { isWithinSendingHours } from '@/lib/campaign-sender'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export type SweepResult = { reminders24: number; reminders2: number; completed: number; reviews: number; rebooks: number; expired: number; note?: string }

export async function runBookingSweep(db: any, origin: string): Promise<SweepResult> {
  const out: SweepResult = { reminders24: 0, reminders2: 0, completed: 0, reviews: 0, rebooks: 0, expired: 0 }
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  const companies = new Map<string, any>()
  const companyOf = async (id: string) => {
    if (!companies.has(id)) {
      const { data } = await db.from('companies').select(`${PUBLIC_COMPANY_COLS}, review_request_settings`).eq('id', id).maybeSingle()
      companies.set(id, data || null)
    }
    return companies.get(id)
  }
  const services = new Map<string, any>()
  const serviceOf = async (id: string | null) => {
    if (!id) return null
    if (!services.has(id)) {
      const { data } = await db.from('booking_services').select('*').eq('id', id).maybeSingle()
      services.set(id, data || null)
    }
    return services.get(id)
  }
  const claim = async (id: string, col: string, extra: Record<string, any> = {}) => {
    const { data } = await db.from('bookings').update({ [col]: iso(now), ...extra }).eq('id', id).is(col, null).select('*')
    return data?.[0] || null
  }

  // ── 1. Reminders ──────────────────────────────────────────────────────────
  const { data: upcoming, error } = await db.from('bookings')
    .select('id, company_id, service_id, starts_at, created_at, reminder_24h_at, reminder_2h_at, customer_phone, customer_email')
    .eq('status', 'confirmed').gt('starts_at', iso(now)).lte('starts_at', iso(now + 25 * HOUR))
    .order('starts_at').limit(500)
  if (error) {
    if (isMissingBookingSchema(error) || /reminder_24h_at|column/i.test(error.message)) return { ...out, note: 'Run migrations V323 + V324' }
    throw error
  }
  for (const b of upcoming || []) {
    try {
      const company = await companyOf(b.company_id)
      if (!company) continue
      const settings = resolveBookingSettings(company.booking_settings)
      const start = Date.parse(b.starts_at)
      const until = start - now
      const age = now - Date.parse(b.created_at)
      const hour = zonedParts(now, settings.timezone).h

      // 24 hours before — not if they only just booked; daytime only (8am–8pm).
      if (settings.reminder_24h && !b.reminder_24h_at && until <= 24 * HOUR && until > 3 * HOUR && age > 6 * HOUR && hour >= 8 && hour < 20) {
        const bk = await claim(b.id, 'reminder_24h_at')
        if (bk) { await customerMessage(db, company, settings, bk, 'reminder', { service: await serviceOf(bk.service_id), origin }); out.reminders24++ }
        continue
      }
      // 2 hours before — SMS only, skipped if the day-before one just went
      // or they booked in the last couple of hours; 7am–9pm.
      const recent24 = b.reminder_24h_at && now - Date.parse(b.reminder_24h_at) < 4 * HOUR
      if (settings.reminder_2h && !b.reminder_2h_at && b.customer_phone && until <= 2 * HOUR + 5 * MIN && until > 15 * MIN && age > 2 * HOUR && !recent24 && hour >= 7 && hour < 21) {
        const bk = await claim(b.id, 'reminder_2h_at')
        if (bk) { await customerMessage(db, company, settings, bk, 'reminder', { service: await serviceOf(bk.service_id), origin, channels: ['sms'] }); out.reminders2++ }
      }
    } catch (e) { console.error('[booking sweep] reminder failed', b.id, e) }
  }

  // ── 2. Wrap-up: complete finished bookings, queue review requests ────────
  const { data: finished } = await db.from('bookings')
    .select('id, company_id, service_id, ends_at, contact_id, conversation_id, calendar_event_id')
    .eq('status', 'confirmed').lt('ends_at', iso(now - 2 * HOUR)).gt('ends_at', iso(now - 14 * DAY))
    .limit(300)
  for (const b of finished || []) {
    try {
      const { data: done } = await db.from('bookings').update({ status: 'completed', completed_at: iso(now), updated_at: iso(now) })
        .eq('id', b.id).eq('status', 'confirmed').select('id')
      if (!done?.length) continue
      out.completed++
      if (b.calendar_event_id) { try { await db.from('calendar_events').update({ status: 'completed' }).eq('id', b.calendar_event_id).neq('status', 'cancelled') } catch {} }

      const company = await companyOf(b.company_id)
      const settings = resolveBookingSettings(company?.booking_settings)
      const rr = company?.review_request_settings || {}
      if (rr.enabled && settings.followup_review && b.contact_id && b.conversation_id) {
        const delay = Math.max(0, Number(rr.delay_hours ?? 24) - 2) * HOUR
        const { error: rrErr } = await db.from('review_requests').insert({
          company_id: b.company_id, conversation_id: b.conversation_id, contact_id: b.contact_id,
          order_id: `booking_${b.id}`, send_after: iso(now + delay), status: 'pending',
        })
        if (!rrErr || rrErr.code === '23505') {
          try { await db.from('bookings').update({ review_queued_at: iso(now) }).eq('id', b.id) } catch {}
          if (!rrErr) out.reviews++
        }
      }
    } catch (e) { console.error('[booking sweep] wrap-up failed', b.id, e) }
  }

  // ── 3. Rebook nudges ─────────────────────────────────────────────────────
  const { data: past } = await db.from('bookings')
    .select('id, company_id, service_id, starts_at, completed_at, contact_id, customer_phone, customer_email')
    .eq('status', 'completed').is('rebook_sent_at', null).not('completed_at', 'is', null)
    .gt('completed_at', iso(now - 400 * DAY)).lt('completed_at', iso(now - DAY))
    .order('completed_at').limit(500)
  for (const b of past || []) {
    try {
      const service = await serviceOf(b.service_id)
      if (!service?.rebook_days || !service.active) continue
      const due = Date.parse(b.completed_at) + service.rebook_days * DAY
      if (now < due) continue
      const company = await companyOf(b.company_id)
      if (!company) continue
      const settings = resolveBookingSettings(company.booking_settings)
      if (!settings.enabled) continue
      // Way overdue (sweep was off) → don't send a stale nudge.
      if (now > due + 21 * DAY) { await claim(b.id, 'rebook_sent_at'); continue }
      if (!isWithinSendingHours(new Date(now), settings.timezone)) continue
      // Already booked again? Then no nudge.
      let again = db.from('bookings').select('id').eq('company_id', b.company_id).eq('service_id', b.service_id)
        .gt('starts_at', b.starts_at).in('status', ['pending', 'confirmed', 'completed']).limit(1)
      again = b.contact_id ? again.eq('contact_id', b.contact_id) : b.customer_phone ? again.eq('customer_phone', b.customer_phone) : again.eq('customer_email', b.customer_email || '-')
      const { data: next } = await again
      const bk = await claim(b.id, 'rebook_sent_at')
      if (!bk || next?.length) continue
      await customerMessage(db, company, settings, bk, 'rebook', { service, origin })
      out.rebooks++
    } catch (e) { console.error('[booking sweep] rebook failed', b.id, e) }
  }

  // ── 4. Lapsed unpaid holds ───────────────────────────────────────────────
  try {
    const { data: exp } = await db.from('bookings').update({ status: 'expired' })
      .eq('status', 'pending').lt('hold_expires_at', iso(now - 10 * MIN)).select('id')
    out.expired = exp?.length || 0
  } catch {}

  return out
}
