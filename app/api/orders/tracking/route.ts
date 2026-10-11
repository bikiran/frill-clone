import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { getOrderTracking } from '@/lib/tracking'
import { assessOrder, loadThresholds } from '@/lib/order-assess'
import { shipstationConfigured } from '@/lib/shipstation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any

/**
 * GET /api/orders/tracking?companyId=&order=<number>
 * Where an order is, from every tracking source (Colvy labels, ShipStation,
 * WooCommerce), plus whether it looks normal. Saves what it finds onto the
 * order. Without `order`: just the settings (is ShipStation tracking on?).
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const d = db()
  if (!(await requireCompanyAccess(req, d, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: co } = await d.from('companies').select('shipping_settings').eq('id', companyId).maybeSingle()
  const settings = { shipstationConfigured: shipstationConfigured(), shipstationTracking: !!co?.shipping_settings?.shipstation_tracking }
  const num = String(req.nextUrl.searchParams.get('order') || '').replace(/^#/, '').trim()
  if (!num) return NextResponse.json({ settings })
  const { data: order } = await d.from('orders').select('*').eq('company_id', companyId).eq('order_number', num).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!order) return NextResponse.json({ settings, error: `No order #${num} in Colvy yet.` }, { status: 404 })
  const tracking = await getOrderTracking(d, companyId!, order, { live: true, save: true })
  const assessment = assessOrder(tracking, await loadThresholds(d, companyId!))
  return NextResponse.json({ settings, order: { id: order.id, number: order.order_number, customer: order.customer_name, status: order.status }, tracking, assessment })
}

/** POST /api/orders/tracking { companyId, shipstationTracking } — switch ShipStation tracking on or off. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const d = db()
  if (!(await requireCompanyAccess(req, d, body?.companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: co } = await d.from('companies').select('shipping_settings').eq('id', body.companyId).maybeSingle()
  const next = { ...(co?.shipping_settings || {}), shipstation_tracking: !!body.shipstationTracking }
  const { error } = await d.from('companies').update({ shipping_settings: next }).eq('id', body.companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, shipstationTracking: next.shipstation_tracking })
}
