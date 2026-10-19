import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { loadCompanyPublic, resolveBookingSettings, isMissingBookingSchema, stripeReady, amountDue } from '@/lib/booking'
import { joinWaitlist, offerView, leaveByToken, isMissingWaitlist } from '@/lib/booking-waitlist'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The booking waitlist, public side (no sign-in). lib/booking-waitlist.ts.
//
// GET  ?op=offer&slug=|domain=&token=         → what a claim link shows
// POST { action: 'join', slug|domain, serviceId, name, phone, email?,
//        days? | from + to, window, locationId?, consent: true, website (honeypot) }
// POST { action: 'leave', slug|domain, token }  → off the waitlist

async function loadPage(db: any, q: { slug?: string | null; domain?: string | null }) {
  const company = await loadCompanyPublic(db, { slug: q.slug, domain: q.domain })
  if (!company) return { error: 'Not found', status: 404 }
  const settings = resolveBookingSettings(company.booking_settings)
  if (!settings.enabled) return { error: 'Online booking is turned off for this business.', status: 404 }
  return { company, settings }
}

const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    if (!checkBurst(`book-waitlist-get:${callerKey(req)}`, 30)) return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
    const p: any = await loadPage(db, { slug: sp.get('slug'), domain: sp.get('domain') })
    if (p.error) return NextResponse.json({ error: p.error }, { status: p.status })
    if (sp.get('op') === 'offer') {
      const view = await offerView(db, p.company, String(sp.get('token') || ''))
      if (!view) return NextResponse.json({ offer: null }, { headers: { 'Cache-Control': 'no-store' } })
      return NextResponse.json({ offer: view }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
  } catch (e: any) {
    if (isMissingWaitlist(e) || isMissingBookingSchema(e)) return NextResponse.json({ offer: null })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

const clean = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    if (!checkBurst(`book-waitlist:${callerKey(req)}`, 6)) return NextResponse.json({ error: 'Too many attempts — please wait a minute and try again.' }, { status: 429 })
    const p: any = await loadPage(db, b)
    if (p.error) return NextResponse.json({ error: p.error }, { status: p.status })
    const { company, settings } = p

    if (b.action === 'leave') {
      const ok = await leaveByToken(db, company, String(b.token || ''))
      return NextResponse.json({ ok })
    }

    if (b.action !== 'join') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    // A bot filled the hidden field: say yes, do nothing.
    if (b.website) return NextResponse.json({ ok: true, wants: '', smsBlocked: false })
    if (b.consent !== true) return NextResponse.json({ error: 'Please tick the box so we can text you when a spot opens.' }, { status: 400 })
    const { data: service } = await db.from('booking_services').select('*').eq('id', b.serviceId).eq('company_id', company.id).eq('active', true).maybeSingle()
    if (!service || (!stripeReady(company) && amountDue(service) > 0)) return NextResponse.json({ error: 'That service is no longer available.' }, { status: 404 })
    const r = await joinWaitlist(db, {
      company, settings, service,
      input: {
        name: clean(b.name, 120), phone: clean(b.phone, 40), email: clean(b.email, 200) || null,
        days: Array.isArray(b.days) ? b.days.slice(0, 40).map((d: any) => clean(d, 10)) : null,
        from: clean(b.from, 10) || null, to: clean(b.to, 10) || null, window: clean(b.window, 12),
        locationId: typeof b.locationId === 'string' ? b.locationId : null, ip: ipOf(req), source: 'page',
      },
    })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, wants: r.wants, updated: r.updated, smsBlocked: r.smsBlocked })
  } catch (e: any) {
    if (isMissingWaitlist(e)) return NextResponse.json({ error: 'The waitlist isn’t available yet. Please contact the business directly.' }, { status: 503 })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
