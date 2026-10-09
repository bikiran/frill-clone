import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serviceFor } from '@/lib/shopify-sync'

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
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    // The same contact in Shopify (best-effort, alongside WooCommerce): name,
    // email and phone. Addresses stay as they are in Shopify.
    const shopify = await pushToShopify(db, companyId, email, field, value).catch((e: any) => ({ ok: false, error: e?.message }))

    // With multiple stores, pick the first active one (best-effort push-back).
    const { data: integs } = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    const integ = integs?.[0]
    if (!integ?.store_url || !integ.consumer_key || !integ.consumer_secret) {
      return NextResponse.json({ ok: true, skipped: 'woo not configured', shopify })
    }

    // Find the matching WooCommerce customer id
    const { data: wooCustRows } = await db.from('woocommerce_customers').select('woo_customer_id').eq('company_id', companyId).ilike('email', email).limit(1)
    const wooCust = wooCustRows?.[0]
    if (!wooCust?.woo_customer_id) return NextResponse.json({ ok: true, skipped: 'no matching woo customer', shopify })

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
      return NextResponse.json({ ok: true, skipped: 'field not mapped', shopify })
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
      return NextResponse.json({ ok: false, error: `WooCommerce update failed: ${res.status}`, detail: txt.slice(0, 120), shopify })
    }
    return NextResponse.json({ ok: true, shopify })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function pushToShopify(db: any, companyId: string, email: string, field: string, value: any) {
  if (!['name', 'email', 'phone'].includes(field)) return { ok: true, skipped: 'field not mapped' }
  const { data: rows } = await db.from('shopify_customers').select('shopify_customer_id, integration_id').eq('company_id', companyId).ilike('email', email).limit(1)
  const row = rows?.[0]
  if (!row?.shopify_customer_id) return { ok: true, skipped: 'no matching shopify customer' }
  let q = db.from('shopify_integrations').select('*').eq('company_id', companyId).eq('is_active', true)
  if (row.integration_id) q = q.eq('id', row.integration_id)
  const { data: integs } = await q.limit(1)
  const integ = integs?.[0]
  if (!integ || integ.needs_reauth) return { ok: true, skipped: 'store not connected' }
  const input: any = { id: `gid://shopify/Customer/${row.shopify_customer_id}` }
  if (field === 'name') { const parts = String(value || '').trim().split(/\s+/); input.firstName = parts[0] || ''; input.lastName = parts.slice(1).join(' ') }
  else if (field === 'email') input.email = String(value || '').trim() || null
  else input.phone = String(value || '').trim() || null
  const svc = await serviceFor(db, integ)
  const { data, errors } = await svc.gql<any>(
    `mutation Cust($input: CustomerInput!) { customerUpdate(input: $input) { customer { id } userErrors { field message } } }`,
    { input },
  )
  const errs = [...(errors || []), ...(data?.customerUpdate?.userErrors || [])].map((e: any) => e?.message).filter(Boolean)
  if (errs.length) return { ok: false, error: errs.join('; ') }
  if (field === 'name') await db.from('shopify_customers').update({ first_name: input.firstName, last_name: input.lastName }).eq('company_id', companyId).eq('shopify_customer_id', row.shopify_customer_id)
  else if (field === 'email') await db.from('shopify_customers').update({ email: input.email }).eq('company_id', companyId).eq('shopify_customer_id', row.shopify_customer_id)
  else await db.from('shopify_customers').update({ phone: input.phone }).eq('company_id', companyId).eq('shopify_customer_id', row.shopify_customer_id)
  return { ok: true }
}
