import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { buildAuthorizeUrl, normalizeShop, shopifyAppConfigured } from '@/lib/shopify-auth'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Where the callback may send people back to: the workspace's own admin.
function safeReturn(raw: any): string {
  const fallback = 'https://colvy.com/admin/integrations/shopify'
  try {
    const u = new URL(String(raw || ''))
    const okHost = u.hostname === 'colvy.com' || u.hostname.endsWith('.colvy.com') || u.hostname === 'localhost'
    if (!okHost || !u.pathname.startsWith('/admin/')) return fallback
    return `${u.origin}${u.pathname}`
  } catch { return fallback }
}

// POST { companyId, shop, returnTo } → { url } to send the browser to Shopify's
// install/consent screen. A one-time state row ties the callback back to this
// workspace and person (the browser redirect itself can't carry our session).
export async function POST(req: NextRequest) {
  try {
    if (!shopifyAppConfigured()) return NextResponse.json({ error: 'The Colvy Shopify app is not set up yet (SHOPIFY_API_KEY / SHOPIFY_API_SECRET).' }, { status: 503 })
    const { companyId, shop: rawShop, returnTo } = await req.json().catch(() => ({}))
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const shop = normalizeShop(rawShop)
    if (!shop) return NextResponse.json({ error: 'Enter your store’s myshopify.com address, e.g. my-store.myshopify.com' }, { status: 400 })

    // A store installed in another workspace keeps sending its webhooks there —
    // don't let a second workspace silently take it over.
    const { data: elsewhere } = await db.from('shopify_integrations').select('company_id')
      .eq('store_domain', shop).eq('auth_type', 'oauth').eq('is_active', true).neq('company_id', companyId).limit(1)
    if (elsewhere?.length) return NextResponse.json({ error: 'This store is already connected to another Colvy workspace. Disconnect it there first.' }, { status: 409 })

    const nonce = crypto.randomBytes(24).toString('hex')
    const { error } = await db.from('shopify_oauth_states').insert({
      nonce, company_id: companyId, user_id: access.userId || null, shop,
      return_to: safeReturn(returnTo),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: buildAuthorizeUrl(shop, nonce) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
