import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { WooCommerceService } from '@/lib/woocommerce-service'
import { STOCK_PROVIDERS, shopifyScopesMissing, suggestMapping, SHOPIFY_STOCK_SCOPES, type ExternalLocation, type StockProvider } from '@/lib/outlet-stock'
import { MAPPING_TABLE, isMissingTable, loadMappings, loadOutlets, shopifyLocationList, shopifyServiceFor, wooStockLocations } from '@/lib/outlet-stock-server'

export const dynamic = 'force-dynamic'

// Stock by store: which of a store's stock locations (Shopify locations, or
// WooCommerce stock locations from the "Stock Locations for WooCommerce"
// plugin) count as which Colvy outlet. Saving the mapping turns per-store
// stock answers on for that store (lib/outlet-stock); removing it turns them
// off. Shown on the Shopify and WooCommerce integration pages.
//
// GET  ?companyId&provider&integrationId[&summary=1]   staff of the business
//        summary=1 reads only Colvy's own table (no call to the store).
// PUT  { companyId, provider, integrationId, locations: [{ id, name, outletId, hidden }] }
//        owner or admin; replaces the store's mapping.
// DELETE { companyId, provider, integrationId }         owner or admin; turns it off.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
type Db = ReturnType<typeof admin>

const MIGRATION_NOTE = 'Stock by store needs a database update (COLVY_V401_OUTLET_STOCK.sql). Until it runs, stock is answered for each product overall.'

async function integrationFor(db: Db, companyId: string, provider: StockProvider, integrationId: string) {
  const table = provider === 'shopify' ? 'shopify_integrations' : 'woocommerce_integrations'
  const { data } = await db.from(table).select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
  return data && data.is_active !== false ? data : null
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function parseTarget(v: any): { provider: StockProvider; integrationId: string } | null {
  const provider = String(v?.provider || '') as StockProvider
  const integrationId = String(v?.integrationId || '')
  if (!STOCK_PROVIDERS.includes(provider) || !/^[0-9a-f-]{36}$/i.test(integrationId)) return null
  return { provider, integrationId }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const target = parseTarget({ provider: sp.get('provider'), integrationId: sp.get('integrationId') })
  if (!companyId || !target) return bad('companyId, provider and integrationId required')
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return bad('Not authorized', 403)
  const integ = await integrationFor(db, companyId, target.provider, target.integrationId)
  if (!integ) return bad('Store not connected', 404)

  const saved = await loadMappings(db, companyId, target.provider, target.integrationId)
  const enabled = saved.rows.length > 0
  const mapped = saved.rows.filter(r => r.outlet_id && !r.hidden).length
  if (sp.get('summary') === '1') {
    return NextResponse.json({ enabled, mapped, locations: saved.rows.length, migrationNeeded: saved.missingTable })
  }

  const [outlets, canEditRes] = await Promise.all([loadOutlets(db, companyId), requireCompanyAdmin(req, db, companyId)])
  const base = {
    enabled, migrationNeeded: saved.missingTable, migrationNote: saved.missingTable ? MIGRATION_NOTE : null,
    canEdit: canEditRes.ok, authType: integ.auth_type || null,
    outlets: outlets.map(o => ({ id: o.id, label: o.label || null, suburb: o.suburb || null })),
  }

  let locations: ExternalLocation[] = []
  let status: 'ok' | 'needs_scopes' | 'no_plugin' | 'single' | 'error' = 'ok'
  let message: string | null = null
  try {
    if (target.provider === 'shopify') {
      const missing = shopifyScopesMissing(integ)
      if (missing.length) { status = 'needs_scopes'; message = `Colvy needs Shopify’s permission to read ${missing.includes('read_locations') ? 'your locations' : 'your inventory'}.` }
      else {
        const r = await shopifyLocationList(await shopifyServiceFor(db, integ))
        if (r.denied) { status = 'needs_scopes'; message = 'Shopify didn’t let Colvy read your locations and inventory.' }
        locations = r.locations
      }
    } else {
      const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret, companyId })
      const r = await wooStockLocations(woo)
      if (!r.detected) status = 'no_plugin'
      locations = r.locations
    }
  } catch (e: any) {
    status = 'error'; message = e?.message || 'Couldn’t reach the store.'
  }
  if (status === 'ok' && locations.length < 2) status = 'single'

  const suggested = suggestMapping(locations, outlets)
  const byId = new Map(saved.rows.map(r => [String(r.external_location_id), r]))
  return NextResponse.json({
    ...base, status, message, scopes: target.provider === 'shopify' ? SHOPIFY_STOCK_SCOPES : undefined,
    locations: locations.map(l => {
      const r = byId.get(l.id)
      return {
        id: l.id, name: l.name, address: [l.address1, l.city].filter(Boolean).join(', ') || null,
        saved: !!r, outletId: r ? r.outlet_id : null, hidden: !!r?.hidden,
        suggestedOutletId: suggested[l.id] || null,
      }
    }),
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const target = parseTarget(body)
  if (!companyId || !target) return bad('companyId, provider and integrationId required')
  const db = admin()
  const auth = await requireCompanyAdmin(req, db, companyId)
  if (!auth.ok) return bad(auth.notAdmin ? 'Only the owner or an admin can change stock by store.' : 'Not authorized', 403)
  const integ = await integrationFor(db, companyId, target.provider, target.integrationId)
  if (!integ) return bad('Store not connected', 404)

  const list: any[] = Array.isArray(body?.locations) ? body.locations : []
  if (!list.length || list.length > 100) return bad('Send the store’s locations (1 to 100).')
  const outlets = new Set((await loadOutlets(db, companyId)).map(o => o.id))
  const seen = new Set<string>()
  const rows = []
  for (const l of list) {
    const id = String(l?.id ?? '').trim()
    const name = String(l?.name ?? '').trim().slice(0, 200)
    if (!id || id.length > 200 || seen.has(id)) return bad('Each location needs its own id.')
    seen.add(id)
    const outletId = l?.outletId ? String(l.outletId) : null
    if (outletId && !outlets.has(outletId)) return bad('That outlet isn’t one of this business’s outlets.')
    rows.push({
      company_id: companyId, provider: target.provider, integration_id: target.integrationId,
      external_location_id: id, location_name: name || null, outlet_id: l?.hidden ? null : outletId, hidden: !!l?.hidden,
      updated_by: auth.userId || null, updated_at: new Date().toISOString(),
    })
  }

  const { error } = await db.from(MAPPING_TABLE).upsert(rows, { onConflict: 'company_id,provider,integration_id,external_location_id' })
  if (error) return isMissingTable(error) ? bad(MIGRATION_NOTE, 409) : bad(error.message, 500)
  // Locations no longer sent (gone from the store) are forgotten.
  const { data: existing } = await db.from(MAPPING_TABLE).select('id, external_location_id')
    .eq('company_id', companyId).eq('provider', target.provider).eq('integration_id', target.integrationId)
  const stale = (existing || []).filter((r: any) => !seen.has(String(r.external_location_id))).map((r: any) => r.id)
  if (stale.length) await db.from(MAPPING_TABLE).delete().in('id', stale)
  return NextResponse.json({ ok: true, enabled: true, saved: rows.length })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const target = parseTarget(body)
  if (!companyId || !target) return bad('companyId, provider and integrationId required')
  const db = admin()
  const auth = await requireCompanyAdmin(req, db, companyId)
  if (!auth.ok) return bad(auth.notAdmin ? 'Only the owner or an admin can change stock by store.' : 'Not authorized', 403)
  const { error } = await db.from(MAPPING_TABLE).delete()
    .eq('company_id', companyId).eq('provider', target.provider).eq('integration_id', target.integrationId)
  if (error && !isMissingTable(error)) return bad(error.message, 500)
  return NextResponse.json({ ok: true, enabled: false })
}
