import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { loadCompanyPublic, resolveBookingSettings, stripeReady } from '@/lib/booking'
import { sessionFor } from '@/lib/portal/auth'
import { creditsWords, priceWords, productTerms, passState } from '@/lib/passes/rules'
import {
  loadProducts, startPurchase, verifyPurchase, passOptionsFor, cancelMembership, isMissingPassSchema,
  PASS_COLS, type PassRow,
} from '@/lib/passes/server'

export const dynamic = 'force-dynamic'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const json = (d: any, status = 200) => NextResponse.json(d, { status, headers: { 'Cache-Control': 'no-store' } })
const clean = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

// Class packs and memberships on the public booking page (no Colvy sign-in).
//   GET  ?slug|domain                          what's for sale
//   GET  ?slug|domain&op=verify&pass&session_id   after paying: is the pass ready?
//   GET  ?slug|domain&op=mine&service&start   Bearer (account sign-in)  the
//        customer's passes, and which can pay for that class
//   POST { slug|domain, productId, name, email, phone, returnUrl? }  → { url } (Stripe)
//   POST { slug|domain, action: 'cancel', passId }   Bearer  end a membership
//        at the end of the period paid for
async function business(d: any, q: { slug?: string | null; domain?: string | null }) {
  const company = await loadCompanyPublic(d, { slug: q.slug || null, domain: q.domain || null })
  if (!company) return null
  return company
}

export async function GET(req: NextRequest) {
  try {
    const d = db()
    const sp = req.nextUrl.searchParams
    if (!checkBurst(`passes-get:${callerKey(req)}`, 60)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const company = await business(d, { slug: sp.get('slug'), domain: sp.get('domain') })
    if (!company) return json({ error: 'Not found' }, 404)
    const op = sp.get('op') || 'list'
    const tz = resolveBookingSettings(company.booking_settings).timezone

    if (op === 'list') {
      const payReady = stripeReady(company)
      const active = await loadProducts(d, company.id)
      const products = payReady ? active.filter(p => p.sell_online && p.price_cents >= 100) : []
      // The classes a pass can pay for (including passes only sold in person):
      // the booking page offers "Use my pass" on these.
      const useFor: string[] | 'all' = active.some(p => !p.service_ids?.length) ? 'all' : [...new Set(active.flatMap(p => p.service_ids || []))]
      const { data: services } = await d.from('booking_services').select('id, name').eq('company_id', company.id).eq('active', true).neq('kind', 'reservation')
      const names = new Map((services || []).map((s: any) => [s.id, s.name]))
      return json({
        products: products.map(p => ({
          id: (p as any).id, kind: p.kind, name: p.name, description: p.description,
          price: priceWords(p), price_cents: p.price_cents, currency: p.currency, gives: creditsWords(p), terms: productTerms(p),
          covers: p.service_ids?.length ? p.service_ids.map(id => names.get(id)).filter(Boolean) : null,
          service_ids: p.service_ids || [],
        })),
        useFor: active.length ? useFor : [],
      })
    }

    if (op === 'verify') {
      const passId = sp.get('pass') || '', sessionId = sp.get('session_id') || ''
      if (!/^[0-9a-f-]{36}$/i.test(passId) || !/^cs_[\w]+$/.test(sessionId)) return json({ error: 'Not found' }, 404)
      const { data: pass } = await d.from('customer_passes').select(PASS_COLS).eq('id', passId).eq('company_id', company.id).maybeSingle() as { data: PassRow | null }
      if (!pass) return json({ error: 'Not found' }, 404)
      let fresh: PassRow = pass
      if (pass.status === 'pending') {
        const r = await verifyPurchase(d, company, passId, sessionId).catch(() => null)
        if (r?.pass) fresh = r.pass
        if (r?.ok && !r.pass) {
          const { data } = await d.from('customer_passes').select(PASS_COLS).eq('id', passId).maybeSingle()
          if (data) fresh = data
        }
      }
      const st = passState(fresh, Date.now(), 0, tz)
      return json({ pass: { name: fresh.name, kind: fresh.kind, status: fresh.status, label: st.label, when: st.when, gives: creditsWords(fresh), email: fresh.customer_email ? fresh.customer_email.replace(/^(.).*(@.*)$/, '$1•••$2') : null } })
    }

    if (op === 'mine') {
      const s = await sessionFor(d, req, company.id)
      if (!s) return json({ error: 'Sign in again to use your pass.', signIn: true }, 401)
      const serviceId = sp.get('service') || ''
      const start = Date.parse(sp.get('start') || '')
      if (!/^[0-9a-f-]{36}$/i.test(serviceId) || !Number.isFinite(start)) return json({ error: 'Pick a class and time first.' }, 400)
      const { data: contact } = await d.from('contacts').select('name, email, phone').eq('company_id', company.id).eq('id', s.contactId).maybeSingle()
      return json({ options: await passOptionsFor(d, company, s.contactId, serviceId, start), me: contact ? { name: contact.name || '', email: contact.email || '', phone: contact.phone || '' } : null })
    }
    return json({ error: 'Unknown op' }, 400)
  } catch (e: any) {
    if (isMissingPassSchema(e)) return json({ products: [] })
    return json({ error: e?.message || 'Something went wrong.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const d = db()
    const b = await req.json().catch(() => ({}))
    if (!checkBurst(`passes-post:${callerKey(req)}`, 8)) return json({ error: 'Too many attempts. Please wait a minute and try again.' }, 429)
    const company = await business(d, { slug: b.slug, domain: b.domain })
    if (!company) return json({ error: 'Not found' }, 404)

    if (b.action === 'cancel') {
      const s = await sessionFor(d, req, company.id)
      if (!s) return json({ error: 'Sign in again first.', signIn: true }, 401)
      const { data: pass } = await d.from('customer_passes').select(PASS_COLS).eq('company_id', company.id).eq('id', String(b.passId || '')).eq('contact_id', s.contactId).maybeSingle()
      if (!pass) return json({ error: 'That membership wasn’t found.' }, 404)
      const r = await cancelMembership(d, company, pass, { now: false })
      if (!r.ok) return json({ error: (r as { error: string }).error }, 400)
      try {
        const { notifyCompany } = await import('@/lib/notify')
        await notifyCompany({ db: d, companyId: company.id, type: 'booking', message: `${pass.customer_name || 'A member'} cancelled their ${pass.name}. It ends when the period they’ve paid for runs out.` } as any)
      } catch {}
      const st = passState(r.pass, Date.now(), 0, resolveBookingSettings(company.booking_settings).timezone)
      return json({ ok: true, when: st.when })
    }

    const name = clean(b.name, 120)
    const email = clean(b.email, 200).toLowerCase() || null
    const phone = clean(b.phone, 40) || null
    if (!name) return json({ error: 'Please enter your name.' }, 400)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please enter your email: your pass and receipts go there.' }, 400)
    if (phone && phone.replace(/\D/g, '').length < 8) return json({ error: 'Please check your mobile number.' }, 400)
    const { data: product } = await d.from('pass_products').select('*').eq('company_id', company.id).eq('id', String(b.productId || '')).eq('active', true).eq('sell_online', true).maybeSingle()
    if (!product) return json({ error: 'That pass isn’t on sale any more.' }, 404)
    // Back to where they bought it (this business's own booking page only).
    let returnUrl: string | undefined
    try {
      const u = new URL(String(b.returnUrl || ''))
      if (u.origin === req.nextUrl.origin && /\/book(\/|$)/.test(u.pathname)) { u.search = ''; u.searchParams.set('passes', '1'); returnUrl = u.toString() }
    } catch {}
    const r = await startPurchase(d, { company, product, buyer: { name, email, phone }, origin: req.nextUrl.origin, returnUrl })
    if (!r.ok) return json({ error: (r as { error: string }).error }, (r as { status?: number }).status || 400)
    return json({ url: r.url })
  } catch (e: any) {
    if (isMissingPassSchema(e)) return json({ error: 'Passes aren’t available here yet.' }, 503)
    return json({ error: e?.message || 'Something went wrong.' }, 500)
  }
}
