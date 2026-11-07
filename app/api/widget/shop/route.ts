import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isShopDomain } from '@/lib/shopify-auth'

export const dynamic = 'force-dynamic'

// GET ?shop=<store>.myshopify.com → { slug } for public/widget.js on a Shopify
// storefront. The Colvy chat app embed (shopify/extensions/colvy-theme) passes
// the store's own address as well as the workspace slug from its app
// metafield; when the metafield isn't there (not written yet, or a write that
// failed), this finds the workspace the store is connected to, so the chat
// still shows. Only stores connected through the app count. The answer is
// public (a workspace's slug is already in its widget code), and cached.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; slug: string | null }>()

export async function GET(req: NextRequest) {
  const shop = String(req.nextUrl.searchParams.get('shop') || '').trim().toLowerCase()
  if (!isShopDomain(shop)) return NextResponse.json({ slug: null }, { status: 400, headers: CORS })
  const hit = cache.get(shop)
  let slug: string | null = null
  if (hit && Date.now() - hit.at < TTL_MS) slug = hit.slug
  else {
    try {
      const db = admin()
      const { data: integs } = await db.from('shopify_integrations').select('company_id')
        .eq('store_domain', shop).eq('is_active', true).eq('auth_type', 'oauth').order('updated_at', { ascending: false }).limit(1)
      const companyId = integs?.[0]?.company_id
      if (companyId) {
        const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
        slug = co?.slug || null
      }
      if (cache.size > 5000) cache.clear()
      cache.set(shop, { at: Date.now(), slug })
    } catch { slug = null }
  }
  return NextResponse.json({ slug }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
