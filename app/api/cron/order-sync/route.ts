import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncWooOrders } from '@/lib/orders-sync'
import { syncPage } from '@/app/api/woocommerce/sync/route'
import { logJobRun } from '@/lib/job-log'
import { companyFlagEnabled } from '@/lib/feature-flags'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/order-sync
 *
 * Pulls new WooCommerce orders for every connected store on a schedule, so a
 * "New order" notification fires even when the store's Woo webhook isn't
 * delivering (disabled, wrong secret, never set up). Without this, new orders
 * only pushed when the webhook fired OR when someone opened the Orders tab.
 *
 * Per active integration:
 *   1. Incrementally pull orders modified since last sync from the Woo REST API
 *      into woocommerce_orders (syncPage keeps that cheap + advances the cursor).
 *   2. Mirror the recently-changed rows into the operational `orders` table via
 *      syncWooOrders, which inserts only NEW orders and pushes for them.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. With no CRON_SECRET
 * set the endpoint is open (it only syncs stores the business already connected).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()

  const { data: integrations } = await db.from('woocommerce_integrations')
    .select('id, company_id, is_active, last_synced_at')
    .neq('is_active', false)

  const results: any[] = []
  for (const integ of integrations || []) {
    try {
      // 1. Incremental pull from Woo → woocommerce_orders. Only orders changed
      // since the last successful sync (fallback: the last hour on first run).
      const since = integ.last_synced_at || new Date(Date.now() - 60 * 60 * 1000).toISOString()
      let page = 1
      let totalPages = 1
      const changedIds = new Set<number>()
      do {
        const r = await syncPage({ companyId: integ.company_id, integrationId: integ.id, mode: 'orders', page, modifiedAfter: since })
        if (r.status !== 200) break
        totalPages = Number(r.body?.totalPages || 1)
        for (const id of (r.body?.changedIds || [])) changedIds.add(Number(id))
        page++
      } while (page <= totalPages && page <= 10) // cap pages/run so one store can't hog the window

      // 2. Mirror the storefront orders into the operational table. Reconcile
      // BOTH sets so an order never needs a manual Sync to catch up:
      //   • every order that changed at the store this run (ANY age) — so a late
      //     status change on an older order (a failed order finally paid, a
      //     refund, a late cancel) is reconciled, not just orders created today;
      //   • all orders created in the last 24h — a safety net for a brand-new
      //     order whose change we might otherwise miss.
      // syncWooOrders only INSERTS genuinely-new orders (reconciling the rest in
      // place), and its own 24h guard keeps the "New order" push from firing on
      // old orders that merely changed status.
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const wooById = new Map<number, any>()
      const { data: recentWoo } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', integ.company_id)
        .gte('order_date', dayAgo).order('order_date', { ascending: false }).limit(200)
      for (const w of recentWoo || []) wooById.set(Number(w.woo_order_id), w)
      // Fetch the changed-this-run orders that the recent-24h query didn't cover.
      const missing = [...changedIds].filter(id => id && !wooById.has(id))
      for (let i = 0; i < missing.length; i += 300) {
        const { data } = await db.from('woocommerce_orders')
          .select('*').eq('company_id', integ.company_id).in('woo_order_id', missing.slice(i, i + 300))
        for (const w of data || []) wooById.set(Number(w.woo_order_id), w)
      }
      // Per-company operational flag: auto-reconcile defaults ON, but a super
      // admin can switch it off for a company (new orders still import).
      const reconcile = await companyFlagEnabled(db, integ.company_id, 'order_auto_reconcile')
      const synced = await syncWooOrders(db, integ.company_id, [...wooById.values()], { reconcile })
      results.push({ company: integ.company_id, synced, changed: changedIds.size, reconcile })
    } catch (e: any) {
      results.push({ company: integ.company_id, error: e?.message || String(e) })
    }
  }

  const errored = results.filter(r => r.error).length
  await logJobRun({
    job: 'order-sync', startedAt, durationMs: Date.now() - t0,
    status: results.length === 0 ? 'idle' : (errored ? 'error' : 'success'),
    detail: { integrations: (integrations || []).length, ran: results.length, errored },
    error: errored ? results.find(r => r.error)?.error : null,
  })
  return NextResponse.json({ ok: true, ran: results.length, results })
}
