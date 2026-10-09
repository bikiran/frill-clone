import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeCode, isShopDomain, tokenColumns, verifyQueryHmac } from '@/lib/shopify-auth'
import { ensureAppMetafields, ensureStoreWebhooks } from '@/lib/shopify-sync'
import { ShopifyService } from '@/lib/shopify-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const FALLBACK = 'https://colvy.com/admin/integrations/shopify'

function back(to: string, params: Record<string, string>) {
  const u = new URL(to || FALLBACK)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return NextResponse.redirect(u.toString())
}

// Shopify redirects here after the merchant approves the install:
//   ?code&hmac&shop&state&timestamp&host
// Verify it really came from Shopify (HMAC) for the shop we started with
// (state), exchange the code for tokens, save the store, subscribe webhooks.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const shop = params.get('shop') || ''
  const state = params.get('state') || ''
  const code = params.get('code') || ''

  if (!verifyQueryHmac(params) || !isShopDomain(shop) || !state || !code) {
    return back(FALLBACK, { shopify_error: 'That Shopify response could not be verified. Please try installing again.' })
  }

  const db = admin()
  // Consume the state exactly once.
  const { data: claimed } = await db.from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', state).is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('*')
  const st = claimed?.[0]
  if (!st) return back(FALLBACK, { shopify_error: 'This install link has expired. Start again from Colvy.' })
  const returnTo = st.return_to || FALLBACK
  if (st.shop !== shop) return back(returnTo, { shopify_error: 'Shopify returned a different store than the one you started with.' })

  try {
    const tokens = await exchangeCode(shop, code)
    const svc = new ShopifyService({ storeDomain: shop, accessToken: tokens.accessToken })
    const info = await svc.getShopInfo()

    const { data: integ, error } = await db.from('shopify_integrations').upsert({
      company_id: st.company_id,
      store_domain: shop,
      store_name: info.name || shop,
      auth_type: 'oauth',
      ...tokenColumns(tokens),
      api_version: null,
      is_active: true,
      uninstalled_at: null,
      installed_by: st.user_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,store_domain' }).select('id').single()
    if (error || !integ) throw new Error(error?.message || 'Could not save the store')

    // Webhooks keep Colvy current without polling. A failure here doesn't undo
    // the install — it's recorded and the store page offers a retry.
    try {
      await ensureStoreWebhooks(db, { id: integ.id, auth_type: 'oauth', webhook_topics: [] }, svc)
    } catch (e: any) {
      await db.from('shopify_integrations').update({ last_error: `Webhooks: ${e?.message || 'failed'}`.slice(0, 500) }).eq('id', integ.id)
    }
    // The theme extension's settings (workspace slug, brand colour); the
    // reconcile cron retries if this fails.
    try { await ensureAppMetafields(db, { id: integ.id, company_id: st.company_id, auth_type: 'oauth', app_metafields: null }, svc) } catch {}

    return back(returnTo, { shopify: 'connected', store: integ.id })
  } catch (e: any) {
    return back(returnTo, { shopify_error: e?.message || 'Shopify install failed' })
  }
}
