import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncWooOrders } from '@/lib/orders-sync'
import { syncPage } from '@/app/api/woocommerce/sync/route'
import { logJobRun } from '@/lib/job-log'

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
      do {
        const r = await syncPage({ companyId: integ.company_id, integrationId: integ.id, mode: 'orders', page, modifiedAfter: since })
        if (r.status !== 200) break
        totalPages = Number(r.body?.totalPages || 1)
        page++
      } while (page <= totalPages && page <= 10) // cap pages/run so one store can't hog the window

      // 2. Mirror the recently-changed storefront orders into the operational
      // table. syncWooOrders only inserts NEW ones and fires the "New order"
      // push for them (guarded against a first-time backfill).
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recentWoo } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', integ.company_id)
        .gte('order_date', dayAgo).order('order_date', { ascending: false }).limit(200)
      const synced = await syncWooOrders(db, integ.company_id, recentWoo || [])
      results.push({ company: integ.company_id, synced })
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
