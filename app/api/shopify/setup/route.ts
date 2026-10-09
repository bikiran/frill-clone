import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shopifyAppConfigured } from '@/lib/shopify-auth'
import { ensureStoreWebhooks } from '@/lib/shopify-sync'
import { planSelectionUrl } from '@/lib/shopify-billing'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SAFE_COLS = 'id, company_id, store_domain, store_name, is_active, auth_type, needs_reauth, last_error, scopes, webhooks_registered_at, uninstalled_at, last_synced_at, last_full_sync_at, orders_synced_at, products_synced_at, created_at'

// GET: a workspace's stores (never tokens), customer counts, and whether the
// Colvy Shopify app is configured on this deployment (shows Install vs not).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data } = await db.from('shopify_integrations').select(SAFE_COLS).eq('company_id', companyId).order('created_at', { ascending: true })
    const stores = await Promise.all((data || []).map(async (s: any) => {
      const [{ count: customers }, { count: linked }, { count: products }, { count: orders }, { data: job }] = await Promise.all([
        db.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('integration_id', s.id),
        db.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('integration_id', s.id).not('contact_id', 'is', null),
        db.from('shopify_products').select('shopify_product_id', { count: 'exact', head: true }).eq('integration_id', s.id),
        db.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sales_channel', 'shopify').eq('metadata->shopify->>shop', s.store_domain),
        db.from('shopify_sync_jobs').select('id, status, phase, customers_synced, products_synced, orders_synced, message, error, updated_at').eq('integration_id', s.id).order('started_at', { ascending: false }).limit(1),
      ])
      return { ...s, customers: customers || 0, linked: linked || 0, products: products || 0, orders: orders || 0, lastJob: job?.[0] || null }
    }))
    // The app's API key is public (it's in every install URL); the theme editor
    // deep links for the storefront blocks need it.
    // Colvy billed through Shopify: which store, and whether a plan is picked yet.
    const { data: co } = await db.from('companies').select('plan, billing_provider, billing_integration_id').eq('id', companyId).maybeSingle()
    let billing: any = null
    if (co?.billing_provider === 'shopify') {
      const { data: b } = await db.from('shopify_integrations').select('store_domain, billing').eq('id', co.billing_integration_id).maybeSingle()
      if (b) billing = { integrationId: co.billing_integration_id, needsPlan: !b.billing?.plan, planUrl: planSelectionUrl(b.store_domain) }
    }
    return NextResponse.json({ stores, appConfigured: shopifyAppConfigured(), apiKey: process.env.SHOPIFY_API_KEY || null, billing })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH { companyId, integrationId, action: 'webhooks' } — retry subscribing
// the store's webhooks (shown when the install couldn't).
export async function PATCH(req: NextRequest) {
  try {
    const { companyId, integrationId, action } = await req.json().catch(() => ({}))
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (action !== 'webhooks') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const { data: integ } = await db.from('shopify_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
    if (!integ?.is_active) return NextResponse.json({ error: 'Store not connected' }, { status: 404 })
    if (integ.auth_type !== 'oauth') return NextResponse.json({ error: 'Live updates need the Colvy app installed. Stores connected with a pasted token sync when you press Sync.' }, { status: 400 })
    const wh = await ensureStoreWebhooks(db, { ...integ, webhook_topics: [] })
    if (!wh.ok) return NextResponse.json({ error: wh.errors.join('; ') }, { status: 502 })
    await db.from('shopify_integrations').update({ last_error: null }).eq('id', integ.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: remove a store from this workspace — its synced customers, products
// and jobs go; orders already on the board stay (they're the business's
// records). To stop Shopify entirely the merchant uninstalls the Colvy app in
// Shopify; that also reaches us.
export async function DELETE(req: NextRequest) {
  try {
    const { companyId, integrationId } = await req.json().catch(() => ({}))
    if (!companyId || !integrationId) return NextResponse.json({ error: 'Missing store' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    await db.from('shopify_customers').delete().eq('integration_id', integrationId).eq('company_id', companyId)
    await db.from('shopify_sync_jobs').delete().eq('integration_id', integrationId).eq('company_id', companyId)
    await db.from('shopify_products').delete().eq('integration_id', integrationId).eq('company_id', companyId)
    const { error } = await db.from('shopify_integrations').delete().eq('id', integrationId).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
