import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST — create a coupon in WooCommerce for a campaign.
 *
 * Creates a REAL, redeemable discount, so it's only reachable from an explicit
 * staff action in the campaign builder. Existing codes are returned rather than
 * duplicated, since WooCommerce rejects duplicate coupon codes anyway.
 *
 * Body: { companyId, code, discountType, amount, expiryDate?, minimumSpend?,
 *         usageLimit?, usageLimitPerUser?, productIds?, categoryIds?, description? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      companyId, integrationId, code, discountType = 'percent', amount,
      expiryDate, minimumSpend, usageLimit, usageLimitPerUser,
      productIds, categoryIds, description,
    } = body

    if (!companyId || !code || amount == null) {
      return NextResponse.json({ error: 'Missing companyId, code or amount' }, { status: 400 })
    }

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*')
        .eq('company_id', companyId).eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) {
      return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })
    }

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`
    const normalised = String(code).trim().toLowerCase()

    // Reuse an existing code rather than failing on WooCommerce's duplicate check.
    try {
      const existing = await fetch(
        `${integ.store_url}/wp-json/wc/v3/coupons?code=${encodeURIComponent(normalised)}`,
        { headers: { 'Authorization': auth, 'Content-Type': 'application/json' } }
      )
      const found = await existing.json().catch(() => [])
      if (Array.isArray(found) && found.length > 0) {
        return NextResponse.json({ ok: true, coupon: found[0], existing: true })
      }
    } catch { /* fall through and try creating */ }

    const payload: any = {
      code: normalised,
      discount_type: discountType,          // percent | fixed_cart | fixed_product
      amount: String(amount),
      description: description || 'Created from a Colvy campaign',
      individual_use: false,
    }
    if (expiryDate) payload.date_expires = expiryDate            // YYYY-MM-DD
    if (minimumSpend) payload.minimum_amount = String(minimumSpend)
    if (usageLimit) payload.usage_limit = Number(usageLimit)
    if (usageLimitPerUser) payload.usage_limit_per_user = Number(usageLimitPerUser)
    if (Array.isArray(productIds) && productIds.length) payload.product_ids = productIds
    if (Array.isArray(categoryIds) && categoryIds.length) payload.product_categories = categoryIds

    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/coupons`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || 'WooCommerce rejected the coupon' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, coupon: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
