import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { buildAuthorizeUrl, normalizeShop, shopifyAppConfigured } from '@/lib/shopify-auth'
import { INTENT_COOKIE, INTENT_TTL_MS, appListingUrl, connectedElsewhere, setInstallCookie } from '@/lib/shopify-install'

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

// POST { companyId, returnTo } → { url }: "Install from Shopify". Installs
// start in Shopify (App Store rule — Colvy never asks for a store address), so
// we remember which workspace asked (an intent row + httpOnly cookie shared
// across colvy.com) and send the browser to the Colvy listing. When Shopify
// opens the App URL after the install, the store joins this workspace.
//
// POST { companyId, shop, returnTo } → { url }: back through Shopify's
// permission screen for a store this workspace already has (reconnect,
// reinstall, approve new permissions, or switch a token store to the app).
// A one-time state row ties the callback back to this workspace and person.
export async function POST(req: NextRequest) {
  try {
    if (!shopifyAppConfigured()) return NextResponse.json({ error: 'The Colvy Shopify app is not set up yet (SHOPIFY_API_KEY / SHOPIFY_API_SECRET).' }, { status: 503 })
    const { companyId, shop: rawShop, returnTo } = await req.json().catch(() => ({}))
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const nonce = crypto.randomBytes(24).toString('hex')

    if (!rawShop) {
      const { error } = await db.from('shopify_oauth_states').insert({
        nonce, kind: 'intent', company_id: companyId, user_id: access.userId || null, shop: null,
        return_to: safeReturn(returnTo),
        expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const res = NextResponse.json({ url: appListingUrl() })
      setInstallCookie(res, req, INTENT_COOKIE, nonce, INTENT_TTL_MS)
      return res
    }

    const shop = normalizeShop(rawShop)
    const { data: mine } = shop
      ? await db.from('shopify_integrations').select('id').eq('company_id', companyId).eq('store_domain', shop).limit(1)
      : { data: [] as any[] }
    if (!shop || !mine?.length) return NextResponse.json({ error: 'Install Colvy from the Shopify App Store to connect a new store.' }, { status: 400 })
    if (await connectedElsewhere(db, shop, companyId)) return NextResponse.json({ error: 'This store is already connected to another Colvy workspace. Disconnect it there first.' }, { status: 409 })

    const { error } = await db.from('shopify_oauth_states').insert({
      nonce, kind: 'oauth', company_id: companyId, user_id: access.userId || null, shop,
      return_to: safeReturn(returnTo),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: buildAuthorizeUrl(shop, nonce) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
