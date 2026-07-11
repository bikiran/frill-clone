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

// GET: list connected e-commerce stores + the store's real shipping methods +
// the company's Colvy business locations (for pickup).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const integrationId = req.nextUrl.searchParams.get('integrationId') || undefined
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const sources: any[] = []
    const { data: woo } = await db.from('woocommerce_integrations')
      .select('id, store_url, store_name, consumer_key, consumer_secret').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    for (const w of (woo || [])) {
      let label = w.store_name
      if (!label) { try { label = new URL(w.store_url).hostname.replace(/^www\./, '') } catch { label = w.store_url } }
      sources.push({ platform: 'woocommerce', id: w.id, label })
    }

    const { data: shop } = await db.from('shopify_integrations')
      .select('id, store_domain, store_name').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    for (const s of (shop || [])) {
      sources.push({ platform: 'shopify', id: s.id, label: s.store_name || s.store_domain, unsupported: true })
    }

    // Real shipping methods from the chosen (or first) WooCommerce store.
    let shippingMethods: any[] = []
    const activeWoo = integrationId ? (woo || []).find((w: any) => w.id === integrationId) : (woo || [])[0]
    if (activeWoo?.store_url) {
      try {
        const wooSvc = new WooCommerceService({ storeUrl: activeWoo.store_url, consumerKey: activeWoo.consumer_key, consumerSecret: activeWoo.consumer_secret })
        shippingMethods = await wooSvc.getShippingMethods()
      } catch {}
    }

    // Colvy business locations (for pickup).
    let locations: any[] = []
    try {
      const { data: locs } = await db.from('company_locations').select('id, label, suburb, state, street_address').eq('company_id', companyId).order('is_primary', { ascending: false })
      locations = locs || []
    } catch {}

    return NextResponse.json({ sources, shippingMethods, locations })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
