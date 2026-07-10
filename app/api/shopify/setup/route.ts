import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyService } from '@/lib/shopify-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: connect a Shopify store using a custom-app Admin API token.
export async function POST(req: NextRequest) {
  try {
    const { companyId, storeDomain, accessToken } = await req.json()
    if (!companyId || !storeDomain || !accessToken) {
      return NextResponse.json({ error: 'Store domain and access token are required.' }, { status: 400 })
    }

    // Verify the credentials by fetching the shop.
    const svc = new ShopifyService({ storeDomain, accessToken })
    const info = await svc.getShopInfo()
    if (!info.ok) {
      return NextResponse.json({ error: `Couldn't connect: ${info.error || 'check your store domain and access token.'}` }, { status: 401 })
    }

    let normalizedDomain = storeDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!normalizedDomain.includes('.')) normalizedDomain = `${normalizedDomain}.myshopify.com`

    const db = admin()
    const { data, error } = await db.from('shopify_integrations').upsert({
      company_id: companyId,
      store_domain: normalizedDomain,
      store_name: info.name || normalizedDomain,
      access_token: accessToken,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,store_domain' }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Don't leak the token back
    const { access_token, ...safe } = data as any
    return NextResponse.json({ ok: true, store: safe })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: list a company's Shopify stores (without tokens).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('shopify_integrations')
      .select('id, company_id, store_domain, store_name, is_active, last_synced_at, last_full_sync_at, created_at')
      .eq('company_id', companyId).order('created_at', { ascending: true })
    return NextResponse.json({ stores: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: remove a store (by id).
export async function DELETE(req: NextRequest) {
  try {
    const { companyId, integrationId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    let q = db.from('shopify_integrations').delete()
    q = integrationId ? q.eq('id', integrationId).eq('company_id', companyId) : q.eq('company_id', companyId)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
