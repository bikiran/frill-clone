// Booking waitlist — the hooks lib/booking.ts and the sweep call when a time
// may have freed up, kept apart from lib/booking-waitlist.ts (which imports
// lib/booking) so there's no import cycle. Each hook only writes a row to
// booking_waitlist_jobs and asks for it to be processed after the response;
// /api/cron/booking-waitlist picks up anything left over. Before
// COLVY_V400_BOOKING_WAITLIST.sql runs these do nothing.

import { after } from 'next/server'
import { resolveWaitlistSettings } from '@/lib/booking-waitlist-rules'

export const isMissingWaitlist = (e: any) =>
  /^(42P01|PGRST20[25])$/.test(String(e?.code || '')) ||
  /does not exist|schema cache|could not find the table/i.test(String(e?.message || e || ''))

export const WAITLIST_MIGRATION_HINT = 'Run migrations/COLVY_V400_BOOKING_WAITLIST.sql in Supabase to turn on the booking waitlist.'

export type WaitlistJob = {
  companyId: string
  kind: 'slot_freed' | 'availability' | 'manual' | 'advance'
  serviceId?: string | null
  staffId?: string | null
  fromMs?: number | null
  untilMs?: number | null
  payload?: Record<string, any>
  runAfterMs?: number | null
}

/** Queue "a time may have freed up". Never throws; false when it couldn't be queued. */
export async function queueWaitlistJob(db: any, j: WaitlistJob): Promise<boolean> {
  try {
    const row: any = {
      company_id: j.companyId, kind: j.kind, service_id: j.serviceId || null, staff_id: j.staffId || null,
      from_at: j.fromMs != null ? new Date(j.fromMs).toISOString() : null,
      until_at: j.untilMs != null ? new Date(j.untilMs).toISOString() : null,
      payload: j.payload || {}, status: 'queued',
      run_after: new Date(j.runAfterMs ?? Date.now()).toISOString(),
    }
    const { error } = await db.from('booking_waitlist_jobs').insert(row)
    if (error) {
      if (!isMissingWaitlist(error)) console.error('[booking waitlist] job not queued', error.message)
      return false
    }
    return true
  } catch (e) { console.error('[booking waitlist] job not queued', e); return false }
}

/**
 * Work the queue after the response is sent (inside a route handler). Outside
 * a request (a script, a test) `after` isn't available: the cron does it.
 */
let scheduled = false
export function kickWaitlist(db: any, origin: string) {
  // One run per burst (a series cancelled together queues several jobs): a
  // run already waiting to start will see every job queued before it starts.
  if (scheduled) return
  try {
    scheduled = true
    after(async () => {
      scheduled = false
      try {
        const { processWaitlistJobs } = await import('@/lib/booking-waitlist')
        await processWaitlistJobs(db, origin)
      } catch (e) { console.error('[booking waitlist] inline run failed', e) }
    })
  } catch { scheduled = false /* not in a request: the cron picks it up */ }
}

/**
 * A booking stopped holding its time (cancelled, moved away, an unpaid hold
 * released): if this business has the waitlist on and the time is still to
 * come, queue it. `b` is the booking as it was (its old time).
 */
export async function bookingTimeFreed(db: any, companySettings: any, b: any, origin: string | null, opts: { kick?: boolean } = {}): Promise<boolean> {
  try {
    if (!b?.company_id || !b.busy_from || !b.busy_until) return false
    if (b.source === 'waitlist_hold') return false      // the waitlist worker moves those on itself
    if (!resolveWaitlistSettings(companySettings?.waitlist).enabled) return false
    if (Date.parse(b.starts_at) <= Date.now()) return false
    const ok = await queueWaitlistJob(db, {
      companyId: b.company_id, kind: 'slot_freed', serviceId: b.service_id || null, staffId: b.staff_id || null,
      fromMs: Date.parse(b.busy_from), untilMs: Date.parse(b.busy_until), payload: { booking_id: b.id || null },
    })
    if (ok && origin && opts.kick !== false) kickWaitlist(db, origin)
    return ok
  } catch { return false }
}

/** A booking was made from an offer: remember which (the offer's link token led to it). */
export async function linkOfferToBooking(db: any, offerId: string, bookingId: string) {
  try { await db.from('booking_waitlist_offers').update({ booking_id: bookingId }).eq('id', offerId) } catch {}
}

/**
 * A booking from the waitlist was confirmed: the offer is claimed and the
 * person is booked (they stop being offered times). Idempotent; never throws.
 */
export async function markWaitlistBooked(db: any, bookingId: string): Promise<void> {
  try {
    const { data: offer, error } = await db.from('booking_waitlist_offers').select('id, entry_id, status, company_id, service_id, slot_start').eq('booking_id', bookingId).maybeSingle()
    if (error || !offer) return
    const now = new Date().toISOString()
    await db.from('booking_waitlist_offers').update({ status: 'claimed', claimed_at: now }).eq('id', offer.id).neq('status', 'claimed')
    // One place only: everyone else offered this time has missed it (they're
    // back to waiting on the worker's next pass). A group class keeps them.
    const { data: svc } = await db.from('booking_services').select('capacity').eq('id', offer.service_id).maybeSingle()
    if ((svc?.capacity || 1) <= 1) {
      await db.from('booking_waitlist_offers').update({ status: 'gone' }).eq('company_id', offer.company_id).eq('service_id', offer.service_id)
        .eq('slot_start', offer.slot_start).eq('status', 'sent').neq('id', offer.id)
    }
    await db.from('booking_waitlist').update({ status: 'booked', booking_id: bookingId, booked_at: now, updated_at: now })
      .eq('id', offer.entry_id).in('status', ['waiting', 'offered', 'expired'])
  } catch {}
}
