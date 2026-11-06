import { NextRequest } from 'next/server'
import { hidesPoweredBy } from '@/lib/branding'
import { loadCompanyPublic, manageUrl } from '@/lib/booking'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { verifyTurnstile, requestIp, TURNSTILE_FAILED } from '@/lib/turnstile'
import { restaurantEnabled } from '@/lib/modules'
import { reservationSlots } from '@/lib/restaurant/availability'
import {
  restaurantDb, loadRestaurant, ctxOf, liveReservations, tableHolds, slotsFor, createReservation, publicRestaurant,
  json, isMissingRestaurantSchema, RESTAURANT_HINT, type ResCtx,
} from '@/lib/restaurant/server'

export const dynamic = 'force-dynamic'

// The public table booking page (/reserve/<slug>, or /reserve on the
// business's own colvy.com subdomain). No sign-in.
//   GET  ?slug|domain&op=page                     the restaurant, its page text and rules
//   GET  ?slug|domain&op=days&party&from           which of the next days have a table
//   GET  ?slug|domain&op=slots&date&party          the times with room
//   POST { slug|domain, startsAt, party, name, phone, email?, notes?, seating?, occasion?,
//          marketing?, website (hidden), openedAt, turnstileToken }
//        → { reservation, checkoutUrl? } — with a deposit, the table is held while they pay.
// Spam: a hidden field, a minimum time on the page, per-IP and per-restaurant
// limits, and Cloudflare Turnstile once its keys are set.

async function ctxFor(db: any, q: { slug: string | null; domain: string | null }): Promise<{ ctx?: ResCtx; status?: number; error?: string }> {
  const pub = await loadCompanyPublic(db, { slug: q.slug, domain: q.domain })
  if (!pub) return { status: 404, error: 'Restaurant not found.' }
  const { company, error } = await loadRestaurant(db, pub.id)
  if (error) return { status: isMissingRestaurantSchema(error) ? 503 : 500, error: isMissingRestaurantSchema(error) ? RESTAURANT_HINT : 'Something went wrong.' }
  if (!company || !restaurantEnabled(company)) return { status: 404, error: 'This restaurant isn’t taking bookings online.' }
  return { ctx: await ctxOf(db, company) }
}

const partyOf = (v: any, max: number) => Math.max(1, Math.min(max, Math.round(Number(v)) || 2))

export async function GET(req: NextRequest) {
  try {
    const db = restaurantDb()
    const sp = req.nextUrl.searchParams
    if (!checkBurst(`reserve-get:${callerKey(req)}`, 60)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const c = await ctxFor(db, { slug: sp.get('slug'), domain: sp.get('domain') })
    if (!c.ctx) return json({ error: c.error }, c.status || 404)
    const { company, rs, tz } = c.ctx
    const today = dateInTz(Date.now(), tz)
    const op = sp.get('op') || 'page'
    if (op === 'page') {
      return json({ restaurant: publicRestaurant(company, rs, tz), today, hidePoweredBy: await hidesPoweredBy(db, company.id, company) })
    }
    if (op === 'days') {
      // One read of the next few weeks, worked out day by day here.
      const party = partyOf(sp.get('party'), rs.party_max)
      let from = isDate(sp.get('from')) ? sp.get('from')! : today
      if (from < today) from = today
      const n = Math.min(21, rs.max_days_ahead + 1)
      const to = addDays(from, n - 1)
      const live = await liveReservations(db, company.id, c.ctx.service.id, Date.parse(`${from}T00:00:00Z`) - 36 * 3600e3, Date.parse(`${to}T00:00:00Z`) + 60 * 3600e3)
      const floor = c.ctx.byTable && c.ctx.floor ? { floor: c.ctx.floor, holds: await tableHolds(db, company.id, live), onlineOnly: true } : null
      const days: { date: string; open: boolean }[] = []
      for (let d = from, i = 0; i < n; d = addDays(d, 1), i++) {
        const slots = reservationSlots({ settings: rs, tz, date: d, party, live, now: Date.now(), floor })
        days.push({ date: d, open: slots.some(s => s.ok) })
      }
      return json({ days, timezone: tz })
    }
    if (op === 'slots') {
      const party = partyOf(sp.get('party'), rs.party_max)
      const date = isDate(sp.get('date')) ? sp.get('date')! : today
      const slots = await slotsFor(db, c.ctx, date, party)
      return json({ date, timezone: tz, slots: slots.filter(s => s.ok).map(s => ({ start: new Date(s.start).toISOString(), period: s.period })) })
    }
    return json({ error: 'Unknown request.' }, 400)
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return json({ error: RESTAURANT_HINT }, 503)
    return json({ error: e?.message || 'Something went wrong.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    // 1. The hidden "website" field: people never see it, bots fill it in.
    if (typeof body.website === 'string' && body.website.trim()) return json({ error: 'Please try again.' }, 400)
    // 2. Too quick to be a person filling in the form.
    const opened = Number(body.openedAt)
    if (Number.isFinite(opened) && Date.now() - opened < 2500) return json({ error: 'Please check your details and try again.' }, 400)
    // 3. Burst limits per visitor.
    if (!checkBurst(`reserve:${callerKey(req)}`, 5)) return json({ error: 'Too many bookings at once. Please wait a minute.' }, 429)
    // 4. Turnstile (once its keys are set).
    const ip = requestIp(req.headers)
    const human = await verifyTurnstile(body.turnstileToken, ip)
    if (!human.ok) return json({ error: TURNSTILE_FAILED }, 400)
    const c = await ctxFor(db, { slug: body.slug || null, domain: body.domain || null })
    if (!c.ctx) return json({ error: c.error }, c.status || 404)
    // 5. Per restaurant: a flood from many addresses still can't fill the book.
    if (!checkBurst(`reserve-co:${c.ctx.company.id}`, 30)) return json({ error: 'Lots of bookings are coming in right now. Please try again in a minute.' }, 429)
    const startMs = Date.parse(String(body.startsAt || ''))
    if (!Number.isFinite(startMs)) return json({ error: 'Pick a time.' }, 400)
    const res = await createReservation(db, c.ctx, {
      startMs, party: Number(body.party), name: body.name, phone: body.phone, email: body.email, notes: body.notes,
      seating: body.seating, occasion: body.occasion, source: 'page', byTeam: false, notify: true,
      marketingOptIn: body.marketing === true, origin: req.nextUrl.origin,
    })
    if (!res.ok) return json({ error: res.error, full: !!res.full, blocked: res.reason === 'blocked' }, res.status || 400)
    const b = res.booking
    return json({
      ok: true,
      // A deposit to pay: the page sends them to Stripe; the table is held for half an hour.
      checkoutUrl: res.checkoutUrl || null,
      deposit: b.amount_due_cents && b.payment_status !== 'paid' ? b.amount_due_cents : null,
      reservation: { startsAt: b.starts_at, party: b.seats, name: b.customer_name, seating: b.seating_pref || null, manageUrl: manageUrl(c.ctx.company, b.manage_token) },
    })
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return json({ error: RESTAURANT_HINT }, 503)
    return json({ error: e?.message || 'Something went wrong. Please try again.' }, 500)
  }
}
