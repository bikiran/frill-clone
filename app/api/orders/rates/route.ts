import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRatesDetailed, shippingConfigured, activeProvider, type ShipAddress } from '@/lib/shipping'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function member(db: any, req: NextRequest, companyId: string): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return false
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return false
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return true
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return !!tm?.id
  } catch { return false }
}

/**
 * POST /api/orders/rates
 * Body: { companyId, orderId, weightGrams?, parcel? }
 *
 * Returns live Starshipit rates for the order's destination + parcel:
 *   { configured, rates: [{ carrier, service, serviceCode, price, currency, eta }] }
 * `configured: false` means no Starshipit credentials are set — the UI then
 * shows the manual carrier/service picker instead of live prices.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, orderId } = body
    if (!companyId || !orderId) return NextResponse.json({ error: 'companyId and orderId required' }, { status: 400 })
    const db = admin()
    if (!(await member(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    if (!shippingConfigured()) return NextResponse.json({ configured: false, rates: [] })

    const { data: order } = await db.from('orders').select('*').eq('id', orderId).eq('company_id', companyId).maybeSingle()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const a = order.shipping_address || {}
    const to: ShipAddress = {
      name: order.customer_name,
      address_1: a.address_1 || a.address1 || null,
      address_2: a.address_2 || a.address2 || null,
      city: a.city || null, state: a.state || null,
      postcode: a.postcode || null, country: a.country || 'AU',
      phone: order.customer_phone || a.phone || null, email: order.customer_email || null,
    }

    // Ship-from = the chosen location, else the company's primary one.
    let loc: any = null
    if (body.fromLocationId) {
      const r = await db.from('company_locations').select('*').eq('id', body.fromLocationId).eq('company_id', companyId).maybeSingle()
      loc = r.data
    }
    if (!loc) {
      const r = await db.from('company_locations').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).limit(1).maybeSingle()
      loc = r.data
    }
    const from: ShipAddress | null = loc ? {
      name: loc.label || null, address_1: loc.street_address || loc.address_1 || null, address_2: loc.unit || loc.address_2 || null,
      city: loc.suburb || loc.city || null, state: loc.state || null, postcode: loc.postcode || null, country: loc.country || 'AU', phone: loc.phone || null,
    } : null

    const { rates, raw, request } = await getRatesDetailed({
      to, from,
      weightGrams: Number(body.weightGrams) || null,
      parcel: body.parcel || null,
      currency: order.currency || 'AUD',
    })
    // Cheapest first — that's the choice a packer wants by default.
    rates.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity))
    // When zero rates come back with no error, the provider's own response is the
    // only thing that explains why — include it (and the request we sent) so the
    // panel's diagnostic can show it. Only on request, to keep the normal payload lean.
    const diag = body.debug ? { providerRaw: raw, providerRequest: request } : {}
    return NextResponse.json({ configured: true, provider: activeProvider(), rates, ...diag })
  } catch (e: any) {
    return NextResponse.json({ configured: shippingConfigured(), provider: activeProvider(), rates: [], error: e?.message || String(e) }, { status: 200 })
  }
}
