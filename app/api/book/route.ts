import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { addDays, dateInTz, isDate } from '@/lib/booking-time'
import {
  loadCompanyPublic, resolveBookingSettings, loadStaff, loadLocations, availability, createBooking,
  publicService, isMissingBookingSchema, stripeReady, amountDue, loadInvite, invitePrefill,
} from '@/lib/booking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Public booking page API (no sign-in).
//
// GET ?op=page&slug=|domain=                          → business, services, staff, locations
// GET ?op=slots&slug=&service=&staff=any|id&from=&to= → bookable start times (ISO)
// GET ?op=invite&slug=&token=                        → details to pre-fill (personal link)
// POST { slug|domain, serviceId, staff, startsAt, name, email, phone, timezone,
//        answers, locationId, address, notes }        → { token, checkoutUrl? }

async function loadPage(db: any, sp: URLSearchParams | any) {
  const company = await loadCompanyPublic(db, { slug: sp.get ? sp.get('slug') : sp.slug, domain: sp.get ? sp.get('domain') : sp.domain })
  if (!company) return { error: 'Not found', status: 404 }
  const settings = resolveBookingSettings(company.booking_settings)
  if (!settings.enabled) return { error: 'Online booking is turned off for this business.', status: 404 }
  return { company, settings }
}

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const op = sp.get('op') || 'page'
    const p: any = await loadPage(db, sp)
    if (p.error) return NextResponse.json({ error: p.error }, { status: p.status })
    const { company, settings } = p

    if (op === 'page') {
      const { data: services, error } = await db.from('booking_services').select('*').eq('company_id', company.id).eq('active', true).order('sort_order').order('created_at')
      if (error) {
        if (isMissingBookingSchema(error)) return NextResponse.json({ error: 'Online booking isn’t set up yet.' }, { status: 404 })
        throw error
      }
      const staff = await loadStaff(db, company)
      const bookable = staff.filter(s => settings.staff[s.id]?.bookable)
      const payReady = stripeReady(company)
      return NextResponse.json({
        company: { name: company.name, slug: company.slug, logo_url: company.logo_url, accent_color: company.accent_color },
        page: { show_in_widget: settings.show_in_widget, title: settings.page_title, intro: settings.intro, require_phone: settings.require_phone, require_email: settings.require_email, cancel_hours: settings.cancel_hours, refund_on_cancel: settings.refund_on_cancel, late_cancel: settings.late_cancel, allow_reschedule: settings.allow_reschedule },
        timezone: settings.timezone,
        // A paid service can't be booked until the business connects Stripe.
        services: (services || []).filter((s: any) => payReady || amountDue(s) === 0).map(publicService),
        staff: bookable.map(s => ({ id: s.id, name: s.name, avatar_url: s.avatar_url })),
        locations: await loadLocations(db, company.id),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (op === 'invite') {
      const inv = await loadInvite(db, sp.get('token'))
      if (!inv || inv.company_id !== company.id) return NextResponse.json({ prefill: null })
      return NextResponse.json({ prefill: await invitePrefill(db, inv) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (op === 'slots') {
      const serviceId = sp.get('service')
      const { data: service } = await db.from('booking_services').select('*').eq('id', serviceId).eq('company_id', company.id).eq('active', true).maybeSingle()
      if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      const tz = settings.timezone
      const today = dateInTz(Date.now(), tz)
      let from = isDate(sp.get('from')) ? sp.get('from')! : today
      let to = isDate(sp.get('to')) ? sp.get('to')! : addDays(from, 34)
      if (from < today) from = today
      const last = addDays(today, service.max_days_ahead || 60)
      if (to > last) to = last
      if (to > addDays(from, 45)) to = addDays(from, 45)
      if (to < from) return NextResponse.json({ timezone: tz, slots: [] })
      const staff = await loadStaff(db, company)
      const staffFilter = sp.get('staff') && sp.get('staff') !== 'any' ? sp.get('staff')! : 'any'
      const { slots } = await availability(db, { company, settings, service, staff, staffFilter, fromDate: from, toDate: to })
      return NextResponse.json({
        timezone: tz,
        slots: slots.map(s => ({ start: new Date(s.start).toISOString(), staff: s.resources.filter(Boolean), ...(s.seatsLeft != null ? { seatsLeft: s.seatsLeft } : {}) })),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

const clean = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    if (!checkBurst(`book:${callerKey(req)}`, 8)) return NextResponse.json({ error: 'Too many attempts — please wait a minute and try again.' }, { status: 429 })
    const p: any = await loadPage(db, b)
    if (p.error) return NextResponse.json({ error: p.error }, { status: p.status })
    const { company, settings } = p

    const { data: service } = await db.from('booking_services').select('*').eq('id', b.serviceId).eq('company_id', company.id).eq('active', true).maybeSingle()
    if (!service) return NextResponse.json({ error: 'That service is no longer available.' }, { status: 404 })

    const name = clean(b.name, 120)
    const email = clean(b.email, 200).toLowerCase() || null
    const phone = clean(b.phone, 40) || null
    if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Please check your email address.' }, { status: 400 })
    if (phone && phone.replace(/\D/g, '').length < 8) return NextResponse.json({ error: 'Please check your phone number.' }, { status: 400 })
    if (settings.require_email && !email) return NextResponse.json({ error: 'Please enter your email.' }, { status: 400 })
    if (settings.require_phone && !phone) return NextResponse.json({ error: 'Please enter your mobile number.' }, { status: 400 })
    if (!email && !phone) return NextResponse.json({ error: 'Please enter a phone number or email so we can confirm.' }, { status: 400 })

    // Answers: only the service's own questions, required ones enforced.
    const given: Record<string, any> = b.answers && typeof b.answers === 'object' ? b.answers : {}
    const answers: { id: string; label: string; value: string }[] = []
    for (const q of service.questions || []) {
      let v = given[q.id]
      v = q.type === 'checkbox' ? (v ? 'Yes' : '') : clean(v, q.type === 'textarea' ? 2000 : 300)
      if (q.type === 'select' && v && !(q.options || []).includes(v)) v = ''
      if (q.required && !v) return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 })
      if (v) answers.push({ id: q.id, label: q.label, value: v })
    }

    const startMs = Date.parse(String(b.startsAt || ''))
    if (!Number.isFinite(startMs)) return NextResponse.json({ error: 'Pick a time.' }, { status: 400 })
    const staffChoice = typeof b.staff === 'string' && /^[0-9a-f-]{36}$/i.test(b.staff) ? b.staff : 'any'
    const tz = clean(b.timezone, 60) || null

    const r = await createBooking(db, {
      company, service, staffChoice, startMs,
      customer: { name, email, phone, timezone: tz },
      answers,
      locationId: typeof b.locationId === 'string' ? b.locationId : null,
      address: clean(b.address, 300) || null,
      notes: clean(b.notes, 2000) || null,
      origin: req.nextUrl.origin,
      source: ['link', 'widget', 'embed', 'invite'].includes(b.source) ? b.source : 'page',
      inviteToken: typeof b.invite === 'string' ? b.invite : null,
    })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
    return NextResponse.json(r)
  } catch (e: any) {
    if (isMissingBookingSchema(e)) return NextResponse.json({ error: 'Online booking isn’t available yet.' }, { status: 503 })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
