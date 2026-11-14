import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { stripeReady } from '@/lib/booking'
import { creditsWords, priceWords } from '@/lib/passes/rules'
import { PASS_COLS, withState, sellInPerson, passesPageUrl, passOptionsFor, type PassRow } from '@/lib/passes/server'
import { resolveBookingSettings } from '@/lib/booking'
import { passDb, passAccess, passError, json, COMPANY_PAY_COLS } from '@/lib/passes/api'

export const dynamic = 'force-dynamic'

// Passes customers have (lib/passes).
//   GET  ?companyId&show=live|members|packs|failed|ended|all&q=&contactId=
//        the passes, where each stands, and counts for the tiles
//   GET  ?companyId&contactId&booking=<id>   that customer's passes that can
//        pay for that booking (the booking drawer's "Use a pass")
//   POST { companyId, productId, contactId, how: 'cash'|'other'|'free'|'link', note? }
//        sell a pack in person (live straight away), or get the link the
//        customer buys it on (a membership is always bought by card)
export async function GET(req: NextRequest) {
  try {
    const db = passDb()
    const sp = req.nextUrl.searchParams
    const a = await passAccess(req, db, sp.get('companyId'), 'staff')
    if (!a.ok) return a.res
    const { data: company } = await db.from('companies').select(COMPANY_PAY_COLS).eq('id', a.companyId).maybeSingle()
    const tz = resolveBookingSettings(company?.booking_settings).timezone
    const contactId = sp.get('contactId')
    const bookingId = sp.get('booking')

    if (bookingId && contactId) {
      const { data: b } = await db.from('bookings').select('id, service_id, starts_at, pass_id').eq('company_id', a.companyId).eq('id', bookingId).maybeSingle()
      if (!b) return json({ error: 'Booking not found' }, 404)
      return json({ options: b.pass_id ? [] : await passOptionsFor(db, company, contactId, b.service_id, Date.parse(b.starts_at)) })
    }

    const show = sp.get('show') || 'live'
    let q = db.from('customer_passes').select(PASS_COLS).eq('company_id', a.companyId).neq('status', 'pending')
    if (contactId) q = q.eq('contact_id', contactId)
    if (show === 'live') q = q.in('status', ['active', 'past_due'])
    else if (show === 'members') q = q.eq('kind', 'membership').in('status', ['active', 'past_due'])
    else if (show === 'packs') q = q.eq('kind', 'pack').eq('status', 'active')
    else if (show === 'failed') q = q.eq('status', 'past_due')
    else if (show === 'ended') q = q.in('status', ['cancelled', 'expired'])
    const term = (sp.get('q') || '').trim().replace(/[%,()]/g, ' ').slice(0, 60)
    if (term) q = q.or(`customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,customer_phone.ilike.%${term}%,name.ilike.%${term}%`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
    if (error) throw error
    const passes = await withState(db, (data || []) as PassRow[], tz)

    // Tiles: everything live, whatever the filter.
    const { data: live } = await db.from('customer_passes').select('kind, status, price_cents, every_n, unit, expires_at, credits_total, credits_used').eq('company_id', a.companyId).in('status', ['active', 'past_due']).limit(5000)
    const soon = Date.now() + 14 * 86_400_000
    let members = 0, packs = 0, failed = 0, ending = 0, monthly = 0
    for (const p of live || []) {
      if (p.status === 'past_due') failed++
      if (p.kind === 'membership') {
        members++
        // A rough monthly figure: weekly × 52 / 12.
        if (p.status === 'active') monthly += p.unit === 'week' ? Math.round(p.price_cents * 52 / 12 / (p.every_n || 1)) : Math.round(p.price_cents / (p.every_n || 1))
      } else if (p.status === 'active' && (p.credits_total || 0) > (p.credits_used || 0)) {
        packs++
        if (p.expires_at && Date.parse(p.expires_at) < soon) ending++
      }
    }
    return json({ passes, counts: { members, packs, failed, ending, monthlyCents: monthly }, payReady: stripeReady(company), timezone: tz })
  } catch (e: any) {
    return passError(e, 'Could not load passes.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = passDb()
    const body = await req.json().catch(() => ({}))
    const a = await passAccess(req, db, body.companyId, 'staff')
    if (!a.ok) return a.res
    const how = ['cash', 'other', 'free', 'link'].includes(body.how) ? body.how as 'cash' | 'other' | 'free' | 'link' : null
    if (!how) return json({ error: 'How are they paying?' }, 400)
    const { data: product } = await db.from('pass_products').select('*').eq('company_id', a.companyId).eq('id', String(body.productId || '')).maybeSingle()
    if (!product || !product.active) return json({ error: 'Pick a pass that’s on sale.' }, 400)
    const { data: company } = await db.from('companies').select(COMPANY_PAY_COLS).eq('id', a.companyId).maybeSingle()

    if (how === 'link') {
      if (!stripeReady(company)) return json({ error: 'Connect Stripe (Settings → Payments) so customers can pay by card.' }, 400)
      return json({ url: passesPageUrl(company, product.id) })
    }
    if (product.kind !== 'pack') return json({ error: 'Memberships are paid by card each period: send them the sign-up link.' }, 400)
    const { data: contact } = await db.from('contacts').select('id, name, email, phone').eq('company_id', a.companyId).eq('id', String(body.contactId || '')).maybeSingle()
    if (!contact) return json({ error: 'Pick the customer.' }, 400)
    const pass = await sellInPerson(db, { company, product, contact, how, by: { id: a.userId, name: a.name }, note: body.note })
    const paid = how === 'free' ? 'free' : how === 'cash' ? `${priceWords(product)} cash` : `${priceWords(product)} paid in person`
    await audit(req, db, a.companyId, 'pass_sold', `${contact.name || 'A customer'}: ${product.name} (${creditsWords(product)}, ${paid})`, { pass_id: pass.id, contact_id: contact.id })
    const [withS] = await withState(db, [pass], resolveBookingSettings(company?.booking_settings).timezone)
    return json({ pass: withS })
  } catch (e: any) {
    return passError(e, 'Could not sell the pass.')
  }
}
