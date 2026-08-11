import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PrextyService } from '@/lib/prexty-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const DEFAULT_BASE = 'https://prexty.com'

/**
 * POST /api/prexty/setup
 * Body: { companyId, apiKey?, baseUrl?, isUpdate? }
 * Tests the key against Prexty's /api/v1/customers, then upserts the (single)
 * per-company connection. On an update with no new key, the stored key is reused.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, apiKey, baseUrl, isUpdate } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const normalizedBase = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '')

    // Resolve the key to test with: a freshly-entered one, or the stored one on
    // an update that only changes the base URL.
    let keyToUse = apiKey
    if (!keyToUse) {
      if (!isUpdate) return NextResponse.json({ error: 'API key is required' }, { status: 400 })
      const { data: existing } = await db.from('prexty_integrations')
        .select('api_key').eq('company_id', companyId).maybeSingle()
      if (!existing?.api_key) return NextResponse.json({ error: 'Prexty is not connected yet. Enter your API key.' }, { status: 400 })
      keyToUse = existing.api_key
    }

    // Verify the credentials before saving.
    const svc = new PrextyService({ baseUrl: normalizedBase, apiKey: keyToUse })
    const test = await svc.testConnection()
    if (!test.ok) {
      return NextResponse.json({ error: `Could not connect to Prexty: ${test.error}. Check the API key and base URL.` }, { status: 401 })
    }

    let storeName: string | null = null
    try { storeName = new URL(normalizedBase).hostname.replace(/^www\./, '') } catch {}

    const { data, error } = await db.from('prexty_integrations')
      .upsert({
        company_id: companyId,
        base_url: normalizedBase,
        api_key: keyToUse,
        store_name: storeName,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' })
      .select('id, company_id, base_url, store_name, is_active, last_synced_at, created_at, updated_at')
      .single()

    if (error) {
      console.error('[Prexty setup] save failed:', error)
      return NextResponse.json({ error: 'Failed to save the Prexty connection' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('[Prexty setup] error:', e)
    return NextResponse.json({ error: e?.message || 'Setup failed' }, { status: 500 })
  }
}

/**
 * GET /api/prexty/setup?companyId=
 * Returns the connection status WITHOUT the api_key.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('prexty_integrations')
      .select('id, company_id, base_url, store_name, is_active, last_synced_at, created_at, updated_at')
      .eq('company_id', companyId).maybeSingle()
    return NextResponse.json({ data: data || null })
  } catch (e: any) {
    return NextResponse.json({ data: null })
  }
}

/**
 * DELETE /api/prexty/setup?companyId=  (disconnect)
 */
export async function DELETE(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || (await req.json().catch(() => ({})))?.companyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { error } = await db.from('prexty_integrations').delete().eq('company_id', companyId)
    if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Disconnect failed' }, { status: 500 })
  }
}
