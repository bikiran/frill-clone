// Shopify app authentication: the "Install on Shopify" OAuth flow, request
// signature checks, and expiring offline tokens.
//
// How a store connects (since 1 Jan 2026 merchants can't create custom apps in
// their admin any more): someone in a Colvy workspace enters their
// my-store.myshopify.com and clicks Install. We send them to Shopify's consent
// screen with a one-time state; Shopify redirects back to /api/shopify/callback
// with a code, which we exchange for tokens.
//
// New apps must use EXPIRING offline tokens: a 1-hour access token plus a
// 90-day refresh token that rotates on every refresh. getAccessToken() hands
// out a valid token, refreshing and persisting the pair when it's close to
// expiry; the daily /api/cron/shopify-tokens keeps idle stores' refresh tokens
// from lapsing.
//
// App credentials come from the Shopify Dev Dashboard (Colvy app):
//   SHOPIFY_API_KEY      client ID
//   SHOPIFY_API_SECRET   client secret (also signs webhooks + OAuth callbacks)
//   SHOPIFY_REDIRECT_URI optional; defaults to https://colvy.com/api/shopify/callback
//   SHOPIFY_SCOPES       optional override of SHOPIFY_SCOPES below

import crypto from 'crypto'

// Everything the WooCommerce-parity plan needs, asked for once at install so
// later phases don't send every merchant back through a re-consent screen.
export const SHOPIFY_SCOPES = [
  'read_customers', 'write_customers',
  'read_orders', 'write_orders',
  'read_draft_orders', 'write_draft_orders',
  'read_products', 'read_inventory', 'read_locations',
  'read_discounts', 'write_discounts',
].join(',')

export const shopifyAppConfigured = () => !!(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET)
export const shopifyRedirectUri = () => process.env.SHOPIFY_REDIRECT_URI || 'https://colvy.com/api/shopify/callback'
const scopes = () => process.env.SHOPIFY_SCOPES || SHOPIFY_SCOPES

// Webhooks Colvy subscribes each store to. The compliance topics (customers/data_request,
// customers/redact, shop/redact) are declared in the app's configuration, not
// per store, and arrive at the same endpoint.
export const STORE_WEBHOOK_TOPICS = [
  'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE', 'CUSTOMERS_DELETE',
  'ORDERS_CREATE', 'ORDERS_UPDATED', 'CHECKOUTS_CREATE', 'CHECKOUTS_UPDATE',
  'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE', 'INVENTORY_LEVELS_UPDATE',
  'APP_UNINSTALLED',
]
export const webhookUri = () => `${new URL(shopifyRedirectUri()).origin}/api/webhooks/shopify`

// Shopify's documented pattern, anchored at both ends.
const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/

// Accepts "my-store", "my-store.myshopify.com" or a pasted admin/store URL and
// returns "my-store.myshopify.com", or null when it can't be a Shopify shop.
export function normalizeShop(input: string): string | null {
  let s = String(input || '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').split(/[/?#]/)[0]
  // admin.shopify.com/store/<handle> → <handle>
  const m = String(input || '').match(/admin\.shopify\.com\/store\/([a-zA-Z0-9-]+)/i)
  if (m) s = m[1].toLowerCase()
  if (!s.includes('.')) s = `${s}.myshopify.com`
  return SHOP_RE.test(s) ? s : null
}
export const isShopDomain = (s: string) => SHOP_RE.test(String(s || ''))

export function buildAuthorizeUrl(shop: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY || '',
    scope: scopes(),
    redirect_uri: shopifyRedirectUri(),
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${q.toString()}`
}

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a || '', 'utf8')
  const bb = Buffer.from(b || '', 'utf8')
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

// OAuth callback / app-URL requests: drop `hmac` (and legacy `signature`),
// sort the rest, join key=value with &, HMAC-SHA256 hex with the app secret.
export function verifyQueryHmac(params: URLSearchParams, secret = process.env.SHOPIFY_API_SECRET || ''): boolean {
  const given = params.get('hmac') || ''
  if (!given || !secret) return false
  const pairs: string[] = []
  const keys = Array.from(new Set(Array.from(params.keys()))).filter(k => k !== 'hmac' && k !== 'signature').sort()
  for (const k of keys) {
    // Repeated keys (e.g. ids[]=1&ids[]=2) are signed as a JSON-ish array.
    const all = params.getAll(k)
    pairs.push(`${k}=${all.length > 1 ? `["${all.join('", "')}"]` : all[0]}`)
  }
  const digest = crypto.createHmac('sha256', secret).update(pairs.join('&')).digest('hex')
  return safeEqual(digest, given)
}

// Webhooks: base64 HMAC-SHA256 of the RAW body in X-Shopify-Hmac-Sha256.
export function verifyWebhookHmac(rawBody: string, header: string | null, secret = process.env.SHOPIFY_API_SECRET || ''): boolean {
  if (!header || !secret) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  return safeEqual(digest, header)
}

export type ShopifyTokenSet = {
  accessToken: string
  scope: string
  refreshToken: string | null
  expiresAt: string | null        // access token
  refreshExpiresAt: string | null // refresh token
}

const inSecs = (s: any) => (Number(s) > 0 ? new Date(Date.now() + Number(s) * 1000).toISOString() : null)

export class ShopifyAuthError extends Error {
  reauth: boolean
  constructor(msg: string, reauth = false) { super(msg); this.reauth = reauth }
}

async function tokenRequest(shop: string, body: Record<string, string>): Promise<ShopifyTokenSet> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY || '',
      client_secret: process.env.SHOPIFY_API_SECRET || '',
      ...body,
    }).toString(),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data?.access_token) {
    // 401 invalid_request on a refresh = the refresh token is dead; only a
    // fresh install fixes that. 5xx/429 are worth retrying later.
    const reauth = res.status === 401 || res.status === 400
    throw new ShopifyAuthError(data?.error_description || data?.error || `Shopify token request failed (${res.status})`, reauth)
  }
  return {
    accessToken: data.access_token,
    scope: data.scope || '',
    refreshToken: data.refresh_token || null,
    expiresAt: inSecs(data.expires_in),
    refreshExpiresAt: inSecs(data.refresh_token_expires_in),
  }
}

export const exchangeCode = (shop: string, code: string) => tokenRequest(shop, { code, expiring: '1' })
export const refreshAccessToken = (shop: string, refreshToken: string) => tokenRequest(shop, { grant_type: 'refresh_token', refresh_token: refreshToken })

// Columns to write for a token set.
export const tokenColumns = (t: ShopifyTokenSet) => ({
  access_token: t.accessToken,
  refresh_token: t.refreshToken,
  token_expires_at: t.expiresAt,
  refresh_expires_at: t.refreshExpiresAt,
  scopes: t.scope || null,
  needs_reauth: false,
  last_error: null,
})

const REFRESH_EARLY_MS = 5 * 60 * 1000

/**
 * A usable access token for a shopify_integrations row. Pasted (legacy) tokens
 * never expire and are returned as-is. App tokens are refreshed when they have
 * under 5 minutes left; the rotated pair is saved only if nobody else saved one
 * first (compare-and-swap on the old refresh token), and a loser re-reads the
 * winner's token instead — the presented refresh token stays valid until the
 * replacement is used, so a race costs nothing.
 */
export async function getAccessToken(db: any, integ: any, opts: { force?: boolean } = {}): Promise<string> {
  if (!integ?.access_token) throw new ShopifyAuthError('This store is not connected.', true)
  if (integ.auth_type !== 'oauth' || !integ.refresh_token) return integ.access_token
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0
  if (!opts.force && exp && exp - Date.now() > REFRESH_EARLY_MS) return integ.access_token

  let t: ShopifyTokenSet
  try {
    t = await refreshAccessToken(integ.store_domain, integ.refresh_token)
  } catch (e: any) {
    if (e instanceof ShopifyAuthError && e.reauth) {
      await db.from('shopify_integrations').update({ needs_reauth: true, last_error: 'Shopify access expired — reconnect this store.', updated_at: new Date().toISOString() }).eq('id', integ.id)
    }
    throw e
  }
  const { data: saved } = await db.from('shopify_integrations')
    .update({ ...tokenColumns(t), updated_at: new Date().toISOString() })
    .eq('id', integ.id).eq('refresh_token', integ.refresh_token)
    .select('id')
  if (saved && saved.length) {
    Object.assign(integ, tokenColumns(t))
    return t.accessToken
  }
  const { data: fresh } = await db.from('shopify_integrations').select('*').eq('id', integ.id).maybeSingle()
  if (fresh?.access_token) { Object.assign(integ, fresh); return fresh.access_token }
  return t.accessToken
}
