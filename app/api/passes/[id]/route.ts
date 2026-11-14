import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { resolveBookingSettings, systemNote } from '@/lib/booking'
import { MAX_CREDITS } from '@/lib/passes/rules'
import { PASS_COLS, withState, cancelMembership, resumeMembership, syncMembership, usePass, passOptionsFor, type PassRow } from '@/lib/passes/server'
import { passDb, passAccess, passError, json, COMPANY_PAY_COLS } from '@/lib/passes/api'

export const dynamic = 'force-dynamic'

// One customer's pass.
//   GET  ?companyId   the pass, the classes booked with it, and its payments
//   POST { companyId, action, … }
//     adjust  { delta, note? }   add or take off classes (a pack)      owners/admins
//     extend  { days }           push a pack's expiry out (and reopen it)  owners/admins
//     cancel  { now? }           stop a membership (at period end, or now) owners/admins
//     resume                     undo "ends at period end"              owners/admins
//     sync                       ask Stripe for the latest              anyone on the team
//     use     { bookingId }      pay for that booking with this pass    anyone on the team
type Ctx = { params: Promise<{ id: string }> }

async function load(db: any, companyId: string, id: string): Promise<PassRow | null> {
  const { data } = await db.from('customer_passes').select(PASS_COLS).eq('company_id', companyId).eq('id', id).maybeSingle()
  return data || null
}

async function view(db: any, company: any, pass: PassRow) {
  const tz = resolveBookingSettings(company?.booking_settings).timezone
  const [withS] = await withState(db, [pass], tz)
  const [{ data: uses }, { data: charges }] = await Promise.all([
    db.from('pass_uses').select('id, booking_id, class_at, used_by, returned_at, created_at').eq('pass_id', pass.id).order('class_at', { ascending: false }).limit(200),
    db.from('pass_charges').select('id, amount_cents, currency, paid_how, period_start, period_end, paid_at').eq('pass_id', pass.id).order('paid_at', { ascending: false }).limit(100),
  ])
  const ids = (uses || []).map((u: any) => u.booking_id).filter(Boolean)
  const { data: bookings } = ids.length ? await db.from('bookings').select('id, service_name, starts_at, status, staff_name').in('id', ids) : { data: [] }
  const byId = new Map((bookings || []).map((b: any) => [b.id, b]))
  return {
    pass: withS, timezone: tz,
    uses: (uses || []).map((u: any) => ({ ...u, booking: byId.get(u.booking_id) || null })),
    charges: charges || [],
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = passDb()
    const a = await passAccess(req, db, req.nextUrl.searchParams.get('companyId'), 'staff')
    if (!a.ok) return a.res
    const pass = await load(db, a.companyId, id)
    if (!pass) return json({ error: 'That pass wasn’t found.' }, 404)
    const { data: company } = await db.from('companies').select(COMPANY_PAY_COLS).eq('id', a.companyId).maybeSingle()
    return json(await view(db, company, pass))
  } catch (e: any) {
    return passError(e, 'Could not load the pass.')
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = passDb()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const a = await passAccess(req, db, body.companyId, ['sync', 'use'].includes(action) ? 'staff' : 'admin')
    if (!a.ok) return a.res
    const pass = await load(db, a.companyId, id)
    if (!pass) return json({ error: 'That pass wasn’t found.' }, 404)
    const { data: company } = await db.from('companies').select(COMPANY_PAY_COLS).eq('id', a.companyId).maybeSingle()
    const who = pass.customer_name || 'A customer'
    const now = new Date().toISOString()

    if (action === 'adjust') {
      if (pass.kind !== 'pack') return json({ error: 'Only a class pack has classes to add or take off.' }, 400)
      const delta = Math.round(Number(body.delta))
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_CREDITS) return json({ error: 'How many classes?' }, 400)
      const total = (pass.credits_total || 0) + delta
      if (total < pass.credits_used) return json({ error: `${pass.credits_used} class${pass.credits_used === 1 ? ' has' : 'es have'} already been used.` }, 400)
      if (total > MAX_CREDITS) return json({ error: 'That’s more classes than a pass can hold.' }, 400)
      // Only if nobody changed it meanwhile (a class booked, another adjustment).
      const { data: done } = await db.from('customer_passes').update({ credits_total: total, updated_at: now })
        .eq('id', pass.id).eq('credits_total', pass.credits_total).eq('credits_used', pass.credits_used).select('id')
      if (!done?.length) return json({ error: 'This pass just changed. Have another look and try again.' }, 409)
      const note = String(body.note || '').trim().slice(0, 200)
      await audit(req, db, a.companyId, 'pass_updated', `${who}’s ${pass.name}: ${delta > 0 ? `added ${delta}` : `took off ${-delta}`} class${Math.abs(delta) === 1 ? '' : 'es'}${note ? ` (${note})` : ''}`, { pass_id: pass.id, delta })
    } else if (action === 'extend') {
      if (pass.kind !== 'pack') return json({ error: 'Only a class pack has an expiry date.' }, 400)
      const days = Math.round(Number(body.days))
      if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: 'How many days?' }, 400)
      const from = Math.max(Date.now(), pass.expires_at ? Date.parse(pass.expires_at) : Date.now())
      const expires = new Date(from + days * 86_400_000).toISOString()
      await db.from('customer_passes').update({ expires_at: expires, ...(pass.status === 'expired' ? { status: 'active' } : {}), updated_at: now }).eq('id', pass.id)
      await audit(req, db, a.companyId, 'pass_updated', `${who}’s ${pass.name}: ${days} more days to use it`, { pass_id: pass.id, days })
    } else if (action === 'cancel') {
      const r = await cancelMembership(db, company, pass, { now: !!body.now })
      if (!r.ok) return json({ error: (r as { error: string }).error }, 400)
      await audit(req, db, a.companyId, 'pass_updated', `${who}’s ${pass.name}: cancelled${body.now ? ' now' : ' from the end of the period'}`, { pass_id: pass.id })
    } else if (action === 'resume') {
      const r = await resumeMembership(db, company, pass)
      if (!r.ok) return json({ error: (r as { error: string }).error }, 400)
      await audit(req, db, a.companyId, 'pass_updated', `${who}’s ${pass.name}: carries on (no longer ending)`, { pass_id: pass.id })
    } else if (action === 'sync') {
      if (pass.kind === 'membership' && pass.stripe_subscription_id) await syncMembership(db, company, pass)
    } else if (action === 'use') {
      const { data: b } = await db.from('bookings').select('id, company_id, contact_id, service_id, service_name, starts_at, status, pass_id, payment_status, conversation_id, customer_name')
        .eq('company_id', a.companyId).eq('id', String(body.bookingId || '')).maybeSingle()
      if (!b) return json({ error: 'Booking not found' }, 404)
      if (!['pending', 'confirmed'].includes(b.status)) return json({ error: 'That booking is cancelled or finished.' }, 400)
      if (b.pass_id) return json({ error: 'That booking is already paid with a pass.' }, 400)
      if (b.payment_status === 'paid') return json({ error: 'That booking has already been paid for.' }, 400)
      if (b.contact_id && pass.contact_id && b.contact_id !== pass.contact_id) return json({ error: 'That pass belongs to someone else.' }, 400)
      const options = await passOptionsFor(db, company, pass.contact_id || b.contact_id, b.service_id, Date.parse(b.starts_at))
      const opt = options.find(o => o.id === pass.id)
      if (opt && !opt.ok) return json({ error: opt.reason }, 400)
      const r = await usePass(db, { companyId: a.companyId, pass, bookingId: b.id, classAtMs: Date.parse(b.starts_at), by: a.name || 'The team' })
      if (!r.ok) return json({ error: (r as { error: string }).error }, 400)
      await systemNote(db, b, `🎟️ Paid with ${who.split(' ')[0]}’s ${pass.name}${r.left != null ? ` (${r.left} left)` : ''}.`).catch(() => null)
      await audit(req, db, a.companyId, 'pass_updated', `${who}’s ${pass.name}: used for ${b.service_name}`, { pass_id: pass.id, booking_id: b.id })
    } else {
      return json({ error: 'Unknown action' }, 400)
    }
    const fresh = await load(db, a.companyId, id)
    return json(await view(db, company, fresh || pass))
  } catch (e: any) {
    return passError(e, 'Could not update the pass.')
  }
}
