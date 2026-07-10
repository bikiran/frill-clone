import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// When a Colvy contact that matches a WooCommerce customer is edited, push the
// change back to WooCommerce so the two stay in sync.
export async function POST(req: NextRequest) {
  try {
    const { companyId, email, field, value } = await req.json()
    if (!companyId || !email || !field) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.is_active || !integ.store_url || !integ.consumer_key || !integ.consumer_secret) {
      return NextResponse.json({ ok: true, skipped: 'woo not configured' })
    }

    // Find the matching WooCommerce customer id
    const { data: wooCust } = await db.from('woocommerce_customers').select('woo_customer_id').eq('company_id', companyId).ilike('email', email).maybeSingle()
    if (!wooCust?.woo_customer_id) return NextResponse.json({ ok: true, skipped: 'no matching woo customer' })

    // Map Colvy fields → WooCommerce fields
    const body: any = {}
    if (field === 'name') {
      const parts = (value || '').split(' ')
      body.first_name = parts[0] || ''
      body.last_name = parts.slice(1).join(' ') || ''
    } else if (field === 'email') {
      body.email = value
    } else if (field === 'phone') {
      body.billing = { phone: value }
    } else if (field === 'address' || field === 'city' || field === 'country') {
      body.billing = { [field === 'address' ? 'address_1' : field]: value }
    } else {
      return NextResponse.json({ ok: true, skipped: 'field not mapped' })
    }

    const auth = Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')
    const url = `${integ.store_url.replace(/\/$/, '')}/wp-json/wc/v3/customers/${wooCust.woo_customer_id}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ ok: false, error: `WooCommerce update failed: ${res.status}`, detail: txt.slice(0, 120) })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
