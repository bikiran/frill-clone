import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveShopifyOrderRef, ShopifyActionError } from '@/lib/shopify-order-actions'
import { serviceFor } from '@/lib/shopify-sync'
import { loadShopifyRefunds, wooRefunds } from '@/lib/order-refunds'
import { readStoreJson } from '@/lib/store-response'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/orders/refunds?companyId=&orderId=&integrationId=
 *
 * Every refund on a WooCommerce or Shopify order (orderId "shopify-<id>"),
 * read live from the store so refunds made in the store's own admin show too:
 * when, how much, which items and how many of each, shipping, the reason, and
 * any part not tied to items. Shape: lib/order-refunds OrderRefund.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const orderId = req.nextUrl.searchParams.get('orderId')
    const integrationId = req.nextUrl.searchParams.get('integrationId')
    if (!companyId || !orderId) return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })

    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    try {
      const shop = await resolveShopifyOrderRef(db, companyId, { orderId })
      if (shop) return NextResponse.json({ refunds: await loadShopifyRefunds(await serviceFor(db, shop.integ), shop.externalId) })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e instanceof ShopifyActionError ? e.status : 502 })
    }

    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ refunds: [] })

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`
    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}/refunds?per_page=100`, { headers: { Authorization: auth } })
    if (res.status === 404) return NextResponse.json({ refunds: [] })
    let readErr = ''
    const list = await readStoreJson(res, { provider: 'woocommerce', store: integ.store_url }).catch((e: any) => { readErr = e?.message || ''; return null })
    if (readErr) return NextResponse.json({ error: readErr }, { status: 502 })
    if (!res.ok) return NextResponse.json({ error: list?.message || 'Couldn’t read the refunds from WooCommerce' }, { status: 502 })
    return NextResponse.json({ refunds: wooRefunds(list) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
