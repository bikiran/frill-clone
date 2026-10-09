// Shopify Admin GraphQL client.
//
// Works with both kinds of store connection: an app install (OAuth, expiring
// token — pass onUnauthorized so a mid-run expiry refreshes once and retries)
// and a legacy pasted custom-app token. Shopify is GraphQL-first (REST Admin is
// legacy), and the version is pinned here; Shopify supports each quarterly
// version for 12 months, so bump SHOPIFY_API_VERSION at least once a year.
//
// Customer name/email/phone/address are "protected customer data": until the
// app is approved for them Shopify returns those fields as null with an
// `errors` entry but HTTP 200. gql() therefore returns data AND errors, and
// callers treat a null field as "not shared", never as a failure.

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10'

export interface ShopifyConfig {
  storeDomain: string   // my-store.myshopify.com
  accessToken: string
  apiVersion?: string
  // Called once when Shopify answers 401; should return a fresh token.
  onUnauthorized?: () => Promise<string>
}

export class ShopifyApiError extends Error {
  status: number
  constructor(msg: string, status: number) { super(msg); this.status = status }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const CUSTOMER_FIELDS = `
  id legacyResourceId firstName lastName displayName
  defaultEmailAddress { emailAddress marketingState }
  defaultPhoneNumber { phoneNumber marketingState }
  numberOfOrders
  amountSpent { amount currencyCode }
  defaultAddress { firstName lastName company address1 address2 city province provinceCode country countryCodeV2 zip phone }
  tags createdAt updatedAt
`

const MONEY = 'shopMoney { amount currencyCode }'
const ADDRESS = 'firstName lastName name company address1 address2 city province provinceCode country countryCodeV2 zip phone'

// Shopify rejects a query whose *requested* cost tops 1000 points (each object
// in a connection counts once per `first`). So list pages ask for few nested
// items, and the rare order/product with more is re-fetched on its own with
// the full list (`linesMore` / `variantsMore` say when).
export const orderFields = (lines = 20) => `
  id legacyResourceId name createdAt updatedAt processedAt cancelledAt cancelReason closed test
  displayFinancialStatus displayFulfillmentStatus
  email phone note tags sourceName statusPageUrl discountCodes paymentGatewayNames
  currencyCode
  customer { id legacyResourceId firstName lastName }
  totalPriceSet { ${MONEY} }
  currentTotalPriceSet { ${MONEY} }
  subtotalPriceSet { ${MONEY} }
  totalShippingPriceSet { ${MONEY} }
  totalTaxSet { ${MONEY} }
  totalDiscountsSet { ${MONEY} }
  totalRefundedSet { ${MONEY} }
  shippingAddress { ${ADDRESS} }
  billingAddress { ${ADDRESS} }
  shippingLines(first: 3) { nodes { title code } }
  lineItems(first: ${lines}) {
    pageInfo { hasNextPage }
    nodes {
      id name title variantTitle sku quantity currentQuantity
      originalUnitPriceSet { shopMoney { amount } }
      variant { legacyResourceId }
      product { legacyResourceId }
      image { url }
    }
  }
`

export const productFields = (variants = 30) => `
  id legacyResourceId title handle status onlineStoreUrl totalInventory tracksInventory hasOnlyDefaultVariant
  productType vendor tags updatedAt
  featuredMedia { preview { image { url } } }
  priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  variants(first: ${variants}) {
    pageInfo { hasNextPage }
    nodes {
      id legacyResourceId title sku price compareAtPrice inventoryQuantity availableForSale inventoryPolicy
      selectedOptions { name value }
      inventoryItem { id tracked }
    }
  }
`

export class ShopifyService {
  private domain: string
  private token: string
  private version: string
  private onUnauthorized?: () => Promise<string>

  constructor(config: ShopifyConfig) {
    let d = (config.storeDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (d && !d.includes('.')) d = `${d}.myshopify.com`
    this.domain = d
    this.token = config.accessToken
    this.version = config.apiVersion || SHOPIFY_API_VERSION
    this.onUnauthorized = config.onUnauthorized
  }

  get shop() { return this.domain }

  /** Run a GraphQL query. Retries rate limits; refreshes the token once on 401. */
  async gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<{ data: T; errors: any[] }> {
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://${this.domain}/admin/api/${this.version}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': this.token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
      if (res.status === 401 && this.onUnauthorized && !refreshed) {
        refreshed = true
        this.token = await this.onUnauthorized()
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const ra = Number(res.headers.get('retry-after')) || 0
        await sleep(Math.max(ra * 1000, (attempt + 1) * 1500))
        continue
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new ShopifyApiError(`Shopify ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`, res.status)
      }
      const body: any = await res.json()
      const errors: any[] = Array.isArray(body?.errors) ? body.errors : body?.errors ? [body.errors] : []
      // Query-cost throttling comes back as 200 + THROTTLED: wait for the bucket.
      if (errors.some(e => e?.extensions?.code === 'THROTTLED') && attempt < 5) {
        const ts = body?.extensions?.cost?.throttleStatus
        const need = Number(body?.extensions?.cost?.requestedQueryCost) || 100
        const wait = ts ? Math.ceil(Math.max(0, need - Number(ts.currentlyAvailable || 0)) / Math.max(1, Number(ts.restoreRate || 50))) * 1000 : 2000
        await sleep(Math.min(Math.max(wait, 1000), 10000))
        continue
      }
      if (!body?.data && errors.length) throw new ShopifyApiError(errors.map(e => e?.message || String(e)).join('; '), 200)
      return { data: body?.data as T, errors }
    }
  }

  // Verify the connection and return the shop's display details.
  async getShopInfo(): Promise<{ ok: boolean; name?: string; domain?: string; currency?: string; email?: string; error?: string }> {
    try {
      const { data } = await this.gql<any>(`{ shop { name myshopifyDomain currencyCode email } }`)
      return { ok: true, name: data?.shop?.name, domain: data?.shop?.myshopifyDomain, currency: data?.shop?.currencyCode, email: data?.shop?.email }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async testConnection(): Promise<boolean> {
    return (await this.getShopInfo()).ok
  }

  /** One page of customers. `query` takes Shopify search syntax (e.g. updated_at:>'…'). */
  async getCustomersPage(opts: { after?: string | null; first?: number; query?: string } = {}): Promise<{ customers: any[]; endCursor: string | null; hasNextPage: boolean; errors: any[] }> {
    const { data, errors } = await this.gql<any>(
      `query Customers($first: Int!, $after: String, $query: String) {
        customers(first: $first, after: $after, query: $query, sortKey: ID) {
          pageInfo { hasNextPage endCursor }
          nodes { ${CUSTOMER_FIELDS} }
        }
      }`,
      { first: opts.first || 100, after: opts.after || null, query: opts.query || null },
    )
    const conn = data?.customers
    return { customers: conn?.nodes || [], endCursor: conn?.pageInfo?.endCursor || null, hasNextPage: !!conn?.pageInfo?.hasNextPage, errors }
  }

  /** One page of orders, oldest-updated first so a resumed sync never skips. */
  async getOrdersPage(opts: { after?: string | null; first?: number; query?: string } = {}): Promise<{ orders: any[]; endCursor: string | null; hasNextPage: boolean; errors: any[] }> {
    const { data, errors } = await this.gql<any>(
      `query Orders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
          pageInfo { hasNextPage endCursor }
          nodes { ${orderFields(20)} }
        }
      }`,
      { first: opts.first || 6, after: opts.after || null, query: opts.query || null },
    )
    const conn = data?.orders
    return { orders: conn?.nodes || [], endCursor: conn?.pageInfo?.endCursor || null, hasNextPage: !!conn?.pageInfo?.hasNextPage, errors }
  }

  async getOrder(id: string | number): Promise<any | null> {
    const gid = String(id).startsWith('gid://') ? String(id) : `gid://shopify/Order/${id}`
    const { data } = await this.gql<any>(`query One($id: ID!) { order(id: $id) { ${orderFields(100)} } }`, { id: gid })
    return data?.order || null
  }

  async getProductsPage(opts: { after?: string | null; first?: number; query?: string } = {}): Promise<{ products: any[]; endCursor: string | null; hasNextPage: boolean; errors: any[] }> {
    const { data, errors } = await this.gql<any>(
      `query Products($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: ID) {
          pageInfo { hasNextPage endCursor }
          nodes { ${productFields(30)} }
        }
      }`,
      { first: opts.first || 8, after: opts.after || null, query: opts.query || null },
    )
    const conn = data?.products
    return { products: conn?.nodes || [], endCursor: conn?.pageInfo?.endCursor || null, hasNextPage: !!conn?.pageInfo?.hasNextPage, errors }
  }

  async getProduct(id: string | number): Promise<any | null> {
    const gid = String(id).startsWith('gid://') ? String(id) : `gid://shopify/Product/${id}`
    const { data } = await this.gql<any>(`query One($id: ID!) { product(id: $id) { ${productFields(250)} } }`, { id: gid })
    return data?.product || null
  }

  /** inventory_levels/update only names an inventory item; find its product. */
  async productIdForInventoryItem(inventoryItemId: string | number): Promise<string | null> {
    const gid = String(inventoryItemId).startsWith('gid://') ? String(inventoryItemId) : `gid://shopify/InventoryItem/${inventoryItemId}`
    const { data } = await this.gql<any>(`query Inv($id: ID!) { inventoryItem(id: $id) { variant { product { id } } } }`, { id: gid })
    return data?.inventoryItem?.variant?.product?.id || null
  }

  /**
   * Make sure this app's webhooks for `topics` point at `uri`. Existing
   * subscriptions to the same topic+uri are left alone; returns what was
   * created and any per-topic errors (a missing scope shows up here).
   */
  async ensureWebhooks(uri: string, topics: string[]): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
    const out = { created: [] as string[], existing: [] as string[], errors: [] as string[] }
    const { data } = await this.gql<any>(`{ webhookSubscriptions(first: 100) { nodes { id topic uri } } }`)
    const have = new Set<string>((data?.webhookSubscriptions?.nodes || []).filter((n: any) => n?.uri === uri).map((n: any) => n.topic))
    for (const topic of topics) {
      if (have.has(topic)) { out.existing.push(topic); continue }
      try {
        const { data: d } = await this.gql<any>(
          `mutation Sub($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
              webhookSubscription { id topic }
              userErrors { field message }
            }
          }`,
          { topic, sub: { uri } },
        )
        const ue = d?.webhookSubscriptionCreate?.userErrors || []
        if (ue.length) out.errors.push(`${topic}: ${ue.map((u: any) => u.message).join(', ')}`)
        else out.created.push(topic)
      } catch (e: any) {
        out.errors.push(`${topic}: ${e.message}`)
      }
    }
    return out
  }
}
