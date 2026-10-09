// How a Shopify store gets connected to a Colvy workspace.
//
// Shopify's App Store rules: an install starts in Shopify (App Store listing,
// or the Dev Dashboard for a development store), never by typing a
// myshopify.com address into Colvy, and Shopify's permission screen (OAuth)
// comes before anything else. So:
//
//  1. Shopify opens the App URL (/api/shopify/app) for the store. Unless the
//     store is already connected and healthy, we go straight to Shopify's
//     permission screen.
//  2. The callback needs to know which workspace the store belongs to:
//     - "Install from Shopify" in Colvy left an intent cookie → that workspace;
//     - the store was connected before (reinstall, new permissions) → its workspace;
//     - otherwise the tokens wait in shopify_pending_installs and the merchant
//       signs in (or signs up) to Colvy, where the Shopify page offers to
//       connect the store to their workspace. The claim token lives only in an
//       httpOnly cookie on the browser that did the install.

import crypto from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { SHOPIFY_SCOPES, tokenColumns, type ShopifyTokenSet } from '@/lib/shopify-auth'
import { ensureAppMetafields, ensureStoreWebhooks } from '@/lib/shopify-sync'
import { ShopifyService } from '@/lib/shopify-service'

export const INTENT_COOKIE = 'colvy_shopify_intent'   // httpOnly: an intent nonce
export const CLAIM_COOKIE = 'colvy_shopify_claim'     // httpOnly: a pending-install claim token
export const PENDING_COOKIE = 'colvy_shopify_pending' // readable: the store's name, so pages can say what's waiting

export const INTENT_TTL_MS = 30 * 60 * 1000
export const PENDING_TTL_MS = 60 * 60 * 1000

export const FALLBACK_PAGE = 'https://colvy.com/admin/integrations/shopify'

// Where "Install from Shopify" sends people: the Colvy listing on the App Store.
export const appListingUrl = () => process.env.SHOPIFY_APP_LISTING_URL || 'https://apps.shopify.com/colvy'

export const hashToken = (t: string) => crypto.createHash('sha256').update(String(t || '')).digest('hex')

// Cookies are shared across colvy.com and every workspace subdomain, so an
// install started on roxy.colvy.com is recognised when Shopify comes back to
// colvy.com (and the other way round).
function cookieDomain(host: string): string | undefined {
  const h = String(host || '').split(':')[0].toLowerCase()
  return h === 'colvy.com' || h.endsWith('.colvy.com') ? '.colvy.com' : undefined
}

export function setInstallCookie(res: NextResponse, req: NextRequest, name: string, value: string, maxAgeMs: number, httpOnly = true) {
  res.cookies.set(name, value, {
    domain: cookieDomain(req.headers.get('host') || req.nextUrl.hostname),
    path: '/', httpOnly, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:',
    maxAge: Math.floor(maxAgeMs / 1000),
  })
}

export function clearInstallCookies(res: NextResponse, req: NextRequest, names: string[]) {
  for (const n of names) setInstallCookie(res, req, n, '', 0, n !== PENDING_COOKIE)
}

// Every permission Colvy asks for is granted (a write_ scope covers its read_).
// An unknown grant (no scopes stored) counts as complete so we never loop.
export function hasAllScopes(granted: string | null | undefined, wanted = process.env.SHOPIFY_SCOPES || SHOPIFY_SCOPES): boolean {
  const have = String(granted || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!have.length) return true
  return wanted.split(',').map(s => s.trim()).filter(Boolean)
    .every(s => have.includes(s) || (s.startsWith('read_') && have.includes(`write_${s.slice(5)}`)))
}

// The workspace's own Shopify page.
export async function workspacePage(db: any, companyId: string | null | undefined): Promise<string> {
  if (!companyId) return FALLBACK_PAGE
  const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
  return co?.slug ? `https://${co.slug}.colvy.com/admin/integrations/shopify` : FALLBACK_PAGE
}

// Take (once) the "Install from Shopify" intent behind a cookie value.
export async function takeIntent(db: any, nonce: string | undefined | null) {
  if (!nonce) return null
  const { data } = await db.from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', nonce).eq('kind', 'intent').is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('company_id, user_id, return_to')
  return data?.[0] || null
}

// Save a store against a workspace: tokens, live updates (webhooks), and the
// theme extension's settings. Webhook/metafield failures don't undo the
// connection — they're recorded and the store page (or the cron) retries.
export async function connectStore(db: any, a: { companyId: string; userId?: string | null; shop: string; tokens: ShopifyTokenSet; storeName?: string | null }): Promise<string> {
  const svc = new ShopifyService({ storeDomain: a.shop, accessToken: a.tokens.accessToken })
  let name = a.storeName || null
  if (!name) { try { name = (await svc.getShopInfo())?.name || null } catch {} }

  const { data: integ, error } = await db.from('shopify_integrations').upsert({
    company_id: a.companyId,
    store_domain: a.shop,
    store_name: name || a.shop,
    auth_type: 'oauth',
    ...tokenColumns(a.tokens),
    api_version: null,
    is_active: true,
    uninstalled_at: null,
    installed_by: a.userId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,store_domain' }).select('id').single()
  if (error || !integ) throw new Error(error?.message || 'Could not save the store')

  try {
    await ensureStoreWebhooks(db, { id: integ.id, auth_type: 'oauth', webhook_topics: [] }, svc)
  } catch (e: any) {
    await db.from('shopify_integrations').update({ last_error: `Webhooks: ${e?.message || 'failed'}`.slice(0, 500) }).eq('id', integ.id)
  }
  try { await ensureAppMetafields(db, { id: integ.id, company_id: a.companyId, auth_type: 'oauth', app_metafields: null }, svc) } catch {}
  return integ.id
}

// A store connected to a different workspace through the app keeps sending
// its webhooks there — don't let a second workspace silently take it over.
export async function connectedElsewhere(db: any, shop: string, companyId: string): Promise<boolean> {
  const { data } = await db.from('shopify_integrations').select('company_id')
    .eq('store_domain', shop).eq('auth_type', 'oauth').eq('is_active', true).neq('company_id', companyId).limit(1)
  return !!data?.length
}

// Park an install nobody in Colvy has claimed yet. Returns the claim token.
export async function savePendingInstall(db: any, shop: string, tokens: ShopifyTokenSet, storeName: string | null): Promise<string> {
  const claim = crypto.randomBytes(32).toString('hex')
  // Expired ones are useless; tidy them as we go.
  await db.from('shopify_pending_installs').delete().lt('expires_at', new Date().toISOString())
  const { error } = await db.from('shopify_pending_installs').insert({
    claim_hash: hashToken(claim),
    shop,
    store_name: storeName,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.expiresAt,
    refresh_expires_at: tokens.refreshExpiresAt,
    scopes: tokens.scope || null,
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
  })
  if (error) throw new Error(error.message)
  return claim
}

export async function findPendingInstall(db: any, claim: string | undefined | null) {
  if (!claim) return null
  const { data } = await db.from('shopify_pending_installs').select('*')
    .eq('claim_hash', hashToken(claim)).is('claimed_at', null).gt('expires_at', new Date().toISOString()).limit(1)
  return data?.[0] || null
}

export const pendingTokens = (p: any): ShopifyTokenSet => ({
  accessToken: p.access_token,
  refreshToken: p.refresh_token,
  expiresAt: p.token_expires_at,
  refreshExpiresAt: p.refresh_expires_at,
  scope: p.scopes || '',
})
