import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isShopDomain, verifyQueryHmac } from '@/lib/shopify-auth'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/shopify/app — the app's "App URL" in the Shopify Dev Dashboard.
 *
 * Shopify opens this (signed: ?shop&hmac&timestamp&host) when a merchant clicks
 * Colvy in their Shopify admin, or right after installing from an install link.
 * A store already connected goes to its workspace's Shopify page; a new one goes
 * to Colvy's Shopify page with the store filled in, where a signed-in person
 * picks up the install for their workspace (a Shopify-side click alone can't
 * tell us which Colvy workspace it belongs to).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const shop = (params.get('shop') || '').toLowerCase()
  const generic = new URL('https://colvy.com/admin/integrations/shopify')
  if (!verifyQueryHmac(params) || !isShopDomain(shop)) return NextResponse.redirect(generic.toString())

  const db = admin()
  const { data: integ } = await db.from('shopify_integrations').select('id, company_id, is_active')
    .eq('store_domain', shop).eq('is_active', true).order('updated_at', { ascending: false }).limit(1)
  const hit = integ?.[0]
  if (hit) {
    const { data: co } = await db.from('companies').select('slug').eq('id', hit.company_id).maybeSingle()
    const u = new URL(co?.slug ? `https://${co.slug}.colvy.com/admin/integrations/shopify` : generic.toString())
    u.searchParams.set('store', hit.id)
    return NextResponse.redirect(u.toString())
  }
  generic.searchParams.set('shop', shop)
  return NextResponse.redirect(generic.toString())
}
