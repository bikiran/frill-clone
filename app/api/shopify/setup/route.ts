import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyService } from '@/lib/shopify-service'
import { getAccessToken, normalizeShop, shopifyAppConfigured, STORE_WEBHOOK_TOPICS, webhookUri } from '@/lib/shopify-auth'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SAFE_COLS = 'id, company_id, store_domain, store_name, is_active, auth_type, needs_reauth, last_error, scopes, webhooks_registered_at, uninstalled_at, last_synced_at, last_full_sync_at, created_at'

// POST: connect with a pasted Admin API token. Only for custom apps a store
// created in its Shopify admin before 1 Jan 2026 — new stores use Install.
export async function POST(req: NextRequest) {
  try {
    const { companyId, storeDomain, accessToken } = await req.json().catch(() => ({}))
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const shop = normalizeShop(storeDomain)
    if (!shop || !accessToken) return NextResponse.json({ error: 'Your myshopify.com address and the Admin API access token are both needed.' }, { status: 400 })

    const svc = new ShopifyService({ storeDomain: shop, accessToken: String(accessToken).trim() })
    const info = await svc.getShopInfo()
    if (!info.ok) return NextResponse.json({ error: `Couldn't connect: ${info.error || 'check the store address and token.'}` }, { status: 401 })

    const { data, error } = await db.from('shopify_integrations').upsert({
      company_id: companyId,
      store_domain: shop,
      store_name: info.name || shop,
      access_token: String(accessToken).trim(),
      auth_type: 'token',
      refresh_token: null, token_expires_at: null, refresh_expires_at: null,
      is_active: true, needs_reauth: false, last_error: null, uninstalled_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,store_domain' }).select(SAFE_COLS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, store: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

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
      const [{ count: customers }, { count: linked }, { data: job }] = await Promise.all([
        db.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('integration_id', s.id),
        db.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('integration_id', s.id).not('contact_id', 'is', null),
        db.from('shopify_sync_jobs').select('id, status, customers_synced, message, error, updated_at').eq('integration_id', s.id).order('started_at', { ascending: false }).limit(1),
      ])
      return { ...s, customers: customers || 0, linked: linked || 0, lastJob: job?.[0] || null }
    }))
    return NextResponse.json({ stores, appConfigured: shopifyAppConfigured() })
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
    const token = await getAccessToken(db, integ)
    const svc = new ShopifyService({ storeDomain: integ.store_domain, accessToken: token, onUnauthorized: () => getAccessToken(db, integ, { force: true }) })
    const wh = await svc.ensureWebhooks(webhookUri(), STORE_WEBHOOK_TOPICS)
    if (wh.errors.length) {
      await db.from('shopify_integrations').update({ last_error: `Some Shopify updates couldn’t be subscribed: ${wh.errors.join('; ')}`.slice(0, 500) }).eq('id', integ.id)
      return NextResponse.json({ error: wh.errors.join('; ') }, { status: 502 })
    }
    await db.from('shopify_integrations').update({ webhooks_registered_at: new Date().toISOString(), last_error: null }).eq('id', integ.id)
    return NextResponse.json({ ok: true, ...wh })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: remove a store from this workspace. (To stop Shopify entirely the
// merchant uninstalls the Colvy app in Shopify; that also reaches us.)
export async function DELETE(req: NextRequest) {
  try {
    const { companyId, integrationId } = await req.json().catch(() => ({}))
    if (!companyId || !integrationId) return NextResponse.json({ error: 'Missing store' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    await db.from('shopify_customers').delete().eq('integration_id', integrationId).eq('company_id', companyId)
    await db.from('shopify_sync_jobs').delete().eq('integration_id', integrationId).eq('company_id', companyId)
    const { error } = await db.from('shopify_integrations').delete().eq('id', integrationId).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
