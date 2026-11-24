import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { appClientId, appForQuery, exchangeCode, isShopDomain } from '@/lib/shopify-auth'
import { ShopifyService } from '@/lib/shopify-service'
import { CLAIM_COOKIE, ERROR_COOKIE, FALLBACK_PAGE, PENDING_COOKIE, PENDING_TTL_MS, clearInstallCookies, connectStore, connectedElsewhere, installFailed, logInstallStep, savePendingInstall, setInstallCookie } from '@/lib/shopify-install'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Sign in (or sign up) to Colvy to finish; already signed in → straight to the workspace.
const SIGN_IN_TO_FINISH = 'https://colvy.com/signin?shopify=connect'

function back(to: string, params: Record<string, string>) {
  const u = new URL(to || FALLBACK_PAGE)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return NextResponse.redirect(u.toString())
}

// Shopify redirects here after the merchant approves the permissions:
//   ?code&hmac&shop&state&timestamp&host
// Verify it really came from Shopify (HMAC) for the shop we started with
// (state), exchange the code for tokens, then save the store to its workspace —
// or, for an install that started in Shopify with no workspace yet, hold it
// until the merchant signs in to Colvy (lib/shopify-install).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const shop = params.get('shop') || ''
  const state = params.get('state') || ''
  const code = params.get('code') || ''

  // Signed by the public app or the privately shared one (lib/shopify-auth).
  const app = appForQuery(params)
  // Every stop is logged (Super Admin → Webhook Explorer, source shopify_install)
  // and shown on the Shopify page, wherever the person ends up signing in.
  const fail = async (to: string | null | undefined, message: string, a: { detail?: string; companyId?: string | null; status?: 'rejected' | 'error' } = {}) => {
    await logInstallStep('callback', a.status || 'error', { shop, app, companyId: a.companyId || null, error: a.detail || message })
    return installFailed(req, to, message)
  }
  if (!app || !isShopDomain(shop) || !state || !code) {
    return fail(FALLBACK_PAGE, 'That Shopify response could not be verified. Please try installing again.', {
      status: 'rejected', detail: !app ? "Shopify's signature matched none of the app secrets on this deployment" : 'Missing shop, state or code',
    })
  }

  const db = admin()
  // Consume the state exactly once.
  const { data: claimed } = await db.from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', state).eq('kind', 'oauth').is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('*')
  const st = claimed?.[0]
  if (!st) return fail(FALLBACK_PAGE, 'This install link has expired. Open Colvy from your Shopify admin to try again.')
  const returnTo = st.return_to || FALLBACK_PAGE
  if (st.shop !== shop) return fail(returnTo, 'Shopify returned a different store than the one you started with.', { companyId: st.company_id })
  if ((st.app_client_id || null) !== appClientId(app)) return fail(returnTo, 'Shopify answered for a different Colvy app than the one you started with. Please try again.', { companyId: st.company_id })

  try {
    const tokens = await exchangeCode(shop, code, app)

    if (!st.company_id) {
      const info = await new ShopifyService({ storeDomain: shop, accessToken: tokens.accessToken }).getShopInfo()
      const name = info.name || shop
      const claim = await savePendingInstall(db, shop, tokens, name, app)
      await logInstallStep('callback', 'processed', { shop, app, note: 'Approved in Shopify: waiting for someone to sign in to Colvy and connect it' })
      const res = NextResponse.redirect(SIGN_IN_TO_FINISH)
      setInstallCookie(res, req, CLAIM_COOKIE, claim, PENDING_TTL_MS)
      setInstallCookie(res, req, PENDING_COOKIE, name.slice(0, 200), PENDING_TTL_MS, false)
      clearInstallCookies(res, req, [ERROR_COOKIE])
      return res
    }

    if (await connectedElsewhere(db, shop, st.company_id)) {
      return fail(returnTo, 'This store is already connected to another Colvy workspace. Disconnect it there first.', { companyId: st.company_id })
    }
    const id = await connectStore(db, { companyId: st.company_id, userId: st.user_id, shop, tokens, app })
    await logInstallStep('callback', 'processed', { shop, app, companyId: st.company_id, note: 'Connected' })
    const res = back(returnTo, { shopify: 'connected', store: id })
    clearInstallCookies(res, req, [ERROR_COOKIE])
    return res
  } catch (e: any) {
    return fail(returnTo, e?.message || 'Shopify install failed', { companyId: st.company_id })
  }
}
