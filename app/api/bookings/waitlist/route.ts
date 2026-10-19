import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import { loadCompanyPublic, resolveBookingSettings, loadStaff, availability } from '@/lib/booking'
import { listWaitlist, removeEntry, offerTimeManually, processWaitlistJobs, isMissingWaitlist, WAITLIST_MIGRATION_HINT } from '@/lib/booking-waitlist'
import { withinHours } from '@/lib/booking-waitlist-rules'
import { QUIET_START, QUIET_END } from '@/lib/campaign-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The team's view of the booking waitlist (Bookings → Waitlist).
// GET   ?companyId=&status=live|waiting|offered|booked|expired|removed|all&serviceId=
// GET   ?companyId=&op=free&serviceId=&date=   → free times that day (to offer by hand)
// PATCH { companyId, id, action: 'remove' }
// POST  { companyId, action: 'offer', serviceId, startsAt } → offer a free time now
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const company = await loadCompanyPublic(db, { id: companyId })
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const settings = resolveBookingSettings(company.booking_settings)

    if (sp.get('op') === 'free') {
      const { data: service } = await db.from('booking_services').select('*').eq('id', sp.get('serviceId')).eq('company_id', company.id).maybeSingle()
      if (!service) return NextResponse.json({ slots: [] })
      const today = dateInTz(Date.now(), settings.timezone)
      const date = isDate(sp.get('date')) && sp.get('date')! >= today ? sp.get('date')! : today
      if (date > addDays(today, service.max_days_ahead || 60)) return NextResponse.json({ timezone: settings.timezone, slots: [] })
      const staff = await loadStaff(db, company)
      // The same notice the offer will need.
      const svc = { ...service, min_notice_mins: Math.max(service.min_notice_mins ?? 120, settings.waitlist.notice_mins) }
      const { slots } = await availability(db, { company, settings, service: svc, staff, staffFilter: 'any', fromDate: date, toDate: date })
      return NextResponse.json({ timezone: settings.timezone, slots: slots.map(s => ({ start: new Date(s.start).toISOString() })) })
    }

    const r: any = await listWaitlist(db, company.id, { status: sp.get('status') || 'all', serviceId: sp.get('serviceId') })
    if (r.error) {
      if (isMissingWaitlist(r.error)) return NextResponse.json({ entries: [], setupNeeded: true, hint: WAITLIST_MIGRATION_HINT, settings: settings.waitlist, timezone: settings.timezone })
      throw r.error
    }
    return NextResponse.json({ entries: r.entries, settings: settings.waitlist, timezone: settings.timezone }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (body.action !== 'remove') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const ok = await removeEntry(db, companyId, String(body.id || ''), access.userId ? `staff:${access.userId}` : 'staff')
    if (!ok) return NextResponse.json({ error: 'That person isn’t on the waitlist any more.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (isMissingWaitlist(e)) return NextResponse.json({ error: WAITLIST_MIGRATION_HINT }, { status: 400 })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (body.action !== 'offer') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const company = await loadCompanyPublic(db, { id: companyId })
    const settings = resolveBookingSettings(company?.booking_settings)
    if (!settings.waitlist.enabled) return NextResponse.json({ error: 'Turn the waitlist on in Settings first.' }, { status: 400 })
    const startMs = Date.parse(String(body.startsAt || ''))
    if (!Number.isFinite(startMs) || startMs <= Date.now()) return NextResponse.json({ error: 'Pick a free time that’s still to come.' }, { status: 400 })
    const { data: service } = await db.from('booking_services').select('id').eq('id', body.serviceId).eq('company_id', companyId).maybeSingle()
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    const queued = await offerTimeManually(db, companyId, service.id, startMs)
    if (!queued) return NextResponse.json({ error: WAITLIST_MIGRATION_HINT }, { status: 400 })
    // Work it now (inside sending hours) so the team sees the result.
    const r = await processWaitlistJobs(db, req.nextUrl.origin, { limit: 10, budgetMs: 40_000 })
    const later = !withinHours(Date.now(), settings.timezone, QUIET_START, QUIET_END)
    return NextResponse.json({ ok: true, offers: r.offers, held: r.held, deferred: later })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
