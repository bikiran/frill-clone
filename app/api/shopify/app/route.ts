import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildAuthorizeUrl, isShopDomain, shopifyAppConfigured, verifyQueryHmac } from '@/lib/shopify-auth'
import { FALLBACK_PAGE, INTENT_COOKIE, clearInstallCookies, connectedElsewhere, hasAllScopes, takeIntent, workspacePage } from '@/lib/shopify-install'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const withParams = (to: string, params: Record<string, string>) => {
  const u = new URL(to || FALLBACK_PAGE)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

/**
 * GET /api/shopify/app — the app's "App URL" in the Shopify Dev Dashboard.
 *
 * Shopify opens this (signed: ?shop&hmac&timestamp&host) right after a merchant
 * installs Colvy, and whenever they open Colvy from their Shopify admin.
 *
 * A store that's connected and has every permission goes to its workspace's
 * Shopify page. Anything else — a new install, a reinstall, new permissions —
 * goes straight to Shopify's permission screen before any Colvy page (App Store
 * requirement), and the callback works out the workspace (lib/shopify-install).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const shop = (params.get('shop') || '').toLowerCase()
  if (!verifyQueryHmac(params) || !isShopDomain(shop) || !shopifyAppConfigured()) return NextResponse.redirect(FALLBACK_PAGE)

  const db = admin()
  const { data: rows } = await db.from('shopify_integrations')
    .select('id, company_id, is_active, auth_type, needs_reauth, scopes, access_token, updated_at')
    .eq('store_domain', shop).order('updated_at', { ascending: false })
  const list = rows || []
  const healthy = list.find((r: any) => r.is_active && r.auth_type === 'oauth' && !r.needs_reauth && r.access_token && hasAllScopes(r.scopes))

  // "Install from Shopify" in a Colvy workspace, moments ago in this browser.
  const intent = await takeIntent(db, req.cookies.get(INTENT_COOKIE)?.value)
  const done = (url: string) => {
    const res = NextResponse.redirect(url)
    if (intent) clearInstallCookies(res, req, [INTENT_COOKIE])
    return res
  }

  if (healthy && (!intent || intent.company_id === healthy.company_id)) {
    return done(withParams(await workspacePage(db, healthy.company_id), { store: healthy.id }))
  }
  if (intent && await connectedElsewhere(db, shop, intent.company_id)) {
    return done(withParams(intent.return_to || FALLBACK_PAGE, { shopify_error: 'This store is already connected to another Colvy workspace. Disconnect it there first.' }))
  }

  // Which workspace the callback saves the store to: the one that asked, else
  // the one it was connected to before (reinstall / new permissions), else
  // none yet — the merchant picks after signing in to Colvy.
  const prev = list.find((r: any) => r.auth_type === 'oauth') || list[0]
  const companyId = intent?.company_id || prev?.company_id || null
  const returnTo = intent?.return_to || (companyId ? await workspacePage(db, companyId) : null)

  const nonce = crypto.randomBytes(24).toString('hex')
  const { error } = await db.from('shopify_oauth_states').insert({
    nonce, kind: 'oauth', company_id: companyId, user_id: intent?.user_id || null, shop,
    return_to: returnTo,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
  if (error) return done(withParams(returnTo || FALLBACK_PAGE, { shopify_error: 'Could not start the Shopify sign-in. Please try again.' }))
  return done(buildAuthorizeUrl(shop, nonce))
}
