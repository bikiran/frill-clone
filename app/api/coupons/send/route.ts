import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function genCode(prefix = 'SAVE') {
  return prefix + Math.random().toString(36).slice(2, 7).toUpperCase()
}

// POST: create a WooCommerce coupon and post it into the conversation as a
// big copyable coupon card.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, conversationId, contactId, email, amount, discountType, code, oneTime, expiryDays, createdByName } = await req.json()
    if (!companyId || !conversationId || !amount) return NextResponse.json({ error: 'Missing companyId, conversationId or amount' }, { status: 400 })

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    const finalCode = (code && code.trim()) || genCode()
    const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })

    // Build the coupon. Support fixed_cart and percent.
    const dt = discountType === 'percent' ? 'percent' : 'fixed_cart'
    const body: any = {
      code: finalCode,
      discount_type: dt,
      amount: String(amount),
      individual_use: true,
      description: 'Coupon sent via Colvy chat',
    }
    if (oneTime) { body.usage_limit = 1; body.usage_limit_per_user = 1 }
    if (email) body.email_restrictions = [email]
    if (expiryDays && Number(expiryDays) > 0) {
      const d = new Date(); d.setDate(d.getDate() + Number(expiryDays))
      body.date_expires = d.toISOString().slice(0, 10)
    }

    // Create via the WooCommerce coupons endpoint directly (createCoupon on the
    // service is DOA-specific; this supports percent + expiry).
    let coupon: any = null
    try {
      const res = await fetch(`${integ.store_url}/wp-json/wc/v3/coupons`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data?.message || `Coupon creation failed (${res.status})` }, { status: 502 })
      coupon = data
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

    // Human-readable amount for the card
    const displayAmount = dt === 'percent' ? `${amount}% off` : `$${parseFloat(String(amount)).toFixed(2)} off`

    // Post the coupon card into the chat.
    const content = `🎟️ You have received a coupon: ${finalCode} (${displayAmount})`
    await db.from('messages').insert({
      conversation_id: conversationId, company_id: companyId,
      sender_type: 'agent', sender_name: createdByName || 'Support',
      content,
      message_type: 'coupon',
      message_payload: {
        kind: 'coupon', code: finalCode, amount: String(amount), discount_type: dt,
        display_amount: displayAmount, expires: body.date_expires || null, one_time: !!oneTime,
      },
    })
    await db.from('conversations').update({ last_message: `🎟️ Coupon ${finalCode} sent`, last_message_at: new Date().toISOString() }).eq('id', conversationId)

    return NextResponse.json({ ok: true, code: finalCode, coupon: { id: coupon.id, amount, discount_type: dt } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
