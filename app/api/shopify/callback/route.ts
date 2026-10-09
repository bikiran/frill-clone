import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeCode, isShopDomain, verifyQueryHmac } from '@/lib/shopify-auth'
import { ShopifyService } from '@/lib/shopify-service'
import { CLAIM_COOKIE, FALLBACK_PAGE, PENDING_COOKIE, PENDING_TTL_MS, connectStore, connectedElsewhere, savePendingInstall, setInstallCookie } from '@/lib/shopify-install'

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

  if (!verifyQueryHmac(params) || !isShopDomain(shop) || !state || !code) {
    return back(FALLBACK_PAGE, { shopify_error: 'That Shopify response could not be verified. Please try installing again.' })
  }

  const db = admin()
  // Consume the state exactly once.
  const { data: claimed } = await db.from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', state).eq('kind', 'oauth').is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('*')
  const st = claimed?.[0]
  if (!st) return back(FALLBACK_PAGE, { shopify_error: 'This install link has expired. Open Colvy from your Shopify admin to try again.' })
  const returnTo = st.return_to || FALLBACK_PAGE
  if (st.shop !== shop) return back(returnTo, { shopify_error: 'Shopify returned a different store than the one you started with.' })

  try {
    const tokens = await exchangeCode(shop, code)

    if (!st.company_id) {
      const info = await new ShopifyService({ storeDomain: shop, accessToken: tokens.accessToken }).getShopInfo()
      const name = info.name || shop
      const claim = await savePendingInstall(db, shop, tokens, name)
      const res = NextResponse.redirect(SIGN_IN_TO_FINISH)
      setInstallCookie(res, req, CLAIM_COOKIE, claim, PENDING_TTL_MS)
      setInstallCookie(res, req, PENDING_COOKIE, name.slice(0, 200), PENDING_TTL_MS, false)
      return res
    }

    if (await connectedElsewhere(db, shop, st.company_id)) {
      return back(returnTo, { shopify_error: 'This store is already connected to another Colvy workspace. Disconnect it there first.' })
    }
    const id = await connectStore(db, { companyId: st.company_id, userId: st.user_id, shop, tokens })
    return back(returnTo, { shopify: 'connected', store: id })
  } catch (e: any) {
    return back(returnTo, { shopify_error: e?.message || 'Shopify install failed' })
  }
}
