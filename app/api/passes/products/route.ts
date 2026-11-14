import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { stripeReady, bookingPageUrl } from '@/lib/booking'
import { cleanProduct } from '@/lib/passes/rules'
import { loadProducts } from '@/lib/passes/server'
import { passDb, passAccess, passError, json, COMPANY_PAY_COLS } from '@/lib/passes/api'

export const dynamic = 'force-dynamic'

// Class packs and memberships the business sells (lib/passes).
//   GET  ?companyId     the products (on sale and archived), the classes they
//                       can cover, how many of each are live, and whether
//                       card payments are set up
//   POST { companyId, ...product }   a new one (owners and admins)
export async function GET(req: NextRequest) {
  try {
    const db = passDb()
    const a = await passAccess(req, db, req.nextUrl.searchParams.get('companyId'), 'staff')
    if (!a.ok) return a.res
    const [products, services, company, live] = await Promise.all([
      loadProducts(db, a.companyId, { all: true }),
      db.from('booking_services').select('id, name, capacity, active, kind').eq('company_id', a.companyId).neq('kind', 'reservation').order('sort_order').then((r: any) => r.data || []),
      db.from('companies').select(COMPANY_PAY_COLS).eq('id', a.companyId).maybeSingle().then((r: any) => r.data),
      db.from('customer_passes').select('product_id').eq('company_id', a.companyId).eq('status', 'active').limit(5000).then((r: any) => r.data || []),
    ])
    const counts: Record<string, number> = {}
    for (const r of live) if (r.product_id) counts[r.product_id] = (counts[r.product_id] || 0) + 1
    return json({
      products: products.map(p => ({ ...p, live: counts[(p as any).id] || 0 })),
      services: services.map((s: any) => ({ id: s.id, name: s.name, group: (s.capacity || 1) > 1, active: s.active })),
      payReady: stripeReady(company), bookingUrl: company ? bookingPageUrl(company) : null,
    })
  } catch (e: any) {
    return passError(e, 'Could not load passes.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = passDb()
    const body = await req.json().catch(() => ({}))
    const a = await passAccess(req, db, body.companyId, 'admin')
    if (!a.ok) return a.res
    let row
    try { row = cleanProduct(body) } catch (e: any) { return json({ error: e.message }, 400) }
    const { data, error } = await db.from('pass_products').insert({ ...row, company_id: a.companyId }).select('*').maybeSingle()
    if (error) throw error
    await audit(req, db, a.companyId, 'pass_product_updated', `Added ${row.kind === 'pack' ? 'a class pack' : 'a membership'}: ${row.name}`, { product_id: data?.id })
    return json({ product: { ...data, live: 0 } })
  } catch (e: any) {
    return passError(e, 'Could not save it.')
  }
}
