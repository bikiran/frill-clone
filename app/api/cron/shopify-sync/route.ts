import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileStore } from '@/lib/shopify-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/shopify-sync — every 15 minutes.
 *
 * Webhooks deliver Shopify changes within seconds, but a delivery can be lost,
 * and stores connected with a pasted token get no webhooks at all. This pulls
 * orders and products changed since each store's last run (after its first
 * import has finished — before that there's nothing to catch up from).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = admin()
  const { data: stores } = await db.from('shopify_integrations').select('*')
    .eq('is_active', true).eq('needs_reauth', false).not('access_token', 'is', null)
    .limit(100)

  const t0 = Date.now()
  const results: any[] = []
  for (const s of stores || []) {
    if (!s.orders_synced_at && !s.products_synced_at) continue
    if (Date.now() - t0 > 240_000) break   // leave headroom; the next run continues
    try {
      results.push({ store: s.store_domain, ...(await reconcileStore(db, s)) })
    } catch (e: any) {
      results.push({ store: s.store_domain, error: e?.message || 'failed' })
    }
  }
  return NextResponse.json({ ok: true, stores: results.length, results })
}
