import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: list connected e-commerce stores the staff can create an order in.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const sources: any[] = []
    const { data: woo } = await db.from('woocommerce_integrations')
      .select('id, store_url, store_name').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    for (const w of (woo || [])) {
      let label = w.store_name
      if (!label) { try { label = new URL(w.store_url).hostname.replace(/^www\./, '') } catch { label = w.store_url } }
      sources.push({ platform: 'woocommerce', id: w.id, label })
    }

    // Shopify order creation is not yet supported for writes here — list for
    // visibility but mark unsupported so the UI can explain.
    const { data: shop } = await db.from('shopify_integrations')
      .select('id, store_domain, store_name').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    for (const s of (shop || [])) {
      sources.push({ platform: 'shopify', id: s.id, label: s.store_name || s.store_domain, unsupported: true })
    }

    return NextResponse.json({ sources })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
