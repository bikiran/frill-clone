import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listCarriers, activeProvider, shippingConfigured } from '@/lib/shipping'

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

// GET /api/orders/carriers?companyId=… → the provider's connected carriers plus
// the company's saved enabled-carrier selection (which carriers to quote).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    if (!(await member(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const { data: co } = await db.from('companies').select('shipping_settings').eq('id', companyId).maybeSingle()
    const enabled: string[] = Array.isArray(co?.shipping_settings?.enabled_carrier_ids) ? co!.shipping_settings.enabled_carrier_ids : []

    let carriers: any[] = []
    let error: string | null = null
    if (shippingConfigured()) {
      try { carriers = await listCarriers() } catch (e: any) { error = e?.message || String(e) }
    }
    return NextResponse.json({ configured: shippingConfigured(), provider: activeProvider(), carriers, enabledCarrierIds: enabled, error })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

// POST /api/orders/carriers { companyId, enabledCarrierIds } → save the selection.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId } = body
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    if (!(await member(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const ids = Array.isArray(body.enabledCarrierIds) ? body.enabledCarrierIds.filter((x: any) => typeof x === 'string') : []
    const { data: co } = await db.from('companies').select('shipping_settings').eq('id', companyId).maybeSingle()
    const next = { ...(co?.shipping_settings || {}), enabled_carrier_ids: ids }
    const { error } = await db.from('companies').update({ shipping_settings: next }).eq('id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, enabledCarrierIds: ids })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
