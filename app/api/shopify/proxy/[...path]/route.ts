import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyProxySignature } from '@/lib/shopify-auth'
import { serviceFor } from '@/lib/shopify-sync'
import { saveShopifyProducts } from '@/lib/shopify-products'
import { joinShopifyWaitlist } from '@/lib/shopify-waitlist'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Shopify app proxy: the storefront calls https://{store}/apps/colvy/<path>,
 * Shopify forwards it here with ?shop=&logged_in_customer_id=&path_prefix=
 * &timestamp=&signature= (HMAC with the app secret), stripping cookies. The
 * signature is what proves the shop — the body is the shopper's input only.
 *
 *   GET  /apps/colvy/ping      → { ok } (the block's setup check)
 *   POST /apps/colvy/waitlist  { product_id, variant_id?, ch: sms|email,
 *                                phone?, email?, name?, website (honeypot) }
 */

// Sign-ups per shopper IP (X-Forwarded-For, set by Shopify), per instance.
const hits = new Map<string, number[]>()
function limited(ip: string, max = 10, windowMs = 10 * 60_000) {
  if (!ip) return false
  const now = Date.now()
  const list = (hits.get(ip) || []).filter(t => now - t < windowMs)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k)
  return list.length > max
}

const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function storeFor(req: NextRequest) {
  const qs = req.nextUrl.searchParams
  if (!verifyProxySignature(qs)) return { error: json({ error: 'Invalid signature' }, 401) }
  const shop = String(qs.get('shop') || '').toLowerCase()
  const db = admin()
  const { data: integs } = await db.from('shopify_integrations').select('*').eq('store_domain', shop).eq('is_active', true).limit(1)
  const integ = integs?.[0]
  if (!integ) return { error: json({ error: 'This store isn’t connected to Colvy.' }, 404) }
  return { db, integ, qs }
}

const sub = (req: NextRequest) => req.nextUrl.pathname.replace(/^.*\/api\/shopify\/proxy\/?/, '').replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const s = await storeFor(req)
  if ('error' in s) return s.error
  if (sub(req) === 'ping') return json({ ok: true })
  return json({ error: 'Not found' }, 404)
}

export async function POST(req: NextRequest) {
  const s = await storeFor(req)
  if ('error' in s) return s.error
  const { db, integ, qs } = s
  if (sub(req) !== 'waitlist') return json({ error: 'Not found' }, 404)

  const b = await req.json().catch(() => ({}))
  // Bots fill every field; people never see this one.
  if (b?.website) return json({ ok: true, via: b.ch === 'email' ? 'email' : 'sms' })
  const ip = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  if (limited(ip)) return json({ error: 'Too many tries — please wait a few minutes.' }, 429)

  const r = await joinShopifyWaitlist(db, integ, {
    productId: b.product_id, variantId: b.variant_id, ch: b.ch, phone: b.phone, email: b.email, name: b.name,
    loggedInCustomerId: qs.get('logged_in_customer_id'),
  }, {
    fetchProduct: async (id) => {
      const svc = await serviceFor(db, integ)
      const node = await svc.getProduct(id)
      if (!node) return null
      await saveShopifyProducts(db, svc, integ.company_id, integ.id, [node])
      const { data } = await db.from('shopify_products').select('shopify_product_id, name, image, permalink, has_variations, variants, status')
        .eq('company_id', integ.company_id).eq('shopify_product_id', id).maybeSingle()
      return data
    },
  })
  return json(r.body, r.status)
}
