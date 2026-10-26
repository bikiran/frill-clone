// SMS credit billed through Shopify (Shopify App Pricing usage charges).
//
// A workspace that uses Colvy through the Shopify app is never charged by card
// (App Store rule 1.2.1, lib/shopify-billing). Its SMS credit is billed through
// a usage meter on its Shopify plan instead: buying credit, or an auto top-up,
// sends one billable event to Shopify's App Events API and the credit is then
// added to the wallet as usual (lib/sms-credits shopifyTopUp). Shopify puts the
// usage on the merchant's monthly app bill.
//
// Setup, Partner Dashboard → the app → Pricing:
//   1. On each paid plan, add a usage meter with the event handle `sms_credit`,
//      fixed price per unit = what A$1 of SMS credit costs in US dollars (plan
//      prices are USD; Shopify converts for the merchant). One unit is A$1.
//   2. Set SHOPIFY_SMS_METER=sms_credit in Vercel. Until then nothing here runs
//      and Shopify workspaces are asked to contact Colvy for credit, as before.
// App Events API keys: SHOPIFY_EVENTS_CLIENT_ID / SHOPIFY_EVENTS_CLIENT_SECRET
// (Dev Dashboard), else the app's own SHOPIFY_API_KEY / SHOPIFY_API_SECRET.
//
// The App Events API answers 202 to anything it receives and checks billing
// afterwards (no error comes back), so credit is only sold through Shopify when
// the merchant's subscription has the metered item. The Partner API says so;
// the answer is kept on shopify_integrations.billing.sms_meter and refreshed
// with the plan (lib/shopify-billing syncShopifyBilling). Without the meter the
// event would be dropped unbilled (SUBSCRIPTION_NOT_METERED).

import { PARTNER_API_VERSION, partnerApiConfigured, planSelectionUrl, shopifyBillingStore, syncShopifyBilling } from '@/lib/shopify-billing'

export const APP_EVENTS_VERSION = '2026-10'
const orgId = () => process.env.SHOPIFY_PARTNER_ORG_ID || '5242426'
const appGid = () => process.env.SHOPIFY_APP_GID || 'gid://shopify/App/433393926145'

/** The usage meter's event handle, or '' when SMS credit isn't sold through Shopify. */
export const smsMeterHandle = () => String(process.env.SHOPIFY_SMS_METER || '').trim()
const eventsClient = () => ({
  id: process.env.SHOPIFY_EVENTS_CLIENT_ID || process.env.SHOPIFY_API_KEY || '',
  secret: process.env.SHOPIFY_EVENTS_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || '',
})
/** Everything needed to bill SMS credit through Shopify is set. */
export const shopifySmsBillingConfigured = () => !!smsMeterHandle() && !!eventsClient().id && !!eventsClient().secret && partnerApiConfigured()

/** The App Events value for an amount of credit: whole dollars as a number, else a "12.50" string (Shopify rejects bare decimals). */
export function creditUnits(cents: number): number | string {
  const c = Math.round(Number(cents) || 0)
  return c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)
}

/** A key for one charge (≤ 64 characters; Shopify never forgets a billing key). */
export function usageKey(kind: 'buy' | 'auto', companyId: string, at: Date = new Date()): string {
  return `sms-${kind}-${companyId}-${at.getTime().toString(36)}`.slice(0, 64)
}

// ── App Events API ───────────────────────────────────────────────────────────

let token: { value: string; exp: number } | null = null

async function eventsToken(): Promise<string> {
  if (token && Date.now() < token.exp) return token.value
  const { id, secret } = eventsClient()
  const res = await fetch('https://api.shopify.com/auth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Colvy/1.0 (+https://colvy.com)' },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) throw new Error(`Shopify App Events sign-in failed (${res.status})`)
  // Tokens last 60 minutes; renew a little early.
  token = { value: body.access_token, exp: Date.now() + 55 * 60 * 1000 }
  return token.value
}

/**
 * Send one billable event. ok means Shopify received it (202); whether it's
 * billed is decided afterwards, which is why sales are gated on the meter.
 */
export async function sendBillingEvent(o: { shopGid: string; value: number | string; key: string; at?: Date; handle?: string }): Promise<{ ok: boolean; status: number; error?: string }> {
  const handle = o.handle || smsMeterHandle()
  if (!handle) return { ok: false, status: 0, error: 'not_configured' }
  const post = async (bearer: string) => fetch(`https://api.shopify.com/app/${APP_EVENTS_VERSION}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearer}`, 'User-Agent': 'Colvy/1.0 (+https://colvy.com)' },
    body: JSON.stringify({
      shop_id: o.shopGid,
      event_handle: handle,
      timestamp: (o.at || new Date()).toISOString(),
      idempotency_key: o.key,
      attributes: { value: o.value },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  try {
    let res = await post(await eventsToken())
    if (res.status === 401) { token = null; res = await post(await eventsToken()) }   // expired early
    if (res.status === 202 || res.status === 200 || res.status === 201) return { ok: true, status: res.status }
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: text.slice(0, 300) || `HTTP ${res.status}` }
  } catch (e: any) {
    return { ok: false, status: 0, error: String(e?.message || e).slice(0, 300) }
  }
}

// ── Is the merchant's plan metered? ──────────────────────────────────────────

export type SmsMeter = {
  metered: boolean
  handle: string | null
  usage: { quantity: number; amount: number | null; currency: string | null } | null
  checked_at: string
}

/** The metered item on a subscription's items: the one named like the meter, else a tiered (usage) price. */
export function meterItem(items: any[] | null | undefined, handle: string = smsMeterHandle()): any | null {
  const list = Array.isArray(items) ? items : []
  const h = handle.toLowerCase()
  return (h && list.find(i => String(i?.handle || '').toLowerCase() === h))
    || list.find(i => i?.price?.__typename === 'TieredPrice')
    || null
}

async function partnerQuery(query: string, variables: Record<string, any>) {
  const res = await fetch(`https://partners.shopify.com/${orgId()}/api/${PARTNER_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_PARTNER_API_TOKEN || '' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Partner API ${res.status}`)
  const body = await res.json().catch(() => null)
  if (!body || body.errors?.length) throw new Error(body?.errors?.[0]?.message || 'Partner API error')
  return body.data
}

/**
 * Read the merchant's metered item from the Partner API. Its own query, so a
 * schema surprise here can't break the plan sync; if the usage figures can't
 * be read it falls back to just the items. Throws when the API is unreachable.
 */
export async function fetchSmsMeter(shopGid: string): Promise<SmsMeter> {
  const vars = { appId: appGid(), shopId: shopGid }
  let sub: any
  try {
    sub = (await partnerQuery(`query ($appId: ID!, $shopId: ID!) {
      activeSubscription(appId: $appId, shopId: $shopId) {
        items { handle price { __typename } usage { quantity cost { amount currencyCode } } }
      }
    }`, vars))?.activeSubscription
  } catch {
    sub = (await partnerQuery(`query ($appId: ID!, $shopId: ID!) {
      activeSubscription(appId: $appId, shopId: $shopId) { items { handle price { __typename } } }
    }`, vars))?.activeSubscription
  }
  const item = meterItem(sub?.items)
  const u = item?.usage
  return {
    metered: !!item,
    handle: item?.handle || null,
    usage: u ? { quantity: Number(u.quantity) || 0, amount: u.cost?.amount != null ? Number(u.cost.amount) : null, currency: u.cost?.currencyCode || null } : null,
    checked_at: new Date().toISOString(),
  }
}

// ── Can this workspace buy SMS credit through Shopify? ───────────────────────

export type ShopifySmsBilling =
  | { ready: true; shopGid: string; integrationId: string; planUrl: string | null; usage: SmsMeter['usage'] }
  | { ready: false; reason: 'not_configured' | 'no_meter' | 'unknown'; planUrl: string | null }

const METER_MAX_AGE_MS = 6 * 60 * 60 * 1000

/**
 * null: the workspace doesn't use Colvy through Shopify (card billing applies).
 * Otherwise whether SMS credit can be billed through its Shopify plan. `fresh`
 * re-reads the plan from Shopify first (a person is buying); without it a
 * stored answer up to `maxAgeMs` old is used (auto top-up, mid-send).
 */
export async function shopifySmsBilling(db: any, companyId: string, opts: { fresh?: boolean; maxAgeMs?: number } = {}): Promise<ShopifySmsBilling | null> {
  const store = await shopifyBillingStore(db, companyId)
  if (!store) return null
  const planUrl = store.store_domain ? planSelectionUrl(store.store_domain) : null
  if (!shopifySmsBillingConfigured()) return { ready: false, reason: 'not_configured', planUrl }

  const read = async () => {
    const { data } = await db.from('shopify_integrations').select('id, shop_gid, billing').eq('id', store.id).maybeSingle()
    return data || null
  }
  let integ = await read()
  const meter: SmsMeter | null = integ?.billing?.sms_meter || null
  const age = meter?.checked_at ? Date.now() - new Date(meter.checked_at).getTime() : Infinity
  if (opts.fresh || !meter || age > (opts.maxAgeMs ?? METER_MAX_AGE_MS)) {
    try { await syncShopifyBilling(db, companyId); integ = await read() } catch { /* use what's stored */ }
  }
  const m: SmsMeter | null = integ?.billing?.sms_meter || null
  if (!m) return { ready: false, reason: 'unknown', planUrl }
  if (!m.metered || !integ?.shop_gid) return { ready: false, reason: 'no_meter', planUrl }
  return { ready: true, shopGid: integ.shop_gid, integrationId: integ.id, planUrl, usage: m.usage }
}

/** What to tell someone who can't buy credit through Shopify yet. */
export function shopifySmsRefusal(b: ShopifySmsBilling): string {
  return 'reason' in b && b.reason === 'no_meter'
    ? 'Your Shopify plan doesn’t include SMS credit yet. Choose a plan again in Shopify (Billing → Choose a plan) to add it, then top up here.'
    : 'SMS credit for workspaces billed through Shopify isn’t switched on yet. Contact Colvy support and we’ll add credit for you.'
}
