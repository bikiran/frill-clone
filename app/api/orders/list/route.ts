import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: live orders for a customer email, across the company's WooCommerce stores.
// Includes orders just created via Colvy that haven't synced to our table yet.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const email = req.nextUrl.searchParams.get('email')
    if (!companyId || !email) return NextResponse.json({ orders: [] })

    const db = admin()
    const { data: integs } = await db.from('woocommerce_integrations')
      .select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    if (!integs || integs.length === 0) return NextResponse.json({ orders: [] })

    const all: any[] = []
    for (const integ of integs) {
      if (!integ.store_url) continue
      try {
        const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })
        const orders = await woo.getOrdersByEmail(email)
        orders.forEach(o => all.push({ ...o, integration_id: integ.id, store_url: integ.store_url }))
      } catch {}
    }
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return NextResponse.json({ orders: all })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, orders: [] }, { status: 500 })
  }
}
