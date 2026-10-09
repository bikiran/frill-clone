// Shopify import + catch-up, shared by the manual import (/api/shopify/sync),
// the 15-minute reconcile cron and webhook setup.

import { ShopifyService } from '@/lib/shopify-service'
import { getAccessToken, STORE_WEBHOOK_TOPICS, webhookUri } from '@/lib/shopify-auth'
import { saveShopifyCustomers } from '@/lib/shopify-customers'
import { saveShopifyProducts } from '@/lib/shopify-products'
import { upsertShopifyOrder } from '@/lib/shopify-orders'
import { runShopifyOrderAutomations } from '@/lib/shopify-automation'
import { promoteDueCheckouts, stageCheckout, stageFromGraphql } from '@/lib/shopify-checkouts'

export const SYNC_PHASES = ['customers', 'products', 'orders'] as const
export type SyncPhase = typeof SYNC_PHASES[number]

export async function serviceFor(db: any, integ: any): Promise<ShopifyService> {
  const token = await getAccessToken(db, integ)
  return new ShopifyService({ storeDomain: integ.store_domain, accessToken: token, onUnauthorized: () => getAccessToken(db, integ, { force: true }) })
}

// Protected customer data the app isn't approved for comes back as null fields
// plus an access error — worth telling the merchant, never fatal.
export const hiddenFieldsNote = (errors: any[]) =>
  errors.some(e => /access|approved|protected/i.test(String(e?.message || '')) || e?.extensions?.code === 'ACCESS_DENIED')
    ? 'Shopify is hiding some customer details (name, email, phone or address) until the Colvy app is approved for protected customer data.'
    : null

/**
 * Subscribe an app-installed store to every topic Colvy needs, if it isn't
 * already (stores installed before a phase added topics pick them up here).
 * Pasted-token stores can't receive webhooks; the cron covers them.
 */
export async function ensureStoreWebhooks(db: any, integ: any, svc?: ShopifyService): Promise<{ ok: boolean; errors: string[] }> {
  if (integ.auth_type !== 'oauth') return { ok: true, errors: [] }
  const have: string[] = Array.isArray(integ.webhook_topics) ? integ.webhook_topics : []
  if (STORE_WEBHOOK_TOPICS.every(t => have.includes(t))) return { ok: true, errors: [] }
  const s = svc || await serviceFor(db, integ)
  const wh = await s.ensureWebhooks(webhookUri(), STORE_WEBHOOK_TOPICS)
  const done = [...wh.created, ...wh.existing]
  await db.from('shopify_integrations').update(wh.errors.length
    ? { webhook_topics: done, last_error: `Some Shopify updates couldn’t be subscribed: ${wh.errors.join('; ')}`.slice(0, 500) }
    : { webhook_topics: done, webhooks_registered_at: new Date().toISOString() }).eq('id', integ.id)
  integ.webhook_topics = done
  return { ok: !wh.errors.length, errors: wh.errors }
}

/**
 * Advance an import job by pages until `budgetMs` runs out or it finishes.
 * job.phase walks customers → products → orders; job.page_info is the cursor
 * within the phase, saved after every page so a later call resumes exactly.
 */
export async function runImportStep(db: any, integ: any, job: any, svc: ShopifyService, budgetMs: number) {
  const START = Date.now()
  let phase: SyncPhase = (SYNC_PHASES as readonly string[]).includes(job.phase) ? job.phase : 'customers'
  let cursor: string | null = job.page_info || null
  const counts = {
    customers: Number(job.customers_synced) || 0,
    products: Number(job.products_synced) || 0,
    orders: Number(job.orders_synced) || 0,
    created: Number(job.contacts_linked) || 0,
  }
  let note: string | null = null
  const save = async (extra: any = {}) => db.from('shopify_sync_jobs').update({
    phase, page_info: cursor,
    customers_synced: counts.customers, products_synced: counts.products, orders_synced: counts.orders, contacts_linked: counts.created,
    message: `Importing ${phase}…`, updated_at: new Date().toISOString(), ...extra,
  }).eq('id', job.id)

  // At least one page per call, so a tight budget still makes progress.
  for (let first = true; first || Date.now() - START < budgetMs; first = false) {
    let hasNext = false
    if (phase === 'customers') {
      const page = await svc.getCustomersPage({ after: cursor, first: 100 })
      const r = await saveShopifyCustomers(db, integ.company_id, integ.id, page.customers)
      counts.customers += r.saved; counts.created += r.created
      note = note || hiddenFieldsNote(page.errors)
      cursor = page.endCursor; hasNext = page.hasNextPage
    } else if (phase === 'products') {
      const page = await svc.getProductsPage({ after: cursor })
      counts.products += await saveShopifyProducts(db, svc, integ.company_id, integ.id, page.products)
      cursor = page.endCursor; hasNext = page.hasNextPage
    } else {
      const page = await svc.getOrdersPage({ after: cursor })
      note = note || hiddenFieldsNote(page.errors)
      for (const o of page.orders) { if (await upsertShopifyOrder(db, integ.company_id, o, { quiet: true, svc })) counts.orders++ }
      cursor = page.endCursor; hasNext = page.hasNextPage
    }

    if (!hasNext) {
      const now = new Date().toISOString()
      const stamp: any = phase === 'customers' ? { last_full_sync_at: now } : phase === 'products' ? { products_synced_at: now } : { orders_synced_at: now }
      await db.from('shopify_integrations').update({ ...stamp, last_synced_at: now }).eq('id', integ.id)
      const next = SYNC_PHASES[SYNC_PHASES.indexOf(phase) + 1]
      if (!next) {
        cursor = null
        await save({ status: 'done', finished_at: now, message: `Imported ${counts.customers} customers, ${counts.products} products and ${counts.orders} orders.` })
        if (note) await db.from('shopify_integrations').update({ last_error: note }).eq('id', integ.id)
        return { done: true, phase, counts, note }
      }
      phase = next; cursor = null
    }
    await save()
  }
  return { done: false, phase, counts, note }
}

/**
 * Catch up anything webhooks missed (and keep pasted-token stores, which get no
 * webhooks, current): orders and products updated since the last run, a few
 * pages each. Orders here are NOT quiet — a new one found this way still pings
 * the team (the 24h rule in notifyNewOrder stops old ones) and runs the order
 * automations, which dedupe per order + status, so an order the webhook
 * already handled isn't messaged twice.
 *
 * Abandoned checkouts: app-installed stores get them by webhook; pasted-token
 * stores have them pulled here. Either way, checkouts past the hold are
 * promoted to abandoned carts at the end.
 */
export async function reconcileStore(db: any, integ: any, opts: { maxPages?: number } = {}) {
  const svc = await serviceFor(db, integ)
  try { await ensureStoreWebhooks(db, integ, svc) } catch {}
  const maxPages = opts.maxPages || 5
  const startedAt = new Date().toISOString()
  // A 10-minute overlap: Shopify's updated_at and our clock may disagree a little.
  const since = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - 10 * 60_000).toISOString() : null
  let orders = 0, products = 0

  const oSince = since(integ.orders_synced_at)
  if (oSince) {
    let after: string | null = null
    for (let i = 0; i < maxPages; i++) {
      const page = await svc.getOrdersPage({ after, query: `updated_at:>'${oSince}'` })
      for (const o of page.orders) {
        if (!(await upsertShopifyOrder(db, integ.company_id, o, { svc }))) continue
        orders++
        try { await runShopifyOrderAutomations(db, integ.company_id, o) } catch (e: any) { console.error('[shopify reconcile] order automation failed', e?.message || e) }
      }
      if (!page.hasNextPage) break
      after = page.endCursor
    }
  }
  const pSince = since(integ.products_synced_at)
  if (pSince) {
    let after: string | null = null
    for (let i = 0; i < maxPages; i++) {
      const page = await svc.getProductsPage({ after, query: `updated_at:>'${pSince}'` })
      products += await saveShopifyProducts(db, svc, integ.company_id, integ.id, page.products)
      if (!page.hasNextPage) break
      after = page.endCursor
    }
  }
  let checkouts = 0
  const pullCheckouts = integ.auth_type !== 'oauth' && !!oSince
  if (pullCheckouts) {
    // First run: the last two days (older ones are past promoting anyway).
    const cSince = since(integ.checkouts_synced_at) || new Date(Date.now() - 48 * 3600_000).toISOString()
    let after: string | null = null
    for (let i = 0; i < maxPages; i++) {
      const page = await svc.getAbandonedCheckoutsPage({ after, query: `updated_at:>'${cSince}'` })
      for (const n of page.checkouts) { await stageCheckout(db, stageFromGraphql(n, integ.company_id, integ.id)); checkouts++ }
      if (!page.hasNextPage) break
      after = page.endCursor
    }
  }
  const patch: any = { last_synced_at: startedAt }
  if (oSince) patch.orders_synced_at = startedAt
  if (pSince) patch.products_synced_at = startedAt
  if (pullCheckouts) patch.checkouts_synced_at = startedAt
  await db.from('shopify_integrations').update(patch).eq('id', integ.id)
  const carts = await promoteDueCheckouts(db, integ.company_id)
  return { orders, products, checkouts, carts }
}
